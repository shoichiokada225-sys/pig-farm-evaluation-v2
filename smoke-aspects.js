/* 種目の上書き（シート「種目」タブ → roster.aspects → アプリ）の画面テスト。GAS はモック。
   実行: PW_PATH=~/anpi-kakunin/node_modules/playwright node smoke-aspects.js   （PW_CHANNEL は付けない＝同梱 Chromium） */
const { chromium } = require(process.env.PW_PATH || require('path').join(require('os').homedir(), 'farm-shift-app/node_modules/playwright'));
const fs = require('fs');
const APP = require('url').pathToFileURL(require('path').join(__dirname, 'index.html')).href;
const GAS = 'https://script.google.com/macros/s/TESTDEPLOY_abc-123/exec';
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  OK ' + name); } else { fail++; console.log('  NG ' + name); } }
const GAS_SRC = fs.readFileSync(__dirname + '/gas/Code.src.gs', 'utf8');
const GAS_META = { version: /CODE_VERSION = '([^']+)'/.exec(GAS_SRC)[1], capabilities: JSON.parse(/API_CAPABILITIES = (\[[^\]]*\])/.exec(GAS_SRC)[1].replace(/'/g, '"')) };
const W = 'feeding-daily', A1 = 'amount', A2 = 'residue-water';
const OV1 = { w: W, a: A1, name: '<b>x</b>新・給与量', kanten: '新しい観点<i>i</i>', lv: ['', '新Lv2の文', '', '', '新Lv5の文'] };
const OV2 = { w: W, a: A1, name: '二度目の名前' };

(async () => {
  const browser = await chromium.launch({});
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept('ooiri'));
  let online = true, aspects = [], oldGas = false;
  const posts = [];
  const roster = [{ name: 'テスト太郎', works: ['給餌'] }, { name: 'テスト花子', works: ['給餌'] }];
  await page.route(u => u.href.startsWith('https://script.google.com/'), async route => {
    if (!online) return route.abort('internetdisconnected');
    const req = route.request(), H = { 'access-control-allow-origin': '*' };
    if (req.method() === 'GET') {
      const a = new URL(req.url()).searchParams.get('action');
      let body = { ok: true, ...GAS_META };
      if (a === 'roster') {
        body = oldGas ? { ok: true, roster } : { ok: true, ...GAS_META, roster, ...(aspects === undefined ? {} : { aspects }) };
      }
      return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(body) });
    }
    const b = JSON.parse(req.postData()); posts.push(b);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ ok: true, id: b.record && b.record.id }) });
  });
  const ee = n => page.locator('.eetab').filter({ has: page.locator('.eetab-nm', { hasText: new RegExp('^' + n + '$') }) });
  const refresh = async () => { await page.locator('.eebox .wsel-hd button').click(); await page.waitForTimeout(500); };
  const txt = sel => page.locator(sel).first().textContent();
  const cid = (w, a) => w + '__' + a;
  const wi = () => page.evaluate(([w, a]) => { const it = workItems(w).find(x => x.aspectId === a); return { name: it.name, kanten: it.kanten, levels: it.levels }; }, [W, A1]);

  await page.goto(APP);
  await page.fill('#fEv', '岡田 正一'); await page.press('#fEv', 'Enter');
  await page.locator('.tabs button[data-pg="pgCfg"]').click();
  await page.fill('#cfgUrl', GAS);
  await page.locator('#pgCfg .b1').first().click();
  await page.waitForTimeout(500);
  await page.locator('.tabs button[data-pg="pgIn"]').click();
  const orig = await wi();
  await ee('テスト太郎').click(); await page.waitForTimeout(250);
  const b0 = await page.locator('#cards b').count();

  console.log('[A1] 上書きした種目名・観点・Lv文がカードに出る');
  aspects = [OV1]; await refresh();
  const enm = await txt('#enm-' + cid(W, A1)), crit = await txt('#c-' + cid(W, A1) + ' .crit-k');
  const lvs = await page.locator('#c-' + cid(W, A1) + ' .crit-lv .crit-t').allTextContents();
  ok('A1 種目名が新しい文', enm === OV1.name);
  ok('A1 観点が新しい文', crit.includes(OV1.kanten));
  ok('A1 Lv2・Lv5 が新しい文・Lv1 は原文のまま', lvs[1].includes('新Lv2の文') && lvs[4].includes('新Lv5の文') && lvs[0].includes(orig.levels[0]));

  console.log('[A2] <b>x</b> は文字のまま表示（HTML にならない）');
  ok('A2 文字として出る', enm.includes('<b>x</b>') && crit.includes('<i>i</i>'));
  ok('A2 #cards の b タグ数が増えない', (await page.locator('#cards b').count()) === b0);

  console.log('[A3] vi に切り替えても上書き欄は日本語・他の種目は vi');
  await page.locator('#lswBtn').click(); await page.locator('#lswMenu button').nth(2).click(); await page.waitForTimeout(250);
  const viOther = await page.evaluate(([w, a]) => { const x = workById(w).aspects.find(q => q.id === a); return x.name_vi; }, [W, A2]);
  const viLv1 = await page.evaluate(([w, a]) => workById(w).aspects.find(q => q.id === a).levels_vi[0], [W, A1]);
  ok('A3 上書きした種目名は日本語', (await txt('#enm-' + cid(W, A1))) === OV1.name);
  ok('A3 上書きしていない別種目は vi', !!viOther && (await txt('#enm-' + cid(W, A2))) === viOther);
  const lvv = await page.locator('#c-' + cid(W, A1) + ' .crit-lv .crit-t').allTextContents();
  ok('A3 Lv2 は日本語・Lv1 は vi', lvv[1].includes('新Lv2の文') && lvv[0].includes(viLv1));
  await page.locator('#lswBtn').click(); await page.locator('#lswMenu button').nth(0).click(); await page.waitForTimeout(250);

  console.log('[A4] 保存して POST された種目名が上書き後');
  for (const c of await page.locator('#cards .ec').evaluateAll(els => els.map(e => e.id.slice(2)))) await page.locator(`.sb[data-id="${c}"][data-s="3"]`).click();
  await page.locator('#btnSave').click(); await page.waitForTimeout(700);
  const sub = posts.filter(p => p.action === 'submit').pop();
  const names = sub ? sub.record.works[0].items.map(i => i.aspect) : [];
  ok('A4 items.aspect に上書き後の名前', names.includes(OV1.name) && !names.includes(orig.name));

  console.log('[A5] オフラインで再起動しても上書きが出る');
  online = false; await page.reload(); await page.waitForTimeout(500);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_roster')).aspects);
  ok('A5 localStorage に保存', Array.isArray(saved) && saved.length === 1 && saved[0].name === OV1.name);
  ok('A5 再起動後の workItems が上書き後', (await wi()).name === OV1.name);

  console.log('[A6] aspects:[] で原文に戻る');
  online = true; aspects = []; await refresh();
  const back = await wi();
  ok('A6 原文に戻る', back.name === orig.name && back.kanten === orig.kanten && back.levels[1] === orig.levels[1]);
  ok('A6 保存も空', (await page.evaluate(() => JSON.parse(localStorage.getItem('jitsugi_v2_roster')).aspects)).length === 0);

  console.log('[A7] capability も aspects キーも無い旧 GAS');
  oldGas = true; await refresh();
  ok('A7 旧 GAS 応答では原文のまま', (await wi()).name === orig.name && errors.length === 0);
  oldGas = false; aspects = [OV1]; await refresh(); const mid = (await wi()).name;
  oldGas = true; aspects = []; await refresh();
  ok('A7 旧 GAS 応答でもエラー無し', errors.length === 0);
  ok('A7 前回の上書きを消さない（キー無し＝保持）', mid === OV1.name && (await wi()).name === OV1.name);
  oldGas = false; aspects = []; await refresh();
  ok('A7 別アプリ状態: 旧 GAS 応答でも名簿は読めている', (await page.locator('.eetab').count()) === 2);
  const freshOrig = await wi();
  ok('A7 [] の応答で原文に戻る', freshOrig.name === orig.name);

  console.log('[A8] 設定タブの版行');
  aspects = [OV1, { w: W, a: A2, name: '二つ目' }]; await refresh();
  await page.locator('.tabs button[data-pg="pgCfg"]').click();
  ok('A8 「種目上書き 2件」が出る', /種目上書き 2件/.test(await txt('#dataVer')));
  await page.locator('.tabs button[data-pg="pgIn"]').click();

  console.log('[A9] 採点途中は裏の更新でカードが変わらない');
  aspects = [OV1]; await refresh();
  await ee('テスト花子').click(); await page.waitForTimeout(250);
  const first = await page.locator('#cards .ec').first().getAttribute('id');
  await page.locator(`.sb[data-id="${first.slice(2)}"][data-s="4"]`).click();
  const before = await txt('#enm-' + cid(W, A1));
  aspects = [OV2];
  await page.evaluate(() => reloadRoster(true, true)); await page.waitForTimeout(500);
  const after = await txt('#enm-' + cid(W, A1));
  ok('A9 カードの文言が変わらない', before === after && after === OV1.name);
  ok('A9 点が残っている', await page.locator('#' + first + '.scored').count() === 1);
  ok('A9 端末の保存は新しい内容（次に人を選んだ時から反映）', (await wi()).name === OV2.name);

  console.log('[A10] コメントだけ入力中も裏の更新でコメントが消えない');
  await page.evaluate(() => document.querySelectorAll('#cards .ec.scored').forEach(e => e.classList.remove('scored')));
  await page.evaluate(() => { document.querySelector('#cards textarea').value = '大事なコメント'; });
  aspects = [OV1];
  await page.evaluate(() => reloadRoster(true, true)); await page.waitForTimeout(500);
  ok('A10 コメントが残る', (await page.evaluate(() => document.querySelector('#cards textarea').value)) === '大事なコメント');

  ok('pageerror 0', errors.length === 0);
  console.log(`\n合計: OK ${pass} / NG ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
