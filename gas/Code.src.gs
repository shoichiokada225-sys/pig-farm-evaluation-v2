/* HSS 実技試験 V2 — 記録用スプレッドシート連携（Google Apps Script）
   ※ Code.gs は build_gas.js が Code.src.gs から自動生成（作業一覧を works-v2.js から埋め込む）。直接編集しない

   - GET  ?action=roster  → 「受験者」タブの 農場・被評価者・その人に用意した作業 を返す
     （被評価者名が「（農場共通）」の行＝その農場で作業を個別に決めていない人に使う作業）
   - GET  ?action=ping    → 稼働確認（CODE_VERSION を返す）
   - POST {action:'submit', record}  → 評価者名のタブに 1種目=1行 で書き込む（記録IDで上書き＝再送・編集しても重複しない）
   - setup() を一度エディタで実行 → 「受験者」「作業一覧」タブと作業のプルダウンを作る */

const CODE_VERSION = '2026-09-23b';
const ROSTER_SHEET = '受験者';
const WORKS_SHEET = '作業一覧';
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
  // 作業列だけにプルダウン（農場・被評価者の列にはかけない）
  const cols = rosterCols_(rs);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ws.getRange(2, 2, WORKS.length, 1), true)
    .setAllowInvalid(false).build();
  cols.works.forEach(c => rs.getRange(2, c + 1, 300, 1).setDataValidation(rule));
  return 'setup OK';
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'ping';
  if (action === 'roster') return json_({ ok: true, version: CODE_VERSION, roster: readRoster_() });
  return json_({ ok: true, version: CODE_VERSION });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  if (!body || body.action !== 'submit' || !body.record) return json_({ ok: false, error: 'bad request' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'busy' });
  try {
    const n = writeRecord_(body.record);
    return json_({ ok: true, id: String(body.record.id), rows: n });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/* 見出し行から列を決める。「被評価者」「農場」「作業…」。見出しが無い旧形式は A=被評価者・B以降=作業 */
function rosterCols_(rs) {
  const w = Math.max(2, rs.getLastColumn());
  const head = rs.getRange(1, 1, 1, w).getDisplayValues()[0].map(v => String(v || '').trim());
  const name = head.indexOf('被評価者');
  if (name < 0) return { name: 0, farm: -1, works: head.map((_, i) => i).filter(i => i > 0) };
  return { name: name, farm: head.indexOf('農場'), works: head.map((h, i) => /^作業/.test(h) ? i : -1).filter(i => i >= 0) };
}
function readRoster_() {
  const rs = SpreadsheetApp.getActive().getSheetByName(ROSTER_SHEET);
  if (!rs || rs.getLastRow() < 2) return [];
  const cols = rosterCols_(rs);
  const vals = rs.getRange(2, 1, rs.getLastRow() - 1, Math.max(2, rs.getLastColumn())).getDisplayValues();
  const out = [];
  vals.forEach(r => {
    const name = String(r[cols.name] || '').trim();
    if (!name) return;
    const farm = cols.farm >= 0 ? String(r[cols.farm] || '').trim() : '';
    const works = cols.works.map(i => String(r[i] || '').trim()).filter(Boolean);
    out.push({ name: name, farm: farm, works: works });
  });
  return out;
}

/* シート名に使えない文字を置換・予約タブ名と衝突させない */
function sheetNameFor_(evaluator) {
  let s = String(evaluator || '').replace(/[\[\]\*\?\/\\:]/g, '_').replace(/^'+|'+$/g, '').trim().slice(0, 90);
  if (!s) s = '評価者不明';
  if (s === ROSTER_SHEET || s === WORKS_SHEET) s = '評価者_' + s;
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

function writeRecord_(rec) {
  const id = String(rec.id || '').replace(/[^a-zA-Z0-9_\-]/g, '_');
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
