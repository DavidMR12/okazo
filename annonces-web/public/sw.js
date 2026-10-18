/* Service worker : pages et photos déjà consultées disponibles hors ligne. */
const VERSION = 'v1';
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const IMAGES = `images-${VERSION}`;
const OFFLINE_URL = '/hors-ligne';
const MEDIA_ORIGIN = new URL(self.location.href).searchParams.get('media') || '';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Jamais de cache pour les données personnelles ni pour la publicité
  if (url.origin === self.location.origin && (url.pathname.startsWith('/api/') || url.pathname === '/sw.js')) return;

  // Photos des annonces (uniquement notre stockage) : cache d'abord, 300 photos maximum
  if (req.destination === 'image' && MEDIA_ORIGIN && url.origin === MEDIA_ORIGIN) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(IMAGES).then((c) => c.put(req, copy).then(() => trim(IMAGES, 300)));
            return res;
          }),
      ),
    );
    return;
  }

  // Fichiers statiques de Next.js (noms uniques et immuables) : cache d'abord
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(ASSETS).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Pages : réseau d'abord (contenu frais), puis la version en cache, puis la page « hors ligne »
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy).then(() => trim(PAGES, 60)));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(OFFLINE_URL))),
    );
  }
});
