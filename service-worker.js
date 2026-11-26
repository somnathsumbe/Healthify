const CACHE_NAME = 'healthify-shell-v1';
const APP_SHELL = [
  './', './index.html', './manifest.webmanifest', './assets/css/style.css',
  './assets/icons/healthify-icon.svg', './assets/icons/healthify-icon-180.png', './assets/icons/healthify-icon-192.png', './assets/icons/healthify-icon-512.png', './assets/icons/healthify-mascot.svg',
  './assets/icons/mascot-happy.svg', './assets/icons/mascot-water.svg',
  './assets/icons/mascot-move.svg', './data/21-day-fat-loss-plan.json',
  './data/food-master.json', './data/reminder-schedule.json', './src/app.js',
  './src/modules/plan-loader.js', './src/modules/reminder-engine.js',
  './src/modules/water-tracker.js', './src/modules/progress.js',
  './src/modules/nutrition-calculator.js', './src/services/storage.js',
  './src/services/push-client.js', './src/utils/date-time.js', './src/utils/validation.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    if (requestUrl.hostname === 'cdn.jsdelivr.net' || requestUrl.hostname === 'fonts.googleapis.com' || requestUrl.hostname === 'fonts.gstatic.com') {
      event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok || response.type === 'opaque') { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, copy)); }
        return response;
      })));
    }
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && new URL(request.url).origin === self.location.origin) {
      const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => request.mode === 'navigate' ? caches.match('./index.html') : Promise.reject(new Error('Offline resource unavailable')))));
});

self.addEventListener('push', event => {
  let payload = { title: 'Healthify Reminder', body: 'तुमच्या दिनक्रमाची वेळ झाली आहे.', url: './' };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch { if (event.data) payload.body = event.data.text(); }
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: './assets/icons/healthify-icon-192.png',
    badge: './assets/icons/healthify-icon-192.png',
    tag: payload.tag || 'healthify-reminder',
    renotify: false,
    data: { url: payload.url || './', reminderId: payload.tag || null },
    actions: [{ action: 'open', title: 'प्लॅन उघडा' }]
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './', self.registration.scope);
  if (event.notification.data?.reminderId) targetUrl.searchParams.set('reminderId', event.notification.data.reminderId);
  const target = targetUrl.href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    for (const client of clients) {
      if ('focus' in client) return client.navigate(target).then(() => client.focus());
    }
    return self.clients.openWindow(target);
  }));
});
