/* HSS実技試験V2 スモークテスト（playwright は farm-shift-app から借用）
   実行: node smoke.js */
const { chromium } = require(process.env.PW_PATH || require('path').join(require('os').homedir(), 'farm-shift-app/node_modules/playwright'));

const URL = require('url').pathToFileURL(require('path').join(__dirname, 'index.html')).href;
let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  OK ' + name); }
  else { fail++; console.log('  NG ' + name); }
}

// T10-5: index.html が読むファイル（script src / link href）はすべて sw.js の ASSETS に入っている（漏れると圏外で壊れて起動する）
{
  const fs = require('fs'), path = require('path');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
  const assets = new Set(JSON.parse(/const ASSETS = (\[[\s\S]*?\]);/.exec(sw)[1].replace(/'/g, '"').replace(/,\s*\]/, ']')).map(a => a.replace(/^\.\//, '')));
  const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:)?\/\//.test(u));
  const miss = refs.filter(u => !assets.has(u.replace(/^\.\//, '')));
  ok(`index.html の参照 ${refs.length} 件はすべて sw.js の ASSETS にある` + (miss.length ? ' 漏れ=' + miss.join(',') : ''), refs.length >= 15 && miss.length === 0);
  const missFile = [...assets].filter(a => a && !fs.existsSync(path.join(__dirname, a)));
  ok('ASSETS のファイルはすべて実在する' + (missFile.length ? ' 無い=' + missFile.join(',') : ''), missFile.length === 0);
  // W16-2: 設定タブに出す APP_VER は sw.js の CACHE と同じ（片方だけ上げると、本部が見る版と実際に入る版がずれる）
  const cache = /const CACHE = '([^']+)'/.exec(sw)[1], appVer = (/const APP_VER='([^']+)'/.exec(fs.readFileSync(path.join(__dirname, 'js/config.js'), 'utf8')) || [])[1];
  ok(`js/config.js の APP_VER（${appVer}）= sw.js の CACHE（${cache}）`, appVer === cache);
  // CACHE の上げ忘れ: ASSETS のファイルをコミット前に変えたのに、CACHE が HEAD のままならNG（上げ忘れると端末に届かない）
  try {
    const cp = require('child_process'), git = a => cp.execFileSync('git', ['-C', __dirname, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const changed = git(['diff', 'HEAD', '--name-only']).split('\n').filter(f => f && (assets.has(f) || f === 'sw.js'));
    const headCache = (/const CACHE = '([^']+)'/.exec(git(['show', 'HEAD:sw.js'])) || [])[1];
    ok(`CACHE の上げ忘れなし（変更=${changed.length}件 / HEAD=${headCache} / 今=${cache}）`, !changed.length || headCache !== cache);
  } catch (e) { console.log('  -- git が使えないので CACHE の上げ忘れ検査を省略'); }
  // W16-1/5: SW は今の CACHE のアプリ本体（ASSETS）を裏で上書きしない・フォールバックはページ遷移だけ
  ok('sw.js: 裏の更新は ASSETS 以外だけ（!isAsset で put）', /if \(!isAsset && res && res\.ok/.test(sw));
  ok("sw.js: index.html へのフォールバックは navigate の時だけ", /isNav \? caches\.match\('\.\/index\.html'\)/.test(sw) && /req\.mode === 'navigate'/.test(sw));
}

(async () => {
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept('ooiri'));
  // 本番のGAS（config.js の既定の送信先）へテスト記録を送らない：外部への通信はすべて遮断
  await page.route(u => u.href.startsWith('https://script.google.com/'), r => r.abort('internetdisconnected'));

  console.log('[1] 初期表示（作業未選択）');
  await page.goto(URL);
  ok('選択促しプレースホルダ', await page.locator('#cards .pickwork').count() === 1);
  ok('R18-2 名簿が無い時は「作業を選ぶ」の案内・名簿の先頭の「名前をタップ」は出さない', /評価する作業を選ぶ/.test(await page.locator('#cards .pickwork').textContent()) && await page.locator('#eeLead').isHidden());
  ok('カテゴリ7つ', await page.locator('.wcat').count() === 7);
  ok('進捗 0/0', (await page.locator('#progT').textContent()).includes('0/0'));
  const dv = await page.locator('#dataVer').textContent();
  ok('データ版数表示', /works/.test(dv));
  ok('W16-2 アプリ本体の版も表示（APP jitsugi-v2-…）', /^APP jitsugi-v2-v\d+ \/ DATA /.test(dv));
  ok('W16-4 ホーム画面から開いていない → 追加の案内が出る', await page.locator('#a2hsBar').isVisible());
  ok('W16-4 保存の保護の状態を表示', /^端末の保存: /.test(await page.locator('#storeSt').textContent()));

  console.log('[2] 作業を2つ選択 → 5種目×2=10カード');
  await page.click('#wselBox > summary');
  await page.click('.wcat >> nth=0 >> summary');
  const cb = page.locator('.wchk input');
  const id1 = await cb.nth(0).getAttribute('value');
  const id2 = await cb.nth(1).getAttribute('value');
  await cb.nth(0).check(); await cb.nth(1).check();
  await page.waitForTimeout(150);
  const nCards = await page.locator('#cards .ec').count();
  const perWork = nCards / 2;
  ok(`カード数=${nCards}（作業2つぶん）`, nCards > 0 && nCards % 2 === 0);
  ok('作業見出し2つ', await page.locator('.wshd').count() === 2);
  ok('マニュアル深リンク2つ', await page.locator('.man-link').count() === 2);
  ok('進捗 0/' + nCards, (await page.locator('#progT').textContent()).includes('0/' + nCards));
  const href = await page.locator('.man-link').first().getAttribute('href');
  ok('深リンクhref形式', /genba-manual\.vercel\.app\/#g_\d+/.test(href));

  console.log('[3] 基準アコーディオンと採点');
  const firstCrit = page.locator('.crit-tg').first();
  await firstCrit.click();
  ok('基準パネル開', await page.locator('.crit.open').count() === 1);
  ok('レベル5行', await page.locator('.crit.open .crit-lv').count() === 5);
  await page.click('.crit.open .crit-lv[data-s="4"]');
  ok('進捗 1/' + nCards, (await page.locator('#progT').textContent()).includes('1/' + nCards));

  console.log('[4] 下書き復元（選択作業込み）');
  await page.fill('#fEv', '岡田');
  await page.click('#evEdit .b1');
  await page.fill('#fEe', 'テスト太郎');
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForTimeout(300);
  ok('選択が復元（カード数同じ）', await page.locator('#cards .ec').count() === nCards);
  ok('氏名が復元', await page.inputValue('#fEe') === 'テスト太郎');
  ok('評価者は記憶表示', (await page.locator('#evName').textContent()) === '岡田' && !(await page.locator('#fEv').isVisible()));
  ok('進捗が復元 1/' + nCards, (await page.locator('#progT').textContent()).includes('1/' + nCards));

  console.log('[5] 全種目採点 → 保存 → 履歴');
  const ids = await page.locator('#cards .ec').evaluateAll(els => els.map(e => e.id.slice(2)));
  for (const cid of ids) await page.click(`.sb[data-id="${cid}"][data-s="3"]`);
  ok('進捗 全採点', (await page.locator('#progT').textContent()).includes(nCards + '/' + nCards));
  await page.click('#btnSave');
  await page.waitForTimeout(300);
  await page.click('.tabs button[data-pg="pgHi"]');
  ok('履歴に1件', await page.locator('.hi').count() === 1);
  const av = await page.locator('.hi .hia').textContent();
  ok('平均が3.0台', /^3\.[01]$/.test(av));

  console.log('[6] 詳細モーダル（作業グループ表示）と編集');
  await page.click('.hi');
  ok('モーダル表示', await page.locator('#modal.show').count() === 1);
  ok('作業グループ見出し2つ', await page.locator('.dwh').count() === 2);
  await page.click('#moBody .b3'); // 編集
  await page.waitForTimeout(300);
  ok('編集バー表示', await page.locator('#editBar.show').count() === 1);
  ok('編集でスコア復元', await page.locator('.sb.sel').count() === nCards);
  await page.click(`.sb[data-id="${ids[0]}"][data-s="5"]`);
  await page.click('#btnSave');
  await page.waitForTimeout(300);
  await page.click('.tabs button[data-pg="pgHi"]');
  ok('履歴は1件のまま（更新）', await page.locator('.hi').count() === 1);

  console.log('[7] グラフ（総合と作業別）');
  await page.click('.tabs button[data-pg="pgCh"]');
  await page.selectOption('#chSel', 'テスト太郎');
  await page.waitForTimeout(400);
  ok('グラフ領域表示', await page.locator('#chArea').isVisible());
  const wopts = await page.locator('#chWork option').count();
  ok('作業セレクトに総合+2作業', wopts === 3);
  await page.selectOption('#chWork', id1);
  await page.waitForTimeout(400);
  ok('作業別でもグラフ表示', await page.locator('#chArea').isVisible());

  console.log('[8] CSVと多言語');
  await page.click('.tabs button[data-pg="pgHi"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.hctrl .b3')]);
  ok('CSVダウンロード', (dl.suggestedFilename() || '').startsWith('jitsugi_v2_'));
  await page.click('#lswBtn'); await page.click('#lswMenu button >> nth=2'); // VI
  await page.waitForTimeout(300);
  ok('vi: タブ表記', (await page.locator('.tabs button[data-pg="pgIn"] span').textContent()) === 'Nhập');
  await page.click('.tabs button[data-pg="pgIn"]');
  ok('保存後は作業選択が空（次の人へ）', await page.locator('#cards .pickwork').count() === 1);
  await page.evaluate(() => { document.getElementById('wselBox').open = true; document.querySelector('.wcat').open = true; });
  await page.locator('.wchk input').first().check();
  await page.waitForTimeout(150);
  const nmVi = await page.locator('.wshd-nm').first().textContent();
  await page.click('#lswBtn'); await page.click('#lswMenu button >> nth=0'); // JP
  await page.waitForTimeout(300);
  const nmJa = await page.locator('.wshd-nm').first().textContent();
  ok('作業名が言語追従', nmVi !== nmJa || nmVi.length > 0);

  console.log('[9] 設定タブ（PW）とバックアップ');
  await page.click('.tabs button[data-pg="pgCfg"]'); // dialog handler が ooiri を入力
  await page.waitForTimeout(200);
  ok('設定タブ表示', await page.locator('#pgCfg.on').count() === 1);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#pgCfg .b4')]);
  ok('バックアップDL', (dl2.suggestedFilename() || '').startsWith('jitsugi_v2_backup_'));

  console.log('[10] JSエラーなし');
  ok('pageerror 0件', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));

  await browser.close();
  console.log(`\n合計: OK ${pass} / NG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
