/* config.js — 記録用スプレッドシート（GASウェブアプリ）の送信先。
   GASを「デプロイ→ウェブアプリ」で公開したURL（…/exec）を入れる。空なら設定タブで端末ごとに入力 */
const SHEET_URL=(typeof window!=='undefined'&&window.TENANT&&window.TENANT.sheetUrl)||'';   // 送信先は tenant-config.js から来る（農場別ビルドではその農場の GAS）
/* アプリ本体の版。sw.js の CACHE と必ず同じ値にする（smoke.js が突き合わせる）。
   設定タブに「APP …」として出る＝本部が評価者に「設定の版を見て」と頼めば、その端末で動いている版が分かる */
const APP_VER='jitsugi-v2-v27';
