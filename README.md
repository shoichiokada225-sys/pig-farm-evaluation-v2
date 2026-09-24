# HSS 実技試験 V2（pig-farm-evaluation-v2）

HSS認定制度の実技試験アプリ **V2**。V1（pig-farm-evaluation）の「作業評価」モードを専門化・深化させた後継。

- **作業評価専門**（豚舎別モードなし）
- **複数作業を選んで一括採点**: カテゴリ別チェックボックスで作業を複数選択 → 選んだ全作業の種目が1画面に並ぶ → 1回の保存で1セッション（複数作業の成績）を記録
- **各作業ちょうど5種目**（評価観点）× レベル1〜5基準（要指導/要改善/標準/上回る/模範的）
- 評価項目は**睦沢農場「業務の目的と注意点」**と**現場マニュアル（genba-manual gyomu-src）**に根拠づけ。各作業から genba-manual.vercel.app の該当手順書へ深リンク
- 4言語（ja/en/vi/id）・PWA・オフライン対応・設定タブPW=OOIRI

## V1からの主な変更
| | V1 | V2 |
|---|---|---|
| モード | 豚舎別+作業 | 作業のみ |
| 作業選択 | 1作業ずつ | 複数選択→一括採点 |
| 観点 | 固有2〜3+共通5({work}置換) | 作業固有5種目（汎用文なし） |
| 作業数 | 44 | 40（重複4件を統合） |
| 保存単位 | 1作業=1レコード | 1セッション=複数作業 |

## データフロー（正本）
```
genba-manual/gyomu-src/gyomu_NN.json（手順書=根拠）
        │  エージェント工場: 執筆→敵対的検証→翻訳
        ▼
data-work/final-<cat>.json（カテゴリ別・正本）
        │  python build_data.py（検証つき組立）
        ▼
works-v2.js（const WORKDATA_V2。直接編集禁止）
```
基準を修正するときは `data-work/final-*.json` を直して `python build_data.py`。

## 構成
- `index.html` + `styles.css`（V1流用） + `v2.css`（V2追加分） + `sw.js`（オフライン・版の入れ替え）
- JS の読み込み順（=依存順。index.html の `<script>` と同じ）: `works-v2.js` → `js/config.js` → `util` → `i18n` → `data` → `store` → `person` → `contract` → `ui` → `sync` → `app`
  - `js/config.js`＝送信先 GAS の URL と `APP_VER`（sw.js の `CACHE` と同じ値）
  - `js/store.js`＝記録の読み書き・正規化（`normRec`）・バックアップ
  - `js/person.js`＝**人の特定の正本**（同名・所属未確定・農場名のゆれ・旧名で、どの記録が名簿のどの人か）
  - `js/contract.js`＝**GAS との契約の正本**（操作・要求と応答の形・capabilities・`toPayload`）
  - `js/sync.js`＝名簿の取得・未送信の送信・シートの削除待ち
- 記録の形の正本は **`js/store.js` 冒頭のコメント**（`id, date, evaluator, evaluatee, farm, overall, createdAt, updatedAt?, manual?, sent, sentOnce?, redoOf?, works[]`）。`farm` はシートの農場列の元の値、`redoOf` はやり直しで置き換えた前回の記録ID。形を変える時は旧データも読めるようにする（任意の項目で足す）
- localStorage（端末の保存。**評価データ・削除待ちは消さない**）
  | キー | 中身 |
  |---|---|
  | `jitsugi_v2_data` | 評価の記録（本体） |
  | `jitsugi_v2_deletes` | シートの削除待ち（端末で消した記録。電波が戻ったらシートの行を消す）。**消すとシートに行が残る** |
  | `jitsugi_v2_draft` | 入力途中（採点中の人・やり直しの印を含む） |
  | `jitsugi_v2_sel` | 選んでいる作業 |
  | `jitsugi_v2_roster` | 取得した名簿（＋シートの記録の要約・GAS の版） |
  | `jitsugi_v2_evaluator` | 評価者名 |
  | `jitsugi_v2_sheet_url` | 送信先 GAS の URL（設定タブで変えた時だけ） |
  | `jitsugi_v2_date` | 評価者が自分で選んだ評価日（その日のうちだけ） |
  | `jitsugi_v2_exam_start` | 試験開始日 |
  | `jitsugi_v2_farm` | 最後に開いた農場チップ |
  | `jitsugi_v2_lang` | 表示言語 |
- 生成物（**直接編集しない**）: `works-v2.js`（`python build_data.py` が作る）／`gas/Code.gs`・`gas/deploy/Code.js`（`gas/Code.src.gs` から `node gas/build_gas.js` が作る）。`gas/deploy/Seed.js` は実在の社員名が入るので **コミットしない**（テストは架空名）

## テスト（変更したら4本とも通す）
```
node gas/build_gas.js && node gas/test_gas.js \
 && PW_PATH=~/anpi-kakunin/node_modules/playwright PW_CHANNEL=chrome node smoke.js \
 && PW_PATH=~/anpi-kakunin/node_modules/playwright PW_CHANNEL=chrome node smoke-sheet.js
```
- `gas/test_gas.js`＝GAS の単体テスト（シートをモック。名簿・書き込み・削除・評価者タブの台帳・集計タブ・アプリの `toPayload` を本物の `doPost` に通す契約テスト）
- `smoke.js`＝画面の基本（版の一致・採点・保存・CSV・4言語）
- `smoke-sheet.js`＝名簿・送信・編集・削除待ち・バックアップ・やり直し・複数端末など（シートの GAS は偽物に差し替え）
- Playwright はほかのプロジェクトから借りる（`PW_PATH`。無ければ `~/farm-shift-app/node_modules/playwright`）。`PW_CHANNEL=chrome` は Mac の Chrome を使う指定

## 配布の手順（評価者の端末）
1. 電波の良い所で本番URLを開く
2. **ホーム画面に追加する（必須）**。iPhone=Safariの共有ボタン→「ホーム画面に追加」／Android=Chromeのメニュー（⋮）→「ホーム画面に追加」
   - iOS の Safari は、ホーム画面に追加していないサイトの保存（アプリ本体・未送信の記録・削除待ち）を**7日間使わないと消す**。追加しないと、1週間あけて圏外の豚舎で開いた時に起動しない・未送信の記録が失われる
   - ホーム画面から開いていない時は、入力タブに案内（橙色）が出続ける
3. ホーム画面のアイコンから開き直し、設定タブの末尾で次を確認する
   - `APP jitsugi-v2-vNN`＝この端末で動いている版（本部が「設定の版を見て」と頼めば、修正が届いているか確かめられる）
   - 「端末の保存: 保護されています」（保護されていない時はホーム画面から開き直す）

## 試験当日の運用（評価日・複数端末・やり直し）
- **評価日**: 既定は今日。開いたまま日をまたいだ端末は、前面に戻った時・保存の時に今日へ直して知らせる。評価者が自分で選んだ日付（紙の結果の後入力など）は、その日のうちは人の切替・保存・自動の再読み込みでも保ち、今日でない日付の保存は最初の1回だけ確認する（翌日には持ち越さない）
- **済・途中・残り**: この端末の記録＋名簿と一緒に取ったシートの記録の要約（GAS `2026-09-24e` 以降。`roster.done`）で数える。ほかの端末の分は**名簿を取った時点まで**（2人で1農場を分ける時は、区切りごとに「名簿を更新」）。シートの分は試験開始日から数える（**未設定なら今日の分だけ**＝前回の試験・練習の記録を拾わない）。2日以上に分ける試験・途中で端末を替えた時は、設定で試験開始日を入れる
- GAS が古い（要約を返さない）間は「この端末で採点した分だけ」と名簿の下に出る。その間は **1農場＝1台の端末** で評価する
- 実施済みの人を押すと、やり直しの確認が出る（点数の修正だけなら履歴から編集）。やり直すと「やり直し（前回 M/D）」の印と、作業ごとに ✓済（前回の日付・点）が出る
- **やり直しの記録は前回と区別できる**: やり直しで保存した記録は、置き換えた前回の記録ID（この端末の記録＋シートの要約にある分）を `redoOf` に持ち、シートの評価者タブの **O列「やり直し元」**・CSV の「やり直し元」列に出る（GAS `2026-09-24f` 以降。古い GAS はこの列を書かない）。**採用するのは最新の試行**＝どこかの行の「やり直し元」に書かれた記録IDの行は、集計から除く（シートの「集計（自動）」タブの「採否」列が「やり直し前」の行。gas/README.md「農場別に集計する」）。前回の記録を履歴から削除してもよい（シートの行も消える）

## 更新の出し方（開発者）
- index.html / js / css を変えたら **sw.js の `CACHE` と js/config.js の `APP_VER` を同じ値に上げる**（smoke.js が一致と上げ忘れを検査）
- 新しい版は install で全ファイルそろった時だけ丸ごと入れ替わる（1ファイルでも取れなければ旧版のまま＝新旧が混ざらない）
- 端末は、前面に戻った時と60秒ごとに更新を確かめる。入れ替わった時、採点途中でなければ自動で再読み込み、途中なら「新しい版があります」を出す

## 関連
- V1: ~/pig-farm-evaluation（豚舎別評価はV1を継続使用）
- 口頭試問: ~/oral-exam-app ／ 筆記: hss-exam-app
- 現場マニュアル: ~/genba-manual → https://genba-manual.vercel.app/
