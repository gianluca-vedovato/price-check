import webpush from 'web-push'
import type { Product } from '../../shared/types'
import { formatPrice } from '../../shared/format'
import { getSubscriptions, saveSubscriptions } from './store'

export type PushPayload = { title: string; body: string; image?: string; url: string; tag?: string }

function configure(): boolean {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:price-check@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  return true
}

export async function sendToAll(payload: PushPayload): Promise<number> {
  if (!configure()) return 0
  const subs = await getSubscriptions()
  const expired = new Set<string>()
  let sent = 0
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 24 * 3600, urgency: 'high' })
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) expired.add(sub.endpoint)
        else console.error('push failed', status, e)
      }
    }),
  )
  if (expired.size) await saveSubscriptions(subs.filter((s) => !expired.has(s.endpoint)))
  return sent
}

export function priceDropPayload(product: Product, previous: number, next: number): PushPayload {
  const pct = Math.round(((previous - next) / previous) * 100)
  const was = pct > 0 ? `was ${formatPrice(previous, product.currency)}, −${pct}%` : ''
  const target = product.rule.type === 'below' ? `under ${formatPrice(product.rule.cap, product.currency)}` : ''
  const detail = [was, target].filter(Boolean).join(' · ')
  return {
    title: `↓ ${formatPrice(next, product.currency)}${detail ? `  (${detail})` : ''}`,
    body: product.title,
    image: product.image,
    url: product.url,
    tag: product.id,
  }
}
