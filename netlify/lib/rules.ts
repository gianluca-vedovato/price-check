import type { Product } from '../../shared/types'

/** Decides whether a freshly checked price should trigger an alert. */
export function shouldNotify(product: Product, newPrice: number): boolean {
  if (product.rule.type === 'drop') return newPrice < product.lastPrice

  if (newPrice > product.rule.cap) return false
  // Alert when first crossing the cap, then only on further drops.
  return product.lastNotifiedPrice === undefined || newPrice < product.lastNotifiedPrice
}

/** Applies a successful check to the product, returning the updated copy. */
export function applyCheck(product: Product, newPrice: number, now: number, notified: boolean): Product {
  const history = [...product.history]
  const last = history[history.length - 1]
  // Only store a point when the price changes, plus one per day, to keep the blob small.
  if (!last || last.p !== newPrice || now - last.t > 24 * 3600_000) history.push({ t: now, p: newPrice })

  let lastNotifiedPrice = notified ? newPrice : product.lastNotifiedPrice
  // Re-arm the cap alert once the price goes back above it.
  if (product.rule.type === 'below' && newPrice > product.rule.cap) lastNotifiedPrice = undefined

  return {
    ...product,
    lastPrice: newPrice,
    lowestPrice: Math.min(product.lowestPrice, newPrice),
    lastNotifiedPrice,
    pendingPrice: undefined,
    history: history.slice(-60),
    lastCheckedAt: now,
    lastError: undefined,
  }
}

/**
 * A price that moved more than 70% could be a real flash sale or a misread page
 * (a wrong element, a variant, a price in cents). Ask the next check to confirm it first.
 */
export function needsConfirmation(product: Product, newPrice: number): boolean {
  const change = Math.abs(newPrice - product.lastPrice) / product.lastPrice
  return change > 0.7 && product.pendingPrice !== newPrice
}

export function isDue(product: Product, now: number): boolean {
  // 5 minute slack so an hourly cron doesn't skip a 6h product by a few seconds.
  return now - product.lastCheckedAt >= product.intervalHours * 3600_000 - 5 * 60_000
}
