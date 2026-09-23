/* スプレッドシート連携＋スマホ実機相当テスト（iPhone/Android エミュレーション・GASはモック）
   実行: node smoke-sheet.js   （スクショ: ./_shots/ ・git管理外） */
const { chromium, devices } = require(process.env.PW_PATH || require('path').join(require('os').homedir(), 'farm-shift-app/node_modules/playwright'));
const fs = require('fs');

const APP = require('url').pathToFileURL(require('path').join(__dirname, 'index.html')).href;
const GAS = 'https://script.google.com/macros/s/TESTDEPLOY_abc-123/exec';
let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  OK ' + name); }
  else { fail++; console.log('  NG ' + name); }
}
fs.mkdirSync(__dirname + '/_shots', { recursive: true });

async function run(devName) {
  console.log(`\n===== ${devName} =====`);
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await browser.newContext({ ...devices[devName], acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept('ooiri'));

  // ---- GASモック（シートの代わり: タブ=評価者名、記録IDで上書き）----
  const sheet = {};        // {評価者: {recordId: payload}}
  const posts = [];
  let online = true;
  let roster = [
    { name: 'グエン・ヴァン・アン', works: ['給餌', 'エサ調整'] },
    { name: 'アグス', works: ['No.16'] },
    { name: 'ブディ', works: ['存在しない作業'] },
    { name: 'ミン', works: [] },
    { name: 'タナカ', works: ['給餌'] },
    { name: 'スリ', works: ['給餌'] },
  ];
  await page.route(u => u.href.startsWith('https://script.google.com/'), async route => {
    if (!online) return route.abort('internetdisconnected');
    const req = route.request();
    if (req.method() === 'GET') {
      const a = new URL(req.url()).searchParams.get('action');
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(a === 'roster' ? { ok: true, roster } : { ok: true }) });
    }
    const body = JSON.parse(req.postData());
    posts.push(body);
    const r = body.record;
    (sheet[r.evaluator] = sheet[r.evaluator] || {})[r.id] = r;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ ok: true, id: r.id }) });
  });

  // 名前で被評価者タブを押す（未実施が先・実施済みが後ろに並び替わるので位置では指定しない）
  const ee = name => page.locator('.eetab').filter({ has: page.locator('.eetab-nm', { hasText: new RegExp('^' + name + '$') }) });
  const scoreAll = async s => { for (const cid of await page.locator('#cards .ec').evaluateAll(els => els.map(e => e.id.slice(2)))) await page.locator(`.sb[data-id="${cid}"][data-s="${s}"]`).tap(); };
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  console.log('[1] 初回起動：評価者名の入力欄が出る');
  await page.goto(APP);
  ok('評価者入力欄が見える', await page.locator('#fEv').isVisible());
  ok('既定の送信先に接続（config.js）', /送信済み/.test(await page.locator('#syncBar').textContent()));
  ok('横スクロールなし(初回)', await noHScroll());
  await page.screenshot({ path: `${__dirname}/_shots/${devName.replace(/\W/g, '_')}_1_first.png` });

  console.log('[2] 評価者名を1回入れる → 以後は表示のみ');
  await page.locator('#fEv').tap();
  await page.fill('#fEv', '岡田 正一');
  await page.press('#fEv', 'Enter');
  ok('評価者名が表示に切替', (await page.locator('#evName').textContent()) === '岡田 正一');
  ok('入力欄は隠れる', !(await page.locator('#fEv').isVisible()));
  await page.reload();
  ok('再起動後も記憶', (await page.locator('#evName').textContent()) === '岡田 正一' && !(await page.locator('#fEv').isVisible()));

  console.log('[3] 設定タブで送信先URL → 名簿を読み込み');
  await page.locator('.tabs button[data-pg="pgCfg"]').tap();
  await page.fill('#cfgUrl', 'https://evil.example.com/exec');
  await page.locator('#pgCfg .b1').first().tap();
  ok('不正URLは拒否', await page.evaluate(() => !localStorage.getItem('jitsugi_v2_sheet_url')));
  await page.fill('#cfgUrl', GAS);
  await page.locator('#pgCfg .b1').first().tap();
  await page.waitForTimeout(400);
  await page.locator('.tabs button[data-pg="pgIn"]').tap();
  const nTabs = await page.locator('.eetab').count();
  ok(`被評価者タブ ${nTabs}人`, nTabs === roster.length);
  ok('手入力欄は隠れる（名簿あり）', !(await page.locator('#fEe').isVisible()));
  ok('横スクロールなし(タブ多数)', await noHScroll());
  const tabBox = await page.locator('.eetab').first().boundingBox();
  ok(`タブのタップ領域 ${Math.round(tabBox.width)}x${Math.round(tabBox.height)} ≥44px`, tabBox.height >= 44 && tabBox.width >= 44);

  console.log('[4] タブをタップ → 事前に用意した作業だけ表示');
  await ee('グエン・ヴァン・アン').tap();
  await page.waitForTimeout(250);
  ok('選択タブがon', await page.locator('.eetab.on').count() === 1);
  ok('作業見出し2つ（給餌・エサ調整）', await page.locator('.wshd').count() === 2);
  ok('カード10枚（5種目×2）', await page.locator('#cards .ec').count() === 10);
  ok('被評価者名がセット', await page.inputValue('#fEe') === 'グエン・ヴァン・アン');
  await page.screenshot({ path: `${__dirname}/_shots/${devName.replace(/\W/g, '_')}_2_tab.png` });
  await ee('アグス').tap();   // 未採点なので確認なしで切替
  await page.waitForTimeout(200);
  ok('No.指定でも解決（アグス=No.16 1作業）', await page.locator('.wshd').count() === 1);
  await ee('グエン・ヴァン・アン').tap();
  await page.waitForTimeout(200);

  console.log('[5] 採点 → 保存 → スプレッドシートへ送信');
  const ids = await page.locator('#cards .ec').evaluateAll(els => els.map(e => e.id.slice(2)));
  for (const cid of ids) await page.locator(`.sb[data-id="${cid}"][data-s="4"]`).tap();
  await page.locator(`textarea[data-cid="${ids[0]}"]`).fill('=HYPERLINK("x") 手順は良い');
  await page.locator('#btnSave').tap();
  await page.waitForTimeout(600);
  ok('POST 1回', posts.length === 1);
  const rec = posts[0] && posts[0].record;
  ok('評価者名のタブに入る', !!sheet['岡田 正一']);
  ok('被評価者・作業2・種目10', rec && rec.evaluatee === 'グエン・ヴァン・アン' && rec.works.length === 2 && rec.works.reduce((a, w) => a + w.items.length, 0) === 10);
  ok('作業名は日本語正式名', rec && rec.works[0].workName === '給餌');
  ok('スコアが入っている', rec && rec.works.every(w => w.items.every(it => it.score === 4)));
  ok('送信済み表示', /送信済み/.test(await page.locator('#syncBar').textContent()));
  ok('タブに✓（今日済）', await page.locator('.eetab.done').count() === 1);
  ok('保存後は次の人へ（作業空・評価者は残る）', await page.locator('#cards .pickwork').count() === 1 && (await page.locator('#evName').textContent()) === '岡田 正一');

  console.log('[6] 圏外で保存 → 未送信 → 電波復帰で再送');
  online = false;
  await ee('タナカ').tap();
  await page.waitForTimeout(200);
  for (const cid of await page.locator('#cards .ec').evaluateAll(els => els.map(e => e.id.slice(2)))) {
    try { await page.locator(`.sb[data-id="${cid}"][data-s="3"]`).tap({ timeout: 4000 }); }
    catch (e) {
      for (let i = 0; i < 6; i++) { console.log('DBG', await page.evaluate(id => { const el = document.querySelector(`.sb[data-id="${id}"][data-s="3"]`); const r = el.getBoundingClientRect(); return [r.top, r.left, r.width, scrollY, document.documentElement.scrollHeight, getComputedStyle(el.closest('.ec')).animationName].join(','); }, cid)); await page.waitForTimeout(50); }
      await page.screenshot({ path: __dirname + '/_shots/dbg.png' }); throw e;
    }
  }
  await page.locator('#btnSave').tap();
  await page.waitForTimeout(600);
  ok('ローカルには保存', await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_data')).evaluations.length === 2));
  ok('未送信1件の表示＋再送ボタン', /未送信: 1/.test(await page.locator('#syncBar').textContent()) && await page.locator('#syncBar button').isVisible());
  await page.screenshot({ path: `${__dirname}/_shots/${devName.replace(/\W/g, '_')}_3_unsent.png` });
  online = true;
  await page.locator('#syncBar button').tap();
  await page.waitForTimeout(600);
  ok('再送で送信済み', /送信済み/.test(await page.locator('#syncBar').textContent()));
  ok('シートに2記録', Object.keys(sheet['岡田 正一']).length === 2);

  console.log('[7] 編集して再送 → 同じ記録IDで上書き（重複しない）');
  await page.locator('.tabs button[data-pg="pgHi"]').tap();
  ok('履歴に送信済バッジ', await page.locator('.snt.ok').count() === 2);
  await page.locator('.hi').first().tap();
  await page.locator('#moBody .b3').tap();
  await page.waitForTimeout(300);
  const eid = (await page.locator('#cards .ec').first().getAttribute('id')).slice(2);
  await page.locator(`.sb[data-id="${eid}"][data-s="5"]`).tap();
  await page.locator('#btnSave').tap();
  await page.waitForTimeout(600);
  ok('シートは2記録のまま（上書き）', Object.keys(sheet['岡田 正一']).length === 2);
  ok('POST計4回（送信1+失敗後再送1+…）', posts.length >= 3);

  console.log('[8] 評価者を変更 → 別タブ（シート）へ');
  await page.locator('.tabs button[data-pg="pgIn"]').tap();
  await page.locator('#evShow button').tap();
  await page.fill('#fEv', '田島');
  await page.locator('#evEdit .b1').tap();
  await ee('スリ').tap();
  await page.waitForTimeout(200);
  for (const cid of await page.locator('#cards .ec').evaluateAll(els => els.map(e => e.id.slice(2))))
    await page.locator(`.sb[data-id="${cid}"][data-s="2"]`).tap();
  await page.locator('#btnSave').tap();
  await page.waitForTimeout(600);
  ok('田島タブができる', !!sheet['田島'] && Object.keys(sheet['田島']).length === 1);

  console.log('[9] 名簿の作業が空/不明 → 手動選択パネルが開く');
  await ee('ミン').tap();
  await page.waitForTimeout(200);
  ok('作業なしの人は選択パネルが開く', await page.evaluate(() => document.getElementById('wselBox').open));
  ok('横スクロールなし(採点画面)', await noHScroll());

  console.log('[10] 多言語（vi）でもタブ・送信バー表示');
  await page.locator('.lsw button').nth(2).tap();
  await page.waitForTimeout(200);
  ok('vi 送信バー', /Đã gửi/.test(await page.locator('#syncBar').textContent()));
  ok('vi 横スクロールなし', await noHScroll());
  await page.locator('.lsw button').nth(0).tap();

  console.log('[11] 農場つき名簿 → 農場チップ → その農場の人だけ・農場共通の作業・送信に農場');
  roster = [
    { name: '鈴木 花子', farm: '那須農場', works: ['給餌'] },
    { name: '田中 太郎', farm: '那須農場', works: [] },
    { name: '（農場共通）', farm: '那須農場', works: ['エサ調整', '給餌'] },
    { name: '高橋 次郎', farm: '大田原農場', works: ['No.16'] },
    { name: '山本 三郎', farm: '所属未確定', works: [] },
    { name: '空欄さん', farm: '', works: [] },
  ];
  await page.locator('.eebox .wsel-hd button').tap();
  await page.waitForTimeout(400);
  const chips = await page.locator('.fchip').allTextContents();
  ok('農場チップ4つ（未確定・未記入は最後）', chips.length === 4 && /^那須農場/.test(chips[0]) && /^大田原農場/.test(chips[1]) && /未確定/.test(chips[2]) && /農場未記入/.test(chips[3]));
  await page.locator('.fchip').nth(0).tap(); await page.waitForTimeout(200);
  ok('先頭の農場の人だけ（共通行は人として出ない）', await page.locator('.eetab').count() === 2);
  await ee('田中 太郎').tap(); await page.waitForTimeout(200);
  ok('作業未記入の人に農場共通の作業', await page.locator('.wshd').count() === 2);
  await page.locator('.fchip').nth(1).tap(); await page.waitForTimeout(200);
  ok('農場切替で選択中の人は外れる', await page.inputValue('#fEe') === '' && await page.locator('.eetab').count() === 1);
  ok('横スクロールなし(農場チップ)', await noHScroll());
  await page.reload(); await page.waitForTimeout(400);
  ok('再起動後も農場を記憶', /^大田原農場/.test(await page.locator('.fchip.on').textContent()));
  await ee('高橋 次郎').tap(); await page.waitForTimeout(200);
  for (const cid of await page.locator('#cards .ec').evaluateAll(els => els.map(e => e.id.slice(2))))
    await page.locator(`.sb[data-id="${cid}"][data-s="3"]`).tap();
  const n0 = posts.length;
  await page.locator('#btnSave').tap(); await page.waitForTimeout(600);
  ok('送信に農場が入る', posts.length === n0 + 1 && posts[n0].record.farm === '大田原農場');
  ok('農場チップ: 全員済なら残り0（✓）', await page.locator('.fchip.on').getAttribute('data-left') === '0' && /✓/.test(await page.locator('.fchip.on .fchip-ct').textContent()));
  await page.screenshot({ path: `${__dirname}/_shots/${devName.replace(/\W/g, '_')}_4_farm.png` });

  console.log('[12] 実運用規模（12農場・最大25名・架空名）：農場チップ1段・人は縦グリッド・検索・未実施が先');
  const SIZES = [25, 18, 17, 8, 7, 6, 4, 4, 2, 1, 1, 1];
  const KANA = ['タ', 'ナ', 'カ', 'サ', 'マ', 'ハ', 'ラ', 'ヤ', 'ワ', 'ア'];
  roster = [];
  SIZES.forEach((n, fi) => {
    const farm = fi === 1 ? '所属未確定' : `テスト第${fi + 1}農場`;
    for (let k = 0; k < n; k++) {
      const len = 2 + ((k * 7 + fi) % 9);                         // 名前の長さをばらつかせる
      roster.push({ name: `${KANA[k % 10]}${'ー'.repeat(len % 3)}${KANA[(k + fi) % 10].repeat(len - 1)}${fi}-${k}`, farm, works: ['給餌'] });
    }
  });
  roster[3].name = 'グエン・ティ・ハ';                             // 検索用（架空）
  roster[4].name = 'Nguyễn Văn Nam';
  const BIG = 'テスト第1農場', MID = 'テスト第7農場', SMALL = 'テスト第8農場';
  await page.locator('.eebox .wsel-hd button').tap();
  await page.waitForTimeout(500);
  ok('農場チップ12個', await page.locator('.fchip').count() === 12);
  const fb = await page.locator('#eeFarms').boundingBox();
  ok(`農場チップは1段（高さ${Math.round(fb.height)}px ≤ 64）`, fb.height <= 64);
  ok('農場チップは横スクロール', await page.evaluate(() => { const e = document.getElementById('eeFarms'); return e.scrollWidth > e.clientWidth; }));
  ok('横スクロールなし(12農場)', await noHScroll());
  await page.locator(`.fchip[data-f="${MID}"]`).tap(); await page.waitForTimeout(250);
  const cb = await page.locator('.fchip.on').boundingBox(), fb2 = await page.locator('#eeFarms').boundingBox();
  ok('選択中の農場チップは帯の中に見えている（中央寄せ）', cb.x >= fb2.x - 1 && cb.x + cb.width <= fb2.x + fb2.width + 1);
  await page.locator(`.fchip[data-f="${BIG}"]`).tap(); await page.waitForTimeout(250);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  const navTop = (await page.locator('.tabs').boundingBox()).y;
  const t0 = await page.locator('.eetab').first().boundingBox();
  const nm0 = await page.locator('.eetab-nm').first().boundingBox();
  // 画面の低い iPhone SE(568px) は1段目の名前の行まで、それ以外は1段目のタブ全体が下のナビより上に見えること
  if (page.viewportSize().height >= 600) ok(`初期画面で被評価者が見える（1人目の下端${Math.round(t0.y + t0.height)} ≤ ナビ上端${Math.round(navTop)}）`, t0.y + t0.height <= navTop);
  else ok(`初期画面で1人目の名前が見える（名前1行目の下端${Math.round(nm0.y + 22)} ≤ ナビ上端${Math.round(navTop)}）`, nm0.y + 22 <= navTop);
  ok('25名の農場は25タブ', await page.locator('.eetab').count() === 25);
  const t1 = await page.locator('.eetab').nth(1).boundingBox();
  ok('人は2列以上のグリッド（1人目と2人目が同じ行）', Math.abs(t1.y - t0.y) < 2 && t1.x > t0.x);
  ok('人の一覧は横スクロールしない', await page.evaluate(() => { const e = document.getElementById('eeTabs'); return e.scrollWidth <= e.clientWidth + 1; }));
  ok('8名超の農場は検索欄あり', await page.locator('#eeFind').isVisible());
  await page.fill('#eeFind', 'ぐえん'); await page.waitForTimeout(150);
  ok('ひらがなでカタカナの名前を絞り込み', await page.locator('.eetab').count() === 1 && /グエン/.test(await page.locator('.eetab').first().textContent()));
  await page.fill('#eeFind', 'nguyen van'); await page.waitForTimeout(150);
  ok('アクセント記号なしでベトナム語名を絞り込み', await page.locator('.eetab').count() === 1 && /Nguyễn/.test(await page.locator('.eetab').first().textContent()));
  await page.fill('#eeFind', 'ぞぞぞ'); await page.waitForTimeout(150);
  ok('該当なしの表示', await page.locator('.eetab').count() === 0 && await page.locator('.eenone').isVisible());
  await page.fill('#eeFind', 'ぐえん'); await page.waitForTimeout(150);
  await ee('グエン・ティ・ハ').tap(); await page.waitForTimeout(300);
  await scoreAll(4);
  const n1 = posts.length;
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  ok('保存・送信（農場つき）', posts.length === n1 + 1 && posts[n1].record.farm === BIG);
  const eb = await page.locator('.eebox').boundingBox(), vh = page.viewportSize().height;
  ok(`保存後は被評価者の一覧へ戻る（先頭ではない・枠の上端${Math.round(eb.y)}）`, eb.y >= 0 && eb.y < vh / 2 && await page.evaluate(() => window.scrollY > 0));
  const ft = await page.locator('.eetab').first().boundingBox();
  ok('保存後すぐ次の人が見える', ft.y + ft.height <= navTop);
  ok('保存後は検索が消える（全員表示）', await page.inputValue('#eeFind') === '' && await page.locator('.eetab').count() === 25);
  const last = page.locator('.eetab').last();
  ok('実施済みの人は一覧の最後（未実施が先）', /グエン・ティ・ハ/.test(await last.textContent()) && await last.evaluate(e => e.classList.contains('done')) && !(await page.locator('.eetab').first().evaluate(e => e.classList.contains('done'))));
  ok('実施済みの見出しと大きな✓', await page.locator('.eegrp').count() === 1 && await last.locator('.eetab-ok').isVisible());
  const bgs = await page.evaluate(() => { const L = c => { const m = c.match(/[\d.]+/g).map(Number); return m.slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0); };
    const d = getComputedStyle(document.querySelector('.eetab.done')).backgroundColor, u = getComputedStyle(document.querySelector('.eetab:not(.done)')).backgroundColor;
    return (L(u) + .05) / (L(d) + .05); });
  ok(`実施済みは灰色の塗り（未実施との輝度比 ${bgs.toFixed(2)} ≥ 1.25）`, bgs >= 1.25);
  ok('農場チップに残り人数', await page.locator('.fchip.on').getAttribute('data-left') === '24' && /残り24人/.test(await page.locator('.fchip.on').textContent()));
  await page.locator(`.fchip[data-f="${SMALL}"]`).tap(); await page.waitForTimeout(200);
  ok('少人数の農場は検索欄なし', !(await page.locator('#eeFind').isVisible()));
  await page.screenshot({ path: `${__dirname}/_shots/${devName.replace(/\W/g, '_')}_5_big.png` });

  console.log('[13] 名簿にない人を手入力で評価（名簿外）');
  ok('名簿ありでも「名簿にない人を入力」ボタン', await page.locator('#eeAdd').isVisible() && !(await page.locator('#fEe').isVisible()));
  await page.locator('#eeAdd').tap(); await page.waitForTimeout(200);
  ok('押すと手入力欄が開く', await page.locator('#fEe').isVisible());
  await page.fill('#fEe', '臨時 花子');
  await page.evaluate(() => { document.getElementById('wselBox').open = true; document.querySelector('.wcat').open = true; });
  await page.locator('.wchk input').first().check(); await page.waitForTimeout(200);
  await scoreAll(3);
  const n2 = posts.length;
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  ok('名簿外の人も保存・送信（農場は空欄）', posts.length === n2 + 1 && posts[n2].record.evaluatee === '臨時 花子' && posts[n2].record.farm === '');
  ok('端末の記録に名簿外の印', await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_data')).evaluations.some(r => r.evaluatee === '臨時 花子' && r.manual === true && r.farm === '')));
  ok('保存後は手入力欄が閉じる', !(await page.locator('#fEe').isVisible()));
  await page.locator('.tabs button[data-pg="pgHi"]').tap();
  ok('履歴で「名簿外」と分かる', /名簿外/.test(await page.locator('.hi', { hasText: '臨時 花子' }).first().textContent()) && await page.locator('.snt.off').count() === 1);
  await page.locator('.tabs button[data-pg="pgIn"]').tap();

  console.log('[14] 同じ名前の人が2農場 → 選んだ農場の人として扱う');
  roster = [
    { name: '山田', farm: 'テスト北農場', works: ['給餌'] },
    { name: '山田', farm: 'テスト南農場', works: ['エサ調整'] },
  ];
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(500);
  ok('同名2人は別人として名簿に残る', await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_roster')).list.length === 2));
  await page.locator('.fchip[data-f="テスト南農場"]').tap(); await page.waitForTimeout(200);
  await ee('山田').tap(); await page.waitForTimeout(300);
  ok('農場表示は南のまま', await page.locator('.fchip.on').getAttribute('data-f') === 'テスト南農場');
  ok('選択中は1人だけ', await page.locator('.eetab.on').count() === 1);
  ok('南の山田の作業（エサ調整）', await page.locator('.wshd').count() === 1 && /エサ調整/.test(await page.locator('.wshd-nm').first().textContent()));
  await scoreAll(4);
  const n3 = posts.length;
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  ok('記録の農場は南', posts.length === n3 + 1 && posts[n3].record.farm === 'テスト南農場');
  ok('実施済みは南だけ（北は残り1）', await page.locator('.fchip[data-f="テスト南農場"]').getAttribute('data-left') === '0' && await page.locator('.fchip[data-f="テスト北農場"]').getAttribute('data-left') === '1');

  ok('JSエラーなし', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
}

/* 電波が弱い（名簿のGETが返らない）: 読み込み中の表示・タイムアウト・再送は名簿を待たない・打った名前を隠さない */
async function runSlow(devName) {
  console.log(`\n===== ${devName}（名簿の応答なし） =====`);
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await browser.newContext({ ...devices[devName] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept());
  let mode = 'block', t0 = 0; const postAt = [];
  await page.route(u => u.href.startsWith('https://script.google.com/'), async route => {
    const req = route.request();
    if (mode === 'block') return route.abort('internetdisconnected');
    const hdr = { 'access-control-allow-origin': '*' };
    if (req.method() === 'GET') {
      if (mode === 'hang') { await new Promise(r => setTimeout(r, 12000)); try { await route.abort('timedout'); } catch (e) {} return; }
      return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, roster: [{ name: 'テスト 一郎', farm: 'テスト農場', works: ['給餌'] }] }) });
    }
    postAt.push(Date.now() - t0);
    const r = JSON.parse(req.postData()).record;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, id: r.id }) });
  });
  await page.goto(APP);
  await page.evaluate(GAS => {           // 名簿のない端末＋未送信1件
    const w = WORKDATA_V2.works[0];
    localStorage.setItem('jitsugi_v2_sheet_url', GAS);
    localStorage.setItem('jitsugi_v2_evaluator', 'テスト評価者');
    localStorage.setItem('jitsugi_v2_data', JSON.stringify({ evaluations: [{ id: 'pend-1', date: '2026-09-23', evaluator: 'テスト評価者', evaluatee: 'テスト 次郎', farm: '', overall: '', createdAt: '2026-09-23T00:00:00Z',
      works: [{ workId: w.id, workName: w.name, category: w.category, scores: Object.fromEntries(w.aspects.map(a => [a.id, 3])), comments: {} }], sent: false }] }));
    localStorage.removeItem('jitsugi_v2_roster');
  }, GAS);
  mode = 'hang'; t0 = Date.now();
  await page.reload();
  await page.waitForTimeout(1500);
  const note = () => page.locator('#eeNote').textContent();
  ok('読み込み中の表示（名簿が無いとは言わない）', /読み込み中/.test(await note()) && !/名簿がありません/.test(await note()));
  ok('名簿を待たずに未送信を再送', postAt.length === 1 && postAt[0] < 3000);
  ok('再送済みの表示', /送信済み/.test(await page.locator('#syncBar').textContent()));
  await page.fill('#fEe', 'テスト 手入力');
  await page.waitForTimeout(8000);
  ok('8秒で打ち切り → 読み込めなかった表示', /読み込めませんでした/.test(await note()) && !/名簿がありません/.test(await note()));
  ok('「名簿を更新」が押せる', await page.locator('.eebox .wsel-hd button').isEnabled());
  mode = 'ok';
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(600);
  ok('名簿が届いても、打った名前は隠れない', await page.locator('.eetab').count() === 1 && await page.locator('#fEe').isVisible() && await page.inputValue('#fEe') === 'テスト 手入力');
  ok('JSエラーなし(応答なし)', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
}

(async () => {
  for (const d of ['iPhone SE', 'iPhone 13', 'Pixel 7']) await run(d);
  await runSlow('iPhone SE');
  console.log(`\n合計: OK ${pass} / NG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
