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
        body: JSON.stringify(a === 'roster' ? (roster === 'NOSHEET' ? { ok: false, error: 'no roster sheet' } : { ok: true, roster }) : { ok: true }) });
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
  ok('受験者タブが無い → 名簿は残し、タブが無いと知らせる', await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_roster')).list.length) === nBefore && /「受験者」タブが見つかりません/.test(await page.locator('#toast').textContent()));
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
  let online = true, postDelay = 0, failFor = null, oldGas = false;
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
      return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify(a === 'roster' ? { ok: true, roster } : { ok: true }) });
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
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, roster }) });
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
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, roster }) });
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

/* Service Worker: 電波が弱い（つながるが応答が返らない）時もキャッシュから即起動する（localhost で実際にSWを登録） */
async function runSW() {
  console.log('\n===== Service Worker（応答が返らない回線で起動） =====');
  const http = require('http'), path = require('path');
  let hang = false; const held = [];
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const srv = http.createServer((req, res) => {
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
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, roster }) });
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
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ ok: true, roster }) });
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

(async () => {
  if (process.env.ONLY_A11Y) { for (const d of ['iPhone SE', 'Pixel 7']) await runA11y(d); console.log(`\n合計: OK ${pass} / NG ${fail}`); process.exit(fail ? 1 : 0); }
  if (process.env.ONLY_DATE) { for (const d of ['iPhone 13', 'Pixel 7']) await runDate(d); console.log(`\n合計: OK ${pass} / NG ${fail}`); process.exit(fail ? 1 : 0); }
  if (process.env.ONLY_I18N) { await runI18n('iPhone SE'); console.log(`\n合計: OK ${pass} / NG ${fail}`); process.exit(fail ? 1 : 0); }
  if (!process.env.ONLY_REL && !process.env.ONLY_ASSIGN) for (const d of ['iPhone SE', 'iPhone 13', 'Pixel 7']) await run(d);
  if (!process.env.ONLY_REL && !process.env.ONLY_ASSIGN) await runSlow('iPhone SE');
  if (!process.env.ONLY_ASSIGN) await runRel('iPhone 13');
  for (const d of ['iPhone 13', 'iPhone SE']) await runAssign(d);
  if (!process.env.ONLY_REL && !process.env.ONLY_ASSIGN) for (const d of ['iPhone 13', 'Pixel 7']) await runDate(d);
  if (!process.env.ONLY_REL && !process.env.ONLY_ASSIGN) for (const d of ['iPhone SE', 'Pixel 7']) await runI18n(d);
  if (!process.env.ONLY_REL && !process.env.ONLY_ASSIGN) for (const d of ['iPhone SE', 'Pixel 7']) await runA11y(d);
  await runSW();
  console.log(`\n合計: OK ${pass} / NG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
