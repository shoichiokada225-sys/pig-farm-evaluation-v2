/* Code.gs の単体テスト（SpreadsheetApp等をモック）: node gas/test_gas.js */
const fs = require('fs');
const sheets = {};
function mkSheet(name) {
  const d = []; // 2D
  const dv = {};   // 列番号(1始まり) → 入力規則（null=外した）
  const notes = {};
  const sh = {
    name, d, dv, notes, getName: () => name,
    getLastRow: () => d.length, getLastColumn: () => d.reduce((m, r) => Math.max(m, r.length), 0),
    getRange: (r, c, nr = 1, nc = 1) => ({
      _sheet: name,
      setValues(v) { v.forEach((row, i) => { d[r - 1 + i] = d[r - 1 + i] || []; row.forEach((x, j) => d[r - 1 + i][c - 1 + j] = x); }); return this; },
      getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (d[r - 1 + i] || [])[c - 1 + j] ?? '')); },
      getDisplayValues() { return this.getValues().map(r => r.map(String)); },
      setFontWeight() { return this; }, setBackground() { return this; },
      setDataValidation(v) { for (let j = 0; j < nc; j++) dv[c + j] = v; return this; },
      setNote(t) { notes[r + ',' + c] = t; return this; },
    }),
    deleteRow: i => d.splice(i - 1, 1), setFrozenRows() {}, setColumnWidth() {}, clear() { d.length = 0; }, autoResizeColumns() {},
  };
  return sh;
}
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
global.SpreadsheetApp = { getActive: () => ss, newDataValidation: () => {
  const v = {};
  return { requireValueInRange(rg) { v.range = rg; return this; }, setAllowInvalid(b) { v.allowInvalid = b; return this; }, build() { return v; } };
} };
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
global.Utilities = { formatDate: () => '2026-09-23 10:00:00' };
global.ContentService = { MimeType: { JSON: 'j' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) };
const code = fs.readFileSync(__dirname + '/Code.gs', 'utf8');
const SEED = [['那須農場', 'テスト 一郎', '給餌'], ['大田原農場', 'テスト 二郎']];
const G = new Function('ROSTER_SEED', code + ';return {setup,doGet,doPost};')(SEED);
let pass = 0, fail = 0; const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  OK ' : '  NG ') + n); };

ok('setup', G.setup() === 'setup OK' && sheets['受験者'] && sheets['作業一覧'].d.length === 41);
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
post({ action: 'submit', record: { ...rec, id: 'del-1' } });   // 評価者名を変えて送り直した記録＝2タブに同じID
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
ok('不正JSON', post.call(null, null) && JSON.parse(G.doPost({ postData: { contents: '{' } }).s).ok === false);
// 名簿の初期データが無い時: 農場一覧は受験者タブにある農場（重複なし）＋所属未確定
Object.keys(sheets).forEach(k => delete sheets[k]);
const G3 = new Function('ROSTER_SEED', code + ';return {setup};')(undefined);
ss.insertSheet('受験者').getRange(1, 1, 4, 3).setValues([['農場', '被評価者', '作業1'], ['テスト東', 'テスト 甲', ''], ['所属未確定', 'テスト 乙', ''], ['テスト東', 'テスト 丙', '']]);
G3.setup();
ok('シード無し: 農場一覧=受験者タブの農場＋所属未確定（重複なし）', sheets['農場一覧'].d.map(r => r[0]).join() === '農場,テスト東,所属未確定' && sheets['受験者'].d.length === 4);
console.log(`\n合計: OK ${pass} / NG ${fail}`); process.exit(fail ? 1 : 0);
