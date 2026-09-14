import webpush from 'web-push'
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
