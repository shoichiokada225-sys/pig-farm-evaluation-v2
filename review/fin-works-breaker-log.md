# 肥育向け新5作業 breaker 記録（G24）

破る担当2系統（sonnet-breaker 系・Gemini breaker 系）と、他担当の審査から返った指摘の一覧。再現手順は data-work/final-*.json の該当 levels を読めば再現できるもの（文面の論理）か、smoke-audit/tools の実行で再現できるもの。「反映」は fin-works ブランチで修正済み、「見送り」は理由つき。

（系統欄は指摘の出所の概略。複数の担当が同じ点を挙げたものは1行にまとめた）

## 攻撃一覧（赤＝事故・資料違反・二重採点）

| # | 系統 | 作業/種目 | 重大度 | 再現手順 | 結果 |
|---|---|---|---|---|---|
| 1 | sonnet | vent-temp/fan-failure-first | 赤 | L3「ブレーカー→ベルト→羽根の異物」を読むと電源を切らずに羽根へ手を出す手順に読める | 反映（電源を切り完全停止を確かめてから。4言語） |
| 2 | sonnet | vent-temp/never-stop L5 | 赤 | 「ひとりでは入らない」=2人なら入ってよいと読める（08 L661 は絶対に入らない） | 反映 |
| 3 | sonnet・Gemini | vent-temp/manual-adjust L4 と vent-controller/change-rule L4 | 赤 | 自動制御の農場で両作業を割り当てると同じ行動が満点と減点に分かれる | 反映（手動のみに限定） |
| 4 | sonnet | patrol-check/report-template L4 | 赤 | 連絡の要否を作業者が判断する書き方=上長を通さず獣医へ直接連絡 | 反映 |
| 5 | sonnet | water-check/freeze-outage | 赤 | 水が戻った後の観察が無くても L4・L5 に届く（塩中毒＝23 L324-331） | 反映 |
| 6 | sonnet | water-check/clog-leak と freeze-outage | 赤 | 仮設給水の2種目で二重採点 | 反映 |
| 7 | sonnet | density-grouping/count-record | 赤 | 同じ舎内で豚房Aから豚房Bへ移した頭数を日報の式に入れると二重計上になる | 反映（種目を豚房ごとの頭数に絞った） |
| 8 | sonnet | density-grouping/area-calc | 赤 | 08・16・13 の面積基準が食い違うのに数値を採点基準にした | 反映（数値を外し農場の値） |
| 9 | sonnet | density-grouping/crowd-signs L4 | 赤 | 「兆候の数を記録して比べる」は 08 L775-799 に無い | 反映 |
| 10 | sonnet | patrol-check/urgency-judge | 赤 | 湿った咳+鼻汁・40℃以上が高に無い／突然死を動かさない記述が資料に無い | 反映 |
| 11 | sonnet | patrol-check/route-cover L4 | 赤 | ルートを変える（08）と毎日同じルート（20）が資料間で矛盾 | 反映（削除） |
| 12 | sonnet | vent-controller/power-backup L4 | 中 | 訓練を受けていない受験者が L4 に届かない | 反映 |
| 13 | sonnet | vent-controller/change-rule L3/L4 | 中 | L4 が L3 より弱く見える／L3 に「自分では変えない」が無い | 反映 |
| 14 | Gemini | vent-controller/read-record | 中 | 変更ボタンを押さない要件が L3 に無い・撮影は防疫ルールと衝突 | 反映 |
| 15 | Gemini | vent-controller/verify-actual | 中 | L3 が4確認を1段に束ねる／read-temp とセンサー位置が重複 | 反映 |
| 16 | Gemini | vent-temp/never-stop L2 | 中 | 「寒さを気にして止めたくなり」は内心で観察できない | 反映 |
| 17 | sonnet | smoke-audit.js | 赤 | `git diff 5324896 -- smoke-audit.js` が空＝新5作業のテスト0件（G16） | 反映（[Q] を追加） |
| 18 | sonnet | review/ | 赤 | vet-review-fin-works.md が無い（G23） | 反映（本差し戻しで作成） |
| 19 | Gemini | vent-temp 全体 | 低 | ウインドレスで扉を開けると短絡気流になる・厳冬期に換気最大で凍死・LOTO 等 | 見送り（資料に無い外部知識。「資料に無い手順を書かない」に反する） |
| 20 | Gemini | vent-controller | 低 | センサーを噛まれる・L5 の包含要件が無い・no/gyomu が空 | 見送り（推測／5段階の型どおり／計画書の仕様） |
| 21 | sonnet | vent-controller/power-backup | 中 | 復電後の設定再確認が無い | 見送り（資料に記述が無い。改善の提案として記録） |
| 22 | sonnet | patrol-check（二重採点） | 高 | urgency-judge/report-template が治療 No.04・move-order と重なる | 一部反映（動かさない記述を削除・境界を overlap.md に記録）。種目を落とす案は見送り（計画 §2 の定義で、緊急度の区分と第一報の中身は既存に無い） |

## 環境で取れなかったもの

- Gemini breaker は、patrol-check の入力は社外秘ガードで停止、water-check は権限エラー（出力ゼロ）、vent-temp・vent-controller は成功（13件・14件）、density-grouping は資料の薬品語で停止。
- 再攻撃（修正後の全体への2周目）は今回実施していない。最終周の赤0の確認は別担当の再攻撃が要る。
