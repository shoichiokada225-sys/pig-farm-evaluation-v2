#!/usr/bin/env node
/* 農場別ビルド（マルチテナント・キット方式）。
   使い方: node tools/build-tenant.mjs <テナントID> [--out <出力先>]   例: node tools/build-tenant.mjs demo-farm
   ・tenants/<id>.json（農場名・記録用 GAS の URL・権利表記）から dist/<id>/ に「配る一式」を作る（コマンド1本）
   ・設定タブのパスワードは環境変数 TENANT_CFG_PASSWORD か、git に入れない tenants/<id>.secret.json の {"cfgPassword":"…"} から読み、
     SHA-256 にして埋め込む（平文は出力に残らない）。鍵なしにするなら tenants/<id>.json に "cfgLock": false と明記する
   ・端末への合言葉（GAS の APP_TOKEN）は埋め込まない。配布リンク …/#k=合言葉 で一人ずつ渡す（docs/MULTI-TENANT.md）
   ・元の tenant-config.js（ヒラノ版の既定）は変えない。出力にヒラノの送信先・パスワード・固有名が1つも残らないことを検査し、残れば失敗する
   ・本番には何も送らない */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 既定（ヒラノ版）の値の指紋。農場用の出力に残ってはいけない
const HIRANO = ['AKfycbxFqIag1AwnT6WTaWlAf8Gb2Mh', 'a3b0ea552515e139ee6af5b6a9a09419', 'OOIRI', 'shoichiokada225-sys', '1kD1IRPzghY_JIwsaw787'];
const HIRANO_WORDS = /睦沢|ヒラノ|Mutsuzawa|大田原|多古/;
const EXCLUDE = [/^tools\//, /^tests\//, /^tenants\//, /^gas\//, /^dist\//, /^_shots\//, /^data-work\//, /^smoke.*\.js$/, /^build_data\.py$/, /\.md$/, /^\./];
// 他農場に出さない固有表現（設定タブの出典文）
const SCRUB = [
  ['睦沢農場「業務の目的と注意点」と現場マニュアル', '作業手順資料と現場マニュアル'], ['睦沢農場「業務の目的と注意点」・現場マニュアル', '作業手順資料・現場マニュアル'],
  ['the Mutsuzawa farm work guide', 'the farm work guide'], ['Mutsuzawa farm work guide', 'farm work guide'],
  ['trại Mutsuzawa', 'trại'], ['peternakan Mutsuzawa', 'peternakan'], ['睦沢農場', '農場'],
];

function die(m) { console.error('NG: ' + m); process.exit(2); }

export function loadTenant(id) {
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(id || '')) die('テナントIDは英小文字・数字・ハイフン（2〜31字）');
  const f = path.join(ROOT, 'tenants', id + '.json');
  if (!fs.existsSync(f)) die(f + ' がありません（tenants/demo-farm.json をコピーして作る）');
  const t = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (t.id !== id) die('tenants/' + id + '.json の "id" がファイル名と違います');
  if (!t.brand || !String(t.brand.title || '').trim()) die('brand.title が必要です');
  if (/[<>"\n\r]/.test(t.brand.title)) die('brand.title に < > " 改行は使えません');
  if (t.sheetUrl && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(t.sheetUrl)) die('sheetUrl は https://script.google.com/macros/s/…/exec の形');
  if (HIRANO.some(k => String(t.sheetUrl || '').includes(k))) die('sheetUrl にヒラノの記録先が入っています');
  if (Object.keys(t).some(k => /pass|token|secret|合言葉/i.test(k))) die('パスワード・合言葉は tenants/<id>.json に書かない（環境変数か secret.json）');
  let pw = process.env.TENANT_CFG_PASSWORD || '';
  const sf = path.join(ROOT, 'tenants', id + '.secret.json');
  if (!pw && fs.existsSync(sf)) pw = String(JSON.parse(fs.readFileSync(sf, 'utf8')).cfgPassword || '');
  if (pw && pw.toUpperCase() === 'OOIRI') die('設定パスワードにヒラノの値は使えません');
  if (!pw && t.cfgLock !== false) die('設定タブのパスワードがありません（TENANT_CFG_PASSWORD か secret.json。鍵なしにするなら "cfgLock": false）');
  if (pw && pw.length < 6) die('設定パスワードは6文字以上');
  return { t, cfgPwSha256: pw ? crypto.createHash('sha256').update(pw.toUpperCase()).digest('hex') : '' };
}

export function build(id, outDir) {
  const { t, cfgPwSha256 } = loadTenant(id);
  const out = path.resolve(outDir || path.join(ROOT, 'dist', id));
  fs.rmSync(out, { recursive: true, force: true }); // dist/<id>/ だけを作り直す（元のファイルには触れない）
  fs.mkdirSync(out, { recursive: true });
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
    .filter(f => !EXCLUDE.some(r => r.test(f))).filter(f => fs.existsSync(path.join(ROOT, f)));
  const cfg = {
    id, sheetUrl: t.sheetUrl || '', cfgPwSha256,
    brand: { title: t.brand.title },
    copyright: { mode: (t.copyright && t.copyright.mode) === 'show' ? 'show' : 'hide' } // 他農場は既定で非表示
  };
  for (const f of files) {
    const dst = path.join(out, f);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    let buf = fs.readFileSync(path.join(ROOT, f));
    if (/\.(js|html|json)$/.test(f)) {
      let s = buf.toString('utf8');
      if (f === 'tenant-config.js') s = '/* 農場別ビルドが生成（tools/build-tenant.mjs）。直接編集しない */\nwindow.TENANT = ' + JSON.stringify(cfg, null, 2) + ';\n';
      for (const [a, b] of SCRUB) s = s.split(a).join(b);
      if (f === 'index.html') s = s.replace(/<title>[^<]*<\/title>/, '<title>' + t.brand.title + '</title>');
      if (f === 'manifest.json') { const m = JSON.parse(s); m.name = t.brand.title; m.short_name = t.brand.title.slice(0, 12); s = JSON.stringify(m, null, 2) + '\n'; }
      // 版名は sw.js の CACHE と js/config.js の APP_VER を同じ値で農場別にする（キャッシュの取り違え防止・smoke の照合規則と同じ）
      if (f === 'sw.js') s = s.replace(/const CACHE = '([^']+)'/, (_, v) => "const CACHE = '" + v + '-' + id + "'");
      if (f === 'js/config.js') s = s.replace(/const APP_VER='([^']+)'/, (_, v) => "const APP_VER='" + v + '-' + id + "'");
      buf = Buffer.from(s, 'utf8');
    }
    fs.writeFileSync(dst, buf);
  }
  const bad = [];
  (function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(js|html|json|css)$/.test(n)) continue;
      const s = fs.readFileSync(p, 'utf8');
      for (const k of HIRANO) if (s.includes(k)) bad.push(path.relative(out, p) + ' に "' + k.slice(0, 10) + '…"');
      if (HIRANO_WORDS.test(s)) bad.push(path.relative(out, p) + ' に固有名');
    }
  })(out);
  if (bad.length) { fs.rmSync(out, { recursive: true, force: true }); die('ヒラノ固有の値が残っています: ' + bad.join(' / ')); }
  return { out, files: files.length, locked: !!cfgPwSha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const id = a.find(x => !x.startsWith('--'));
  const oi = a.indexOf('--out');
  const r = build(id, oi >= 0 ? a[oi + 1] : null);
  console.log('OK ' + r.out + '（' + r.files + 'ファイル・設定タブの鍵' + (r.locked ? 'あり' : 'なし') + '）');
}
