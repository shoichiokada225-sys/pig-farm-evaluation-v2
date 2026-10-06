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
      return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ ok: true, version: '2026-10-06d', capabilities: ['roster', 'roster.aliases', 'roster.done', 'submit', 'submit.redoOf', 'delete', 'auth', 'dellog', 'submit.ver', 'submit.dups', 'submit.revive'], roster: st.roster, done: [] }) });
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

  console.log('[K] 細かい改善（第2弾）');
  {
    const { browser, page, st } = await open({ roster: [{ name: 'テスト 一郎', farm: 'テスト農場', works: ['給餌', 'エサ調整'] }, { name: 'テスト 二郎', farm: 'テスト農場', works: ['給餌'] }, { name: 'テスト 三郎', farm: 'テスト農場', works: ['給餌'] }] });
    ok('人を選ぶ前は進捗帯（採点済み 0/0）を出さない', await page.locator('#prog').isHidden());
    await pick(page, 'テスト 一郎'); await page.waitForTimeout(300);
    ok('採点中は進捗帯に人の名前', await page.locator('#prog').isVisible() && (await page.locator('#progWho').textContent()) === 'テスト 一郎');
    ok('コメント欄は畳まれ「＋ コメント」で開く', await page.locator('#cards textarea').first().isHidden() && await page.locator('.cm-add').first().isVisible());
    ok('基準は点数ボタンの下に開く（開いても点数ボタンが動かない）', await page.evaluate(() => { const c = document.querySelector('#cards .ec'), y0 = c.querySelector('.sr').getBoundingClientRect().top; toggleCrit(c.id.slice(2)); const y1 = c.querySelector('.sr').getBoundingClientRect().top; toggleCrit(c.id.slice(2)); return Math.abs(y1 - y0) < 1; }));
    ok('採点済みの行は読み上げで「未採点」と言わない', await page.evaluate(() => { const c = document.querySelector('#cards .ec'); c.querySelector('.sb[data-s="3"]').click(); return !c.querySelector('.sr').hasAttribute('aria-describedby'); }));
    ok('コメント欄の名前は種目ごと（aria-labelledby）', await page.evaluate(() => { const ta = document.querySelector('#cards textarea'); return /clbl-.* enm-/.test(ta.getAttribute('aria-labelledby') || ''); }));
    ok('「今回は実施しない」は作業名入りの名前', /給餌/.test(await page.locator('.wshd-skip').first().getAttribute('aria-label')));
    // 最後の作業を外す → 人を外して名簿へ・元に戻すで人ごと戻る
    await page.evaluate(() => { skipWork('feed-adjust'); }); await page.waitForTimeout(100);
    st.accept = true; await page.evaluate(() => { skipWork('feeding-daily'); }); await page.waitForTimeout(200);
    ok('最後の作業を外すと人も外れる（「作業を選べ」と出さない）', await page.evaluate(() => !curEe.name && selWorks.length === 0));
    await page.locator('.toast-act').click(); await page.waitForTimeout(200);
    ok('元に戻すで人ごと戻る', await page.evaluate(() => curEe.name === 'テスト 一郎' && selWorks.includes('feeding-daily')));
    await page.waitForTimeout(6500);
    ok('消えたトーストに押せるボタンを残さない', await page.locator('#toast .toast-act').count() === 0);
    // 編集中に別の人を押す → 確認して切り替え
    await page.evaluate(() => { document.querySelectorAll('#cards .ec').forEach(c => c.querySelector('.sb[data-s="4"]').click()); doSave(); }); await page.waitForTimeout(500);
    const id1 = (await recs(page))[0].id;
    await page.evaluate(id => startEdit(id), id1); await page.waitForTimeout(200);
    ok('編集中は「編集中: 名前」の橙の帯', /編集中/.test(await page.locator('#eeCur').textContent()) && await page.locator('#eeCur.edit').count() === 1);
    st.accept = true; await pick(page, 'テスト 二郎'); await page.waitForTimeout(300);
    ok('編集中に別の人を押すと確認して切り替える', await page.evaluate(() => !editId && curEe.name === 'テスト 二郎'));
    // 採点途中の人がいる時に編集 → 別の人へ: 確認は1回（途中の人の名前入り）
    await pick(page, 'テスト 二郎'); await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelector('#cards .ec .sb[data-s="2"]').click());
    await page.evaluate(id => startEdit(id), id1); await page.waitForTimeout(200);
    st.accept = true; const dq = st.dialogs.length;
    await page.evaluate(() => { const ro = getRoster().list; selectEe(ro.findIndex(p => p.name === 'テスト 二郎')); }); await page.waitForTimeout(300);
    ok('編集中→採点途中だった本人: 確認1回・その人の採点は戻る（破棄しない）', st.dialogs.length === dq + 1 && !/破棄/.test(st.dialogs[dq]) && await page.evaluate(() => !editId && curEe.name === 'テスト 二郎' && document.querySelectorAll('#cards .ec.scored').length === 1));
    await page.evaluate(id => startEdit(id), id1); await page.waitForTimeout(200);
    const dq2 = st.dialogs.length;
    await page.evaluate(() => { const ro = getRoster().list; selectEe(ro.findIndex(p => p.name === 'テスト 三郎')); }); await page.waitForTimeout(300);
    ok('編集中→別の人: 確認は1回で、採点途中だった人の名前と破棄を伝える', st.dialogs.length === dq2 + 1 && /テスト 二郎/.test(st.dialogs[dq2]) && /破棄/.test(st.dialogs[dq2]) && await page.evaluate(() => !editId && curEe.name === 'テスト 三郎'));
    await page.evaluate(() => { if (editId) cancelEdit(); clearForm(); });
    await page.evaluate(() => clearForm());
    // 編集で評価日を変える → 確認
    await page.evaluate(id => startEdit(id), id1); await page.waitForTimeout(200);
    await page.evaluate(() => { document.getElementById('fDate').value = '2026-01-02'; });
    st.accept = false; const d0 = st.dialogs.length;
    await page.locator('#btnSave').tap(); await page.waitForTimeout(300);
    ok('編集で評価日を変える時は確認（キャンセルで保存しない）', st.dialogs.length === d0 + 1 && (await recs(page)).find(r => r.id === id1).date !== '2026-01-02');
    st.accept = true; await page.evaluate(() => cancelEdit());
    // 評価日が空の保存
    await pick(page, 'テスト 二郎'); await page.waitForTimeout(200);
    await page.evaluate(() => { document.querySelectorAll('#cards .ec').forEach(c => c.querySelector('.sb[data-s="4"]').click()); document.getElementById('fDate').value = ''; });
    await page.locator('#btnSave').tap(); await page.waitForTimeout(100);
    ok('評価日が空の保存は今日・「日付が変わった」と言わない', !/日付が変わった/.test(await page.locator('#toast').textContent()) && (await recs(page)).some(r => r.evaluatee === 'テスト 二郎' && r.date === (new Date(Date.now() + 9 * 3600e3)).toISOString().slice(0, 10)));
    await pick(page, 'テスト 一郎'); await page.waitForTimeout(200);
    await page.evaluate(() => { document.querySelectorAll('#cards .ec').forEach(c => c.querySelector('.sb[data-s="4"]').click()); const f = document.getElementById('fDate'); f.value = '2099-01-01'; f.dispatchEvent(new Event('input')); f.dispatchEvent(new Event('change')); });   // 手入力（評価者が選んだ日付として覚える）
    const n9 = (await recs(page)).length;
    await page.locator('#btnSave').tap(); await page.waitForTimeout(200);
    const dbg = { n: (await recs(page)).length, n9, toast: await page.locator('#toast').textContent(), dates: (await recs(page)).map(r => r.date), ed: await page.evaluate(() => editId) };
    ok('未来の評価日（手入力）は保存しない ' + JSON.stringify(dbg), !dbg.dates.includes('2099-01-01') && /未来/.test(dbg.toast));
    await page.evaluate(() => { document.getElementById('fDate').value = todayLocal(); clearForm(); });
    ok('評価日に未来は選べない（max=今日）', await page.evaluate(() => document.getElementById('fDate').max === todayLocal()));
    ok('JSエラーなし', !st.errors.length);
    await browser.close();
  }
  {
    const { browser, page } = await open();
    await page.evaluate(() => setLang('vi'));
    ok('vi: 月日は 日/月', await page.evaluate(() => mdOf('2026-10-01') === '1/10'));
    ok('vi: 区切りは「, 」・かっこは半角', await page.evaluate(() => listSep() === ', ' && paren('x') === ' (x)'));
    ok('vi: 略語を使わない（Người đánh giá）', await page.evaluate(() => t('labelEvaluator') === 'Người đánh giá'));
    await page.evaluate(() => setLang('en'));
    ok('en: 1作業は単数（1 task）', /1 task(?!s)/.test(await page.locator('.eetab').filter({ hasText: 'テスト 二郎' }).textContent()));
    ok('短い名前は末尾のかっこだけ削る（CSF（豚熱）子ワクチン接種 は残す）', await page.evaluate(() => shortName('CSF（豚熱）子ワクチン接種') === 'CSF（豚熱）子ワクチン接種' && shortName('給餌（毎日）') === '給餌' && shortName('PG (Prostaglandin) Injection') === 'PG (Prostaglandin) Injection'));
    ok('共通行は【農場共通】も共通行', await page.evaluate(() => isCommonRow('【農場共通】') && isCommonRow('（農場共通）') && !isCommonRow('農場共通の田中')));
    ok('「第二テスト農場」と「テスト農場」は農場名のゆれにしない', await page.evaluate(() => farmVariants([{ farm: 'テスト農場' }, { farm: 'テスト農場' }, { farm: 'テスト農場' }, { farm: '第二テスト農場' }]).length === 0 && farmVariants([{ farm: '大田原' }, { farm: '大田原' }, { farm: '大田原' }, { farm: '大田原農場' }]).length === 1));
    await browser.close();
  }
  {
    const { browser, page, st } = await open({ init: () => { try { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.setItem('jitsugi_v2_data', '{"evaluations":[{"id":"a"'); } } catch (e) {} } });
    ok('壊れた記録データは控えに退避して知らせる（黙って上書きしない）', await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('jitsugi_v2_data_broken_') && localStorage.getItem(k).startsWith('{"evaluations"'))) && /壊れて/.test(await page.locator('#toast').textContent()));
    ok('壊れていても JS エラーなし', !st.errors.length);
    await browser.close();
  }
  {
    const { browser, page, st } = await open();
    await page.evaluate(() => putAll([normRec({ id: 'dq1', date: todayLocal(), evaluator: 'テスト 評価者', evaluatee: 'テスト 二郎', farm: 'テスト農場', createdAt: 'x', sent: true, works: [{ workId: 'feeding-daily', scores: { a: 3 }, comments: {} }] })]));
    await page.route(u => u.href.startsWith('https://script.google.com/'), r => r.abort('internetdisconnected'));   // 圏外
    await page.evaluate(() => doDel('dq1')); await page.waitForTimeout(300);
    ok('削除待ちに元の送信先を控える', await page.evaluate(() => getDels()[0].url === sheetUrl()));
    await browser.close();
  }

  console.log('[L] 第3回監査（データ）');
  {
    // 本文が止まる応答 → 期限で打ち切り、送信・名簿取得が「中」のまま固まらない
    const { browser, page, st } = await open();
    await page.evaluate(() => { window.__stall = true; const of = window.fetch; window.fetch = (u, o) => window.__stall ? Promise.resolve(new Response(new ReadableStream({ start() {} }), { status: 200 })) : of(u, o); SEND_TIMEOUT_MS_ORIG = 0; });
    await page.evaluate(() => { reloadRoster(true, true); }); 
    await pick(page, 'テスト 二郎'); await page.waitForTimeout(200);
    await scoreWork(page, 'feeding-daily', 4);
    await page.locator('#btnSave').tap();
    await page.waitForTimeout(22000);
    ok('本文が止まっても 20 秒で打ち切り、送信中のまま固まらない', await page.evaluate(() => !syncing && !rosterLoading));
    await page.evaluate(() => { window.__stall = false; syncPending(); }); await page.waitForTimeout(1500);
    ok('通信が戻れば送れる', (await recs(page))[0].sent === true);
    await browser.close();
  }
  {
    const { browser, page, st } = await open();
    // GAS が stale / dups を返す
    await page.route(u => u.href.startsWith('https://script.google.com/'), async route => {
      const req = route.request(); const H = { 'access-control-allow-origin': '*' };
      if (req.method() === 'GET') return route.fallback();
      const b = JSON.parse(req.postData()); st.posts.push(b);
      const rec = b.record;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(rec.evaluatee === 'テスト 二郎' ? { ok: true, id: rec.id, rows: 0, stale: true } : { ok: true, id: rec.id, rows: 5, dups: ['給餌'] }) });
    });
    await pick(page, 'テスト 二郎'); await page.waitForTimeout(200); await scoreWork(page, 'feeding-daily', 4);
    await page.locator('#btnSave').tap(); await page.waitForTimeout(800);
    ok('シートの方が新しい（stale）: 上書きせず送り済み扱い・知らせる', (await recs(page))[0].sent === true && /新しい内容/.test(await page.locator('#toast').textContent()));
    ok('送る記録に版（ver）が付く', st.posts.some(p => p.record && p.record.ver));
    await pick(page, 'テスト 一郎'); await page.waitForTimeout(200); await scoreWork(page, 'feeding-daily', 4); await scoreWork(page, 'feed-adjust', 4);
    await page.locator('#btnSave').tap(); await page.waitForTimeout(800);
    ok('二重採点（dups）: 送信は成功・赤い知らせで作業名を出す', /二重採点/.test(await page.locator('#toast').textContent()) && /給餌/.test(await page.locator('#toast').textContent()));
    await browser.close();
  }
  {
    const { browser, page, st } = await open({ init: () => { try { if (!sessionStorage.getItem('y')) { sessionStorage.setItem('y', 1); localStorage.setItem('jitsugi_v2_data', '{"evaluations":[null,{"id":"w1","date":"2026-10-01","evaluatee":"x","works":"x"}]}'); } } catch (e) {} } });
    ok('null の記録・作業が配列でない記録でも起動する', !st.errors.length && await page.evaluate(() => getAll().length === 1 && Array.isArray(getAll()[0].works)));
    await browser.close();
  }
  {
    const { browser, page } = await open();
    ok('全角空白の名前も名簿の同じ人（nmKey）', await page.evaluate(() => nmKey('テスト　一郎') === nmKey('テスト 一郎') && nmKey('テスト  一郎') === 'テスト 一郎'));
    ok('カタログに無い作業も種目のキーで行を作る（0行で送らない）', await page.evaluate(() => toPayload({ id: 'z', works: [{ workId: 'old-x', workName: '旧作業', scores: { a: 4, b: 3 }, comments: { a: 'c' } }] }).works[0].items.length === 2));
    await browser.close();
  }

  console.log('[M] 第3回監査（画面）');
  {
    const { browser, page, st } = await open();
    await page.evaluate(() => putAll([normRec({ id: 'uuid-like-0123456789', date: todayLocal(), evaluator: 'テスト 評価者', evaluatee: 'テスト 二郎', farm: 'テスト農場', createdAt: 'x', sent: true, works: [{ workId: 'feeding-daily', scores: { a: 3 }, comments: {} }] })]));
    st.accept = false; const d0 = st.dialogs.length;
    await page.evaluate(() => doDel('uuid-like-0123456789')); await page.waitForTimeout(100);
    ok('削除の確認に記録ID（UUID）を出さず、人と日付を出す', st.dialogs.length === d0 + 1 && !/uuid-like/.test(st.dialogs[d0]) && /テスト 二郎/.test(st.dialogs[d0]));
    st.accept = true;
    await page.evaluate(() => setLang('vi'));
    ok('読み上げの名前（aria-label）も言語に追従', await page.evaluate(() => document.getElementById('eeFarms').getAttribute('aria-label') === 'Trại' && document.querySelector('nav.tabs').getAttribute('aria-label') === 'Menu'));
    await page.evaluate(() => setLang('en'));
    ok('en 単数: 1 task left', await page.evaluate(() => tN('leftWorks', 1) === '1 task left' && tN('leftWorks', 2) === '2 tasks left' && tN('tSavedPart', 1) === 'Saved (1 task left)'));
    ok('名簿が空の案内のシート名に訳を添える', await page.evaluate(() => /Examinees/.test(t('eeNoRoster'))));
    await page.evaluate(() => setLang('ja'));
    await pick(page, 'テスト 一郎'); await page.waitForTimeout(200);
    await page.locator('#btnSave').tap(); await page.waitForTimeout(150);
    ok('未採点の知らせは「… (n)」と括弧の前に空白', / \(\d+\)$/.test(await page.locator('#toast').textContent()));
    ok('農場チップは名前と残り人数を分けて持つ（長い名前でも残りが見える）', await page.locator('.fchip .fchip-nm').count() > 0);
    await page.locator('.wshd-nm').first().click(); await page.waitForTimeout(100);
    ok('作業見出しの名前を押すと全文を出す', (await page.locator('#toast').textContent()).length >= (await page.locator('.wshd-nm').first().textContent()).length);
    await browser.close();
  }

  console.log('[N] 第4回監査（データ）');
  {
    const { browser, page, st } = await open({ roster: [{ name: 'テスト 一郎', farm: 'テスト農場', works: ['給餌'] }, { name: 'テスト 二郎', farm: 'テスト農場', works: ['給餌'] }] });
    await pick(page, 'テスト 一郎'); await page.waitForTimeout(200);
    await page.evaluate(() => { toggleWork('feed-adjust', true); }); await page.waitForTimeout(100);
    await scoreWork(page, 'feeding-daily', 4); await scoreWork(page, 'feed-adjust', 4);
    await page.locator('#btnSave').tap(); await page.waitForTimeout(500);
    const r1 = (await recs(page))[0];
    await page.evaluate(id => { startEdit(id); redoFromEdit(); }, r1.id); await page.waitForTimeout(300);
    ok('やり直しは前回の記録にある作業（作業選択で足した作業）も対象', await page.evaluate(() => selWorks.includes('feeding-daily') && selWorks.includes('feed-adjust')));
    await page.evaluate(() => clearForm());
    // 時計が戻っても編集の版は前より新しい
    const before = r1.updatedAt || r1.createdAt;
    await page.evaluate(() => { const real = Date.now; Date.now = () => real() - 3600e3; });
    await page.evaluate(id => startEdit(id), r1.id); await page.waitForTimeout(200);
    await scoreWork(page, 'feeding-daily', 1);
    await page.locator('#btnSave').tap(); await page.waitForTimeout(500);
    const r2 = (await recs(page)).find(r => r.id === r1.id);
    ok('端末の時計が戻っても、編集の版（更新時刻）は前の版より新しい', r2.updatedAt > before);
    // 容量いっぱいの削除は消さずに知らせる
    await page.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'jitsugi_v2_deletes') throw new DOMException('full', 'QuotaExceededError'); return o.call(this, k, v); }; });
    await page.evaluate(id => doDel(id), r1.id); await page.waitForTimeout(200);
    ok('容量いっぱいで削除待ちを書けない時は、消さずに知らせる', (await recs(page)).some(r => r.id === r1.id) && /容量/.test(await page.locator('#toast').textContent()));
    await browser.close();
  }
  {
    const { browser, page, st } = await open({ init: () => { try { if (!sessionStorage.getItem('z')) { sessionStorage.setItem('z', 1); localStorage.setItem('jitsugi_v2_data', '{"evaluations":[{"id":"x1","date":"2026-10-06","evaluatee":"テスト 一郎","farm":"テスト農場","works":[null,{"workId":"feeding-daily","scores":{"a":3}}]}]}'); } } catch (e) {} } });
    await page.locator('.tabs button[data-pg="pgHi"]').tap(); await page.waitForTimeout(200);
    ok('作業の中に null がある記録でも起動・履歴が出る', !st.errors.length && await page.locator('#hList .hi').count() === 1);
    await browser.close();
  }

  console.log('[O] 第5回監査（データ）');
  {
    const { browser, page, st } = await open({ roster: [{ name: 'テスト\n一郎', farm: 'テスト農場', works: ['給餌'] }, { name: 'テスト 二郎', farm: 'テスト農場', works: ['給餌'] }] });
    await pick(page, 'テスト 一郎'); await page.waitForTimeout(200);
    await scoreWork(page, 'feeding-daily', 4);
    await page.locator('#btnSave').tap(); await page.waitForTimeout(500);
    const r = (await recs(page))[0];
    ok('名簿の名前にセル内改行があっても名簿の人として保存（シートと同じ表記・農場あり・名簿外にしない・済に数える）', r.evaluatee === 'テスト\n一郎' && r.farm === 'テスト農場' && !r.manual && await page.evaluate(() => { const ro = getRoster().list; return eeProgress(ro[0], examRecs(), ro).complete; }));
    // バックアップから戻した記録は revive を付けて送り、送れたら外す
    await page.evaluate(() => { const blob = { _type: 'jitsugi_v2_backup', version: 1, data: { evaluations: [{ id: 'rv1', date: todayLocal(), evaluator: 'テスト 評価者', evaluatee: 'テスト 二郎', farm: 'テスト農場', createdAt: 'x', sent: true, works: [{ workId: 'feeding-daily', scores: { a: 3 }, comments: {} }] }] } };
      const f = new File([JSON.stringify(blob)], 'b.json', { type: 'application/json' }); const dt = new DataTransfer(); dt.items.add(f); const i = document.getElementById('impAllFile'); i.files = dt.files; importAll(i); });
    await page.waitForTimeout(1200);
    ok('復元した記録は revive 付きで送り、送れたら印を外す', st.posts.some(p => p.record && p.record.id === 'rv1' && p.record.revive === true) && await page.evaluate(() => { const r = getAll().find(x => x.id === 'rv1'); return r.sent && !r.revive; }));
    await browser.close();
  }
  {
    const { browser, page, st } = await open({ init: () => { try { if (!sessionStorage.getItem('w')) { sessionStorage.setItem('w', 1); localStorage.setItem('jitsugi_v2_draft', '{"works":"x","_cur":"s","_sel":5,"evaluatee":5}'); } } catch (e) {} } });
    ok('下書きが壊れていても起動を止めない（名簿が出る）', await page.locator('.eetab').count() === 2 && await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('jitsugi_v2_draft_broken_'))));
    await browser.close();
  }

  console.log('[P] 第5回監査（画面）');
  {
    const fs3 = ['ヒラノ畜産株式会社大田原第一ゾーン繁殖農場', 'ヒラノ畜産株式会社大田原第二ゾーン繁殖農場', 'ヒラノ畜産株式会社大田原第三ゾーン繁殖農場'];
    const { browser, page } = await open({ roster: fs3.map((f, i) => ({ name: 'テスト ' + i, farm: f, works: ['給餌'] })) });
    const tx = await page.locator('.fchip .fchip-nm').allTextContents();
    ok('中省略で同じになる農場どうしは違う部分を見せる（第一/第二/第三）', new Set(tx).size === 3 && tx.some(x => /第一/.test(x)) && tx.some(x => /第三/.test(x)));
    ok('農場チップの読み上げ名は全文＋残り人数', /大田原第二ゾーン繁殖農場/.test(await page.locator('.fchip').nth(1).getAttribute('aria-label')));
    await pick(page, 'テスト 0'); await page.waitForTimeout(200);
    const hb = await page.locator('.wshd').first().boundingBox();
    ok('作業見出し（押せる）は高さ44px以上', hb.height >= 44);
    await page.locator('.wshd').first().focus(); await page.keyboard.press(' '); await page.waitForTimeout(100);
    ok('見出しは Space でも全文を出す（ページはスクロールしない）', /給餌/.test(await page.locator('#toast').textContent()));
    ok('見出しの読み上げは件数（0/5）も結び付く', await page.evaluate(() => { const h = document.querySelector('.wshd'); return document.getElementById(h.getAttribute('aria-describedby')).textContent.includes('/5'); }));
    await browser.close();
  }

  console.log('[Q] 第6回監査（データ）');
  {
    const { browser, page, st } = await open();
    // シートで削除済み（gone）→ 履歴は「シートで削除済」・済に数えない
    await page.route(u => u.href.startsWith('https://script.google.com/'), async route => {
      const req = route.request(); const H = { 'access-control-allow-origin': '*' };
      if (req.method() === 'GET') return route.fallback();
      const b = JSON.parse(req.postData()); st.posts.push(b);
      return route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify({ ok: true, id: b.record.id, rows: 0, stale: 'deleted' }) });
    });
    await page.evaluate(() => putAll([normRec({ id: 'g1', date: todayLocal(), evaluator: 'テスト 評価者', evaluatee: 'テスト 二郎', farm: 'テスト農場', createdAt: 'x', updatedAt: '2026-10-06T00:00:00Z', sent: false, revive: true, rv: 'z', works: [{ workId: 'feeding-daily', scores: { a: 3 }, comments: {} }] })]));
    await page.evaluate(() => syncPending()); await page.waitForTimeout(800);
    ok('シートで削除済みの記録: 印を付け・revive を外す・済に数えない', await page.evaluate(() => { const r = getAll()[0]; const ro = getRoster().list; return r.sheetGone && !r.revive && !eeProgress(ro.find(p => p.name === 'テスト 二郎'), examRecs(), ro).complete; }));
    ok('削除の要求は戻した時刻（rv）を持つ', await page.evaluate(() => { queueDel(getAll()[0]); return getDels()[0].rv === 'z' && deleteReq(getDels()[0]).rv === 'z'; }));
    await page.locator('.tabs button[data-pg="pgHi"]').tap(); await page.waitForTimeout(200);
    ok('履歴は「送信済」でなく「シートで削除済」', /シートで削除済/.test(await page.locator('#hList').textContent()) && !/送信済/.test(await page.locator('#hList').textContent()));
    await browser.close();
  }

  console.log('[R] 第6回監査（画面）');
  for (const w of [360, 390]) {
    const fs3 = ['ヒラノ畜産株式会社多古第一農場', 'ヒラノ畜産株式会社多古第二農場', 'ヒラノ畜産株式会社多古第三農場', '所属未確定', '所属未確定（大田原）'];
    const { browser, page } = await open({ roster: fs3.map((f, i) => ({ name: 'テスト ' + i, farm: f, works: ['給餌'] })) });
    await page.setViewportSize({ width: w, height: 800 }); await page.evaluate(() => renderRoster());
    // 見えている部分（CSS の省略後）で区別できるか: 表示幅内に収まっていて、テキストがすべて違う
    const vis = await page.evaluate(() => [...document.querySelectorAll('.fchip .fchip-nm')].map(e => ({ t: e.textContent, fit: e.scrollWidth <= e.clientWidth + 1 })));
    ok(w + 'px: 似た農場名のチップは見えている文字で区別できる（省略で隠れない）', new Set(vis.map(v => v.t)).size === vis.length && vis.every(v => v.fit));
    for (const l of ['en', 'vi', 'id']) { await page.evaluate(l => setLang(l), l); ok(w + 'px ' + l + ': 未確定の農場のチップは訳語を残す（補足だけにしない）', await page.evaluate(() => [...document.querySelectorAll('.fchip')].filter(c => /未確定/.test(c.dataset.f)).every(c => !c.querySelector('.fchip-nm').textContent.startsWith('…')))); }
    await page.evaluate(() => setLang('ja'));
    ok(w + 'px: 未確定の農場が2つあっても補足で見分けられる（読み上げ名も）', await page.evaluate(() => { const ls = [...document.querySelectorAll('.fchip')].map(c => c.getAttribute('aria-label')); return new Set(ls).size === ls.length && ls.some(l => /大田原/.test(l)); }));
    await browser.close();
  }

  console.log('[S] 第7回監査（データ）');
  {
    const { browser, page, st } = await open();
    await page.evaluate(() => putAll([normRec({ id: 'gx', date: todayLocal(), evaluator: 'テスト 評価者', evaluatee: 'テスト\n二郎', farm: 'テスト農場', createdAt: '2026-10-06T00:00:00Z', sent: true, sheetGone: true, works: [{ workId: 'feeding-daily', scores: {}, comments: {} }] })]));
    await page.evaluate(() => { updSyncUI(); });
    ok('シートで削除済みがある間、同期バーは緑の「すべて送信済み」にしない', /削除済み/.test(await page.locator('#syncBar').textContent()) && await page.locator('#syncBar.ok').count() === 0);
    st.accept = false; const d0 = st.dialogs.length;
    await page.evaluate(() => startEdit('gx')); await page.waitForTimeout(100);
    ok('削除済みの記録を直す時は確認（キャンセルで開かない）', st.dialogs.length === d0 + 1 && await page.evaluate(() => !editId));
    st.accept = true;
    await page.evaluate(() => startEdit('gx')); await page.waitForTimeout(200);
    await scoreWork(page, 'feeding-daily', 4);
    await page.locator('#btnSave').tap(); await page.waitForTimeout(800);
    const r = (await recs(page))[0];
    ok('直して保存すると戻す（revive＋新しい合図で送る）・送れたら削除済みの印を外す', st.posts.some(p => p.record && p.record.id === 'gx' && p.record.revive === true && p.record.rv) && !r.sheetGone && !r.revive && r.sent);
    ok('名前を変えずに直した記録は、シートと同じ表記（改行入り）のまま', r.evaluatee === 'テスト\n二郎');
    await browser.close();
  }
  {
    const { browser, page, st } = await open();
    await page.evaluate(() => putAll([normRec({ id: 'gy', date: todayLocal(), evaluator: 'テスト 評価者', evaluatee: 'テスト 二郎', farm: 'テスト農場', createdAt: 'x', sent: true, sheetGone: true, works: [{ workId: 'feeding-daily', scores: { a: 3 }, comments: {} }] })]));
    await page.evaluate(() => { const blob = { _type: 'jitsugi_v2_backup', version: 1, data: { evaluations: [{ id: 'gy', date: todayLocal(), evaluator: 'テスト 評価者', evaluatee: 'テスト 二郎', farm: 'テスト農場', createdAt: 'x', sent: true, works: [{ workId: 'feeding-daily', scores: { a: 3 }, comments: {} }] }] } };
      const f = new File([JSON.stringify(blob)], 'b.json', { type: 'application/json' }); const dt = new DataTransfer(); dt.items.add(f); const i = document.getElementById('impAllFile'); i.files = dt.files; importAll(i); });
    await page.waitForTimeout(1200);
    ok('端末にシートで削除済みの同じ記録があっても、復元で戻す', st.posts.some(p => p.record && p.record.id === 'gy' && p.record.revive === true) && await page.evaluate(() => !getAll()[0].sheetGone));
    await browser.close();
  }

  console.log('[T] 第8回監査');
  {
    const { browser, page } = await open({ roster: [{ name: '佐藤\u3000花子', farm: 'テスト農場', works: ['給餌'] }, { name: 'テスト 二郎', farm: 'テスト農場', works: ['給餌'] }] });
    await page.evaluate(() => openManualEe());
    await page.evaluate(() => { const f = document.getElementById('fEe'); f.value = '佐藤 花子'; f.dispatchEvent(new Event('input')); toggleWork('feeding-daily', true); });
    await scoreWork(page, 'feeding-daily', 4);
    await page.locator('#btnSave').tap(); await page.waitForTimeout(500);
    const r = (await recs(page))[0];
    ok('名簿の人を手入力で選んでも、シートの表記（全角空白）で保存・名簿外にしない', r.evaluatee === '佐藤\u3000花子' && r.farm === 'テスト農場' && !r.manual);
    ok('同期バーの削除済みは1行の短い文', await page.evaluate(() => t('goneBar').length <= 14));
    ok('コメントは上限つき（2000字）', await page.evaluate(() => { selWorks = ['feeding-daily']; buildCards(); return document.querySelector('#cards textarea').maxLength === 2000; }));
    await browser.close();
  }

  console.log('[U] 第10回監査');
  {
    const { browser, page, st } = await open();
    ok('試験開始日に未来は入れない（max=今日・拒否）', await page.evaluate(() => { setExamStart('2099-01-01'); return examStart() === '' && document.getElementById('cfgExamStart').max === todayLocal(); }));
    await pick(page, 'テスト 二郎'); await page.waitForTimeout(200); await scoreWork(page, 'feeding-daily', 4);
    // 別のタブで先に同じ人・同じ作業を保存した
    await page.evaluate(() => { const a = getAll(); a.push(normRec({ id: 'other-tab', date: todayLocal(), evaluator: 'テスト 評価者', evaluatee: 'テスト 二郎', farm: 'テスト農場', createdAt: 'x', sent: false, works: [{ workId: 'feeding-daily', scores: { a: 4 }, comments: {} }] })); putAll(a); });
    st.accept = false; const d0 = st.dialogs.length;
    await page.locator('#btnSave').tap(); await page.waitForTimeout(300);
    ok('保存の直前に、別の画面で先に保存された同じ作業を見つけて確認（キャンセルで保存しない）', st.dialogs.length === d0 + 1 && /もう記録/.test(st.dialogs[d0]) && (await recs(page)).length === 1);
    st.accept = true;
    await page.evaluate(() => { doSave._at = 0; }); await page.locator('#btnSave').tap(); await page.waitForTimeout(300);
    ok('OK なら保存する', (await recs(page)).length === 2);
    await page.evaluate(() => { doSave._at = performance.now(); const n = getAll().length; doSave(); window.__n = getAll().length - n; });
    ok('連打（直前の保存の直後）は無視', await page.evaluate(() => window.__n === 0));
    ok('消し終えた記録は、消す前の名簿の要約が届いても済に数えない', await page.evaluate(() => { noteDeleted('zz9'); const r = JSON.parse(localStorage.getItem('jitsugi_v2_roster')); r.done = [{ id: 'zz9', date: todayLocal(), evaluatee: 'テスト 一郎', farm: 'テスト農場', works: [{ workId: 'feeding-daily' }, { workId: 'feed-adjust' }], sheet: true }]; localStorage.setItem('jitsugi_v2_roster', JSON.stringify(r)); const ro = getRoster().list; return !eeProgress(ro.find(p => p.name === 'テスト 一郎'), examRecs(), ro).complete; }));
    await browser.close();
  }

  console.log(`\n合計: OK ${pass} / NG ${fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
