# 指示書: 種目のシート編集・受験者別/農場別タブ・日付書式（2026-11-04）

目的: 社長がスプレッドシートだけで「5種目の文言」を直せ、約80名の進み具合と成績を1人1行・農場1行で読める状態にする（再公開なし・既存の記録と規則を壊さない）。

対象: `/Users/okadashoichi/pig-farm-evaluation-v2`（GitHub Pages 本番・バニラJS PWA＋GAS）。
禁止: git commit / push / clasp push / デプロイ（メインが行う）。`works-v2.js`・`gas/Code.gs`・`gas/deploy/Code.js` の直接編集。`gas/deploy/Seed.js` の内容を他所へ書き写すこと。

---

## 0. 版・共通
- GAS: `CODE_VERSION = '2026-11-04a'`。`API_CAPABILITIES` に `'roster.aspects'`・`'summary.persons'` を**追加**（既存は残す）
- アプリ: `sw.js` の `CACHE` と `js/config.js` の `APP_VER` を **`jitsugi-v2-v44`** にそろえる
- `js/contract.js` の `GAS_REQUIRED_CAPS` / `GAS_MIN_VERSION` は**変えない**（古い GAS でも従来どおり動く）
- テストコマンド（PW_CHANNEL は付けない）:
  ```
  cd /Users/okadashoichi/pig-farm-evaluation-v2 && node gas/build_gas.js && node gas/test_gas.js \
   && PW_PATH=~/anpi-kakunin/node_modules/playwright node smoke.js \
   && PW_PATH=~/anpi-kakunin/node_modules/playwright node smoke-sheet.js \
   && PW_PATH=~/anpi-kakunin/node_modules/playwright node smoke-audit.js \
   && PW_PATH=~/anpi-kakunin/node_modules/playwright node smoke-aspects.js
  ```
- 変更前の基準: test_gas.js OK 135 / NG 0、smoke.js OK 44 / NG 0。smoke-sheet.js・smoke-audit.js は変更前の OK 数を控えてから着手（減らさない）

## 1. 分担（同じファイルを2人で触らない）
| 担当 | ファイル | 使うモデル |
|---|---|---|
| **GAS 担当** | `gas/Code.src.gs`、`gas/build_gas.js`、`gas/test_gas.js`、`gas/README.md` | sonnet-fixer（test_gas.js の定型ケース追加は gemma 可） |
| **アプリ担当** | `js/data.js`、`js/sync.js`、`js/app.js`、`js/ui.js`（必要時）、`js/i18n.js`、`js/contract.js`（コメント・契約の文のみ）、`js/config.js`、`sw.js`、**新規** `smoke-aspects.js`、`README.md` | sonnet-fixer（i18n 4言語の文言は gemma） |
| 検証 | sonnet-breaker（わざと壊す）＋ quality-evaluator（採点）。Gemini は使わない（社員名・農場名を含む） | |
| 最終判断 | fable-planner | |

- 両者が守る契約（§2 の JSON）が唯一の接点。GAS 担当は `js/data.js` を読んでよいが書かない。アプリ担当は `gas/Code.src.gs` を読んでよいが書かない
- `gas/test_gas.js` は `works-v2.js`＋`js/data.js`＋`js/contract.js` を Node で `new Function` 読み込みする。**アプリ担当は data.js に `window`/`localStorage`/`document` をトップレベルで参照する行を足さない**（既存の `typeof WORKDATA_V2==='undefined'` ガードのみ可）

## 2. 契約（JSON の形）— 両担当が従う
### 2-1. GET `?action=roster`（既存の応答に `aspects` を足す）
```json
{ "ok": true, "version": "2026-11-04a", "capabilities": ["…", "roster.aspects", "summary.persons"],
  "roster": [...], "done": [...],
  "aspects": [
    { "w": "feeding-daily", "a": "amount", "name": "給与量の管理", "kanten": "…", "lv": ["", "レベル2の新文", "", "", "レベル5の新文"] }
  ] }
```
- `w`=作業ID（WORKDATA_V2.works[].id）、`a`=種目ID（aspects[].id）。**この2つで種目を特定**（行位置・種目名は使わない）
- `name`・`kanten`・`lv` は**変える欄だけ**付く（キーが無い＝変えない）。`lv` が付く時は長さ5の配列、`""`＝その段階は変えない
- 載るのは「反映列が TRUE」かつ「空欄でない」かつ「埋め込みカタログの ja 原文と違う」欄だけ。その結果 変える欄が1つも無い行は配列に入れない
- 文字列は前後空白を除き、`\u0000-\u0008\u000B\u000C\u000E-\u001F` を除去。長さ上限: name 120 / kanten 600 / lv の各要素 600（超過は切る）。改行は残す
- カタログに無い `w`/`a` の行は無視。1応答の要素数 ≤ カタログの種目数（245）
- **`aspects` キーを付けない**のは「種目タブの読み取りで例外が出た時」だけ（`done` と同じ扱い）。種目タブが無い・反映が0行なら **`aspects: []`**
- 古い GAS（capability 無し）: `aspects` キー自体が無い → アプリはカタログ原文のまま

### 2-2. アプリ側の解釈（アプリ担当）
- `aspects` が**配列** → その内容を端末に保存して適用（`[]` なら上書き無し＝原文に戻す）
- `aspects` が**無い**（古い GAS・読み取り失敗）→ **前回保存した上書きを保持**（消さない）
- 要素の検証: `w`/`a` が文字列でカタログに存在、`name`/`kanten` は `String()` で 2000 字以内、`lv` は配列長5。不正な要素は捨てる

### 2-3. POST submit（変更なし）
- `toPayload()` は従来どおり `a.name` を送る。`a.name` は上書き適用後の値なので、**上書き後の種目名が「種目」列に入る**（コードを変えず結果として成立。契約コメントに明記）

## 3. GAS 担当の設計（`gas/Code.src.gs`・`gas/build_gas.js`）
### 3-1. 埋め込み（build_gas.js）
- 既存の `/*__WORKS__*/[]` は**そのまま**（作業一覧タブ・プルダウンの形を変えない）
- 新たに `/*__CATALOG__*/{}` を置き、`{works:[{id,no,name,cat,aspects:[{id,name,kanten,levels:[5]}]}], presets:[{id,name,works:[workId…]}]}` を埋め込む（**ja のみ**。en/vi/id は入れない）
- `console.log` に `aspects=245` を出す

### 3-2. 「種目」タブ（`ASPECT_SHEET = '種目'`）
| 列 | 見出し | 中身 | 編集 |
|---|---|---|---|
| A | 作業No | カタログの no（無ければ空） | 不可（警告つき保護） |
| B | 作業名 | カタログの name | 不可 |
| C | 作業ID | `w` | 不可（キー） |
| D | 種目ID | `a` | 不可（キー） |
| E | 種目名 | ja 原文を初期投入 | **可** |
| F | 観点 | ja 原文 | **可** |
| G〜K | Lv1〜Lv5 | ja 原文 | **可** |
| L | 反映 | チェックボックス（初期 FALSE） | **可** |
- `ensureAspectSheet_()`（setup から呼ぶ・冪等）: タブが無ければ作る（見出し・固定2行・A〜D に `protect().setWarningOnly(true)`＝try/catch で囲む）。既存行は**上書きしない**。(C,D) の組がカタログにあってシートに無い行だけ**末尾に追記**。シートにあってカタログに無い行は触らない。L 列に `requireCheckbox()` の入力規則。E1 の見出しメモに使い方（「反映にチェックした行の、原文と違う欄だけがアプリに出る」「種目は5つ固定・ID は変えない・行の追加削除はしない」）
- `readAspectOverrides_()`: §2-1 の配列を返す。`getValues()` で読み、`L === true` の行だけ、E〜K をカタログ ja と比較して差分だけ載せる
- `doGet(roster)`: `try { res.aspects = readAspectOverrides_(); } catch (e) { /* 付けない */ }`
- `isReserved_()` に `種目`・`受験者別（自動）`・`農場別（自動）` を追加（評価者タブ名と衝突させない・評価者タブ扱いしない）

### 3-3. 受験者別（自動）・農場別（自動）— **GAS が値を書く（式ではない）**
理由: (1) 区分名→作業一式・（農場共通）行・旧名・同名2農場の規則は既に GAS/アプリにあり、式で再現すると壊れやすい (2) `test_gas.js` のモックは式を計算できず数値で検証できない (3) 1人の作業数が人ごとに違い列が可変。
更新のタイミング: **setup / submit 後 / delete 後 / 管理入口 `?action=admin&token=…&op=persons`（setup せず表だけ）**。submit/delete では `try/catch` で囲み、失敗しても書き込み・削除の応答は変えない。名簿（受験者タブ）を手で直した直後は次の送信か op=persons で更新（gas/README に明記）。任意: `onOpen()` でメニュー「HSS実技 → 受験者別・農場別を更新」（`SpreadsheetApp.getUi()` を try/catch）。
- 自動更新の上限 `PERSON_AUTO_MAX_ROWS = 20000`（評価者タブの合計行がこれを超えたら submit/delete では作り直さず、op=persons だけ）
- タブの所有: 文書プロパティ `HSS_PERSON_TAB_ID` / `HSS_FARM_TAB_ID`。同名で所有でないタブがあれば `skip`（集計（自動）と同じ規則）。タブが無い時に作るのは setup/op=persons だけ

**データの集め方 `collectAdopted_()`**: 台帳（`evalTabIds_`）の評価者タブ全行 → やり直し元（O列）に書かれた記録IDの行を除く（＝採否「採用」と同じ規則）→ `[{id,date,name,farm,work,aspect,score}]`（score は 1〜5 の数値だけ）。
**人の特定 `personOf_(name, farmAtRecord, rosterRows, cols)`**（P列・`checkSummary_().want` と同じ優先順。`want` もこの関数に寄せる）:
1. 被評価者＝name かつ 農場＝farm の行 → 2. 被評価者＝name の最初の行 → 3. 旧名列を「、,，/／;；改行」で区切った**完全一致**に name を含む最初の行 → 4. 無し＝**名簿外**
比較は `findDups_` と同じそろえ方（名前 `nk`=NFC＋空白1つ、農場 `nf`=NFKC＋空白除去）。（農場共通）行は候補にしない。
**予定作業 `plannedWorks_(row)`**: 作業1〜N のセルを `resolveWorkCell_()`（ID完全一致 → 名前完全一致 → NFKC 正規化名 → No. → 区分名（括弧除去）→ 作業一式）で作業IDへ。全セル空なら同じ農場の（農場共通）行の作業。解決できないセルは原文のまま「?原文」として未採点に出す。
**記録の作業**: 作業列（ja 名）も `resolveWorkCell_()` で ID に（作業名が変わっても一致）。

**受験者別（自動）** 1行目=説明＋`更新 yyyy-MM-dd HH:mm:ss`、2行目=見出し、固定2行、3行目〜=名簿順（受験者タブの行順・共通行と空名は除く）:
| 列 | 見出し | 定義 |
|---|---|---|
| A | 農場 | 受験者タブの農場 |
| B | 被評価者 | 受験者タブの名前 |
| C | 予定作業数 | 予定作業（展開後）の数 |
| D | 採点済み数 | 予定作業のうち採用行に点が1つ以上ある数 |
| E | 未採点の作業 | 予定作業で採点が無いもの（作業名を「、」区切り。?原文 も含む） |
| F | 予定外の作業 | 採点はあるが予定に無い作業名 |
| G | 全体平均 | その人の採用行の全スコア平均（小数2桁。評価者タブの「セッション平均」と同じ数え方） |
| H | 最終評価日 | 採用行の評価日の最大（`yyyy-mm-dd` 書式） |
| I〜 | 作業1, 平均1, 作業2, 平均2, … | 予定作業の順に 作業名／その作業のスコア平均（未採点は空）。対の数 K = max(8, 最大予定作業数)。予定外の作業は含めない |
- 名簿のどの行にも当たらない記録は、人の行の後ろに **A列「名簿外」**・B列「名前（記録時の農場）」で1人1行（捨てない）
- 書く文字列は全て `safe_()`。`clear()` → 一括 `setValues()`（行ごとに書かない）

**農場別（自動）** 1行目=説明＋更新日時、2行目=見出し、3行目〜。順番＝農場一覧タブの順 → 名簿にだけある農場 → 所属未確定を最後:
| 列 | 見出し | 定義 |
|---|---|---|
| A | 農場 | |
| B | 受験者数 | 名簿の人数（共通行除く） |
| C | 全作業済み | 採点済み数＝予定作業数（予定0の人は数えない）の人数 |
| D | 一部済み | 1 ≤ 採点済み数 < 予定作業数 |
| E | 未採点 | 採点済み数 = 0 |
| F | 平均 | 農場の採用行の全スコア平均（小数2桁） |
| G | 採点済み/予定 | `37/80` の形（作業数の合計） |

### 3-4. R4 日付書式（`buildSummary_`）
- 集計（自動）の `B3:B` に `setNumberFormat('yyyy-mm-dd')`、`N3:N` に `'yyyy-mm-dd hh:mm:ss'`（式を置いた直後）。受験者別の H列も同様
- test_gas.js のモックに `setNumberFormat`（`nf['r,c']` に記録）・`requireCheckbox`・`protect`（no-op）を足す

### 3-5. gas/README.md（GAS 担当）
- 「種目タブの使い方（社長向け）」: 直す → 反映にチェック → 評価者は「名簿を更新」か3分待つ。戻すには原文を貼り直すかチェックを外す。種目名を試験の途中で変えると評価者タブの「種目」列が新旧で割れる（作業単位の集計は影響なし）→ 種目名は試験前に、期間中は観点・レベル文だけ推奨
- 「受験者別タブの見方」「農場別タブの見方」: 列の定義（上表）・いつ更新されるか・手で直さない・自分の表は別タブで `'受験者別（自動）'!A2:…` 参照
- 「集計（自動）の日付が数字に見える時」: setup を再実行
- CODE_VERSION・capabilities・op=persons を追記

## 4. アプリ担当の設計
### 4-1. `js/data.js`（純粋関数・ストレージに触らない）
- `applyAspectOverrides(list)`: 全作業の全種目について、初回に `a.orig = {name, kanten, levels:[…]}` を控え、まず `orig` に戻し、`a.ov = null` にする。次に `list` の各要素を検証して適用: `a.name`/`a.kanten`/`a.levels[i]` を書き換え、`a.ov = {name:bool, kanten:bool, levels:[bool×5]}` に印。戻り値＝適用した要素数。同じ list を2回適用しても結果が同じ（冪等）
- `loc(o,f)`: `o.ov && o.ov[f]` なら言語に関係なく `o[f]`（上書きした欄は en/vi/id でも日本語＝古い訳を出さない）。それ以外は従来
- `locLevels(o)`: 翻訳配列を取った後、`o.ov.levels[i]` が true の段階だけ `o.levels[i]` に差し替えた新しい配列を返す
- `aspectOverrideCount()`: 今適用中の要素数（設定タブ用）
- 上書きの文字列は**データとして保持するだけ**。描画は `ui.js` の `esc()` を通る既存経路（`it.name`/`it.kanten`/`it.levels[]`・履歴 `loc(a,'name')`・CSV・グラフ `trunc(loc(a,'name'))`）を**全て確認**し、HTML に素で入る箇所が無いことを smoke で示す

### 4-2. `js/sync.js`
- `fetchRoster()`: `j.aspects` が配列なら検証して `ROSTER_KEY`（`jitsugi_v2_roster`）の保存物に `aspects` として入れる。配列でない（キー無し）時は `prev.aspects` を引き継ぐ。`keptEmpty` の分岐も同じ。保存後 `applyAspectOverrides(aspects)`
- `loadAspectOverrides()`: 起動時に `ROSTER_KEY` を読み（`url` が今の送信先と違えば無視＝`getRoster()` と同じ規則）`applyAspectOverrides(r.aspects||[])`。`sync.js` 末尾で1回呼ぶ（`works-v2.js`・`data.js` の後なので安全）
- `setSheetUrl()` で名簿を捨てる時は `applyAspectOverrides([])` も行う
- **新しい localStorage キーは作らない**（名簿と一緒に `jitsugi_v2_roster.aspects`。README の表に1行追記）

### 4-3. `js/app.js`
- `reloadRoster()`（前面・裏どちらも）: 適用結果の指紋（`JSON.stringify(aspects)`）が前回と違い、かつ画面に採点済みカード（`#cards .ec.scored`）が**1枚も無い**時だけカードを描き直す。採点途中なら画面はそのまま、次に人を選んだ時から新しい文言（規則を README に書く）
- `renderVer()`: `… / 種目上書き N件` を末尾に足す（N=`aspectOverrideCount()`。0 なら出さない）。i18n キー `ovCount`（ja/en/vi/id）
- `js/contract.js`: 冒頭コメントに `aspects` の形（§2-1）・capability `roster.aspects`・`summary.persons`・「toPayload は上書き後の名前を送る」を追記。`GAS_REQUIRED_CAPS` は変えない

### 4-4. `smoke-aspects.js`（新規・Playwright・GAS はモック。smoke-sheet.js の作法を踏襲）
モックの roster 応答に `aspects` を入れ、次を検査（テスト名は合格条件 §5 と一致させる）:
- A1 上書きした種目名・観点・Lv文がカードに出る（`#enm-…`・`.crit-k`・`.crit-lv`）
- A2 `<b>x</b>` を含む上書き文が**文字のまま**表示され、`document.querySelector('#cards b')` の数が増えない
- A3 vi に切り替えても上書きした欄は日本語、上書きしていない欄（同じ作業の別種目）は vi のまま
- A4 保存して POST された `record.works[].items[].aspect` が上書き後の名前
- A5 `online=false` で `page.reload()` しても上書きが出る（`localStorage.jitsugi_v2_roster.aspects` に保存）
- A6 次の roster 応答が `aspects: []` → 名簿を更新 → 原文に戻る
- A7 capability も `aspects` キーも無い旧 GAS の応答 → 原文のまま・エラー無し（`pageerror` 0）
- A8 設定タブの版行に `種目上書き N件`
- A9 採点途中（1枚だけ点を付ける）で裏の名簿更新が来ても、そのカードの文言と点は変わらない

### 4-5. `README.md`（アプリ担当）
- 「種目タブで文言を直す（社長向け）」: 流れ・反映までの時間（前面に戻った時/3分ごと/「名簿を更新」）・オフライン端末は次に電波が入った時・上書きした欄は4言語とも日本語
- 「受験者別タブの見方」は gas/README.md へのリンク＋3行要約
- localStorage の表に `jitsugi_v2_roster` の `aspects` を追記。テストコマンドに `smoke-aspects.js` を追加。版 v44

## 5. 合格条件（1文1条件・コマンドかテスト名で判定）
| # | 条件 | 判定 |
|---|---|---|
| C1 | `node gas/build_gas.js && node gas/test_gas.js` が **NG 0** で、OK 数が **135 + 新規 ≥ 14** | 出力末尾の `合計:` |
| C2 | test_gas.js「R1 setup: 種目タブ=見出し1行+245行・A〜D がカタログ・L 列は FALSE」が OK | テスト名 |
| C3 | test_gas.js「R1 roster: 反映=TRUE かつ原文と違う欄だけ aspects に載る（lv は長さ5・未変更は空文字）」が OK | テスト名 |
| C4 | test_gas.js「R1 roster: 反映=FALSE の行・空欄・原文と同じ欄は載らない」が OK | テスト名 |
| C5 | test_gas.js「R1 setup 再実行: 編集済みの行を上書きせず、無い種目だけ末尾に追記」が OK | テスト名 |
| C6 | test_gas.js「R1 契約: applyAspectOverrides 後の toPayload を doPost に通すと 種目列が上書き後の名前」が OK（APP ハーネスに data.js の `applyAspectOverrides` を使う） | テスト名 |
| C7 | test_gas.js「R2 受験者別: 名簿順1人1行・予定/採点済み/未採点/全体平均/最終評価日/作業ごとの平均」が OK | テスト名 |
| C8 | test_gas.js「R2 受験者別: やり直し前の行を数えない・旧名/所属未確定→確定/同名2農場の振り分けが checkSummary_ と同じ・区分名は作業一式・共通行を使う・名簿外は末尾」が OK（1本でも分割でも可、全て OK） | テスト名 |
| C9 | test_gas.js「R2/R3 更新: submit・delete・setup・op=persons のたびに更新日時が進む／同名の管理者タブは触らない」が OK | テスト名 |
| C10 | test_gas.js「R3 農場別: 受験者数・全作業済み・一部済み・未採点・平均・採点済み/予定」が OK | テスト名 |
| C11 | test_gas.js「R4 集計（自動）B列=yyyy-mm-dd・N列=yyyy-mm-dd hh:mm:ss の書式」が OK | テスト名 |
| C12 | test_gas.js「R2 速度: 94名×8作業×5種目の評価者行で buildPersonTables_ が Node 上 3 秒以内」が OK | テスト名（`Date.now()` 差） |
| C13 | `PW_PATH=~/anpi-kakunin/node_modules/playwright node smoke-aspects.js` が **NG 0** で A1〜A9 全て OK | 出力 |
| C14 | `smoke.js`・`smoke-sheet.js`・`smoke-audit.js` が全て **NG 0** で、OK 数が変更前以上（smoke.js は 44 以上） | 出力 |
| C15 | `grep -c "jitsugi-v2-v44" sw.js js/config.js` がそれぞれ 1、`grep -c "2026-11-04a" gas/Code.src.gs` が 1、`grep -c "roster.aspects" gas/Code.src.gs js/contract.js` がそれぞれ ≥ 1 | コマンド |
| C16 | `TENANT_CFG_PASSWORD=testpass123 node tools/build-tenant.mjs <tenants/ にある既存 id> --out <scratchpad>/dist-t` が `OK` で終わる（埋め込みカタログに固有名が無い） | コマンド |

## 6. 検証方法（C 検証担当＝sonnet-breaker が行う。全緑は根拠にしない）
- **わざと壊す**: 種目タブの E 列に `=HYPERLINK("x")`・`<img onerror=alert(1)>`・5000字・改行入り・全角空白だけ を入れて roster → アプリのカードで文字のまま／空白だけは「変えない」扱い。種目ID を手で書き換えた行 → 無視される。行を手で消す → setup で末尾に戻る。L 列に文字列 `"TRUE"` → 仕様どおり（boolean true のみ採用か、文字列も採用かを README に書いてテストで固定）
- **古い GAS**: smoke-aspects A7。`gasMissing()` が `roster.aspects` を要求しないこと（`GAS_REQUIRED_CAPS` の差分が無い）
- **同名・旧名**: test_gas の既存 Z20-2 の名簿（テスト Hoang Nam／旧名／テスト Nam）をそのまま R2 に流し、P列の `want()` と同じ farm になる
- **やり直し**: redoOf 付きの記録を送った後、受験者別の平均が最新回だけになる・前回の作業も消えない
- **速度**: smoke-sheet.js の 94 名名簿（2011 行付近の架空名）を流用して評価者行 3,760 行で C12
- **壊した入力はコピーで**（symlink 事故 10-14）。本番シート・本番 GAS には触れない
- 評価（quality-evaluator）: 合格条件 C1〜C16 を1つずつ「OK/NG＋根拠の出力行」で採点。NG が1つでもあれば差し戻し（継ぎはぎ禁止・2回不合格で Sonnet が最初から書き直す）

## 7. リスクと対策
| リスク | 対策 | 判断 |
|---|---|---|
| 試験期間中に種目名を変えると評価者タブ「種目」列が新旧で割れる（種目別のピボットがずれる） | R2/R3 は**作業単位**で集計するので影響なし。README に「種目名は試験前に。期間中は観点・レベル文だけ」。種目ID は不変なので後から名寄せ可能 | **社長判断**: 期間中の種目名変更を許すか |
| 端末ごとに反映時刻がずれる（オフライン端末は旧文言のまま） | 文言は採点基準の説明であり点数の形は不変。README に「変えたら評価者に『名簿を更新』を頼む」 | — |
| 80名×8作業で submit ごとに受験者別を作り直す時間（ロック保持が延びて `busy`） | 一括 read/一括 write・`PERSON_AUTO_MAX_ROWS` で自動更新を止める逃げ道・op=persons で手動。C12 で上限を固定 | — |
| GAS 実行時間制限（6分）・Code.gs が +約120KB | 現状の規模では秒単位。clasp push の上限内（確認は メイン が push 時に行う） | — |
| 受験者別の人の特定が P列と食い違う | `personOf_` を1本にし `checkSummary_` もそれを使う。既存テスト Z20-2 の名簿で突合（C8） | — |
| テナント版（他農場）: 埋め込みカタログ・種目タブ・受験者別は各農場の GAS に入る | `build-tenant.mjs` は Code.gs をそのまま使うので追加作業なし。固有名スキャンは 0 件（確認済み）。C16 で固定。tenant-config.js・tenants/ は触らない | — |
| 種目タブの文言が数式として動く | シートに書くのは GAS でなく社長（入力時点で Sheets が式化する可能性）→ 読む側は `getValues()` の文字列として扱い、アプリは esc。評価者タブへは `safe_` 経由 | — |
| 受験者別に評価者名を出していない | 要望に無いので出さない | **社長判断**: 評価者名の列が要るか |
| onOpen メニュー | 任意実装。モックで `getUi` が無くても落ちないこと | **社長判断**: 要るか（無ければ op=persons のURLを控える） |

## 8. 完了報告の形（haiku-reporter → fable-planner）
結論（採用可否）／根拠（C1〜C16 の OK/NG と出力行・各テストの合計行）／リスク（§7 のうち残るもの）／判断してほしい点（§7 の社長判断 3 件）。
