// Service Worker para suporte Offline e PWA do ReformaPlus ROI
const CACHE_NAME = 'reformaplus-v8';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/js/storage.js',
  './assets/js/metrics.js',
  './assets/js/reports.js',
  './assets/js/supabaseClient.js',
  './assets/js/supabaseSync.js',
  './assets/js/app.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignora esquemas não-HTTP (chrome-extension, data, etc) e métodos não-GET
  if (!['http:', 'https:'].includes(url.protocol) || req.method !== 'GET') {
    return;
  }

  // Estratégia Cache First com Fallback para Rede
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(req).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          try {
            cache.put(req, responseToCache);
          } catch (e) { /* Ignora erros de cache */ }
        });
        return response;
      }).catch(() => {
        if (req.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
