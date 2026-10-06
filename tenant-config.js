/* テナント設定（農場ごとの差し替え口）。この既定ファイルは「ヒラノ版の今の動作」そのまま。
   他農場の配布物は tools/build-tenant.mjs が dist/<id>/ にこのファイルを農場用の内容で書き出す（このファイルは変えない）。
   ・sheetUrl   = 記録用スプレッドシート（その農場専用の GAS ウェブアプリ）の URL。空なら設定タブで端末ごとに入れる
   ・cfgPwSha256 = 設定タブを開くパスワードの SHA-256（大文字にそろえた値）。空なら設定タブは鍵なし（農場の判断）
   ・brand      = 題名（ビルド時に index.html / manifest も同じ題名にそろえる）
   ・copyright  = 権利表記（mode:'hide' の農場には出さない。このアプリには今は表記画面なし） */
window.TENANT = {
  id: 'default',
  sheetUrl: 'https://script.google.com/macros/s/AKfycbxFqIag1AwnT6WTaWlAf8Gb2Mh-JZRRB07DTrE6MAQLhyRIqZuwIsuMsWX-OaoxdvzP/exec',
  cfgPwSha256: 'a3b0ea552515e139ee6af5b6a9a09419b93d3a9806299657fc123a537ad5682a',
  brand: { title: 'HSS 実技試験 V2' },
  copyright: { mode: 'show' }
};
