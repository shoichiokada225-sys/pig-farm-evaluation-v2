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
import os from 'node:os';
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

// ---- 出力先の安全確認（既存フォルダを黙って消さない）----
// 消してよいのは「前回このツールが作った印ファイル（.tenant-build）がある」フォルダだけ。
// 印が無い既存の空でないフォルダ・ファイル・シンボリックリンク・/・ホーム・リポ・リポの親・一時フォルダそのもの・リポ内（dist/ 以外）は拒否する
const MARK = '.tenant-build';
function prepareOut(out, id) {
  const real = p => { try { return fs.realpathSync(p); } catch { return p; } };
  const o = path.resolve(out);
  const ro = fs.existsSync(o) ? real(o) : path.join(real(path.dirname(o)), path.basename(o));
  const home = real(os.homedir()), root = real(ROOT), tmp = real(os.tmpdir());
  const dangerous = [path.parse(ro).root, home, root, tmp];
  if (dangerous.includes(ro)) die('出力先が危険です（/・ホーム・リポ・一時フォルダそのもの）: ' + o);
  if (root.startsWith(ro + path.sep) || home.startsWith(ro + path.sep)) die('出力先がリポまたはホームの親フォルダです: ' + o);
  if (ro.startsWith(root + path.sep) && !ro.startsWith(path.join(root, 'dist') + path.sep)) die('リポ内への出力は dist/ 配下だけ: ' + o);
  if (fs.existsSync(o)) {
    if (fs.lstatSync(o).isSymbolicLink() || !fs.statSync(o).isDirectory()) die('出力先がフォルダではありません: ' + o);
    const entries = fs.readdirSync(o);
    if (entries.length) {
      const mk = path.join(o, MARK);
      if (!fs.existsSync(mk) || !fs.readFileSync(mk, 'utf8').startsWith('tenant-build:' + id)) die('出力先は空でなく、前回このツールが作った印（' + MARK + '）もありません。消さずに中止します: ' + o);
      fs.rmSync(o, { recursive: true, force: true }); // 印のある前回の出力だけを作り直す
    }
  }
  fs.mkdirSync(o, { recursive: true });
  fs.writeFileSync(path.join(o, MARK), 'tenant-build:' + id + '\n');
  return o;
}


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
  const out0 = path.resolve(outDir || path.join(ROOT, 'dist', id));
  const out = prepareOut(out0, id);              // 公開用（配る一式）
  const setup = prepareOut(out0 + '.setup', id);  // 非公開（農場の GAS に貼る Code.gs）。公開ディレクトリには置かない
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
  // 農場専用の GAS（<out>.setup/Code.gs・公開しない別フォルダ）: TENANT_MODE を true にする＝プロパティ未設定は全拒否（fail-closed）
  {
    let g = fs.readFileSync(path.join(ROOT, 'gas', 'Code.gs'), 'utf8');
    g = g.replace('const TENANT_MODE = false;', 'const TENANT_MODE = true;');
    if (!/const TENANT_MODE = true;/.test(g)) die('gas/Code.gs に TENANT_MODE の行がありません（node gas/build_gas.js を実行してから）');
    g = g.split('ヒラノ版').join('既存の本番').split('ヒラノ').join('既存');   // コメント中の名称を中立に
    fs.writeFileSync(path.join(setup, 'Code.gs'), g);
    fs.writeFileSync(path.join(setup, 'README.txt'), '非公開フォルダ。公開（ホスティング）しないこと。Code.gs を農場のスプレッドシートの Apps Script に貼り、スクリプトプロパティ APP_TOKEN（16字以上）と ADMIN_TOKEN（24字以上）を入れる（node tools/gen-tokens.mjs）。公開するのは隣の ' + path.basename(out) + '/ だけ。\n');
  }
  const bad = [];
  const walkDir = function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(js|html|json|css|gs)$/.test(n)) continue;
      const s = fs.readFileSync(p, 'utf8');
      for (const k of HIRANO) if (s.includes(k)) bad.push(path.relative(path.dirname(d), p) + ' に "' + k.slice(0, 10) + '…"');
      if (HIRANO_WORDS.test(s)) bad.push(path.relative(path.dirname(d), p) + ' に固有名');
    }
  };
  walkDir(out); walkDir(setup);
  if (bad.length) { fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(setup, { recursive: true, force: true }); die('ヒラノ固有の値が残っています: ' + bad.join(' / ')); }
  return { out, files: files.length, locked: !!cfgPwSha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const id = a.find(x => !x.startsWith('--'));
  const oi = a.indexOf('--out');
  const r = build(id, oi >= 0 ? a[oi + 1] : null);
  console.log('OK ' + r.out + '（' + r.files + 'ファイル・設定タブの鍵' + (r.locked ? 'あり' : 'なし') + '）');
}
