/* HSS 実技試験 V2 Service Worker
   ネットワーク優先＋キャッシュフォールバック：
   オンライン時は常に最新を取得しつつキャッシュを更新、圏外の豚舎でもオフラインで起動できる */
const CACHE = 'jitsugi-v2-v2';
const ASSETS = [
  './', './index.html', './styles.css', './v2.css', './works-v2.js',
  './js/config.js', './js/util.js', './js/i18n.js', './js/data.js', './js/store.js', './js/ui.js', './js/sync.js', './js/app.js',
  './chart.umd.min.js', './manifest.json', './icon-192.png', './icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;  // GAS等の外部はSWを通さない
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() =>
      caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))
    )
  );
});
