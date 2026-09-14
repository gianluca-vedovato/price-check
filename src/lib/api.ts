import type { CreateProductInput, Preview, Product, UpdateProductInput } from '../../shared/types'

const KEY = 'pc:key'
const CACHE = 'pc:products'

export function getKey(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setKey(key: string) {
  try {
    localStorage.setItem(KEY, key.trim())
  } catch {
    // Private mode: the key lives only for this page view.
  }
}

/**
 * Picks up `#k=SECRET&url=LINK` (iOS Shortcut, pairing link) and removes it from the address bar.
 * The hash never reaches the server, so the key stays out of logs.
 */
export function captureHash() {
  if (!location.hash.includes('k=') && !location.hash.includes('url=')) return
  const hash = new URLSearchParams(location.hash.slice(1))
  const key = hash.get('k')
  if (key) setKey(key)
  const search = new URLSearchParams(location.search)
  const url = hash.get('url')
  if (url) search.set('url', url)
  const query = search.toString()
  history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''))
}

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
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-app-key': getKey() ?? '', ...init.headers },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body)
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
