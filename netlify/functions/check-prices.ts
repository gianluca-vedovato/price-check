import type { Config } from '@netlify/functions'
import { checkProduct } from '../lib/checkProduct'
import { isDue } from '../lib/rules'
import { listProducts } from '../lib/store'

const CONCURRENCY = 4

export default async () => {
  const now = Date.now()
  const due = (await listProducts()).filter((p) => isDue(p, now))

  let checked = 0
  let alerts = 0
  let failed = 0
  const queue = [...due]
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let product = queue.shift(); product; product = queue.shift()) {
        const result = await checkProduct(product, now)
        checked++
        if (result.notified) alerts++
        if (result.product.lastError) failed++
      }
    }),
  )

  console.log(`check-prices: ${checked} checked, ${alerts} alerts, ${failed} failed`)
}

export const config: Config = { schedule: '@hourly' }
