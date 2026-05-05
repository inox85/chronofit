// Nome della cache
const CACHE_NAME = 'pwa-cache-v2';

// Lista dei file da memorizzare
const FILES_TO_CACHE = [
        '/index.html',
        '/manifest.json',
        '/icon-192.png',
        '/icon-512.png',
        '/script.js',
        '/style.css',
        '/favicon.png',
        '/Nunito-Bold.ttf',
        '/logo.png',

        // 🎵 Aggiungi qui i tuoi suoni
        '/sound1.mp3',
        '/sound2.mp3',
        '/sound3.mp3',
        '/sound4.mp3'
      ];

// Installazione del service worker → memorizza i file
self.addEventListener('install', e => {
  console.log('[SW] Installazione...');
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching dei file...');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

// Attivazione → elimina vecchie cache
self.addEventListener('activate', e => {
  console.log('[SW] Attivazione...');
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(k => {
          if (k !== CACHE_NAME) {
            console.log('[SW] Cancello cache vecchia:', k);
            return caches.delete(k);
          }
        })
      );
    })
  );
});

// Intercetta tutte le fetch → serve prima dalla cache
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => {
      // Se il file è nella cache lo usa, altrimenti lo scarica e lo mette in cache
      return response || fetch(e.request).then(fetchRes => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, fetchRes.clone());
          return fetchRes;
        });
      });
    })
  );
});
