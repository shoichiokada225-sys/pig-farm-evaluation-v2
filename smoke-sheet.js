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
// GASモックは本物の GAS（gas/Code.src.gs）と同じ版・機能を名乗る（契約の正本=js/contract.js。手書きの値を持たない）
const GAS_SRC = fs.readFileSync(__dirname + '/gas/Code.src.gs', 'utf8');
const GAS_META = { version: /CODE_VERSION = '([^']+)'/.exec(GAS_SRC)[1], capabilities: JSON.parse(/API_CAPABILITIES = (\[[^\]]*\])/.exec(GAS_SRC)[1].replace(/'/g, '"')) };
const rosterRes = (roster, meta) => ({ ok: true, ...(meta || GAS_META), roster });

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
        body: JSON.stringify(a === 'roster' ? (roster === 'NOSHEET' ? { ok: false, ...GAS_META, error: 'no roster sheet' } : rosterRes(roster)) : { ok: true, ...GAS_META }) });
    }
    const body = JSON.parse(req.postData());
    posts.push(body);
    if (body.action === 'delete') {   // 本物の GAS と同じ: 全ての評価者タブからその記録IDを消す
      let n = 0; Object.values(sheet).forEach(tab => { if (body.id in tab) { delete tab[body.id]; n++; } });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, id: body.id, deleted: n }) });
    }
    if (body.action !== 'submit') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, error: 'unknown action' }) });
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
    { name: 'テスト 甲太', farm: '那須農場', works: ['給餌'] },
    { name: 'テスト 乙彦', farm: '那須農場', works: [] },
    { name: '（農場共通）', farm: '那須農場', works: ['エサ調整', '給餌'] },
    { name: 'テスト 丙介', farm: '大田原農場', works: ['No.16'] },
    { name: 'テスト 丁子', farm: '所属未確定', works: [] },
    { name: '空欄さん', farm: '', works: [] },
  ];
  await page.locator('.eebox .wsel-hd button').tap();
  await page.waitForTimeout(400);
  const chips = await page.locator('.fchip').allTextContents();
  ok('農場チップ4つ（未確定・未記入は最後）', chips.length === 4 && /^那須農場/.test(chips[0]) && /^大田原農場/.test(chips[1]) && /未確定/.test(chips[2]) && /農場未記入/.test(chips[3]));
  await page.locator('.fchip').nth(0).tap(); await page.waitForTimeout(200);
  ok('先頭の農場の人だけ（共通行は人として出ない）', await page.locator('.eetab').count() === 2);
  await ee('テスト 乙彦').tap(); await page.waitForTimeout(200);
  ok('作業未記入の人に農場共通の作業', await page.locator('.wshd').count() === 2);
  await page.locator('.fchip').nth(1).tap(); await page.waitForTimeout(200);
  ok('農場切替で選択中の人は外れる', await page.inputValue('#fEe') === '' && await page.locator('.eetab').count() === 1);
  ok('横スクロールなし(農場チップ)', await noHScroll());
  await page.reload(); await page.waitForTimeout(400);
  ok('再起動後も農場を記憶', /^大田原農場/.test(await page.locator('.fchip.on').textContent()));
  await ee('テスト 丙介').tap(); await page.waitForTimeout(200);
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

  console.log('[15] 名簿の整合: 作業名の表記ゆれ・不明作業・共通の印・同名異人（架空名）');
  const HIGASHI = 'テスト東農場', NISHI = 'テスト西農場', NAM = 'Nguyen Van Nam';
  roster = [
    { name: '（農場共通）', farm: HIGASHI, works: ['給餌', '除フン'] },
    { name: 'テスト 次郎', farm: HIGASHI, works: ['えつけ'] },                                   // 正式名は「えつけ（哺乳期給餌）」→不明
    { name: 'テスト 三郎', farm: HIGASHI, works: ['CSF(豚熱)子ワクチン接種', '給餌'] },              // 半角かっこ
    { name: 'テスト 四郎', farm: HIGASHI, works: ['妊娠舎→交配舎・育成舎　移動', 'えつけ(哺乳期給餌)', 'ＰＭＳ投与'] },   // 全角空白・半角かっこ・全角英字
    { name: 'テスト 五郎', farm: HIGASHI, works: [] },
    { name: 'テスト 六郎', farm: HIGASHI, works: ['給餌', '謎の作業'] },                           // 一部だけ不明
    { name: NAM, farm: HIGASHI, works: ['治療'] },
    { name: NAM, farm: HIGASHI, works: ['消毒'] },                                              // 同じ農場の同名2行目
    { name: NAM, farm: NISHI, works: ['去勢'] },
  ];
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(500);
  const toast15 = await page.locator('#toast').textContent();
  const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_roster')));
  const P = n => cache.list.filter(p => p.name === n);
  ok('表記ゆれを解決（全角空白・半角かっこ・全角英字）', P('テスト 四郎')[0].works.join() === 'move-preg,nursing-feed,pms' && !P('テスト 四郎')[0].unresolved);
  ok('半角かっこのCSFも落ちない', P('テスト 三郎')[0].works.join() === 'csf-vaccine,feeding-daily' && !P('テスト 三郎')[0].unresolved);
  const jiro = P('テスト 次郎')[0];
  ok('不明作業の人に共通行を当てない（原文を保持）', jiro.works.length === 0 && !jiro.common && jiro.unresolved.join() === 'えつけ');
  ok('一部不明の人も共通行を当てず、解決できた作業は残す', P('テスト 六郎')[0].works.join() === 'feeding-daily' && P('テスト 六郎')[0].unresolved.join() === '謎の作業' && !P('テスト 六郎')[0].common);
  ok('作業未設定の人は共通行（common印）', P('テスト 五郎')[0].common === true && P('テスト 五郎')[0].works.join() === 'feeding-daily,dung-removal');
  ok('トーストに人名つき・全件数', /テスト 次郎: えつけ/.test(toast15) && /テスト 六郎: 謎の作業/.test(toast15) && /\(2\)/.test(toast15));
  ok('同じ農場の同名は警告（2行目は黙って消さない）', /同名/.test(toast15) && /Nguyen Van Nam（テスト東農場）/.test(toast15) && cache.dup.length === 1);
  ok('農場が違う同名は別人として残る', P(NAM).length === 2 && P(NAM).some(p => p.farm === NISHI));
  await page.locator(`.fchip[data-f="${HIGASHI}"]`).tap(); await page.waitForTimeout(200);
  ok('名簿の警告が画面に残る', await page.locator('#eeWarn').isVisible() && /テスト 次郎: えつけ/.test(await page.locator('#eeWarn').textContent()));
  ok('不明作業のタブに「⚠ 作業名不明: えつけ」', /⚠ 作業名不明: えつけ/.test(await ee('テスト 次郎').textContent()));
  ok('共通の人のタブに「共通」の印', await ee('テスト 五郎').locator('.eetab-cm').count() === 1 && await ee('テスト 三郎').locator('.eetab-cm').count() === 0);
  await ee('テスト 六郎').tap(); await page.waitForTimeout(300);
  ok('不明作業のある人を選ぶと作業選択が開いたまま（解決分は選択済み）', await page.evaluate(() => document.getElementById('wselBox').open) && await page.locator('.wshd').count() === 1);
  await ee('テスト 次郎').tap(); await page.waitForTimeout(300);
  ok('全部不明の人は作業0・作業選択が開く', await page.evaluate(() => document.getElementById('wselBox').open) && await page.locator('.wshd').count() === 0);
  ok('横スクロールなし(警告表示)', await noHScroll());
  // 同名異人（東と西の Nguyen Van Nam）をそれぞれ採点 → 履歴・グラフ・CSVで分かれる
  await ee(NAM).tap(); await page.waitForTimeout(300);
  await scoreAll(2); await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  await page.locator(`.fchip[data-f="${NISHI}"]`).tap(); await page.waitForTimeout(200);
  await ee(NAM).tap(); await page.waitForTimeout(300);
  await scoreAll(5); await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  await page.locator('.tabs button[data-pg="pgHi"]').tap(); await page.waitForTimeout(200);
  const hOpts = await page.locator('#hFil option').allTextContents();
  ok('履歴の絞り込みは同名を農場で区別', hOpts.includes(NAM + '（' + HIGASHI + '）') && hOpts.includes(NAM + '（' + NISHI + '）') && !hOpts.includes(NAM));
  ok('同名でない人は名前だけ', hOpts.includes('テスト 丙介'));
  await page.locator('#hFil').selectOption({ label: NAM + '（' + NISHI + '）' }); await page.waitForTimeout(200);
  ok('西のNamだけ（1件・東と合算しない）', await page.locator('.hi').count() === 1 && /5\.0/.test(await page.locator('.hia').first().textContent()));
  await page.locator('#hFil').selectOption(''); await page.waitForTimeout(100);
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.locator('.tabs button[data-pg="pgCh"]').dispatchEvent('click'); await page.waitForTimeout(200);
  await page.locator('#chSel').selectOption({ label: NAM + '（' + HIGASHI + '）' }); await page.waitForTimeout(400);
  ok('グラフも東のNamだけ（平均2）', await page.evaluate(() => cL && cL.data.datasets[0].data.length === 1 && cL.data.datasets[0].data[0] === 2));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => doCSV())]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  const csvHead = csv.split('\n')[0];
  ok('CSVに農場列・名簿外列', /"被評価者","農場","名簿外"/.test(csvHead));
  ok('CSVで同名を農場で分けられる', csv.includes(`"${NAM}","${NISHI}",""`) && csv.includes(`"${NAM}","${HIGASHI}",""`) && csv.includes('"臨時 花子","","名簿外"'));
  await page.locator('.tabs button[data-pg="pgIn"]').tap();

  console.log('[16] キャッシュから起動（名簿を取り直せない）でも警告は残る');
  online = false;
  await page.reload(); await page.waitForTimeout(600);
  ok('圏外で起動しても警告が見える', await page.locator('#eeWarn').isVisible() && /テスト 次郎: えつけ/.test(await page.locator('#eeWarn').textContent()));
  await page.locator(`.fchip[data-f="${HIGASHI}"]`).tap(); await page.waitForTimeout(200);
  ok('圏外で起動しても不明作業のタブ表示', /作業名不明/.test(await ee('テスト 次郎').textContent()));
  online = true;

  console.log('[17] シートの名簿が空・受験者タブが無い → 前回の名簿を残す');
  const nBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_roster')).list.length);
  roster = [];
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(500);
  ok('空の名簿で上書きしない', await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_roster')).list.length) === nBefore && nBefore > 0);
  ok('「シートの名簿が空でした（前回の名簿を表示中）」', /名簿が空でした（前回の名簿を表示中）/.test(await page.locator('#toast').textContent()) && /名簿が空でした/.test(await page.locator('#eeWarn').textContent()));
  ok('人のタブは残る', await page.locator('.eetab').count() > 0);
  roster = [{ name: '（農場共通）', farm: HIGASHI, works: ['給餌'] }];   // 共通行だけ＝人は0人
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(500);
  ok('共通行だけ（人0人）でも上書きしない', await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_roster')).list.length) === nBefore);
  roster = 'NOSHEET';
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(500);
  ok('受験者タブが無い → 名簿は残し、タブが無いと知らせる（前回の名簿がある時だけ「前回の名簿を表示中」）', await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_roster')).list.length) === nBefore && /「受験者」タブがありません.*setup.*（前回の名簿を表示中）/.test(await page.locator('#toast').textContent()));
  ok('受験者タブが無い → #eeWarn に残る・同期バーは緑の「送信済み」にしない（E12-1）', /setup/.test(await page.locator('#eeWarn').textContent()) && await page.locator('#eeWarn').isVisible() && !/すべてスプレッドシートに送信済み/.test(await page.locator('#syncBar').textContent()));
  roster = [{ name: 'テスト 七郎', farm: HIGASHI, works: ['給餌'] }];
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(500);
  ok('名簿が戻れば新しい名簿に更新・警告は消える', await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_roster')).list.length) === 1 && !(await page.locator('#eeWarn').isVisible()));

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
      return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify(rosterRes([{ name: 'テスト 一郎', farm: 'テスト農場', works: ['給餌'] }])) });
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

/* オフライン・送信の信頼性（架空名）: 送信中の保存の取りこぼし・失敗件数の誠実さ・自動再送・削除のシート反映・名簿の古さ */
async function runRel(devName) {
  console.log(`\n===== ${devName}（送信の信頼性） =====`);
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await browser.newContext({ ...devices[devName] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  const sheet = {};              // {recordId: payload}
  const posts = [];
  let online = true, postDelay = 0, failFor = null, oldGas = false, gasMeta = null;
  let roster = [
    { name: 'テスト 甲太', farm: 'テスト那須', works: ['給餌'] },
    { name: 'テスト 乙彦', farm: 'テスト那須', works: ['給餌'] },
    { name: 'テスト 丙介', farm: 'テスト那須', works: ['給餌'] },
  ];
  await page.route(u => u.href.startsWith('https://script.google.com/'), async route => {
    if (!online) return route.abort('internetdisconnected');
    const req = route.request(), hdr = { 'access-control-allow-origin': '*' };
    if (req.method() === 'GET') {
      const a = new URL(req.url()).searchParams.get('action');
      return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify(a === 'roster' ? rosterRes(roster, gasMeta) : { ok: true, ...GAS_META }) });
    }
    const body = JSON.parse(req.postData());
    posts.push(body);
    if (postDelay) await new Promise(r => setTimeout(r, postDelay));
    if (body.action === 'delete') {
      if (oldGas) return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: false, error: 'bad request' }) });
      const had = body.id in sheet; delete sheet[body.id];
      return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, id: body.id, deleted: had ? 1 : 0 }) });
    }
    const r = body.record;
    if (failFor && r.evaluatee === failFor) return route.abort('connectionreset');
    sheet[r.id] = r;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, id: r.id }) });
  });
  const ee = name => page.locator('.eetab').filter({ has: page.locator('.eetab-nm', { hasText: new RegExp('^' + name + '$') }) });
  const scoreAll = async s => { for (const cid of await page.locator('#cards .ec').evaluateAll(els => els.map(e => e.id.slice(2)))) await page.locator(`.sb[data-id="${cid}"][data-s="${s}"]`).tap(); };
  const saveEe = async (name, s) => { await ee(name).tap(); await page.waitForTimeout(200); await scoreAll(s); await page.locator('#btnSave').tap(); };
  const recs = () => page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_data') || '{"evaluations":[]}').evaluations);
  const toastTx = () => page.locator('#toast').textContent();
  await page.goto(APP);
  await page.evaluate(GAS => { localStorage.clear(); localStorage.setItem('jitsugi_v2_sheet_url', GAS); localStorage.setItem('jitsugi_v2_evaluator', 'テスト評価者'); }, GAS);
  await page.reload(); await page.waitForTimeout(600);

  console.log('[R1] 送信中に保存した記録も同じ送信で送る・失敗と言わない');
  online = false;
  await saveEe('テスト 甲太', 3); await page.waitForTimeout(500);
  ok('圏外で保存 → 未送信1', /未送信: 1/.test(await page.locator('#syncBar').textContent()));
  online = true; postDelay = 2500;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));   // 電波が戻った
  await page.waitForTimeout(300);
  ok('送信中の表示', /送信中/.test(await page.locator('#syncBar').textContent()));
  await saveEe('テスト 乙彦', 4);                                          // 送信中に次の人を保存
  await page.waitForTimeout(6500);
  const r1 = await recs();
  ok('送信中に保存した記録も送信済み（2件とも）', r1.length === 2 && r1.every(r => r.sent === true));
  ok('POSTは2件（二重送信なし）', posts.filter(p => p.action === 'submit').length === 2 && Object.keys(sheet).length === 2);
  ok('「送信できなかった」と出さない', !/送信できなかった/.test(await toastTx()) && /すべてスプレッドシートに送信済み/.test(await page.locator('#syncBar').textContent()));
  postDelay = 0;

  console.log('[R2] 失敗の件数は実際に失敗した分だけ');
  failFor = 'テスト 丙介';
  await saveEe('テスト 丙介', 2); await page.waitForTimeout(800);
  ok('失敗1件だけを「送信できなかった (1)」', /送信できなかった.*\(1\)/.test(await toastTx()) && /未送信: 1/.test(await page.locator('#syncBar').textContent()));

  console.log('[R3] 電波が弱い→強い（online イベント無し）でも自動で再送');
  failFor = null;
  const nb = posts.length;
  ok('起動時から周期の再送が動いている（60秒）', await page.evaluate(() => retryT !== null && SYNC_RETRY_MS === 60000));
  await page.evaluate(() => { SYNC_RETRY_MS = 700; schedRetry(); });
  await page.waitForTimeout(2000);
  ok('周期の再送で送信済み（ボタンを押さない）', (await recs()).every(r => r.sent) && posts.length > nb);
  await page.evaluate(() => { SYNC_RETRY_MS = 600000; schedRetry(); });
  failFor = 'テスト 甲太';
  await page.locator('.tabs button[data-pg="pgHi"]').tap();
  await page.locator('.hi', { hasText: 'テスト 甲太' }).first().tap();
  await page.locator('#moBody .b3').tap(); await page.waitForTimeout(300);
  const eid = (await page.locator('#cards .ec').first().getAttribute('id')).slice(2);
  await page.locator(`.sb[data-id="${eid}"][data-s="5"]`).tap();
  await page.locator('#btnSave').tap(); await page.waitForTimeout(800);
  ok('編集の送信が失敗 → 未送信1', /未送信: 1/.test(await page.locator('#syncBar').textContent()));
  failFor = null;
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(800);
  ok('アプリが前面に戻った時に再送', (await recs()).every(r => r.sent) && sheet[(await recs()).find(r => r.evaluatee === 'テスト 甲太').id].works[0].items[0].score === 5);

  console.log('[R4] 送信済みの記録を削除 → シートの行も消す（圏外なら削除待ち）');
  await page.locator('.tabs button[data-pg="pgHi"]').tap();
  const kotaId = (await recs()).find(r => r.evaluatee === 'テスト 甲太').id;
  dialogs.length = 0;
  await page.locator('.hi', { hasText: 'テスト 甲太' }).first().tap();
  await page.locator('#moBody .bt-danger').tap(); await page.waitForTimeout(800);
  ok('確認文にシートの行と記録IDを出す', dialogs.length === 1 && /スプレッドシート/.test(dialogs[0]) && dialogs[0].includes(kotaId));
  ok('シートからも消える', !(kotaId in sheet) && posts.some(p => p.action === 'delete' && p.id === kotaId));
  ok('端末からも消え、削除待ちは残らない', !(await recs()).some(r => r.id === kotaId) && await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_deletes') || '[]').length === 0));
  online = false;
  const otsuId = (await recs()).find(r => r.evaluatee === 'テスト 乙彦').id;
  await page.locator('.hi', { hasText: 'テスト 乙彦' }).first().tap();
  await page.locator('#moBody .bt-danger').tap(); await page.waitForTimeout(800);
  ok('圏外で削除 → シートの削除待ち1（すべて送信済みと言わない）', /シートの削除待ち: 1/.test(await page.locator('#syncBar').textContent()) && otsuId in sheet);
  await page.reload(); await page.waitForTimeout(600);
  ok('削除待ちは再起動しても残る', /シートの削除待ち: 1/.test(await page.locator('#syncBar').textContent()));
  online = true;
  await page.locator('#syncBar button').tap(); await page.waitForTimeout(800);
  ok('電波が戻れば削除される', !(otsuId in sheet) && /すべてスプレッドシートに送信済み/.test(await page.locator('#syncBar').textContent()));
  // シート側が古い版（削除に未対応）→ 消えたと言わない
  oldGas = true;
  const heiId = (await recs()).find(r => r.evaluatee === 'テスト 丙介').id;
  await page.locator('.tabs button[data-pg="pgHi"]').tap();
  await page.locator('.hi', { hasText: 'テスト 丙介' }).first().tap();
  await page.locator('#moBody .bt-danger').tap(); await page.waitForTimeout(800);
  ok('GASが削除に未対応 → 未対応と知らせ、削除待ちに残す', /削除に未対応/.test(await toastTx()) && /シートの削除待ち: 1/.test(await page.locator('#syncBar').textContent()) && heiId in sheet);
  oldGas = false;
  await page.locator('.tabs button[data-pg="pgIn"]').tap();
  await page.locator('#syncBar button').tap(); await page.waitForTimeout(800);
  ok('GAS更新後の再送で削除される', !(heiId in sheet));
  // 一度も送っていない記録の削除はシートへ問い合わせない
  online = false;
  await page.locator('.tabs button[data-pg="pgIn"]').tap();
  await saveEe('テスト 甲太', 3); await page.waitForTimeout(500);
  online = true;
  const nd = posts.filter(p => p.action === 'delete').length;
  dialogs.length = 0;
  await page.locator('.tabs button[data-pg="pgHi"]').tap();
  await page.locator('.hi', { hasText: 'テスト 甲太' }).first().tap();
  await page.locator('#moBody .bt-danger').tap(); await page.waitForTimeout(500);
  ok('未送信の記録の削除は通常の確認・削除要求なし', !/スプレッドシート/.test(dialogs[0] || '') && posts.filter(p => p.action === 'delete').length === nd && (await recs()).length === 0);

  // 旧形式の記録（sentOnce も削除待ちキーも無い・送信済み）も、削除すればシートの行を消す
  await page.evaluate(() => { const w = WORKDATA_V2.works[0]; localStorage.removeItem('jitsugi_v2_deletes');
    localStorage.setItem('jitsugi_v2_data', JSON.stringify({ evaluations: [{ id: 'legacy-1', date: '2026-09-20', evaluator: 'テスト評価者', evaluatee: 'テスト 旧形式', farm: '', overall: '', createdAt: '2026-09-20T00:00:00Z',
      works: [{ workId: w.id, workName: w.name, category: w.category, scores: Object.fromEntries(w.aspects.map(a => [a.id, 3])), comments: {} }], sent: true }] })); });
  sheet['legacy-1'] = { id: 'legacy-1' };
  await page.reload(); await page.waitForTimeout(600);
  await page.locator('.tabs button[data-pg="pgHi"]').tap();
  await page.locator('.hi', { hasText: 'テスト評価者' }).first().tap();
  await page.locator('#moBody .bt-danger').tap(); await page.waitForTimeout(800);
  ok('旧形式の送信済み記録の削除もシートへ反映', !('legacy-1' in sheet) && (await recs()).length === 0);

  console.log('[R5] 名簿の取得日時と古さ');
  await page.locator('.tabs button[data-pg="pgIn"]').tap();
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(600);
  const at = await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_roster')).at);
  const d = new Date(at), hm = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const note = () => page.locator('#eeNote');
  ok('取得日時を常に表示', (await note().textContent()).includes('名簿: ' + hm + ' 取得') && !(await note().evaluate(e => e.classList.contains('eenote-stale'))));
  online = false;
  await page.reload(); await page.waitForTimeout(900);
  ok('圏外で起動 → 「前回の名簿（日時）・最新ではありません」を警告色', /前回の名簿（/.test(await note().textContent()) && (await note().textContent()).includes(hm) && /最新ではありません/.test(await note().textContent()) && await note().evaluate(e => e.classList.contains('eenote-stale')));
  await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('jitsugi_v2_roster')); r.at = new Date(Date.now() - 30 * 3600 * 1000).toISOString(); localStorage.setItem('jitsugi_v2_roster', JSON.stringify(r)); });
  await page.reload(); await page.waitForTimeout(900);
  ok('12時間より古い名簿で圏外起動 → トーストでも知らせる', /前回の名簿/.test(await toastTx()) && await page.locator('#toast').evaluate(e => e.classList.contains('show')));
  online = true;
  await page.reload(); await page.waitForTimeout(900);
  ok('取り直せれば警告は消える', !(await note().evaluate(e => e.classList.contains('eenote-stale'))) && /取得/.test(await note().textContent()));
  await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('jitsugi_v2_roster')); r.at = new Date(Date.now() - 30 * 3600 * 1000).toISOString(); localStorage.setItem('jitsugi_v2_roster', JSON.stringify(r)); renderRoster(); });
  ok('古い名簿を表示中は（取得失敗でなくても）警告色', /古い可能性/.test(await note().textContent()) && await note().evaluate(e => e.classList.contains('eenote-stale')));
  await page.locator('.lsw button').nth(2).tap(); await page.waitForTimeout(200);
  ok('vi でも名簿の古さの表示', /Danh sách/.test(await note().textContent()));
  await page.locator('.lsw button').nth(0).tap();

  console.log('[R6] シート側（GAS）が古い版 → 旧名・削除が使えないと画面に残す（C9-3 契約の版）');
  await page.locator('.tabs button[data-pg="pgIn"]').tap();
  const gw = page.locator('#eeWarn');
  ok('今の GAS（本物と同じ capabilities）なら版の警告は出ない', !(await gw.isVisible()) || !/古い版/.test(await gw.textContent()));
  gasMeta = { version: '2026-09-24b' };   // capabilities を返さない前の版
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(600);
  ok('古い GAS → #eeWarn に「シート側のプログラム（GAS）が古い版（2026-09-24b）・旧名・削除」', await gw.isVisible() && /古い版です（2026-09-24b）/.test(await gw.textContent()) && /旧名/.test(await gw.textContent()) && /削除/.test(await gw.textContent()));
  ok('名簿の取り直しのトーストでも知らせる', /古い版です/.test(await toastTx()));
  await page.reload(); await page.waitForTimeout(900);
  ok('再起動しても（キャッシュの名簿で）警告は残る', await gw.isVisible() && /古い版です/.test(await gw.textContent()));
  for (const [l, re] of [[1, /old version/], [2, /phiên bản cũ/], [3, /versi lama/]]) { await page.locator('.lsw button').nth(l).tap(); await page.waitForTimeout(100); ok(`${['', 'en', 'vi', 'id'][l]}: 古い GAS の警告が訳される`, re.test(await gw.textContent())); }
  await page.locator('.lsw button').nth(0).tap();
  gasMeta = { version: GAS_META.version, capabilities: GAS_META.capabilities.filter(c => c !== 'roster.aliases') };
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(600);
  ok('機能が1つ欠けても警告', /古い版です/.test(await gw.textContent()));
  gasMeta = null;
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(600);
  ok('GAS を更新すれば警告は消える', !(await gw.isVisible()) || !/古い版/.test(await gw.textContent()));

  // ---- 送信中の編集・削除（周10 T10-1/T10-2: 分岐を消すと気付かれずにシートと端末がずれる所） ----
  const fresh = async () => { online = true; postDelay = 0; await page.evaluate(() => { localStorage.removeItem('jitsugi_v2_data'); localStorage.removeItem('jitsugi_v2_deletes'); localStorage.removeItem('jitsugi_v2_draft'); }); await page.reload(); await page.waitForTimeout(600); };
  const barTx = () => page.locator('#syncBar').textContent();
  console.log('[R1b] 送信中に同じ記録を編集して保存 → 送信後に編集後の版を送り直す（古い点のまま「送信済み」にしない）');
  await fresh();
  online = false;
  await page.locator('.tabs button[data-pg="pgIn"]').tap();
  await saveEe('テスト 甲太', 3); await page.waitForTimeout(500);
  const e1Id = (await recs())[0].id;
  online = true; postDelay = 2500;
  const npE = posts.length;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));   // 3点の版の送信が飛行中
  await page.waitForTimeout(300);
  ok('R1b: 送信中', /送信中/.test(await barTx()));
  await page.evaluate(id => startEdit(id), e1Id); await page.waitForTimeout(200);
  const e1c = (await page.locator('#cards .ec').first().getAttribute('id')).slice(2);
  await page.locator(`.sb[data-id="${e1c}"][data-s="5"]`).tap();
  await page.locator('#btnSave').tap();                                     // 送信中に5点へ直して保存
  await page.waitForTimeout(6500);
  const subsE = posts.slice(npE).filter(p => p.action === 'submit' && p.record.id === e1Id);
  ok('R1b: 送信が終わった後のシートの点は編集後の5点', !!sheet[e1Id] && sheet[e1Id].works[0].items[0].score === 5);
  ok('R1b: 最後に送った版が編集後（3点→5点の順に2回）', subsE.length === 2 && subsE[0].record.works[0].items[0].score === 3 && subsE[subsE.length - 1].record.works[0].items[0].score === 5);
  ok('R1b: 端末は5点・送信済み・同期バーはすべて送信済み', await page.evaluate(id => { const r = getAll().find(x => x.id === id); return r.sent === true && Object.values(r.works[0].scores)[0] === 5; }, e1Id) && /すべてスプレッドシートに送信済み/.test(await barTx()));
  postDelay = 0;

  console.log('[R4b] 送信中に削除 → シートの行も消す・削除待ちの記録は後から送らない');
  await fresh();
  online = false;
  await saveEe('テスト 甲太', 3); await page.waitForTimeout(400);
  await saveEe('テスト 乙彦', 4); await page.waitForTimeout(400);
  const r4b = await recs();
  const kbId = r4b.find(r => r.evaluatee === 'テスト 甲太').id, obId = r4b.find(r => r.evaluatee === 'テスト 乙彦').id;
  ok('R4b: どちらも一度も送っていない（sent/sentOnce/updatedAt なし）', r4b.every(r => !r.sent && !r.sentOnce && !r.updatedAt));
  online = true; postDelay = 2500;
  const npD = posts.length;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));   // 甲太の初回送信が飛行中
  await page.waitForTimeout(300);
  ok('R4b: 送信中', /送信中/.test(await barTx()));
  dialogs.length = 0;
  await page.evaluate(id => doDel(id), kbId);                              // 飛行中の記録を消す
  await page.evaluate(id => doDel(id), obId);                              // まだ送っていない記録を消す
  ok('R4b: 送信中の削除は確認文がシートの行の削除版（記録ID入り）', dialogs.length === 2 && dialogs.every(d => /スプレッドシート/.test(d)) && dialogs[0].includes(kbId) && dialogs[1].includes(obId));
  await page.waitForTimeout(9000   /* 送信1＋削除2 = 2.5秒×3 */);
  ok('R4b: 送信中だった記録もシートに行が残らない', !(kbId in sheet) && posts.slice(npD).some(p => p.action === 'delete' && p.id === kbId));
  ok('R4b: 削除待ちに入った記録は後から送らない（submit 0回）', !posts.slice(npD).some(p => p.action === 'submit' && p.record.id === obId) && !(obId in sheet));
  ok('R4b: 端末0件・削除待ち0・すべて送信済み', (await recs()).length === 0 && await page.evaluate(() => getDels().length === 0) && /すべてスプレッドシートに送信済み/.test(await barTx()));
  postDelay = 0;

  ok('JSエラーなし(送信の信頼性)', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
}

/* 作業の割り当て運用（架空名）: 作業8つの人の採点画面（見出しの固定・作業ごとの x/5・目次・今回は実施しない・終わった作業だけ保存）
   一部の作業だけ保存した人は「途中 x/y」で残り、選び直すと残りの作業だけが出る／（農場共通）行の管理ミスを警告 */
async function runAssign(devName) {
  console.log(`\n===== ${devName}（作業の割り当て運用） =====`);
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await browser.newContext({ ...devices[devName] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const dialogs = [];
  let accept = true;
  page.on('dialog', d => { dialogs.push(d.message()); accept ? d.accept() : d.dismiss(); });
  const posts = [];
  const EIGHT = ['給餌', 'エサ調整', 'エサ回収', '去勢', '添加剤準備', '除フン', '5S清掃', '治療'];
  const EIGHT_ID = ['feeding-daily', 'feed-adjust', 'feed-recovery', 'castration', 'additive', 'dung-removal', 'five-s', 'treatment'];
  const FA = 'テスト農場A', FB = 'テスト農場B', FC = 'テスト農場C';
  let roster = [
    { name: 'テスト 八作', farm: FA, works: EIGHT },
    { name: 'テスト 三作', farm: FA, works: ['給餌', 'エサ調整', '除フン'] },
    { name: 'テスト 一作', farm: FA, works: ['給餌'] },
  ];
  await page.route(u => u.href.startsWith('https://script.google.com/'), async route => {
    const req = route.request(), hdr = { 'access-control-allow-origin': '*' };
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify(rosterRes(roster)) });
    const body = JSON.parse(req.postData()); posts.push(body);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, id: body.record.id }) });
  });
  const ee = name => page.locator('.eetab').filter({ has: page.locator('.eetab-nm', { hasText: new RegExp('^' + name + '$') }) });
  const scoreWork = async (wid, s, n = 5) => { const ids = await page.locator(`#cards .ec[data-w="${wid}"]`).evaluateAll(els => els.map(e => e.id.slice(2))); for (const cid of ids.slice(0, n)) await page.locator(`.sb[data-id="${cid}"][data-s="${s}"]`).tap(); };
  const recs = () => page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_data') || '{"evaluations":[]}').evaluations);
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  await page.goto(APP);
  await page.evaluate(GAS => { localStorage.clear(); localStorage.setItem('jitsugi_v2_sheet_url', GAS); localStorage.setItem('jitsugi_v2_evaluator', 'テスト評価者'); }, GAS);
  await page.reload(); await page.waitForTimeout(600);

  console.log('[A1] 作業8つの人: 目次・作業ごとの x/5・見出しの固定');
  await ee('テスト 八作').tap(); await page.waitForTimeout(300);
  ok('カード40枚', await page.locator('#cards .ec').count() === 40);
  ok('作業の目次に8作業（各 0/5）', await page.locator('#wnav .wnav-c').count() === 8 && (await page.locator('#wnav .wnav-ct').allTextContents()).every(x => x === '0/5'));
  ok('見出しに作業ごとの 0/5', (await page.locator('.wshd .wshd-ct').allTextContents()).length === 8 && await page.locator('#wh-feeding-daily .wshd-ct').textContent() === '0/5');
  ok('見出しは sticky', await page.locator('.wshd').first().evaluate(e => getComputedStyle(e).position === 'sticky'));
  await scoreWork('feeding-daily', 4, 3);
  ok('3枚採点 → 見出し・目次とも 3/5', await page.locator('#wh-feeding-daily .wshd-ct').textContent() === '3/5' && await page.locator('#wnav [data-wct="feeding-daily"]').textContent() === '3/5');
  await scoreWork('feeding-daily', 4);
  ok('5枚で ✓ 5/5', /✓ 5\/5/.test(await page.locator('#wnav [data-wct="feeding-daily"]').textContent()));
  // 6作業目のカードの途中までスクロール → 画面上部（進捗バーの下）に6作業目の見出しが貼り付いている
  await page.evaluate(() => { const c = document.querySelectorAll('#cards .ec[data-w="dung-removal"]')[2]; window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 250); });
  await page.waitForTimeout(300);
  const stuck = await page.evaluate(() => { const stk = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stk')); const el = document.elementFromPoint(innerWidth / 2, stk + 8); const h = el && el.closest('.wshd'); return { w: h && h.dataset.w, top: h && Math.round(h.getBoundingClientRect().top), stk }; });
  ok(`スクロール中も今の作業の見出しが上に見える（${stuck.w} top=${stuck.top} / 貼り付け位置${stuck.stk}）`, stuck.w === 'dung-removal' && Math.abs(stuck.top - stuck.stk) <= 2);
  const progBox = await page.locator('.prog').boundingBox(), hdBox = await page.locator('#wh-dung-removal').boundingBox();
  ok('見出しは進捗バーと重ならない', hdBox.y >= progBox.y + progBox.height - 1);
  await page.screenshot({ path: `${__dirname}/_shots/${devName.replace(/\W/g, '_')}_A1_sticky.png` });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('#wnav .wnav-c[data-w="five-s"]').tap(); await page.waitForTimeout(300);
  const jb = await page.locator('#wh-five-s').boundingBox(), vh = page.viewportSize().height;
  ok(`目次のチップで7作業目へ移動（見出しの上端 ${Math.round(jb.y)}）`, jb.y >= 0 && jb.y < vh / 2 && await page.evaluate(() => scrollY > 1000));
  ok('横スクロールなし(作業8つ)', await noHScroll());

  console.log('[A2] 今回は実施しない（その作業だけ外す）');
  dialogs.length = 0;
  await page.locator('.wsec[data-w="treatment"] .wshd-skip').tap(); await page.waitForTimeout(300);
  ok('未採点の作業は確認なしで外れる → 35枚・7作業', dialogs.length === 0 && await page.locator('#cards .ec').count() === 35 && await page.locator('#wnav .wnav-c').count() === 7);
  ok('外した作業の名前をトーストで知らせる', /治療/.test(await page.locator('#toast').textContent()));
  accept = false; dialogs.length = 0;
  await page.locator('.wsec[data-w="feeding-daily"] .wshd-skip').tap(); await page.waitForTimeout(300);
  ok('採点済みの作業は確認（キャンセルで残る）', dialogs.length === 1 && /給餌/.test(dialogs[0]) && await page.locator('#wh-feeding-daily').count() === 1);
  accept = true;
  ok('外しても採点は消えない', /✓ 5\/5/.test(await page.locator('#wnav [data-wct="feeding-daily"]').textContent()));

  console.log('[A3] 終わった作業だけ保存（途中保存）');
  for (const w of ['feed-adjust', 'feed-recovery', 'castration', 'additive']) await scoreWork(w, 3);
  await scoreWork('dung-removal', 3, 2);                   // 除フンは途中
  dialogs.length = 0;
  await page.locator('#btnSave').tap(); await page.waitForTimeout(400);
  ok('途中の作業があると保存しない（途中の作業の未採点3件だけ示す）', (await recs()).length === 0 && dialogs.length === 0 && /\(3\)/.test(await page.locator('#toast').textContent()));
  await scoreWork('dung-removal', 3);
  await page.evaluate(() => { window._toasts = []; const o = toast; toast = (m, e) => { _toasts.push(m); return o(m, e); }; });   // 送信完了のトーストで上書きされる前の文も拾う
  const n0 = posts.length;
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  ok('未採点の作業だけが残る時は確認して保存', dialogs.length === 1 && /5S清掃/.test(dialogs[0]) && /1件/.test(dialogs[0]));
  let r = await recs();
  ok('保存は採点済みの6作業だけ', r.length === 1 && r[0].works.map(w => w.workId).join() === 'feeding-daily,feed-adjust,feed-recovery,castration,additive,dung-removal' && r[0].works.every(w => Object.values(w.scores).every(v => v != null)));
  ok('送信も6作業', posts.length === n0 + 1 && posts[n0].record.works.length === 6);
  ok('「残りの作業 1件」', await page.evaluate(() => _toasts.some(m => /残りの作業 1件/.test(m))));

  console.log('[A4] 一部だけ済んだ人は「途中 x/y」で未実施側に残る・選び直すと残りの作業だけ');
  const tab8 = ee('テスト 八作');
  ok('タブは「途中 6/8」・実施済みにならない', /途中 6\/8/.test(await tab8.textContent()) && !(await tab8.evaluate(e => e.classList.contains('done'))) && await page.locator('.eegrp').count() === 0);
  ok('農場チップの残りは3人のまま', await page.locator('.fchip.on').getAttribute('data-left') === '3');
  await tab8.tap(); await page.waitForTimeout(300);
  ok('選び直すと残りの2作業（5S清掃・治療）だけ', await page.locator('.wshd').count() === 2 && (await page.locator('.wshd').evaluateAll(e => e.map(x => x.dataset.w))).join() === 'five-s,treatment');
  await page.evaluate(() => window.scrollTo(0, document.getElementById('cards').getBoundingClientRect().top + scrollY - 120)); await page.waitForTimeout(200);
  await page.screenshot({ path: `${__dirname}/_shots/${devName.replace(/\W/g, '_')}_A4_left.png` });
  ok('済んだ6作業は目次に「✓ 済」で出る（押せない）', await page.locator('#wnav .wnav-c.done').count() === 6 && /✓ 済/.test(await page.locator('#wnav .wnav-c.done').first().textContent()) && await page.locator('#wnav button.wnav-c.done').count() === 0);
  await page.evaluate(() => { document.getElementById('wselBox').open = true; document.querySelectorAll('.wcat').forEach(c => c.open = true); });
  ok('作業選択にも「済」の印', await page.locator('.wchk-dn').count() === 6);
  await scoreWork('five-s', 5); await scoreWork('treatment', 5);
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  ok('残りを保存すると実施済み（8/8）', await ee('テスト 八作').evaluate(e => e.classList.contains('done')) && await page.locator('.fchip.on').getAttribute('data-left') === '2');

  console.log('[A5] 3作業の人で1作業を外して保存 → 途中 2/3 → 残り1作業');
  await ee('テスト 三作').tap(); await page.waitForTimeout(300);
  await page.locator('.wsec[data-w="feed-adjust"] .wshd-skip').tap(); await page.waitForTimeout(200);
  await scoreWork('feeding-daily', 4); await scoreWork('dung-removal', 4);
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  ok('記録は2作業', (await recs()).find(x => x.evaluatee === 'テスト 三作').works.length === 2);
  ok('タブは「途中 2/3」・農場チップの残り2人', /途中 2\/3/.test(await ee('テスト 三作').textContent()) && await page.locator('.fchip.on').getAttribute('data-left') === '2');
  await ee('テスト 三作').tap(); await page.waitForTimeout(300);
  ok('選び直すとエサ調整だけ（カード5枚）', await page.locator('#cards .ec').count() === 5 && await page.locator('#wh-feed-adjust').count() === 1);
  // 旧形式の記録（農場なし）も作業で数える
  await page.evaluate(() => { const w = WORKDATA_V2.works.find(x => x.id === 'feeding-daily'); const all = JSON.parse(localStorage.getItem('jitsugi_v2_data')).evaluations;
    all.push({ id: 'legacy-a', date: document.getElementById('fDate').value, evaluator: 'テスト評価者', evaluatee: 'テスト 一作', farm: '', overall: '', createdAt: '2026-09-20T00:00:00Z', works: [{ workId: w.id, workName: w.name, category: w.category, scores: Object.fromEntries(w.aspects.map(a => [a.id, 3])), comments: {} }], sent: true });
    localStorage.setItem('jitsugi_v2_data', JSON.stringify({ evaluations: all })); renderRoster(); });
  ok('農場列の無い旧記録も作業で数えて実施済み', await ee('テスト 一作').evaluate(e => e.classList.contains('done')));
  await page.locator('.lsw button').nth(2).tap(); await page.waitForTimeout(200);
  ok('vi: 見出しの「今回は実施しない」・途中表示', /Lần này không làm/.test(await page.locator('.wshd-skip').first().textContent()) && await noHScroll());
  await page.locator('.lsw button').nth(0).tap(); await page.waitForTimeout(200);

  console.log('[A6] （農場共通）行の管理ミスを警告');
  accept = true;
  roster = [
    { name: '（農場共通）', farm: FB, works: ['給餌', '不明作業X', '除フン'] },
    { name: '（農場共通）', farm: FB, works: ['治療'] },                   // 同じ農場の2行目
    { name: 'テスト 未設定B', farm: FB, works: [] },
    { name: '（農場共通）', farm: FC, works: ['エサ調整'] },                 // 半角C
    { name: 'テスト 未設定C', farm: 'テスト農場Ｃ', works: [] },               // 全角Ｃ
    { name: '（農場共通）', farm: 'テスト農場Z', works: ['給餌'] },            // 誰とも一致しない
    { name: 'テスト 八作', farm: FA, works: EIGHT },
  ];
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(600);
  const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_roster')));
  const B = cache.list.find(p => p.name === 'テスト 未設定B'), C = cache.list.find(p => p.name === 'テスト 未設定C');
  ok('共通行2行は統合（後の行で前の行を消さない）', B.works.join() === 'feeding-daily,dung-removal,treatment' && B.common === true);
  ok('共通行の不明作業は人にも残す', (B.unresolved || []).join() === '不明作業X');
  ok('農場名の全角半角ゆれでも共通行を当てる', C.works.join() === 'feed-adjust' && C.common === true);
  const warn = await page.locator('#eeWarn').textContent();
  ok('警告: 共通行が2行', /（農場共通）行が2行以上/.test(warn) && warn.includes(FB));
  ok('警告: 名簿の農場と一致しない共通行', /一致しません/.test(warn) && warn.includes('テスト農場Z') && !/一致しません[^／]*テスト農場C/.test(warn));
  ok('警告: 共通行の不明作業は農場名つき', /（農場共通）（テスト農場B）: 不明作業X/.test(warn));
  await page.locator(`.fchip[data-f="${FB}"]`).tap(); await page.waitForTimeout(200);
  ok('共通の人のタブにも ⚠ 作業名不明', /⚠ 作業名不明: 不明作業X/.test(await ee('テスト 未設定B').textContent()) && await ee('テスト 未設定B').locator('.eetab-cm').count() === 1);
  await ee('テスト 未設定B').tap(); await page.waitForTimeout(300);
  ok('選ぶと解決分3作業＋作業選択が開く', await page.locator('.wshd').count() === 3 && await page.evaluate(() => document.getElementById('wselBox').open));
  ok('旧形式の名簿キャッシュ（cdup/corphan無し）でも警告表示が落ちない', await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('jitsugi_v2_roster')); delete r.cdup; delete r.corphan; localStorage.setItem('jitsugi_v2_roster', JSON.stringify(r)); renderRoster(); return true; }));
  for (const l of [1, 2, 3]) { await page.locator('.lsw button').nth(l).tap(); await page.waitForTimeout(100); }
  await page.locator('.lsw button').nth(0).tap();

  console.log('[S1] 所属未確定→農場が決まった・名前を直した（旧名）後も「済」のまま');
  const reloadRo = async () => { await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(600); };
  const chip = f => page.locator(`.fchip[data-f="${f}"]`);
  roster = [
    { name: 'テスト 甲', farm: FA, works: ['給餌'] },
    { name: 'テスト 乙', farm: '所属未確定', works: ['給餌', 'エサ調整'] },
    { name: 'Nguyen Van T', farm: FA, works: ['給餌'] },
  ];
  await reloadRo();
  await chip('所属未確定').tap(); await page.waitForTimeout(200);
  await ee('テスト 乙').tap(); await page.waitForTimeout(300);
  await scoreWork('feeding-daily', 4); await scoreWork('feed-adjust', 4);
  let nP = posts.length;
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  ok('所属未確定のまま保存 → 送信の farm は所属未確定', posts.length === nP + 1 && posts[nP].record.farm === '所属未確定');
  ok('所属未確定のチップは ✓', await chip('所属未確定').getAttribute('data-left') === '0');
  await chip(FA).tap(); await page.waitForTimeout(200);
  await ee('Nguyen Van T').tap(); await page.waitForTimeout(300);
  await scoreWork('feeding-daily', 4);
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  roster = [
    { name: 'テスト 甲', farm: FA, works: ['給餌'] },
    { name: 'テスト 乙', farm: FA, works: ['給餌', 'エサ調整'] },                         // 所属が決まった
    { name: 'Nguyễn Văn T', farm: FA, works: ['給餌'], aliases: ['Nguyen Van T'] },       // つづりを直した（旧名つき）
  ];
  await reloadRo();
  await chip(FA).tap(); await page.waitForTimeout(200);
  ok('農場が決まった後も乙は実施済み（未実施に戻らない）', await ee('テスト 乙').evaluate(e => e.classList.contains('done')));
  ok('名前を直しても旧名の記録で実施済み', await ee('Nguyễn Văn T').evaluate(e => e.classList.contains('done')));
  ok('農場チップの残りは甲の1人だけ', await chip(FA).getAttribute('data-left') === '1');
  // 同じ名前が2農場にいる時は、記録の農場で見分ける（取り違えない）
  roster = [
    { name: 'テスト 同名', farm: FA, works: ['給餌'] },
    { name: 'テスト 同名', farm: FB, works: ['給餌'] },
  ];
  await reloadRo();
  await chip(FA).tap(); await page.waitForTimeout(200);
  await ee('テスト 同名').tap(); await page.waitForTimeout(300);
  await scoreWork('feeding-daily', 3);
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  ok('同名2人: 採点した農場の人だけ済', await ee('テスト 同名').evaluate(e => e.classList.contains('done')) && await chip(FB).getAttribute('data-left') === '1');

  console.log('[S2] 農場名のゆれ: 全角半角・空白は1つにまとめる／「〇〇農場」の1人は警告');
  roster = [
    { name: 'テスト 大1', farm: 'テスト大田原A', works: ['給餌'] },
    { name: 'テスト 大2', farm: 'テスト大田原A', works: ['給餌'] },
    { name: 'テスト 大3', farm: 'テスト大田原A', works: ['給餌'] },
    { name: 'テスト 大4', farm: 'テスト大田原Ａ', works: ['給餌'] },          // 全角Ａ
    { name: 'テスト 大5', farm: 'テスト大田原　A', works: ['給餌'] },         // 全角空白
    { name: 'テスト 大6', farm: 'テスト大田原A農場', works: ['給餌'] },       // 「農場」つき（別の農場か判断できないので警告だけ）
    { name: 'テスト 未1', farm: '所属未確定', works: ['給餌'] },
  ];
  await reloadRo();
  const fchips = await page.locator('.fchip').evaluateAll(els => els.map(e => e.dataset.f + ':' + e.dataset.n));
  ok('全角半角・空白のゆれは1つのチップ（多い表記・5人）', fchips.includes('テスト大田原A:5') && !fchips.some(f => /Ａ|　/.test(f)));
  const w2 = await page.locator('#eeWarn').textContent();
  ok('#eeWarn に農場名のゆれ（ゆれた表記→そろえた先）', /農場名のゆれ/.test(w2) && w2.includes('「テスト大田原Ａ」(1) ≈ 「テスト大田原A」') && w2.includes('「テスト大田原A農場」(1) ≈ 「テスト大田原A」'));
  ok('所属未確定はゆれ扱いしない', !/所属未確定」/.test(w2));
  await chip('テスト大田原A').tap(); await page.waitForTimeout(200);
  await ee('テスト 大4').tap(); await page.waitForTimeout(300);
  await scoreWork('feeding-daily', 5);
  nP = posts.length;
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  ok('送信の farm はそろえた表記', posts.length === nP + 1 && posts[nP].record.farm === 'テスト大田原A');
  for (const l of [1, 2, 3]) { await page.locator('.lsw button').nth(l).tap(); await page.waitForTimeout(100); ok(`${['', 'en', 'vi', 'id'][l]}: 農場名のゆれの警告が訳される`, !/農場名のゆれ/.test(await page.locator('#eeWarn').textContent()) && /テスト大田原A農場/.test(await page.locator('#eeWarn').textContent())); }
  await page.locator('.lsw button').nth(0).tap();

  console.log('[S3] 所属が決まった・名前を直した後も履歴とグラフで1人（C9-1）／編集を取り消しても農場チップは変わらない（C9-2）');
  roster = [
    { name: 'テスト 一郎', farm: '所属未確定', works: ['給餌'] },
    { name: 'テスト 二郎', farm: FB, works: ['給餌'] },
  ];
  await reloadRo();
  await chip('所属未確定').tap(); await page.waitForTimeout(200);
  await ee('テスト 一郎').tap(); await page.waitForTimeout(300);
  await scoreWork('feeding-daily', 2);
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  roster = [
    { name: 'テスト 一郎', farm: FA, works: ['給餌', 'エサ調整'] },       // 所属が決まり、作業も増えた
    { name: 'テスト 二郎', farm: FB, works: ['給餌'] },
  ];
  await reloadRo();
  await chip(FA).tap(); await page.waitForTimeout(200);
  ok('所属が決まった後: 済が引き継がれて途中 1/2', /途中 1\/2/.test(await ee('テスト 一郎').textContent()));
  await ee('テスト 一郎').tap(); await page.waitForTimeout(300);
  ok('残りはエサ調整だけ', await page.locator('#cards .ec').count() === 5 && await page.locator('#wh-feed-adjust').count() === 1);
  await scoreWork('feed-adjust', 4);
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  ok('2作業そろって実施済み', await ee('テスト 一郎').evaluate(e => e.classList.contains('done')));
  const ichi = () => page.evaluate(() => eePeople(getAll()).filter(p => /^テスト 一[郎朗]/.test(p.name)).map(p => p.label));
  ok('履歴の人: 所属未確定の時の記録とテスト農場Aの記録で1人', JSON.stringify(await ichi()) === JSON.stringify(['テスト 一郎']));
  await page.locator('.tabs button[data-pg="pgHi"]').tap(); await page.waitForTimeout(200);
  let hO = await page.locator('#hFil option').allTextContents();
  ok('履歴の絞り込みに「テスト 一郎」は1つ（農場で分かれない）', hO.filter(o => /テスト 一郎/.test(o)).length === 1);
  await page.locator('#hFil').selectOption({ label: 'テスト 一郎' }); await page.waitForTimeout(200);
  ok('絞り込むと2件（所属未確定の時の記録も）', await page.locator('.hi').count() === 2);
  await page.locator('#hFil').selectOption(''); await page.waitForTimeout(100);
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.locator('.tabs button[data-pg="pgCh"]').dispatchEvent('click'); await page.waitForTimeout(200);
  await page.locator('#chSel').selectOption({ label: 'テスト 一郎' }); await page.waitForTimeout(400);
  // H11-2: 総合は作業ごとの系列（給餌2・エサ調整4を1本の「上達」につながない）・軸2本はレーダーでなく棒
  const chSum = () => page.evaluate(() => cL && cR ? { line: cL.data.datasets.map(d => d.workId + '=' + d.data.join('/')), type: cR.config.type, cur: cR.data.datasets[0].data.join(), nds: cR.data.datasets.length } : null);
  let cs = await chSum();
  ok('グラフも1人で2回分（作業ごとの系列: 給餌2・エサ調整4）', !!cs && cs.line.join() === 'feeding-daily=2,feed-adjust=4' && cs.type === 'bar' && cs.cur === '2,4' && cs.nds === 1);
  roster = [
    { name: 'テスト 一朗', farm: FA, works: ['給餌', 'エサ調整'], aliases: ['テスト 一郎'] },   // 名前を直した（旧名つき）
    { name: 'テスト 二郎', farm: FB, works: ['給餌'] },
  ];
  await page.locator('.tabs button[data-pg="pgIn"]').tap(); await page.waitForTimeout(100);
  await reloadRo();
  ok('改名後も名簿は実施済み', await ee('テスト 一朗').evaluate(e => e.classList.contains('done')));
  ok('改名後: 履歴の人は今の名前で1人', JSON.stringify(await ichi()) === JSON.stringify(['テスト 一朗']));
  await page.locator('.tabs button[data-pg="pgHi"]').tap(); await page.waitForTimeout(200);
  hO = await page.locator('#hFil option').allTextContents();
  ok('履歴の絞り込みは「テスト 一朗」だけ（旧名の「テスト 一郎」が別人で残らない）', hO.includes('テスト 一朗') && !hO.some(o => /テスト 一郎/.test(o)));
  await page.locator('#hFil').selectOption({ label: 'テスト 一朗' }); await page.waitForTimeout(200);
  ok('今の名前で絞り込むと旧名の記録も入れて2件', await page.locator('.hi').count() === 2);
  await page.locator('#hFil').selectOption(''); await page.waitForTimeout(100);
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.locator('.tabs button[data-pg="pgCh"]').dispatchEvent('click'); await page.waitForTimeout(200);
  await page.locator('#chSel').selectOption({ label: 'テスト 一朗' }); await page.waitForTimeout(400);
  cs = await chSum();
  ok('改名後のグラフも2回分（作業ごと）', !!cs && cs.line.join() === 'feeding-daily=2,feed-adjust=4');
  // 名簿外の人: 農場名の全角半角・空白のゆれで分かれない（normFarm）
  await page.evaluate(() => { const w = WORKDATA_V2.works.find(x => x.id === 'feeding-daily'); const all = getAll();
    ['テスト農場Ｘ', 'テスト農場 X'].forEach((f, i) => all.push({ id: 'fv-' + i, date: '2026-09-20', evaluator: 'テスト評価者', evaluatee: 'テスト 名簿外', farm: f, overall: '', createdAt: '2026-09-20T0' + i + ':00:00Z',
      works: [{ workId: w.id, workName: w.name, category: w.category, scores: Object.fromEntries(w.aspects.map(a => [a.id, 3])), comments: {} }], sent: true }));
    putAll(all); });
  ok('名簿外の人も農場名の表記ゆれで2人に分かれない', await page.evaluate(() => { const ps = eePeople(getAll()).filter(p => p.name === 'テスト 名簿外'); return ps.length === 1 && recsOfKey(ps[0].key).length === 2; }));
  // C9-2: 担当の農場チップ（テスト農場B）を開いたまま、別の農場の古い記録を編集 → 取り消し／保存
  await page.locator('.tabs button[data-pg="pgIn"]').tap(); await page.waitForTimeout(100);
  await chip(FB).tap(); await page.waitForTimeout(200);
  const oldId = (await recs()).find(x => x.evaluatee === 'テスト 一郎' && x.farm === '所属未確定').id;
  await page.evaluate(id => startEdit(id), oldId); await page.waitForTimeout(300);
  ok('編集中: 採点中の人の農場（テスト農場A）を表示・端末の農場チップの好みは書き換えない', await page.locator('.fchip.on').getAttribute('data-f') === FA && await page.evaluate(() => localStorage.getItem('jitsugi_v2_farm')) === FB);
  await page.evaluate(() => cancelEdit()); await page.waitForTimeout(300);
  ok('編集を取り消すと農場チップは元のテスト農場B', await page.locator('.fchip.on').getAttribute('data-f') === FB && await page.evaluate(() => localStorage.getItem('jitsugi_v2_farm')) === FB);
  ok('取り消し後は誰も選ばれていない', await page.inputValue('#fEe') === '' && await page.locator('.eetab.on').count() === 0);
  await page.evaluate(id => startEdit(id), oldId); await page.waitForTimeout(300);
  await page.locator('#cards .ec .sb[data-s="3"]').first().tap();
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  ok('編集を保存しても農場チップはテスト農場Bのまま（記録の農場は所属未確定のまま）', await page.locator('.fchip.on').getAttribute('data-f') === FB && (await recs()).find(x => x.id === oldId).farm === '所属未確定');
  await page.reload(); await page.waitForTimeout(900);
  ok('再起動後も農場チップはテスト農場B', await page.locator('.fchip.on').getAttribute('data-f') === FB);

  console.log('[A7] 作業名不明の人: 補った作業の数では「済」にしない／同名2農場＋農場欄が空の旧記録はどちらの人にも数えない（T10-3）');
  roster = [
    { name: 'テスト 不明一', farm: FA, works: ['給餌', '不明作業Y'] },   // 解決1＋不明1 = 2作業
    { name: 'テスト 同名乙', farm: FA, works: ['給餌', 'エサ調整'] },
    { name: 'テスト 同名乙', farm: FB, works: ['給餌', 'エサ調整'] },
  ];
  await reloadRo();
  await chip(FA).tap(); await page.waitForTimeout(200);
  const leftA0 = await chip(FA).getAttribute('data-left');
  await ee('テスト 不明一').tap(); await page.waitForTimeout(300);
  ok('A7: 不明作業の人を選ぶと給餌だけ＋作業選択が開く', JSON.stringify(await page.evaluate(() => selWorks)) === '["feeding-daily"]' && await page.evaluate(() => document.getElementById('wselBox').open));
  // 評価者が割り当て外の作業を2つ補い、給餌は今回やらない
  await page.evaluate(() => { toggleWork('feeding-daily', false); toggleWork('feed-adjust', true); toggleWork('five-s', true); }); await page.waitForTimeout(200);
  await scoreWork('feed-adjust', 4); await scoreWork('five-s', 4);
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  ok('A7: 補った2作業だけを保存した記録', (await recs()).some(x => x.evaluatee === 'テスト 不明一' && x.works.map(w => w.workId).join() === 'feed-adjust,five-s'));
  ok('A7: 補った作業が2つでも「途中 1/2」（不明作業1つ分だけ数える）・済にならない', /途中 1\/2/.test(await ee('テスト 不明一').textContent()) && !(await ee('テスト 不明一').evaluate(e => e.classList.contains('done'))));
  ok('A7: 農場チップの残り人数は減らない', await chip(FA).getAttribute('data-left') === leftA0);
  await ee('テスト 不明一').tap(); await page.waitForTimeout(300);
  ok('A7: 選び直すと割り当ての給餌が残っている', (await page.evaluate(() => selWorks)).includes('feeding-daily'));
  await page.evaluate(() => clearForm());
  // 同名2農場: 記録はA・Bに1件ずつ（給餌）＋農場欄が空の旧記録（エサ調整）
  await page.evaluate(([FA, FB]) => { const mk = (id, farm, wid) => { const w = WORKDATA_V2.works.find(x => x.id === wid);
      return { id, date: '2026-09-20', evaluator: 'テスト評価者', evaluatee: 'テスト 同名乙', farm, overall: '', createdAt: '2026-09-20T00:00:00Z', works: [{ workId: w.id, workName: w.name, category: w.category, scores: Object.fromEntries(w.aspects.map(a => [a.id, 3])), comments: {} }], sent: true }; };
    const all = getAll(); all.push(mk('dz-a', FA, 'feeding-daily'), mk('dz-b', FB, 'feeding-daily'), mk('dz-blank', '', 'feed-adjust')); putAll(all); renderRoster(); refreshSel(); }, [FA, FB]);
  const dzTab = async f => { await chip(f).tap(); await page.waitForTimeout(200); const t = ee('テスト 同名乙'); return { done: await t.evaluate(e => e.classList.contains('done')), part: /途中 1\/2/.test(await t.textContent()) }; };
  const dzTabOf = async (nm, f, re) => { await chip(f).tap(); await page.waitForTimeout(200); const t = ee(nm); return { done: await t.evaluate(e => e.classList.contains('done')), hit: re.test(await t.textContent()) }; };
  const dzA = await dzTab(FA), dzB = await dzTab(FB);
  ok('A7: 同名2農場＋農場欄が空の旧記録 → どちらの人も済にならない（1/2のまま）', !dzA.done && !dzB.done && dzA.part && dzB.part);
  const dzP = await page.evaluate(() => eePeople(getAll()).filter(p => p.name === 'テスト 同名乙').map(p => ({ label: p.label, n: recsOfKey(p.key).length })));
  ok('A7: 履歴でも「名前（農場A）」「名前（農場B）」は1件ずつに分かれたまま（空欄の旧記録をAに付けない）',
    dzP.some(p => p.label === 'テスト 同名乙（' + FA + '）' && p.n === 1) && dzP.some(p => p.label === 'テスト 同名乙（' + FB + '）' && p.n === 1));

  console.log('[A7b] 同名2農場で、片方の農場にだけ新しい記録がある＋農場欄が空の旧記録（H11-1）');
  roster = [
    { name: 'テスト 同名丙', farm: FA, works: ['給餌', 'エサ調整'] },
    { name: 'テスト 同名丙', farm: FB, works: ['給餌'] },
  ];
  await reloadRo();
  await page.evaluate(([FA]) => { const mk = (id, date, farm, wid, sc) => { const w = WORKDATA_V2.works.find(x => x.id === wid);
      return { id, date, evaluator: 'テスト評価者', evaluatee: 'テスト 同名丙', farm, overall: '', createdAt: date + 'T00:00:00Z', works: [{ workId: w.id, workName: w.name, category: w.category, scores: Object.fromEntries(w.aspects.map(a => [a.id, sc])), comments: {} }], sent: true }; };
    const all = getAll(); all.push(mk('hc-old', '2026-09-10', '', 'feeding-daily', 2), mk('hc-new', '2026-09-23', FA, 'feed-adjust', 4)); putAll(all); renderRoster(); refreshSel(); }, [FA]);
  const hcA = await dzTabOf('テスト 同名丙', FA, /途中 1\/2/), hcB = await dzTabOf('テスト 同名丙', FB, /./);
  ok('A7b: 農場Aの人は済にならない（途中 1/2・空欄の旧記録の給餌を付けない）', !hcA.done && hcA.hit);
  ok('A7b: 農場Bの人も済にならない（空欄の旧記録はどちらの人にも数えない）', !hcB.done);
  const hcK = await page.evaluate(() => { const k = personKeyer(getAll()); const r = id => k(getAll().find(x => x.id === id)); return { o: r('hc-old'), n: r('hc-new') }; });
  ok('A7b: 旧記録と新記録は別の人のキー・旧記録は名簿のどの人にも付かない', hcK.o.key !== hcK.n.key && hcK.o.entry === null && hcK.n.entry !== null);
  const hcP = await page.evaluate(() => eePeople(getAll()).filter(p => p.name === 'テスト 同名丙').map(p => ({ label: p.label, n: recsOfKey(p.key).length })));
  ok('A7b: 履歴の「名前（農場A）」は新しい記録の1件だけ', hcP.some(p => p.label === 'テスト 同名丙（' + FA + '）' && p.n === 1) && !hcP.some(p => p.n === 2));

  console.log('[A7c] グラフの総合: 分割保存・人ごとの作業で、別の作業どうしを比べない（H11-2）');
  roster = [{ name: 'テスト 分割', farm: FA, works: ['給餌', 'エサ調整', '5S清掃'] }];
  await reloadRo();
  await page.evaluate(([FA]) => { const mk = (id, date, wid, sc) => { const w = WORKDATA_V2.works.find(x => x.id === wid);
      return { id, date, evaluator: 'テスト評価者', evaluatee: 'テスト 分割', farm: FA, overall: '', createdAt: date + 'T0' + sc + ':00:00Z', works: [{ workId: w.id, workName: w.name, category: w.category, scores: Object.fromEntries(w.aspects.map(a => [a.id, sc])), comments: {} }], sent: true }; };
    const all = getAll(); all.push(mk('sp1', '2026-09-21', 'feeding-daily', 2), mk('sp2', '2026-09-22', 'feed-adjust', 3), mk('sp3', '2026-09-23', 'feeding-daily', 4), mk('sp4', '2026-09-23', 'five-s', 5)); putAll(all); refreshSel(); }, [FA]);
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.locator('.tabs button[data-pg="pgCh"]').dispatchEvent('click'); await page.waitForTimeout(200);
  await page.locator('#chSel').selectOption({ label: 'テスト 分割' }); await page.waitForTimeout(400);
  const sp = await page.evaluate(() => ({ labels: cL.data.labels.join(), line: cL.data.datasets.map(d => d.workId + '=' + d.data.map(v => v == null ? '-' : v).join('/')),
    type: cR.config.type, axes: cR.data.labels.length, cur: cR.data.datasets[0].data.join(), prv: cR.data.datasets[1] ? cR.data.datasets[1].data.map(v => v == null ? '-' : v).join() : null }));
  ok('A7c: 線グラフのx軸は日付が1つずつ（同じ日付を2つ並べない）', sp.labels === '2026-09-21,2026-09-22,2026-09-23');
  ok('A7c: 線グラフは作業ごとの系列（給餌2→4・エサ調整3・5S5）', sp.line.join() === 'feeding-daily=2/-/4,feed-adjust=-/3/-,five-s=-/-/5');
  ok('A7c: レーダーの軸はその人の全作業（3本）', sp.type === 'radar' && sp.axes === 3);
  ok('A7c: 直近は各作業の最新の平均（4,3,5）', sp.cur === '4,3,5');
  ok('A7c: 前回は同じ作業の1つ前だけ（給餌2・他は描かない＝0点にしない）', sp.prv === '2,-,-');
  await page.locator('.tabs button[data-pg="pgIn"]').tap(); await page.waitForTimeout(100);

  ok('JSエラーなし(割り当て運用)', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
}

/* 評価日と日をまたぐ試験（日本時間で実測）: 9時前でも今日の日付・保存しても日付を保つ・後日に回した作業は翌日も「途中」・前日の下書きは日付を確認 */
async function runDate(devName) {
  console.log(`\n===== ${devName}（評価日・日をまたぐ試験 Asia/Tokyo） =====`);
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await browser.newContext({ ...devices[devName], timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const dialogs = [];
  let accept = true;
  page.on('dialog', d => { if (d.type() === 'beforeunload') return d.accept(); dialogs.push(d.message()); accept ? d.accept() : d.dismiss(); });   // 閉じる時の「変更を破棄？」は数えない
  const FA = 'テスト農場D';
  const roster = [
    { name: 'テスト 甲太', farm: FA, works: ['給餌', 'エサ調整'] },
    { name: 'テスト 乙彦', farm: FA, works: ['給餌'] },
    { name: 'テスト 丙助', farm: FA, works: ['除フン'] },
  ];
  await page.route(u => u.href.startsWith('https://script.google.com/'), async route => {
    const req = route.request(), hdr = { 'access-control-allow-origin': '*' };
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify(rosterRes(roster)) });
    const body = JSON.parse(req.postData());
    return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, id: body.record && body.record.id }) });
  });
  const ee = name => page.locator('.eetab').filter({ has: page.locator('.eetab-nm', { hasText: new RegExp('^' + name + '$') }) });
  const scoreWork = async (wid, s, n = 5) => { const ids = await page.locator(`#cards .ec[data-w="${wid}"]`).evaluateAll(els => els.map(e => e.id.slice(2))); for (const cid of ids.slice(0, n)) await page.locator(`.sb[data-id="${cid}"][data-s="${s}"]`).tap(); };
  const recs = () => page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_data') || '{"evaluations":[]}').evaluations);
  const fDate = () => page.inputValue('#fDate');
  const at = async iso => { await page.clock.setSystemTime(new Date(iso)); };

  await page.clock.install({ time: new Date('2026-09-24T07:30:00+09:00') });
  await page.goto(APP);
  await page.evaluate(GAS => { localStorage.clear(); localStorage.setItem('jitsugi_v2_sheet_url', GAS); localStorage.setItem('jitsugi_v2_evaluator', 'テスト評価者'); }, GAS);
  await page.reload(); await page.waitForTimeout(600);

  console.log('[D1] 日本時間 7:30 に開いても評価日は今日（UTCの前日にならない）');
  ok(`起動直後の評価日 ${await fDate()} = 2026-09-24`, await fDate() === '2026-09-24');
  await ee('テスト 乙彦').tap(); await page.waitForTimeout(300);
  await scoreWork('feeding-daily', 4);
  await page.locator('#btnSave').tap(); await page.waitForTimeout(700);
  let r = await recs();
  ok('記録の日付は 2026-09-24', r.length === 1 && r[0].date === '2026-09-24');
  ok(`保存後も評価日は 2026-09-24（${await fDate()}）`, await fDate() === '2026-09-24');
  ok('保存した人は実施済み・農場の残り2人', await ee('テスト 乙彦').evaluate(e => e.classList.contains('done')) && await page.locator('.fchip.on').getAttribute('data-left') === '2');

  console.log('[D2] 評価者が選んだ日付は、次の人を選んでも保存しても変わらない');
  await page.fill('#fDate', '2026-09-23'); await page.dispatchEvent('#fDate', 'change');
  await ee('テスト 丙助').tap(); await page.waitForTimeout(300);
  ok('人を選んでも評価日は 09-23 のまま', await fDate() === '2026-09-23');
  await scoreWork('dung-removal', 3);
  await page.locator('#btnSave').tap(); await page.waitForTimeout(700);
  r = await recs();
  ok('記録は選んだ日付（09-23）・保存後も 09-23 のまま', r.find(x => x.evaluatee === 'テスト 丙助').date === '2026-09-23' && await fDate() === '2026-09-23');
  // 前日の記録を編集して閉じる → 編集前に選んでいた日付に戻る
  await page.fill('#fDate', '2026-09-24'); await page.dispatchEvent('#fDate', 'change');
  await page.evaluate(id => startEdit(id), r.find(x => x.evaluatee === 'テスト 丙助').id); await page.waitForTimeout(200);
  ok('編集中は記録の日付（09-23）', await fDate() === '2026-09-23');
  await page.evaluate(() => cancelEdit()); await page.waitForTimeout(200);
  ok('編集をやめると編集前の日付（09-24）に戻る', await fDate() === '2026-09-24');

  console.log('[D3] 最後の採点から300ms以内に保存しても、保存後に下書きが残らない');
  await ee('テスト 甲太').tap(); await page.waitForTimeout(300);
  await scoreWork('feeding-daily', 4, 4);
  const dn = dialogs.length;
  // 最後の1枚を採点した直後（300ms以内）に保存 → 未採点のエサ調整は後日（途中保存の確認OK）
  await page.evaluate(() => { const b = document.querySelectorAll('#cards .ec[data-w="feeding-daily"]')[4].querySelector('.sb[data-s="5"]'); b.click(); doSave(); });
  await page.waitForTimeout(800);
  ok('途中保存の確認が出て保存された', dialogs.length === dn + 1 && (await recs()).some(x => x.evaluatee === 'テスト 甲太' && x.works.map(w => w.workId).join() === 'feeding-daily'));
  ok('保存後に下書きが書かれない', await page.evaluate(() => localStorage.getItem('jitsugi_v2_draft')) === null);
  ok('甲太は「途中 1/2」', /途中 1\/2/.test(await ee('テスト 甲太').textContent()));

  console.log('[D4] 翌日: 前日に後日へ回した作業は「途中」のまま・選ぶと残りの作業だけ');
  await ee('テスト 丙助').tap(); await page.waitForTimeout(500);   // タブを押しただけ（採点0）で閉じる
  await at('2026-09-25T10:00:00+09:00');
  const d0 = dialogs.length;
  await page.reload(); await page.waitForTimeout(600);
  ok(`翌日の評価日は今日（${await fDate()}）`, await fDate() === '2026-09-25');
  ok('タブを押しただけの下書きは復元しない（確認も出ない・人も選ばれない）', dialogs.length === d0 && await page.inputValue('#fEe') === '' && !/復元/.test(await page.locator('#toast').textContent()));
  ok('前日に途中保存した甲太は翌日も「途中 1/2」', /途中 1\/2/.test(await ee('テスト 甲太').textContent()) && !(await ee('テスト 甲太').evaluate(e => e.classList.contains('done'))));
  ok('前日に済んだ乙彦は翌日も実施済み・農場の残り1人', await ee('テスト 乙彦').evaluate(e => e.classList.contains('done')) && await page.locator('.fchip.on').getAttribute('data-left') === '1');
  await ee('テスト 甲太').tap(); await page.waitForTimeout(300);
  ok('甲太を選ぶと残りのエサ調整だけ（給餌は二重に出ない）', JSON.stringify(await page.evaluate(() => selWorks)) === '["feed-adjust"]');
  await scoreWork('feed-adjust', 4);
  await page.locator('#btnSave').tap(); await page.waitForTimeout(700);
  ok('残りを保存すると実施済み（残り0人）', await ee('テスト 甲太').evaluate(e => e.classList.contains('done')) && await page.locator('.fchip.on').getAttribute('data-left') === '0');
  ok('2日目の記録は 09-25', (await recs()).filter(x => x.evaluatee === 'テスト 甲太').map(x => x.date).sort().join() === '2026-09-24,2026-09-25');

  console.log('[D5] 試験開始日: 前回の試験の記録を数えない');
  await page.evaluate(() => setExamStart('2026-09-25')); await page.waitForTimeout(100);
  ok('開始日 09-25 → 乙彦（09-24のみ）は未実施・甲太は「途中 1/2」', !(await ee('テスト 乙彦').evaluate(e => e.classList.contains('done'))) && /途中 1\/2/.test(await ee('テスト 甲太').textContent()));
  await page.reload(); await page.waitForTimeout(600);
  ok('開始日は再起動後も残る', await page.evaluate(() => examStart()) === '2026-09-25' && await page.locator('.fchip.on').getAttribute('data-left') === '3');
  await page.evaluate(() => setExamStart('')); await page.waitForTimeout(100);
  ok('空欄に戻すと全記録で数える', await page.locator('.fchip.on').getAttribute('data-left') === '0');

  console.log('[D6] 前日の入力途中（採点あり）は日付を確認してから復元');
  await at('2026-09-25T15:00:00+09:00');
  await ee('テスト 丙助').tap(); await page.waitForTimeout(300);
  await scoreWork('dung-removal', 2, 2); await page.waitForTimeout(500);
  await at('2026-09-26T08:00:00+09:00');
  accept = true; let d1 = dialogs.length;
  await page.reload(); await page.waitForTimeout(600);
  ok('確認文に前日の日付（9/25）', dialogs.length === d1 + 1 && /9\/25/.test(dialogs[d1]) && !/\{d\}/.test(dialogs[d1]));
  ok('OK → 日付は今日（09-26）・採点と人は復元', await fDate() === '2026-09-26' && await page.inputValue('#fEe') === 'テスト 丙助' && await page.locator('#cards .ec.scored').count() === 2);
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('jitsugi_v2_draft')); d.date = '2026-09-25'; localStorage.setItem('jitsugi_v2_draft', JSON.stringify(d)); });
  accept = false; d1 = dialogs.length;
  await page.reload(); await page.waitForTimeout(600);
  ok('キャンセル → 下書きの日付（09-25）のまま', dialogs.length === d1 + 1 && await fDate() === '2026-09-25' && await page.locator('#cards .ec.scored').count() === 2);
  accept = true;
  for (const l of [1, 2, 3]) {
    await page.locator('.lsw button').nth(l).tap(); await page.waitForTimeout(100);
    ok(`言語${l}: 試験開始日の見出し・説明が訳されている`, await page.evaluate(() => { const a = document.querySelector('[data-t="examStartLbl"]').textContent, b = document.querySelector('[data-t="examStartHint"]').textContent; return a && b && !/[ぁ-ん]/.test(a + b.replace(/受験者|農場共通/g, '')); }));
  }
  await page.locator('.lsw button').nth(0).tap();

  ok('JSエラーなし(評価日)', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
}

/* 編集と下書きの安全弁（T10-6）: 編集中の記録が消えた・編集を取り消した時の人・編集中の下書きの日付・手入力の名前だけの下書き・「元に戻す」の相手 */
async function runGuard(devName) {
  console.log(`\n===== ${devName}（編集と下書きの安全弁） =====`);
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await browser.newContext({ ...devices[devName] });
  const page = await ctx.newPage();
  const errors = [], dialogs = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => { if (d.type() === 'beforeunload') return d.accept(); dialogs.push(d.message()); d.accept(); });
  const FG = 'テスト農場G';
  const roster = [
    { name: 'テスト 甲太', farm: FG, works: ['給餌', 'エサ調整'] },
    { name: 'テスト 乙彦', farm: FG, works: ['除フン'] },
    { name: 'テスト 丙介', farm: FG, works: ['給餌'] },
    { name: 'テスト 丁子', farm: FG, works: ['給餌', 'エサ調整'] },
  ];
  await page.route(u => u.href.startsWith('https://script.google.com/'), async route => {
    const req = route.request(), hdr = { 'access-control-allow-origin': '*' };
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify(rosterRes(roster)) });
    const body = JSON.parse(req.postData());
    return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, id: body.action === 'delete' ? body.id : body.record.id, deleted: 1 }) });
  });
  const ee = name => page.locator('.eetab').filter({ has: page.locator('.eetab-nm', { hasText: new RegExp('^' + name + '$') }) });
  const scoreAll = async s => { for (const cid of await page.locator('#cards .ec').evaluateAll(els => els.map(e => e.id.slice(2)))) await page.locator(`.sb[data-id="${cid}"][data-s="${s}"]`).tap(); };
  const recs = () => page.evaluate(() => getAll());
  const hookToast = () => page.evaluate(() => { window._toasts = []; const o = toast; toast = (m, e, a) => { _toasts.push(m); return o(m, e, a); }; });
  await page.goto(APP);
  await page.evaluate(GAS => { localStorage.clear(); localStorage.setItem('jitsugi_v2_sheet_url', GAS); localStorage.setItem('jitsugi_v2_evaluator', 'テスト評価者'); }, GAS);
  await page.reload(); await page.waitForTimeout(600);

  console.log('[G1] 編集中にその記録が消えた → 保存しても「見つかりません」・採点は残る・人は編集していた人のまま（EG/U）');
  await ee('テスト 丙介').tap(); await page.waitForTimeout(200);
  await scoreAll(3); await page.locator('#btnSave').tap(); await page.waitForTimeout(800);
  const heiId = (await recs())[0].id;
  await ee('テスト 乙彦').tap(); await page.waitForTimeout(200);          // 編集前に別の人（乙彦）を選んでいた
  await page.evaluate(id => startEdit(id), heiId); await page.waitForTimeout(300);
  const hc = (await page.locator('#cards .ec').first().getAttribute('id')).slice(2);
  await page.locator(`.sb[data-id="${hc}"][data-s="5"]`).tap();
  await page.evaluate(id => doDel(id), heiId); await page.waitForTimeout(300);   // 別の操作（履歴・別タブ）で同じ記録が消えた
  await hookToast();
  await page.locator('#btnSave').tap(); await page.waitForTimeout(500);
  ok('G1: 「編集中の記録が見つかりません」と出す（「更新しました」と言わない）', await page.evaluate(() => _toasts.some(m => /編集中の記録が見つかりません/.test(m)) && !_toasts.includes('更新しました')));
  ok('G1: 記録は増えない（消えた記録を黙って作り直さない・0件）', (await recs()).length === 0);
  ok('G1: 採点は画面に残る（5点・編集モードは抜ける）', await page.locator(`.sb[data-id="${hc}"][data-s="5"].sel`).count() === 1 && !(await page.locator('#editBar').evaluate(e => e.classList.contains('show'))));
  ok('G1: 採点中の人は編集していた丙介のまま（編集前の乙彦に戻さない）', await page.inputValue('#fEe') === 'テスト 丙介' && /テスト 丙介/.test(await page.locator('#eeCur').textContent()));
  await page.locator('#btnSave').tap(); await page.waitForTimeout(800);
  ok('G1: そのまま保存し直せる（新しい記録として1件）', (await recs()).length === 1 && (await recs())[0].evaluatee === 'テスト 丙介');

  console.log('[G2] 前日以前の記録を編集中に再起動 → 日付の確認を出さず、記録の日付のまま（DD）');
  await page.evaluate(() => { const w = WORKDATA_V2.works.find(x => x.id === 'feeding-daily'); const all = getAll();
    all.push({ id: 'old-edit', date: '2026-01-10', evaluator: 'テスト評価者', evaluatee: 'テスト 甲太', farm: 'テスト農場G', overall: '', createdAt: '2026-01-10T01:00:00Z', works: [{ workId: w.id, workName: w.name, category: w.category, scores: Object.fromEntries(w.aspects.map(a => [a.id, 3])), comments: {} }], sent: true, sentOnce: true });
    putAll(all); });
  await page.evaluate(() => startEdit('old-edit')); await page.waitForTimeout(300);
  const oc = (await page.locator('#cards .ec').first().getAttribute('id')).slice(2);
  await page.locator(`.sb[data-id="${oc}"][data-s="5"]`).tap(); await page.waitForTimeout(600);   // 下書きが保存される
  let dn = dialogs.length;
  await page.reload(); await page.waitForTimeout(700);
  ok('G2: 日付の確認は出ない', dialogs.length === dn);
  ok('G2: 評価日は記録の日付（2026-01-10）・編集中のまま', await page.inputValue('#fDate') === '2026-01-10' && await page.locator('#editBar').evaluate(e => e.classList.contains('show')));
  await page.locator('#btnSave').tap(); await page.waitForTimeout(800);
  const oe = (await recs()).find(x => x.id === 'old-edit');
  ok('G2: 保存しても記録の日付は 2026-01-10・直した5点が入る', oe.date === '2026-01-10' && Object.values(oe.works[0].scores)[0] === 5 && (await recs()).length === 2);

  console.log('[G3] 名簿にない人の名前だけを打って再起動 → 名前が戻る（K）');
  await page.evaluate(() => openManualEe()); await page.waitForTimeout(200);
  await page.fill('#fEe', 'テスト 名簿外K'); await page.waitForTimeout(600);
  dn = dialogs.length;
  await page.reload(); await page.waitForTimeout(700);
  ok('G3: 手入力の名前が戻る・手入力欄が見える', await page.inputValue('#fEe') === 'テスト 名簿外K' && await page.locator('#fEe').isVisible());
  await page.evaluate(() => clearForm()); await page.waitForTimeout(200);

  console.log('[G4] 作業を外す → 別の人を選ぶ → 「元に戻す」を押しても今の人の作業は変わらない（UN）');
  await ee('テスト 丁子').tap(); await page.waitForTimeout(300);
  ok('G4: 丁子は2作業', JSON.stringify(await page.evaluate(() => selWorks)) === '["feeding-daily","feed-adjust"]');
  await page.locator('.wsec[data-w="feed-adjust"] .wshd-skip').tap(); await page.waitForTimeout(300);
  await ee('テスト 乙彦').tap(); await page.waitForTimeout(300);
  const undo = page.locator('#toast .toast-act');
  ok('G4: 「元に戻す」はまだ押せる', await undo.isVisible());
  await undo.tap(); await page.waitForTimeout(300);
  ok('G4: 乙彦の作業は除フンだけのまま（丁子のエサ調整が入らない）', JSON.stringify(await page.evaluate(() => selWorks)) === '["dung-removal"]' && await page.inputValue('#fEe') === 'テスト 乙彦');

  ok('JSエラーなし(安全弁)', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
}

/* バックアップ→別の端末へ復元（T10-4）: 記録・農場・名簿外・sentOnce が保たれる／名簿の済と残りがすぐ変わる／同じIDは二重に入らない／
   削除待ちの記録を復元すると削除をやめて送り直す */
async function runBackup(devName) {
  console.log(`\n===== ${devName}（バックアップと復元） =====`);
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const FA = 'テスト農場K';
  const roster = [
    { name: 'テスト 甲太', farm: FA, works: ['給餌'] },
    { name: 'テスト 乙彦', farm: FA, works: ['給餌'] },
  ];
  const sheet = {}, posts = [];
  let online = true;
  const open = async () => {
    const ctx = await browser.newContext({ ...devices[devName], acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [], dialogs = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await page.route(u => u.href.startsWith('https://script.google.com/'), async route => {
      if (!online) return route.abort('internetdisconnected');
      const req = route.request(), hdr = { 'access-control-allow-origin': '*' };
      if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify(rosterRes(roster)) });
      const body = JSON.parse(req.postData()); posts.push(body);
      if (body.action === 'delete') { delete sheet[body.id]; return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, id: body.id, deleted: 1 }) }); }
      sheet[body.record.id] = body.record;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, id: body.record.id }) });
    });
    await page.goto(APP);
    await page.evaluate(GAS => { localStorage.clear(); localStorage.setItem('jitsugi_v2_sheet_url', GAS); localStorage.setItem('jitsugi_v2_evaluator', 'テスト評価者'); }, GAS);
    await page.reload(); await page.waitForTimeout(600);
    return { ctx, page, errors, dialogs };
  };
  const ee = (page, name) => page.locator('.eetab').filter({ has: page.locator('.eetab-nm', { hasText: new RegExp('^' + name + '$') }) });
  const recs = page => page.evaluate(() => getAll());

  console.log('[B1] 端末1: 甲太を採点して送信・名簿外の人（未送信）→ 全データをバックアップ');
  const d1 = await open();
  await ee(d1.page, 'テスト 甲太').tap(); await d1.page.waitForTimeout(200);
  for (const cid of await d1.page.locator('#cards .ec').evaluateAll(els => els.map(e => e.id.slice(2)))) await d1.page.locator(`.sb[data-id="${cid}"][data-s="4"]`).tap();
  await d1.page.locator('#btnSave').tap(); await d1.page.waitForTimeout(800);
  await d1.page.evaluate(() => { const w = WORKDATA_V2.works.find(x => x.id === 'feeding-daily'); const all = getAll();
    all.push({ id: 'bk-manual', date: todayLocal(), evaluator: 'テスト評価者', evaluatee: 'テスト 名簿外', farm: '', manual: true, overall: '所感<b>', createdAt: new Date().toISOString(), works: [{ workId: w.id, workName: w.name, category: w.category, scores: Object.fromEntries(w.aspects.map(a => [a.id, 2])), comments: {} }], sent: false });
    putAll(all); });
  const src = await recs(d1.page);
  const kotaId = src.find(r => r.evaluatee === 'テスト 甲太').id;
  ok('B1: 甲太は送信済み（sent・sentOnce）・名簿外は manual', src.find(r => r.id === kotaId).sent === true && src.find(r => r.id === kotaId).sentOnce === true && src.find(r => r.id === 'bk-manual').manual === true);
  const [dl] = await Promise.all([d1.page.waitForEvent('download'), d1.page.evaluate(() => exportAll())]);
  const bkPath = __dirname + '/_shots/backup_test.json';
  fs.copyFileSync(await dl.path(), bkPath);
  const bk = JSON.parse(fs.readFileSync(bkPath, 'utf8'));
  ok('B1: バックアップに2件', bk._type === 'jitsugi_v2_backup' && bk.data.evaluations.length === 2);
  ok('JSエラーなし(バックアップ 端末1)', d1.errors.length === 0);
  await d1.ctx.close();

  console.log('[B2] 端末2（新しい端末）へ復元 → 記録・農場・名簿外・sentOnce が保たれ、名簿の済と残りがすぐ変わる');
  const d2 = await open();
  const p2 = d2.page;
  ok('B2: 復元前は済0人・農場の残り2人', await p2.locator('.eetab.done').count() === 0 && await p2.locator(`.fchip[data-f="${FA}"]`).getAttribute('data-left') === '2');
  // この端末では甲太の記録を削除して、シートの削除待ちに入っていた（圏外で消した・まだシートには行がある）
  await p2.evaluate(id => localStorage.setItem('jitsugi_v2_deletes', JSON.stringify([{ id, evaluator: 'テスト評価者', at: new Date().toISOString() }])), kotaId);
  await p2.evaluate(() => { window._toasts = []; const o = toast; toast = (m, e, a) => { _toasts.push(m); return o(m, e, a); }; });
  d2.dialogs.length = 0;
  const np = posts.length;
  await p2.setInputFiles('#impAllFile', bkPath); await p2.waitForTimeout(1200);
  const got = await recs(p2);
  const gk = got.find(r => r.id === kotaId), gm = got.find(r => r.id === 'bk-manual');
  ok('B2: 確認を出してから取り込む・2件（+2）', d2.dialogs.length === 1 && got.length === 2 && await p2.evaluate(() => _toasts.includes('復元しました (+2)')));
  ok('B2: 農場・名簿外・所感・点が保たれる', !!gk && gk.farm === FA && !!gm && gm.manual === true && gm.farm === '' && gm.overall === '所感<b>' && Object.values(gk.works[0].scores).every(v => v === 4));
  ok('B2: sentOnce は保たれる（一度シートに届いた記録）', !!gk && gk.sentOnce === true);
  ok('B2: 取り込んだ直後に名簿の甲太が済・農場の残り1人（手で再描画しない）', await ee(p2, 'テスト 甲太').evaluate(e => e.classList.contains('done')) && await p2.locator(`.fchip[data-f="${FA}"]`).getAttribute('data-left') === '1');
  ok('B2: 履歴の絞り込みにも出る', (await p2.locator('#hFil option').allTextContents()).includes('テスト 甲太'));
  ok('B2: 復元した所感は文字として表示（タグにならない）', await p2.evaluate(() => { showDet('bk-manual'); const x = document.getElementById('moBody').textContent.includes('所感<b>'); closeMo(); return x; }));
  ok('B2: 削除待ちの記録を復元 → 削除待ちから外れる', await p2.evaluate(() => getDels().length) === 0);
  ok('B2: 復元した甲太は（ボタンを押さずに）送り直され、削除は送らない・シートに行が残る',
    posts.slice(np).some(p => p.action === 'submit' && p.record.id === kotaId) && !posts.slice(np).some(p => p.action === 'delete') && kotaId in sheet && (await recs(p2)).find(r => r.id === kotaId).sent === true);
  ok('B2: 名簿外（未送信）の記録も送られる', 'bk-manual' in sheet);
  await p2.setInputFiles('#impAllFile', bkPath); await p2.waitForTimeout(600);   // 同じバックアップをもう一度
  ok('B2: 同じIDは二重に入らない（2件のまま・+0）', (await recs(p2)).length === 2 && await p2.evaluate(() => _toasts.includes('復元しました (+0)')));
  ok('JSエラーなし(バックアップ 端末2)', d2.errors.length === 0);
  if (d2.errors.length) console.log(d2.errors.join('\n'));
  await browser.close();
}

/* Service Worker: 電波が弱い（つながるが応答が返らない）時もキャッシュから即起動する（localhost で実際にSWを登録） */
async function runSW() {
  console.log('\n===== Service Worker（応答が返らない回線で起動） =====');
  const http = require('http'), path = require('path');
  let hang = false, down = false; const held = [];
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const srv = http.createServer((req, res) => {
    if (down) { req.socket.destroy(); return; }   // 圏外（つながらない）
    if (hang) { held.push(res); return; }   // 応答しない（lie-fi）
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(__dirname, p);
    if (!f.startsWith(__dirname) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route(u => u.href.startsWith('https://script.google.com/'), r => r.abort('internetdisconnected'));
  await page.goto(base + 'index.html');
  await page.evaluate(() => navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready));   // 本番は https で app.js が登録
  await page.reload(); await page.waitForTimeout(500);
  ok('SWがページを制御', await page.evaluate(() => !!navigator.serviceWorker.controller));
  hang = true;
  const t0 = Date.now();
  let loaded = true;
  try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 8000 }); } catch (e) { loaded = false; }
  const ms = Date.now() - t0;
  hang = false; held.splice(0).forEach(r => { try { r.socket && r.socket.destroy(); } catch (e) {} });   // 止めた応答を解放（失敗時にテストが固まらないように）
  ok(`応答の返らない回線でもキャッシュから即起動（${ms}ms ≤ 3000）`, loaded && ms <= 3000);
  if (loaded) ok('グラフのライブラリも読み込まれる（defer）', await page.evaluate(() => typeof Chart === 'function'));
  else ok('グラフのライブラリも読み込まれる（defer）', false);
  ok('JSエラーなし(SW)', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
  // T10-5: 事務所で1回開いただけ（2回目をオンラインで開いていない）で圏外の豚舎へ → キャッシュ（ASSETS）だけで全部そろう
  //   オンラインで reload すると ASSETS から漏れたファイルも実行中のキャッシュに入って漏れが隠れるので、登録直後に切る
  const ctx2 = await browser.newContext();
  const pg2 = await ctx2.newPage();
  const err2 = [];
  pg2.on('pageerror', e => err2.push(String(e)));
  await pg2.route(u => u.href.startsWith('https://script.google.com/'), r => r.abort('internetdisconnected'));
  await pg2.goto(base + 'index.html');
  await pg2.evaluate(() => navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready));
  down = true;
  let loaded2 = true;
  try { await pg2.reload({ waitUntil: 'load', timeout: 10000 }); } catch (e) { loaded2 = false; }
  await pg2.waitForTimeout(800);
  const st2 = loaded2 ? await pg2.evaluate(() => ({ ctl: !!navigator.serviceWorker.controller, fn: ['personKeyer', 'submitReq', 'syncPending', 'renderRoster', 'importAll', 'setLang'].filter(f => typeof window[f] !== 'function'), works: typeof WORKDATA_V2 === 'object', css: getComputedStyle(document.body).fontFamily !== '' && document.styleSheets.length >= 2, chart: typeof Chart === 'function' })) : null;
  ok('登録直後に圏外 → キャッシュだけで起動（SWが制御）', loaded2 && st2 && st2.ctl);
  ok('登録直後に圏外でも js がすべて読める（ASSETS の漏れなし）' + (st2 && st2.fn.length ? ' 欠け=' + st2.fn.join('/') : ''), !!st2 && st2.fn.length === 0 && st2.works && st2.chart && st2.css);
  ok('JSエラーなし(SW 登録直後に圏外)', err2.length === 0);
  if (err2.length) console.log(err2.slice(0, 3).join('\n'));
  down = false;
  await browser.close().catch(() => {});
  srv.closeAllConnections && srv.closeAllConnections(); srv.close();
}

/* 多言語（vi/id/en）の表示崩れ・固有データ（架空名）:
   貼り付く作業見出しは1行（ja と同じ高さ）・目次は1段・長いカタカナ名の全文・「所属未確定」の訳・CSVのカテゴリは日本語固定 */
async function runI18n(devName) {
  console.log(`\n===== ${devName}（多言語の表示） =====`);
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await browser.newContext({ ...devices[devName], acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept());
  const LONG = 'テストティ・タイン・フォン・ビックゴ';       // 19字の架空カタカナ名
  const UNASSIGNED = '所属未確定';
  const roster = [
    { name: 'テスト 八長', farm: 'テスト農場A', works: ['No.25', 'No.31', 'No.27', 'No.30', 'No.41', 'No.43', '給餌', 'エサ調整'] },
    { name: LONG, farm: 'テスト農場A', works: ['給餌'] },
    { name: 'テスト 未定', farm: UNASSIGNED, works: ['給餌'] },
  ];
  await page.route(u => u.href.startsWith('https://script.google.com/'), async route => {
    const req = route.request(), hdr = { 'access-control-allow-origin': '*' };
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify(rosterRes(roster)) });
    const body = JSON.parse(req.postData());
    return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, id: body.record.id }) });
  });
  const ee = name => page.locator('.eetab').filter({ has: page.locator('.eetab-nm', { hasText: new RegExp('^' + name + '$') }) });
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const setL = async l => { await page.evaluate(l => setLang(l), l); await page.waitForTimeout(200); };
  await page.goto(APP);
  await page.evaluate(GAS => { localStorage.clear(); localStorage.setItem('jitsugi_v2_sheet_url', GAS); localStorage.setItem('jitsugi_v2_evaluator', 'テスト評価者'); }, GAS);
  await page.reload(); await page.waitForTimeout(600);

  console.log('[I0] 4言語のキーがそろっている');
  const keyDiff = await page.evaluate(() => { const ja = Object.keys(TX.ja); return ['en', 'vi', 'id'].map(l => { const k = Object.keys(TX[l]); return l + ':' + ja.filter(x => !k.includes(x)).concat(k.filter(x => !ja.includes(x))).join('/'); }).filter(x => !/:$/.test(x)); });
  ok('ja/en/vi/id のキーが一致' + (keyDiff.length ? ' ' + keyDiff.join(' ') : ''), keyDiff.length === 0);

  console.log('[I1] 作業8つ（長い作業名）: 貼り付く見出しは1行・目次は1段');
  await ee('テスト 八長').tap(); await page.waitForTimeout(300);
  ok('カード40枚', await page.locator('#cards .ec').count() === 40);
  const hs = {};
  for (const l of ['ja', 'vi', 'id', 'en']) {
    await setL(l);
    hs[l] = { hd: await page.locator('.wshd').evaluateAll(e => Math.max(...e.map(x => x.getBoundingClientRect().height))), nav: Math.round((await page.locator('#wnav').boundingBox()).height), hs: await noHScroll() };
  }
  for (const l of ['vi', 'id', 'en']) {
    ok(`${l}: 見出しの最大高さ ${Math.round(hs[l].hd)}px ≤ ja ${Math.round(hs.ja.hd)}px・84px以下`, hs[l].hd <= hs.ja.hd + 1 && hs[l].hd <= 84);
    ok(`${l}: 作業の目次は1段（高さ ${hs[l].nav}px ≤ 64）・横スクロールなし`, hs[l].nav <= 64 && hs[l].hs);
  }
  await setL('vi');
  const sub = await page.locator('.wsec[data-w="move-preg"] .wsub-nm').textContent();
  const full = await page.evaluate(() => WORKDATA_V2.works.find(w => w.id === 'move-preg').name_vi);
  ok('vi: 作業名の全文は貼り付かない行に出る（見出しは省略・title に全文）', sub.includes(full) && await page.locator('#wh-move-preg .wshd-nm').getAttribute('title') === full && await page.locator('.wsec[data-w="move-preg"] .wsub').evaluate(e => getComputedStyle(e).position !== 'sticky'));
  ok('vi: 「今回は実施しない」は作業ごとに押せる', await page.locator('.wshd-skip').count() === 8 && /Lần này không làm/.test(await page.locator('.wshd-skip').first().textContent()));
  await page.evaluate(() => { const c = document.querySelectorAll('#cards .ec[data-w="move-preg"]')[2]; window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 250); });
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => { const stk = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stk')); const el = document.elementFromPoint(innerWidth / 2, stk + 8); const h = el && el.closest('.wshd'); return { w: h && h.dataset.w, b: h && Math.round(h.getBoundingClientRect().bottom), stk }; });
  ok(`vi: スクロール中の貼り付き見出しは1行分（下端 ${st.b} ≤ ${Math.round(st.stk) + 60}）`, st.w === 'move-preg' && st.b <= st.stk + 60);
  await page.screenshot({ path: `${__dirname}/_shots/${devName.replace(/\W/g, '_')}_I1_vi_sticky.png` });
  await page.evaluate(() => window.scrollTo(0, 0));
  await setL('ja');

  console.log('[I2] 長いカタカナ名（19字）: タブで切れない・選んだ人の全文を採点カードの上に');
  const lt = ee(LONG);
  ok('タブの名前が切れない（3行まで）・title に全文', await lt.locator('.eetab-nm').evaluate(e => e.scrollHeight <= e.clientHeight + 1) && await lt.getAttribute('title') === LONG);
  ok('選択中の人（テスト 八長）を採点カードの上に表示', /テスト 八長/.test(await page.locator('#eeCur').textContent()));
  await lt.tap(); await page.waitForTimeout(300);
  ok('選んだ人の全文と農場が画面に出る', await page.locator('#eeCur').isVisible() && (await page.locator('#eeCur').textContent()).includes(LONG) && /テスト農場A/.test(await page.locator('#eeCur').textContent()));
  // 実施済みにしても名前は切れない（✓はタブ右上のバッジ）
  for (const cid of await page.locator('#cards .ec').evaluateAll(els => els.map(e => e.id.slice(2)))) await page.locator(`.sb[data-id="${cid}"][data-s="4"]`).tap();
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  ok('実施済みのタブでも名前が切れない', await ee(LONG).evaluate(e => e.classList.contains('done')) && await ee(LONG).locator('.eetab-nm').evaluate(e => e.scrollHeight <= e.clientHeight + 1));
  const okB = await ee(LONG).locator('.eetab-ok').boundingBox(), tbB = await ee(LONG).boundingBox(), nmW = await ee(LONG).locator('.eetab-nm').evaluate(e => e.parentElement.clientWidth - parseFloat(getComputedStyle(e.parentElement).paddingLeft) - parseFloat(getComputedStyle(e.parentElement).paddingRight));
  ok(`✓バッジはタブ右上の角（名前の欄 ${Math.round(nmW)}px ≥ ${Math.round(tbB.width - 30)}px）`, okB && okB.y < tbB.y && nmW >= tbB.width - 30);
  await setL('vi');
  ok('vi でも名前が切れない', await ee(LONG).locator('.eetab-nm').evaluate(e => e.scrollHeight <= e.clientHeight + 1) && await noHScroll());
  await setL('ja');

  console.log('[I3] 「所属未確定」: 表示だけ訳す・保存と送信は元の値');
  const chip = () => page.locator(`.fchip[data-f="${UNASSIGNED}"]`);
  ok('ja は「所属未確定」', /^所属未確定/.test(await chip().textContent()));
  const want = { vi: 'Chưa xác định trại', id: 'Peternakan belum ditentukan', en: 'Farm not assigned' };
  for (const l of ['vi', 'id', 'en']) { await setL(l); ok(`${l}: チップは「${want[l]}」・日本語が残らない`, (await chip().textContent()).startsWith(want[l]) && !/未確定/.test(await chip().textContent())); }
  ok('id: 農場未記入の訳に英語の Farm が混じらない', await page.evaluate(() => TX.id.farmNone === 'Peternakan belum diisi'));
  await setL('vi');
  await chip().tap(); await page.waitForTimeout(200);
  await ee('テスト 未定').tap(); await page.waitForTimeout(300);
  ok('vi: 採点中の表示も訳した農場名', (await page.locator('#eeCur').textContent()).includes('Chưa xác định trại'));
  for (const cid of await page.locator('#cards .ec').evaluateAll(els => els.map(e => e.id.slice(2)))) await page.locator(`.sb[data-id="${cid}"][data-s="3"]`).tap();
  await page.locator('#btnSave').tap(); await page.waitForTimeout(900);
  const rs = await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_data')).evaluations);
  ok('保存した記録の farm は元の「所属未確定」', rs.find(r => r.evaluatee === 'テスト 未定').farm === UNASSIGNED);

  console.log('[I4] CSVは日本語固定（カテゴリ列が画面の言語で変わらない）');
  const csvOf = async l => { await setL(l); const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => doCSV())]); return fs.readFileSync(await dl.path(), 'utf8'); };
  const cJa = await csvOf('ja'), cVi = await csvOf('vi'), cId = await csvOf('id');
  ok('vi/id で出したCSVが ja と同じ（カテゴリ列=飼養管理）', cVi === cJa && cId === cJa && cJa.includes('"飼養管理","給餌"'));
  await setL('ja');

  ok('JSエラーなし(多言語)', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
}

/* アクセシビリティ（周6）: 人を選んだ直後の位置とフォーカス・未採点の印・「今回は実施しない」の誤タップ */
async function runA11y(devName) {
  console.log(`\n===== ${devName}（アクセシビリティ） =====`);
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await browser.newContext({ ...devices[devName] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  // 架空の名簿: 12農場＋所属未確定、最大の農場は25名、1人3作業
  const BIG = 'テスト農場L', W3 = ['給餌', 'エサ調整', '除フン'];
  const roster = [];
  for (let f = 1; f <= 11; f++) for (let i = 1; i <= 5; i++) roster.push({ name: `テスト ${f}-${i}`, farm: `テスト農場${String(f).padStart(2, '0')}`, works: W3 });
  for (let i = 1; i <= 25; i++) roster.push({ name: `テスト 大${String(i).padStart(2, '0')}`, farm: BIG, works: W3 });
  for (let i = 1; i <= 18; i++) roster.push({ name: `テスト 未${i}`, farm: '所属未確定', works: W3 });
  await page.route(u => u.href.startsWith('https://script.google.com/'), async route => {
    const req = route.request(), hdr = { 'access-control-allow-origin': '*' };
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify(rosterRes(roster)) });
    const body = JSON.parse(req.postData());
    return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, id: body.record.id }) });
  });
  const ee = name => page.locator('.eetab').filter({ has: page.locator('.eetab-nm', { hasText: new RegExp('^' + name + '$') }) });
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const setL = async l => { await page.evaluate(l => setLang(l), l); await page.waitForTimeout(250); };
  // 要素の中央が貼り付く帯の下に見えていて、そこを押すとその要素自身に当たるか
  const visibleHit = sel => page.evaluate(sel => {
    const e = document.querySelector(sel); if (!e) return 'none';
    const r = e.getBoundingClientRect(), stk = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stk')) || 0;
    if (r.top < stk - 1) return 'top=' + Math.round(r.top) + '<stk=' + stk;
    if (r.bottom > innerHeight) return 'below';
    const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return h && (h === e || e.contains(h)) ? 'ok' : 'hit=' + (h ? h.className || h.tagName : 'null');
  }, sel);
  await page.goto(APP);
  await page.evaluate(GAS => { localStorage.clear(); localStorage.setItem('jitsugi_v2_sheet_url', GAS); localStorage.setItem('jitsugi_v2_evaluator', 'テスト評価者'); }, GAS);
  await page.reload(); await page.waitForTimeout(600);
  await page.locator(`.fchip[data-f="${BIG}"]`).tap(); await page.waitForTimeout(200);
  ok('25名の農場', await page.locator('.eetab').count() === 25);

  for (const l of ['ja', 'vi']) {
    console.log(`[X1] ${l}: 人を選ぶと「採点中」・目次・1つ目の作業が貼り付く帯の下に見え、フォーカスが採点の入口へ`);
    await setL(l);
    const name = l === 'ja' ? 'テスト 大01' : 'テスト 大02';
    await ee(name).tap(); await page.waitForTimeout(1500);
    const cur = await visibleHit('#eeCur');
    ok(`${l}: 「採点中」が帯の下に見える (${cur})`, cur === 'ok');
    ok(`${l}: 採点中の名前が正しい`, (await page.locator('#eeCur').textContent()).includes(name));
    const nav = await visibleHit('#wnav'), sk = await visibleHit('.wshd-skip');
    ok(`${l}: 作業の目次が見える (${nav})・1つ目の「今回は実施しない」が押せる (${sk})`, nav === 'ok' && sk === 'ok');
    ok(`${l}: フォーカスは「採点中」へ移る（押したタブに残らない）`, await page.evaluate(() => document.activeElement && document.activeElement.id === 'eeCur'));
    ok(`${l}: 「採点中」は tabindex=-1（Tab順には入らない）`, await page.locator('#eeCur').getAttribute('tabindex') === '-1');
  }
  await setL('ja');

  console.log('[X2] 未採点のまま保存 → 印は消えずに残る・フォーカス・件数と「次へ」');
  await ee('テスト 大03').tap(); await page.waitForTimeout(600);
  const first = await page.locator('#cards .ec').first().evaluate(e => e.id.slice(2));
  await page.locator(`.sb[data-id="${first}"][data-s="4"]`).tap();
  await page.locator('#btnSave').tap(); await page.waitForTimeout(2000);
  const missIds = await page.locator('#cards .ec.miss').evaluateAll(els => els.map(e => e.id));
  ok(`2秒後も未採点の印が4枚に残る (${missIds.length})`, missIds.length === 4);
  ok('印は文字でも出る（⚠ 未採点のバッジが見える）', await page.locator('#cards .ec.miss .miss-bd').first().isVisible() && /⚠ 未採点/.test(await page.locator('#cards .ec.miss .miss-bd').first().textContent()));
  ok('未採点でないカードにはバッジが出ない', !(await page.locator(`#c-${first} .miss-bd`).isVisible()));
  ok('枠は太い赤（3px以上）', await page.locator('#cards .ec.miss').first().evaluate(e => parseFloat(getComputedStyle(e).borderTopWidth) >= 3));
  ok('フォーカスは1枚目の未採点カードの点数ボタン群', await page.evaluate(id => { const a = document.activeElement; return !!a && a.classList.contains('sr') && a.closest('.ec').id === id; }, missIds[0]));
  ok('点数ボタン群は種目名と「未採点」で読み上げられる', await page.evaluate(id => { const sr = document.querySelector('#' + id + ' .sr'); return document.getElementById(sr.getAttribute('aria-labelledby')).textContent.length > 0 && /未採点/.test(document.getElementById(sr.getAttribute('aria-describedby')).textContent); }, missIds[0]));
  ok('進捗の横に「未採点 4 件・次へ」', await page.locator('#missNext').isVisible() && /未採点 4 件/.test(await page.locator('#missNext').textContent()));
  const mnb = await page.locator('#missNext').boundingBox();
  ok(`「次へ」のタップ領域 ${Math.round(mnb.height)}px ≥ 44`, mnb.height >= 44);
  ok('「次へ」を出しても貼り付く帯の高さ(--stk)を測り直す', await page.evaluate(() => { const p = document.querySelector('.prog'), h = document.querySelector('.hdr'); return Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stk')) - (h.offsetHeight + p.offsetHeight)) < 1; }));
  ok('横スクロールなし(未採点の表示)', await noHScroll());
  await page.locator('#missNext').tap(); await page.waitForTimeout(300);
  ok('「次へ」で2枚目の未採点へフォーカス', await page.evaluate(id => document.activeElement && document.activeElement.closest('.ec') && document.activeElement.closest('.ec').id === id, missIds[1]));
  await page.locator(`#${missIds[1]} .sb[data-s="3"]`).tap(); await page.waitForTimeout(200);
  ok('点を付けたカードだけ印が消え、件数が減る（3件）', !(await page.locator(`#${missIds[1]}`).evaluate(e => e.classList.contains('miss'))) && await page.locator('#cards .ec.miss').count() === 3 && /未採点 3 件/.test(await page.locator('#missNext').textContent()));
  await setL('vi');
  ok('言語を切り替えても印は残る（vi: Chưa chấm）', await page.locator('#cards .ec.miss').count() === 3 && /Chưa chấm/.test(await page.locator('#cards .ec.miss .miss-bd').first().textContent()) && /Chưa chấm 3/.test(await page.locator('#missNext').textContent()));
  ok('vi: 横スクロールなし(未採点の表示)', await noHScroll());
  await setL('ja');
  for (const id of await page.locator('#cards .ec.miss').evaluateAll(els => els.map(e => e.id))) await page.locator(`#${id} .sb[data-s="3"]`).tap();
  ok('全部付けると「次へ」は消える', await page.locator('#cards .ec.miss').count() === 0 && !(await page.locator('#missNext').isVisible()));

  console.log('[X3] 「今回は実施しない」: 44px・下のリンクと8px以上・誤タップは「元に戻す」で戻る');
  for (const l of ['ja', 'vi']) {
    await setL(l);
    const hs = await page.locator('.wshd-skip').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)));
    ok(`${l}: 「今回は実施しない」の高さ ${Math.min(...hs)}px ≥ 44`, Math.min(...hs) >= 44);
    const gaps = await page.locator('.wsec').evaluateAll(els => els.map(s => { const b = s.querySelector('.wshd-skip'), m = s.querySelector('.man-link'); return b && m ? m.getBoundingClientRect().top - b.getBoundingClientRect().bottom : 99; }));
    ok(`${l}: マニュアルへのリンクとの間 ${Math.min(...gaps)}px ≥ 8`, Math.min(...gaps) >= 8);
  }
  await setL('ja');
  const lsw = await page.locator('.lsw button').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().width)));
  ok(`言語ボタンの幅 ${Math.min(...lsw)}px ≥ 44`, Math.min(...lsw) >= 44);
  ok('横スクロールなし(言語ボタン)', await noHScroll());
  // 未採点の作業を外す → 「元に戻す」で同じ位置に戻る
  const before = await page.evaluate(() => selWorks.slice());
  await page.locator(`.wsec[data-w="${before[1]}"] .wshd-skip`).tap(); await page.waitForTimeout(300);
  ok('外すと作業が減る', await page.evaluate(() => selWorks.length) === before.length - 1);
  const undo = page.locator('#toast .toast-act');
  ok('トーストに「元に戻す」（44px以上）', await undo.isVisible() && /元に戻す/.test(await undo.textContent()) && (await undo.boundingBox()).height >= 44);
  await undo.tap(); await page.waitForTimeout(300);
  ok('「元に戻す」で同じ位置に戻る', JSON.stringify(await page.evaluate(() => selWorks)) === JSON.stringify(before));
  ok('戻した後はトーストが消える', !(await page.locator('#toast').evaluate(e => e.classList.contains('show'))));
  // 採点済みの作業を（確認を経て）外しても、「元に戻す」で点とコメントごと戻る
  const w0 = before[0], c0 = await page.locator(`#cards .ec[data-w="${w0}"]`).first().evaluate(e => e.id.slice(2));
  await page.locator(`.sb[data-id="${c0}"][data-s="2"]`).tap();
  await page.fill(`textarea[data-cid="${c0}"]`, 'テストのコメント');
  const nd = dialogs.length;
  await page.locator(`.wsec[data-w="${w0}"] .wshd-skip`).tap(); await page.waitForTimeout(300);
  ok('採点済みの作業は確認を出す', dialogs.length === nd + 1);
  await page.locator('#toast .toast-act').tap(); await page.waitForTimeout(300);
  const back = await page.evaluate(id => ({ s: (document.querySelector('.sb[data-id="' + id + '"].sel') || {}).dataset?.s, c: (document.querySelector('textarea[data-cid="' + id + '"]') || {}).value }), c0);
  ok('採点済みでも「元に戻す」で点とコメントが戻る', back.s === '2' && back.c === 'テストのコメント' && await page.evaluate(() => selWorks[0]) === w0);
  ok('普通のトーストは押せない（下の画面を邪魔しない）', await page.evaluate(() => { toast('x'); return getComputedStyle(document.getElementById('toast')).pointerEvents === 'none' && !document.querySelector('#toast .toast-act'); }));

  ok('JSエラーなし(アクセシビリティ)', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
}

/* E12: 名簿の取得失敗を理由ごとに（電波／受験者タブが無い／応答が不正／古い GAS）・送信先を切り替えたら前のシートの名簿を出さない（架空名） */
async function runSheetErr(devName) {
  console.log(`\n===== ${devName}（名簿の失敗理由・送信先の切り替え） =====`);
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await browser.newContext({ ...devices[devName] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept('ooiri'));
  const URL_A = 'https://script.google.com/macros/s/TESTA_sheet-1/exec', URL_B = 'https://script.google.com/macros/s/PRODB_sheet-2/exec';
  const mode = { [URL_A]: 'ok', [URL_B]: 'ok' }, rosters = { [URL_A]: [{ name: 'テスト甲', farm: '試験農場', works: ['給餌'] }, { name: 'テスト乙', farm: '試験農場', works: ['給餌'] }], [URL_B]: [] };
  const hdr = { 'access-control-allow-origin': '*' };
  await page.route(u => u.href.startsWith('https://script.google.com/'), async route => {
    const req = route.request(), base = req.url().split('?')[0], m = mode[base];
    if (m === 'offline') return route.abort('internetdisconnected');
    if (req.method() === 'GET') {
      if (m === 'nosheet') return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: false, ...GAS_META, error: 'no roster sheet' }) });
      if (m === 'html') return route.fulfill({ status: 200, contentType: 'text/html', headers: hdr, body: '<!DOCTYPE html><html><body>Script function not found: doGet</body></html>' });
      if (m === 'old') return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, version: '2026-08-01' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify(rosterRes(rosters[base])) });
    }
    const body = JSON.parse(req.postData());
    return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, id: body.record ? body.record.id : body.id }) });
  });
  const note = () => page.locator('#eeNote').textContent(), warn = page.locator('#eeWarn'), bar = () => page.locator('#syncBar').textContent();
  const toastTx = () => page.locator('#toast').textContent();
  await page.goto(APP);
  await page.evaluate(A => { localStorage.clear(); localStorage.setItem('jitsugi_v2_sheet_url', A); localStorage.setItem('jitsugi_v2_evaluator', 'テスト評価者'); }, URL_A);

  console.log('[E1] キャッシュの無い初回起動: 失敗の理由ごとに文言を分ける');
  const cases = [
    ['nosheet', /「受験者」タブがありません.*setup/, null],
    ['html', /応答が不正/, null],
    ['old', /応答が不正/, /古い版です（2026-08-01）/],
  ];
  for (const [m, reW, reG] of cases) {
    mode[URL_A] = m;
    await page.reload(); await page.waitForTimeout(700);
    const n = await note(), w = await warn.textContent();
    ok(`${m}: #eeNote は「電波の良い所で」と言わない・シート側の問題と言う`, !/電波の良い所/.test(n) && /シート側の問題/.test(n));
    ok(`${m}: #eeWarn に理由を常に出す`, await warn.isVisible() && reW.test(w) && (!reG || reG.test(w)));
    ok(`${m}: 起動時もトーストで知らせる・前回の名簿は無いので「前回の名簿を表示中」と言わない`, reW.test(await toastTx()) && !/前回の名簿/.test(await toastTx()));
    ok(`${m}: 同期バーは緑の「すべて送信済み」にしない`, !/すべてスプレッドシートに送信済み/.test(await bar()) && /シート側の設定に問題/.test(await bar()) && await page.locator('#syncBar').evaluate(e => e.classList.contains('warn')));
  }
  mode[URL_A] = 'old';
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(600);
  ok('old: 「名簿を更新」でも前回の名簿が無いのに「前回の名簿を表示中」と言わない・古い版も知らせる', /応答が不正/.test(await toastTx()) && /古い版です/.test(await toastTx()) && !/前回の名簿/.test(await toastTx()));
  mode[URL_A] = 'offline';
  await page.reload(); await page.waitForTimeout(700);
  ok('offline: 電波の時だけ「電波の良い所で」', /電波の良い所/.test(await note()) && !(await warn.isVisible()));
  ok('offline: 同期バーは「シートに接続できていません」', /接続できていません/.test(await bar()) && !/すべてスプレッドシートに送信済み/.test(await bar()));
  mode[URL_A] = 'nosheet';
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(600);
  for (const [l, re] of [[1, /Ask the administrator to run setup/], [2, /quản trị viên chạy setup/], [3, /admin menjalankan setup/]]) {
    await page.locator('.lsw button').nth(l).tap(); await page.waitForTimeout(100);
    ok(`${['', 'en', 'vi', 'id'][l]}: 受験者タブが無いの警告・同期バーが訳される`, re.test(await warn.textContent()) && !/受験者」タブ/.test(await note()) && !/シート側/.test(await bar()));
  }
  await page.locator('.lsw button').nth(0).tap(); await page.waitForTimeout(100);
  mode[URL_A] = 'ok';
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(600);
  ok('取れれば警告は消え、同期バーは送信済みに戻る', !(await warn.isVisible()) && /すべてスプレッドシートに送信済み/.test(await bar()) && await page.locator('.eetab').count() === 2);
  ok('名簿キャッシュに取得元の URL', await page.evaluate(A => JSON.parse(localStorage.getItem('jitsugi_v2_roster')).url === A, URL_A));
  mode[URL_A] = 'nosheet';
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(600);
  ok('前回の名簿がある時だけ「（前回の名簿を表示中）」・#eeNote は前回の名簿（シート側の問題）', /タブがありません.*（前回の名簿を表示中）/.test(await toastTx()) && /前回の名簿（.*シート側の問題/.test(await note()) && await page.locator('.eetab').count() === 2);
  mode[URL_A] = 'ok';
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(600);

  console.log('[E2] 送信先URLを別のシートへ切り替え → 前のシートの名簿を出さない（記録には触れない）');
  await page.evaluate(() => { const w = WORKDATA_V2.works[0]; putAll([{ id: 'keep-1', date: '2026-09-24', evaluator: 'テスト評価者', evaluatee: 'テスト甲', farm: '試験農場', overall: '', createdAt: '2026-09-24T00:00:00Z', works: [{ workId: w.id, workName: w.name, category: w.category, scores: Object.fromEntries(w.aspects.map(a => [a.id, 3])), comments: {} }], sent: true, sentOnce: true }]); });
  const recsBefore = await page.evaluate(() => localStorage.getItem('jitsugi_v2_data'));
  const switchTo = async u => { await page.evaluate(u => { document.getElementById('cfgUrl').value = u; return saveSheetUrl(); }, u); await page.waitForTimeout(600); };
  mode[URL_B] = 'nosheet';
  await switchTo(URL_B);
  ok('B=受験者タブ無し: A の人のタブ・農場チップが消える', await page.locator('.eetab').count() === 0 && await page.locator('.fchip').count() === 0);
  ok('B=受験者タブ無し: 「前回の名簿」と言わず、タブが無いと出す', !/前回の名簿/.test(await note()) && !/前回の名簿/.test(await toastTx()) && /タブがありません/.test(await warn.textContent()));
  ok('B=受験者タブ無し: 名簿キャッシュは捨てられている', await page.evaluate(() => getRoster().list.length === 0 && !localStorage.getItem('jitsugi_v2_roster')));
  mode[URL_B] = 'ok'; rosters[URL_B] = [];
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(600);
  ok('B=名簿が空: A の名簿を「前回の名簿」として残さない', await page.locator('.eetab').count() === 0 && !/前回の名簿/.test(await warn.textContent() || '') && /名簿がありません/.test(await note()));
  await switchTo(URL_A); await switchTo(URL_B);   // 名簿を取った後に切り替え（A→B）
  ok('A で名簿を取った後に B（名簿が空）へ切り替えても A の2名は出ない', await page.locator('.eetab').count() === 0 && !/テスト甲/.test(await page.locator('#eeTabs').textContent()));
  rosters[URL_B] = [{ name: 'テスト丙', farm: '本番農場', works: ['給餌'] }];
  await page.locator('.eebox .wsel-hd button').tap(); await page.waitForTimeout(600);
  ok('B の名簿が入れば B の人だけ', await page.locator('.eetab').count() === 1 && /テスト丙/.test(await page.locator('#eeTabs').textContent()) && await page.evaluate(B => JSON.parse(localStorage.getItem('jitsugi_v2_roster')).url === B, URL_B));
  ok('切り替えで記録は変わらない', await page.evaluate(() => localStorage.getItem('jitsugi_v2_data')) === recsBefore);
  await switchTo(URL_B);   // 同じURLを保存し直しても名簿は捨てない
  ok('同じURLの保存し直しでは名簿を捨てない', await page.locator('.eetab').count() === 1);

  console.log('[E3] 取得元URLの無い旧キャッシュ（前の版のアプリ）は今の送信先の名簿として読む（互換）');
  mode[URL_B] = 'offline';
  await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('jitsugi_v2_roster')); delete r.url; localStorage.setItem('jitsugi_v2_roster', JSON.stringify(r)); });
  await page.reload(); await page.waitForTimeout(700);
  ok('旧キャッシュは圏外起動でも表示', await page.locator('.eetab').count() === 1 && /前回の名簿（/.test(await note()));
  mode[URL_A] = 'offline';
  await switchTo(URL_A);
  ok('旧キャッシュでも送信先を変えたら表示しない', await page.locator('.eetab').count() === 0);

  ok('JSエラーなし(名簿の失敗理由)', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
}

(async () => {
  if (process.env.ONLY) {   // 例: ONLY=rel,assign,guard,backup,sw（わざと壊して検証する時に一部だけ回す）
    const on = new Set(process.env.ONLY.split(','));
    if (on.has('rel')) await runRel('iPhone 13');
    if (on.has('assign')) await runAssign('iPhone 13');
    if (on.has('guard')) await runGuard('iPhone 13');
    if (on.has('backup')) await runBackup('iPhone 13');
    if (on.has('sw')) await runSW();
    if (on.has('err')) await runSheetErr('iPhone SE');
    console.log(`\n合計: OK ${pass} / NG ${fail}`); process.exit(fail ? 1 : 0);
  }
  if (process.env.ONLY_A11Y) { for (const d of ['iPhone SE', 'Pixel 7']) await runA11y(d); console.log(`\n合計: OK ${pass} / NG ${fail}`); process.exit(fail ? 1 : 0); }
  if (process.env.ONLY_DATE) { for (const d of ['iPhone 13', 'Pixel 7']) await runDate(d); console.log(`\n合計: OK ${pass} / NG ${fail}`); process.exit(fail ? 1 : 0); }
  if (process.env.ONLY_I18N) { await runI18n('iPhone SE'); console.log(`\n合計: OK ${pass} / NG ${fail}`); process.exit(fail ? 1 : 0); }
  if (!process.env.ONLY_REL && !process.env.ONLY_ASSIGN) for (const d of ['iPhone SE', 'iPhone 13', 'Pixel 7']) await run(d);
  if (!process.env.ONLY_REL && !process.env.ONLY_ASSIGN) await runSlow('iPhone SE');
  if (!process.env.ONLY_ASSIGN) await runRel('iPhone 13');
  for (const d of ['iPhone 13', 'iPhone SE']) await runAssign(d);
  if (!process.env.ONLY_REL && !process.env.ONLY_ASSIGN) { await runGuard('iPhone 13'); await runBackup('iPhone 13'); }
  if (!process.env.ONLY_REL && !process.env.ONLY_ASSIGN) for (const d of ['iPhone 13', 'Pixel 7']) await runDate(d);
  if (!process.env.ONLY_REL && !process.env.ONLY_ASSIGN) for (const d of ['iPhone SE', 'Pixel 7']) await runI18n(d);
  if (!process.env.ONLY_REL && !process.env.ONLY_ASSIGN) for (const d of ['iPhone SE', 'Pixel 7']) await runA11y(d);
  if (!process.env.ONLY_REL && !process.env.ONLY_ASSIGN) await runSheetErr('iPhone SE');
  await runSW();
  console.log(`\n合計: OK ${pass} / NG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
