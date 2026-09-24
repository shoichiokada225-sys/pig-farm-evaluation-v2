/* HSS 実技試験 V2 — 記録用スプレッドシート連携（Google Apps Script）
   ※ Code.gs は build_gas.js が Code.src.gs から自動生成（作業一覧を works-v2.js から埋め込む）。直接編集しない
   ※ アプリとの契約（操作・要求と応答の形・capabilities）の正本は js/contract.js。ここを変えたら CODE_VERSION と API_CAPABILITIES を上げる

   - GET  ?action=roster  → 「受験者」タブの 農場・被評価者・その人に用意した作業（見出し「作業1」〜「作業N」の列だけ）・旧名 を返す
     （「受験者」タブが無い時は ok:false, error:'no roster sheet'。空のタブは roster:[]）
     （被評価者名が「（農場共通）」の行＝その農場で作業を個別に決めていない人に使う作業）
   - GET  ?action=ping    → 稼働確認（version=CODE_VERSION・capabilities=API_CAPABILITIES を返す。roster の応答にも付ける）
   - POST {action:'submit', record}  → 評価者名のタブに 1種目=1行 で書き込む（記録IDで上書き＝再送・編集しても重複しない）
   - POST {action:'delete', id}      → その記録IDの行を全ての評価者タブから消す（アプリで削除した記録。無ければ deleted:0 で ok＝再送しても安全）
   - 誤り: 知らない action='unknown action'／submit に record が無い='no record'／id が無い='no id'（前の版は全部 'bad request' で区別できなかった）
   - setup() を一度エディタで実行 → 「受験者」「作業一覧」「農場一覧」タブと、作業・農場のプルダウンを作る
     何度実行しても受験者タブの行・農場一覧（管理者が直した分）は消さない。作業一覧だけ作り直す */

const CODE_VERSION = '2026-09-24c';
/* アプリはこれを見て「シート側が古い（旧名・削除が使えない）」を警告する（js/contract.js の GAS_REQUIRED_CAPS） */
const API_CAPABILITIES = ['roster', 'roster.aliases', 'submit', 'delete'];
const ROSTER_SHEET = '受験者';
const WORKS_SHEET = '作業一覧';
const FARMS_SHEET = '農場一覧';
const UNASSIGNED = '所属未確定';
const ROSTER_NOTE = '記入の約束\n' +
  '・農場: プルダウン（「農場一覧」タブ）から選ぶ。農場が決まっていない人は「所属未確定」\n' +
  '・被評価者: 1人1行。同じ農場に同じ名前の人がいる時は「Nam(A)」「Nam(B)」のように区別する\n' +
  '・（農場共通）: 被評価者の欄にこう書いた行の作業は、その農場で作業が空欄の人全員に使われる（1農場1行）\n' +
  '・作業1〜作業N: プルダウンの作業名から選ぶ（No.は入らない）\n' +
  '・名前を直した時は「旧名」列に直す前の名前を書く（済んだ記録をそのまま数える）\n' +
  '・備考の列は自由に足してよい（見出しを「作業」+数字にしない）';
const ROSTER_MAX_WORKS = 8;
const HEAD = ['記録ID', '評価日', '評価者', '被評価者', '農場', 'カテゴリ', '作業', '種目', 'スコア', 'コメント',
  '作業平均', 'セッション平均', '全体所感', '送信日時'];
const WORKS = /*__WORKS__*/[];   // [No, 作業名, カテゴリ]

function setup() {
  const ss = SpreadsheetApp.getActive();
  let ws = ss.getSheetByName(WORKS_SHEET) || ss.insertSheet(WORKS_SHEET);
  ws.clear();
  ws.getRange(1, 1, 1, 3).setValues([['No', '作業名', 'カテゴリ']]).setFontWeight('bold');
  ws.getRange(2, 1, WORKS.length, 3).setValues(WORKS);
  ws.setFrozenRows(1);
  ws.autoResizeColumns(1, 3);

  let rs = ss.getSheetByName(ROSTER_SHEET);
  if (!rs) {
    rs = ss.insertSheet(ROSTER_SHEET, 0);
    const head = ['農場', '被評価者'];
    for (let i = 1; i <= ROSTER_MAX_WORKS; i++) head.push('作業' + i);
    head.push('旧名');
    rs.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e6f2ee');
    rs.setFrozenRows(1);
    rs.setColumnWidth(1, 110);
    rs.setColumnWidth(2, 180);
  }
  // 名簿の初期データ（Seed.js＝git管理外。社員名を公開リポジトリに置かないため）。受験者タブが空のときだけ入れる
  const c0 = rosterCols_(rs);
  if (typeof ROSTER_SEED !== 'undefined' && rs.getLastRow() < 2 && ROSTER_SEED.length && c0.farm === 0 && c0.name === 1) {
    const w = rs.getLastColumn();
    rs.getRange(2, 1, ROSTER_SEED.length, w).setValues(ROSTER_SEED.map(r => { const a = r.slice(0, w); while (a.length < w) a.push(''); return a; }));
  }
  // 作業列（見出し「作業1」〜「作業N」）だけにプルダウン。「作業メモ」など備考の列にはかけない（前の版でかけた分は外す）
  const cols = rosterCols_(rs);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ws.getRange(2, 2, WORKS.length, 1), true)
    .setAllowInvalid(false).build();
  cols.works.forEach(c => rs.getRange(2, c + 1, 300, 1).setDataValidation(rule));
  cols.loose.forEach(c => rs.getRange(2, c + 1, 300, 1).setDataValidation(null));
  // 農場のプルダウン（正本=農場一覧タブ。無い・空の時だけ、名簿の初期データ→受験者タブにある農場＋所属未確定で作る）
  if (cols.farm >= 0) {
    const fs = farmsSheet_(rs, cols);
    const frule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(fs.getRange(2, 1, 200, 1), true)
      .setAllowInvalid(false).build();
    rs.getRange(2, cols.farm + 1, 300, 1).setDataValidation(frule);
  }
  rs.getRange(1, cols.name + 1).setNote(ROSTER_NOTE);
  return 'setup OK';
}
function farmsSheet_(rs, cols) {
  const ss = SpreadsheetApp.getActive();
  let fs = ss.getSheetByName(FARMS_SHEET);
  if (!fs) fs = ss.insertSheet(FARMS_SHEET);
  if (fs.getLastRow() >= 2) return fs;   // 管理者が直した一覧は上書きしない
  fs.getRange(1, 1, 1, 1).setValues([['農場']]).setFontWeight('bold').setBackground('#e6f2ee');
  fs.setFrozenRows(1);
  const names = [];
  const add = v => { const f = String(v || '').trim(); if (f && f !== UNASSIGNED && names.indexOf(f) < 0) names.push(f); };
  if (typeof ROSTER_SEED !== 'undefined' && ROSTER_SEED.length) ROSTER_SEED.forEach(r => add(r[0]));
  else if (rs.getLastRow() >= 2) rs.getRange(2, cols.farm + 1, rs.getLastRow() - 1, 1).getDisplayValues().forEach(r => add(r[0]));
  names.push(UNASSIGNED);
  fs.getRange(2, 1, names.length, 1).setValues(names.map(f => [f]));
  return fs;
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'ping';
  if (action === 'roster') {
    // 受験者タブが無い（名前の変更・取り違え）のと、タブはあるが空なのを区別する（アプリは前回の名簿を残す）
    const roster = readRoster_();
    if (!roster) return json_({ ok: false, version: CODE_VERSION, capabilities: API_CAPABILITIES, error: 'no roster sheet' });
    return json_({ ok: true, version: CODE_VERSION, capabilities: API_CAPABILITIES, roster: roster });
  }
  return json_({ ok: true, version: CODE_VERSION, capabilities: API_CAPABILITIES });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  const action = body && body.action;
  if (action !== 'submit' && action !== 'delete') return json_({ ok: false, error: 'unknown action' });
  const isDelete = action === 'delete';
  if (!isDelete && !(body.record && typeof body.record === 'object')) return json_({ ok: false, error: 'no record' });
  if (isDelete && !cleanId_(body.id)) return json_({ ok: false, error: 'no id' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'busy' });
  try {
    if (isDelete) {
      const id = cleanId_(body.id);
      return json_({ ok: true, id: String(body.id), deleted: deleteRecord_(id) });
    }
    const n = writeRecord_(body.record);
    return json_({ ok: true, id: String(body.record.id), rows: n });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/* 見出し行から列を決める。「被評価者」「農場」「作業1〜作業N」「旧名/別名」。見出しが無い旧形式は A=被評価者・B以降=作業
   作業列は見出しが「作業」+数字の列だけ（全角数字・空白も可）。「作業メモ」などは読まない（loose=プルダウンを外す列） */
function rosterCols_(rs) {
  const w = Math.max(2, rs.getLastColumn());
  const head = rs.getRange(1, 1, 1, w).getDisplayValues()[0].map(v => String(v || '').normalize('NFKC').trim());
  const name = head.indexOf('被評価者');
  if (name < 0) return { name: 0, farm: -1, alias: -1, works: head.map((_, i) => i).filter(i => i > 0), loose: [] };
  const isWork = h => /^作業\s*\d+$/.test(h);
  return {
    name: name, farm: head.indexOf('農場'),
    alias: head.findIndex(h => /^(旧名|別名)/.test(h)),
    works: head.map((h, i) => isWork(h) ? i : -1).filter(i => i >= 0),
    loose: head.map((h, i) => /^作業/.test(h) && !isWork(h) ? i : -1).filter(i => i >= 0),
  };
}
function readRoster_() {
  const rs = SpreadsheetApp.getActive().getSheetByName(ROSTER_SHEET);
  if (!rs) return null;
  if (rs.getLastRow() < 2) return [];
  const cols = rosterCols_(rs);
  const vals = rs.getRange(2, 1, rs.getLastRow() - 1, Math.max(2, rs.getLastColumn())).getDisplayValues();
  const out = [];
  vals.forEach(r => {
    const name = String(r[cols.name] || '').trim();
    if (!name) return;
    const farm = cols.farm >= 0 ? String(r[cols.farm] || '').trim() : '';
    const works = cols.works.map(i => String(r[i] || '').trim()).filter(Boolean);
    const o = { name: name, farm: farm, works: works };
    if (cols.alias >= 0) {
      const al = String(r[cols.alias] || '').split(/[、,，\/／;；\n]/).map(v => v.trim()).filter(v => v && v !== name);
      if (al.length) o.aliases = al;
    }
    out.push(o);
  });
  return out;
}

/* シート名に使えない文字を置換・予約タブ名と衝突させない */
function sheetNameFor_(evaluator) {
  let s = String(evaluator || '').replace(/[\[\]\*\?\/\\:]/g, '_').replace(/^'+|'+$/g, '').trim().slice(0, 90);
  if (!s) s = '評価者不明';
  if (s === ROSTER_SHEET || s === WORKS_SHEET || s === FARMS_SHEET) s = '評価者_' + s;
  return s;
}
/* 数式インジェクション対策（=,+,-,@ で始まる文字列は先頭に ' ） */
function safe_(v) {
  if (v == null) return '';
  const s = String(v).slice(0, 5000);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}
function avg_(arr) {
  const v = arr.filter(x => typeof x === 'number' && isFinite(x));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 100) / 100 : '';
}

function cleanId_(v) { return String(v || '').replace(/[^a-zA-Z0-9_\-]/g, '_'); }
/* 記録IDの行を、評価者タブ（A1=記録ID のタブ）すべてから消す。評価者名が変わった記録も取りこぼさない */
function deleteRecord_(id) {
  let n = 0;
  SpreadsheetApp.getActive().getSheets().forEach(sh => {
    const nm = sh.getName();
    if (nm === ROSTER_SHEET || nm === WORKS_SHEET || nm === FARMS_SHEET || sh.getLastRow() < 2) return;
    if (String(sh.getRange(1, 1).getValues()[0][0]) !== HEAD[0]) return;
    const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === id) { sh.deleteRow(i + 2); n++; }
  });
  return n;
}

function writeRecord_(rec) {
  const id = cleanId_(rec.id);
  if (!id) throw new Error('no id');
  const ss = SpreadsheetApp.getActive();
  const name = sheetNameFor_(rec.evaluator);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#e6f2ee');
    sh.setFrozenRows(1);
  }
  // 同じ記録IDの既存行を消す（編集・再送で重複させない）
  if (sh.getLastRow() > 1) {
    const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === id) sh.deleteRow(i + 2);
  }
  const works = Array.isArray(rec.works) ? rec.works.slice(0, 50) : [];
  const allScores = [];
  works.forEach(w => (w.items || []).forEach(it => allScores.push(Number(it.score))));
  const sessAvg = avg_(allScores);
  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  const rows = [];
  works.forEach(w => {
    const items = Array.isArray(w.items) ? w.items.slice(0, 20) : [];
    const wAvg = avg_(items.map(it => Number(it.score)));
    items.forEach(it => {
      const sc = Number(it.score);
      rows.push([id, safe_(rec.date), safe_(rec.evaluator), safe_(rec.evaluatee), safe_(rec.farm), safe_(w.category), safe_(w.workName),
        safe_(it.aspect), (sc >= 1 && sc <= 5) ? sc : '', safe_(it.comment), wAvg, sessAvg, safe_(rec.overall), now]);
    });
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEAD.length).setValues(rows);
  return rows.length;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
