// public/sw.js
// Service Worker para notificaciones push (WhatsApp-style) en escritorio
// y en iPhone (cuando la web se agrega a la pantalla de inicio desde Safari).

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = { title: 'TeamFlow', body: '', url: '/dashboard', tag: 'info' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch (e) {
    if (event.data) data.body = event.data.text()
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'teamflow-notification',
    data: { url: data.url || '/dashboard' },
    vibrate: [120, 60, 120],
    renotify: true,
  }

  event.waitUntil(self.registration.showNotification(data.title || 'TeamFlow', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes(self.location.origin))
      if (existing) {
        existing.focus()
        existing.navigate ? existing.navigate(targetUrl) : existing.postMessage({ type: 'navigate', url: targetUrl })
        return
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
