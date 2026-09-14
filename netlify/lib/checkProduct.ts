import type { Product } from '../../shared/types'
import { priceDropPayload, sendToAll } from './push'
import { applyCheck, needsConfirmation, shouldNotify } from './rules'
import { scrape } from './scrape'
import { saveProduct } from './store'

export type CheckResult = { product: Product; notified: boolean }

/** Fetches the product page, updates the stored product and sends an alert if the rule matches. */
export async function checkProduct(product: Product, now = Date.now()): Promise<CheckResult> {
  try {
    const { data } = await scrape(product.url, product.locator)
    if (!data.price) throw new Error('Price not found on the page anymore')

    if (needsConfirmation(product, data.price)) {
      // Keep the old price and verify the jump on the next run before alerting.
      const updated: Product = { ...product, pendingPrice: data.price, lastCheckedAt: now, lastError: undefined }
      await saveProduct(updated)
      return { product: updated, notified: false }
    }

    const previous = product.lastPrice
    const notify = shouldNotify(product, data.price)
    let updated = applyCheck(product, data.price, now, notify)
    if (!updated.image && data.image) updated = { ...updated, image: data.image }
    await saveProduct(updated)

    if (notify) await sendToAll(priceDropPayload(updated, previous, data.price))
    return { product: updated, notified: notify }
  } catch (e) {
    const updated: Product = {
      ...product,
      lastCheckedAt: now,
      lastError: e instanceof Error ? e.message : 'Check failed',
    }
    await saveProduct(updated)
    return { product: updated, notified: false }
  }
}
