import type { CheckOutcome, Product, Route } from '../../shared/types'
import { BLOCKED_MESSAGE, FetchError } from './fetchPage'
import { browserWorkerEnabled } from './github'
import { applyOutcome, type Transition } from './outcome'
import { sendToAll } from './push'
import { scrape } from './scrape'
import { saveProduct } from './store'

/** Checks a product with a plain server request (the Netlify route). */
export async function checkProduct(product: Product, now = Date.now()): Promise<Transition> {
  return commitOutcome(product, await fetchOutcome(product.url, product.locator), 'fetch', now)
}

export async function fetchOutcome(url: string, locator?: string): Promise<CheckOutcome> {
  try {
    const { data } = await scrape(url, locator)
    return { ok: true, price: data.price, currency: data.currency, title: data.title, image: data.image, locator: data.locator }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Check failed'
    return { ok: false, blocked: e instanceof FetchError && message === BLOCKED_MESSAGE, message }
  }
}

/** Applies a check outcome, saves the product and sends any notification. */
export async function commitOutcome(product: Product, outcome: CheckOutcome, via: Route, now = Date.now()): Promise<Transition> {
  const transition = applyOutcome(product, outcome, via, now, browserWorkerEnabled())
  await saveProduct(transition.product)
  if (transition.push) await sendToAll(transition.push)
  return transition
}
