import { formatPrice } from '../../shared/format'
import type { CheckOutcome, Product, Route } from '../../shared/types'
import type { PushPayload } from './push'
import { applyCheck, needsConfirmation, shouldNotify } from './rules'

export const BROWSER_BLOCKED_MESSAGE = 'This shop blocks automatic checks, even from a real browser'

export type Transition = {
  product: Product
  /** Notification to send, if any. */
  push?: PushPayload
  /** The product needs the browser worker from now on. */
  escalated?: boolean
}

/**
 * Pure state machine for a finished check, shared by the Netlify cron (`via: 'fetch'`)
 * and the GitHub browser worker (`via: 'browser'`).
 */
export function applyOutcome(product: Product, outcome: CheckOutcome, via: Route, now: number, browserAvailable: boolean): Transition {
  const base: Product = { ...product, checkRequested: undefined }

  if (!outcome.ok) {
    if (via === 'fetch' && outcome.blocked && browserAvailable) {
      // Keep lastCheckedAt so the product stays due and the worker picks it up right away.
      return { product: { ...base, route: 'browser', lastError: undefined }, escalated: true }
    }
    // Blocks can be temporary: give up on a new product only when a second run is blocked too.
    if (via === 'browser' && outcome.blocked && product.pending && product.lastError === BROWSER_BLOCKED_MESSAGE) {
      return {
        product: { ...base, lastCheckedAt: now, lastError: BROWSER_BLOCKED_MESSAGE, unsupported: true },
        push: {
          title: 'Can’t track this product',
          body: `${product.title}: the shop blocks automatic checks.`,
          url: product.url,
          tag: product.id,
        },
      }
    }
    const message = via === 'browser' && outcome.blocked ? BROWSER_BLOCKED_MESSAGE : outcome.message
    return { product: { ...base, lastCheckedAt: now, lastError: message } }
  }

  const price = outcome.price
  if (!price) {
    const message = product.pending ? 'Couldn’t find the price on the page' : 'Price not found on the page anymore'
    return { product: { ...base, lastCheckedAt: now, lastError: message } }
  }

  if (product.pending) return firstPrice(base, outcome, price, now)

  if (needsConfirmation(product, price)) {
    return { product: { ...base, pendingPrice: price, lastCheckedAt: now, lastError: undefined } }
  }

  const notify = shouldNotify(product, price)
  const updated = applyCheck(base, price, now, notify)
  return {
    product: {
      ...updated,
      image: updated.image ?? outcome.image,
      locator: updated.locator ?? outcome.locator,
    },
    push: notify ? priceDropPayload(updated, product.lastPrice, price) : undefined,
  }
}

function firstPrice(product: Product, outcome: Extract<CheckOutcome, { ok: true }>, price: number, now: number): Transition {
  const rule = product.rule
  const alreadyBelow = rule.type === 'below' && price <= rule.cap
  const tracked: Product = {
    ...product,
    title: outcome.title ?? product.title,
    image: outcome.image ?? product.image,
    currency: outcome.currency ?? product.currency,
    locator: outcome.locator ?? product.locator,
    addedPrice: price,
    lastPrice: price,
    lowestPrice: price,
    lastNotifiedPrice: alreadyBelow ? price : undefined,
    history: [{ t: now, p: price }],
    lastCheckedAt: now,
    lastError: undefined,
    pending: undefined,
  }
  const target = rule.type === 'below' ? `alert below ${formatPrice(rule.cap, tracked.currency)}` : 'alert on any drop'
  return {
    product: tracked,
    push: {
      title: alreadyBelow
        ? `Already below your target: ${formatPrice(price, tracked.currency)}`
        : `Tracking at ${formatPrice(price, tracked.currency)}`,
      body: `${tracked.title} · ${target}`,
      image: tracked.image,
      url: tracked.url,
      tag: tracked.id,
    },
  }
}

export function priceDropPayload(product: Product, previous: number, next: number): PushPayload {
  const pct = Math.round(((previous - next) / previous) * 100)
  const was = pct > 0 ? `was ${formatPrice(previous, product.currency)}, −${pct}%` : ''
  const target = product.rule.type === 'below' ? `under ${formatPrice(product.rule.cap, product.currency)}` : ''
  const detail = [was, target].filter(Boolean).join(' · ')
  return {
    title: `↓ ${formatPrice(next, product.currency)}${detail ? `  (${detail})` : ''}`,
    body: product.title,
    image: product.image,
    url: product.url,
    tag: product.id,
  }
}
