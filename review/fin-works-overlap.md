# patrol-check 重複監査（G13 実測: 最大2-gram Jaccard 0.19 < 0.5）
| 種目 | 最も近い既存種目 | Jaccard | 境界 |
|---|---|---|---|
| route-cover | 母豚列の巡回系(after-care等) | 0.12 | 豚房内の観察順序のみ。発見後の処置は扱わない。飲水器・排泄エリアは「異常の有無を見る」まで（流量測定は water-check/flow-measure、除フン作業と糞の観察は除フン側）。ルート固定/変更は20ガイドと08で食い違うため採点しない |
| urgency-judge | 治療 No.04 early-detect / 除フン dung-observation / carcass infect-signs / move-order | 0.08 | patrol=緊急度の区分を口頭で言い報告の速さを決める。No.04=耳標番号の記録と治療指示の受け取り。血便の観察そのものは除フン。「起立不能の豚を動かさない」は move-order の移動中止と同じ行動のため本種目から削除（突然死も資料に「動かさない」の記載なし） |
| report-template | 日報 detail-findings / 給餌 residue-report | 0.10 | patrol=第一報に「どの豚か（マーキング色など）」を書いたかを採点。印付けと翌日の追跡は mark-followup が採点 |
| mark-followup | body-measure / record-variance / cull-ship・ship-fin・standing-check のマーキング | 0.13 | patrol=異常個体の印付け（実技）と翌日確認の段取り（口頭・記録は求めない）、群内で明らかに小さい豚の別管理を上長に相談（08 L141・L733）。跛行の処置・隔離は扱わない。選別・出荷・起立不能のマーキングは各作業側 |
| safe-quiet | cull-move calm-drive-safety | 0.19 | patrol=巡回で歩いて観察する時の近づき方と逃げ道。cull-move=追い板で追い込む作業中の安全 |

注: patrol-check の urgency-judge / report-template と治療 No.04 は同じ受験者の8枠に同時に入れない運用を推奨。

# water-check 重複監査（実測: 最大2-gram Jaccard 0.124 < 0.5）
| 種目 | 最も近い既存種目 | Jaccard | 境界 |
|---|---|---|---|
| flow-measure | 給餌 residue-water / water-first | 0.10 | flow-measure=肥育豚の目安1.0〜1.5L/分に対し、カップで一定時間受けて全ニップルを定量測定。residue-water=給餌時の目視確認、water-first=給餌前のニップル押下確認（泌乳母豚の目安）。押下確認は本種目に含めない |
| height-fit | scraper run-check | 0.10 | height-fit=ニップルの床からの取り付け高さ。既存に高さ調整の種目なし |
| clog-leak | pad-tank filter-pipe | 0.10 | clog-leak=飲水器の詰まり・出っぱなしと配管漏水の元栓閉止。パドタンクのフィルター・配管清掃とは対象設備が別 |
| freeze-outage | feed-switch trough-watch | 0.11 | freeze-outage=凍結の解凍と断水時の仮設給水。流量測定は flow-measure、全ニップルの水の出の確認は持たない |
| season-record | semen-mix light-shield | 0.12 | season-record=夏の水温・断熱・貯水タンクと冬の保温材の見直しと季節点検の記録。ニップル流量は持たない。季節外の試験日は口頭確認 |

注: 観察可能性＝freeze-outage・season-record は季節外には実地で見られないため口頭確認（凍結したら最初に何をするか等）。flow-measure はニップル式の農場が対象で、ウォーターカップ式の豚房では評価者が対象外にする。

# density-grouping 重複監査（実測: 既存種目との最大2-gram Jaccard 0.23 < 0.5・作業内最大0.06 < 0.4。最近接は work-id/aspect-id 形式）
| 種目 | 最も近い既存種目 | Jaccard | 境界 |
|---|---|---|---|
| area-calc | ship-fin/ship-criteria-plan | 0.06 | 農場で決めた体重帯の必要面積で割り上限頭数を出す（数値は資料間で食い違うため本文に書かない＝社長判断3）。移動後の移動元・移動先が上限内かも見る（L4）。既存に面積計算は無い |
| crowd-signs | sow-lineup/after-care | 0.09 | 過密の兆候（渋滞・糞汚れ・横になれるか）を豚房ごとに数えて比べる。巡回運用・緊急度判定は patrol-check |
| split-judge | cull-move/isolation-move | 0.10 | 過密・体格差のときの分け方の相談と上長報告まで。小さい豚の個体追跡は patrol-check/mark-followup、出荷の可否確認は ship-fin（本種目は出荷予定を確かめて案を添えるのみ） |
| timing-fight | semen-check/temp-control | 0.12 | 移動の回数と時間帯を前もって計画し口頭で説明できるか（見えない観点は口頭）。誘導手技は move-order、移動後の咬傷観察は mix-watch、尾かじりの隔離・治療は治療 No.04 |
| count-record | daily-report/headcount-balance | 0.23 | 豚房ごとの頭数の書き直しと、舎をまたぐ移動だけ日報の転出・入舎に入れる区別まで。日報の式の検算・原因調査は daily-report（本種目からは削除）、移動時の頭数復唱は move-order/count-handover |


# vent-controller 重複監査（r2 追記・G14）。Jaccard は概算（2-gram、手計算でなく目安。確定は check script）
| 種目 | 最も近い既存種目 | Jaccard | 境界 |
|---|---|---|---|
| read-record | vent-temp read-temp / feed-switch timer-record | 0.15 | 本作業=コントローラー画面の設定値を読み用紙へ転記する正確さ。read-temp=温度計の読み方。timer-record=エサスイッチの設定記録 |
| verify-actual | vent-temp manual-adjust / fan-clean | 0.14 | 本作業=画面の設定と実際（今のステージで回るべきファン・シャッター・インレット）の照合。manual-adjust=手でカーテン等を調整。fan-clean=清掃 |
| change-rule | feed-switch の変更権限ルール(エサスイッチ caution) | 0.18 | 本作業=設定は決められた人だけが変え、受験者は相談と変更後の記録・動作確認に立ち会う |
| weekly-review | vent-temp read-temp | 0.17 | 本作業=設定が頭数・体重・季節に合うかの判断と見直し依頼。温度計の読み方そのものは read-temp、設定値の転記は read-record |
| power-backup | vent-temp fan-failure-first | 0.22 | 本作業=停電時の報告・発電機・換気ファンと給水ポンプ優先。fan-failure-first=ファン個別故障の初動 |

運用注記（評価者マニュアル・獣医レビュー文書へ反映すること）: 当日に見られるのは read-record と verify-actual のみ。change-rule・weekly-review・power-backup は口頭試問と記録用紙の確認で採点する。カーテン式の農場にはこの作業を割り当てない。

# vent-temp 重複監査
| 種目 | 最も近い既存種目 | 境界 |
|---|---|---|
| vent-temp/read-temp | vent-controller weekly-review / verify-actual | read-temp=豚の高さの温度計を読み冷え込み・日較差・計器異常を報告。weekly-review=設定見直しの依頼、verify-actual=コントローラ表示との照合。最高最低温度計は read-temp のみが扱う（vent-controller weekly-review からは除去済み） |
| vent-temp/pig-signs | patrol-check urgency-judge | pig-signs=群の分布と空気から環境の原因(温度ムラ・隙間風・換気不足)を読む。個体の緊急度の区分と第一報は patrol-check。L4 は暑熱の緊急として報告する1句のみ |
| vent-temp/manual-adjust | wind-safety / ファン清掃 No.29 / パドタンク清掃 No.30 | manual-adjust=カーテン・インレットを段階的に動かし隙間・破れを見る。ファン・パッド冷却の稼働確認は含めない(清掃・整備は No.29/30) |
| vent-temp/never-stop | 除フン系(dung)・ピット関連の既存種目 | never-stop=換気を止めない判断と、臭い・目の痛みで換気最大＋除糞を優先する判断。除糞の手技そのものは除フン側 |
| vent-temp/fan-failure-first | vent-controller power-backup / ファン清掃 No.29 | fan-failure-first=ファン1台の不調の初動(ブレーカー→ベルト→異物→報告→代替換気)。power-backup=停電・発電機。扉開放の文言は fan-failure 側を正とする。No.29=停止状態での清掃 |


# 差し戻し反映（第3版）で追記した境界
| 作業 | 近い既存種目 | 境界・運用 |
|---|---|---|
| water-check/flow-measure | 給餌 water-first（final-feeding.json）・residue-water | water-first は「給餌前に水が出るか」の確認で泌乳母豚の目安 2L/分 を使い、flow-measure は肥育豚の目安 1.0〜1.5L/分 を使う。同じカップ流量テストが別基準になるため同じ受験者に併用しない。資料の食い違い（12: 肥育豚1.0〜1.5／09: 夏は1.0以上／給餌側: 2L/分）は社長判断。final-feeding.json は触らない（G18） |
| water-check/clog-leak ↔ freeze-outage | 同一作業内 | 仮設給水は freeze-outage だけが採点する。clog-leak は元栓を閉め漏水箇所を特定し報告まで。flow-measure は「基準を下回るもの」まで、出っぱなしは clog-leak |
| vent-temp/manual-adjust ↔ vent-controller/change-rule | 同一受験者に両方割り当てる場合 | manual-adjust は手動のカーテン・インレットだけ（自動制御は報告まで）。自動制御の設定変更は change-rule が「自分で変えない」と採点する |
| vent-temp/fan-failure-first ↔ vent-controller/power-backup | 停電・ファン故障 | fan-failure-first=ファン1台の停止（電源を切り完全停止を確かめてから触れる）。power-backup=停電（発電機・換気ファンと給水ポンプ優先）。復電後の設定再確認は資料に無いため採点しない（候補として社長判断） |
| vent-temp/pig-signs ↔ patrol-check/urgency-judge | 開口呼吸 | pig-signs=暑い日の行動サインから環境調整につなげる（耳の裏に水・温度ムラ）。緊急度の区分は patrol-check |
| patrol-check 全体 | 治療 No.04 / 死獣 No.37 infect-signs / move-order | 同じ受験者の8枠に同時に入れない運用（プリセット定義 presets.json は G18 により触らない。名簿の作業列を作る担当への注意事項としてここに置く） |
