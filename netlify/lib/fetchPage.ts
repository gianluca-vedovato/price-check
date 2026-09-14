const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
  'cache-control': 'no-cache',
  'upgrade-insecure-requests': '1',
}

export const BLOCKED_MESSAGE = 'Questo negozio blocca i controlli automatici dei prezzi'

export class FetchError extends Error {
  /** Worth another attempt (server errors); blocks and missing pages won't change on a retry. */
  retryable: boolean
  constructor(message: string, retryable = false) {
    super(message)
    this.retryable = retryable
  }
}

export function shopErrorMessage(status: number): string {
  return `Il negozio ha risposto con un errore (${status})`
}

export async function fetchPage(url: string, timeoutMs = 8000): Promise<{ html: string; finalUrl: string }> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
      if (!isPublicHost(new URL(res.url || url).hostname)) throw new FetchError('Questo non sembra un link')
      if (res.status === 403 || res.status === 429) throw new FetchError(BLOCKED_MESSAGE)
      if (res.status === 404 || res.status === 410) throw new FetchError('Questa pagina prodotto non esiste più')
      if (!res.ok) throw new FetchError(shopErrorMessage(res.status), res.status >= 500)
      const html = await res.text()
      if (looksBlocked(html)) throw new FetchError(BLOCKED_MESSAGE)
      return { html, finalUrl: res.url || url }
    } catch (e) {
      lastError = e
      if (e instanceof FetchError && !e.retryable) break
    }
  }
  if (lastError instanceof FetchError) throw lastError
  if (lastError instanceof Error && lastError.name === 'TimeoutError') throw new FetchError('Il negozio ci ha messo troppo a rispondere')
  throw new FetchError('Non riesco a raggiungere il negozio')
}

/** Markers only bot walls emit, trusted at any page size (some serve 100 KB+ challenge pages). */
const BOT_WALL = /isBotPage\s*=\s*true|bm-verify=|\/_sec\/verify|px-captcha|cf-chl-|_Incapsula_Resource|captcha-delivery\.com|geo\.captcha/i
/** Generic words that are only meaningful on small pages. */
const SMALL_PAGE_HINTS = /captcha|robot check|are you a human|access denied/i

export function looksBlocked(html: string): boolean {
  return BOT_WALL.test(html) || (html.length < 30000 && SMALL_PAGE_HINTS.test(html))
}

/**
 * The API has no login, so never let it be used to reach local or private network addresses.
 * (Names that resolve to private IPs aren't caught, but serverless functions have nothing there to reach.)
 */
export function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|localdomain)$/.test(host)) return false
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number)
    return !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127))
  }
  return !host.includes(':') // no IPv6 literals
}

export function normalizeUrl(input: string): string | undefined {
  try {
    const url = new URL(input.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    if (!isPublicHost(url.hostname) || url.username || url.password) return undefined
    // Drop tracking noise so the same product isn't added twice.
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|ref_|tag$|psc$|smid$|spm|srsltid)/.test(key)) url.searchParams.delete(key)
    }
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}
