import type { Config, Context } from '@netlify/functions'
import type { CheckOutcome, WorkerJob } from '../../shared/types'
import { commitOutcome } from '../lib/checkProduct'
import { error, json, requireKey } from '../lib/http'
import { needsBrowserCheck } from '../lib/rules'
import { getProduct, listProducts } from '../lib/store'

/** API for the GitHub Actions browser worker. */
export default async (req: Request, context: Context) => {
  const denied = requireKey(req)
  if (denied) return denied

  if (req.method === 'GET' && context.params.action === 'jobs') {
    const now = Date.now()
    const jobs: WorkerJob[] = (await listProducts())
      .filter((p) => needsBrowserCheck(p, now))
      .map((p) => ({ id: p.id, url: p.url, locator: p.locator }))
    return json(jobs)
  }

  if (req.method === 'POST' && context.params.action === 'result') {
    const { id, outcome } = (await req.json()) as { id: string; outcome: CheckOutcome }
    // Re-read so edits made while the browser was loading aren't overwritten.
    const product = await getProduct(id)
    if (!product) return error('Product not found', 404)
    const { product: updated, push } = await commitOutcome(product, outcome, 'browser')
    return json({ id, price: updated.lastPrice, error: updated.lastError, notified: Boolean(push) })
  }

  return error('Not found', 404)
}

export const config: Config = { path: '/api/worker/:action' }
