import { formatPrice } from '../../shared/format'
import { WORKER_ENGINES, type CheckOutcome, type Product, type Route } from '../../shared/types'
import type { PushPayload } from './push'
import { applyCheck, needsConfirmation, shouldNotify } from './rules'

export const BROWSER_BLOCKED_MESSAGE = 'Questo negozio blocca i controlli automatici, anche da un browser vero'

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
  // Any check that runs is a fresh attempt, including a retry of a product the worker gave up on.
  const base: Product = { ...product, checkRequested: undefined, unsupported: undefined, unsupportedEngines: undefined }
  if (outcome.ok && outcome.engine) base.engine = outcome.engine

  if (!outcome.ok) {
    if (via === 'fetch' && outcome.blocked && browserAvailable) {
      // Keep lastCheckedAt so the product stays due and the worker picks it up right away.
      return { product: { ...base, route: 'browser', lastError: undefined }, escalated: true }
    }
    // Blocks can be temporary: give up on a new product only when a second run is blocked too.
    // A retry after the worker's browsers changed counts as a first run again.
    if (via === 'browser' && outcome.blocked && product.pending && !product.unsupported && product.lastError === BROWSER_BLOCKED_MESSAGE) {
      return {
        product: { ...base, lastCheckedAt: now, lastError: BROWSER_BLOCKED_MESSAGE, unsupported: true, unsupportedEngines: WORKER_ENGINES },
        push: {
          title: 'Non posso seguire questo prodotto',
          body: `${product.title}: il negozio blocca i controlli automatici.`,
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
    const message = product.pending ? 'Non trovo il prezzo nella pagina' : 'Il prezzo non è più presente nella pagina'
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
  const target = rule.type === 'below' ? `avviso sotto ${formatPrice(rule.cap, tracked.currency)}` : 'avviso a ogni calo'
  return {
    product: tracked,
    push: {
      title: alreadyBelow
        ? `Già sotto il tuo obiettivo: ${formatPrice(price, tracked.currency)}`
        : `Lo seguo a ${formatPrice(price, tracked.currency)}`,
      body: `${tracked.title} · ${target}`,
      image: tracked.image,
      url: tracked.url,
      tag: tracked.id,
    },
  }
}

export function priceDropPayload(product: Product, previous: number, next: number): PushPayload {
  const pct = Math.round(((previous - next) / previous) * 100)
  const was = pct > 0 ? `era ${formatPrice(previous, product.currency)}, −${pct}%` : ''
  const target = product.rule.type === 'below' ? `sotto ${formatPrice(product.rule.cap, product.currency)}` : ''
  const detail = [was, target].filter(Boolean).join(' · ')
  return {
    title: `↓ ${formatPrice(next, product.currency)}${detail ? `  (${detail})` : ''}`,
    body: product.title,
    image: product.image,
    url: product.url,
    tag: product.id,
  }
}
