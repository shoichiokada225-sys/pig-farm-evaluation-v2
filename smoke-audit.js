/* 2026-10-06 監査で見つかった「記録が消える・誤って付く」不具合の回帰テスト（GAS はモック・架空名のみ）
   実行: PW_PATH=~/anpi-kakunin/node_modules/playwright PW_CHANNEL=chrome node smoke-audit.js */
const { chromium } = require(process.env.PW_PATH || require('path').join(require('os').homedir(), 'farm-shift-app/node_modules/playwright'));
const APP = require('url').pathToFileURL(require('path').join(__dirname, 'index.html')).href;
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  OK ' : '  NG ') + n); };
const TOK = 'test-pass-12345';

async function open(opt) {
  opt = opt || {};
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  if (opt.init) await ctx.addInitScript(opt.init);
  const page = await ctx.newPage();
  const st = { posts: [], errors: [], dialogs: [], accept: true, sheet: {}, rows: null, html: false, needTok: !!opt.needTok,
    roster: opt.roster || [{ name: 'テスト 一郎', farm: 'テスト農場', works: ['給餌', 'エサ調整'] }, { name: 'テスト 二郎', farm: 'テスト農場', works: ['給餌'] }] };
  page.on('pageerror', e => st.errors.push(String(e)));
  page.on('dialog', d => { if (d.type() === 'beforeunload') return d.accept(); st.dialogs.push(d.message()); st.accept ? d.accept('ooiri') : d.dismiss(); });
  const H = { 'access-control-allow-origin': '*' };
  await page.route(u => u.href.startsWith('https://script.google.com/'), async route => {
    const req = route.request();
    if (st.html) return route.fulfill({ status: 200, contentType: 'text/html', headers: H, body: '<html>Sign in</html>' });
    if (req.method() === 'GET') {
      const k = new URL(req.url()).searchParams.get('k');
      if (st.needTok && k !== TOK) return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ ok: false, version: '2026-10-06a', capabilities: [], error: 'auth' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ ok: true, version: '2026-10-06a', capabilities: ['roster', 'roster.aliases', 'roster.done', 'submit', 'submit.redoOf', 'delete', 'auth', 'dellog'], roster: st.roster, done: [] }) });
    }
    const b = JSON.parse(req.postData()); st.posts.push(b);
    if (st.needTok && b.k !== TOK) return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ ok: false, error: 'auth' }) });
    if (b.action === 'delete') { const had = b.id in st.sheet; delete st.sheet[b.id]; return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ ok: true, id: b.id, deleted: had ? 5 : 0 }) }); }
    st.sheet[b.record.id] = b.record;
    const rows = st.rows != null ? st.rows : b.record.works.reduce((n, w) => n + w.items.length, 0);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ ok: true, id: b.record.id, rows }) });
  });
  await page.goto(APP + (opt.hash || ''));
  await page.waitForTimeout(500);
  await page.evaluate(() => { setEvaluator('テスト 評価者'); renderEvaluator(); });
  return { browser, page, st };
}
const recs = p => p.evaluate(() => getAll());
const pick = (p, name) => p.locator('.eetab').filter({ has: p.locator('.eetab-nm', { hasText: new RegExp('^' + name + '$') }) }).tap();
const scoreWork = (p, wid, s, n) => p.evaluate(([wid, s, n]) => { [...document.querySelectorAll(`#cards .ec[data-w="${wid}"]`)].slice(0, n || 5).forEach(c => c.querySelector(`.sb[data-s="${s}"]`).click()); }, [wid, s, n]);

(async () => {
  console.log('[A] やり直しは全作業がそろうまで保存しない（前回の残りの作業を集計から消さない）');
  {
    const { browser, page, st } = await open();
    await pick(page, 'テスト 一郎'); await page.waitForTimeout(200);
    await scoreWork(page, 'feeding-daily', 4); await scoreWork(page, 'feed-adjust', 4);
    await page.locator('#btnSave').tap(); await page.waitForTimeout(600);
    const first = (await recs(page))[0];
    await page.evaluate(id => { startEdit(id); redoFromEdit(); }, first.id); await page.waitForTimeout(300);
    ok('やり直し中（全作業を出す）', await page.evaluate(() => !!curEe.redo && selWorks.length === 2));
    await page.evaluate(() => skipWork('feed-adjust')); await page.waitForTimeout(100);
    ok('やり直し中は「今回は実施しない」で外せない', await page.evaluate(() => selWorks.length === 2));
    await page.evaluate(() => { document.getElementById('wselBox').open = true; }); await page.locator('#wselCats input[value="feed-adjust"]').click(); await page.waitForTimeout(100);
    ok('やり直し中は作業選択のチェックでも外せない（チェックも戻る）', await page.evaluate(() => selWorks.length === 2 && document.querySelector('#wselCats input[value="feed-adjust"]').checked));
    await page.evaluate(() => clearWorks()); await page.waitForTimeout(100);
    ok('やり直し中は「全て解除」もできない', await page.evaluate(() => selWorks.length === 2));
    await scoreWork(page, 'feeding-daily', 2);
    const d0 = st.dialogs.length;
    await page.locator('#btnSave').tap(); await page.waitForTimeout(500);
    ok('一部だけでは保存しない（部分保存の確認も出ない）', (await recs(page)).length === 1 && st.dialogs.length === d0);
    await scoreWork(page, 'feed-adjust', 2);
    await page.locator('#btnSave').tap(); await page.waitForTimeout(600);
    const r = await recs(page), nw = r.find(x => x.id !== first.id);
    ok('全作業そろえば保存・redoOf=前回・2作業', r.length === 2 && nw.redoOf === first.id && nw.works.length === 2);
    ok('JSエラーなし', !st.errors.length);
    await browser.close();
  }

  console.log('[B] 今のカタログに無い作業を含む記録を編集しても、その作業を消さない');
  {
    const { browser, page } = await open();
    await page.evaluate(() => putAll([normRec({ id: 'old1', date: todayLocal(), evaluator: 'テスト 評価者', evaluatee: 'テスト 一郎', farm: 'テスト農場', createdAt: new Date().toISOString(), sent: true,
      works: [{ workId: 'feeding-daily', workName: '給餌', category: 'feed', scores: { a1: 4 }, comments: {} }, { workId: 'old-work-removed', workName: '旧作業', category: 'x', scores: { z: 4 }, comments: { z: '旧コメント' } }] })]));
    await page.evaluate(() => startEdit('old1')); await page.waitForTimeout(200);
    await scoreWork(page, 'feeding-daily', 3);
    await page.locator('#btnSave').tap(); await page.waitForTimeout(600);
    const r = (await recs(page))[0];
    ok('旧作業の点数・コメントが残る', r.works.length === 2 && r.works[1].workId === 'old-work-removed' && r.works[1].comments.z === '旧コメント' && r.works[0].scores && Object.values(r.works[0].scores).every(v => v === 3));
    await browser.close();
  }

  console.log('[C] 未送信に見える記録の削除もシートへ削除を送る');
  {
    const { browser, page, st } = await open();
    await page.evaluate(() => putAll([normRec({ id: 'u1', date: todayLocal(), evaluator: 'テスト 評価者', evaluatee: 'テスト 二郎', farm: 'テスト農場', createdAt: 'x', sent: false, works: [{ workId: 'feeding-daily', scores: {}, comments: {} }] })]));
    await page.evaluate(() => doDel('u1')); await page.waitForTimeout(800);
    ok('削除要求が送られ、削除待ちが残らない', st.posts.some(b => b.action === 'delete' && b.id === 'u1') && await page.evaluate(() => getDels().length === 0) && (await recs(page)).length === 0);
    await browser.close();
  }

  console.log('[D] 容量いっぱい: 保存できないと知らせ、採点は画面に残す');
  {
    const { browser, page, st } = await open();
    await pick(page, 'テスト 二郎'); await page.waitForTimeout(200);
    await scoreWork(page, 'feeding-daily', 4);
    await page.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'jitsugi_v2_data') throw new DOMException('full', 'QuotaExceededError'); return o.call(this, k, v); }; });
    await page.locator('#btnSave').tap(); await page.waitForTimeout(400);
    ok('赤い知らせ（容量）が出る', /容量/.test(await page.locator('#toast').textContent()));
    ok('採点は画面に残る・記録は増えない', await page.locator('#cards .ec.scored').count() === 5 && (await recs(page)).length === 0);
    ok('JSエラーなし', !st.errors.length);
    await browser.close();
  }

  console.log('[E] randomUUID の無い古い端末でも保存できる');
  {
    const { browser, page, st } = await open({ init: () => { try { delete Crypto.prototype.randomUUID; } catch (e) {} } });
    ok('randomUUID が無い状態', await page.evaluate(() => typeof crypto.randomUUID !== 'function'));
    await pick(page, 'テスト 二郎'); await page.waitForTimeout(200);
    await scoreWork(page, 'feeding-daily', 4);
    await page.locator('#btnSave').tap(); await page.waitForTimeout(800);
    const r = await recs(page);
    ok('保存され・送信される', r.length === 1 && r[0].id.length > 10 && r[0].sent === true);
    ok('JSエラーなし', !st.errors.length);
    await browser.close();
  }

  console.log('[F] 同名の片方を改名しても、採点中の人を別の農場の同名へ付け替えない');
  {
    const roster = [{ name: 'テスト 一郎', farm: 'テスト農場', works: ['給餌'] }, { name: 'テスト 一郎', farm: '第二農場', works: ['給餌'] }];
    const { browser, page, st } = await open({ roster });
    await page.evaluate(() => selectFarm('テスト農場')); await page.waitForTimeout(100);
    await pick(page, 'テスト 一郎'); await page.waitForTimeout(200);
    await scoreWork(page, 'feeding-daily', 4);
    st.roster = [{ name: 'テスト 一郎(A)', farm: 'テスト農場', works: ['給餌'] }, { name: 'テスト 一郎', farm: '第二農場', works: ['給餌'] }];
    await page.evaluate(() => reloadRoster()); await page.waitForTimeout(500);
    ok('採点中の人は改名後の人（テスト 一郎(A)）のまま', await page.evaluate(() => { const p = selEntry(getRoster().list); return !!p && p.name === 'テスト 一郎(A)'; }));
    await page.locator('#btnSave').tap(); await page.waitForTimeout(600);
    const r = await recs(page);
    ok('保存した記録の農場は選んだ時の農場（テスト農場）', r.length === 1 && r[0].farm === 'テスト農場');
    ok('第二農場の一郎は未実施のまま・改名後の(A)は実施済', await page.evaluate(() => { const ro = getRoster().list, p2 = ro.find(x => x.farm === '第二農場'), pa = ro.find(x => x.farm === 'テスト農場'); return !eeProgress(p2, examRecs(), ro).complete && eeProgress(pa, examRecs(), ro).complete; }));
    await browser.close();
  }

  console.log('[F2] 異動（名簿の農場が変わった）・名前欄を別の人に書き換えた時');
  {
    const roster = [{ name: 'テスト A', farm: '東農場', works: ['給餌'] }, { name: 'テスト C', farm: '東農場', works: ['給餌'] }, { name: 'テスト B', farm: '西農場', works: ['給餌'] }];
    const { browser, page } = await open({ roster });
    ok('異動: 東農場の記録の A は、西農場へ移った A のまま', await page.evaluate(() => { const ro = [{ name: 'テスト A', farm: '西農場', works: [] }, { name: 'テスト B', farm: '東農場', works: [] }]; return rosterEntry('テスト A', '東農場', ro) === ro[0]; }));
    await page.evaluate(() => selectFarm('東農場'));
    await pick(page, 'テスト A'); await page.waitForTimeout(200);
    await page.evaluate(() => { const f = document.getElementById('fEe'); f.value = 'テスト B'; f.dispatchEvent(new Event('input')); });   // 名前欄の書き換え（隠れている時もプログラム・復元で起こり得る）
    await scoreWork(page, 'feeding-daily', 4);
    await page.locator('#btnSave').tap(); await page.waitForTimeout(600);
    const r = await recs(page);
    ok('名前を B に書き換えて保存 → B の農場（西農場）', r.length === 1 && r[0].evaluatee === 'テスト B' && r[0].farm === '西農場');
    await browser.close();
  }

  console.log('[G] 今日以外の自分の記録は黙って開かない');
  {
    const { browser, page, st } = await open();
    await page.evaluate(() => putAll([normRec({ id: 'prev1', date: '2026-09-01', evaluator: 'テスト 評価者', evaluatee: 'テスト 二郎', farm: 'テスト農場', createdAt: 'x', sent: true, works: [{ workId: 'feeding-daily', scores: { a: 2 }, comments: {} }] })]));
    await page.evaluate(() => renderRoster());
    st.accept = true; const d0 = st.dialogs.length;
    await pick(page, 'テスト 二郎'); await page.waitForTimeout(300);
    ok('確認が出る（9/1）・OK＝新しく採点（やり直し）', st.dialogs.length === d0 + 1 && /9\/1/.test(st.dialogs[d0]) && await page.evaluate(() => !editId && !!curEe.redo && curEe.redoOf === 'prev1'));
    await page.evaluate(() => clearForm()); st.accept = false;
    await pick(page, 'テスト 二郎'); await page.waitForTimeout(300);
    ok('キャンセル＝その記録を開いて修正', await page.evaluate(() => editId === 'prev1'));
    await browser.close();
  }

  console.log('[H] 合言葉: リンクの #k= で記憶・無い時は理由を出す');
  {
    const a = await open({ needTok: true });
    await a.page.evaluate(() => reloadRoster()); await a.page.waitForTimeout(400);
    ok('合言葉なし → 名簿は取れず「合言葉」と出る', /合言葉/.test(await a.page.locator('#toast').textContent()) && await a.page.evaluate(() => getRoster().list.length === 0));
    await a.browser.close();
    const b = await open({ needTok: true, hash: '#k=' + TOK });
    ok('#k= を記憶し、アドレスから消す', await b.page.evaluate(t => getTok() === t && !location.hash, TOK));
    ok('名簿が取れる', await b.page.evaluate(() => getRoster().list.length === 2));
    await pick(b.page, 'テスト 二郎'); await b.page.waitForTimeout(200);
    await scoreWork(b.page, 'feeding-daily', 5);
    await b.page.locator('#btnSave').tap(); await b.page.waitForTimeout(800);
    ok('送信に合言葉が付き、送信済みになる', b.st.posts.some(p => p.action === 'submit' && p.k === TOK) && (await recs(b.page))[0].sent === true);
    await b.page.evaluate(() => { location.hash = '#k=new%2Dpass'; }); await b.page.waitForTimeout(300);
    ok('開いたままリンクを開き直しても新しい合言葉を記憶し、アドレスから消す', await b.page.evaluate(() => getTok() === 'new-pass' && !location.hash));
    await b.page.evaluate(() => { location.hash = '#k=%E0%A4%A'; }); await b.page.waitForTimeout(300);
    ok('壊れたエンコードでもアドレスに残さない', await b.page.evaluate(() => !location.hash));
    await b.browser.close();
  }

  console.log('[I] シート側の失敗は「電波」と言わない・0行は送信済みにしない');
  {
    const { browser, page, st } = await open();
    await pick(page, 'テスト 二郎'); await page.waitForTimeout(200);
    await scoreWork(page, 'feeding-daily', 4);
    st.rows = 0;
    await page.locator('#btnSave').tap(); await page.waitForTimeout(800);
    ok('0行の応答は未送信のまま', (await recs(page))[0].sent === false);
    st.rows = null; st.html = true;
    await page.evaluate(() => syncPending()); await page.waitForTimeout(800);
    const tx = await page.locator('#toast').textContent();
    ok('ログイン画面（HTML）の応答は「シート側の問題」', /シート側/.test(tx) && !/電波の良い所/.test(tx));
    st.html = false;
    await page.evaluate(() => syncPending()); await page.waitForTimeout(800);
    ok('直れば送信済み', (await recs(page))[0].sent === true);
    await browser.close();
  }

  console.log('[J] バックアップから復元した記録は送り直す');
  {
    const { browser, page, st } = await open();
    const n0 = st.posts.length;
    await page.evaluate(() => { const blob = { _type: 'jitsugi_v2_backup', version: 1, data: { evaluations: [{ id: 'bk1', date: todayLocal(), evaluator: 'テスト 評価者', evaluatee: 'テスト 二郎', farm: 'テスト農場', createdAt: 'x', sent: true, works: [{ workId: 'feeding-daily', scores: { a: 3 }, comments: {} }] }] }, dels: [{ id: 'gone1', evaluator: 'テスト 評価者', at: 'x' }] };
      const f = new File([JSON.stringify(blob)], 'b.json', { type: 'application/json' }); const dt = new DataTransfer(); dt.items.add(f); const i = document.getElementById('impAllFile'); i.files = dt.files; importAll(i); });
    await page.waitForTimeout(1200);
    ok('復元した記録をシートへ送る', st.posts.slice(n0).some(p => p.action === 'submit' && p.record.id === 'bk1'));
    ok('バックアップの削除待ちも引き継いで送る', st.posts.slice(n0).some(p => p.action === 'delete' && p.id === 'gone1'));
    await browser.close();
  }

  console.log(`\n合計: OK ${pass} / NG ${fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
