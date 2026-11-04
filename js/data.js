/* data.js — 静的データ層：作業カタログ（works-v2.js の WORKDATA_V2）とアクセサ */
/* WORKDATA_V2 = { version, categories:[{id,name}], works:[{id,category,no,name,name_en/vi/id,purposeShort*,gyomu,aspects:[5]}] }
   各aspect = { id,name,kanten,levels[5] } + name_en/_vi/_id, kanten_*, levels_* */
if(typeof WORKDATA_V2==='undefined'){window.WORKDATA_V2={version:'-',categories:[],works:[]}}
WORKDATA_V2.categories=WORKDATA_V2.categories||[];
WORKDATA_V2.works=WORKDATA_V2.works||[];
WORKDATA_V2.presets=WORKDATA_V2.presets||[];   // 試験区分 [{id,name,name_*,works:[workId]}]（分娩舎・ストール舎・子豚舎・肥育舎）

/* 多言語アクセサ: o[f+'_'+lang] があればそれを、無ければ o[f]（ja原文） */
function loc(o,f){if(o&&o.ov&&o.ov[f])return o[f];   // シートの「種目」タブで直した欄は言語に関係なく日本語のまま（古い訳を出さない）
  if(lang!=='ja'&&o){const v=o[f+'_'+lang];if(v!=null)return v}return o?o[f]:''}
function locLevels(o){
  let base=o&&o.levels||[];
  if(lang!=='ja'&&o){const v=o['levels_'+lang];if(Array.isArray(v)&&v.length)base=v}
  if(o&&o.ov&&o.ov.levels&&o.levels){base=base.slice();for(let i=0;i<5;i++)if(o.ov.levels[i])base[i]=o.levels[i]}
  return base;
}
/* シートの「種目」タブの上書き: list=[{w,a,name?,kanten?,lv?:[5]}]（形の正本は contract.js）。純粋関数（ストレージに触らない）・冪等。
   各種目の a.orig に原文を控え、毎回原文に戻してから適用する。適用した欄は a.ov に印（loc/locLevels が言語に関係なく日本語を出す）。戻り値=適用した要素数 */
let _aspOvCount=0;
function applyAspectOverrides(list){
  WORKDATA_V2.works.forEach(w=>(w.aspects||[]).forEach(a=>{
    if(!a.orig)a.orig={name:a.name,kanten:a.kanten,levels:(a.levels||[]).slice()};
    a.name=a.orig.name;a.kanten=a.orig.kanten;a.levels=a.orig.levels.slice();a.ov=null;
  }));
  let n=0;
  (Array.isArray(list)?list:[]).forEach(o=>{
    if(!o||typeof o!=='object'||typeof o.w!=='string'||typeof o.a!=='string')return;
    const w=WORKDATA_V2.works.find(x=>x.id===o.w);if(!w)return;
    const a=(w.aspects||[]).find(x=>x.id===o.a);if(!a)return;
    const ov={name:false,kanten:false,levels:[false,false,false,false,false]};let any=false;
    ['name','kanten'].forEach(f=>{if(o[f]!=null&&typeof o[f]!=='object'){const v=String(o[f]);if(v.length>0&&v.length<=2000){a[f]=v;ov[f]=true;any=true}}});
    if(Array.isArray(o.lv)&&o.lv.length===5)o.lv.forEach((v,i)=>{if(v!=null&&typeof v!=='object'){v=String(v);if(v&&v.length<=2000){a.levels[i]=v;ov.levels[i]=true;any=true}}});
    if(any){a.ov=ov;n++}
  });
  _aspOvCount=n;return n;
}
function aspectOverrideCount(){return _aspOvCount}

function workById(id){return WORKDATA_V2.works.find(w=>w.id===id)}
function presetById(id){return WORKDATA_V2.presets.find(p=>p.id===id)}
/* 名簿の作業欄に書いた区分名（「肥育舎」「【肥育舎】」など）→ 区分。作業名の照合と同じく全角半角・空白・括弧をそろえる */
function presetByName(v){const n=String(v||'').normalize('NFKC').replace(/[\s\[\]（）()【】〔〕［］「」『』<>＜＞{}]/g,'');return n?WORKDATA_V2.presets.find(p=>String(p.name).normalize('NFKC').replace(/\s/g,'')===n):undefined}
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
