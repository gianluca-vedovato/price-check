import type { Config, Context } from '@netlify/functions'
import { randomUUID } from 'node:crypto'
import { INTERVALS, type CreateProductInput, type Product, type Rule, type UpdateProductInput } from '../../shared/types'
import { checkProduct } from '../lib/checkProduct'
import { learnLocator } from '../lib/extract'
import { FetchError, normalizeUrl } from '../lib/fetchPage'
import { error, json, requireKey } from '../lib/http'
import { scrape, type Scraped } from '../lib/scrape'
import { deleteProduct, getProduct, listProducts, saveProduct } from '../lib/store'

export default async (req: Request, context: Context) => {
  const denied = requireKey(req)
  if (denied) return denied

  const { id, action } = context.params

  if (!id) {
    if (req.method === 'GET') return json(await listProducts())
    if (req.method === 'POST') return create(await req.json())
    return error('Method not allowed', 405)
  }

  const product = await getProduct(id)
  if (!product) return error('Product not found', 404)

  if (action === 'check' && req.method === 'POST') return json((await checkProduct(product)).product)
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
  if (!url) return error('That doesn’t look like a link')
  const rule = validRule(input.rule)
  if (!rule) return error('Invalid alert rule')
  const intervalHours = INTERVALS.includes(input.intervalHours) ? input.intervalHours : 6

  let page: Scraped
  try {
    page = await scrape(url)
  } catch (e) {
    return error(e instanceof FetchError ? e.message : 'Could not load the page', 422)
  }

  const { data } = page
  let price = data.price
  let locator = data.locator

  if (input.manualPrice && price !== input.manualPrice) {
    // The user corrected or supplied the price: learn where that number lives on the page.
    locator = learnLocator(page.html, input.manualPrice)
    if (!locator) {
      return error('Couldn’t find that price on the page. The shop may load prices after the page opens.', 422)
    }
    price = input.manualPrice
  }
  if (!price) return json({ error: 'Price not found', needsPrice: true }, 422)

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

async function update(product: Product, input: UpdateProductInput): Promise<Product> {
  const next: Product = { ...product }
  if (input.intervalHours && INTERVALS.includes(input.intervalHours)) next.intervalHours = input.intervalHours
  const rule = input.rule && validRule(input.rule)
  if (rule) {
    next.rule = rule
    next.lastNotifiedPrice = rule.type === 'below' && product.lastPrice <= rule.cap ? product.lastPrice : undefined
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
