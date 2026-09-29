# -*- coding: utf-8 -*-
"""docs/tebiki.html を4言語で生成する。
作業名・目的・種目名は works-v2.js（アプリの正本）から取り出す＝翻訳を新しく作らない。
カテゴリ名とレベル名は js/i18n.js と同じ語を使う。
"""
import json, io, os, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
e = html.escape
LANGS = ['ja', 'en', 'vi', 'id']

src = io.open(os.path.join(ROOT, 'works-v2.js'), encoding='utf-8').read()
DATA = json.loads(src[src.index('{'):src.rindex('}') + 1])

# js/i18n.js と同一
CAT = {
    'ja': ['飼養管理', '衛生管理', '繁殖管理', '分娩管理', '施設管理', '記録管理', '出荷管理'],
    'en': ['Feeding', 'Hygiene', 'Breeding', 'Farrowing', 'Facility', 'Records', 'Shipping'],
    'vi': ['Nuôi dưỡng', 'Vệ sinh', 'Sinh sản', 'Đẻ', 'Thiết bị', 'Ghi chép', 'Xuất chuồng'],
    'id': ['Pemberian pakan', 'Kebersihan', 'Reproduksi', 'Kelahiran', 'Fasilitas', 'Pencatatan', 'Pengiriman'],
}
LVNAME = {
    'ja': ['要指導', '要改善', '標準', '上回る', '模範的'],
    'en': ['Urgent', 'Improve', 'Standard', 'Above', 'Exemplary'],
    'vi': ['Khẩn cấp', 'Cải thiện', 'Đạt', 'Tốt', 'Xuất sắc'],
    'id': ['Mendesak', 'Perbaikan', 'Standar', 'Baik', 'Teladan'],
}

T = {}

T['ja'] = dict(
    label='JP', eyebrow='HSS 実技試験 V2 ／ 睦沢農場', h1='実技試験の手引き',
    lede='試験をする人のための手引きです。点のつけ方と、当日の進め方だけを書いています。',
    applink='採点アプリを開く',
    h01='この試験で測るもの',
    thesis='作業を、指示なしで、正しくできるか。',
    p01='知識ではなく、現場での動きを見ます。7分野・40作業。作業ごとに見る種目が5つ決まっていて、種目ごとに1〜5点をつけます。',
    h02='点のつけ方',
    p02='点数の意味は、40作業200種目すべてで同じです。<strong>どこまで人の手を借りずにできるか</strong>、それだけで決まります。',
    lv=['やらない。確認しない。まかせられない。',
        '言えばできるが、抜けや漏れが多い。',
        '言えば、確実にできる。',
        '言わなくても、自分で気づいてやる。異常があれば原因を追う。',
        'なぜそうするかを分かっていて、新人に教えられる。'],
    qintro='迷ったら、この3つを順に聞くだけで決まります。',
    q=[('言われなくても、やるか。', 'いいえ → 3以下'),
       ('言われれば、間違いなくやるか。', 'いいえ → 2以下'),
       ('人に教えられるか。', 'はい → 5')],
    call1='<strong>3は合格ラインではありません。</strong>3は「指示待ちだが確実」という状態です。',
    call2='一人で任せられるのは4からです。ここを取り違えると、評価が全部甘くなります。',
    h03='当日の進め方',
    steps=[('評価する作業を決める', ['分野ごとに作業を選びます。複数まとめて選べます。1回の試験で3〜5作業が目安です。']),
           ('実際にやってもらう', ['作業をさせて、横で見ます。聞き取りだけで点をつけないでください。']),
           ('種目ごとに点をつける', ['「基準を見る（レベル1〜5）」を開くと、その種目の1〜5の文が出ます。<strong>目の前の動きに一番近い文を選びます。</strong>印象で選ばないこと。']),
           ('コメントを書く', ['点だけでは、次に何をすればいいかが伝わりません。3以下の種目には必ず書いてください。'])],
    step5=('保存する', '評価日・評価者・被評価者を入れて保存します。<strong>全種目に点がついていないと保存できません。</strong>'),
    egok='良い', egng='悪い',
    egokt='給水器の流量を見ていなかった。3頭分が止まっていた。',
    egngt='もう少し頑張りましょう。',
    h04='迷ったときの決めごと',
    r04=[('見ていないことは採点しない。', 'その作業を選ばないか、やらせてから点をつける。'),
         ('たまたま今日できた・できなかったは採点しない。', 'いつもの動きで判断する。'),
         ('1回の失敗で1点にしない。', '逆に、注意して直ったからといって上げない。直る前の動きが実力です。'),
         ('手順が分からなくなったら。', '各作業の「現場マニュアルを見る」から、その作業の手順書に飛べます。'),
         ('やり直しは自由。', '保存した記録は履歴からいつでも直せます。')],
    h05='記録の扱い',
    r05=[('履歴', '過去の評価が一覧で出ます。押すと種目ごとの点とコメントが見えます。'),
         ('グラフ', '人を選ぶと、平均点の推移と、5種目のレーダーチャートが前回と重ねて出ます。伸びた種目と止まっている種目が一目で分かります。'),
         ('CSV出力', '1行＝1種目で書き出します。集計や報告書に使います。'),
         ('バックアップ', '記録はその端末の中だけに残ります。他の人の端末には出ません。設定タブ（パスワード OOIRI）から、ときどきバックアップを取ってください。')],
    h06='受ける人に先に伝えること',
    r06=[('何の作業を見るか。', '隠さない。'),
         ('点の意味。', '3は「言われればできる」、4から一人前。'),
         ('落とす試験ではないこと。', '次に何を覚えるかを決めるための試験です。')],
    h07='作業一覧（40作業）',
    note07='各作業の下に並ぶのが、その作業で見る5種目です。',
    catct='{n}作業',
    foot1='評価基準は睦沢農場「業務の目的と注意点」と現場マニュアルに基づく。',
    foot2='データ版 {v} ／ 40作業・200種目',
)

T['en'] = dict(
    label='EN', eyebrow='HSS PRACTICAL EXAM V2 · MUTSUZAWA FARM', h1='Practical Exam Guide',
    lede='A guide for the person running the exam. It covers only how to score and how the day runs.',
    applink='Open the scoring app',
    h01='What this exam measures',
    thesis='Can they do the job right, without being told?',
    p01='This is not a knowledge test. You watch what the person actually does in the barn. 7 areas, 40 jobs. Each job has 5 fixed points to watch, and each point is scored 1 to 5.',
    h02='How to score',
    p02='A score means the same thing in all 200 points across the 40 jobs. One thing decides it: <strong>how much help from others they still need.</strong>',
    lv=['Does not do it. Does not check. Cannot be left to them.',
        'Does it when told, but with many gaps and misses.',
        'When told, does it reliably.',
        'Does it without being told. Looks for the cause when something is wrong.',
        'Understands why it is done that way, and can teach a new worker.'],
    qintro='When you are unsure, these three questions decide it.',
    q=[('Do they do it without being told?', 'No → 3 or lower'),
       ('When told, do they do it without fail?', 'No → 2 or lower'),
       ('Can they teach it to someone?', 'Yes → 5')],
    call1='<strong>3 is not the pass mark.</strong> A 3 means reliable, but waiting to be told.',
    call2='A job can be left to someone from 4 upward. Mixing this up makes every score too generous.',
    h03='On the day',
    steps=[('Choose the jobs to assess', ['Pick jobs by area. You can select several at once. 3 to 5 jobs per session is a good size.']),
           ('Have them do the work', ['Let them work and watch from beside them. Do not score from an interview alone.']),
           ('Score each point', ['Open “View criteria (Levels 1–5)” to see the five sentences for that point. <strong>Choose the sentence closest to what you just saw.</strong> Do not score on impression.']),
           ('Write a comment', ['A score alone does not tell the person what to do next. Always write something for any point scored 3 or lower.'])],
    step5=('Save', 'Enter the date, your name and the person’s name, then save. <strong>You cannot save until every point has a score.</strong>'),
    egok='GOOD', egng='BAD',
    egokt='Did not check the water flow. Three drinkers were not running.',
    egngt='Please try a bit harder.',
    h04='Rules for the grey areas',
    r04=[('Do not score what you did not see.', 'Either leave that job out, or have them do it first.'),
         ('Do not score a one-off good or bad day.', 'Judge by how they normally work.'),
         ('One mistake is not a 1.', 'And do not raise the score because they fixed it after you told them. What they did before the correction is their real level.'),
         ('If you lose track of the procedure.', 'Each job has a “View field manual” link to its own procedure sheet.'),
         ('Redoing is fine.', 'Saved records can be edited from the history at any time.')],
    h05='The records',
    r05=[('History', 'Past assessments in a list. Tap one to see every point score and comment.'),
         ('Charts', 'Pick a person to see the average over time and a 5-point radar chart laid over the previous session. What has improved and what has stalled shows at a glance.'),
         ('CSV export', 'One row per point. Use it for totals and reports.'),
         ('Backup', 'Records stay only on that device. They do not appear on anyone else’s. Take a backup now and then from the Settings tab (password OOIRI).')],
    h06='Tell the person beforehand',
    r06=[('Which jobs you will watch.', 'Do not hide it.'),
         ('What the scores mean.', '3 is “does it when told”; from 4 they work on their own.'),
         ('This is not an exam to fail people.', 'It decides what they learn next.')],
    h07='Job list (40 jobs)',
    note07='Under each job are the five points you watch.',
    catct='{n} jobs',
    foot1='Criteria are based on Mutsuzawa farm’s “Purpose and cautions for each job” and the field manual.',
    foot2='Data version {v} · 40 jobs, 200 points',
)

T['vi'] = dict(
    label='VI', eyebrow='HSS PRACTICAL EXAM V2 · MUTSUZAWA FARM', h1='Sổ tay chấm thi thực hành',
    lede='Sổ tay dành cho người chấm thi. Chỉ ghi cách chấm điểm và cách tiến hành trong ngày.',
    applink='Mở ứng dụng chấm điểm',
    h01='Bài kiểm tra này đo điều gì',
    thesis='Có làm đúng công việc mà không cần ai nhắc không.',
    p01='Đây không phải kiểm tra kiến thức. Chúng ta xem cách làm thực tế tại trại. 7 lĩnh vực, 40 công việc. Mỗi công việc có 5 mục cố định để xem, mỗi mục chấm từ 1 đến 5 điểm.',
    h02='Cách chấm điểm',
    p02='Ý nghĩa của điểm giống nhau ở cả 200 mục của 40 công việc. Chỉ dựa vào một điều: <strong>cần người khác giúp đến mức nào.</strong>',
    lv=['Không làm. Không kiểm tra. Không giao được.',
        'Nói thì làm được, nhưng hay thiếu sót và bỏ qua.',
        'Khi được nhắc thì làm chắc chắn.',
        'Không cần nhắc cũng tự nhận ra và làm. Có bất thường thì tìm nguyên nhân.',
        'Hiểu vì sao phải làm như vậy, và dạy được cho người mới.'],
    qintro='Khi phân vân, chỉ cần hỏi ba câu này.',
    q=[('Không ai nhắc, có làm không?', 'Không → 3 trở xuống'),
       ('Được nhắc thì có làm chắc chắn không?', 'Không → 2 trở xuống'),
       ('Có dạy được cho người khác không?', 'Có → 5')],
    call1='<strong>3 không phải là mức đạt yêu cầu.</strong> 3 nghĩa là chắc chắn, nhưng phải chờ người khác nhắc.',
    call2='Giao việc được một mình là từ 4 trở lên. Hiểu nhầm chỗ này thì toàn bộ đánh giá sẽ dễ dãi.',
    h03='Tiến hành trong ngày',
    steps=[('Chọn công việc cần đánh giá', ['Chọn công việc theo từng lĩnh vực. Có thể chọn nhiều cùng lúc. Mỗi lần khoảng 3 đến 5 công việc.']),
           ('Cho làm thật', ['Để người đó làm và đứng bên cạnh quan sát. Không chấm điểm chỉ bằng hỏi miệng.']),
           ('Chấm từng mục', ['Mở “Xem tiêu chuẩn (Mức 1–5)” sẽ thấy năm câu của mục đó. <strong>Chọn câu gần nhất với điều vừa nhìn thấy.</strong> Không chấm theo cảm tính.']),
           ('Viết nhận xét', ['Chỉ có điểm thì người đó không biết lần sau phải làm gì. Mục nào từ 3 điểm trở xuống thì bắt buộc phải viết.'])],
    step5=('Lưu lại', 'Nhập ngày, tên người đánh giá và tên người được đánh giá rồi lưu. <strong>Chưa chấm đủ tất cả các mục thì không lưu được.</strong>'),
    egok='TỐT', egng='KHÔNG TỐT',
    egokt='Không kiểm tra nước ở núm uống. Ba núm không ra nước.',
    egngt='Hãy cố gắng thêm một chút.',
    h04='Quy định khi phân vân',
    r04=[('Không chấm điều mình không nhìn thấy.', 'Hoặc bỏ công việc đó ra, hoặc cho làm rồi mới chấm.'),
         ('Không chấm theo một ngày may rủi.', 'Đánh giá theo cách làm thường ngày.'),
         ('Một lần sai không phải là 1 điểm.', 'Ngược lại, nhắc xong sửa được cũng không nâng điểm. Cách làm trước khi được nhắc mới là thực lực.'),
         ('Nếu quên mất trình tự.', 'Mỗi công việc có liên kết “Xem sổ tay hiện trường” dẫn tới bản hướng dẫn của công việc đó.'),
         ('Làm lại thoải mái.', 'Bản ghi đã lưu có thể sửa bất cứ lúc nào từ mục lịch sử.')],
    h05='Cách xử lý bản ghi',
    r05=[('Lịch sử', 'Các lần đánh giá trước hiện thành danh sách. Bấm vào sẽ thấy điểm và nhận xét của từng mục.'),
         ('Biểu đồ', 'Chọn một người sẽ thấy điểm trung bình theo thời gian và biểu đồ radar 5 mục chồng lên lần trước. Mục nào tiến bộ, mục nào đứng yên nhìn là biết.'),
         ('Xuất CSV', 'Mỗi dòng là một mục. Dùng để tổng hợp và làm báo cáo.'),
         ('Sao lưu', 'Bản ghi chỉ nằm trong máy đó. Máy người khác không có. Thỉnh thoảng hãy sao lưu ở thẻ Cài đặt (mật khẩu OOIRI).')],
    h06='Nói trước với người được đánh giá',
    r06=[('Sẽ xem những công việc nào.', 'Không giấu.'),
         ('Ý nghĩa của điểm.', '3 là “được nhắc thì làm được”, từ 4 là làm được một mình.'),
         ('Đây không phải kỳ thi để đánh trượt.', 'Đây là để quyết định lần tới học gì.')],
    h07='Danh sách công việc (40 công việc)',
    note07='Bên dưới mỗi công việc là năm mục sẽ xem.',
    catct='{n} công việc',
    foot1='Tiêu chuẩn đánh giá dựa trên “Mục đích và điểm lưu ý của từng công việc” của trại Mutsuzawa và sổ tay hiện trường.',
    foot2='Phiên bản dữ liệu {v} · 40 công việc, 200 mục',
)

T['id'] = dict(
    label='ID', eyebrow='HSS PRACTICAL EXAM V2 · MUTSUZAWA FARM', h1='Panduan Ujian Praktik',
    lede='Panduan untuk orang yang menguji. Isinya hanya cara memberi nilai dan jalannya hari ujian.',
    applink='Buka aplikasi penilaian',
    h01='Yang diukur dalam ujian ini',
    thesis='Bisakah pekerjaan dilakukan dengan benar tanpa diberi tahu?',
    p01='Ini bukan ujian pengetahuan. Yang dilihat adalah cara kerja nyata di kandang. 7 bidang, 40 pekerjaan. Setiap pekerjaan punya 5 poin tetap yang dilihat, dan tiap poin dinilai 1 sampai 5.',
    h02='Cara memberi nilai',
    p02='Arti nilai sama untuk seluruh 200 poin dari 40 pekerjaan. Hanya satu yang menentukan: <strong>seberapa besar bantuan orang lain yang masih dibutuhkan.</strong>',
    lv=['Tidak dikerjakan. Tidak diperiksa. Tidak bisa diserahkan.',
        'Kalau disuruh bisa, tetapi sering ada yang terlewat.',
        'Kalau disuruh, dikerjakan dengan pasti.',
        'Tanpa disuruh pun sadar sendiri dan mengerjakannya. Kalau ada yang tidak beres, dicari penyebabnya.',
        'Paham alasannya, dan bisa mengajari karyawan baru.'],
    qintro='Kalau ragu, cukup tiga pertanyaan ini.',
    q=[('Tanpa disuruh, apakah dikerjakan?', 'Tidak → 3 ke bawah'),
       ('Kalau disuruh, apakah pasti dikerjakan?', 'Tidak → 2 ke bawah'),
       ('Bisakah mengajari orang lain?', 'Ya → 5')],
    call1='<strong>3 bukan batas lulus.</strong> 3 berarti pasti bisa, tetapi menunggu disuruh.',
    call2='Bisa diserahkan sendiri mulai dari 4. Kalau ini keliru dipahami, semua penilaian jadi terlalu longgar.',
    h03='Jalannya pada hari ujian',
    steps=[('Tentukan pekerjaan yang dinilai', ['Pilih pekerjaan per bidang. Bisa memilih beberapa sekaligus. Sekitar 3 sampai 5 pekerjaan sekali ujian.']),
           ('Minta dikerjakan langsung', ['Biarkan mengerjakan dan lihat dari samping. Jangan menilai hanya dari tanya jawab.']),
           ('Beri nilai tiap poin', ['Buka “Lihat kriteria (Level 1–5)” untuk melihat lima kalimat poin itu. <strong>Pilih kalimat yang paling dekat dengan yang baru saja dilihat.</strong> Jangan menilai dari kesan.']),
           ('Tulis komentar', ['Nilai saja tidak memberi tahu apa yang harus dilakukan berikutnya. Poin yang bernilai 3 ke bawah wajib diberi catatan.'])],
    step5=('Simpan', 'Isi tanggal, nama penilai, dan nama yang dinilai, lalu simpan. <strong>Selama masih ada poin yang belum dinilai, data tidak bisa disimpan.</strong>'),
    egok='BAIK', egng='BURUK',
    egokt='Aliran air di nipel tidak diperiksa. Tiga nipel tidak keluar air.',
    egngt='Tolong lebih semangat lagi.',
    h04='Ketentuan saat ragu',
    r04=[('Jangan menilai yang tidak dilihat.', 'Keluarkan pekerjaan itu, atau minta dikerjakan dulu baru dinilai.'),
         ('Jangan menilai dari kebetulan hari itu.', 'Nilailah dari cara kerja sehari-hari.'),
         ('Satu kesalahan bukan berarti nilai 1.', 'Sebaliknya, jangan menaikkan nilai hanya karena langsung diperbaiki setelah ditegur. Cara kerja sebelum ditegur itulah kemampuan sebenarnya.'),
         ('Kalau lupa urutannya.', 'Tiap pekerjaan punya tautan “Lihat manual lapangan” ke panduan pekerjaan itu.'),
         ('Boleh diulang.', 'Catatan yang sudah disimpan bisa diperbaiki kapan saja dari riwayat.')],
    h05='Pengelolaan catatan',
    r05=[('Riwayat', 'Penilaian sebelumnya tampil sebagai daftar. Ditekan akan muncul nilai dan komentar tiap poin.'),
         ('Grafik', 'Pilih seorang untuk melihat rata-rata dari waktu ke waktu dan grafik radar 5 poin yang ditumpuk dengan penilaian sebelumnya. Poin yang naik dan yang berhenti langsung terlihat.'),
         ('Ekspor CSV', 'Satu baris satu poin. Dipakai untuk rekap dan laporan.'),
         ('Cadangan', 'Catatan hanya tersimpan di perangkat itu. Tidak muncul di perangkat orang lain. Sesekali buat cadangan dari tab Pengaturan (kata sandi OOIRI).')],
    h06='Sampaikan lebih dulu kepada yang dinilai',
    r06=[('Pekerjaan apa saja yang akan dilihat.', 'Jangan disembunyikan.'),
         ('Arti nilai.', '3 berarti “kalau disuruh bisa”, mulai 4 sudah bisa sendiri.'),
         ('Ini bukan ujian untuk menggugurkan.', 'Ini untuk menentukan apa yang dipelajari berikutnya.')],
    h07='Daftar pekerjaan (40 pekerjaan)',
    note07='Di bawah tiap pekerjaan adalah lima poin yang dilihat.',
    catct='{n} pekerjaan',
    foot1='Kriteria penilaian berdasarkan “Tujuan dan hal yang perlu diperhatikan tiap pekerjaan” peternakan Mutsuzawa dan manual lapangan.',
    foot2='Versi data {v} · 40 pekerjaan, 200 poin',
)


def loc(o, f, lang):
    """works-v2.js と同じ規則: 訳が無ければ日本語原文。"""
    if lang != 'ja':
        v = o.get(f + '_' + lang)
        if v:
            return v
    return o.get(f, '')


def works_html(lang):
    out = []
    for ci, c in enumerate(DATA['categories']):
        ws = [w for w in DATA['works'] if w['category'] == c['id']]
        out.append('<section class="cat"><h3 class="cat-h"><span class="cat-nm">%s</span>'
                   '<span class="cat-ct">%s</span></h3><ul class="wl">'
                   % (e(CAT[lang][ci]), e(T[lang]['catct'].format(n=len(ws)))))
        for w in ws:
            chips = ''.join('<li>%s</li>' % e(loc(a, 'name', lang)) for a in w['aspects'])
            out.append('<li class="w"><p class="w-hd"><span class="w-no">%s</span>'
                       '<span class="w-nm">%s</span></p><p class="w-pp">%s</p>'
                       '<ul class="asp">%s</ul></li>'
                       % (e(w['no'].replace('No.', '')), e(loc(w, 'name', lang)),
                          e(loc(w, 'purposeShort', lang)), chips))
        out.append('</ul></section>')
    return '\n'.join(out)


def body(lang):
    t = T[lang]
    h = []
    a = h.append
    a('<header class="mast"><p class="eyebrow">%s</p><h1>%s</h1><p class="lede">%s</p>'
      '<a class="applink" href="https://shoichiokada225-sys.github.io/pig-farm-evaluation-v2/" '
      'target="_blank" rel="noopener">%s</a></header>'
      % (e(t['eyebrow']), e(t['h1']), e(t['lede']), e(t['applink'])))

    a('<section><h2><span class="num">01</span>%s</h2><p class="thesis">%s</p><p>%s</p></section>'
      % (e(t['h01']), e(t['thesis']), e(t['p01'])))

    a('<section><h2><span class="num">02</span>%s</h2><p>%s</p><ul class="ladder">' % (e(t['h02']), t['p02']))
    for i in range(5):
        a('<li style="--rail:var(--s%d)"><span class="lv lv%d">%d</span>'
          '<span class="lv-nm">%s</span><span class="lv-tx">%s</span></li>'
          % (i + 1, i + 1, i + 1, e(LVNAME[lang][i]), e(t['lv'][i])))
    a('</ul><p style="margin-top:26px">%s</p><ol class="qs">' % e(t['qintro']))
    for q, v in t['q']:
        a('<li>%s　<span class="verdict">%s</span></li>' % (e(q), e(v)))
    a('</ol><div class="callout"><p>%s</p><p>%s</p></div></section>' % (t['call1'], t['call2']))

    a('<section><h2><span class="num">03</span>%s</h2><ol class="steps">' % e(t['h03']))
    for i, (hd, ps) in enumerate(t['steps']):
        a('<li><h3>%s</h3>%s' % (e(hd), ''.join('<p>%s</p>' % p for p in ps)))
        if i == 3:
            a('<p class="eg"><b>%s</b>%s</p><p class="eg ng"><b>%s</b>%s</p>'
              % (e(t['egok']), e(t['egokt']), e(t['egng']), e(t['egngt'])))
        a('</li>')
    a('<li><h3>%s</h3><p>%s</p></li></ol></section>' % (e(t['step5'][0]), t['step5'][1]))

    for num, hk, rk in [('04', 'h04', 'r04'), ('05', 'h05', 'r05'), ('06', 'h06', 'r06')]:
        a('<section><h2><span class="num">%s</span>%s</h2><ul class="rules">' % (num, e(t[hk])))
        for b, tx in t[rk]:
            a('<li><b>%s</b>%s</li>' % (e(b), e(tx)))
        a('</ul></section>')

    a('<section><h2><span class="num">07</span>%s</h2><p class="note">%s</p>%s</section>'
      % (e(t['h07']), e(t['note07']), works_html(lang)))

    v = DATA['version']
    a('<footer><p>%s</p><p>%s</p></footer>'
      % (e(t['foot1']), e(t['foot2'].format(v=v))))
    return '\n'.join(h)


CSS = io.open(os.path.join(ROOT, 'docs', 'tebiki.css'), encoding='utf-8').read()

parts = ['<title>HSS実技試験 手引き</title>',
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
         'family=Zen+Kaku+Gothic+New:wght@500;700;900&family=Noto+Sans+JP:wght@400;500;700'
         '&family=Noto+Sans:wght@400;500;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap">',
         '<style>\n%s\n</style>' % CSS,
         '<nav class="lsw" aria-label="Language">'
         + ''.join('<button type="button" data-go="%s"%s>%s</button>'
                   % (L, ' class="on" aria-current="true"' if L == 'ja' else '', T[L]['label'])
                   for L in LANGS)
         + '</nav>']

for L in LANGS:
    parts.append('<div class="wrap" lang="%s" data-l="%s"%s>\n%s\n</div>'
                 % (L, L, '' if L == 'ja' else ' hidden', body(L)))

parts.append("""<script>
(function(){
  var LS='tebiki_lang';
  var btns=[].slice.call(document.querySelectorAll('.lsw button'));
  var pages=[].slice.call(document.querySelectorAll('.wrap[data-l]'));
  function go(l){
    if(!pages.some(function(p){return p.dataset.l===l}))return;
    pages.forEach(function(p){p.hidden=p.dataset.l!==l});
    btns.forEach(function(b){
      var on=b.dataset.go===l;
      b.classList.toggle('on',on);
      if(on)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');
    });
    document.documentElement.lang=l;
    try{localStorage.setItem(LS,l)}catch(e){}
  }
  btns.forEach(function(b){b.addEventListener('click',function(){go(b.dataset.go)})});
  var saved=null;try{saved=localStorage.getItem(LS)}catch(e){}
  if(saved&&saved!=='ja')go(saved);
})();
</script>""")

io.open(os.path.join(ROOT, 'docs', 'tebiki.html'), 'w', encoding='utf-8').write('\n'.join(parts) + '\n')
print('built: 4 langs x %d works' % len(DATA['works']))
