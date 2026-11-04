/* Code.src.gs に works-v2.js の作業一覧を埋め込んで Code.gs を生成する: node gas/build_gas.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'works-v2.js'), 'utf8');
const W = new Function(src + ';return WORKDATA_V2;')();
const cat = Object.fromEntries(W.categories.map(c => [c.id, c.name]));
const rows = W.works.map(w => [w.no, w.name, cat[w.category] || w.category]);
// 試験区分（分娩舎など）も作業一覧に載せる＝受験者タブの作業列のプルダウンで選べる（アプリが作業一式に展開する）
(W.presets || []).forEach(p => rows.push(['区分', p.name, '試験区分（' + p.works.length + '作業）']));
// 作業カタログ（日本語の原文のみ）: 種目タブの初期値と「原文と違う欄」の判定に使う。en/vi/id は入れない
const catalog = {
  works: W.works.map(w => ({ id: w.id, no: w.no || '', name: w.name, cat: cat[w.category] || w.category,
    aspects: (w.aspects || []).map(a => ({ id: a.id, name: a.name, kanten: a.kanten || '', levels: (a.levels || []).slice(0, 5) })) })),
  presets: (W.presets || []).map(p => ({ id: p.id, name: p.name, works: p.works.slice() })),
};
const nAspects = catalog.works.reduce((n, w) => n + w.aspects.length, 0);
const gs = fs.readFileSync(path.join(__dirname, 'Code.src.gs'), 'utf8')
  .replace('/*__WORKS__*/[]', () => JSON.stringify(rows))
  .replace('/*__CATALOG__*/{}', () => JSON.stringify(catalog))
  .replace('※ Code.gs は build_gas.js が', '※ このファイルは build_gas.js が');
fs.writeFileSync(path.join(__dirname, 'Code.gs'), gs);
fs.writeFileSync(path.join(__dirname, 'deploy', 'Code.js'), gs);   // clasp push 用
console.log('Code.gs: works=' + rows.length + ' aspects=' + nAspects);
