/* Life Game service worker — offline app shell.
   Bump CACHE on each release so clients pick up new files. */
const CACHE = 'lifegame-v6';
const CORE = [
  '/',
  '/index.html',
  '/life.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/gameicon.png',
  '/training/',
  '/training/index.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll fails the whole install if any URL 404s, so add individually
      .then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache cross-origin calls (leaderboard / gallery APIs) — straight to network.
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    // Pages: network-first AND bypass the HTTP cache so edits show on a normal
    // reload (GitHub Pages sets max-age=600 on HTML, which otherwise hides updates
    // for ~10 min). Falls back to cache only when offline.
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
    );
  } else {
    // Static assets (images, etc.): stale-while-revalidate. Serve the cached copy
    // immediately for speed, but always refetch in the background and update the
    // cache — so updated thumbnails/assets self-heal on the next visit instead of
    // sticking until a hard reset.
    e.respondWith(
      caches.match(req).then((cached) => {
        const fresh = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => cached);
        return cached || fresh;
      })
    );
  }
});
