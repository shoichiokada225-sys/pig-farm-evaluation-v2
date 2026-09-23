/* Code.gs の単体テスト（SpreadsheetApp等をモック）: node gas/test_gas.js */
const fs = require('fs');
const sheets = {};
function mkSheet(name) {
  const d = []; // 2D
  const sh = {
    name, d,
    getLastRow: () => d.length, getLastColumn: () => d.reduce((m, r) => Math.max(m, r.length), 0),
    getRange: (r, c, nr = 1, nc = 1) => ({
      setValues(v) { v.forEach((row, i) => { d[r - 1 + i] = d[r - 1 + i] || []; row.forEach((x, j) => d[r - 1 + i][c - 1 + j] = x); }); return this; },
      getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (d[r - 1 + i] || [])[c - 1 + j] ?? '')); },
      getDisplayValues() { return this.getValues().map(r => r.map(String)); },
      setFontWeight() { return this; }, setBackground() { return this; }, setDataValidation() { return this; },
    }),
    deleteRow: i => d.splice(i - 1, 1), setFrozenRows() {}, setColumnWidth() {}, clear() { d.length = 0; }, autoResizeColumns() {},
  };
  return sh;
}
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)) };
global.SpreadsheetApp = { getActive: () => ss, newDataValidation: () => ({ requireValueInRange() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } }) };
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
global.Utilities = { formatDate: () => '2026-09-23 10:00:00' };
global.ContentService = { MimeType: { JSON: 'j' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) };
const code = fs.readFileSync(__dirname + '/Code.gs', 'utf8');
const G = new Function(code + ';return {setup,doGet,doPost};')();
let pass = 0, fail = 0; const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  OK ' : '  NG ') + n); };

ok('setup', G.setup() === 'setup OK' && sheets['受験者'] && sheets['作業一覧'].d.length === 41);
sheets['受験者'].getRange(2, 1, 2, 3).setValues([['グエン', '給餌', 'エサ調整'], ['  ', '給餌', '']]);
const ro = JSON.parse(G.doGet({ parameter: { action: 'roster' } }).s);
ok('roster: 空名の行は除外', ro.ok && ro.roster.length === 1 && ro.roster[0].works.join() === '給餌,エサ調整');
const rec = { id: 'abc-1', date: '2026-09-23', evaluator: '岡田/正一', evaluatee: 'グエン', overall: '=SUM(A1)',
  works: [{ workName: '給餌', category: '飼養管理', items: [{ aspect: 'a', score: 4, comment: '+x' }, { aspect: 'b', score: 2, comment: '' }] }] };
const post = o => JSON.parse(G.doPost({ postData: { contents: JSON.stringify(o) } }).s);
let r = post({ action: 'submit', record: rec });
const sh = sheets['岡田_正一'];
ok('評価者名タブ（/→_）', r.ok && sh && sh.d.length === 3);
ok('数式インジェクション対策', sh.d[1][8] === "'+x" && sh.d[1][11] === "'=SUM(A1)");
ok('平均', sh.d[1][9] === 3 && sh.d[1][10] === 3);
rec.works[0].items[0].score = 5; post({ action: 'submit', record: rec });
ok('同じIDは上書き（行数不変）', sh.d.length === 3 && sh.d[1][7] === 5);
post({ action: 'submit', record: { ...rec, id: 'abc-2' } });
ok('別IDは追記', sh.d.length === 5);
ok('予約名は回避', (post({ action: 'submit', record: { ...rec, id: 'z', evaluator: '受験者' } }), !!sheets['評価者_受験者']));
ok('不正JSON', post.call(null, null) && JSON.parse(G.doPost({ postData: { contents: '{' } }).s).ok === false);
console.log(`\n合計: OK ${pass} / NG ${fail}`); process.exit(fail ? 1 : 0);
