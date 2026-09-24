/* HSS 実技試験 V2 Service Worker
   キャッシュ優先：電波が弱い豚舎（つながるが応答が返らない）でも、キャッシュ済みのアプリ本体を待たずに即起動する。
   アプリ本体（ASSETS）の入れ替えは install の addAll だけが行う（全ファイルがそろった時だけ新しい CACHE が入る＝版が丸ごと入れ替わる）。
   裏の更新（stale-while-revalidate）で今の CACHE の ASSETS を1ファイルずつ上書きすると、配布直後に新旧が混ざり、
   その状態で圏外で開くとアプリが壊れる（W16-1）。そのため ASSETS は裏で取り直さない。裏で更新するのは ASSETS 以外だけ。
   新しい版は CACHE の版上げ（＋ js/config.js の APP_VER も同じ値に）で取り込む。
   キャッシュに無いものだけネットワークへ（3秒で打ち切り）。ページ遷移（navigate）だけ index.html にフォールバックし、
   スクリプト・CSS 等はエラーを返す（欠けたファイル名がコンソールに出る。HTML を JS として読ませない＝W16-5） */
const CACHE = 'jitsugi-v2-v21';
const ASSETS = [
  './', './index.html', './styles.css', './v2.css', './works-v2.js',
  './js/config.js', './js/util.js', './js/i18n.js', './js/data.js', './js/store.js', './js/person.js', './js/contract.js', './js/ui.js', './js/sync.js', './js/app.js',
  './chart.umd.min.js', './manifest.json', './icon-192.png', './icon-512.png',
];
const ASSET_PATHS = new Set(ASSETS.map(u => new URL(u, self.location.href).pathname));
const NET_TIMEOUT_MS = 3000;

self.addEventListener('install', e => {
  // HTTPキャッシュ（GitHub Pages は max-age=600）を通さず最新を取る。addAll は1件でも失敗すると何も入れない（旧版がそのまま残る）
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ページから「今のSWの版」を聞かれたら答える（設定タブの版表示＝本部が評価者の端末の版を確かめる）
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'ver' && e.ports && e.ports[0]) e.ports[0].postMessage({ cache: CACHE });
});

function timeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // GAS等の外部はSWを通さない
  const isAsset = ASSET_PATHS.has(url.pathname);
  const isNav = req.mode === 'navigate';
  let net = null;
  const getNet = () => net || (net = fetch(req).then(res => {
    // 今の CACHE に書き足してよいのは ASSETS 以外だけ（本体は install でまとめて入れ替える）
    if (!isAsset && res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  }));
  const hitP = caches.match(req, { ignoreSearch: true });
  // ASSETS 以外は裏で更新（キャッシュに無い時は3秒で打ち切った後の取得も最後まで待つ。失敗・遅延は無視）。ASSETS がキャッシュにあれば取り直さない
  e.waitUntil(hitP.then(hit => { if (!hit || !isAsset) return getNet().then(() => {}, () => {}); }).catch(() => {}));
  e.respondWith(
    hitP.then(hit => {
      if (hit) return hit;
      return timeout(getNet(), NET_TIMEOUT_MS)
        .catch(() => isNav ? caches.match('./index.html') : null)
        .then(r => r || Response.error());
    })
  );
});
