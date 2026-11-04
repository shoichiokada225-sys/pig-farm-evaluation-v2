/* Code.gs の単体テスト（SpreadsheetApp等をモック）: node gas/test_gas.js */
const fs = require('fs');
const sheets = {};
let nextSheetId = 1000;
function mkSheet(name) {
  const d = []; // 2D
  const fx = {};   // 'r,c' → 式（A1 が式のタブ）
  const sid = nextSheetId++;
  const dv = {};   // 列番号(1始まり) → 入力規則（null=外した）
  const notes = {};
  const nf = {};   // 'r,c'（範囲の左上）→ 表示形式
  const prot = [];
  const sh = {
    name, d, dv, notes, fx, nf, prot, getName: () => name, getSheetId: () => sid,
    getLastRow: () => d.length, getLastColumn: () => d.reduce((m, r) => Math.max(m, r.length), 0),
    getRange: (r, c, nr = 1, nc = 1) => ({
      _sheet: name,
      setValues(v) { v.forEach((row, i) => { d[r - 1 + i] = d[r - 1 + i] || []; row.forEach((x, j) => d[r - 1 + i][c - 1 + j] = x); }); return this; },
      getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (d[r - 1 + i] || [])[c - 1 + j] ?? '')); },
      getDisplayValues() { return this.getValues().map(r => r.map(String)); },
      getFormulas() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => fx[(r + i) + ',' + (c + j)] || '')); },
      setFontWeight() { return this; }, setBackground() { return this; },
      setDataValidation(v) { for (let j = 0; j < nc; j++) dv[c + j] = v; return this; },
      setNote(t) { notes[r + ',' + c] = t; return this; },
      setNumberFormat(f) { nf[r + ',' + c] = f; return this; },
      protect() { const p = { r, c, nr, nc, warn: false, setWarningOnly(b) { p.warn = b !== false; return p; }, setDescription() { return p; } }; prot.push(p); return p; },
      setFormula(f) { fx[r + ',' + c] = f; return this; },
    }),
    deleteRow: i => d.splice(i - 1, 1), setFrozenRows() {}, setColumnWidth() {}, clear() { d.length = 0; Object.keys(fx).forEach(k => delete fx[k]); Object.keys(nf).forEach(k => delete nf[k]); },
    getMaxRows: () => Math.max(d.length, 1000), getProtections: () => prot.slice(), autoResizeColumns() {},
  };
  return sh;
}
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
global.SpreadsheetApp = { ProtectionType: { RANGE: 'RANGE' }, getActive: () => ss, newDataValidation: () => {
  const v = {};
  return { requireCheckbox() { v.checkbox = true; return this; }, requireValueInRange(rg) { v.range = rg; return this; }, setAllowInvalid(b) { v.allowInvalid = b; return this; }, build() { return v; } };
} };
const docProps = {};
global.PropertiesService = { getDocumentProperties: () => ({ getProperty: k => (k in docProps ? docProps[k] : null), setProperty(k, v) { docProps[k] = String(v); return this; }, deleteProperty(k) { delete docProps[k]; return this; } }) };
/* Sheets の「複製」＝中身も見出しも同じで sheetId だけ新しいタブ */
const dupSheet = (from, to) => { const s2 = ss.insertSheet(to); sheets[from].d.forEach((row, i) => { s2.d[i] = row.slice(); }); return s2; };
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
let mockNow = '2026-09-23 10:00:00';   // 更新日時の確認用に差し替える
global.Utilities = { formatDate: (d, tz, f) => f === 'yyyy-MM-dd' ? new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10) : mockNow };
global.ContentService = { MimeType: { JSON: 'j' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) };
const code = fs.readFileSync(__dirname + '/Code.gs', 'utf8');
const SEED = [['那須農場', 'テスト 一郎', '給餌'], ['大田原農場', 'テスト 二郎']];
const G = new Function('ROSTER_SEED', code + ';return {setup,doGet,doPost};')(SEED);
let pass = 0, fail = 0; const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  OK ' : '  NG ') + n); };

ok('setup', G.setup() === 'setup OK' && sheets['受験者'] && sheets['作業一覧'].d.length === 54); // 見出し＋49作業＋試験区分4
ok('見出し=農場・被評価者・作業1〜8・旧名', sheets['受験者'].d[0].join() === '農場,被評価者,作業1,作業2,作業3,作業4,作業5,作業6,作業7,作業8,旧名');
ok('空の受験者タブにシードが入る', sheets['受験者'].d.length === 3 && sheets['受験者'].d[1][1] === 'テスト 一郎' && sheets['受験者'].d[2].length === 11);
// S8-4: 農場のプルダウン（正本=農場一覧タブ）
const RS = () => sheets['受験者'];
ok('農場一覧タブ=名簿の初期データの農場＋所属未確定', sheets['農場一覧'] && sheets['農場一覧'].d.map(r => r[0]).join() === '農場,那須農場,大田原農場,所属未確定');
ok('農場列にプルダウン（農場一覧・不正な値は拒否）', RS().dv[1] && RS().dv[1].allowInvalid === false && RS().dv[1].range._sheet === '農場一覧');
ok('被評価者・旧名の列にはプルダウンをかけない', !RS().dv[2] && !RS().dv[11]);
ok('作業1〜8の列だけに作業のプルダウン', [3, 4, 5, 6, 7, 8, 9, 10].every(c => RS().dv[c] && RS().dv[c].allowInvalid === false && RS().dv[c].range._sheet === '作業一覧'));
// S8-5: 記入の約束を見出しのメモに
ok('被評価者の見出しに記入の約束のメモ', /所属未確定/.test(RS().notes['1,2'] || '') && /（農場共通）/.test(RS().notes['1,2']) && /No\.は入らない/.test(RS().notes['1,2']) && /旧名/.test(RS().notes['1,2']));
sheets['農場一覧'].getRange(4, 1, 1, 1).setValues([['テスト睦沢']]);   // 管理者が一覧を直す
G.setup();
ok('setup再実行でシードは二重に入らない', RS().d.length === 3);
ok('setup再実行で管理者が直した農場一覧は消さない', sheets['農場一覧'].d.map(r => r[0]).join() === '農場,那須農場,大田原農場,テスト睦沢');
// S8-6: 「作業メモ」列は作業として読まない・プルダウンもかけない（前の版でかけた分は外す）
RS().getRange(1, 12, 1, 1).setValues([['作業メモ']]);
RS().getRange(2, 12, 1, 1).setValues([['午後に実施']]);
RS().getRange(2, 11, 1, 1).setValues([['テスト 壱郎、テスト いちろう']]);
RS().dv[12] = { allowInvalid: false };   // 前の版の setup がかけてしまったプルダウン
G.setup();
ok('setup再実行: 作業メモ列のプルダウンを外す', RS().dv[12] === null && [3, 10].every(c => RS().dv[c] && RS().dv[c].allowInvalid === false));
let ro0 = JSON.parse(G.doGet({ parameter: { action: 'roster' } }).s);
ok('roster: 作業メモ列の文は作業に入らない', ro0.roster[0].works.join() === '給餌');
ok('roster: 旧名（、区切り）', ro0.roster[0].aliases.join('|') === 'テスト 壱郎|テスト いちろう' && !('aliases' in ro0.roster[1]));
RS().getRange(1, 11, 1, 2).setValues([['別名', '作業９']]);   // 見出し「別名」・全角数字の作業列
ro0 = JSON.parse(G.doGet({ parameter: { action: 'roster' } }).s);
ok('roster: 見出し「別名」も旧名・「作業９」（全角数字）は作業列', ro0.roster[0].aliases.length === 2 && ro0.roster[0].works.join() === '給餌,午後に実施');
RS().getRange(1, 11, 1, 2).setValues([['旧名', '作業メモ']]);
RS().getRange(2, 11, 1, 2).setValues([['', '']]);
sheets['受験者'].getRange(4, 1, 2, 4).setValues([['睦沢農場', 'グエン', '給餌', 'エサ調整'], ['睦沢農場', '  ', '給餌', '']]);
let ro = JSON.parse(G.doGet({ parameter: { action: 'roster' } }).s);
ok('roster: 空名の行は除外', ro.ok && ro.roster.length === 3);
ok('roster: 農場と作業', ro.roster[2].farm === '睦沢農場' && ro.roster[2].works.join() === '給餌,エサ調整' && ro.roster[0].works.join() === '給餌' && ro.roster[1].works.length === 0);
// 旧形式（見出しに農場なし・A=被評価者）も読める
sheets['受験者'].d.length = 0;
sheets['受験者'].getRange(1, 1, 2, 3).setValues([['被評価者', '作業1', '作業2'], ['タナカ', '給餌', '']]);
ro = JSON.parse(G.doGet({ parameter: { action: 'roster' } }).s);
ok('旧形式（農場列なし）', ro.roster.length === 1 && ro.roster[0].name === 'タナカ' && ro.roster[0].farm === '' && ro.roster[0].works.join() === '給餌');
// 受験者タブが空（見出しだけ）= ok:true・0件 ／ タブが無い = ok:false（アプリが前回の名簿を消さないよう区別）
sheets['受験者'].d.length = 1;
ro = JSON.parse(G.doGet({ parameter: { action: 'roster' } }).s);
ok('空の受験者タブは ok:true・0件', ro.ok === true && Array.isArray(ro.roster) && ro.roster.length === 0);
const keepRs = sheets['受験者']; delete sheets['受験者'];
ro = JSON.parse(G.doGet({ parameter: { action: 'roster' } }).s);
ok('受験者タブが無い時は ok:false・no roster sheet', ro.ok === false && ro.error === 'no roster sheet' && !('roster' in ro));
sheets['受験者'] = keepRs;
const rec = { id: 'abc-1', date: '2026-09-23', evaluator: '岡田/正一', evaluatee: 'グエン', farm: '睦沢農場', overall: '=SUM(A1)',
  works: [{ workName: '給餌', category: '飼養管理', items: [{ aspect: 'a', score: 4, comment: '+x' }, { aspect: 'b', score: 2, comment: '' }] }] };
const post = o => JSON.parse(G.doPost({ postData: { contents: JSON.stringify(o) } }).s);
let r = post({ action: 'submit', record: rec });
const sh = sheets['岡田_正一'];
ok('評価者名タブ（/→_）', r.ok && sh && sh.d.length === 3);
ok('数式インジェクション対策', sh.d[1][9] === "'+x" && sh.d[1][12] === "'=SUM(A1)");
ok('農場列', sh.d[0][4] === '農場' && sh.d[1][4] === '睦沢農場');
ok('平均', sh.d[1][10] === 3 && sh.d[1][11] === 3);
rec.works[0].items[0].score = 5; post({ action: 'submit', record: rec });
ok('同じIDは上書き（行数不変）', sh.d.length === 3 && sh.d[1][8] === 5);
post({ action: 'submit', record: { ...rec, id: 'abc-2' } });
ok('別IDは追記', sh.d.length === 5);
ok('予約名は回避', (post({ action: 'submit', record: { ...rec, id: 'z', evaluator: '受験者' } }), !!sheets['評価者_受験者']));
ok('予約名は回避（農場一覧）', (post({ action: 'submit', record: { ...rec, id: 'z2', evaluator: '農場一覧' } }), !!sheets['評価者_農場一覧'] && sheets['農場一覧'].d[0][0] === '農場'));
// 削除（アプリで消した記録の行をシートからも消す）
const idsOf = n => sheets[n].d.slice(1).map(r => r[0]);
post({ action: 'submit', record: { ...rec, id: 'del-1', evaluator: '評価者B' } });
const oldRowsB = sheets['評価者B'].d.slice(1).map(r => r.slice());
post({ action: 'submit', record: { ...rec, id: 'del-1' } });   // 評価者名を変えて送り直した記録
// R15-4: 評価者を変えて送り直しても、前の評価者タブに古い行を残さない（記録ID=1つの版だけ）
ok('評価者変更の再送: 前の評価者タブから消える・新しいタブに1版だけ', !idsOf('評価者B').includes('del-1') && idsOf('岡田_正一').filter(x => x === 'del-1').length === rec.works[0].items.length);
ok('評価者変更の再送: シート全体で同じ記録IDの行は1版分だけ', Object.values(sheets).reduce((n, s) => n + s.d.slice(1).filter(r => r[0] === 'del-1').length, 0) === rec.works[0].items.length);
oldRowsB.forEach(r => sheets['評価者B'].d.push(r));   // 前の版の GAS が残した重複（2タブに同じID）を再現
sheets['受験者'].getRange(6, 1, 1, 2).setValues([['del-1', 'del-1']]);   // 受験者タブの同じ文字列は消さない
const nRo = sheets['受験者'].d.length;
r = post({ action: 'delete', id: 'del-1' });
ok('delete: ok・記録ID・消した行数', r.ok === true && r.id === 'del-1' && r.deleted === 4);
ok('delete: 全ての評価者タブから消える', !idsOf('岡田_正一').includes('del-1') && !idsOf('評価者B').includes('del-1'));
ok('delete: 他の記録は残る', idsOf('岡田_正一').includes('abc-1') && idsOf('岡田_正一').includes('abc-2'));
ok('delete: 受験者タブは触らない', sheets['受験者'].d.length === nRo);
r = post({ action: 'delete', id: 'del-1' });
ok('delete: 2回目（再送）も ok・deleted 0', r.ok === true && r.id === 'del-1' && r.deleted === 0);
ok('delete: IDなしは拒否', post({ action: 'delete' }).ok === false && post({ action: 'delete', id: '' }).ok === false);
// G17-1: 評価者タブの目印は GAS が作ったタブの台帳。A1=記録ID でも、複製タブ・値貼りの控え・A1が式の集計タブの行は消さない
const recY = { ...rec, id: 'y-1', evaluator: '評価者Y', works: [rec.works[0], { workName: 'エサ調整', category: '飼養管理', items: rec.works[0].items }] };
post({ action: 'submit', record: recY });
post({ action: 'submit', record: { ...recY, id: 'y-2' } });
const nY = sheets['評価者Y'].d.length;
dupSheet('評価者Y', '評価者Y のコピー');                                     // タブの複製
dupSheet('評価者Y', '控え0924');                                             // 値を貼った控え
const agg = dupSheet('評価者Y', '集計'); agg.fx['1,1'] = "={'評価者Y'!A1:N}";   // README どおりの A1 が式の集計タブ
agg.d.forEach((row, i) => { if (i) row[14] = '今の農場' + i; });              // 管理者が足した O 列
const snap = n => JSON.stringify(sheets[n].d);
const before = { c: snap('評価者Y のコピー'), k: snap('控え0924'), a: snap('集計') };
post({ action: 'submit', record: recY });                                     // 圏外からの自動再送
ok('G17-1 再送: 評価者タブは上書き（行数不変）', sheets['評価者Y'].d.length === nY && idsOf('評価者Y').filter(x => x === 'y-1').length === 4);
ok('G17-1 再送: 複製タブの行は残る', snap('評価者Y のコピー') === before.c);
ok('G17-1 再送: 値貼りの控えの行は残る', snap('控え0924') === before.k);
ok('G17-1 再送: A1が式の集計タブの行（足したO列も）は残る', snap('集計') === before.a);
r = post({ action: 'delete', id: 'y-2' });
ok('G17-1 削除: 評価者タブからだけ消える', r.ok && r.deleted === 4 && !idsOf('評価者Y').includes('y-2'));
ok('G17-1 削除: 複製・控え・集計は残る', snap('評価者Y のコピー') === before.c && snap('控え0924') === before.k && snap('集計') === before.a);
// 評価者名と同じ名前の、評価者タブでないタブ（管理者のメモ等）には書き込まず別名タブへ
ss.insertSheet('評価者Z').getRange(1, 1, 1, 2).setValues([['メモ', '大事']]);
post({ action: 'submit', record: { ...rec, id: 'z-1', evaluator: '評価者Z' } });
ok('G17-1 同名の別タブは触らず「_記録」タブへ', sheets['評価者Z'].d.length === 1 && sheets['評価者Z_記録'] && idsOf('評価者Z_記録').includes('z-1'));
post({ action: 'submit', record: { ...rec, id: 'z-2', evaluator: '評価者Z' } });
ok('G17-1 2回目も同じ「_記録」タブへ追記', sheets['評価者Z'].d.length === 1 && idsOf('評価者Z_記録').join() === 'z-1,z-1,z-2,z-2');
// 移行: 台帳の無い（前の版の GAS で作った）シート。見出し一致のタブは評価者タブ、複製名・A1が式のタブは対象外
{
  const keep = { ...sheets }; Object.keys(sheets).forEach(k => delete sheets[k]); const keepProp = docProps.HSS_EVAL_TAB_IDS; delete docProps.HSS_EVAL_TAB_IDS;
  const HEADV = ['記録ID', '評価日', '評価者', '被評価者', '農場', 'カテゴリ', '作業', '種目', 'スコア', 'コメント', '作業平均', 'セッション平均', '全体所感', '送信日時'];
  const mkOld = n => { const s2 = ss.insertSheet(n); s2.d.push(HEADV.slice(), ['m-1', '', '', '', '', '', '', '', 3, '', 3, 3, '', '']); return s2; };
  mkOld('旧評価者'); mkOld('旧評価者 のコピー'); mkOld('Copy of 旧評価者'); mkOld('旧集計').fx['1,1'] = '={旧評価者!A1:N}';
  r = post({ action: 'delete', id: 'm-1' });
  ok('G17-1 移行: 前の版の評価者タブは消せる・複製名/式の集計は残す', r.deleted === 1 && sheets['旧評価者'].d.length === 1 && ['旧評価者 のコピー', 'Copy of 旧評価者', '旧集計'].every(n => sheets[n].d.length === 2));
  ok('G17-1 移行: 台帳は1回だけ作る', JSON.parse(docProps.HSS_EVAL_TAB_IDS).length === 1);
  Object.keys(sheets).forEach(k => delete sheets[k]); Object.assign(sheets, keep); docProps.HSS_EVAL_TAB_IDS = keepProp;
}
ok('不正JSON', post.call(null, null) && JSON.parse(G.doPost({ postData: { contents: '{' } }).s).ok === false);
// C9-3: 契約（正本=js/contract.js）。アプリ側の本物のコード（works-v2.js＋data.js＋contract.js）で作った要求を、本物の doPost に通す
const rd = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
const APP = new Function(rd('works-v2.js') + ';' + rd('js/data.js') + ';' + rd('js/contract.js') +
  ';return {applyAspectOverrides:typeof applyAspectOverrides==="function"?applyAspectOverrides:null,WORKDATA_V2,toPayload,submitReq,deleteReq,gasInfo,gasMissing,isUnsupportedOp,GAS_REQUIRED_CAPS,GAS_MIN_VERSION};')();
const ping = JSON.parse(G.doGet({ parameter: { action: 'ping' } }).s);
const roC = JSON.parse(G.doGet({ parameter: { action: 'roster' } }).s);
ok('契約: ping・roster は version と capabilities を返す', Array.isArray(ping.capabilities) && ping.version && JSON.stringify(roC.capabilities) === JSON.stringify(ping.capabilities) && roC.version === ping.version);
ok('契約: GAS の capabilities ⊇ アプリが必要とする機能・版 ≥ GAS_MIN_VERSION', APP.GAS_REQUIRED_CAPS.every(c => ping.capabilities.includes(c)) && APP.gasMissing(APP.gasInfo(ping)).length === 0);
ok('契約: capabilities の無い古い GAS は足りないと判定', APP.gasMissing(APP.gasInfo({ ok: true, version: '2026-09-24b' })).join() === APP.GAS_REQUIRED_CAPS.join() && APP.gasMissing(undefined).length === 0);
ok('契約: 版だけ古い GAS も判定', APP.gasMissing({ version: '2026-09-01', caps: APP.GAS_REQUIRED_CAPS.slice() }).join() === 'version');
const fw = APP.WORKDATA_V2.works.find(w => w.id === 'feeding-daily');
const appRec = { id: 'fx-1', date: '2026-09-24', evaluator: 'テスト評価者', evaluatee: 'テスト 契約', farm: 'テスト農場A', overall: '全体の所感',
  createdAt: '2026-09-24T01:00:00Z', sent: false,
  works: [{ workId: fw.id, workName: fw.name, category: fw.category, scores: Object.fromEntries(fw.aspects.map((a, i) => [a.id, i + 1])), comments: { [fw.aspects[0].id]: '=cmd' } }] };
r = post(APP.submitReq(appRec));
const shC = sheets['テスト評価者'];
ok('契約: toPayload の記録を doPost が受け付ける', r.ok === true && r.id === 'fx-1' && r.rows === fw.aspects.length && shC && shC.d.length === 1 + fw.aspects.length);
ok('契約: 行に被評価者・農場・日本語のカテゴリ/作業/種目・点', shC.d[1][3] === 'テスト 契約' && shC.d[1][4] === 'テスト農場A' && shC.d[1][5] === '飼養管理' && shC.d[1][6] === fw.name &&
  shC.d.slice(1).map(x => x[7]).join() === fw.aspects.map(a => a.name).join() && shC.d.slice(1).map(x => x[8]).join() === '1,2,3,4,5' && shC.d[1][9] === "'=cmd" && shC.d[1][11] === 3);
// Z19-3: 名簿の応答に評価者タブの記録の要約（ほかの端末で済んだ人・作業）。点数・コメント・評価者名は出さない
const fw2 = APP.WORKDATA_V2.works.find(w => w.id === 'feed-adjust');
post(APP.submitReq({ ...appRec, id: 'fx-2', evaluator: 'テスト評価者B', evaluatee: 'テスト 別端末', farm: 'テスト農場B', date: '2026-09-25',
  works: [fw, fw2].map(w => ({ workId: w.id, workName: w.name, category: w.category, scores: Object.fromEntries(w.aspects.map(a => [a.id, 4])), comments: {} })) }));
sheets['テスト評価者B'].d.push(['fx-3', new Date('2026-09-26T00:00:00+09:00'), 'テスト評価者B', 'テスト 日付型', '', '飼養管理', fw.name, fw.aspects[0].name, 3, '', 3, 3, '', '']);   // 評価日が日付型に変わったセル
ss.insertSheet('控え').getRange(1, 1, 2, 14).setValues([sheets['テスト評価者'].d[0].slice(), ['fx-9', '2026-09-25', 'x', 'テスト 控え', '', '', fw.name, '', 3, '', 3, 3, '', '']]);   // 台帳に無いタブは数えない
let roD = JSON.parse(G.doGet({ parameter: { action: 'roster' } }).s);
const dOf = id => (roD.done || []).find(x => x.id === id);
ok('要約: roster に done 配列・capabilities に roster.done', Array.isArray(roD.done) && roD.capabilities.includes('roster.done'));
ok('要約: 記録ごとに 日付・被評価者・農場・作業名（重複なし）', dOf('fx-1') && dOf('fx-1').date === '2026-09-24' && dOf('fx-1').name === 'テスト 契約' && dOf('fx-1').farm === 'テスト農場A' && dOf('fx-1').works.join() === fw.name
  && dOf('fx-2') && dOf('fx-2').works.join() === [fw.name, fw2.name].join() && dOf('fx-2').date === '2026-09-25');
ok('要約: 日付型のセルも YYYY-MM-DD', dOf('fx-3') && dOf('fx-3').date === '2026-09-26');
ok('要約: 点数・コメント・評価者名・所感は含まない', Array.isArray(roD.done) && !/テスト評価者|全体の所感|=cmd/.test(JSON.stringify(roD.done)) && roD.done.every(x => Object.keys(x).sort().join() === 'date,farm,id,name,works'));
ok('要約: 台帳に無いタブ（控え）は数えない', !dOf('fx-9'));
{ const orig = sheets['テスト評価者B'].getRange; sheets['テスト評価者B'].getRange = () => { throw new Error('boom'); };
  roD = JSON.parse(G.doGet({ parameter: { action: 'roster' } }).s); sheets['テスト評価者B'].getRange = orig;
  ok('要約が読めなくても名簿は返す（done を付けない）', roD.ok === true && Array.isArray(roD.roster) && !('done' in roD)); }
post(APP.deleteReq({ id: 'fx-2' })); sheets['テスト評価者B'].d.splice(1); delete sheets['控え'];
r = post(APP.deleteReq({ id: 'fx-1', evaluator: 'テスト評価者' }));
ok('契約: deleteReq を doPost が受け付け行が消える', r.ok === true && r.id === 'fx-1' && r.deleted === fw.aspects.length && shC.d.length === 1);
ok('契約: 知らない操作は unknown action（アプリは古い GAS と判定）', (r = post({ action: 'rename', id: 'x' })).ok === false && r.error === 'unknown action' && APP.isUnsupportedOp(r) && APP.isUnsupportedOp({ ok: false, error: 'bad request' }));
ok('契約: record 無しの submit・id 無しの delete は別の誤り（古い GAS と取り違えない）', post({ action: 'submit' }).error === 'no record' && post({ action: 'delete' }).error === 'no id' && !APP.isUnsupportedOp(post({ action: 'delete' })));
// Z20-3: やり直しの記録は「やり直し元」列（15列目）に前回の記録IDを持つ＝シートで前回と見分けられる
ok('Z20-3 capabilities に submit.redoOf', ping.capabilities.includes('submit.redoOf'));
const redoRec = { ...appRec, id: 'rd-2', redoOf: 'rd-1 =x', evaluatee: 'テスト やり直し' };
r = post(APP.submitReq(redoRec));
const rdRows = shC.d.filter(x => x[0] === 'rd-2');
ok('Z20-3 見出しの15列目は やり直し元', shC.d[0][14] === 'やり直し元' && shC.d[0].length === 15);
ok('Z20-3 toPayload の redoOf が行の やり直し元 に入る（IDはサニタイズ＝数式にならない）', r.ok && rdRows.length === fw.aspects.length && rdRows.every(x => x[14] === 'rd-1 _x'));
r = post(APP.submitReq({ ...appRec, id: 'rd-3', evaluatee: 'テスト 通常' }));
ok('Z20-3 通常の記録の やり直し元 は空', shC.d.filter(x => x[0] === 'rd-3').every(x => x[14] === ''));
{ // 前の版（14列の見出し）で作った評価者タブ: 次の書き込みで O1 に見出しを足す・行は消さない
  const old = sheets['テスト評価者B']; old.d[0] = old.d[0].slice(0, 14); old.d.push(['old-1', '2026-09-20', 'テスト評価者B', 'テスト 旧行', '', '', fw.name, '', 3, '', 3, 3, '', '']);
  post(APP.submitReq({ ...appRec, id: 'rd-4', evaluator: 'テスト評価者B', redoOf: 'old-1' }));
  ok('Z20-3 14列の旧タブにも やり直し元 の見出しを足す・旧行は残る', old.d[0][14] === 'やり直し元' && old.d.some(x => x[0] === 'old-1') && old.d.filter(x => x[0] === 'rd-4').every(x => x[14] === 'old-1'));
}
// Z20-2: 集計タブ（全評価者タブを1本の式で並べる・今の農場・採否）。setup と、評価者タブが増えた時に GAS が作り直す
{
  const SM = sheets['集計（自動）'];
  const fData = () => SM.fx['3,1'] || '', fFarm = () => SM.fx['3,16'] || '', fUse = () => SM.fx['3,17'] || '';
  ok('Z20-2 setup で集計タブ（見出し2行目=評価者タブ15列＋今の農場・採否）', SM && SM.d[1].join() === ['記録ID', '評価日', '評価者', '被評価者', '農場', 'カテゴリ', '作業', '種目', 'スコア', 'コメント', '作業平均', 'セッション平均', '全体所感', '送信日時', 'やり直し元', '今の農場', '採否'].join() && SM.d[0][0] !== '記録ID');
  ok('Z20-2 A3 は空行を除く1本の式（評価者タブの A2:O を縦に並べる）', /^=LET\(d,\{.*\},IFERROR\(FILTER\(d,CHOOSECOLS\(d,1\)<>""\),""\)\)$/.test(fData()) && fData().includes("'テスト評価者'!A2:O") && fData().includes("'テスト評価者B'!A2:O"));
  ok('Z20-2 複製・控え・集計・受験者タブは式に入らない', !/のコピー|控え0924|[{;]'集計'!|[{;]'受験者'!|[{;]'農場一覧'!|[{;]'作業一覧'!|[{;]'集計（自動）'!/.test(fData()));
  ok('Z20-2 農場列の無い旧形式の名簿では 今の農場=記録時の農場', fFarm() === '=MAP(D3:D,E3:E,LAMBDA(n,e,IF(n="",,e)))');
  sheets['受験者'].d.length = 0;
  sheets['受験者'].getRange(1, 1, 3, 4).setValues([['農場', '被評価者', '作業1', '旧名'], ['テスト東', 'テスト Hoang Nam', '給餌', 'テスト Hoang Nam旧、テスト 旧名'], ['テスト西', 'テスト Nam', '給餌', '']]);
  post(APP.submitReq({ ...appRec, id: 'nw-1', evaluator: "テスト 新人's" }));   // 当日、新しい評価者が加わった
  ok('Z20-2 新しい評価者タブは自動で式に足す（タブ名の \' は二重に）', fData().includes("'テスト 新人''s'!A2:O") && fData().includes("'テスト評価者'!A2:O"));
  ok('Z20-2 今の農場=名前＋記録時の農場→名前→旧名は「、」区切りの完全一致（部分一致しない）', /^=MAP\(D3:D,E3:E,LAMBDA\(n,e,IF\(n="",,IFERROR\(INDEX\(FILTER\('受験者'!\$A\$2:\$A,'受験者'!\$B\$2:\$B=n,'受験者'!\$A\$2:\$A=e\),1\),XLOOKUP\(n,'受験者'!\$B\$2:\$B,'受験者'!\$A\$2:\$A,XLOOKUP\(TRUE,ARRAYFORMULA\(ISNUMBER\(FIND\("、"&n&"、"/.test(fFarm()) && fFarm().includes("REGEXREPLACE('受験者'!$D$2:$D&\"\"") && !/"\*"&/.test(fFarm()));
  ok('Z20-2 採否=やり直し元に書かれた記録IDの行は「やり直し前」', fUse().includes('COUNTIF(O3:O,"*"&id&"*")') && fUse().includes('やり直し前') && fUse().includes('採用'));
  const cols0 = sheets['受験者'].d[0].slice();
  sheets['受験者'].d[0] = ['メモ', ...cols0]; sheets['受験者'].d.slice(1).forEach(x => x.unshift(''));   // 列を1つずらす（並べ替えても読める）
  G.setup();
  ok('Z20-2 受験者タブの列を動かしても setup で式の列が追従', sheets['集計（自動）'].fx['3,16'].includes("'受験者'!$C$2:$C,'受験者'!$B$2:$B") && sheets['集計（自動）'].fx['3,16'].includes("REGEXREPLACE('受験者'!$E$2:$E"));
  sheets['受験者'].d[0] = cols0; sheets['受験者'].d.slice(1).forEach(x => x.shift());
  // 管理者が同じ名前で作った別タブは触らない（集計タブの台帳は sheetId）
  const keepSM = sheets['集計（自動）']; delete sheets['集計（自動）'];
  const mySM = ss.insertSheet('集計（自動）'); mySM.getRange(1, 1, 1, 2).setValues([['自分の表', 1]]);
  G.setup(); post(APP.submitReq({ ...appRec, id: 'nw-2', evaluator: 'テスト 新人2' }));
  ok('Z20-2 同じ名前の管理者のタブは上書きしない', mySM.d.length === 1 && mySM.d[0][0] === '自分の表' && !mySM.fx['3,1']);
  delete sheets['集計（自動）']; sheets['集計（自動）'] = keepSM;
}
// 名簿の初期データが無い時: 農場一覧は受験者タブにある農場（重複なし）＋所属未確定
Object.keys(sheets).forEach(k => delete sheets[k]);
const G3 = new Function('ROSTER_SEED', code + ';return {setup};')(undefined);
ss.insertSheet('受験者').getRange(1, 1, 4, 3).setValues([['農場', '被評価者', '作業1'], ['テスト東', 'テスト 甲', ''], ['所属未確定', 'テスト 乙', ''], ['テスト東', 'テスト 丙', '']]);
G3.setup();
ok('シード無し: 農場一覧=受験者タブの農場＋所属未確定（重複なし）', sheets['農場一覧'].d.map(r => r[0]).join() === '農場,テスト東,所属未確定' && sheets['受験者'].d.length === 4);
// 管理用の入口（合言葉は Seed.js にだけ置く想定。ここでは架空の値）
{
  const TOK = 'test-token-0123456789abcdef';
  const G4 = new Function('ROSTER_SEED', 'ADMIN_TOKEN', 'COMMON_SEED', code + ';return {doGet};')(undefined, TOK,
    [['テスト東', ['給餌', '消毒']], ['所属未確定', ['給餌']], ['テスト北', ['除フン']]]);
  const adm = t => JSON.parse(G4.doGet({ parameter: { action: 'admin', token: t } }).s);
  const G5 = new Function('ROSTER_SEED', code + ';return {doGet};')(undefined);
  ok('admin: 合言葉違い・空は拒否', adm('x').ok === false && adm('').ok === false && adm(TOK + 'x').error === 'forbidden');
  ok('admin: Seed.js に合言葉が無ければ常に拒否', JSON.parse(G5.doGet({ parameter: { action: 'admin', token: '' } }).s).error === 'forbidden');
  const n0 = sheets['受験者'].d.length;
  const r1 = adm(TOK);
  const rows = sheets['受験者'].d.filter(x => x[1] === '（農場共通）');
  ok('admin: setup を実行し、共通行が無い農場に追記', r1.ok && r1.setup === 'setup OK' && r1.commonAdded.join() === 'テスト東,所属未確定,テスト北' && sheets['受験者'].d.length === n0 + 3);
  const hd = sheets['受験者'].d[0], wc = hd.map((h, i) => /^作業\s*\d+$/.test(h) ? i : -1).filter(i => i >= 0);
  ok('admin: 共通行の作業は作業列へ（列が足りない分は入れない）', rows[0][0] === 'テスト東' && rows[0][wc[0]] === '給餌' && (wc.length > 1 ? rows[0][wc[1]] === '消毒' : !rows[0].includes('消毒')));
  const r2 = adm(TOK);
  ok('admin: 2回目は追記しない（既存の共通行を尊重）', r2.ok && r2.commonAdded.length === 0 && sheets['受験者'].d.length === n0 + 3);
  const n1 = sheets['受験者'].d.length, chk = JSON.parse(G4.doGet({ parameter: { action: 'admin', token: TOK, op: 'check' } }).s);
  ok('admin op=check: 読むだけ（受験者タブを変えない）で検算の形を返す', chk.ok && chk.check && sheets['受験者'].d.length === n1 && (chk.check.summary === 'none' || typeof chk.check.rows === 'number'));
  ok('admin op=check: 合言葉違いは拒否', JSON.parse(G4.doGet({ parameter: { action: 'admin', token: 'x', op: 'check' } }).s).error === 'forbidden');
  ok('admin: 人の行は変えない', sheets['受験者'].d.slice(1, n0).every(x => x[1] !== '（農場共通）'));
  // 2026-10-11 op=common: 既存の共通行を新しい作業（区分名）に置き換える。seed に無い農場の共通行・人の行は触らない
  const G6 = new Function('ROSTER_SEED', 'ADMIN_TOKEN', 'COMMON_SEED', code + ';return {doGet};')(undefined, TOK,
    [['テスト東', ['肥育舎']], ['所属未確定', []]]);
  const before = JSON.stringify(sheets['受験者'].d.filter(x => x[1] !== '（農場共通）'));
  const r6 = JSON.parse(G6.doGet({ parameter: { action: 'admin', token: TOK, op: 'common' } }).s);
  const crow = f => sheets['受験者'].d.find(x => x[1] === '（農場共通）' && x[0] === f);
  ok('admin op=common: 共通行の作業を置き換え（前の作業を返す）', r6.ok && r6.commonReplaced.length === 2 && r6.commonReplaced[0].before.join() === (wc.length > 1 ? '給餌,消毒' : '給餌') && crow('テスト東')[wc[0]] === '肥育舎' && wc.slice(1).every(i => crow('テスト東')[i] === ''));
  ok('admin op=common: 空の作業＝作業列を空に', wc.every(i => crow('所属未確定')[i] === ''));
  ok('admin op=common: seed に無い農場の共通行・人の行は触らない', crow('テスト北')[wc[0]] === '除フン' && JSON.stringify(sheets['受験者'].d.filter(x => x[1] !== '（農場共通）')) === before && sheets['受験者'].d.length === n1);
  sheets['受験者'].d.find(x => x[1] === '（農場共通）' && x[0] === 'テスト北')[1] = '【農場共通】';
  const G7 = new Function('ROSTER_SEED', 'ADMIN_TOKEN', 'COMMON_SEED', code + ';return {doGet};')(undefined, TOK, [['テスト北', ['子豚舎'].concat(new Array(9).fill('給餌'))]]);
  const n7 = sheets['受験者'].d.length, r7 = JSON.parse(G7.doGet({ parameter: { action: 'admin', token: TOK, op: 'common' } }).s);
  ok('admin op=common: 括弧の違う【農場共通】行も置き換え（2行目を足さない）・入らない作業は cut で返す', r7.ok && r7.commonReplaced.length === 1 && r7.commonAdded.length === 0 && sheets['受験者'].d.length === n7 && sheets['受験者'].d.find(x => x[1] === '【農場共通】')[wc[0]] === '子豚舎' && r7.commonReplaced[0].cut.length === 10 - wc.length);
  ok('admin op=common: 合言葉違いは拒否', JSON.parse(G6.doGet({ parameter: { action: 'admin', token: 'x', op: 'common' } }).s).error === 'forbidden');
}
// 2026-10-06a: 合言葉（APP_TOKEN）・削除ログ・空欄を0点にしない
{
  const AT = 'app-token-xyz-12345';
  Object.keys(sheets).forEach(k => delete sheets[k]);
  Object.keys(docProps).forEach(k => delete docProps[k]);
  const G6 = new Function('ROSTER_SEED', 'APP_TOKEN', code + ';return {setup,doGet,doPost};')(SEED, AT);
  G6.setup();
  const get6 = p => JSON.parse(G6.doGet({ parameter: p }).s), post6 = o => JSON.parse(G6.doPost({ postData: { contents: JSON.stringify(o) } }).s);
  ok('auth: 合言葉なし・違いの roster は拒否（名簿を返さない）', get6({ action: 'roster' }).error === 'auth' && !get6({ action: 'roster', k: 'x' }).roster && get6({ action: 'roster', k: AT }).ok === true);
  ok('auth: ping は合言葉なしで版だけ', get6({ action: 'ping' }).ok === true && !get6({ action: 'ping' }).roster && get6({ action: 'ping' }).capabilities.includes('auth'));
  const r6 = { ...APP.submitReq(appRec), k: AT };
  ok('auth: 合言葉なしの submit・delete は拒否し、シートを変えない', post6({ ...r6, k: '' }).error === 'auth' && !sheets['テスト評価者'] && post6({ action: 'delete', id: appRec.id }).error === 'auth');
  ok('auth: 合言葉つきの submit は書き込む', post6(r6).ok === true && sheets['テスト評価者'].d.length > 1);
  const n6 = sheets['テスト評価者'].d.length - 1;
  post6(r6);   // 同じ内容の再送（電波が悪く何度も送る）
  ok('dellog: 同じ内容の再送は削除ログに残さない（膨らませない）', !sheets['削除ログ']);
  const r6b = JSON.parse(JSON.stringify(r6)); r6b.record.works[0].items[0].score = 5;
  post6(r6b);   // 編集して送り直し（上書き）
  ok('dellog: 上書きで変わった行（点を直した1行）だけ「削除ログ」へ（理由=上書き・元のタブ・記録ID・前の点）', sheets['削除ログ'] && sheets['削除ログ'].d.length === 2 && sheets['削除ログ'].d[1][1] === '上書き' && sheets['削除ログ'].d[1][2] === 'テスト評価者' && sheets['削除ログ'].d[1][3] === appRec.id && sheets['削除ログ'].d[1][11] === r6.record.works[0].items[0].score);
  const nLog = sheets['削除ログ'].d.length;
  ok('dellog: 評価者名が「削除ログ」でも予約名のタブに書かない', post6({ ...r6, record: { ...r6.record, id: 'dl-name', evaluator: '削除ログ' } }).ok && sheets['評価者_削除ログ'] && sheets['削除ログ'].d.length === nLog && sheets['削除ログ'].d.every((r, i) => i === 0 || r.length === 18));
  ok('dellog: 数式に見える文字（コメント =cmd）は削除ログでも文字のまま（先頭に \'）', sheets['削除ログ'].d.slice(1).some(r => r[12] === "'=cmd") && sheets['削除ログ'].d.slice(1).every(r => r.every(c => typeof c !== 'string' || !/^[=+\-@]/.test(c))));
  ok('dellog: 削除でも控えてから消す', post6({ action: 'delete', id: appRec.id, k: AT }).deleted === n6 && sheets['削除ログ'].d.length === nLog + n6 && sheets['削除ログ'].d.slice(-1)[0][1] === '削除' && sheets['テスト評価者'].d.length === 1);
  ok('dellog: 削除ログは評価者タブ・集計に入らない', !(G6.setup(), JSON.stringify(sheets['集計（自動）'] ? sheets['集計（自動）'].fx : {})).includes("'削除ログ'"));
  const pl = APP.toPayload({ ...appRec, id: 'nul-1' }); pl.works[0].items[0].score = null; pl.works[0].items[1].score = '';
  post6({ action: 'submit', record: pl, k: AT });
  const rr = sheets['テスト評価者'].d.filter(r => r[0] === 'nul-1'), sc = pl.works[0].items.slice(2).map(i => i.score);
  const ex = Math.round(sc.reduce((a, b) => a + b, 0) / sc.length * 100) / 100;
  // 版: 新しい版がシートにあれば古い版で上書きしない
  const v1 = { action: 'submit', k: AT, record: { ...APP.toPayload({ ...appRec, id: 'ver-1' }), ver: '2026-10-06T10:00:00Z' } };
  const v2 = JSON.parse(JSON.stringify(v1)); v2.record.ver = '2026-10-06T11:00:00Z'; v2.record.works[0].items[0].score = 5;
  post6(v2);
  const rs = post6(v1);   // 古いバックアップの版が後から届く
  ok('ver: 古い版は上書きせず stale を返す（シートは新しい版のまま）', rs.ok && rs.stale === true && sheets['テスト評価者'].d.find(r => r[0] === 'ver-1' && r[7] === v2.record.works[0].items[0].aspect)[8] === 5);
  ok('ver: 版の無い（前の版のアプリの）送信は従来どおり書く', post6({ action: 'submit', k: AT, record: APP.toPayload({ ...appRec, id: 'ver-2' }) }).rows > 0);
  post6({ action: 'delete', id: 'ver-1', k: AT });
  ok('ver: 削除すると墓標が残り、遅れて届いた同じ記録の送信で行を生き返らせない', docProps['v:ver-1'] === '~del' && post6(v2).stale === 'deleted' && !sheets['テスト評価者'].d.some(r => r[0] === 'ver-1'));
  // 二重採点の検知: 別の記録が同じ人・同じ作業
  const d1 = post6({ action: 'submit', k: AT, record: { ...APP.toPayload({ ...appRec, id: 'dup-a' }), ver: 'a' } });
  const d2 = post6({ action: 'submit', k: AT, record: { ...APP.toPayload({ ...appRec, id: 'dup-b' }), ver: 'b' } });
  const d3 = post6({ action: 'submit', k: AT, record: { ...APP.toPayload({ ...appRec, id: 'dup-c', redoOf: 'dup-a dup-b ver-2 nul-1 dl-name' }), ver: 'c' } });
  ok('dups: 別の記録が同じ人・同じ作業 → 作業名を返す（やり直しは数えない）', d1.dups.length === 1 && d2.dups.includes(appRec.works[0].workName) && d3.dups.length === 0);
  const far = post6({ action: 'submit', k: AT, record: { ...APP.toPayload({ ...appRec, id: 'dup-far', date: '2026-07-01' }), ver: 'f' } });
  ok('dups: 前後14日より離れた日の記録（前回の試験・練習）は二重採点にしない', far.dups.length === 0);
  const sp = post6({ action: 'submit', k: AT, record: { ...APP.toPayload({ ...appRec, id: 'dup-sp', evaluatee: appRec.evaluatee.replace(' ', '\u3000'), farm: appRec.farm + ' ' }), ver: 'g' } });
  ok('dups: 全角空白・末尾の空白のゆれでも同じ人として検知', sp.dups.length === 1);
  const rv = JSON.parse(JSON.stringify(v2)); rv.record.revive = true; rv.record.rv = '2026-10-06T12:00:00Z';
  const rvr = post6(rv);
  ok('revive: 削除より後に戻した記録（revive＋rv）は書き戻し、墓標を外す', rvr.rows > 0 && !rvr.stale && !/^~del/.test(docProps['v:ver-1'] || '') && sheets['テスト評価者'].d.some(r => r[0] === 'ver-1'));
  // 戻した直後に削除 → 戻しの送信が遅れて届いても生き返らない（削除が rv を持つ）
  post6({ action: 'delete', id: 'ver-1', k: AT, rv: rv.record.rv });
  ok('revive: 戻しの送信が削除の後に遅れて届いても生き返らない', post6(rv).stale === 'deleted' && !sheets['テスト評価者'].d.some(r => r[0] === 'ver-1'));
  const rv2 = JSON.parse(JSON.stringify(rv)); rv2.record.rv = '2026-10-06T13:00:00Z';
  ok('revive: その後にもう一度戻した（新しい rv）時は書き戻す', post6(rv2).rows > 0);
  post6({ action: 'delete', id: 'ver-1', k: AT, rv: rv2.record.rv });
  post6({ action: 'delete', id: 'ver-1', k: AT });   // 古い削除（合図なし）が後から届く
  ok('revive: 合図は消えない（古い削除が後から届いても、殺した合図の戻しは通さない）', post6(rv2).stale === 'deleted' && post6(rv).stale === 'deleted' && docProps['d:ver-1'].split(',').length >= 2);
  const rv3 = JSON.parse(JSON.stringify(rv)); rv3.record.rv = 'tok-new-1'; rv3.record.rvAt = '2026-10-06T14:00:00Z';
  ok('revive: 時刻でなく合図で判定（新しい合図は、端末の時計に関係なく通る）', post6(rv3).rows > 0);
  const sd = post6({ action: 'delete', id: 'ver-1', k: AT, at: '2026-10-06T13:59:00Z' });   // 戻すより前に出された削除（合図なし）が、戻した後に遅れて届く
  ok('revive: 戻すより前に出された削除が遅れて届いても、戻した行を消さない', sd.staleDelete === true && sd.deleted === 0 && sheets['テスト評価者'].d.some(r => r[0] === 'ver-1'));
  const od = post6({ action: 'delete', id: 'ver-1', k: AT, at: '2026-10-06T15:00:00Z' });   // 戻した後に、合図を知らない別の端末が削除
  ok('revive: 戻した後に出された削除は、合図が無くても（別の端末でも）消す', od.deleted > 0 && !od.staleDelete && !sheets['テスト評価者'].d.some(r => r[0] === 'ver-1'));
  const rv4 = JSON.parse(JSON.stringify(rv3)); rv4.record.rv = 'tok-new-2'; rv4.record.rvAt = '2026-10-06T16:00:00Z'; post6(rv4);
  ok('revive: 戻した合図を持つ削除は消す', post6({ action: 'delete', id: 'ver-1', k: AT, rv: 'tok-new-2', at: '2026-10-06T16:30:00Z' }).deleted > 0 && !sheets['テスト評価者'].d.some(r => r[0] === 'ver-1'));
  const nv = JSON.parse(JSON.stringify(rv2)); nv.record.ver = ''; nv.record.id = 'nover-1';
  post6({ action: 'delete', id: 'nover-1', k: AT }); post6(nv);
  ok('revive: 版の無い送信でも、書いたら墓標を外す（以後の編集が黙って捨てられない）', !('v:nover-1' in docProps));
  ok('avg: 空欄（null/空文字）を0点として平均に入れない', rr[0][8] === '' && rr[1][8] === '' && rr[0][10] === ex);
}
// 2026-10-07 マルチテナント: 合言葉はスクリプトプロパティ（農場ごとの GAS）・総当たり対策・別農場の合言葉では読み書きできない
{
  const origPS = global.PropertiesService;
  const mk = (props, cache) => {
    global.PropertiesService = { getDocumentProperties: origPS.getDocumentProperties, getScriptProperties: () => ({ getProperty: k => props[k] || null }) };
    global.CacheService = { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) };
    return new Function('ROSTER_SEED', code + ';return {setup,doGet,doPost};')(SEED);   // Seed.js の APP_TOKEN は無し＝プロパティだけで動く
  };
  const callG = (G, props, cache) => ({ get: p => { mk(props, cache); return JSON.parse(G.doGet({ parameter: p }).s); }, post: o => { mk(props, cache); return JSON.parse(G.doPost({ postData: { contents: JSON.stringify(o) } }).s); } });
  const propsA = { APP_TOKEN: 'farmA-token-1234567890', ADMIN_TOKEN: 'farmA-admin-token-1234567890abcd' }, cacheA = {};
  const propsB = { APP_TOKEN: 'farmB-token-0987654321', ADMIN_TOKEN: 'farmB-admin-token-0987654321abcd' }, cacheB = {};
  Object.keys(sheets).forEach(k => delete sheets[k]); Object.keys(docProps).forEach(k => delete docProps[k]);
  const GA = mk(propsA, cacheA); GA.setup();
  const A = callG(GA, propsA, cacheA), B = callG(GA, propsB, cacheB);   // B = 別農場の GAS（コードは同じ・プロパティとキャッシュが別）
  ok('tenant: スクリプトプロパティの合言葉だけで roster が守られる（Seed.js 無し）', A.get({ action: 'roster' }).error === 'auth' && A.get({ action: 'roster', k: propsA.APP_TOKEN }).ok === true);
  ok('tenant: 別農場の合言葉では読めない・書けない', A.get({ action: 'roster', k: propsB.APP_TOKEN }).error === 'auth' && A.post({ action: 'submit', k: propsB.APP_TOKEN, record: APP.toPayload({ ...appRec, id: 'x-b' }) }).error === 'auth' && !sheets['テスト評価者']);
  ok('tenant: 別農場の管理トークンでは admin に入れない', JSON.parse(GA.doGet({ parameter: { action: 'admin', token: propsB.ADMIN_TOKEN } }).s).error === 'forbidden');
  let last; for (let i = 0; i < 40; i++) last = A.get({ action: 'roster', k: 'guess' + i });
  ok('tenant: 間違いが続いても間違いは拒否のまま', last.error === 'auth');
  ok('tenant: 40回間違えた後でも正しい合言葉は通る（全体ロックなし＝締め出し不可）', A.get({ action: 'roster', k: propsA.APP_TOKEN }).ok === true && A.post({ action: 'submit', k: propsA.APP_TOKEN, record: APP.toPayload({ ...appRec, id: 'x-a' }) }).ok === true && (mk(propsA, cacheA), JSON.parse(GA.doGet({ parameter: { action: 'admin', token: propsA.ADMIN_TOKEN, op: 'check' } }).s).ok === true));
  ok('tenant: 間違いの件数は管理入口 op=check の authFails で見える', (mk(propsA, cacheA), JSON.parse(GA.doGet({ parameter: { action: 'admin', token: propsA.ADMIN_TOKEN, op: 'check' } }).s).authFails >= 40));
  const shortP = { APP_TOKEN: 'short-12345', ADMIN_TOKEN: 'short-admin-1234567890' }, S = callG(GA, shortP, {});
  ok('tenant: プロパティ由来の短い APP_TOKEN（16字未満）は全拒否（合言葉なしで開かない）', S.get({ action: 'roster', k: 'short-12345' }).error === 'auth' && S.get({ action: 'roster' }).error === 'auth');
  ok('tenant: プロパティ由来の短い ADMIN_TOKEN（24字未満）は管理入口を開かない', (mk(shortP, {}), JSON.parse(GA.doGet({ parameter: { action: 'admin', token: shortP.ADMIN_TOKEN } }).s).error === 'forbidden'));
  ok('tenant: 別農場の GAS は無関係に通る', B.get({ action: 'roster', k: propsB.APP_TOKEN }).ok === true);
  ok('tenant: ping は合言葉なしで版だけ返す（入口は変えない）', A.get({ action: 'ping' }).ok === true);
  global.PropertiesService = origPS; delete global.CacheService;
}
// 2026-10-07 テナント版（TENANT_MODE=true）の fail-closed: プロパティの入れ忘れ・例外・短い値は、Seed.js の値があっても全拒否
{
  const origPS = global.PropertiesService, tcode = code.replace('const TENANT_MODE = false;', 'const TENANT_MODE = true;');
  ok('tenantmode: ビルド元の Code.gs は既定 false（ヒラノ版）で、置換先の行が存在する', /const TENANT_MODE = false;/.test(code) && /const TENANT_MODE = true;/.test(tcode));
  Object.keys(sheets).forEach(k => delete sheets[k]); Object.keys(docProps).forEach(k => delete docProps[k]);
  const mkT = (props, seed) => {
    global.PropertiesService = { getDocumentProperties: origPS.getDocumentProperties, getScriptProperties: () => { if (props === 'throw') throw new Error('props unavailable'); return { getProperty: k => (props || {})[k] || null }; } };
    return new Function('ROSTER_SEED', 'APP_TOKEN', 'ADMIN_TOKEN', 'COMMON_SEED', tcode + ';return {setup,doGet,doPost};')(SEED, seed && seed.APP, seed && seed.ADMIN, undefined);
  };
  const g = (G, p) => JSON.parse(G.doGet({ parameter: p }).s), po = (G, o) => JSON.parse(G.doPost({ postData: { contents: JSON.stringify(o) } }).s);
  const rec = APP.submitReq({ ...appRec, id: 'tm-1' });
  { const G = mkT({}, null); ok('tenantmode: プロパティ未設定（Seed も無し）は roster も submit も全拒否', g(G, { action: 'roster' }).error === 'auth' && g(G, { action: 'roster', k: '' }).error === 'auth' && po(G, rec).error === 'auth' && !sheets['テスト評価者']); }
  { const G = mkT({ ADMIN_TOKEN: 'farmT-admin-token-1234567890abcd' }, null); ok('tenantmode: ADMIN_TOKEN だけ入れて APP_TOKEN を入れ忘れても roster は全拒否', g(G, { action: 'roster' }).error === 'auth'); }
  { const G = mkT('throw', null); ok('tenantmode: getScriptProperties が例外でも全拒否（開かない）', g(G, { action: 'roster' }).error === 'auth' && po(G, rec).error === 'auth'); }
  { const G = mkT({}, { APP: 'seed-app-token-12345', ADMIN: 'seed-admin-token-1234567890' }); ok('tenantmode: プロパティが無ければ Seed.js の値があっても使わない（合言葉を知っていても拒否）', g(G, { action: 'roster', k: 'seed-app-token-12345' }).error === 'auth'); }
  { const G = mkT({ APP_TOKEN: 'short-12345', ADMIN_TOKEN: 'short-admin' }, null); ok('tenantmode: 短いプロパティ（APP16未満）は全拒否・管理入口も拒否', g(G, { action: 'roster', k: 'short-12345' }).error === 'auth' && g(G, { action: 'admin', token: 'short-admin' }).error === 'forbidden'); }
  { const G = mkT({}, { APP: 'seed-app-token-12345', ADMIN: 'seed-admin-token-1234567890' }); ok('tenantmode: プロパティ未設定では管理入口も拒否（Seed の ADMIN_TOKEN でも）', g(G, { action: 'admin', token: 'seed-admin-token-1234567890' }).error === 'forbidden'); }
  { const P = { APP_TOKEN: 'farmT-app-token-1234567890', ADMIN_TOKEN: 'farmT-admin-token-1234567890abcd' }; const G = mkT(P, null);
    ok('tenantmode: 正しいプロパティ（16/24字以上）なら通る', (G.setup(), g(G, { action: 'roster', k: P.APP_TOKEN }).ok === true) && po(G, { ...rec, k: P.APP_TOKEN }).ok === true);
    ok('tenantmode: ping は合言葉なしのまま', g(G, { action: 'ping' }).ok === true); }
  // ヒラノ版（TENANT_MODE=false・Seed の値あり・プロパティ無し）は従来どおり
  { global.PropertiesService = origPS; const G = new Function('ROSTER_SEED', 'APP_TOKEN', code + ';return {setup,doGet};')(SEED, 'seed-app-token-12345'); G.setup();
    ok('tenantmode: ヒラノ版（既定 false）は Seed の合言葉で従来どおり通り、無ければ拒否', g(G, { action: 'roster', k: 'seed-app-token-12345' }).ok === true && g(G, { action: 'roster' }).error === 'auth'); }
  global.PropertiesService = origPS;
}
// ==== 2026-11-04 種目タブ（R1）・受験者別（R2）・農場別（R3）・日付書式（R4） ====
{
  const TOKR = 'test-token-0123456789abcdef';
  const W = APP.WORKDATA_V2, wn = i => W.works[i].name;
  const reset = () => { Object.keys(sheets).forEach(k => delete sheets[k]); Object.keys(docProps).forEach(k => delete docProps[k]); };
  const mkG = (c2) => new Function('ROSTER_SEED', 'ADMIN_TOKEN', (c2 || code) + ';return {setup,doGet,doPost,buildPersonTables_,readAspectOverrides_,personOf_,rosterPeople_,onOpen};')(undefined, TOKR);
  reset();
  const GR = mkG();
  const getR = p => JSON.parse(GR.doGet({ parameter: p }).s), postR = o => JSON.parse(GR.doPost({ postData: { contents: JSON.stringify(o) } }).s);
  const admR = op => getR({ action: 'admin', token: TOKR, op });
  const rosterR = () => getR({ action: 'roster' });
  ok('R1 capabilities に roster.aspects・summary.persons（既存の機能は残す）', (() => { const c = getR({ action: 'ping' }).capabilities; return c.includes('roster.aspects') && c.includes('summary.persons') && APP.GAS_REQUIRED_CAPS.every(x => c.includes(x)); })());
  // --- R1 種目タブ ---
  GR.setup();
  const AS = sheets['種目'];
  const catRows = []; W.works.forEach(w => w.aspects.forEach(a => catRows.push([w.no || '', w.name, w.id, a.id, a.name, a.kanten || '', ...a.levels.slice(0, 5), false])));
  ok('R1 setup: 種目タブ=見出し1行+245行・A〜D がカタログ・L 列は FALSE', AS && AS.d.length === 246 && catRows.length === 245 && AS.d[0].slice(0, 12).join() === '作業No,作業名,作業ID,種目ID,種目名,観点,Lv1,Lv2,Lv3,Lv4,Lv5,反映'
    && AS.d.slice(1).every((r, i) => r.slice(0, 4).join('\u0001') === catRows[i].slice(0, 4).join('\u0001') && r[11] === false) && AS.d.slice(1).every((r, i) => r.slice(4, 11).join('\u0001') === catRows[i].slice(4, 11).join('\u0001')));
  ok('R1 種目タブ: 反映列はチェックボックス・A〜D は警告つき保護（再実行で増えない）・E1 に使い方', AS.dv[12] && AS.dv[12].checkbox === true && (GR.setup(), AS.prot.length === 1) && AS.prot[0].warn === true && /反映にチェック/.test(AS.notes['1,5'] || ''));
  ok('R1 roster: 何も反映していなければ aspects は []', Array.isArray(rosterR().aspects) && rosterR().aspects.length === 0);
  const rowOf = (w, a) => AS.d.findIndex((r, i) => i > 0 && r[2] === w && r[3] === a);
  const w0 = W.works.find(w => w.id === 'feeding-daily'), a0 = w0.aspects[0], a1 = w0.aspects[1], a2 = w0.aspects[2], a3 = w0.aspects[3], a4 = w0.aspects[4];
  let i0 = rowOf(w0.id, a0.id); AS.d[i0][4] = '  テスト新種目名  '; AS.d[i0][7] = 'テスト新Lv2'; AS.d[i0][10] = 'テスト新Lv5\n二行目'; AS.d[i0][11] = true;
  let i1 = rowOf(w0.id, a1.id); AS.d[i1][5] = 'テスト新観点'; AS.d[i1][11] = true;
  let ro1 = rosterR(), e0 = (ro1.aspects || []).find(x => x.w === w0.id && x.a === a0.id), e1 = (ro1.aspects || []).find(x => x.w === w0.id && x.a === a1.id);
  ok('R1 roster: 反映=TRUE かつ原文と違う欄だけ aspects に載る（lv は長さ5・未変更は空文字）', ro1.aspects.length === 2 && e0 && e0.name === 'テスト新種目名' && !('kanten' in e0) && Array.isArray(e0.lv) && e0.lv.length === 5
    && e0.lv.join('|') === ['', 'テスト新Lv2', '', '', 'テスト新Lv5\n二行目'].join('|') && e1 && e1.kanten === 'テスト新観点' && !('name' in e1) && !('lv' in e1) && Object.keys(e1).sort().join() === 'a,kanten,w');
  // 反映 FALSE・空欄・原文と同じ・空白だけ・文字列 "TRUE"・知らない ID は載らない
  AS.d[i0][11] = false; AS.d[i1][11] = false;
  const i2 = rowOf(w0.id, a2.id), i3 = rowOf(w0.id, a3.id), i4 = rowOf(w0.id, a4.id);
  AS.d[rowOf(w0.id, a0.id)][4] = 'FALSEの行の新名';                                               // 反映=FALSE
  AS.d[i2][4] = ''; AS.d[i2][5] = ''; AS.d[i2][11] = true;                                          // 空欄
  AS.d[i3][4] = ' ' + a3.name + ' '; AS.d[i3][6] = a3.levels[0]; AS.d[i3][11] = true;              // 原文と同じ（前後空白だけ違う）
  AS.d[i4][4] = '\u3000\u3000'; AS.d[i4][5] = '   '; AS.d[i4][11] = true;                           // 全角空白だけ
  const wB = W.works[1], iB = rowOf(wB.id, wB.aspects[0].id); AS.d[iB][4] = '文字列TRUEの新名'; AS.d[iB][11] = 'TRUE';   // 文字列は採用しない
  AS.d.push(['', '存在しない', 'no-such-work', 'no-such-aspect', 'ID違いの新名', '', '', '', '', '', '', true]);   // カタログに無い行
  const iC = rowOf(wB.id, wB.aspects[1].id); const idBak = AS.d[iC][3]; AS.d[iC][3] = 'x-' + idBak; AS.d[iC][4] = '種目IDを書き換えた行'; AS.d[iC][11] = true;   // キーを手で書き換えた行
  ok('R1 roster: 反映=FALSE の行・空欄・原文と同じ欄は載らない', (() => { const r = rosterR(); return Array.isArray(r.aspects) && r.aspects.length === 0; })());
  ok('R1 roster: 全角空白だけ・文字列 "TRUE"・知らないID・書き換えたキーの行は載らない（反映は真偽値のチェックだけ）', JSON.stringify(rosterR().aspects) === '[]');
  AS.d[iC][3] = idBak; AS.d.pop();
  // 制御文字の除去・長さ上限・数式やタグはそのまま文字
  AS.d[i3][4] = 'a\u0001b\u0007c'; AS.d[i3][5] = 'k'.repeat(5000); AS.d[i3][6] = '<img src=x onerror=alert(1)>'; AS.d[i3][7] = '=HYPERLINK("x")'; AS.d[i3][11] = true;
  AS.d[i2][4] = 'n'.repeat(500); AS.d[i2][11] = true;
  const ro2 = rosterR(), e3 = ro2.aspects.find(x => x.a === a3.id), e2 = ro2.aspects.find(x => x.a === a2.id);
  ok('R1 roster: 制御文字を除き・長さ上限（name120/kanten600/lv600）で切り・タグや式はそのまま文字として返す', e3 && e3.name === 'abc' && e3.kanten.length === 600 && e3.lv[0] === '<img src=x onerror=alert(1)>' && e3.lv[1] === '=HYPERLINK("x")' && e2 && e2.name.length === 120);
  ok('R1 roster: 同じ種目が2行あっても1回だけ・数は種目数以下', (() => { const dupRow = AS.d[i3].slice(); AS.d.push(dupRow); const r = rosterR(); AS.d.pop(); return r.aspects.filter(x => x.a === a3.id && x.w === w0.id).length === 1 && r.aspects.length <= 245; })());
  { // 種目タブの読み取りで例外 → aspects を付けない（done と同じ扱い）・名簿は返す。タブが無ければ aspects: []
    const keep = AS.getRange; AS.getRange = () => { throw new Error('boom'); };
    const r = rosterR(); AS.getRange = keep;
    const keepT = sheets['種目']; delete sheets['種目']; const r2 = rosterR(); sheets['種目'] = keepT;
    ok('R1 roster: 種目タブが読めなければ aspects を付けない・タブが無ければ aspects は []', r.ok === true && Array.isArray(r.roster) && !('aspects' in r) && Array.isArray(r2.aspects) && r2.aspects.length === 0);
  }
  // 反映を元に戻す（編集は残す）→ setup 再実行で編集済みの行は上書きしない・消した行は末尾に戻る
  AS.d.forEach((r, i) => { if (i) r[11] = false; });
  AS.d[i0][4] = '社長が直した名前'; AS.d[i0][11] = true;
  const removed = AS.d.splice(rowOf(W.works[2].id, W.works[2].aspects[0].id), 1)[0];
  AS.d.push(['', 'メモ行', 'memo-w', 'memo-a', 'カタログに無い行', '', '', '', '', '', '', false]);
  GR.setup();
  ok('R1 setup 再実行: 編集済みの行を上書きせず、無い種目だけ末尾に追記', AS.d.length === 246 + 1 && AS.d[rowOf(w0.id, a0.id)][4] === '社長が直した名前' && AS.d[rowOf(w0.id, a0.id)][11] === true
    && AS.d[AS.d.length - 1].slice(2, 4).join() === removed.slice(2, 4).join() && AS.d[AS.d.length - 1][4] === removed[4] && AS.d[AS.d.length - 1][11] === false && AS.d.some(r => r[2] === 'memo-w'));
  AS.d.splice(AS.d.findIndex(r => r[2] === 'memo-w'), 1);
  { // 回帰: カタログ改訂後、触っていない欄（初期値のまま）は「上書き」として配らない・Date/数値の自動変換は無視
    const iR = rowOf(w0.id, a0.id), keep = AS.d[iR].slice();
    a0.levels.slice(0, 5).forEach((t, k) => { AS.d[iR][6 + k] = t; });
    AS.d[iR][5] = '改訂前の旧観点文';  AS.d[iR][12] = JSON.stringify([a0.name, '改訂前の旧観点文'].concat(a0.levels.slice(0, 5)));   // 旧カタログで書かれた行（今のカタログは別の文）
    AS.d[iR][4] = '直した名前'; AS.d[iR][11] = true;
    const r1 = rosterR().aspects.find(x => x.w === w0.id && x.a === a0.id);
    AS.d[iR][4] = a0.name; AS.d[iR][5] = new Date(2026, 2, 8); AS.d[iR][6] = 5; AS.d[iR][11] = true;
    const r2 = rosterR().aspects.find(x => x.w === w0.id && x.a === a0.id);
    ok('R1 回帰: 初期値のままの欄はカタログ改訂後も配らない・Date/数値は無視', r1 && r1.name === '直した名前' && !('kanten' in r1) && !r2);
    AS.d[iR] = keep;
  }
  // 契約: applyAspectOverrides → toPayload → 本物の doPost
  {
    const ov = rosterR().aspects;
    const can = typeof APP.applyAspectOverrides === 'function';
    let pay = null, rr = null, rows = [];
    if (can) {
      APP.applyAspectOverrides(ov);
      const fw0 = W.works.find(w => w.id === 'feeding-daily');
      pay = APP.submitReq({ id: 'ov-1', date: '2026-10-01', evaluator: 'テスト上書き評価者', evaluatee: 'テスト 上書き', farm: 'テスト農場', overall: '', createdAt: '2026-10-01T00:00:00Z',
        works: [{ workId: fw0.id, workName: fw0.name, category: fw0.category, scores: Object.fromEntries(fw0.aspects.map((a, i) => [a.id, i + 1])), comments: {} }] });
      rr = postR(pay);
      rows = sheets['テスト上書き評価者'] ? sheets['テスト上書き評価者'].d.slice(1).map(r => r[7]) : [];
      APP.applyAspectOverrides([]);   // 後続のために原文へ戻す
    }
    ok('R1 契約: applyAspectOverrides 後の toPayload を doPost に通すと 種目列が上書き後の名前', can && rr && rr.ok === true && rows[0] === '社長が直した名前' && rows.length === 5 && rows[1] === W.works.find(w => w.id === 'feeding-daily').aspects[1].name);
  }

  // --- R2/R3 受験者別・農場別 ---
  reset();
  const GP = mkG();
  const getP = p => JSON.parse(GP.doGet({ parameter: p }).s), postP = o => JSON.parse(GP.doPost({ postData: { contents: JSON.stringify(o) } }).s);
  GP.setup();
  const PT = () => sheets['受験者別（自動）'], FT = () => sheets['農場別（自動）'];
  ok('R2 setup で受験者別（自動）・農場別（自動）ができる（名簿が空でも落ちない・説明＋更新日時の行と見出し行）', PT() && FT() && /更新 \d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(PT().d[0][0]) && PT().d[1].slice(0, 8).join() === '農場,被評価者,予定作業数,採点済み数,未採点の作業,予定外の作業,全体平均,最終評価日' && FT().d[1].join() === '農場,受験者数,全作業済み,一部済み,未採点,平均,採点済み/予定');
  const preset = W.presets.find(p => p.id === 'farrowing-house'), pn = id => W.works.find(w => w.id === id).name;
  const outW = W.works.find(w => !preset.works.includes(w.id) && w.id !== W.works[0].id && w.id !== W.works[1].id);
  const rsx = sheets['受験者'], hdr = rsx.d[0];
  ok('R2 前提: 受験者タブの見出し', hdr.join() === '農場,被評価者,作業1,作業2,作業3,作業4,作業5,作業6,作業7,作業8,旧名');
  const pr = (farm, name, works, alias) => { const r = [farm, name]; for (let i = 0; i < 8; i++) r.push((works || [])[i] || ''); r.push(alias || ''); return r; };
  sheets['農場一覧'].d.length = 0; sheets['農場一覧'].getRange(1, 1, 5, 1).setValues([['農場'], ['テスト東'], ['テスト西'], ['テスト北'], ['所属未確定']]);
  rsx.getRange(2, 1, 11, 11).setValues([
    pr('テスト東', 'テスト Hoang Nam', [wn(0), wn(1)], 'テスト 旧名'),
    pr('テスト西', 'テスト Nam', [wn(0)]),
    pr('テスト東', 'テスト 区分', ['分娩舎']),
    pr('テスト東', 'テスト 不明', [wn(2), '存在しない作業']),
    pr('テスト北', '（農場共通）', [wn(3), wn(4)]),
    pr('テスト北', 'テスト 共通人', []),
    pr('テスト東', 'テスト 同名', [wn(0)]),
    pr('テスト西', 'テスト 同名', [wn(1)]),
    pr('テスト西', 'テスト 確定', [wn(0)]),
    pr('テスト東', 'テスト 無採点', [wn(0)]),
    pr('', '   ', [wn(0)]),   // 空名は除く
  ]);
  const rc = (id, ev, name, farm, date, works, redoOf) => ({ action: 'submit', record: { id, date, evaluator: ev, evaluatee: name, farm, overall: '', redoOf: redoOf || '',
    works: works.map(([wname, scs]) => ({ workName: wname, category: 'テスト', items: scs.map((s, i) => ({ aspect: '種目' + (i + 1), score: s, comment: '' })) })) } });
  postP(rc('r-1', 'EV-A', 'テスト Hoang Nam', 'テスト東', '2026-10-01', [[wn(0), [2, 2]], [wn(1), [3, 3]]]));
  postP(rc('r-2', 'EV-B', 'テスト Hoang Nam', 'テスト東', '2026-10-03', [[wn(0), [4, 4]], [wn(1), [5, 3]]], 'r-1'));   // やり直し（別の評価者タブ）
  postP(rc('r-3', 'EV-A', 'テスト 旧名', 'テスト東', '2026-10-04', [[wn(0), [5]]]));                                 // 旧名で保存
  postP(rc('r-4', 'EV-B', 'テスト Nam', 'テスト西', '2026-10-02', [[wn(0), [3, 4]]]));
  postP(rc('r-5', 'EV-A', 'テスト 区分', 'テスト東', '2026-10-05', [[pn('feeding-daily'), [5]], [pn('castration'), [1]], [outW.name, [2]]]));
  postP(rc('r-6', 'EV-B', 'テスト 不明', 'テスト東', '2026-10-05', [[wn(2), [4]]]));
  postP(rc('r-7', 'EV-A', 'テスト 共通人', 'テスト北', '2026-10-06', [[wn(3), [4]]]));
  postP(rc('r-8', 'EV-B', 'テスト 同名', 'テスト西', '2026-10-06', [[wn(1), [5]]]));
  postP(rc('r-9', 'EV-A', 'テスト 同名', 'テスト東', '2026-10-06', [[wn(0), [1]]]));
  postP(rc('r-10', 'EV-B', 'テスト 同名', '所属未確定', '2026-10-07', [[wn(0), [3]]]));
  postP(rc('r-11', 'EV-A', 'テスト 確定', '所属未確定', '2026-10-07', [[wn(0), [2]]]));
  postP(rc('r-12', 'EV-B', 'テスト 外部', 'テスト南', '2026-10-08', [[wn(0), [4]]]));
  const pd = PT().d, prow = n => pd.slice(2).find(r => r[1] === n);
  const pairs = r => { const o = []; for (let i = 8; i + 1 < r.length; i += 2) if (r[i] !== '') o.push(r[i] + '=' + r[i + 1]); return o.join('|'); };
  const names = pd.slice(2).map(r => r[1]);
  ok('R2 受験者別: 名簿順1人1行・予定/採点済み/未採点/全体平均/最終評価日/作業ごとの平均', names.slice(0, 9).join() === ['テスト Hoang Nam', 'テスト Nam', 'テスト 区分', 'テスト 不明', 'テスト 共通人', 'テスト 同名', 'テスト 同名', 'テスト 確定', 'テスト 無採点'].join()
    && prow('テスト Hoang Nam').slice(0, 8).join() === ['テスト東', 'テスト Hoang Nam', 2, 2, '', '', 4.2, '2026-10-04'].join() && pairs(prow('テスト Hoang Nam')) === wn(0) + '=4.33|' + wn(1) + '=4'
    && prow('テスト Nam').slice(2, 8).join() === [1, 1, '', '', 3.5, '2026-10-02'].join() && prow('テスト 無採点').slice(2, 8).join() === [1, 0, wn(0), '', '', ''].join() && pairs(prow('テスト 無採点')) === wn(0) + '=' && pd[1].length === 24 && pd[1][23] === '平均8');
  ok('R2 受験者別: やり直し前の行を数えない（平均は最新回だけ・前回の作業の予定は残る）', prow('テスト Hoang Nam')[3] === 2 && prow('テスト Hoang Nam')[6] === 4.2);
  ok('R2 受験者別: 旧名/所属未確定→確定/同名2農場の振り分けが checkSummary_ と同じ', prow('テスト Hoang Nam')[7] === '2026-10-04'   // 旧名の記録が Hoang Nam に入る
    && pd.slice(2, 11).filter(r => r[1] === 'テスト 同名').map(r => r[0] + ':' + pairs(r)).join('|') === 'テスト東:' + wn(0) + '=2|テスト西:' + wn(1) + '=5'   // 所属未確定の同名は最初の行
    && pairs(prow('テスト 確定')) === wn(0) + '=2');
  const planRest = preset.works.filter(id => id !== 'feeding-daily' && id !== 'castration').map(pn);
  ok('R2 受験者別: 区分名は作業一式・予定外の作業・解決できないセルは ?原文 で未採点', prow('テスト 区分')[2] === 7 && prow('テスト 区分')[3] === 2 && prow('テスト 区分')[4] === planRest.join('、') && prow('テスト 区分')[5] === outW.name
    && prow('テスト 不明')[2] === 2 && prow('テスト 不明')[3] === 1 && prow('テスト 不明')[4] === '?存在しない作業' && prow('テスト 区分')[6] === 2.67);
  ok('R2 受験者別: 共通行を使う（作業が空の人は同じ農場の（農場共通）行の作業）・共通行は人の行に出ない', prow('テスト 共通人')[2] === 2 && prow('テスト 共通人')[3] === 1 && prow('テスト 共通人')[4] === wn(4) && pairs(prow('テスト 共通人')) === wn(3) + '=4|' + wn(4) + '=' && !names.includes('（農場共通）') && !names.slice(0, 9).includes('   '));
  ok('R2 受験者別: 名簿外は末尾に 名簿外 として1人1行（捨てない）', pd.length === 2 + 10 && pd[pd.length - 1][0] === '名簿外' && pd[pd.length - 1][1] === 'テスト 外部（テスト南）' && pd[pd.length - 1][6] === 4 && pd[pd.length - 1][5] === wn(0));
  ok('R2 受験者別: やり直し前の行を数えない・旧名/所属未確定→確定/同名2農場の振り分けが checkSummary_ と同じ・区分名は作業一式・共通行を使う・名簿外は末尾',
    prow('テスト Hoang Nam')[6] === 4.2 && prow('テスト 確定')[3] === 1 && prow('テスト 区分')[2] === 7 && prow('テスト 共通人')[2] === 2 && pd[pd.length - 1][0] === '名簿外');
  { // 集計の P 列（今の農場）と同じ振り分け: checkSummary_ の期待値（personOf_）と、表の人の農場が一致
    const P = GP.rosterPeople_(), fo = (n, f) => { const p = GP.personOf_(n, f, P); return p ? p.farm : null; };
    ok('R2 人の特定: 名前＋農場 → 名前 → 旧名の完全一致 → 名簿外（共通行・部分一致は候補にしない）', fo('テスト 同名', 'テスト西') === 'テスト西' && fo('テスト 同名', 'テスト東') === 'テスト東' && fo('テスト 同名', '所属未確定') === 'テスト東' && fo('テスト 旧名', 'テスト東') === 'テスト東'
      && fo('テスト 旧', 'テスト東') === null && fo('（農場共通）', 'テスト北') === null && fo('テスト 外部', 'テスト南') === null && fo('テスト　Nam', 'テスト西') === 'テスト西');
  }
  const ft = FT().d;
  ok('R3 農場別: 受験者数・全作業済み・一部済み・未採点・平均・採点済み/予定', ft.length === 2 + 4 && ft[2].join() === ['テスト東', 5, 2, 2, 1, 3.36, '6/13'].join() && ft[3].join() === ['テスト西', 3, 3, 0, 0, 3.5, '3/3'].join()
    && ft[4].join() === ['テスト北', 1, 0, 1, 0, 4, '1/2'].join() && ft[5].join() === ['所属未確定', 0, 0, 0, 0, '', '0/0'].join());
  ok('R3 農場別: 順番=農場一覧の順・所属未確定は最後、名簿にだけある農場は一覧の後ろ', (() => { sheets['農場一覧'].d.length = 0; sheets['農場一覧'].getRange(1, 1, 3, 1).setValues([['農場'], ['所属未確定'], ['テスト西']]); GP.setup(); const f = FT().d.slice(2).map(r => r[0]); return f.join() === 'テスト西,テスト東,テスト北,所属未確定'; })());
  ok('R2/R3 表は自動の説明つき・文字として書く列は書式@・H列は yyyy-mm-dd', PT().nf['3,1'] === '@' && PT().nf['3,8'] === 'yyyy-mm-dd' && FT().nf['3,7'] === '@' && /手で直さない/.test(PT().d[0][0]) && /手で直さない/.test(FT().d[0][0]));
  // 更新: submit・delete・setup・op=persons のたびに更新日時が進む／同名の管理者タブは触らない
  const stamp = sh => String(sh.d[0][0]).replace(/^.*更新 /, '');
  const sub = () => postP(rc('u-' + Math.random().toString(36).slice(2, 6), 'EV-A', 'テスト 無採点', 'テスト東', '2026-10-09', [[wn(0), [3]]]));
  mockNow = '2026-11-04 09:00:01'; const u1 = sub();
  const s1 = [stamp(PT()), stamp(FT())];
  mockNow = '2026-11-04 09:00:02'; const dl = postP({ action: 'delete', id: 'r-12' });
  const s2 = [stamp(PT()), stamp(FT())], outsideAfterDel = PT().d.some(r => r[0] === '名簿外');
  mockNow = '2026-11-04 09:00:03'; GP.setup();
  const s3 = [stamp(PT()), stamp(FT())];
  mockNow = '2026-11-04 09:00:04'; const pr4 = getP({ action: 'admin', token: TOKR, op: 'persons' });
  const s4 = [stamp(PT()), stamp(FT())];
  delete sheets['受験者別（自動）'];
  const mine = ss.insertSheet('受験者別（自動）'); mine.getRange(1, 1, 2, 2).setValues([['自分の表', 1], ['x', 2]]);
  mockNow = '2026-11-04 09:00:05'; sub(); GP.setup(); const pr5 = getP({ action: 'admin', token: TOKR, op: 'persons' });
  ok('R2/R3 更新: submit・delete・setup・op=persons のたびに更新日時が進む／同名の管理者タブは触らない',
    u1.ok && dl.ok && dl.deleted > 0 && s1.join() === '2026-11-04 09:00:01,2026-11-04 09:00:01' && s2.join() === '2026-11-04 09:00:02,2026-11-04 09:00:02' && s3.join() === '2026-11-04 09:00:03,2026-11-04 09:00:03'
    && pr4.ok === true && /^OK/.test(pr4.persons) && s4.join() === '2026-11-04 09:00:04,2026-11-04 09:00:04'
    && mine.d.length === 2 && mine.d[0][0] === '自分の表' && stamp(FT()) === '2026-11-04 09:00:05' && pr5.ok === true);
  ok('R2 delete 後: 削除した記録の分が受験者別から消える（名簿外の行が無くなる）', outsideAfterDel === false);
  { // 自動更新の上限: 超えたら submit では更新せず、op=persons だけが更新する
    const codeS = code.replace('const PERSON_AUTO_MAX_ROWS = 20000;', 'const PERSON_AUTO_MAX_ROWS = 3;');
    reset(); const GS = mkG(codeS); GS.setup();
    const sp = o => JSON.parse(GS.doPost({ postData: { contents: JSON.stringify(o) } }).s);
    sheets['受験者'].getRange(2, 1, 1, 3).setValues([['テスト東', 'テスト 上限', wn(0)]]);
    mockNow = '2026-11-04 10:00:00'; GS.setup();
    mockNow = '2026-11-04 10:00:01'; sp(rc('lim-1', 'EV-A', 'テスト 上限', 'テスト東', '2026-10-01', [[wn(0), [1, 2, 3, 4, 5]]]));
    const st1 = sheets['受験者別（自動）'].d[0][0].replace(/^.*更新 /, '');
    mockNow = '2026-11-04 10:00:02'; const r = JSON.parse(GS.doGet({ parameter: { action: 'admin', token: TOKR, op: 'persons' } }).s);
    ok('R2 自動更新の上限: 行数が上限を超えたら submit では作り直さず、op=persons だけが更新する', st1 === '2026-11-04 10:00:00' && r.ok && sheets['受験者別（自動）'].d[0][0].endsWith('10:00:02') && sheets['受験者別（自動）'].d[2][3] === 1);
  }
  // 更新に失敗しても submit の応答は変わらない
  {
    reset(); const GF = mkG(); GF.setup();
    const fp = o => JSON.parse(GF.doPost({ postData: { contents: JSON.stringify(o) } }).s);
    const bad = sheets['受験者別（自動）']; bad.clear = () => { throw new Error('boom'); };
    const rr = fp(rc('f-1', 'EV-A', 'テスト 失敗', 'テスト東', '2026-10-01', [[wn(0), [3]]]));
    const rd = fp({ action: 'delete', id: 'f-1' });
    ok('R2 更新が失敗しても submit・delete の応答と書き込みは変わらない', rr.ok === true && rr.rows === 1 && rd.ok === true && rd.deleted === 1);
  }
  // R4 日付書式
  {
    reset(); const GD = mkG(); GD.setup();
    const dp = o => JSON.parse(GD.doPost({ postData: { contents: JSON.stringify(o) } }).s);
    dp(rc('d-1', 'EV-A', 'テスト 日付', 'テスト東', '2026-10-01', [[wn(0), [3]]]));
    const SM = sheets['集計（自動）'];
    ok('R4 集計（自動）B列=yyyy-mm-dd・N列=yyyy-mm-dd hh:mm:ss の書式', SM.nf['3,2'] === 'yyyy-mm-dd' && SM.nf['3,14'] === 'yyyy-mm-dd hh:mm:ss' && !SM.nf['3,3']);
    ok('R4 評価者名が 種目・受験者別（自動）・農場別（自動）でも予約名のタブに書かない', (['種目', '受験者別（自動）', '農場別（自動）'].forEach((n, i) => dp(rc('d-r' + i, n, 'テスト 日付', 'テスト東', '2026-10-01', [[wn(0), [3]]]))), ['種目', '受験者別（自動）', '農場別（自動）'].every(n => sheets['評価者_' + n]) && sheets['種目'].d[0][0] === '作業No' && sheets['受験者別（自動）'].d[1][0] === '農場'));
  }
  // onOpen: getUi が無い環境でも落ちない／ある環境ではメニューを作る
  {
    reset(); const GO = mkG(); let threw = false; try { GO.onOpen(); } catch (e) { threw = true; }
    const items = []; global.SpreadsheetApp.getUi = () => ({ createMenu: t => ({ addItem(n, f) { items.push([t, n, f]); return this; }, addToUi() { return this; } }) }); GO.onOpen(); delete global.SpreadsheetApp.getUi;
    ok('onOpen: getUi が無くても落ちない・あればメニュー「HSS実技」を作る', !threw && items.length === 1 && items[0].join() === 'HSS実技,受験者別・農場別を更新,refreshPersonTabs');
  }
  // 速度: 94名×8作業×5種目 = 3,760行
  {
    reset(); const GV = mkG(); GV.setup();
    const rows = []; const rs2 = sheets['受験者'];
    for (let i = 0; i < 94; i++) rs2.d.push(pr('テスト農場' + (i % 6), 'テスト 速度' + i, [0, 1, 2, 3, 4, 5, 6, 7].map(wn)));
    const ev = ss.insertSheet('評価者速度'); ev.d.push(['記録ID', '評価日', '評価者', '被評価者', '農場', 'カテゴリ', '作業', '種目', 'スコア', 'コメント', '作業平均', 'セッション平均', '全体所感', '送信日時', 'やり直し元']);
    for (let i = 0; i < 94; i++) for (let k = 0; k < 8; k++) for (let a = 0; a < 5; a++) ev.d.push(['sp-' + i, '2026-10-0' + (1 + (k % 8)), '評価者速度', 'テスト 速度' + i, 'テスト農場' + (i % 6), 'テスト', wn(k), '種目' + a, 1 + ((i + k + a) % 5), '', '', '', '', '2026-10-01 10:00:00', '']);
    docProps.HSS_EVAL_TAB_IDS = JSON.stringify([String(ev.getSheetId())]);
    const t0 = Date.now(), T = GV.buildPersonTables_(), dt = Date.now() - t0;
    ok('R2 速度: 94名×8作業×5種目の評価者行で buildPersonTables_ が Node 上 3 秒以内（' + dt + 'ms・' + (ev.d.length - 1) + '行）', ev.d.length - 1 === 3760 && dt < 3000 && T.person.rows.length === 94 && T.person.rows.every(r => r[2] === 8 && r[3] === 8) && T.farm.rows.length === 7);
  }
  { // 回帰: 壊す検証の指摘
    const w0n = pn(W.works[0].id), w1n = pn(W.works[1].id);
    // (1) 同名の別タブ「種目」には書かない
    reset(); const G3 = mkG(); const foreign = ss.insertSheet('種目'); foreign.getRange(1, 1, 2, 5).setValues([['記録ID', '評価日', '評価者', '被評価者', '農場'], ['x1', '2026-11-01', '種目', '太郎', 'F']]);
    G3.setup();
    ok('回帰: 同名の別タブ「種目」には書き込まない（行数・見出しはそのまま）', foreign.d.length === 2 && foreign.d[0][0] === '記録ID' && foreign.d[1][0] === 'x1' && foreign.d[0].length === 5);
    // (2) 農場の表記ずれ: 同名2農場で別の人に点が付かない
    reset(); const G4 = mkG(), post4 = o => JSON.parse(G4.doPost({ postData: { contents: JSON.stringify(o) } }).s); G4.setup();
    sheets['受験者'].d.length = 0;
    sheets['受験者'].getRange(1, 1, 3, 4).setValues([['農場', '被評価者', '作業1', '作業2'], ['那須農場', '太郎', w0n, ''], ['大田原農場', '太郎', w0n, '']]);
    const rec4 = (id, farm) => ({ action: 'submit', record: { id: id, evaluator: 'EV', person: '太郎', farm: farm, date: '2026-11-02', sentAt: '2026-11-02T10:00:00+09:00', works: [{ workId: W.works[0].id, workName: w0n, aspects: [{ aspect: 'a', score: 5 }] }] } });
    const P4 = G4.rosterPeople_();
    ok('回帰: 農場名が「大田原」（農場なし）でも那須の太郎に付けず、部分一致で大田原の太郎に付く', G4.personOf_('太郎', '大田原', P4).farm === '大田原農場' && G4.personOf_('太郎', '那須農場', P4).farm === '那須農場');
    ok('回帰: 同名2農場で決められない表記は名簿外（別の人に付けない）・所属未確定は先頭', G4.personOf_('太郎', '東京', P4) === null && G4.personOf_('太郎', '所属未確定', P4).farm === '那須農場' && G4.personOf_('太郎', '', P4).farm === '那須農場');
    // (3) 同じ農場・同名の2行は1人にまとめる
    sheets['受験者'].getRange(4, 1, 1, 4).setValues([['那須農場', '太郎', w0n, w1n]]);
    const P5 = G4.rosterPeople_(), taros = P5.people.filter(p => p.name === '太郎' && p.farm === '那須農場');
    ok('回帰: 名簿の同じ農場・同名の2行は1人にまとめ作業を合わせる', taros.length === 1 && taros[0].cells.join() === [w0n, w1n].join() && P5.people.length === 2);
    // (4) サロゲートペアが上限で切れない
    const GC = new Function('ROSTER_SEED', 'ADMIN_TOKEN', code + ';return {cleanText_};')(undefined, TOKR);
    const ct = GC.cleanText_('あ'.repeat(119) + '😀', 120);
    ok('回帰: 上限の境界で絵文字が切れても孤立サロゲートを残さない', ct === 'あ'.repeat(119) && GC.cleanText_('あ'.repeat(118) + '😀', 120).endsWith('😀'));
  }
  mockNow = '2026-09-23 10:00:00';
}
console.log(`\n合計: OK ${pass} / NG ${fail}`); process.exit(fail ? 1 : 0);
