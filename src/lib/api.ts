import type { CreateProductInput, Preview, Product, UpdateProductInput } from '../../shared/types'

const CACHE = 'pc:products'

export class ApiError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(message: string, status: number, body: Record<string, unknown>) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init.headers } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.error ?? `Richiesta non riuscita (${res.status})`, res.status, body)
  return body as T
}

export const api = {
  preview: (url: string) => request<Preview>(`/api/preview?url=${encodeURIComponent(url)}`),
  list: () => request<Product[]>('/api/products'),
  create: (input: CreateProductInput) => request<Product>('/api/products', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: UpdateProductInput) =>
    request<Product>(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  restore: (product: Product) =>
    request<Product>(`/api/products/${product.id}`, { method: 'PUT', body: JSON.stringify(product) }),
  remove: (id: string) => request<{ ok: true }>(`/api/products/${id}`, { method: 'DELETE' }),
  check: (id: string) => request<Product>(`/api/products/${id}/check`, { method: 'POST' }),
  vapidKey: () => request<{ publicKey: string | null }>('/api/push/key'),
  subscribe: (sub: PushSubscriptionJSON) => request('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub) }),
  unsubscribe: (endpoint: string) => request('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  testPush: () => request<{ sent: number }>('/api/push/test', { method: 'POST' }),
}

export function readCache(): Product[] {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? '[]')
  } catch {
    return []
  }
}

export function writeCache(products: Product[]) {
  try {
    localStorage.setItem(CACHE, JSON.stringify(products))
  } catch {
    // Cache is a convenience only.
  }
}
