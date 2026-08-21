// Service Worker para suporte Offline e PWA do ReformaPlus ROI
// v2.0.2 — hotfix Android 12 Chrome 151: NUNCA redireciona /index.html → / no SW.
//   HTTP 200 sempre retorna para / E /index.html (ambos servem o mesmo HTML da shell).
//   A limpeza da URL acontece client-side no <head> do index.html com history.replaceState.
const CACHE_NAME = 'reformaplus-v2.0.2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/css/style.css',
  '/assets/js/storage.js',
  '/assets/js/metrics.js',
  '/assets/js/reports.js',
  '/assets/js/supabaseClient.js',
  '/assets/js/supabaseSync.js',
  '/assets/js/auth.js',
  '/assets/js/app.js',
  '/assets/js/env.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

// Chrome/Firefox/Edge aceitam navigation preload (acelera 1ª carga offline)
if ('navigationPreload' in self.registration) {
  self.addEventListener('activate', () => {
    self.registration.navigationPreload.enable().catch(() => { /* ignora */ });
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[SW] cache.addAll parcial falhou:', err && err.message);
        // Fallback: se algum asset falhou (ex: env.js ainda não gerado), cache o mínimo necessário para o PWA abrir
        return cache.addAll(['/', '/index.html', '/manifest.json']).catch(() => undefined);
      });
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

// Helper: resolve a página shell ("/" ou "/index.html") sem duplicatas
function getShellFromCache() {
  return caches.open(CACHE_NAME).then(async (cache) => {
    const cachedIndex = await cache.match('/index.html');
    if (cachedIndex) return cachedIndex;
    const cachedRoot = await cache.match('/');
    if (cachedRoot) return cachedRoot;
    throw new Error('shell not cached');
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignora esquemas não-HTTP (chrome-extension, data, etc) e métodos não-GET
  if (!['http:', 'https:'].includes(url.protocol) || req.method !== 'GET') {
    return;
  }

  // Ignora pedidos Supabase CDN / terceiros (cache do navegador resolve)
  if (req.mode !== 'navigate' && url.origin !== location.origin) {
    return;
  }

  // --- NAVEGAÇÃO (PWA launcher: start_url "/" ou qualquer clique interno) ---
  if (req.mode === 'navigate') {
    event.respondWith(
      // Tenta rede primeiro com navigationPreload se disponível
      Promise.resolve(event.preloadResponse)
        .then((preload) => preload || fetch(req, { cache: 'no-cache' }).catch(() => null))
        .then((networkResp) => {
          if (networkResp && networkResp.ok) {
            // Se veio 30x redirect para "/" mantém a shell
            const cacheCopy = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => {
              try { cache.put(req, cacheCopy); } catch (_) { /* ignora */ }
              if (url.pathname === '/' || url.pathname === '' || url.pathname === '/index.html') {
                try { cache.put('/index.html', networkResp.clone()); cache.put('/', networkResp.clone()); } catch (_) { /* ignora */ }
              }
            });
            return networkResp;
          }
          throw new Error('navigate offnet');
        })
        .catch(() => {
          // OFFLINE: retorna shell "/" se ela existir (não /index.html, que Vercel limpa)
          return getShellFromCache().catch(() =>
            caches.match('/').then((m) => m || caches.match('/index.html') || new Response('Offline, sem shell.', { status: 503, headers: { 'Content-Type': 'text/plain' } }))
          );
        })
    );
    return;
  }

  // --- ASSETS / DADOS ---
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(req).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => { try { cache.put(req, responseToCache); } catch (_) { } });
        return response;
      }).catch(() => {
        if (req.headers.get('accept')?.includes('text/html')) {
          return getShellFromCache().catch(() => new Response('Offline', { status: 503 }));
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// App instalado → focus se clicado de novo (launch_handler navigate_existing_client)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
