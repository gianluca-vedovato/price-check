const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
  'cache-control': 'no-cache',
  'upgrade-insecure-requests': '1',
}

export const BLOCKED_MESSAGE = 'This shop blocks automatic price checks'

export class FetchError extends Error {}

export async function fetchPage(url: string, timeoutMs = 8000): Promise<{ html: string; finalUrl: string }> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
      if (res.status === 403 || res.status === 429) throw new FetchError(BLOCKED_MESSAGE)
      if (res.status === 404 || res.status === 410) throw new FetchError('This product page doesn’t exist anymore')
      if (!res.ok) throw new FetchError(`The shop answered with an error (${res.status})`)
      const html = await res.text()
      if (looksBlocked(html)) throw new FetchError(BLOCKED_MESSAGE)
      return { html, finalUrl: res.url || url }
    } catch (e) {
      lastError = e
      // Being blocked or a missing page won't change on a retry.
      if (e instanceof FetchError && !e.message.includes('error (5')) break
    }
  }
  if (lastError instanceof FetchError) throw lastError
  if (lastError instanceof Error && lastError.name === 'TimeoutError') throw new FetchError('The shop took too long to answer')
  throw new FetchError('Could not reach the shop')
}

/** Markers only bot walls emit, trusted at any page size (some serve 100 KB+ challenge pages). */
const BOT_WALL = /isBotPage\s*=\s*true|bm-verify=|\/_sec\/verify|px-captcha|cf-chl-|_Incapsula_Resource|captcha-delivery\.com|geo\.captcha/i
/** Generic words that are only meaningful on small pages. */
const SMALL_PAGE_HINTS = /captcha|robot check|are you a human|access denied/i

export function looksBlocked(html: string): boolean {
  return BOT_WALL.test(html) || (html.length < 30000 && SMALL_PAGE_HINTS.test(html))
}

export function normalizeUrl(input: string): string | undefined {
  try {
    const url = new URL(input.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
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
