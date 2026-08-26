/* data.js — 静的データ層：作業カタログ（works-v2.js の WORKDATA_V2）とアクセサ */
/* WORKDATA_V2 = { version, categories:[{id,name}], works:[{id,category,no,name,name_en/vi/id,purposeShort*,gyomu,aspects:[5]}] }
   各aspect = { id,name,kanten,levels[5] } + name_en/_vi/_id, kanten_*, levels_* */
if(typeof WORKDATA_V2==='undefined'){window.WORKDATA_V2={version:'-',categories:[],works:[]}}
WORKDATA_V2.categories=WORKDATA_V2.categories||[];
WORKDATA_V2.works=WORKDATA_V2.works||[];

/* 多言語アクセサ: o[f+'_'+lang] があればそれを、無ければ o[f]（ja原文） */
function loc(o,f){if(lang!=='ja'&&o){const v=o[f+'_'+lang];if(v!=null)return v}return o?o[f]:''}
function locLevels(o){if(lang!=='ja'&&o){const v=o['levels_'+lang];if(Array.isArray(v)&&v.length)return v}return o&&o.levels||[]}

function workById(id){return WORKDATA_V2.works.find(w=>w.id===id)}
function worksInCat(catId){return WORKDATA_V2.works.filter(w=>w.category===catId)}
function catLabel(catId){
  const k='cat'+catId.charAt(0).toUpperCase()+catId.slice(1);
  const tx=(TX[lang]||TX.ja)[k];
  if(tx)return tx;
  const c=WORKDATA_V2.categories.find(c=>c.id===catId);return c?c.name:catId;
}
/* 作業の採点対象種目（5観点）。カードIDは workId__aspectId で一意化 */
function workItems(workId){
  const w=workById(workId);if(!w)return[];
  return w.aspects.map(a=>({id:w.id+'__'+a.id,workId:w.id,aspectId:a.id,
    name:loc(a,'name'),kanten:loc(a,'kanten'),levels:locLevels(a)}));
}
/* 選択中の全作業の種目を平坦化 */
function itemsForWorks(workIds){return workIds.map(workItems).flat()}
