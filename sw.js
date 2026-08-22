// Service Worker para suporte Offline e PWA do ReformaPlus ROI
// v2.0.5 — manifest v2.0.5 compatível (maskable icon 512, 11 tamanhos de ícones, 3 shortcuts)
// bump version = reset cache após atualizações
const CACHE_NAME = 'reformaplus-v2.0.5';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/js/app.js',
  '/assets/js/storage.js',
  '/assets/js/metrics.js',
  '/assets/js/supabaseSync.js',
  '/assets/js/auth.js',
  '/assets/js/reports.js',
  '/assets/js/env.js',
  '/assets/icons/icon-48.png',
  '/assets/icons/icon-72.png',
  '/assets/icons/icon-96.png',
  '/assets/icons/icon-128.png',
  '/assets/icons/icon-144.png',
  '/assets/icons/icon-152.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-384.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Tenta cachear todos, mas se algum falhar (ex: env.js não existe no primeiro bootstrap)
        // não aborta a instalação inteira — salva o que for possível.
        return Promise.all(ASSETS_TO_CACHE.map(url => {
          const req = new Request(url, { credentials: 'same-origin', mode: 'no-cors' });
          return cache.add(req).catch((err) => {
            console.warn('[SW] Não foi possível pré-cachear:', url, err?.message || err);
            return Promise.resolve();
          });
        }));
      })
      .then(() => caches.open(CACHE_NAME).then((cache) => {
        // Garante shell básica sempre no cache (fallback ultra seguro)
        const critical = ['/', '/index.html', '/manifest.json', '/assets/icons/icon-192.png', '/assets/icons/icon-512.png'];
        return Promise.all(critical.map(u => cache.add(new Request(u, { mode: 'no-cors' })).catch(() => {})));
      }))
      .catch((err) => console.warn('[SW] install warning:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    ))
    .then(() => self.clients.claim())
    .then(() => {
      if (self.registration && self.registration.navigationPreload) {
        return self.registration.navigationPreload.enable()
          .then(() => self.registration.navigationPreload.setHeaderValue('X-ReformaPlus-PWA', '1'))
          .catch(() => {});
      }
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  // Navegação SPA / HTML pages → network first, fallback cache, fallback shell offline
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (!resp || resp.status !== 200 || resp.type !== 'basic') return resp;
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => { try { cache.put(req, clone); } catch (_) {} });
          return resp;
        })
        .catch(async () => {
          const shell = await getShellFromCache();
          if (shell) return shell;
          // fallback last: retorna index.html genérico offline
          const fallback = await caches.match('/index.html').catch(() => null);
          return fallback || caches.match('/');
        })
    );
    return;
  }

  // Assets staticos: cache first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => { try { cache.put(req, responseToCache); } catch (_) { } });
        return response;
      }).catch(() => {
        if (req.headers.get('accept')?.includes('text/html')) {
          return getShellFromCache();
        }
        return new Response('', { status: 408, statusText: 'Offline' });
      });
    })
  );
});

async function getShellFromCache() {
  const cache = await caches.open(CACHE_NAME);
  const matchA = await cache.match('/index.html');
  if (matchA) return matchA;
  const matchB = await cache.match('/');
  if (matchB) return matchB;
  // fallback genérico, aceita keys sem URL completa
  const allKeys = await cache.keys();
  const shell = allKeys.find(k => /index\.html|\/$/.test(k.url));
  if (shell) return cache.match(shell);
  return null;
}
