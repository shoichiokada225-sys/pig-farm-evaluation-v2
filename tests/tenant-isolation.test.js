/* マルチテナント分離テスト（第2弾 2026-10-07）。実行: PW_PATH=~/anpi-kakunin/node_modules/playwright PW_CHANNEL=chrome node tests/tenant-isolation.test.js
   [1] 農場別ビルド: A の配布物に B の送信先・パスワードのハッシュが無い／逆も／どちらにもヒラノの送信先・パスワード・固有名が無い
   [2] ヒラノの値は他農場に使えない（送信先・パスワード）／パスワードの無いビルドは明示しない限り作らない
   [3] 実ブラウザ: 既定=ヒラノの送信先と設定パスワード OOIRI のまま／A は A の送信先だけへ通信し A のパスワードだけで設定が開く／B も同様
   本物の GAS には送らない（script.google.com への通信は全部ブロックして宛先だけ記録する） */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(process.env.PW_PATH || path.join(os.homedir(), 'farm-shift-app/node_modules/playwright'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  OK ' + n); } else { fail++; console.log('  NG ' + n); } };
const HIRANO = ['AKfycbxFqIag1AwnT6WTaWlAf8Gb2Mh', 'a3b0ea552515e139ee6af5b6a9a09419', 'OOIRI', '睦沢', 'ヒラノ', 'Mutsuzawa'];
const sha = s => require('crypto').createHash('sha256').update(s.toUpperCase()).digest('hex');

(async () => {
  const { build } = await import(pathToFileURL(path.join(ROOT, 'tools', 'build-tenant.mjs')).href);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jitsugi-tenant-'));
  process.env.TENANT_CFG_PASSWORD = 'pw-farm-AAA';
  const A = build('demo-farm', path.join(tmp, 'A')).out;
  process.env.TENANT_CFG_PASSWORD = 'pw-farm-BBB';
  const B = build('demo-farm-b', path.join(tmp, 'B')).out;
  const readAll = d => { let s = ''; (function w(x) { for (const n of fs.readdirSync(x)) { const p = path.join(x, n); if (fs.statSync(p).isDirectory()) w(p); else if (/\.(js|html|json)$/.test(n)) s += fs.readFileSync(p, 'utf8'); } })(d); return s; };
  const sa = readAll(A), sb = readAll(B);

  console.log('[1] 配布物の分離');
  ok('A に A の送信先とパスワードのハッシュ', sa.includes('DEMOFARMdemofarm') && sa.includes(sha('pw-farm-AAA')));
  ok('A に B の送信先・ハッシュが無い', !sa.includes('DEMOBdemoB') && !sa.includes(sha('pw-farm-BBB')));
  ok('B に B の送信先とハッシュ', sb.includes('DEMOBdemoB') && sb.includes(sha('pw-farm-BBB')));
  ok('B に A の送信先・ハッシュが無い', !sb.includes('DEMOFARMdemofarm') && !sb.includes(sha('pw-farm-AAA')));
  ok('パスワードの平文は配布物に無い', !sa.includes('pw-farm-AAA') && !sb.includes('pw-farm-BBB'));
  const bad = HIRANO.filter(k => sa.includes(k) || sb.includes(k));
  ok('A/B にヒラノの値・固有名が無い ' + bad.join(','), !bad.length);
  ok('版名が農場別（CACHE と APP_VER が同じ値）', (() => { const c = /const CACHE = '([^']+)'/.exec(fs.readFileSync(path.join(A, 'sw.js'), 'utf8'))[1], v = /const APP_VER='([^']+)'/.exec(fs.readFileSync(path.join(A, 'js/config.js'), 'utf8'))[1]; return c === v && /-demo-farm$/.test(c); })());
  ok('配布物に gas/tests/tools/tenants/*.md が入らない', ['gas', 'tests', 'tools', 'tenants', 'README.md'].every(n => !fs.existsSync(path.join(A, n))));

  console.log('[2] 作らない条件');
  const tdir = path.join(ROOT, 'tenants'), tf = path.join(tdir, 'zz-bad.json');
  const exitOf = (obj, pw) => {
    fs.writeFileSync(tf, JSON.stringify(Object.assign({ id: 'zz-bad', brand: { title: 'x' }, sheetUrl: 'https://script.google.com/macros/s/AKfycbZZZ/exec' }, obj)));
    if (pw === undefined) delete process.env.TENANT_CFG_PASSWORD; else process.env.TENANT_CFG_PASSWORD = pw;
    const real = process.exit, err = console.error; let code = null;
    process.exit = c => { code = c; throw new Error('exit'); }; console.error = () => {};
    try { build('zz-bad', path.join(tmp, 'X' + Math.random())); } catch (e) { /* exit */ }
    process.exit = real; console.error = err; return code;
  };
  try {
    ok('ヒラノの送信先は使えない', exitOf({ sheetUrl: 'https://script.google.com/macros/s/AKfycbxFqIag1AwnT6WTaWlAf8Gb2Mh-JZRRB07DTrE6MAQLhyRIqZuwIsuMsWX-OaoxdvzP/exec' }, 'pw-farm-ZZZ') === 2);
    ok('ヒラノのパスワード（OOIRI）は使えない', exitOf({}, 'ooiri') === 2);
    ok('パスワードが無いビルドは作らない', exitOf({}, undefined) === 2);
    ok('"cfgLock": false と明記すれば鍵なしで作れる（code=null）', exitOf({ cfgLock: false }, undefined) === null);
    ok('json に合言葉・パスワードのキーを書くと作らない', exitOf({ cfgPassword: 'x' }, 'pw-farm-ZZZ') === 2);
  } finally { fs.rmSync(tf, { force: true }); }

  console.log('[3] 実ブラウザ');
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  // 1つの端末（新しい文脈）で、パスワードを1つ入れて設定タブが開くかを見る。開く/開かないは端末ごとに独立（開いたままの状態を持ち越さない）
  const run = async (indexPath, pws) => {
    const res = { hits: [], errors: [] };
    for (const [i, pw] of pws.entries()) {
      const ctx = await browser.newContext(), page = await ctx.newPage();
      page.on('pageerror', e => res.errors.push(String(e)));
      page.on('dialog', d => d.accept(pw));
      await page.route(u => u.href.startsWith('https://script.google.com/'), r => { res.hits.push(r.request().url()); r.abort('internetdisconnected'); });
      await page.goto(pathToFileURL(indexPath).href); await page.waitForTimeout(700);
      if (i === 0) { res.sheetUrl = await page.evaluate(() => SHEET_URL); res.title = await page.title(); }
      await page.click('button[data-pg="pgCfg"]'); await page.waitForTimeout(150);
      res['open' + i] = await page.locator('#pgCfg.on').count() === 1;
      await ctx.close();
    }
    return res;
  };
  const def = await run(path.join(ROOT, 'index.html'), ['OOIRI', 'ooiri', 'wrong']);
  ok('既定: 送信先はヒラノのまま・題名も今のまま', /AKfycbxFqIag1Aw/.test(def.sheetUrl) && def.title === 'HSS 実技試験 V2');
  ok('既定: 設定パスワード OOIRI（大文字小文字を問わない）で今までどおり開く', def.open0 === true && def.open1 === true);
  ok('既定: 通信の宛先はヒラノの送信先だけ ' + def.hits.length, def.hits.length >= 1 && def.hits.every(u => u.includes('AKfycbxFqIag1Aw')));
  const ra = await run(path.join(A, 'index.html'), ['wrong-pw', 'pw-farm-AAA', 'OOIRI']);
  ok('A: 送信先は A のみ・題名は A', ra.sheetUrl.includes('DEMOFARMdemofarm') && ra.title === 'デモ農場 実技試験');
  ok('A: 通信の宛先は A の送信先だけ（B・ヒラノへは出ない） ' + ra.hits.length, ra.hits.length >= 1 && ra.hits.every(u => u.includes('DEMOFARMdemofarm')));
  ok('A: 間違ったパスワードでは設定が開かず、A のパスワードで開き、OOIRI では開かない', ra.open0 === false && ra.open1 === true && ra.open2 === false);
  const rb = await run(path.join(B, 'index.html'), ['pw-farm-AAA', 'pw-farm-BBB']);
  ok('B: 送信先は B のみ ・通信の宛先も B だけ', rb.sheetUrl.includes('DEMOBdemoB') && rb.hits.length >= 1 && rb.hits.every(u => u.includes('DEMOBdemoB')));
  ok('B: A のパスワードでは開かず B のパスワードで開く', rb.open0 === false && rb.open1 === true);
  ok('JSエラーなし ' + [def, ra, rb].map(x => x.errors.join('|')).join(''), [def, ra, rb].every(x => !x.errors.length));
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n結果: ${pass} passed / ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
