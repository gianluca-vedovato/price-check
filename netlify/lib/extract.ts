import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import type { Element } from 'domhandler'
import { cssPath, findPriceInDom } from './domPrice'
import { findPriceInJson, jsonBlobs, learnJsonPath, readJsonPath } from './embeddedJson'
import { detectCurrency, parsePrice } from './parsePrice'
import { nameMatch, visiblePrices, type VisiblePrices } from './text'

export type Source = 'locator' | 'jsonld' | 'meta' | 'microdata' | 'json' | 'dom'

export type Extracted = {
  title?: string
  image?: string
  price?: number
  currency?: string
  source?: Source
  /**
   * Where a heuristically found price lives, so later checks read the same spot:
   * `css:<selector>` or `json/<divisor>:<blob>:<path>`.
   */
  locator?: string
}

type Json = Record<string, unknown>

/**
 * Generic product extraction, strongest signal first:
 * saved locator → JSON-LD → price meta tags → microdata → embedded JSON state → visible HTML.
 */
export function extract(html: string, pageUrl: string, locator?: string): Extracted {
  const $ = cheerio.load(html)
  const jsonld = findJsonLdProduct($)
  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim()

  const title = clean(meta($, 'og:title') ?? str(jsonld?.name) ?? (h1.length > 0 && h1.length < 200 ? h1 : undefined) ?? $('title').first().text())
  const result: Extracted = {
    title,
    image: absolute(
      meta($, 'og:image') ??
        meta($, 'og:image:secure_url') ??
        meta($, 'twitter:image') ??
        firstImage(jsonld?.image) ??
        $('link[rel=image_src]').attr('href') ??
        imageMatchingTitle($, title ?? h1),
      pageUrl,
    ),
  }

  // The price context for heuristics: page title plus h1, whichever names the product.
  const reference = [title, h1, $('title').first().text()].filter(Boolean).join(' ')
  let blobs: unknown[] | undefined
  const getBlobs = () => (blobs ??= jsonBlobs($))
  let visible: VisiblePrices | undefined
  const getVisible = () => (visible ??= visiblePrices($))

  const found =
    (locator && fromLocator($, locator, getBlobs)) ||
    fromJsonLd(jsonld) ||
    fromMeta($) ||
    fromMicrodata($) ||
    fromEmbeddedJson(getBlobs(), reference, pageUrl, getVisible()) ||
    fromDom($)

  if (found) Object.assign(result, found)
  if (result.price && !result.currency) {
    result.currency =
      detectCurrency($('[itemprop=priceCurrency]').attr('content') ?? meta($, 'product:price:currency') ?? '') ??
      currencyFromVisibleText($, result.price) ??
      guessCurrency(pageUrl, $('html').attr('lang') ?? meta($, 'og:locale'))
  }
  return result
}

function fromLocator($: CheerioAPI, locator: string, blobs: () => unknown[]): Partial<Extracted> | undefined {
  if (locator.startsWith('json/')) {
    const [, divisor, ...rest] = locator.match(/^json\/(\d+):(.*)$/) ?? []
    const price = divisor ? readJsonPath(blobs(), rest.join(':'), Number(divisor)) : undefined
    return price ? { price, source: 'locator', locator } : undefined
  }
  const selector = locator.replace(/^css:/, '')
  try {
    const el = $(selector).first()
    const text = el.attr('content') ?? el.text()
    const price = parsePrice(text)
    if (price) return { price, currency: detectCurrency(text), source: 'locator', locator }
  } catch {
    // A stale or invalid selector just falls through to the other strategies.
  }
  return undefined
}

function findJsonLdProduct($: CheerioAPI): Json | undefined {
  const candidates: Json[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      collect(JSON.parse($(el).text().trim()), candidates)
    } catch {
      // Some sites ship broken JSON-LD; ignore it.
    }
  })
  return candidates.find((c) => offersOf(c).length > 0) ?? candidates[0]
}

function collect(node: unknown, out: Json[]) {
  if (Array.isArray(node)) return node.forEach((n) => collect(n, out))
  if (!node || typeof node !== 'object') return
  const obj = node as Json
  const type = obj['@type']
  const types = Array.isArray(type) ? type : [type]
  if (types.some((t) => t === 'Product' || t === 'ProductGroup' || t === 'IndividualProduct')) out.push(obj)
  if (obj['@graph']) collect(obj['@graph'], out)
  if (obj.mainEntity) collect(obj.mainEntity, out)
  if (types.includes('ProductGroup') && obj.hasVariant) collect(obj.hasVariant, out)
}

function offersOf(product: Json): Json[] {
  const offers = product.offers
  if (!offers) return []
  const list = (Array.isArray(offers) ? offers : [offers]) as Json[]
  return list.flatMap((o) => (Array.isArray(o?.offers) ? (o.offers as Json[]) : [o])).filter(Boolean)
}

function fromJsonLd(product: Json | undefined): Partial<Extracted> | undefined {
  if (!product) return undefined
  const prices: { price: number; currency?: string }[] = []
  for (const offer of offersOf(product)) {
    const spec = (Array.isArray(offer.priceSpecification) ? offer.priceSpecification[0] : offer.priceSpecification) as Json | undefined
    const price = parsePrice(offer.price ?? offer.lowPrice ?? spec?.price)
    if (price) prices.push({ price, currency: str(offer.priceCurrency) ?? str(spec?.priceCurrency) })
  }
  if (prices.length === 0) return undefined
  const best = prices.reduce((a, b) => (b.price < a.price ? b : a))
  return { ...best, source: 'jsonld' }
}

function fromMeta($: CheerioAPI): Partial<Extracted> | undefined {
  const amount = meta($, 'product:price:amount') ?? meta($, 'og:price:amount')
  const price = parsePrice(amount)
  if (!price) return undefined
  const currency = meta($, 'product:price:currency') ?? meta($, 'og:price:currency') ?? detectCurrency(amount ?? '')
  return { price, currency, source: 'meta' }
}

function fromMicrodata($: CheerioAPI): Partial<Extracted> | undefined {
  const el = $('[itemprop=price]').first()
  if (!el.length) return undefined
  const text = el.attr('content') ?? el.text()
  const price = parsePrice(text)
  if (!price) return undefined
  const currency = $('[itemprop=priceCurrency]').first().attr('content') ?? detectCurrency(el.text())
  return { price, currency, source: 'microdata' }
}

function fromEmbeddedJson(blobs: unknown[], reference: string, pageUrl: string, visible: VisiblePrices): Partial<Extracted> | undefined {
  const best = findPriceInJson(blobs, reference, pageUrl, visible)
  if (!best) return undefined
  return { price: best.value, currency: best.currency, source: 'json', locator: `json/${best.divisor}:${best.path}` }
}

function fromDom($: CheerioAPI): Partial<Extracted> | undefined {
  const best = findPriceInDom($)
  if (!best) return undefined
  return { price: best.price, currency: best.currency, source: 'dom', locator: `css:${best.selector}` }
}

/**
 * Learned fallback: given the price the user sees, find where it lives on the page
 * (a visible element first, then embedded JSON) and return a locator for it.
 */
export function learnLocator(html: string, price: number): string | undefined {
  const $ = cheerio.load(html)
  const clean$ = cheerio.load(html)
  clean$('script, style, noscript, svg, template').remove()

  const matches: Element[] = []
  clean$('body *').each((_, el) => {
    const $el = clean$(el)
    const text = ($el.attr('content') ?? $el.text()).trim()
    if (el.type === 'tag' && text && text.length <= 40 && parsePrice(text) === price) matches.push(el)
  })
  // The deepest match is the price node itself, not its wrappers.
  const leaves = matches.filter((m) => !clean$(m).find('*').toArray().some((d) => matches.includes(d as Element)))
  for (const el of leaves) {
    const selector = cssPath(clean$, el)
    if (selector && parsePrice($(selector).first().text()) === price) return `css:${selector}`
  }

  const json = learnJsonPath(jsonBlobs($), price)
  return json ? `json/${json.divisor}:${json.path}` : undefined
}

function imageMatchingTitle($: CheerioAPI, title: string | undefined): string | undefined {
  if (!title) return undefined
  const img = $('img[alt]')
    .toArray()
    .find((el) => nameMatch($(el).attr('alt') ?? '', title) >= 0.6)
  if (!img) return undefined
  const $img = $(img)
  return $img.attr('data-old-hires') || $img.attr('data-src') || $img.attr('src') || $img.attr('srcset')?.split(/[\s,]/)[0]
}

function currencyFromVisibleText($: CheerioAPI, price: number): string | undefined {
  return visiblePrices($).get(price)
}

function meta($: CheerioAPI, name: string): string | undefined {
  const value = $(`meta[property="${name}"], meta[name="${name}"], meta[itemprop="${name}"]`).first().attr('content')
  return value?.trim() || undefined
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function firstImage(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return firstImage(v[0])
  if (v && typeof v === 'object') return str((v as Json).url) ?? str((v as Json).contentUrl)
  return undefined
}

function clean(v: string | undefined): string | undefined {
  const text = v?.replace(/\s+/g, ' ').trim()
  return text ? cheerio.load(`<p>${text}</p>`)('p').text() : undefined
}

function absolute(v: string | undefined, base: string): string | undefined {
  if (!v) return undefined
  try {
    return new URL(v, base).toString()
  } catch {
    return undefined
  }
}

const EURO_COUNTRIES = ['it', 'de', 'fr', 'es', 'nl', 'be', 'at', 'pt', 'ie', 'fi', 'gr', 'lu', 'sk', 'si', 'ee', 'lv', 'lt', 'hr', 'mt', 'cy']
const COUNTRY_CURRENCY: Record<string, string> = { gb: 'GBP', uk: 'GBP', us: 'USD', ch: 'CHF', se: 'SEK', dk: 'DKK', no: 'NOK', pl: 'PLN', cz: 'CZK', ca: 'CAD', au: 'AUD' }

function currencyForCountry(country: string | undefined): string | undefined {
  if (!country) return undefined
  const c = country.toLowerCase()
  return EURO_COUNTRIES.includes(c) ? 'EUR' : COUNTRY_CURRENCY[c]
}

/** Last resort: the shop's country from the URL locale (`/it-it/`, `/en_gb/`), page language, or domain. */
function guessCurrency(url: string, lang: string | undefined): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  const locale = parsed.pathname.match(/^\/(?:[a-z]{2}[-_])?([a-z]{2})(?:[-_]([a-z]{2}))?(?:\/|$)/i)
  const fromPath = locale && (currencyForCountry(locale[2]) ?? currencyForCountry(locale[1]))
  const fromLang = lang?.match(/^[a-z]{2}[-_]([a-z]{2})/i)?.[1]
  const tld = parsed.hostname.split('.').pop()
  return fromPath ?? currencyForCountry(fromLang) ?? currencyForCountry(tld === 'com' ? undefined : tld) ?? (tld === 'com' ? 'USD' : undefined)
}
