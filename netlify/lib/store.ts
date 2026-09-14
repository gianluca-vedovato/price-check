import { getStore } from '@netlify/blobs'
import type { PushSubscription } from 'web-push'
import type { Product } from '../../shared/types'

const products = () => getStore({ name: 'products', consistency: 'strong' })
const settings = () => getStore({ name: 'settings', consistency: 'strong' })

export async function listProducts(): Promise<Product[]> {
  const store = products()
  const { blobs } = await store.list()
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' }) as Promise<Product | null>))
  return items.filter((p): p is Product => Boolean(p))
}

export async function getProduct(id: string): Promise<Product | null> {
  return (await products().get(id, { type: 'json' })) as Product | null
}

export async function saveProduct(product: Product): Promise<void> {
  await products().setJSON(product.id, product)
}

export async function deleteProduct(id: string): Promise<void> {
  await products().delete(id)
}

export async function getSubscriptions(): Promise<PushSubscription[]> {
  return ((await settings().get('subscriptions', { type: 'json' })) as PushSubscription[] | null) ?? []
}

export async function saveSubscriptions(subs: PushSubscription[]): Promise<void> {
  await settings().setJSON('subscriptions', subs)
}
