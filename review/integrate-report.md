# 肥育向け新5作業 統合レポート（差し戻し反映・v36）

## 反映内容
- 5作業（patrol-check / water-check / vent-temp / vent-controller / density-grouping）を最新下書きで final-*.json に置換。
- vent-controller の weekly-review から「最高最低温度計」を除去（kanten・L3・L4、4言語）。最高最低温度計は vent-temp read-temp のみ。
- water-check: season-record を「点検結果の記録と予備品」に絞り、kanten を季節非依存に。freeze-outage の kanten に「季節外は口頭で最初の行動を聞く」。flow-measure と water-first の併用禁止は評価者メモに記載。
- patrol-check: mark-followup L4 を「前日に印を付けた豚を翌日確かめて報告した記録（日報・連絡）を示せる」に（4言語）。
- sw.js CACHE と js/config.js APP_VER を v35 から v36 に更新（smoke.js の CACHE 上げ忘れ検査に対応）。

## ビルド・テスト（実測）
- python3 build_data.py: OK: 49 works / 245 aspects
- node gas/build_gas.js: Code.gs: works=53
- node smoke.js: OK 44 / NG 0
- node smoke-audit.js: OK 143 / NG 0
- node smoke-sheet.js: OK 1056 / NG 0
- node gas/test_gas.js: OK 135 / NG 0
- node tests/tenant-isolation.test.js: 37 passed / 0 failed

## 機械チェック（tools/check_fin_works.py --from-works-v2）
- 対象: 5作業 / 25種目。NG 0 件。
- 判定範囲: G2 件数・G3 id重複・G4 母豚語・G5 vi の \bheo\b・G6 〜・G7 数値の根拠照合・G8 4言語の数値一致・G9 根拠行の実在・G10 段階の定型句と字数・G11 名前の長さ・G12 作業名重複・G13 kanten 類似度・G25 農場名/人名。
- 既存種目との kanten 2-gram Jaccard 最大 0.228（基準 0.5 未満）。同一作業内は 0.4 未満。
- 検査の効き: 数値 77・vi の heo・ja の母豚を混ぜた複製では G4/G5/G7/G8 の 4 件を検出（exit 1）。
- G7 は根拠行の実ファイル行と根拠メモ本文の両方から数値を探す。


---

# 差し戻し反映（第2回・v37）

## 反映内容
- 5作業の指摘（major 全件・妥当な minor）を data-work/final-hygiene.json / final-facility.json に反映（4言語そろえ）。一覧と理由は review/fin-works-breaker-log.md と review/vet-review-fin-works.md。
- smoke-audit.js に [Q] を追加（新5作業×「カード5枚」「4言語で空文字0・要素数一致」＋pageerror 0 の11件）。
- review/vet-review-fin-works.md・review/fin-works-breaker-log.md を新規作成。overlap.md・evaluator-notes.md・sources.md を更新。
- sw.js CACHE と js/config.js APP_VER を v36 から v37 に更新（同値）。

## 版の経緯（G21）
着手時（ship-fin 完了 5324896）は v34。新5作業の初回コミットで v35、差し戻し1回目で v36、今回（差し戻し2回目）で v37。計画書の「+1」は「公開前の差し戻しごとに版を上げ、sw.js と config.js が同値」と読み替える（smoke.js に CACHE 上げ忘れ検査があるため、works-v2.js が変わるたびに上げる）。

## ビルド・テスト（実測・1本ずつ単独実行）
- python3 build_data.py: OK: 49 works / 245 aspects
- node gas/build_gas.js: Code.gs: works=53
- python3 tools/check_fin_works.py --from-works-v2: NG 0（既存との最大 Jaccard 0.243）
- node smoke.js: OK 44 / NG 0
- node smoke-audit.js: OK 154 / NG 0（前回 143 + 新規 11）
- node smoke-sheet.js: OK 1056 / NG 0（初回の実行は Node 例外で終了、他セッションの node が同時に走っていた時間帯。単独で再実行して通った）
- node gas/test_gas.js: OK 135 / NG 0
- node tests/tenant-isolation.test.js: 37 passed / 0 failed
- smoke-audit の Timeout は、同時刻に別セッションのブラウザテストが走っている時に起きる。待機条件ではなく Chrome 起動の競合と判断（今回は競合なしで 154 件完走）。

## 反映しなかった指摘と理由
- patrol-check: safe-quiet の en 名称・「壁際」の訳（語感のみ）／kanten_id・levels_id[4]／report-template の id 名称（意味が合っている）／L2 の欠落を1つに特定（計画 §2 の L2 定型）／urgency-judge か report-template のどちらかを落とす案（どちらも既存に無い観点）／同時選択を避ける注記をプリセット定義側へ入れる案（presets.json は G18 で変更不可。overlap.md に記録）。
- water-check: flow-measure 夏の1.0L/分基準の食い違いは社長判断へ（本文は1.0を下回るものを報告）／season-record の括弧内の例示削除（季節の観点を観察できる形にするため残す）／height-fit L5 の「肩より少し上」を L3 に移す案（定規で測る手順が資料に無い）／水質の飲水投薬は資料不足／water-first 側の流量テスト削除（final-feeding.json は G18 で変更不可）。
- vent-temp: 夏の冷却種目の追加（5種目の範囲外・社長判断）／Gemini 指摘のうち資料に無い外部知識（短絡気流・厳冬期の凍死・LOTO・温度計のリセット）／read-temp の観察可能性（評価者メモに口頭確認と明記）。
- vent-controller: 復電後の設定再確認・アラーム（資料に記述なし。vet-review に提案として記録）／read-record の ヒーター以外の根拠追記は不要。
- density-grouping: 区分を facility から変える案（G18/G19・社長判断）／暗い時間の移動の安全記述（資料に無い）／en/id/vi の軽微な語の揺れ（意味は一致）。
- 全体: 低重度の「375px 幅の実機確認」（ブラウザの実機計測は今回も未実施。smoke-audit の空文字検査までで、折り返し行数の実測はしていない）。

## 未完了（正直に）
- G22: 直した文の gemma 逆訳の再実行は未実施（直した約60文の「意味が違う」0件は未確認）。
- G23: review/vet-review-fin-works.md は反映担当が付けた○×。独立した獣医レビュー（opus）の再審査は未実施。
- G24: breaker の2周目（修正後の再攻撃）は未実施。最終周の赤0はまだ言えない。
- G26: quality-evaluator の再採点は未実施。
