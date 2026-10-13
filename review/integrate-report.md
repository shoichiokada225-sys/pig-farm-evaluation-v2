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
