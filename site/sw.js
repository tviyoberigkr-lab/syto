// Syto — службовий працівник: застосунок відкривається без інтернету й показує останні збережені новини.
// CoLaba Production
const VERSION = 'syto-v5'; // v5: рубрики (25.11)
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('syto-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/data/news.json')) {
    // новини: спершу мережа; якщо її немає — остання збережена копія з позначкою «офлайн»
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('data/news.json', copy)); }
      return res;
    }).catch(async () => {
      const cached = await caches.match('data/news.json');
      if (!cached) return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
      const headers = new Headers(cached.headers); headers.set('x-syto-offline', '1');
      return new Response(await cached.blob(), { status: 200, headers });
    }));
    return;
  }
  // оболонка: спершу мережа (щоб оновлення доходили), інакше кеш.
  // cache: 'no-cache' — браузер щоразу звіряється з сервером (дешево, за ETag); без цього GitHub Pages
  // до 10 хв віддає стару сторінку з кешу браузера (23.11: нове гасло не з'являлося після оновлення).
  // req.url, а не req: запит-навігацію не можна перестворити з іншими параметрами.
  e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
