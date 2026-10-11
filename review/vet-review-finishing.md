# 獣医監修レビュー：肥育舎プリセット（finishing-house）8作業

- 審査日：2026-10-11（works-v2.js version 2026-10-11 時点・未コミット版）
- 審査者の立場：養豚獣医師（HSS 実技試験の監修）
- 対象：`data-work/presets.json` の `finishing-house` に入っている8作業
  feeding-daily / feed-adjust-fin（新規）/ additive / disinfect / daily-report / dung-removal / lime / body-measure
- 突き合わせた資料（swine-manual-app/swine-manual/docs/beginner-guide/）
  - 主資料：08_肥育舎.md・16_数値早見表.md・25_出荷から食卓まで.md・21_飼料の基礎知識.md
  - 補助資料（共通作業の出典として確認）：03_共通業務.md・02_バイオセキュリティ.md・11_記録と数値管理.md
- 判定項目
  1. 母豚向け語の混入がない（母豚・産次・泌乳・BCS・妊娠・繁殖。参考として「分娩」「体況」も確認）
  2. 数値・手順が資料の範囲にある
  3. 4言語（ja/en/vi/id）の意味が一致している（vi の豚＝lợn）
- 機械チェックの結果：4言語とも欠落なし。vi の単独語「heo」は0件（全件 lợn）。数値は「3点→three points」「ゼロ点→0」などの表記差だけで、数値のずれは0件。

---

## 総括表

| 作業 | 1 母豚語なし | 2 資料の範囲 | 3 4言語一致 | 観察可能性（その日その場で判定できるか） |
|---|:-:|:-:|:-:|---|
| feeding-daily 給餌 | × | × | × | 観点4・5は当日に判定できる。観点1の「季節調整」とL5は当日には見えないため、口頭で確かめる |
| **feed-adjust-fin エサ調整（肥育）** | ○ | ○ | ○ | 観点1・3・4は当日に判定できる。観点2（5〜7日かける切替）は1日では見えないため、記録と口頭で確かめる |
| additive 添加剤準備 | ○ | × | ○ | 添加剤を作る日なら判定できる。観点2（休薬管理）は記録と口頭で確かめる |
| disinfect 消毒 | ○ | ○ | ○ | 観点3（乾燥させてから豚を入れる）は数時間かかり、当日中には見届けにくい。観点4（事故時の対応）は口頭か模擬で確かめる |
| daily-report 日報記入 | × | ○ | ○ | 夕方の記入場面なら判定できる。観点5は過去の日報が必要 |
| dung-removal 除フン | ○ | ○ | ○ | 判定できる。観点2の「定期的」は記録で補う |
| lime 石灰散布 | ○ | ○ | ○ | 天候しだい。雨の日は観点1・4が見られない |
| **body-measure 体測** | ○ | ○ | ○ | 体重を測る日（週1回の選別日）に限って判定できる。メジャーでの推定は実演で確かめる |

× が付いたのは3作業・延べ5か所。新規の2作業（feed-adjust-fin・body-measure）は3項目とも ○ で、改善の提案だけ付けた。

---

## 作業ごとの判定

### 1. feeding-daily 給餌（farrowing-house・stall-house・finishing-house の3つで共通）

| 項目 | 判定 | 根拠 |
|---|:-:|---|
| 1 母豚語 | × | purposeShort「成長・**繁殖**を安定させ」、amount L5「成長・**繁殖**に与える影響」「**体況**・季節・ステージ」。en/vi/id も reproduction / sinh sản / reproduksi、body condition / thể trạng / kondisi tubuh |
| 2 資料の範囲 | × | intake-watch の「**耳標番号**で特定」が、肥育舎の手順と合わない。08 では肥育豚の特定にマーキング色と豚房番号を使う（08 報告テンプレート「対象: マーキング色 / 個体識別」）。03 も「個体を特定してメモ」とだけ書いている。肥育豚には個体ごとの耳標がない農場が多い。「5〜10分」は 03 にある |
| 3 4言語 | × | 意味は一致している。ただし vi/id の intake-watch（kanten と L3）に日本語の波ダッシュ「5〜10」がそのまま残っており、外国人の評価者が範囲として読めない恐れがある |

**修正案**（他の2プリセットでも使うため、どの豚舎にも当てはまる言い方に直す）

- purposeShort
  - ja：成長・繁殖を安定させ、… → **豚の発育と体調を安定させ、全頭がムラなく食べ、ムダな飼料を出さない**
  - en：Stabilize pigs' growth and condition, ensure all pigs eat evenly, and avoid feed waste
  - vi：Giúp lợn phát triển và giữ thể lực ổn định, cả đàn ăn đều nhau, không lãng phí thức ăn
  - id：Menstabilkan pertumbuhan dan kondisi babi, semua babi makan merata, tidak ada pakan terbuang
- amount L5
  - ja：給与量が成長・繁殖に与える影響を理解し、体況・季節・ステージに合わせて… → **給与量が発育・体調に与える影響を理解し、食い込み・季節・ステージに合わせて最適化し、調整の考え方を新人に指導できる。**
  - en：Understands how feed amounts affect growth and condition, optimizes them by intake, season, and stage, and can teach new staff the principles of adjustment.
  - vi：Hiểu lượng thức ăn ảnh hưởng đến sự phát triển và thể lực của lợn, tối ưu theo mức ăn, mùa và giai đoạn, và có thể hướng dẫn người mới cách điều chỉnh.
  - id：Memahami pengaruh jumlah pakan terhadap pertumbuhan dan kondisi babi, mengoptimalkannya sesuai nafsu makan, musim, dan tahap produksi, serta bisa mengajari karyawan baru cara berpikir penyesuaiannya.
- intake-watch kanten・L4（耳標番号）
  - ja：耳標番号で特定 → **耳標番号または豚房番号・マーキングで特定**
  - en：by ear tag number → by ear tag number, or by pen number and marking
  - vi：bằng số thẻ tai → bằng số thẻ tai, hoặc số ô chuồng và dấu đánh dấu
  - id：dengan nomor eartag → dengan nomor eartag, atau nomor petak kandang dan tanda semprot
- intake-watch kanten・L3（vi/id）：「5〜10 phút」→「**5–10 phút**」、「5〜10 menit」→「**5–10 menit**」（en は 5-10 で問題なし）
- 補足（観察可能性）：肥育豚は不断給餌の農場が多く、amount の「決められた量を配る」場面がない日もある（16：肥育前期「自由摂取も可」）。kanten に「（不断給餌ではエサ箱の出量）」と添えると、その日の評価で迷わない。ただし出量の調整は feed-adjust-fin の feeder-spill と重なる（下の「重複」を参照）。

### 2. feed-adjust-fin エサ調整（肥育）〔新規〕

| 項目 | 判定 | 根拠 |
|---|:-:|---|
| 1 母豚語 | ○ | 該当語なし（4言語とも） |
| 2 資料の範囲 | ○ | エサ箱の調整とこぼれ（08 FCR改善表・チェックポイント）、5〜7日かける段階混合と下痢が出たら遅くすること（08 ステップ2）、自動給餌器の出量・センサー・配管（08 Q&A）、ブリッジ・変色・カビ・異臭・残量1〜2日分で発注（08 ステップ5）、飼料切れで成長停止・尾かじり（08 よくあるミス）、食い込みが悪い豚房では温度・飲水・密度を確認（08 観察のポイント）、休薬はラベルと添付文書で確認・法的義務・出荷停止（08 ステップ3・25 §5）。どれも資料にある |
| 3 4言語 | ○ | 意味は一致している。vi は全件 lợn |

**改善の提案**（× ではない）

- adjust-record L4：休薬の確認が「休薬期間が分かるか」で終わっていて、**出荷予定日から逆算する視点**が入っていない。仕上げ期に薬入り飼料から切り替える場面で事故が起きやすいので、次のように足すことを勧める（08 ステップ6「休薬期間の逆算カレンダー」に根拠がある）。
  - ja：…休薬期間が不明な時は必ず確認してから与え、… → **…休薬期間のある飼料は出荷予定日から逆算して給与終了日を確かめ、不明な時は必ず確認してから与え、…**
  - en：…for feed with a withdrawal period, works back from the planned shipping date to confirm the last feeding day, always checks before feeding when unsure, …
  - vi：…với thức ăn có thời gian ngừng thuốc thì tính ngược từ ngày dự kiến xuất chuồng để xác nhận ngày cho ăn cuối cùng, khi chưa rõ thì nhất định kiểm tra rồi mới cho ăn, …
  - id：…untuk pakan bermasa henti obat, menghitung mundur dari rencana tanggal kirim untuk memastikan hari terakhir pemberian, dan selalu memeriksa sebelum memberi pakan saat tidak jelas, …
- feeder-line L5「残量が1〜2日分で発注」：08 にはこう書いてあるが、21 には「**最低3日分の在庫を常に確保**」とあり、資料どうしが食い違っている。獣医の立場では、配送の遅れや台風を考えると1〜2日分では遅いと考える。試験で数字を問うと、どちらの資料で学んだかで正誤が分かれてしまう。**「農場で決めた発注点で発注する」**に言い換えて数字を消すか、資料の数字を一つにそろえるよう勧める。
- 「ブリッジ」の訳：vi「vón cục (bridge)」と id「menggumpal (bridge)」は「固まる」という意味だけで、「アーチ状になって落ちてこない」というところが伝わりにくい。vi「**thức ăn đóng vòm / kẹt vòm (bridge)**」、id「**pakan membentuk lengkung / macet di tangki (bridge)**」にするとよい。L4 の「出ない時に疑う」とは今の訳でもつながっているので、判定は ○ のままにする。
- 観察可能性：feed-switch は5〜7日かけて行う作業なので、1日の評価では切替の全体を見られない。kanten に「（評価日は、その日の混合割合と切替記録で判定）」と添えると、評価者が迷わない。feeder-line L4 の「毎日」も、記録で確かめる。

### 3. additive 添加剤準備（stall-house と共通）

| 項目 | 判定 | 根拠 |
|---|:-:|---|
| 1 母豚語 | ○ | 該当語なし |
| 2 資料の範囲 | × | 「**プレミックス**手順でムラなく混合」（dosage-mix L2・L4）、「抗菌性添加物の**重なり**」「**容器内残存**」（antibacterial）、「**開封日**」（mixup-storage）は、beginner-guide 全体を検索しても出てこない（21 の「プレミックス」は製品の種類の説明で、混ぜる手順ではない）。そのほか（ラベル・対象家畜・添加量・有効期限・固化・秤のゼロ調整・声出し確認・休薬の開始日と終了日の記録・手袋とマスク）は 03「添加剤準備」に根拠がある |
| 3 4言語 | ○ | 意味は一致している |

**修正案**（資料にある手順に置き換える。現場マニュアル V2 などに出典があれば、その出典名を付けて残してもよい）

- dosage-mix L2
  - ja：計量器の校正やプレミックス手順に漏れがある → **秤のゼロ調整（風袋引き）や量った数値の声出し確認に漏れがある**
  - en：…but often misses zeroing the scale (tare) or calling out the measured value.
  - vi：…nhưng hay bỏ sót việc chỉnh cân về 0 (trừ bì) và đọc to số đã cân để xác nhận.
  - id：…tetapi sering lalai menolkan timbangan (tara) dan menyebutkan angka takaran dengan suara keras.
- dosage-mix L4
  - ja：プレミックスでムラなく混合する → **指示された方法でムラなく混合し、計量後すぐ容器にラベルを貼る**
  - en：mixes evenly by the instructed method and labels the container right after weighing.
  - vi：trộn đều theo cách được chỉ định và dán nhãn lên hộp ngay sau khi cân.
  - id：mencampur merata sesuai cara yang diinstruksikan dan menempel label pada wadah segera setelah menakar.
- antibacterial kanten
  - ja：抗菌性添加物の重なりに注意し、給与期間の終了・休薬を記録で管理できるか → **休薬期間のある添加剤について、投与開始日・終了日を記録し、出荷予定日と照らして休薬を管理できるか**（03「休薬期間がある薬剤の場合は、投与開始日と終了日を記録」、08 ステップ6）
  - en：For additives with a withdrawal period, can they record the start and end dates and manage withdrawal against the planned shipping date?
  - vi：Với chất bổ sung có thời gian ngừng thuốc, có ghi ngày bắt đầu, ngày kết thúc và đối chiếu với ngày dự kiến xuất chuồng để quản lý ngừng thuốc không.
  - id：Untuk imbuhan bermasa henti obat, apakah mencatat tanggal mulai dan selesai serta mengelola masa henti obat dengan mencocokkan rencana tanggal kirim.
- mixup-storage の「開封日」：資料にないので、残すなら出典を付ける。資料の範囲だけで書くなら「**計量後すぐラベルを貼り、決められた保管温度で保管する**」（03「計量後に容器に入れたら、すぐにラベル」「ビタミン剤は高温で劣化」）。

### 4. disinfect 消毒

| 項目 | 判定 | 根拠 |
|---|:-:|---|
| 1 母豚語 | ○ | 該当語なし |
| 2 資料の範囲 | ○ | 接触時間（02）、汚れを落としてから消毒・マスクとゴーグル（03・02）、乾燥と換気扇（03）、水を先に入れる（03）、流水で15分以上（03・10・17）、踏み込み消毒槽（10） |
| 3 4言語 | ○ | 意味は一致している |

- 観察可能性：dry-both の「消毒後、乾いてから豚を入れる」は数時間〜半日かかり、評価の時間内に見届けられないことが多い。「乾いているかの確かめ方を説明できる」を当日の判定に使うとよい。no-mix-accident の事故時の対応は口頭で確かめる。

### 5. daily-report 日報記入（finishing-house だけで使う）

| 項目 | 判定 | 根拠 |
|---|:-:|---|
| 1 母豚語 | × | headcount-balance kanten の式に「**分娩子豚**」が入っている（en: farrowed piglets／vi: lợn con mới đẻ／id: anak babi lahir）。11 の式を繁殖豚舎向けのまま写したもので、肥育舎ではこの項目は必ず0になる |
| 2 資料の範囲 | ○ | 式（11）、まとめ書きをしない（03）、治療豚の記録と休薬（08・25）、死亡・異常の具体的な書き方（08 報告テンプレート） |
| 3 4言語 | ○ | 意味は一致している |

**修正案**（このプリセットだけで使う作業なので、肥育舎向けの式に直す）

- headcount-balance kanten
  - ja：前日頭数±移動＋分娩子豚−死亡−出荷の式で… → **前日頭数＋入舎−転出−死亡−出荷（淘汰を含む）＝当日頭数の式で検算し、合わないとき当日中に原因を調べられるか。**
  - en：Can they verify using the formula previous-day count + pigs moved in − pigs moved out − deaths − shipments (including culls) = today's count, and investigate the cause the same day when it does not balance?
  - vi：Có kiểm lại bằng công thức: số đầu con hôm trước + lợn nhập chuồng − lợn chuyển đi − chết − xuất chuồng (kể cả loại thải) = số đầu con hôm nay, và khi không khớp có tìm nguyên nhân ngay trong ngày không.
  - id：Apakah dapat menghitung ulang dengan rumus: jumlah ekor hari sebelumnya + babi masuk − babi pindah keluar − mati − pengiriman (termasuk afkir) = jumlah ekor hari ini, dan mencari penyebabnya pada hari itu juga jika tidak cocok?
- 観察可能性：夕方の記入場面（08 タイムスケジュールでは16:00）に合わせて評価すれば当日に判定できる。trend-report は前日までの日報を評価者が手元に用意する。

### 6. dung-removal 除フン

| 項目 | 判定 | 根拠 |
|---|:-:|---|
| 1 母豚語 | ○ | 該当語なし |
| 2 資料の範囲 | ○ | 除糞→洗浄→消毒（16「洗浄→乾燥→消毒→乾燥」・03）、床下・ピット・スクレーパーの残渣（03）、血便・水様下痢・黒色便はすぐ報告（03・08 異常サイン表）、ピットに入らない・電源を切る・硫化水素（08） |
| 3 4言語 | ○ | 意味は一致している |

- 補足：08 には「人間は絶対にピット内に入らない」（環境管理）と「絶対に1人で入らない」（施設管理）の2通りの書き方があり、資料どうしでずれている。評価基準は「入らない」に統一されており、安全側なのでこのままでよい。

### 7. lime 石灰散布

| 項目 | 判定 | 根拠 |
|---|:-:|---|
| 1 母豚語 | ○ | 該当語なし |
| 2 資料の範囲 | ○ | 地面が白く見える量・乾いた地面には先に水・風向き・雨と天気予報・在庫・石灰乳の撹拌・均一か通行の支障かの確認（すべて 03「石灰散布」）。濃度10〜20%（16）とも矛盾しない |
| 3 4言語 | ○ | 意味は一致している |

- 観察可能性：雨の日は散布しないため、観点1・4が見られない。その日は観点3（天候で判断して延期できるか）で評価する。

### 8. body-measure 体測〔新規〕

| 項目 | 判定 | 根拠 |
|---|:-:|---|
| 1 母豚語 | ○ | 該当語なし |
| 2 資料の範囲 | ○ | 平らな場所に置いてゼロ点・追い板・記録用紙・スプレー・静かに乗せる・動かなくなってから読む・校正（08 §5 ステップ2・注意点）、目視推定と「測る前に予想する」上達法（08 §5 ステップ1・初心者へのアドバイス）、胸囲と体長による推定は目安（**16 §3「体重(kg)＝胸囲×胸囲×体長÷14,400。あくまで目安」**）、110〜120kg・90kg未満（同日齢比較）・120kg超・優先出荷（08 選別基準）、契約による・軽すぎも重すぎも減額・脂肪過多（08 KPI・Q&A、25 §2）、小さい豚の原因（疾病・寄生虫・いじめ・エサに届かない）と跛行（08 観察のポイント） |
| 3 4言語 | ○ | 意味は一致している。110-120 / 90 / 120 の数値も4言語で一致。vi「tấm chắn」（追い板）は cull-move・sow-lineup の訳と同じで統一されている |

**改善の提案**（× ではない）

- ship-judge L3：区分が「110〜120kg＝出荷候補／90kg未満＝軽量／120kg超＝重量」だけで、**90〜110kg の豚をどう扱うか**が抜けている。現場ではこの体重帯がいちばん多く、受験者が「軽量豚」に入れてしまう誤りが出やすい。08 Q&A「もう少し飼い込んでから次回に回す」に根拠があるので、次のように補う。
  - ja：…120kg超を重量豚に分け、… → **…120kg超を重量豚、その間（90〜110kg）は次回以降の候補として分け、…**
  - en：…over 120 kg as heavy pigs, and those in between (90-110 kg) as candidates for a later shipment, …
  - vi：…trên 120kg là lợn nặng cân, còn khoảng giữa (90-110kg) là lợn dự kiến xuất đợt sau, …
  - id：…di atas 120kg sebagai babi berat, dan yang di antaranya (90-110kg) sebagai calon kirim berikutnya, …
- weigh-estimate L3：「目安の体重を出せる」の計算式を評価者が知らないと判定できない。kanten の末尾に「（目安の式：胸囲×胸囲×体長÷14,400／16_数値早見表）」と添える。
- calm-handling L3 の「落ち着いてから測り」と weigh-estimate の「動かなくなってから読む」は、同じ行動を2つの観点で採点している。calm-handling の側は「落ち着かせてから」までにとどめ、数値を読むタイミングは weigh-estimate だけで採点すると二重採点にならない。
- 観察可能性：体重を測るのは週1回の選別日（08 週次作業）か出荷の前日なので、評価日をその日に合わせる必要がある。その日に合わないときは、観点3（目視とメジャーによる推定）と観点5（記録の見方）だけを実演と記録で判定する。

---

## プリセット全体の指摘：作業間の重複（肥育舎だけで起きる）

feeding-daily と新しい feed-adjust-fin が同じプリセットに入ったため、同じ行動を2回採点する箇所がある。

| feeding-daily | feed-adjust-fin | 重なっている行動 |
|---|---|---|
| intake-watch（給餌後の食い込み観察） | eating-observe（食い込みの観察） | 豚が集まるか・食べに来ない豚 |
| feed-label（種類・カビ・固まり・におい・タンク残量） | feeder-line（タンク残量・変色・カビ・異臭） | タンク残量と飼料の変質 |
| amount（給与量の加減） | feeder-spill（出量の調整） | 不断給餌では同じ操作になる |

勧める対応：肥育舎では、feed-adjust-fin を「設備と切替」（feeder-spill・feed-switch・feeder-line・adjust-record）に絞る。eating-observe は「豚房ごとの差と環境要因（温度・飲水・密度）」だけを見る観点にして、個体の食い込みは feeding-daily の intake-watch に任せる。feeder-line からは「変色・カビ・異臭」を外し、配管・センサー・ブリッジに絞る。

---

## × 一覧（✅ 2026-10-11 すべて修正済み＝正本 final-feeding.json / final-record.json を評価担当が実物確認。feed-adjust-fin の発注目安「1〜2日」は出典の食い違いのため「農場で決めた発注点」に変更）

| # | 作業・箇所 | 項目 | 内容 |
|---|---|:-:|---|
| 1 | feeding-daily purposeShort | 1 | 繁殖 → 「発育と体調」（4言語） |
| 2 | feeding-daily amount L5 | 1 | 繁殖・体況 → 「発育・体調」「食い込み」（4言語） |
| 3 | feeding-daily intake-watch kanten・L4 | 2 | 耳標番号 → 「耳標番号または豚房番号・マーキング」（4言語） |
| 4 | feeding-daily intake-watch kanten・L3（vi/id） | 3 | 「5〜10」→「5–10」 |
| 5 | additive dosage-mix L2・L4／antibacterial kanten／mixup-storage | 2 | プレミックス手順・重なり・容器内残存・開封日が資料にない → 03 にある手順へ置き換えるか、出典を付ける |
| 6 | daily-report headcount-balance kanten | 1 | 分娩子豚 → 肥育舎の式「＋入舎−転出−死亡−出荷（淘汰を含む）」（4言語） |

※ works-v2.js は自動生成されるファイルのため、修正は正本の `data-work/final-*.json`（feeding-daily・additive＝final-feeding.json、daily-report＝final-record.json で確認済み）に入れ、`build_data.py` で作り直す。このレビュー自体はファイルを変更していない（修正は別担当が実施済み）。
