import type { CheerioAPI } from 'cheerio'
import { detectCurrency, parsePrice } from './parsePrice'
import { nameMatch, NOT_CURRENT, OTHER_PRODUCTS, type VisiblePrices } from './text'

/**
 * Most modern shops ship the product state as JSON inside <script> tags
 * (Next.js, Nuxt, Redux state, `window.x = {...}`). This finds price values in
 * those blobs without knowing the site, and describes where they came from so
 * later checks can read the exact same spot.
 */

type Blob = unknown
type Candidate = { value: number; divisor: number; path: string; score: number; visibleHit: boolean; currency?: string }

const MAX_SCRIPT = 5_000_000
const MAX_NODES = 300_000

export function jsonBlobs($: CheerioAPI): Blob[] {
  const blobs: Blob[] = []
  const nextChunks: string[] = []

  $('script').each((_, el) => {
    const $el = $(el)
    const type = ($el.attr('type') ?? '').toLowerCase()
    if (type === 'application/ld+json') return
    const text = $el.text()
    if (!text || text.length > MAX_SCRIPT) return

    if (type.includes('json')) {
      const parsed = tryParse(text.trim())
      if (parsed !== undefined) return void blobs.push(parsed)
    }

    // Next.js app router streams its data as escaped string chunks.
    for (const m of text.matchAll(/self\.__next_f\.push\(\[\d+,\s*("(?:[^"\\]|\\.)*")\]\)/g)) {
      const chunk = tryParse(m[1])
      if (typeof chunk === 'string') nextChunks.push(chunk)
    }
    // `JSON.parse("...")` hydration.
    for (const m of text.matchAll(/JSON\.parse\(\s*("(?:[^"\\]|\\.)*")\s*\)/g)) {
      const inner = tryParse(m[1])
      if (typeof inner === 'string') blobs.push(...objectsIn(inner))
    }
    blobs.push(...objectsIn(text))
  })

  if (nextChunks.length) blobs.push(...objectsIn(nextChunks.join('')))
  return blobs
}

/** Pulls every top-level `{"...": ...}` object literal out of a piece of JS. */
function objectsIn(text: string): Blob[] {
  const found: Blob[] = []
  let i = text.indexOf('{"')
  while (i !== -1 && found.length < 200) {
    const end = matchingBrace(text, i)
    if (end === -1) break
    const parsed = end - i > 12 ? tryParse(text.slice(i, end + 1)) : undefined
    if (parsed !== undefined) {
      found.push(parsed)
      i = text.indexOf('{"', end + 1)
    } else {
      i = text.indexOf('{"', i + 1)
    }
  }
  return found
}

function matchingBrace(text: string, start: number): number {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const NAME_KEYS = ['name', 'title', 'productName', 'displayName', 'product_name']

/** Walks all blobs and returns the most likely current price of the page's main product. */
export function findPriceInJson(blobs: Blob[], pageTitle: string, pageUrl: string, visible: VisiblePrices): Candidate | undefined {
  const candidates: Candidate[] = []
  let nodes = 0

  blobs.forEach((blob, blobIndex) => {
    const walk = (node: unknown, path: string[], ancestors: Record<string, unknown>[]) => {
      if (++nodes > MAX_NODES || node === null) return
      if (Array.isArray(node)) return node.slice(0, 200).forEach((n, i) => walk(n, [...path, `[${i}]`], ancestors))
      if (typeof node === 'object') {
        const obj = node as Record<string, unknown>
        const chain = [obj, ...ancestors].slice(0, 5)
        for (const [key, value] of Object.entries(obj)) walk(value, [...path, key], chain)
        return
      }
      const candidate = scoreLeaf(node, path, ancestors, pageTitle, pageUrl, visible)
      if (candidate) candidates.push({ ...candidate, path: `${blobIndex}:${path.join('.')}` })
    }
    walk(blob, [], [])
  })

  if (candidates.length === 0) return undefined
  // When the page renders its prices server-side, a value that isn't shown anywhere is suspicious.
  if (candidates.some((c) => c.visibleHit)) {
    for (const c of candidates) if (!c.visibleHit) c.score -= 2
  }
  // The main product's price tends to be repeated (variants, analytics, state).
  const counts = new Map<number, number>()
  for (const c of candidates) counts.set(c.value, (counts.get(c.value) ?? 0) + 1)
  for (const c of candidates) c.score += Math.min(counts.get(c.value) ?? 1, 4) * 0.5

  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a))
  return best.score >= 5 ? best : undefined
}

function scoreLeaf(
  leaf: unknown,
  path: string[],
  ancestors: Record<string, unknown>[],
  pageTitle: string,
  pageUrl: string,
  visible: VisiblePrices,
): Omit<Candidate, 'path'> | undefined {
  if (typeof leaf !== 'number' && typeof leaf !== 'string') return undefined
  const keys = path.filter((p) => !p.startsWith('['))
  const near = keys.slice(-3).join('.')
  if (!/price|amount/i.test(near)) return undefined
  const last = keys[keys.length - 1] ?? ''
  if (!isPriceValueKey(last)) return undefined

  const raw = typeof leaf === 'number' ? leaf : parsePrice(leaf)
  if (!raw || raw <= 0 || raw > 10_000_000) return undefined

  let score = 0
  let value = raw
  let divisor = declaredDivisor(last, ancestors)
  let visibleHit = true
  if (divisor === 1 && visible.has(round(raw))) score += 4
  else if (Number.isInteger(raw) && visible.has(round(raw / 100))) {
    divisor = 100
    score += 3.5
  } else if (divisor > 1 && visible.has(round(raw / divisor))) {
    score += 4
  } else {
    visibleHit = false
  }
  value = round(raw / divisor)

  if (NOT_CURRENT.test(near)) score -= 4
  if (/current|sale|final|now|selling|discount|offer|special|value/i.test(near)) score += 1
  if (OTHER_PRODUCTS.test(keys.join('.'))) score -= 4

  for (const obj of ancestors) {
    const name = NAME_KEYS.map((k) => obj[k]).find((v): v is string => typeof v === 'string')
    if (name) {
      const match = nameMatch(name, pageTitle)
      score += match >= 0.6 ? 3 : match >= 0.3 ? 1 : -1
      break
    }
  }
  if (ancestors.some((obj) => Object.keys(obj).some((k) => /currency/i.test(k)))) score += 1
  if (idInUrl(ancestors, pageUrl)) score += 3

  return { value, divisor, score, visibleHit, currency: currencyNear(leaf, ancestors) }
}

function currencyNear(leaf: unknown, ancestors: Record<string, unknown>[]): string | undefined {
  if (typeof leaf === 'string' && detectCurrency(leaf)) return detectCurrency(leaf)
  for (const obj of ancestors.slice(0, 3)) {
    for (const [k, v] of Object.entries(obj)) {
      if (/currency/i.test(k)) {
        const code = typeof v === 'string' ? v : (v as Record<string, unknown> | null)?.code
        if (typeof code === 'string' && /^[A-Z]{3}$/.test(code)) return code
      }
      if (typeof v === 'string' && v.length < 20 && /\d/.test(v) && detectCurrency(v)) return detectCurrency(v)
    }
  }
  return undefined
}

/** Integer prices in minor units: `amountCents`, commercetools `centAmount` + `fractionDigits`, `{ exponent: -2 }`. */
function declaredDivisor(key: string, ancestors: Record<string, unknown>[]): number {
  for (const obj of ancestors.slice(0, 3)) {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'number' && /^(fractionDigits|decimalPlaces|decimals|exponent)$/i.test(k) && Math.abs(v) <= 4) {
        return 10 ** Math.abs(v)
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const exp = (v as Record<string, unknown>).exponent ?? (v as Record<string, unknown>).fractionDigits
        if (typeof exp === 'number' && Math.abs(exp) <= 4) return 10 ** Math.abs(exp)
      }
    }
  }
  return /cents?$|Cents?[A-Z]|minor|centAmount/i.test(key) ? 100 : 1
}

/** The object (or a parent) carries an id/sku that appears in the page URL, e.g. `/prd/211300449`. */
function idInUrl(ancestors: Record<string, unknown>[], pageUrl: string): boolean {
  const url = pageUrl.toLowerCase()
  return ancestors.some((obj) =>
    Object.entries(obj).some(
      ([k, v]) =>
        /(^|[a-z_])(id|sku|code|reference|ref|pid|articleNumber)$/i.test(k) &&
        (typeof v === 'string' || typeof v === 'number') &&
        String(v).length >= 5 &&
        url.includes(String(v).toLowerCase()),
    ),
  )
}

/** Reads a price back from a path produced by `findPriceInJson`. */
export function readJsonPath(blobs: Blob[], locator: string, divisor: number): number | undefined {
  const [index, ...rest] = locator.split(':')
  const segments = rest.join(':').split('.').filter(Boolean)
  const read = (blob: Blob) => {
    let node: unknown = blob
    for (const seg of segments) {
      if (node === null || typeof node !== 'object') return undefined
      const arr = seg.match(/^\[(\d+)\]$/)
      node = arr ? (node as unknown[])[Number(arr[1])] : (node as Record<string, unknown>)[seg]
    }
    const n = typeof node === 'number' ? node : parsePrice(node)
    return n ? round(n / divisor) : undefined
  }
  // Blob order can shift when the page changes, so fall back to any blob with that path.
  return read(blobs[Number(index)]) ?? blobs.map(read).find((v) => v !== undefined)
}

/** Finds a JSON path holding exactly the price the user typed. */
export function learnJsonPath(blobs: Blob[], price: number): { path: string; divisor: number } | undefined {
  let found: { path: string; divisor: number } | undefined
  blobs.forEach((blob, blobIndex) => {
    const walk = (node: unknown, path: string[]) => {
      if (found || node === null) return
      if (Array.isArray(node)) return node.slice(0, 200).forEach((n, i) => walk(n, [...path, `[${i}]`]))
      if (typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, [...path, k])
        return
      }
      const keys = path.filter((p) => !p.startsWith('['))
      const near = keys.slice(-3).join('.')
      if (!/price|amount/i.test(near) || NOT_CURRENT.test(near) || !isPriceValueKey(keys[keys.length - 1] ?? '')) return
      const n = typeof node === 'number' ? node : parsePrice(node)
      if (!n) return
      if (round(n) === price) found = { path: `${blobIndex}:${path.join('.')}`, divisor: 1 }
      else if (round(n / 100) === price && Number.isInteger(n)) found = { path: `${blobIndex}:${path.join('.')}`, divisor: 100 }
    }
    walk(blob, [])
  })
  return found
}

/** Rejects keys that hold ids, counts or labels next to a price (case-aware, so "discount" isn't a "count"). */
function isPriceValueKey(key: string): boolean {
  if (/^(id|sku|code|count|qty|quantity|type|label|symbol|currency|locale)$/i.test(key)) return false
  if (/(Id|ID|Code|Count|Qty|Quantity|Type|Label|Symbol|Currency)$|_(id|code|count|type)$/.test(key)) return false
  return true
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
