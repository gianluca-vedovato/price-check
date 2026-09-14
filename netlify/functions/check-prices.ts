import type { Config } from '@netlify/functions'
import { checkProduct } from '../lib/checkProduct'
import { browserWorkerEnabled, dispatchBrowserWorker } from '../lib/github'
import { isDue, needsBrowserCheck } from '../lib/rules'
import { listProducts } from '../lib/store'

const CONCURRENCY = 4

export default async () => {
  const now = Date.now()
  const products = await listProducts()
  const queue = products.filter((p) => p.route !== 'browser' && isDue(p, now))

  let checked = 0
  let alerts = 0
  let failed = 0
  let escalated = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let product = queue.shift(); product; product = queue.shift()) {
        const result = await checkProduct(product, now)
        checked++
        if (result.push) alerts++
        if (result.escalated) escalated++
        else if (result.product.lastError) failed++
      }
    }),
  )

  // Only start a GitHub runner when a browser product is actually due, not just coming up soon.
  const browserDue = escalated > 0 || products.some((p) => needsBrowserCheck(p, now) && (p.pending || p.checkRequested || isDue(p, now)))
  const worker = !browserDue || !browserWorkerEnabled() ? 'idle' : (await dispatchBrowserWorker()) ? 'started' : 'failed to start'

  console.log(`check-prices: ${checked} checked, ${alerts} alerts, ${failed} failed, ${escalated} moved to browser, worker ${worker}`)
}

export const config: Config = { schedule: '@hourly' }
