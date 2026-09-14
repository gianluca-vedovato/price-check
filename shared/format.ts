export function formatPrice(value: number | undefined, currency = 'EUR'): string {
  if (value === undefined) return '—'
  try {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

/**
 * A readable name from a product URL slug, used until the real title is known:
 * `/it/it/camicia-boxy-fit-a-righe-p01030731.html` → "Camicia boxy fit a righe".
 */
export function titleFromUrl(url: string): string | undefined {
  let path: string
  try {
    path = decodeURIComponent(new URL(url).pathname)
  } catch {
    return undefined
  }
  const slug = path
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/\.[a-z]{2,5}$/i, ''))
    // Skip locale segments like it, it-it, en_gb.
    .filter((segment) => !/^[a-z]{2}([-_][a-z]{2})?$/i.test(segment))
    .sort((a, b) => b.split(/[-_]/).length - a.split(/[-_]/).length)[0]
  if (!slug) return undefined
  const words = slug
    .split(/[-_\s.]+/)
    // Drop product codes like p01030731, 1352054002, 211300449.
    .filter((w) => w && !/\d{4,}/.test(w) && !/^[a-z]?\d+$/i.test(w))
  // A leading single letter is usually a code prefix (`p-1018016006001-…`).
  if (words[0]?.length === 1 && words.length > 2) words.shift()
  if (words.length < 2 || /^(product|productpage|item|dp|prd)$/i.test(words.join(''))) return undefined
  const text = words.join(' ').toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
