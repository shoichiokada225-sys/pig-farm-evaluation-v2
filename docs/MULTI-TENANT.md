# 他農場に出す手順（マルチテナント）— HSS実技試験V2（pig-farm-evaluation-v2）

第2弾契約書 `~/ottlink-docs/multitenant/r2/CONTRACT-R2.md`（2026-10-07）の対応。

## 方式
**キット方式（静的アプリ）＋農場ごとに専用の GAS・スプレッドシート**。
記録はすべて「その農場専用の GAS ウェブアプリ（＝その農場のスプレッドシート）」へ送る。農場の差し替え口は `tenant-config.js`（`window.TENANT`）1か所。
農場別の配布物 `dist/<id>/` をコマンド1本で作る。農場Aと農場Bは別の GAS・別のシート・別の合言葉（`APP_TOKEN`）なので、A の端末・管理者は B の名簿・記録を読めず書けない（テナントの確定は GAS 側＝合言葉）。

| 項目 | 既定（ヒラノ版・何も指定しない） | 他農場の配布物 |
|---|---|---|
| 記録先（GAS の URL） | `tenant-config.js` の既定＝今までの `SHEET_URL` と同じ | `tenants/<id>.json` の `sheetUrl` |
| 設定タブのパスワード | 今までの OOIRI（大文字小文字を問わない）。画面側は平文でなく SHA-256 のハッシュと照合 | 環境変数 `TENANT_CFG_PASSWORD` から作ったハッシュ（平文は残らない）。鍵なしにするなら json に `"cfgLock": false` と明記 |
| 端末への合言葉（GAS の `APP_TOKEN`） | 配布リンク `…/#k=合言葉`（既存の仕組み） | 同じ。**配布物には埋め込まない**。農場の担当者に1人ずつリンクで渡す |
| 題名・出典の文 | HSS 実技試験 V2・睦沢の出典表記 | `brand.title`・出典文の農場名は中立の文に置換 |
| 権利表記 | このアプリに表示なし（`copyright.mode`） | 既定 `hide` |
| 版名 | `jitsugi-v2-vNN` | `jitsugi-v2-vNN-<id>`（SW の CACHE と APP_VER を同じ値で農場別に） |

## 新しい農場を1つ追加する（コマンド1本）
1. （1回だけ）その農場の Google アカウントで空のスプレッドシートを作り、拡張機能→Apps Script に `node gas/build_gas.js` で生成した `gas/Code.gs` を貼る。**スクリプトプロパティ**に `APP_TOKEN`（8文字以上）と `ADMIN_TOKEN`（16文字以上）を入れる（コードに書かない）。ウェブアプリ「全員」で公開 → `/exec` URL を控える → 関数 `setup` を1回実行（受験者・農場一覧・作業一覧・集計タブができる）。名簿は受験者タブに入れる（社員名は公開リポに置かない）。
2. `cp tenants/demo-farm.json tenants/<id>.json` して `id`・`brand.title`・`sheetUrl` を書く。
3. `TENANT_CFG_PASSWORD='<設定タブのパスワード>' node tools/build-tenant.mjs <id>`
   （または git に入れない `tenants/<id>.secret.json` に `{"cfgPassword":"…"}`）
4. `dist/<id>/` を**その農場専用のホスティング**（農場ごとに別オリジン）に置き、配布リンク `https://<農場のURL>/#k=<APP_TOKEN>` を担当者に渡す。

ビルドは出力に「ヒラノの送信先・パスワードのハッシュ・OOIRI・睦沢/ヒラノ/大田原/多古の固有名」が1つでも残ると失敗して `dist/<id>/` を消す。
ヒラノの送信先・パスワードを他農場に指定するとビルドが止まる。ビルドは本番へ何も送らない。

## GAS 側の変更（リポ内の `gas/Code.src.gs` → `node gas/build_gas.js` で `Code.gs`・`deploy/Code.js` を再生成済み。本番 GAS は未反映）
- 合言葉は**スクリプトプロパティ（`APP_TOKEN`・`ADMIN_TOKEN`）が優先**。無ければ従来どおり git 管理外の `Seed.js` の値（既存のヒラノの GAS はそのまま動く）。
- **総当たり対策**: 合言葉（`APP_TOKEN`・管理入口の `ADMIN_TOKEN`）の間違いが10分に30回を超えると、10分間は正しい合言葉でも `auth`／`forbidden` を返す（GAS は接続元 IP を見られないためスクリプト全体で数える）。合言葉なし運用（`APP_TOKEN` が短い・無い）のときは何も変わらない。`ping` は合言葉なしのまま。
- 反映手順（社長作業・任意・URL は変わらない）: `cd gas/deploy && clasp push --force && clasp update-deployment <既存のデプロイID>`（`gas/README.md`）。反映しなくてもアプリは今のまま動く（総当たり対策が効かないだけ）。**本セッションでは clasp push していない**。

## 契約書の合格条件との対応
| # | 条件 | 状態 |
|---|---|---|
| 1 | 農場名・合言葉・秘密が埋め込まれていない | 他農場の配布物は満たす（設定ファイル＋環境変数・ハッシュのみ。ビルドが検査）。リポ内の既定はヒラノ版の現行値（条件6のため）。GAS の合言葉は元から git 外（Seed.js）かスクリプトプロパティ |
| 2 | 農場追加がコマンド1本 | 上の手順 3（GAS とシートの用意は農場ごとの初回作業） |
| 3 | A は B を読めない・書けない | 農場ごとに別 GAS・別シート・別合言葉。別農場の合言葉では名簿も記録も拒否（`gas/test_gas.js`）。配布物にも他農場の値が入らない（`tests/tenant-isolation.test.js`） |
| 4 | 合言葉の入口に回数制限 | GAS に追加（上記）。設定タブのパスワードは端末内のゲート（サーバ側ではない） |
| 5 | 権利表記の出し分け | このアプリに権利表記の表示は元からない。`copyright.mode` は将来のための口だけ |
| 6 | 既定でヒラノの動作が変わらない | 既定の送信先・設定パスワード OOIRI（大文字小文字不問）・題名が今のまま（実描画テスト）。版名のみ v26→v27 |
| 7 | 既存テスト全緑＋分離テスト | `node smoke.js` / `smoke-audit.js` / `smoke-sheet.js` / `gas/test_gas.js` / `tests/tenant-isolation.test.js` |

## 限界
- 設定タブのパスワードは端末内のハッシュ照合（公開物なので総当たりは端末内では防げない。守るのは GAS の `APP_TOKEN`）。
- 端末内データ（localStorage）はオリジン単位。農場ごとに別オリジンで配ること。
- 作業カタログ（40作業×5種目）はヒラノの現場由来の内容。ビルドは出典表記の農場名だけ中立にする（内容の差し替えは別作業）。
- `gas/deploy/.clasp.json` はヒラノのスクリプトID（秘密ではない）。他農場は自分の GAS を作って別の `.clasp.json` を使う。
