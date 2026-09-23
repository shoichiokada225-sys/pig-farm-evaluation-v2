/* HSS 実技試験 V2 — 記録用スプレッドシート連携（Google Apps Script）
   ※ このファイルは build_gas.js が Code.src.gs から自動生成（作業一覧を works-v2.js から埋め込む）。直接編集しない

   - GET  ?action=roster  → 「受験者」タブの 農場・被評価者・その人に用意した作業 を返す
     （「受験者」タブが無い時は ok:false, error:'no roster sheet'。空のタブは roster:[]）
     （被評価者名が「（農場共通）」の行＝その農場で作業を個別に決めていない人に使う作業）
   - GET  ?action=ping    → 稼働確認（CODE_VERSION を返す）
   - POST {action:'submit', record}  → 評価者名のタブに 1種目=1行 で書き込む（記録IDで上書き＝再送・編集しても重複しない）
   - POST {action:'delete', id}      → その記録IDの行を全ての評価者タブから消す（アプリで削除した記録。無ければ deleted:0 で ok＝再送しても安全）
   - setup() を一度エディタで実行 → 「受験者」「作業一覧」タブと作業のプルダウンを作る */

const CODE_VERSION = '2026-09-24a';
const ROSTER_SHEET = '受験者';
const WORKS_SHEET = '作業一覧';
const ROSTER_MAX_WORKS = 8;
const HEAD = ['記録ID', '評価日', '評価者', '被評価者', '農場', 'カテゴリ', '作業', '種目', 'スコア', 'コメント',
  '作業平均', 'セッション平均', '全体所感', '送信日時'];
const WORKS = [["No.11","給餌","飼養管理"],["No.02","エサ調整","飼養管理"],["No.16","エサ回収","飼養管理"],["No.43","えつけ（哺乳期給餌）","飼養管理"],["No.27","育成受け","飼養管理"],["No.34","去勢","飼養管理"],["No.18","添加剤準備","飼養管理"],["No.12","除フン","衛生管理"],["No.31","5S清掃","衛生管理"],["No.04","治療","衛生管理"],["No.06","母豚ワクチン接種","衛生管理"],["No.41","CSF（豚熱）子ワクチン接種","衛生管理"],["No.40","洗浄（離乳後）","衛生管理"],["No.15","消毒","衛生管理"],["No.44","石灰散布","衛生管理"],["No.37","死獣回収","衛生管理"],["No.14","AI（人工授精）注入作業","繁殖管理"],["No.33","許容確認","繁殖管理"],["No.03","精液検査・反転","繁殖管理"],["No.17","精液攪拌","繁殖管理"],["No.09","妊娠鑑定","繁殖管理"],["No.08","PMS投与","繁殖管理"],["No.36","PG（プロスタグランジン）接種","繁殖管理"],["No.42","子宮内洗浄","繁殖管理"],["No.26","入室（分娩舎）","分娩管理"],["No.35","分娩介助","分娩管理"],["No.39","送り里子","分娩管理"],["No.13","母豚の並びの整理","施設管理"],["No.10","移動指示","施設管理"],["No.25","妊娠舎→交配舎・育成舎 移動","施設管理"],["No.19","スクレーパー動作確認","施設管理"],["No.29","ファン清掃","施設管理"],["No.30","パドタンク清掃（夏季）","施設管理"],["No.20","エサスイッチ","施設管理"],["No.05","日報記入","記録管理"],["No.07","プレート作成","記録管理"],["No.21","タグ付け","記録管理"],["No.32","分娩予定記入","記録管理"],["No.22","廃豚出荷（母豚出し）","出荷管理"],["No.23","育成舎へ廃豚移動","出荷管理"]];   // [No, 作業名, カテゴリ]

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
  if (action === 'roster') {
    // 受験者タブが無い（名前の変更・取り違え）のと、タブはあるが空なのを区別する（アプリは前回の名簿を残す）
    const roster = readRoster_();
    if (!roster) return json_({ ok: false, version: CODE_VERSION, error: 'no roster sheet' });
    return json_({ ok: true, version: CODE_VERSION, roster: roster });
  }
  return json_({ ok: true, version: CODE_VERSION });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  const isSubmit = body && body.action === 'submit' && body.record;
  const isDelete = body && body.action === 'delete' && body.id;
  if (!isSubmit && !isDelete) return json_({ ok: false, error: 'bad request' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'busy' });
  try {
    if (isDelete) {
      const id = cleanId_(body.id);
      if (!id) return json_({ ok: false, error: 'no id' });
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

function cleanId_(v) { return String(v || '').replace(/[^a-zA-Z0-9_\-]/g, '_'); }
/* 記録IDの行を、評価者タブ（A1=記録ID のタブ）すべてから消す。評価者名が変わった記録も取りこぼさない */
function deleteRecord_(id) {
  let n = 0;
  SpreadsheetApp.getActive().getSheets().forEach(sh => {
    const nm = sh.getName();
    if (nm === ROSTER_SHEET || nm === WORKS_SHEET || sh.getLastRow() < 2) return;
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
