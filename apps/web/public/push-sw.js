// Web Push handlers, imported into the Workbox-generated service worker via
// workbox.importScripts (vite.config.ts). Payloads arrive from the API as JSON;
// copy is emoji-free to match the product.

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'm5nita', body: event.data.text() }
  }

  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag,
    data: { url: payload.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'm5nita', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      return self.clients.openWindow(targetUrl)
    }),
  )
})
