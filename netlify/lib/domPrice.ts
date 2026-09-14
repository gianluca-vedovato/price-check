import type { Cheerio, CheerioAPI } from 'cheerio'
import type { AnyNode, Element } from 'domhandler'
import { detectCurrency, parsePrice } from './parsePrice'
import { hasCurrency } from './text'

/**
 * Last resort for server-rendered pages without structured data: look for
 * elements that are named like a price, show a currency, aren't struck through
 * and sit closest after the product title.
 */
export function findPriceInDom($: CheerioAPI): { price: number; currency?: string; selector: string } | undefined {
  const order = new Map<AnyNode, number>()
  $('body *').each((i, el) => void order.set(el, i))
  const h1 = $('h1').first().get(0)
  const titleIndex = h1 ? (order.get(h1) ?? 0) : 0

  const candidates: { el: Element; price: number; currency?: string; index: number }[] = []
  const PRICE_SELECTOR =
    '[class*="price" i], [id*="price" i], [data-testid*="price" i], [data-test*="price" i], [data-qa*="price" i], [itemprop="price"]'
  $(PRICE_SELECTOR).each(
    (_, node) => {
      const el = node as Element
      const $el = $(el)
      // Wrappers holding several prices (old + new) are judged through their children instead.
      if ($el.find(PRICE_SELECTOR).length > 0) return
      const text = $el.text().replace(/\s+/g, ' ').trim()
      if (!text || text.length > 40 || !/\d/.test(text)) return
      if (!hasCurrency(text) && !$el.attr('content')) return
      if (isNotCurrent($el) || insideOtherProducts($el)) return
      const leaf = deepestWithPrice($, el, text)
      const price = parsePrice(text)
      if (!price) return
      candidates.push({ el: leaf, price, currency: detectCurrency(text), index: order.get(el) ?? 0 })
    },
  )
  if (candidates.length === 0) return undefined

  const afterTitle = candidates.filter((c) => c.index >= titleIndex)
  const best = (afterTitle.length ? afterTitle : candidates).reduce((a, b) => (b.index < a.index ? b : a))
  const selector = cssPath($, best.el)
  if (parsePrice($(selector).first().text()) !== best.price) return undefined
  return { price: best.price, currency: best.currency, selector }
}

const OLD_PRICE_TOKEN = /(^|[-_])(old|was|orig(inal)?|strike\w*|before|compare\w*|regular|list|rrp|crossed|previous|full)([-_]|$)/i
const OTHER_PRODUCTS_TOKEN = /(^|[-_])(related|recommend\w*|similar|upsells?|cross-?sells?|carousel|recently|bundles?|suggest\w*|outfit)([-_]|$)/i

function tokensOf(el: Element): string[] {
  return [el.attribs.class ?? '', el.attribs.id ?? '', ...Object.entries(el.attribs).filter(([k]) => k.startsWith('data-')).map(([k, v]) => `${k} ${v}`)]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)
}

function isNotCurrent($el: Cheerio<Element>): boolean {
  let node: Cheerio<Element> = $el
  for (let depth = 0; depth < 3 && node.length; depth++) {
    const el = node.get(0)!
    if (['del', 's', 'strike'].includes(el.name)) return true
    if (/line-through/.test(el.attribs.style ?? '')) return true
    for (const token of tokensOf(el)) {
      if (token === 'line-through' || /strike/i.test(token)) return true
      // Only trust "old/was/list…" when the same token is about a price, so utility classes like `list-none` don't count.
      if (/price/i.test(token) && OLD_PRICE_TOKEN.test(token.replace(/price/gi, ''))) return true
    }
    node = node.parent() as Cheerio<Element>
  }
  return false
}

function insideOtherProducts($el: Cheerio<Element>): boolean {
  return $el
    .parents()
    .toArray()
    .some((p) => tokensOf(p).some((t) => OTHER_PRODUCTS_TOKEN.test(t)))
}

function deepestWithPrice($: CheerioAPI, el: Element, text: string): Element {
  const price = parsePrice(text)
  let current = el
  for (;;) {
    const child = $(current)
      .children()
      .toArray()
      .find((c) => parsePrice($(c).text()) === price && !['del', 's', 'strike'].includes(c.name))
    if (!child) return current
    current = child
  }
}

/** A reasonably stable CSS selector for an element. */
export function cssPath($: CheerioAPI, el: Element): string {
  const parts: string[] = []
  let node: Element | null = el
  while (node && node.type === 'tag' && node.name !== 'html' && node.name !== 'body') {
    const id = node.attribs.id
    if (id && /^[a-zA-Z][\w-]*$/.test(id) && $(`#${id}`).length === 1) {
      parts.unshift(`#${id}`)
      break
    }
    const classes = (node.attribs.class ?? '')
      .split(/\s+/)
      // Skip hashed CSS-module classes that change on every deploy.
      .filter((c) => /^[a-zA-Z][\w-]*$/.test(c) && !/\d{3,}|[a-z]+_[a-zA-Z0-9]{5,}$/.test(c))
      .slice(0, 2)
    let part = node.name + classes.map((c) => `.${c}`).join('')
    const parent: Element | null = node.parent && node.parent.type === 'tag' ? (node.parent as Element) : null
    if (parent && $(parent).children(part).length > 1) {
      part += `:nth-of-type(${$(parent).children(node.name).index(node) + 1})`
    }
    parts.unshift(part)
    node = parent
  }
  return parts.join(' > ')
}
