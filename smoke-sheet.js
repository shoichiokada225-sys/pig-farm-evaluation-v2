/* スプレッドシート連携＋スマホ実機相当テスト（iPhone/Android エミュレーション・GASはモック）
   実行: node smoke-sheet.js   （スクショ: ./_shots/ ・git管理外） */
const { chromium, devices } = require('C:/Users/so/farm-shift-app/node_modules/playwright');
const fs = require('fs');

const APP = 'file:///C:/Users/so/pig-farm-evaluation-v2/index.html';
const GAS = 'https://script.google.com/macros/s/TESTDEPLOY_abc-123/exec';
let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  OK ' + name); }
  else { fail++; console.log('  NG ' + name); }
}
fs.mkdirSync(__dirname + '/_shots', { recursive: true });

async function run(devName) {
  console.log(`\n===== ${devName} =====`);
  const browser = await chromium.launch();
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
  await page.locator('.eetab').nth(0).tap();
  await page.waitForTimeout(250);
  ok('選択タブがon', await page.locator('.eetab.on').count() === 1);
  ok('作業見出し2つ（給餌・エサ調整）', await page.locator('.wshd').count() === 2);
  ok('カード10枚（5種目×2）', await page.locator('#cards .ec').count() === 10);
  ok('被評価者名がセット', await page.inputValue('#fEe') === 'グエン・ヴァン・アン');
  await page.screenshot({ path: `${__dirname}/_shots/${devName.replace(/\W/g, '_')}_2_tab.png` });
  await page.locator('.eetab').nth(1).tap();   // 未採点なので確認なしで切替
  await page.waitForTimeout(200);
  ok('No.指定でも解決（アグス=No.16 1作業）', await page.locator('.wshd').count() === 1);
  await page.locator('.eetab').nth(0).tap();
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
  await page.locator('.eetab').nth(4).tap();
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
  await page.locator('.eetab').nth(5).tap();
  await page.waitForTimeout(200);
  for (const cid of await page.locator('#cards .ec').evaluateAll(els => els.map(e => e.id.slice(2))))
    await page.locator(`.sb[data-id="${cid}"][data-s="2"]`).tap();
  await page.locator('#btnSave').tap();
  await page.waitForTimeout(600);
  ok('田島タブができる', !!sheet['田島'] && Object.keys(sheet['田島']).length === 1);

  console.log('[9] 名簿の作業が空/不明 → 手動選択パネルが開く');
  await page.locator('.eetab').nth(3).tap();
  await page.waitForTimeout(200);
  ok('作業なしの人は選択パネルが開く', await page.evaluate(() => document.getElementById('wselBox').open));
  ok('横スクロールなし(採点画面)', await noHScroll());

  console.log('[10] 多言語（vi）でもタブ・送信バー表示');
  await page.locator('.lsw button').nth(2).tap();
  await page.waitForTimeout(200);
  ok('vi 送信バー', /Đã gửi/.test(await page.locator('#syncBar').textContent()));
  ok('vi 横スクロールなし', await noHScroll());
  await page.locator('.lsw button').nth(0).tap();

  ok('JSエラーなし', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
}

(async () => {
  for (const d of ['iPhone SE', 'iPhone 13', 'Pixel 7']) await run(d);
  console.log(`\n合計: OK ${pass} / NG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
