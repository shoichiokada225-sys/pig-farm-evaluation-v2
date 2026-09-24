/* person.js — 「同じ人か」の判定を1か所に集める
   使う所: 名簿の進み具合（済/途中/残り）・採点中の人・保存する農場・下書きの復元・履歴とグラフの人のキー・名簿の同名チェック
   規則（どこでも同じ）:
   ・名前は NFC＋前後の空白を除いてそろえる（nmKey）。名簿の「旧名」は今の名前と同じ人
   ・農場は全角半角・空白をそろえて比べる（normFarm）
   ・名簿で同じ名前（旧名を含む）が1人だけ → 農場を見ずにその人
     （所属未確定→農場が決まった・農場名の表記を直した・名前を直した後も同じ人）
   ・名簿に同じ名前が2人以上 → 記録の農場で見分ける（農場が空で見分けられない記録は、どの人にも数えない）
   ・名簿にいない名前（名簿外・名簿の無い端末）→ 農場＋名前（同名異人を合算しない）
   ・農場が空の記録は、同じ名前の記録の農場が1つだけならその農場とみなす（農場列ができる前の記録） */
function nmKey(v){return String(v==null?'':v).normalize('NFC').trim()}
function normFarm(v){return String(v||'').normalize('NFKC').replace(/\s+/g,'')}

/* 名簿の 名前/旧名 → その名前を持つ人の配列（名簿の配列ごとにキャッシュ） */
const nameIdxCache=new WeakMap();
function nameIndex(ro){
  let m=nameIdxCache.get(ro);if(m)return m;
  m=new Map();
  ro.forEach(p=>[p.name,...(Array.isArray(p.aliases)?p.aliases:[])].forEach(n=>{const k=nmKey(n);if(!k)return;const a=m.get(k)||[];if(!a.includes(p))a.push(p);m.set(k,a)}));
  nameIdxCache.set(ro,m);return m;
}
/* 名前（と農場）に当てはまる名簿の人。同名が2人以上いて農場が分かる時だけ農場で絞る */
function rosterHits(name,farm,ro){
  const cs=nameIndex(ro).get(nmKey(name))||[];
  if(cs.length<2||!farm)return cs;
  const nf=normFarm(farm);return cs.filter(p=>normFarm(p.farm)===nf);
}
/* 1人に決まる時だけその人（決まらない＝null） */
function rosterEntry(name,farm,ro){const h=rosterHits(name,farm,ro);return h.length===1?h[0]:null}

/* 記録 → 人 {key, name, farm, entry}。key は履歴・グラフの絞り込みの値（名簿の人は今の名前で1つ） */
function personKeyer(all,ro){
  ro=ro||getRoster().list;
  const fs=new Map();   // 名前 → Map(normFarm → 最初に出た農場の表記)
  all.forEach(r=>{if(!r.farm)return;const n=nmKey(r.evaluatee);if(!fs.has(n))fs.set(n,new Map());const m=fs.get(n),k=normFarm(r.farm);if(!m.has(k))m.set(k,r.farm)});
  return r=>{
    const n=nmKey(r.evaluatee);let f=r.farm||'';
    if(!f){const m=fs.get(n);if(m&&m.size===1)f=[...m.values()][0]}
    const p=rosterEntry(n,f,ro);
    if(p){
      const pn=nmKey(p.name),multi=(nameIndex(ro).get(pn)||[]).length>1;
      return{key:JSON.stringify(multi?['r',pn,normFarm(p.farm)]:['r',pn]),name:p.name,farm:p.farm,entry:p};
    }
    return{key:JSON.stringify(['x',n,normFarm(f)]),name:n,farm:f,entry:null};
  };
}
/* 名簿の人ごとの、記録にある作業 Map(人 → Set(workId))。履歴のキーと同じ規則（personKeyer）で数える */
const doneMapCache=new WeakMap();
function doneMap(recs,ro){
  let byRo=doneMapCache.get(recs);if(!byRo){byRo=new WeakMap();doneMapCache.set(recs,byRo)}
  let m=byRo.get(ro);if(m)return m;
  m=new Map();const keyOf=personKeyer(recs,ro);
  recs.forEach(r=>{const p=keyOf(r).entry;if(!p)return;const s=m.get(p)||new Set();(r.works||[]).forEach(we=>s.add(we.workId));m.set(p,s)});
  byRo.set(ro,m);return m;
}
