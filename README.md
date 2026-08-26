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
- `index.html` + `styles.css`（V1流用） + `v2.css`（V2追加分） + `js/{util,i18n,data,store,ui,app}.js`（ロード順=依存順）
- レコード形式: `{id,date,evaluator,evaluatee,overall,works:[{workId,workName,category,scores:{aspectId:1-5},comments}]}`
- localStorage: `jitsugi_v2_data`（評価）/ `jitsugi_v2_sel`（選択作業）/ `jitsugi_v2_draft`（下書き）/ `jitsugi_v2_lang`
- テスト: `node smoke.js`（Playwrightは farm-shift-app から借用）

## 関連
- V1: ~/pig-farm-evaluation（豚舎別評価はV1を継続使用）
- 口頭試問: ~/oral-exam-app ／ 筆記: hss-exam-app
- 現場マニュアル: ~/genba-manual → https://genba-manual.vercel.app/
