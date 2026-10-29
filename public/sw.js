const CACHE_NAME = 'alkfory-shell-v1';
const APP_SHELL = [
  '/',
  '/entry.html',
  '/manifest.json',
  '/icons/alkfory.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // لا نخزّن API أو صفحات خاصة أو ردود تسجيل الدخول.
  if (url.pathname.startsWith('/api/') ||
      url.pathname === '/admin' ||
      url.pathname === '/home.html' ||
      url.pathname.startsWith('/api')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/entry.html')
      )
    );
  }
});
