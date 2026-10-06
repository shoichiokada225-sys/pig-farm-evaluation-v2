/* HSS 実技試験 V2 — 記録用スプレッドシート連携（Google Apps Script）
   ※ このファイルは build_gas.js が Code.src.gs から自動生成（作業一覧を works-v2.js から埋め込む）。直接編集しない
   ※ アプリとの契約（操作・要求と応答の形・capabilities）の正本は js/contract.js。ここを変えたら CODE_VERSION と API_CAPABILITIES を上げる

   - GET  ?action=roster  → 「受験者」タブの 農場・被評価者・その人に用意した作業（見出し「作業1」〜「作業N」の列だけ）・旧名 を返す
     （「受験者」タブが無い時は ok:false, error:'no roster sheet'。空のタブは roster:[]）
     （被評価者名が「（農場共通）」の行＝その農場で作業を個別に決めていない人に使う作業）
     （done: 評価者タブの記録の要約 [{id, date, name, farm, works:[作業名]}]＝ほかの端末で済んだ人・作業をアプリが数える。
       点数・コメント・評価者名は返さない（名簿と同じく認証なしの GET なので、名簿より多くを出さない）。読めなかった時は done を付けない）
   - GET  ?action=ping    → 稼働確認（version=CODE_VERSION・capabilities=API_CAPABILITIES を返す。roster の応答にも付ける）
   - POST {action:'submit', record}  → 評価者名のタブに 1種目=1行 で書き込む（記録IDで上書き＝再送・編集しても重複しない）
   - POST {action:'delete', id}      → その記録IDの行を全ての評価者タブから消す（アプリで削除した記録。無ければ deleted:0 で ok＝再送しても安全）
   - 誤り: 知らない action='unknown action'／submit に record が無い='no record'／id が無い='no id'（前の版は全部 'bad request' で区別できなかった）
   - setup() を一度エディタで実行 → 「受験者」「作業一覧」「農場一覧」「集計（自動）」タブと、作業・農場のプルダウンを作る
     何度実行しても受験者タブの行・農場一覧（管理者が直した分）は消さない。作業一覧だけ作り直す
   - 合言葉（2026-10-06a〜）: git 管理外の Seed.js に APP_TOKEN（8文字以上）があれば、roster（GET の k）・submit/delete（POST の k）に必須。
     違えば {ok:false, error:'auth'}。ping は合言葉なしで版だけ返す。APP_TOKEN が無い時は従来どおり誰でも（テスト・移行用）
   - 削除ログ（2026-10-06a〜）: 削除・上書き（再送・編集）で消える行は、消す前に「削除ログ」タブへ写す（取り返せるように） */

const CODE_VERSION = '2026-10-06d';
/* アプリはこれを見て「シート側が古い（旧名・削除が使えない）」を警告する（js/contract.js の GAS_REQUIRED_CAPS） */
const API_CAPABILITIES = ['roster', 'roster.aliases', 'roster.done', 'submit', 'submit.redoOf', 'delete', 'auth', 'dellog', 'submit.ver', 'submit.dups', 'submit.revive'];
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
/* 評価者タブの見出し。HEAD_BASE（14列）で評価者タブを見分け、15列目「やり直し元」は 2026-09-24f で追加
   （前の版で作ったタブは、次に書き込む時に O1 へ見出しを足す＝行は消さない）。
   やり直し元 = やり直しで置き換えた前回の記録ID（半角空白区切り）。集計では、どこかの行の「やり直し元」に書かれた記録IDの行を除く */
const HEAD_BASE = ['記録ID', '評価日', '評価者', '被評価者', '農場', 'カテゴリ', '作業', '種目', 'スコア', 'コメント',
  '作業平均', 'セッション平均', '全体所感', '送信日時'];
const HEAD = HEAD_BASE.concat(['やり直し元']);
const SUMMARY_SHEET = '集計（自動）';
const SUMMARY_KEY = 'HSS_SUMMARY_TAB_ID';
const DELLOG_SHEET = '削除ログ';
const VER_KEY = 'v:';
const DEAD_KEY = 'd:';
const REV_KEY = 'r:';    // 文書プロパティ: 記録IDごとの、最後に書き戻した（revive）合図。これと違う合図の削除は、戻す前に出された古い削除   // 文書プロパティ: 記録IDごとの、削除で殺した戻しの合図の一覧   // 文書プロパティ: 記録IDごとの版（端末の更新時刻）
/* 合言葉の値。スクリプトプロパティ（APP_TOKEN / ADMIN_TOKEN）があればそちらが優先、無ければ Seed.js のグローバル（従来どおり）。
   農場ごとに GAS・シートを別に作り、それぞれ別の合言葉を持つ（docs/MULTI-TENANT.md）。戻り値 {v:値, prop:プロパティ由来か} */
function secret_(name) {
  try { const v = PropertiesService.getScriptProperties().getProperty(name); if (v) return { v: String(v), prop: true }; } catch (e) { /* プロパティが使えない環境（単体テスト等） */ }
  // Seed.js の const は globalThis に載らないので、名前を直接書いて typeof で見る
  if (name === 'APP_TOKEN') return { v: typeof APP_TOKEN === 'undefined' ? '' : String(APP_TOKEN), prop: false };
  if (name === 'ADMIN_TOKEN') return { v: typeof ADMIN_TOKEN === 'undefined' ? '' : String(ADMIN_TOKEN), prop: false };
  return { v: '', prop: false };
}
/* 最低長: Seed.js 由来はヒラノの従来どおり（APP 8 / ADMIN 16）。スクリプトプロパティ由来（他農場）は APP 16 / ADMIN 24 以上でなければ全拒否 */
const MIN_APP = { seed: 8, prop: 16 }, MIN_ADMIN = { seed: 16, prop: 24 };
/* 合言葉の間違いは数えるだけ（2026-10-07）。GAS は接続元 IP を見られないため「間違いが多いから全員拒否」にすると、誰でも評価者全員を締め出せる（DoS）。
   守りは合言葉の強さ（他農場は生成ツールが APP 20字以上・ADMIN 32字以上の乱数を作る）に置く。件数は管理入口 op=check の authFails で見る */
const FAIL_WINDOW_SEC = 600;
function failKey_() { return 'authfail_' + Math.floor(Date.now() / (FAIL_WINDOW_SEC * 1000)); }
function noteFail_() {
  try { const c = CacheService.getScriptCache(), k = failKey_(); c.put(k, String(Number(c.get(k) || 0) + 1), FAIL_WINDOW_SEC * 2); } catch (e) { /* 数えられなくても判定は変わらない */ }
}
function failCount_() {
  try { return Number(CacheService.getScriptCache().get(failKey_()) || 0); } catch (e) { return 0; }
}
/* 合言葉の確認（Seed.js 由来で APP_TOKEN が無い・短い時は確認しない＝移行・テスト用。プロパティ由来で短い時は全拒否） */
function authOk_(k) {
  const w = secret_('APP_TOKEN');
  if (w.prop && w.v.length < MIN_APP.prop) return false;
  if (!w.prop && w.v.length < MIN_APP.seed) return true;
  if (String(k || '') === w.v) return true;
  noteFail_();
  return false;
}
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
  buildSummary_(true);   // 集計タブ（全評価者タブを1本の式で並べる）を作る・作り直す
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
    if (!authOk_(e.parameter.k)) return json_({ ok: false, version: CODE_VERSION, capabilities: API_CAPABILITIES, error: 'auth' });
    // 受験者タブが無い（名前の変更・取り違え）のと、タブはあるが空なのを区別する（アプリは前回の名簿を残す）
    const roster = readRoster_();
    if (!roster) return json_({ ok: false, version: CODE_VERSION, capabilities: API_CAPABILITIES, error: 'no roster sheet' });
    const res = { ok: true, version: CODE_VERSION, capabilities: API_CAPABILITIES, roster: roster };
    try { res.done = readDone_(); } catch (err) { /* 要約が読めなくても名簿は返す（アプリはこの端末の記録だけで数える） */ }
    return json_(res);
  }
  if (action === 'admin') return admin_(e);
  return json_({ ok: true, version: CODE_VERSION, capabilities: API_CAPABILITIES });
}

/* 管理用の入口: GET ?action=admin&token=… で setup() を実行し、（農場共通）行を足りない農場だけ補う。
   ADMIN_TOKEN と COMMON_SEED（[[農場, [作業名…]], …]）は git 管理外の Seed.js にだけ置く。無ければこの入口は常に拒否 */
function admin_(e) {
  const tok = String((e && e.parameter && e.parameter.token) || '');
  const adm = secret_('ADMIN_TOKEN');
  if (adm.v.length < (adm.prop ? MIN_ADMIN.prop : MIN_ADMIN.seed)) return json_({ ok: false, error: 'forbidden' });
  if (tok !== adm.v) { noteFail_(); return json_({ ok: false, error: 'forbidden' }); }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'busy' });
  try {
    if (e.parameter.op === 'check') return json_({ ok: true, version: CODE_VERSION, check: checkSummary_(), authFails: failCount_() });   // 読むだけ（集計タブの式の結果を検算）
    const r = setup();
    const added = typeof COMMON_SEED !== 'undefined' ? addCommonRows_(COMMON_SEED) : [];
    return json_({ ok: true, version: CODE_VERSION, setup: r, commonAdded: added, check: checkSummary_() });
  } finally {
    lock.releaseLock();
  }
}
/* （農場共通）行が無い農場にだけ追記する（既存の行・人の行は触らない）。追記した農場名を返す */
function addCommonRows_(seed) {
  const rs = SpreadsheetApp.getActive().getSheetByName(ROSTER_SHEET);
  if (!rs) return [];
  const c = rosterCols_(rs);
  if (c.farm < 0) return [];
  const nf = v => String(v || '').normalize('NFKC').replace(/\s+/g, '');
  const has = new Set();
  if (rs.getLastRow() > 1) {
    const w = rs.getLastColumn();
    rs.getRange(2, 1, rs.getLastRow() - 1, w).getDisplayValues().forEach(r => {
      if (/^[（(]?\s*農場共通\s*[）)]?$/.test(String(r[c.name] || '').trim())) has.add(nf(r[c.farm]));
    });
  }
  const w = rs.getLastColumn(), out = [];
  (seed || []).forEach(([farm, works]) => {
    if (!farm || has.has(nf(farm))) return;
    const row = new Array(w).fill('');
    row[c.farm] = farm; row[c.name] = '（農場共通）';
    (works || []).slice(0, c.works.length).forEach((wk, i) => { row[c.works[i]] = wk; });
    rs.getRange(rs.getLastRow() + 1, 1, 1, w).setValues([row]);
    has.add(nf(farm)); out.push(farm);
  });
  return out;
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  const action = body && body.action;
  if (action !== 'submit' && action !== 'delete') return json_({ ok: false, error: 'unknown action' });
  if (!authOk_(body.k)) return json_({ ok: false, error: 'auth' });
  const isDelete = action === 'delete';
  if (!isDelete && !(body.record && typeof body.record === 'object')) return json_({ ok: false, error: 'no record' });
  if (isDelete && !cleanId_(body.id)) return json_({ ok: false, error: 'no id' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'busy' });
  try {
    if (isDelete) {
      const id = cleanId_(body.id);
      // 戻した（revive）後に、戻すより前に出された削除が遅れて届いた: その削除は古い＝戻した行を消さない。
      // 「前に出された」＝削除の合図が戻しの合図と違い、かつ削除を出した時刻（at）が戻した時刻（rvAt）より前。
      // 戻した後に出された削除（別の端末・別の流れでも）は消す
      const rr = String(PropertiesService.getDocumentProperties().getProperty(REV_KEY + id) || '').split('|'), lastRev = rr[0] || '', lastAt = rr[1] || '';
      const dtok = String(body.rv || '').replace(/[^\w\-]/g, ''), dat = String(body.at || '');
      if (lastRev && dtok !== lastRev && dat && lastAt && dat < lastAt) return json_({ ok: true, id: String(body.id), deleted: 0, staleDelete: true });
      const del = deleteRecord_(id, '削除');
      // 削除の印（墓標 '~del:'+合図の一覧）: 削除の後に遅れて届いた同じ記録の送信で、行を生き返らせない。
      // 合図（rv）＝端末がその記録を「戻した」ときに付けるランダムな値。削除はその時点の合図を持ってくる＝その合図の送信はもう通さない。
      // 時刻は使わない（端末どうしの時計のずれで判定を誤らない）。合図は増えるだけ（古い削除が後から届いても、殺した合図は消えない）
      try {
        const pp = PropertiesService.getDocumentProperties();
        const dead = String(pp.getProperty(DEAD_KEY + id) || '').split(',').filter(Boolean);   // 殺した合図は別のキーに残し続ける（戻しが成功して墓標が外れても消えない）
        const tok = String(body.rv || '').replace(/[^\w\-]/g, '');
        if (tok && dead.indexOf(tok) < 0) { dead.push(tok); pp.setProperty(DEAD_KEY + id, dead.slice(-200).join(',')); }
        pp.deleteProperty(REV_KEY + id);
        pp.setProperty(VER_KEY + id, '~del');
      } catch (err) { /* 印が書けなくても削除は成功 */ }
      return json_({ ok: true, id: String(body.id), deleted: del });
    }
    // 版（端末の更新時刻）: シートに新しい版が既にあれば、古い版（古いバックアップの復元・遅れて届いた再送）で上書きしない
    const rid = cleanId_(body.record.id), ver = String(body.record.ver || ''), props = PropertiesService.getDocumentProperties();
    const have = rid ? String(props.getProperty(VER_KEY + rid) || '') : '';
    // 削除済みの記録は書かない（遅れて届いた再送で生き返らせない）。
    // 書き戻すのは、端末が削除より後にバックアップから「戻した」記録（revive と、墓標の rv より新しい戻した時刻 rv）だけ
    const tomb = /^~del/.test(have), tok = String(body.record.rv || '').replace(/[^\w\-]/g, '');
    const dead = rid ? String(props.getProperty(DEAD_KEY + rid) || '').split(',').filter(Boolean) : [];
    // 殺した合図の戻しは、墓標の有無に関係なく通さない（削除の後に遅れて届いた戻しの送信）
    if (body.record.revive === true && tok && dead.indexOf(tok) >= 0) return json_({ ok: true, id: String(body.record.id), rows: 0, stale: 'deleted' });
    if (tomb && !(body.record.revive === true && tok)) return json_({ ok: true, id: String(body.record.id), rows: 0, stale: 'deleted' });
    if (ver && have && !tomb && have > ver) return json_({ ok: true, id: String(body.record.id), rows: 0, stale: true, sheetVer: have });
    const n = writeRecord_(body.record);
    if (rid) { if (ver) props.setProperty(VER_KEY + rid, ver); else props.deleteProperty(VER_KEY + rid); }
    if (rid && body.record.revive === true && tok) props.setProperty(REV_KEY + rid, tok + '|' + String(body.record.rvAt || ''));   // 戻した合図を控える（これより前に出された削除を見分ける）   // 版の無い送信でも墓標は外す（書いた行と印を食い違わせない）
    let dups = [];
    try { dups = findDups_(body.record); } catch (err) { /* 重複の確認に失敗しても書き込みは成功 */ }
    return json_({ ok: true, id: String(body.record.id), rows: n, dups: dups });
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

/* 評価者タブ（台帳に載ったタブ）の記録を記録IDごとに要約する＝どの端末で採点しても「済・途中・残り」を同じに数える（Z19-3）。
   返すのは 記録ID・評価日・被評価者・農場・作業名だけ（点数・コメント・所感・評価者名は返さない） */
function ymd_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  const m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(String(v || '').replace(/^'/, '').trim());
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}
function readDone_() {
  const ss = SpreadsheetApp.getActive();
  const ids = evalTabIds_(ss), byId = {}, out = [];
  ss.getSheets().forEach(sh => {
    const nm = sh.getName();
    if (isReserved_(nm) || sh.getLastRow() < 2) return;
    if (ids.indexOf(String(sh.getSheetId())) < 0) return;
    if (String(sh.getRange(1, 1).getValues()[0][0]) !== HEAD[0]) return;
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getValues();
    rows.forEach(r => {
      const id = String(r[0] || '').trim(), wn = String(r[6] || '').replace(/^'/, '').trim();
      if (!id || !wn) return;
      let o = byId[id];
      if (!o) {
        o = byId[id] = { id: id, date: ymd_(r[1]), name: String(r[3] || '').replace(/^'/, '').trim(), farm: String(r[4] || '').replace(/^'/, '').trim(), works: [] };
        out.push(o);
      }
      if (o.works.indexOf(wn) < 0) o.works.push(wn);
    });
  });
  return out.filter(o => o.name && o.date);
}

/* シート名に使えない文字を置換・予約タブ名と衝突させない */
function sheetNameFor_(evaluator) {
  let s = String(evaluator || '').replace(/[\[\]\*\?\/\\:]/g, '_').replace(/^'+|'+$/g, '').trim().slice(0, 90);
  if (!s) s = '評価者不明';
  if (isReserved_(s) || s === SUMMARY_SHEET) s = '評価者_' + s;   // 受験者・作業一覧・農場一覧・削除ログ・集計の名前は使わない
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
/* 評価者タブの目印＝GAS が作ったタブの sheetId の台帳（文書プロパティ）。
   A1=記録ID だけで決めると、管理者が複製したタブ・値を貼った控え・集計タブ（A1 に見出しを出す式）まで
   「評価者タブ」とみなして再送・削除のたびに行を消してしまう（G17-1）。複製タブは sheetId が変わるので台帳に載らない。
   台帳がまだ無い時（この版を入れた直後・文書を複製した時）だけ、見出し14列が HEAD と一致し式でないタブを登録する（移行） */
const EVAL_TABS_KEY = 'HSS_EVAL_TAB_IDS';
function isReserved_(nm) { return nm === ROSTER_SHEET || nm === WORKS_SHEET || nm === FARMS_SHEET || nm === DELLOG_SHEET; }
function isEvalHead_(sh) {
  if (sh.getLastColumn() < HEAD_BASE.length) return false;
  const rg = sh.getRange(1, 1, 1, HEAD_BASE.length);
  const v = rg.getValues()[0], f = rg.getFormulas()[0];
  return HEAD_BASE.every((h, i) => String(v[i]) === h && !f[i]);
}
function evalTabIds_(ss) {
  const props = PropertiesService.getDocumentProperties();
  const raw = props.getProperty(EVAL_TABS_KEY);
  let ids = null;
  if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a)) ids = a.map(String); } catch (e) { ids = null; } }
  if (!ids) {
    // 移行: 前の版の GAS が作った評価者タブを登録する。名前が「〜のコピー」「Copy of 〜」のタブ（Sheets の複製）は除く
    ids = ss.getSheets().filter(sh => {
      const nm = sh.getName();
      return !isReserved_(nm) && !/(の)?コピー(\s*\d+)?$|^Copy of /i.test(nm) && isEvalHead_(sh);
    }).map(sh => String(sh.getSheetId()));
    props.setProperty(EVAL_TABS_KEY, JSON.stringify(ids));
  }
  return ids;
}
function addEvalTab_(ss, sh) {
  const ids = evalTabIds_(ss);
  const id = String(sh.getSheetId());
  if (ids.indexOf(id) >= 0) return;
  const live = {};
  ss.getSheets().forEach(s => { live[String(s.getSheetId())] = 1; });
  const next = ids.filter(x => live[x]).concat([id]);   // 消されたタブの番号は捨てる
  PropertiesService.getDocumentProperties().setProperty(EVAL_TABS_KEY, JSON.stringify(next));
}
function isEvalTab_(ss, sh) { return evalTabIds_(ss).indexOf(String(sh.getSheetId())) >= 0; }

/* 記録IDの行を、評価者タブ（台帳に載ったタブ）すべてから消す。評価者名が変わった記録も取りこぼさない。
   複製・控え・集計のタブは台帳に無いので触らない */
/* keep(row)=true の行はログに写さない（同じ内容の再送で削除ログを膨らませない） */
function deleteRecord_(id, why, keep) {
  let n = 0;
  const logRows = [];
  const ss = SpreadsheetApp.getActive();
  const ids = evalTabIds_(ss);
  ss.getSheets().forEach(sh => {
    const nm = sh.getName();
    if (isReserved_(nm) || sh.getLastRow() < 2) return;
    if (ids.indexOf(String(sh.getSheetId())) < 0) return;
    if (String(sh.getRange(1, 1).getValues()[0][0]) !== HEAD[0]) return;   // 見出しを消された台帳のタブも触らない
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    const w = Math.min(sh.getLastColumn(), HEAD.length);
    for (let i = rows.length - 1; i >= 0; i--) if (String(rows[i][0]) === id) {
      const v = sh.getRange(i + 2, 1, 1, w).getValues()[0];
      while (v.length < HEAD.length) v.push('');
      for (let j = 0; j < v.length; j++) if (typeof v[j] === 'string') v[j] = safe_(v[j]);   // getValues は先頭の ' を落とす＝写す時にもう一度付ける（数式として動かさない）
      if (!(keep && keep(v))) logRows.push([Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'), why || '', nm].concat(v));
      sh.deleteRow(i + 2); n++;
    }
  });
  if (logRows.length) { try { delLog_(ss, logRows.reverse()); } catch (err) { /* ログが書けなくても削除は続ける */ } }
  return n;
}

function writeRecord_(rec) {
  const id = cleanId_(rec.id);
  if (!id) throw new Error('no id');
  const ss = SpreadsheetApp.getActive();
  // 同じ記録IDの既存行を、全ての評価者タブから消す（編集・再送で重複させない。
  // 評価者名の表記を直した端末から編集して送り直しても、前の評価者タブに古い行を残さない）
  // 同じ内容（作業・種目・点・コメント・所感・やり直し元が同じ）の行は再送なのでログに残さない
  const sameKey_ = r => [r[3], r[4], r[6], r[7], r[8] === '' ? '' : Number(r[8]), r[9], r[12], r[14]].map(String).join('\u0001');
  const newKeys = {};
  (Array.isArray(rec.works) ? rec.works.slice(0, 50) : []).forEach(w => (Array.isArray(w.items) ? w.items.slice(0, 20) : []).forEach(it => {
    const n = it.score == null || it.score === '' ? NaN : Number(it.score), sc = n >= 1 && n <= 5 ? n : '';
    newKeys[sameKey_([id, '', '', safe_(rec.evaluatee), safe_(rec.farm), '', safe_(w.workName), safe_(it.aspect), sc, safe_(it.comment), '', '', safe_(rec.overall), '', cleanIds_(rec.redoOf)])] = 1;
  }));
  deleteRecord_(id, '上書き', v => !!newKeys[sameKey_(v)]);
  const base = sheetNameFor_(rec.evaluator);
  let name = base, sh = ss.getSheetByName(name);
  // 同じ名前のタブが評価者タブでない時（管理者が作った別のタブ）は書き込まない＝「〜_記録」「〜_記録2」…へ
  for (let k = 1; sh && !isEvalTab_(ss, sh); k++) {
    if (isEvalHead_(sh)) { addEvalTab_(ss, sh); break; }   // 台帳から漏れた評価者タブ（見出し一致）は登録し直す
    name = base.slice(0, 85) + '_記録' + (k > 1 ? k : '');
    sh = ss.getSheetByName(name);
  }
  let added = false;
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#e6f2ee');
    sh.setFrozenRows(1);
    addEvalTab_(ss, sh);
    added = true;
  } else if (String(sh.getRange(1, HEAD.length).getValues()[0][0]) !== HEAD[HEAD.length - 1]) {
    sh.getRange(1, HEAD.length).setValues([[HEAD[HEAD.length - 1]]]).setFontWeight('bold').setBackground('#e6f2ee');   // 前の版で作ったタブに「やり直し元」の見出し
  }
  const works = Array.isArray(rec.works) ? rec.works.slice(0, 50) : [];
  const allScores = [];
  const sc_ = v => { const n = v == null || v === '' ? NaN : Number(v); return n >= 1 && n <= 5 ? n : NaN; };   // 空欄（null）を0点にしない
  works.forEach(w => (w.items || []).forEach(it => allScores.push(sc_(it.score))));
  const sessAvg = avg_(allScores);
  const redoOf = cleanIds_(rec.redoOf);
  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  const rows = [];
  works.forEach(w => {
    const items = Array.isArray(w.items) ? w.items.slice(0, 20) : [];
    const wAvg = avg_(items.map(it => sc_(it.score)));
    items.forEach(it => {
      const sc = sc_(it.score);
      rows.push([id, safe_(rec.date), safe_(rec.evaluator), safe_(rec.evaluatee), safe_(rec.farm), safe_(w.category), safe_(w.workName),
        safe_(it.aspect), (sc >= 1 && sc <= 5) ? sc : '', safe_(it.comment), wAvg, sessAvg, safe_(rec.overall), now, redoOf]);
    });
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEAD.length).setValues(rows);
  if (added) { try { buildSummary_(false); } catch (err) { /* 集計が作れなくても記録の書き込みは成功として返す */ } }   // 新しい評価者タブを集計の式に足す
  return rows.length;
}
function cleanIds_(v) {
  const a = (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[\s,、]+/)).map(cleanId_).filter(x => x && !/^_+$/.test(x));
  return a.filter((x, i) => a.indexOf(x) === i).join(' ');
}

/* ==============================================================
   集計タブ（Z20-2）: 全評価者タブ（台帳に載ったタブ）の行を1本の式で縦に並べ、今の農場とやり直しの採否を足す。
   - A3 = LET+FILTER+CHOOSECOLS（空行を除く＝2人目以降の評価者の行が1000行目あたりに飛ばない）
   - P3 = 今の農場（受験者タブの被評価者 → 農場。見つからなければ旧名の列で「、」区切りの完全一致 → 無ければ記録時の農場）
   - Q3 = 採否（どこかの行の「やり直し元」にこの記録IDがあれば「やり直し前」、それ以外は「採用」）
   式はタブの名前・受験者タブの列の位置から GAS が組む。setup と、GAS が評価者タブを新しく作った時に作り直す。
   作り直すのは GAS 自身が作った集計タブ（文書プロパティ HSS_SUMMARY_TAB_ID）だけ。同じ名前の別タブがあれば触らない
   ============================================================== */
function colL_(i) { let s = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function qName_(nm) { return "'" + String(nm).replace(/'/g, "''") + "'"; }
function summaryFormulas_(ss) {
  const ids = evalTabIds_(ss), last = colL_(HEAD.length - 1);
  const tabs = ss.getSheets().filter(sh => ids.indexOf(String(sh.getSheetId())) >= 0 && !isReserved_(sh.getName())).map(sh => sh.getName());
  const out = { tabs: tabs };
  out.data = tabs.length ? '=LET(d,{' + tabs.map(n => qName_(n) + '!A2:' + last).join(';') + '},IFERROR(FILTER(d,CHOOSECOLS(d,1)<>""),""))' : '';
  const rs = ss.getSheetByName(ROSTER_SHEET);
  const c = rs ? rosterCols_(rs) : null;
  const R = ci => qName_(ROSTER_SHEET) + '!$' + colL_(ci) + '$2:$' + colL_(ci);
  let farm = 'e';
  if (c && c.farm >= 0) {
    const alias = c.alias >= 0
      ? 'XLOOKUP(TRUE,ARRAYFORMULA(ISNUMBER(FIND("、"&n&"、","、"&REGEXREPLACE(' + R(c.alias) + '&"","\\s*[、,，/／;；\\n]\\s*","、")&"、"))),' + R(c.farm) + ',e)'
      : 'e';
    // 同じ名前が2農場にいる時に先の行の農場を返さないよう、まず 名前＋記録時の農場 で引く → 名前だけ → 旧名 → 記録時の農場
    // LAMBDA の中では (範囲=n)*(範囲=e) が配列として評価されず全行 #N/A になる（10-06 実シートで確認）→ 配列に強い FILTER で引き、無ければ従来の引き方
    farm = 'IFERROR(INDEX(FILTER(' + R(c.farm) + ',' + R(c.name) + '=n,' + R(c.farm) + '=e),1),XLOOKUP(n,' + R(c.name) + ',' + R(c.farm) + ',' + alias + '))';
  }
  out.farm = '=MAP(D3:D,E3:E,LAMBDA(n,e,IF(n="",,' + farm + ')))';
  out.use = '=MAP(A3:A,LAMBDA(id,IF(id="",,IF(COUNTIF(O3:O,"*"&id&"*"),"やり直し前","採用"))))';
  return out;
}
function buildSummary_(create) {
  const ss = SpreadsheetApp.getActive(), props = PropertiesService.getDocumentProperties();
  let sh = ss.getSheetByName(SUMMARY_SHEET);
  const mine = props.getProperty(SUMMARY_KEY);
  if (sh && String(sh.getSheetId()) !== mine) return 'skip: 同じ名前の別タブ';   // 管理者が作ったタブは触らない
  if (!sh) {
    if (!create) return 'skip: 集計タブなし';   // 消された集計タブは setup の時だけ作り直す
    sh = ss.insertSheet(SUMMARY_SHEET);
    props.setProperty(SUMMARY_KEY, String(sh.getSheetId()));
  }
  const f = summaryFormulas_(ss);
  sh.clear();
  sh.getRange(1, 1).setValues([['集計（自動・手で直さない。setup と評価者タブが増えた時に GAS が作り直す）。採否が「採用」の行だけを数える（やり直し前＝やり直しで置き換わった前回）']]);
  sh.getRange(2, 1, 1, HEAD.length + 2).setValues([HEAD.concat(['今の農場', '採否'])]).setFontWeight('bold').setBackground('#e6f2ee');
  sh.setFrozenRows(2);
  if (f.data) {
    sh.getRange(3, 1).setFormula(f.data);
    sh.getRange(3, HEAD.length + 1).setFormula(f.farm);
    sh.getRange(3, HEAD.length + 2).setFormula(f.use);
  }
  return 'summary OK: ' + f.tabs.length + ' tabs';
}

/* 同じ人（被評価者＋農場）・同じ作業を、別の記録（やり直しの関係にない）が採点していれば、その作業名を返す（別の端末の二重採点の検知） */
function findDups_(rec) {
  const id = cleanId_(rec.id), redo = cleanIds_(rec.redoOf).split(' ').filter(Boolean);
  const ss = SpreadsheetApp.getActive(), ids = evalTabIds_(ss);
  const works = {}; (Array.isArray(rec.works) ? rec.works : []).forEach(w => { works[String(w.workName || '')] = 1; });
  // 名前・農場はアプリと同じそろえ方（全角空白・連続空白・全角半角）。日付は前後14日以内だけ（前回の試験・練習の記録で誤って警告しない）
  const nk = v => String(v == null ? '' : v).normalize('NFC').replace(/[\s\u3000]+/g, ' ').trim(), nf = v => String(v || '').normalize('NFKC').replace(/\s+/g, '');
  const dn = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v instanceof Date ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd') : String(v || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN; };
  const ee = nk(rec.evaluatee), farm = nf(rec.farm), d0 = dn(rec.date), out = {}, redoneBy = {};
  const rows = [];
  ss.getSheets().forEach(sh => {
    if (ids.indexOf(String(sh.getSheetId())) < 0 || sh.getLastRow() < 2) return;
    sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getValues().forEach(r => rows.push(r));
  });
  rows.forEach(r => String(r[14] || '').split(/\s+/).filter(Boolean).forEach(x => { redoneBy[x] = 1; }));   // やり直しで置き換わった記録は数えない
  rows.forEach(r => {
    const rid = String(r[0]);
    if (rid === id || redo.indexOf(rid) >= 0 || redoneBy[rid] || redoneBy[id]) return;
    const dd = dn(r[1]);
    if (nk(r[3]) === ee && nf(r[4]) === farm && works[String(r[6])] && !(Math.abs(dd - d0) > 14)) out[String(r[6])] = 1;
  });
  return Object.keys(out);
}
/* 削除・上書きで消える行の控え（日時・理由・元のタブ＋元の15列）。タブが無ければ作る */
function delLog_(ss, rows) {
  let sh = ss.getSheetByName(DELLOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DELLOG_SHEET);
    sh.getRange(1, 1, 1, HEAD.length + 3).setValues([['消した日時', '理由', '元のタブ'].concat(HEAD)]).setFontWeight('bold').setBackground('#fdecea');
    sh.setFrozenRows(1);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEAD.length + 3).setValues(rows);
}
/* 集計タブの検算（読むだけ）: 式の結果（P=今の農場・Q=採否）を、同じ規則で GAS 側でも計算して突き合わせる。
   返すのは件数と食い違いの行番号だけ（名前・点数は返さない） */
function checkSummary_() {
  const ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(SUMMARY_SHEET);
  if (!sh) return { summary: 'none' };
  const n = Math.max(0, sh.getLastRow() - 2), W = HEAD.length + 2;
  const v = n ? sh.getRange(3, 1, n, W).getDisplayValues() : [];
  const rs = ss.getSheetByName(ROSTER_SHEET), c = rs ? rosterCols_(rs) : null;
  const ro = rs && rs.getLastRow() > 1 ? rs.getRange(2, 1, rs.getLastRow() - 1, rs.getLastColumn()).getDisplayValues() : [];
  const redo = {};
  v.forEach(r => String(r[14] || '').split(/\s+/).filter(Boolean).forEach(id => { redo[id] = 1; }));
  const want = r => {
    const n0 = r[3], e = r[4];
    if (!c || c.farm < 0) return e;
    let hit = ro.find(x => x[c.name] === n0 && x[c.farm] === e); if (hit) return hit[c.farm];
    hit = ro.find(x => x[c.name] === n0); if (hit) return hit[c.farm];
    if (c.alias >= 0) { hit = ro.find(x => ('、' + String(x[c.alias] || '').replace(/\s*[、,，\/／;；\n]\s*/g, '、') + '、').indexOf('、' + n0 + '、') >= 0); if (hit) return hit[c.farm]; }
    return e;
  };
  const errs = [], farmBad = [], useBad = [];
  let use = 0, before = 0;
  v.forEach((r, i) => {
    if (r.some(x => /^#(N\/A|REF|VALUE|NAME|ERROR|DIV)/.test(String(x)))) errs.push(i + 3);
    if (!r[0]) return;
    if (r[HEAD.length] !== want(r)) farmBad.push(i + 3);
    const u = redo[r[0]] ? 'やり直し前' : '採用';
    if (r[HEAD.length + 1] !== u) useBad.push(i + 3);
    if (u === '採用') use++; else before++;
  });
  return { rows: v.filter(r => r[0]).length, adopted: use, beforeRedo: before, errorRows: errs.slice(0, 20), farmMismatch: farmBad.slice(0, 20), useMismatch: useBad.slice(0, 20),
    errorSample: errs.length ? (() => { const r = v[errs[0] - 3]; const j = r.findIndex(x => /^#/.test(String(x))); return { col: j + 1, value: r[j], note: String(sh.getRange(errs[0], j + 1).getNote() || '') }; })() : null,
    formulaFarm: n ? String(sh.getRange(3, HEAD.length + 1).getFormula()) : '' };
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
