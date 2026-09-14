import type { CheerioAPI } from 'cheerio'
import { detectCurrency, parsePrice } from './parsePrice'

const CURRENCY = String.raw`(?:€|\$|£|¥|₹|zł|kr|CHF|EUR|USD|GBP|SEK|NOK|DKK|PLN|CZK)`
const NUMBER = String.raw`\d[\d.,'   ]*\d|\d`
const PRICE_IN_TEXT = new RegExp(String.raw`${CURRENCY}\s?(?:${NUMBER})|(?:${NUMBER})\s?${CURRENCY}`, 'gi')
const HAS_CURRENCY = new RegExp(CURRENCY, 'i')

export function hasCurrency(text: string): boolean {
  return HAS_CURRENCY.test(text)
}

export type VisiblePrices = Map<number, string | undefined>

/** Every price shown with a currency in the page's visible text, mapped to that currency. */
export function visiblePrices($: CheerioAPI): VisiblePrices {
  const body = $('body').clone()
  body.find('script, style, noscript, template, svg').remove()
  const prices = new Map<number, string | undefined>()
  for (const match of body.text().matchAll(PRICE_IN_TEXT)) {
    const price = parsePrice(match[0])
    if (price && !prices.has(price)) prices.set(price, detectCurrency(match[0]))
  }
  return prices
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3),
  )
}

/** Share of `name`'s words that also appear in `reference` (0..1). */
export function nameMatch(name: string, reference: string): number {
  const a = tokens(name)
  if (a.size === 0) return 0
  const b = tokens(reference)
  let hits = 0
  for (const t of a) if (b.has(t)) hits++
  return hits / a.size
}

/** JSON key fragments that mark a price as not the current selling price (incl. EU "lowest price in 30 days"). */
export const NOT_CURRENT = /old|was|orig|strike|before|compare|regular|list|rrp|crossed|previous|saving|percent|installment|monthly|unit|shipping|delivery|lowest|omnibus|tax|vat/i

/** JSON key fragments that mark other products (recommendations, carousels…). */
export const OTHER_PRODUCTS = /related|recommend|similar|upsell|cross_?sell|carousel|recently|bundle|suggest|outfit/i
