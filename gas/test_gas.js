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
  const sh = {
    name, d, dv, notes, fx, getName: () => name, getSheetId: () => sid,
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
      setFormula(f) { fx[r + ',' + c] = f; return this; },
    }),
    deleteRow: i => d.splice(i - 1, 1), setFrozenRows() {}, setColumnWidth() {}, clear() { d.length = 0; Object.keys(fx).forEach(k => delete fx[k]); }, autoResizeColumns() {},
  };
  return sh;
}
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
global.SpreadsheetApp = { getActive: () => ss, newDataValidation: () => {
  const v = {};
  return { requireValueInRange(rg) { v.range = rg; return this; }, setAllowInvalid(b) { v.allowInvalid = b; return this; }, build() { return v; } };
} };
const docProps = {};
global.PropertiesService = { getDocumentProperties: () => ({ getProperty: k => (k in docProps ? docProps[k] : null), setProperty(k, v) { docProps[k] = String(v); return this; }, deleteProperty(k) { delete docProps[k]; return this; } }) };
/* Sheets の「複製」＝中身も見出しも同じで sheetId だけ新しいタブ */
const dupSheet = (from, to) => { const s2 = ss.insertSheet(to); sheets[from].d.forEach((row, i) => { s2.d[i] = row.slice(); }); return s2; };
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
global.Utilities = { formatDate: (d, tz, f) => f === 'yyyy-MM-dd' ? new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10) : '2026-09-23 10:00:00' };
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
  ';return {WORKDATA_V2,toPayload,submitReq,deleteReq,gasInfo,gasMissing,isUnsupportedOp,GAS_REQUIRED_CAPS,GAS_MIN_VERSION};')();
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
console.log(`\n合計: OK ${pass} / NG ${fail}`); process.exit(fail ? 1 : 0);
