/* HSS 実技試験 V2 Service Worker
   キャッシュ優先＋裏で更新（stale-while-revalidate）：
   電波が弱い豚舎（つながるが応答が返らない）でも、キャッシュ済みのアプリ本体を待たずに即起動する。
   新しい版は CACHE の版上げで取り込む（install で全ファイルを取り直し、次に開いた時から新しい版）。
   キャッシュに無いものだけネットワークへ（3秒で打ち切り → index.html にフォールバック） */
const CACHE = 'jitsugi-v2-v18';
const ASSETS = [
  './', './index.html', './styles.css', './v2.css', './works-v2.js',
  './js/config.js', './js/util.js', './js/i18n.js', './js/data.js', './js/store.js', './js/person.js', './js/contract.js', './js/ui.js', './js/sync.js', './js/app.js',
  './chart.umd.min.js', './manifest.json', './icon-192.png', './icon-512.png',
];
const NET_TIMEOUT_MS = 3000;

self.addEventListener('install', e => {
  // HTTPキャッシュ（GitHub Pages は max-age=600）を通さず最新を取る
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;  // GAS等の外部はSWを通さない
  const net = fetch(e.request).then(res => {
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  });
  e.waitUntil(net.then(() => {}, () => {}));   // 裏の更新が終わるまでSWを止めない（失敗・遅延は無視）
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return timeout(net, NET_TIMEOUT_MS).catch(() => caches.match('./index.html')).then(r => r || Response.error());
    })
  );
});
