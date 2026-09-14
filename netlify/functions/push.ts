import type { Config, Context } from '@netlify/functions'
import type { PushSubscription } from 'web-push'
import { error, json, requireKey } from '../lib/http'
import { sendToAll } from '../lib/push'
import { getSubscriptions, saveSubscriptions } from '../lib/store'

export default async (req: Request, context: Context) => {
  // The public key isn't secret: the app needs it before it can subscribe.
  if (context.params.action === 'key' && req.method === 'GET') {
    return json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null })
  }

  const denied = requireKey(req)
  if (denied) return denied

  switch (`${req.method} ${context.params.action}`) {
    case 'POST subscribe': {
      const sub = (await req.json()) as PushSubscription
      if (!sub?.endpoint || !sub.keys?.p256dh) return error('Invalid subscription')
      const subs = (await getSubscriptions()).filter((s) => s.endpoint !== sub.endpoint)
      await saveSubscriptions([...subs, sub])
      return json({ ok: true, devices: subs.length + 1 })
    }
    case 'POST unsubscribe': {
      const { endpoint } = (await req.json()) as { endpoint: string }
      await saveSubscriptions((await getSubscriptions()).filter((s) => s.endpoint !== endpoint))
      return json({ ok: true })
    }
    case 'POST test': {
      const sent = await sendToAll({
        title: '🔔 Notifications work',
        body: 'You’ll get an alert here when a price drops.',
        url: '/',
        tag: 'test',
      })
      return json({ sent })
    }
    default:
      return error('Not found', 404)
  }
}

export const config: Config = { path: '/api/push/:action' }
