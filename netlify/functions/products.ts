import type { Config, Context } from '@netlify/functions'
import { randomUUID } from 'node:crypto'
import { hostOf, titleFromUrl } from '../../shared/format'
import { INTERVALS, type CreateProductInput, type IntervalHours, type Product, type Rule, type UpdateProductInput } from '../../shared/types'
import { checkProduct } from '../lib/checkProduct'
import { learnLocator } from '../lib/extract'
import { BLOCKED_MESSAGE, FetchError, normalizeUrl } from '../lib/fetchPage'
import { browserWorkerEnabled, dispatchBrowserWorker } from '../lib/github'
import { error, json } from '../lib/http'
import { scrape, type Scraped } from '../lib/scrape'
import { deleteProduct, getProduct, listProducts, saveProduct } from '../lib/store'

export default async (req: Request, context: Context) => {
  const { id, action } = context.params

  if (!id) {
    if (req.method === 'GET') return json(await listProducts())
    if (req.method === 'POST') return create(await req.json())
    return error('Method not allowed', 405)
  }

  const product = await getProduct(id)
  if (!product) return error('Prodotto non trovato', 404)

  if (action === 'check' && req.method === 'POST') {
    if (product.route === 'browser') {
      // Browser checks run on GitHub; flag it and start the worker.
      const queued = { ...product, checkRequested: true, unsupported: undefined }
      await saveProduct(queued)
      await dispatchBrowserWorker()
      return json(queued, 202)
    }
    const { product: checked, escalated } = await checkProduct(product)
    if (escalated) await dispatchBrowserWorker()
    return json(checked, escalated ? 202 : 200)
  }
  if (action) return error('Not found', 404)

  if (req.method === 'GET') return json(product)
  if (req.method === 'PATCH') return json(await update(product, await req.json()))
  if (req.method === 'PUT') {
    // Restore (used by "undo" after delete).
    const body = (await req.json()) as Product
    await saveProduct({ ...body, id })
    return json(body)
  }
  if (req.method === 'DELETE') {
    await deleteProduct(id)
    return json({ ok: true })
  }
  return error('Method not allowed', 405)
}

async function create(input: CreateProductInput): Promise<Response> {
  const url = normalizeUrl(input.url ?? '')
  if (!url) return error('Questo non sembra un link')
  const rule = validRule(input.rule)
  if (!rule) return error('Regola di avviso non valida')
  const intervalHours = INTERVALS.includes(input.intervalHours) ? input.intervalHours : 6

  let page: Scraped
  try {
    page = await scrape(url)
  } catch (e) {
    const blocked = e instanceof FetchError && e.message === BLOCKED_MESSAGE
    if (blocked && browserWorkerEnabled()) return createPending(url, rule, intervalHours, input.title)
    return error(e instanceof FetchError ? e.message : 'Non riesco a caricare la pagina', 422)
  }

  const { data } = page
  let price = data.price
  let locator = data.locator

  if (input.manualPrice && price !== input.manualPrice) {
    // The user corrected or supplied the price: learn where that number lives on the page.
    locator = learnLocator(page.html, input.manualPrice)
    if (!locator) {
      return error('Non trovo quel prezzo nella pagina. Il negozio potrebbe caricare i prezzi dopo l’apertura.', 422)
    }
    price = input.manualPrice
  }
  if (!price) return json({ error: 'Prezzo non trovato', needsPrice: true }, 422)

  const existing = (await listProducts()).find((p) => p.url === url)
  const now = Date.now()
  const product: Product = {
    id: existing?.id ?? randomUUID(),
    url,
    title: data.title ?? existing?.title ?? url,
    image: data.image ?? existing?.image,
    currency: data.currency ?? existing?.currency ?? 'EUR',
    rule,
    intervalHours,
    locator,
    addedPrice: existing?.addedPrice ?? price,
    lastPrice: price,
    lowestPrice: Math.min(existing?.lowestPrice ?? price, price),
    // Don't alert for a price you're already looking at.
    lastNotifiedPrice: rule.type === 'below' && price <= rule.cap ? price : undefined,
    history: [...(existing?.history ?? []), { t: now, p: price }].slice(-60),
    lastCheckedAt: now,
    createdAt: existing?.createdAt ?? now,
  }
  await saveProduct(product)
  return json(product, existing ? 200 : 201)
}

/** A shop that blocks server requests: save it now and let the browser worker fetch the first price. */
async function createPending(url: string, rule: Rule, intervalHours: IntervalHours, shareTitle?: string): Promise<Response> {
  const existing = (await listProducts()).find((p) => p.url === url)
  if (existing && !existing.pending) {
    const updated: Product = { ...existing, rule, intervalHours, route: 'browser', checkRequested: true }
    await saveProduct(updated)
    await dispatchBrowserWorker()
    return json(updated, 202)
  }
  const now = Date.now()
  const title = shareTitle?.trim() && !/^https?:\/\//.test(shareTitle) ? shareTitle.trim() : undefined
  const product: Product = {
    id: existing?.id ?? randomUUID(),
    url,
    title: title ?? titleFromUrl(url) ?? `Prodotto su ${hostOf(url)}`,
    rule,
    intervalHours,
    addedPrice: 0,
    lastPrice: 0,
    lowestPrice: 0,
    history: [],
    lastCheckedAt: 0,
    createdAt: existing?.createdAt ?? now,
    route: 'browser',
    pending: true,
  }
  await saveProduct(product)
  await dispatchBrowserWorker()
  return json(product, 202)
}

async function update(product: Product, input: UpdateProductInput): Promise<Product> {
  const next: Product = { ...product }
  if (input.intervalHours && INTERVALS.includes(input.intervalHours)) next.intervalHours = input.intervalHours
  const rule = input.rule && validRule(input.rule)
  if (rule) {
    next.rule = rule
    next.lastNotifiedPrice =
      !product.pending && rule.type === 'below' && product.lastPrice <= rule.cap ? product.lastPrice : undefined
  }
  await saveProduct(next)
  return next
}

function validRule(rule: Rule | undefined): Rule | undefined {
  if (rule?.type === 'drop') return { type: 'drop' }
  if (rule?.type === 'below' && Number.isFinite(rule.cap) && rule.cap > 0) return { type: 'below', cap: rule.cap }
  return undefined
}

export const config: Config = { path: ['/api/products', '/api/products/:id', '/api/products/:id/:action'] }
