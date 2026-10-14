# patrol-check 重複監査（G13 実測: 最大2-gram Jaccard 0.19 < 0.5）
| 種目 | 最も近い既存種目 | Jaccard | 境界 |
|---|---|---|---|
| route-cover | 母豚列の巡回系(after-care等) | 0.12 | 豚房内の観察順序のみ。発見後の処置は扱わない。飲水器・排泄エリアは「異常の有無を見る」まで（流量測定は water-check/flow-measure、除フン作業と糞の観察は除フン側）。ルート固定/変更は20ガイドと08で食い違うため採点しない |
| urgency-judge | 治療 No.04 early-detect / 除フン dung-observation / carcass infect-signs / move-order | 0.08 | patrol=緊急度の区分を口頭で言い報告の速さを決める。No.04=耳標番号の記録と治療指示の受け取り。血便の観察そのものは除フン。「起立不能の豚を動かさない」は move-order の移動中止と同じ行動のため本種目から削除（突然死も資料に「動かさない」の記載なし） |
| report-template | 日報 detail-findings / 給餌 residue-report | 0.10 | patrol=第一報に「どの豚か（マーキング色など）」を書いたかを採点。印付けと翌日の追跡は mark-followup が採点 |
| mark-followup | body-measure / record-variance / cull-ship・ship-fin・standing-check のマーキング | 0.13 | patrol=異常個体の印付け（実技）と翌日確認の段取り（口頭・記録は求めない）。L2=印は付けるが段取りが言えない／L3=印＋翌日確認の段取りを言える。群内で明らかに小さい豚の別管理の相談（08 L141・L733）は mark-followup の守備範囲だが、1種目1行動のため採点項目には置かない（density-grouping も扱わない）。跛行の処置・隔離は扱わない。選別・出荷・起立不能のマーキングは各作業側 |
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
| area-calc | ship-fin/ship-criteria-plan | 0.06 | 農場で決めた体重帯の必要面積で割り上限頭数を出す計算だけ（数値は資料間で食い違うため本文に書かない＝社長判断3）。移動後に収まるかの現物照合は pen-count-fit に分離した（r4）。既存に面積計算は無い |
| crowd-signs | sow-lineup/after-care | 0.09 | 過密の兆候（かじり・けんか・渋滞・糞汚れ・皮膚の傷・全頭が同時に横になれない）を豚房ごとに確かめて上長に報告する。旧 lie-down はここの兆候リストに統合して種目から削除（r4）。巡回運用・緊急度判定は patrol-check |
| pen-count-fit | area-calc / count-record | <0.4（check_fin_works で作業内類似なし） | 移動後の豚房ごとの頭数が上限内かを、豚房の豚を実際に数えて確かめる現物照合だけ（計算は area-calc、記録との照合は count-record）。移動が無い日は口頭で想定を聞く。同じ受験者に area-calc と併用する場合も、上限頭数の計算は求めない |
| split-judge | cull-move/isolation-move | 0.10 | 過密を下げるための頭数の分け方（空き豚房へ移す／出荷が近い豚を先に出す）を比べて案を出し上長に相談する行動だけ（報告は crowd-signs が担当）。夕方〜夜・移動は最小限の回数は「新しい群を作るとき」に限る（出荷には付けない。旧 timing-fight を統合。見えない観点は口頭。L5=新人に「暗い時間は闘争が減る」と説明して指導）。小さい豚の個体対応は外した（mark-followup 側）。誘導手技は move-order、移動後の咬傷観察は mix-watch、出荷の可否確認は ship-fin |
| count-record | daily-report/headcount-balance | 0.23 | 豚房の頭数を実際に数え、記録と照合する（移動が無い日でも採点できる）。日報の式の検算・転出入の記入は daily-report、移動時の頭数復唱は move-order/count-handover |


# vent-controller 重複監査（r2 追記・G14）。Jaccard は概算（2-gram、手計算でなく目安。確定は check script）
| 種目 | 最も近い既存種目 | Jaccard | 境界 |
|---|---|---|---|
| read-record | vent-temp read-temp / feed-switch timer-record | 0.15 | 本作業=コントローラー画面の設定値を読み用紙へ転記する正確さ。read-temp=温度計の読み方。timer-record=エサスイッチの設定記録 |
| verify-actual | vent-temp manual-adjust / fan-clean | 0.14 | 本作業=画面の設定と実際（今のステージで回るべきファン・シャッター・インレット）の照合。manual-adjust=手でカーテン等を調整。fan-clean=清掃 |
| change-rule | feed-switch の変更権限ルール(エサスイッチ caution) | 0.18 | 本作業=設定は決められた人だけが変え、受験者は権限の行動だけを採点する（L2=寒い暑いで自分で触りかける・相談しない／L3=指示があれば自分では変えず決められた人に相談／L4=指示がなくても根拠を添えて上長に相談し変更は決められた人に任せる）。変更後の記録・動作確認・最低換気量の扱いは採点しない（r4） |
| weekly-review | vent-temp read-temp | 0.17 | 本作業=今週の設定記録に頭数の増減・体重帯の変化をそろえて毎週渡し（L3、口頭確認）、記録を見て見直し時期を自分から上長に言う（L4、当日の記録用紙で判定）。最高最低温度計は扱わない（read-temp のみ。r4で除去）。設定変更の相談は change-rule、温度計の読み方は read-temp、設定値の転記は read-record |
| power-backup | vent-temp fan-failure-first | 0.22 | 本作業=停電時の報告・発電機・換気ファンと給水ポンプ優先。fan-failure-first=ファン個別故障の初動。power-backup のブレーカー確認と fan-failure-first のブレーカー確認は同一人物に割り当てない（r4） |

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
| water-check/clog-leak ↔ freeze-outage | 同一作業内 | 仮設給水は freeze-outage だけが採点する。clog-leak は L3 で漏水時に元栓を閉めて報告するまで、L4 は床の濡れの原因調べと水質（臭い・色・濁り）に絞る。flow-measure は「基準を下回るもの」まで、出っぱなしは clog-leak |
| vent-temp/manual-adjust ↔ vent-controller/change-rule | 同一受験者に両方割り当てる場合 | manual-adjust は手動のカーテン・インレットだけ（自動制御は報告まで）。自動制御の設定変更は change-rule が「自分で変えない」と採点する |
| vent-temp/fan-failure-first ↔ vent-controller/power-backup | 停電・ファン故障 | fan-failure-first=ファン1台の停止（電源を切り完全停止を確かめてから触れる）。power-backup=停電（発電機・換気ファンと給水ポンプ優先）。復電後の設定再確認は資料に無いため採点しない（候補として社長判断） |
| vent-temp/pig-signs ↔ patrol-check/urgency-judge | 開口呼吸 | pig-signs=暑い日の行動サインから環境の原因を疑って報告まで（耳の裏に水・温度ムラ。調整は manual-adjust）。緊急度の区分は patrol-check |
| patrol-check 全体 | 治療 No.04 / 死獣 No.37 infect-signs / move-order | 同じ受験者の8枠に同時に入れない運用（プリセット定義 presets.json は G18 により触らない。名簿の作業列を作る担当への注意事項としてここに置く） |
