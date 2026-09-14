/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

type Payload = { title: string; body: string; image?: string; url: string; tag?: string }

self.addEventListener('push', (event) => {
  const data: Payload = event.data?.json() ?? { title: 'Price Check', body: '', url: '/' }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.image ?? '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag,
      data: { url: data.url },
      // `image` is supported on Android/desktop Chrome; other platforms ignore it.
      ...(data.image ? { image: data.image } : {}),
    } as NotificationOptions),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data as { url?: string })?.url ?? '/', self.location.origin).href
  event.waitUntil(self.clients.openWindow(url))
})
