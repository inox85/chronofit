const CACHE_NAME = 'chronofit-v7';

const STATIC_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/script.js',
  '/style.css',
  '/favicon.png',
  '/Nunito-Bold.ttf',
  '/logo.webp',
  '/logo-black.png',
  '/sound1.mp3',
  '/sound2.mp3',
  '/sound3.mp3',
  '/sound4.mp3'
];

// Riconosce asset statici da cachare (hanno un'estensione file nota)
function isStaticAsset(url) {
  return /\.(html|js|css|png|webp|ico|ttf|woff2?|mp3|json|svg|gif)$/i.test(url.pathname);
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Il SW non può intercettare WebSocket (mode === 'websocket' non è fetchabile)
  if (e.request.mode === 'websocket') return;

  const url = new URL(e.request.url);

  // Tutto ciò che non ha estensione statica è una chiamata API dinamica:
  // va sempre alla rete, mai dalla cache
  if (!isStaticAsset(url)) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('', { status: 503, statusText: 'Offline' }))
    );
    return;
  }

  // Asset statici: RETE per prima, cache solo se il device non risponde.
  // (Prima era cache-first: dopo un aggiornamento dell'interfaccia il browser
  // continuava a mostrare index.html/script.js vecchi finché non cambiava CACHE_NAME.)
  // `cache: 'no-cache'` fa rivalidare anche la cache HTTP del browser (il server
  // statico la dichiara valida per 30 giorni).
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy));
      }
      return response;
    }).catch(() =>
      caches.match(e.request).then(cached => cached || new Response('', { status: 503, statusText: 'Offline' }))
    )
  );
});
