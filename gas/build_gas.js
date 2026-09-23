/* Code.src.gs に works-v2.js の作業一覧を埋め込んで Code.gs を生成する: node gas/build_gas.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'works-v2.js'), 'utf8');
const W = new Function(src + ';return WORKDATA_V2;')();
const cat = Object.fromEntries(W.categories.map(c => [c.id, c.name]));
const rows = W.works.map(w => [w.no, w.name, cat[w.category] || w.category]);
const gs = fs.readFileSync(path.join(__dirname, 'Code.src.gs'), 'utf8')
  .replace('/*__WORKS__*/[]', JSON.stringify(rows))
  .replace('※ Code.gs は build_gas.js が', '※ このファイルは build_gas.js が');
fs.writeFileSync(path.join(__dirname, 'Code.gs'), gs);
fs.writeFileSync(path.join(__dirname, 'deploy', 'Code.js'), gs);   // clasp push 用
console.log('Code.gs: works=' + rows.length);
