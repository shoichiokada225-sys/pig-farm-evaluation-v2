/* store.js — 永続化層：評価セッション（1保存=複数作業）の読み書き・バックアップ */
/* レコード形式:
   {id,date,evaluator,evaluatee,farm,overall,createdAt,updatedAt?,manual?(名簿にない人を手入力=true),sent,sentOnce?(一度でもシートに届いた=true。無い旧データも読める),
    redoOf?(やり直しの記録だけ: 置き換える前回の記録ID。複数は半角空白区切り。無い旧データ・通常の記録も読める),
    works:[{workId,workName,category,scores:{aspectId:1-5|null},comments:{aspectId:str}}]} */
const SKEY='jitsugi_v2_data';
const SEL_KEY='jitsugi_v2_sel';
const DRAFT_KEY='jitsugi_v2_draft';

/* 選択中の作業ID（配列・カタログに実在するものだけ保持） */
let selWorks=[];
try{const r=JSON.parse(localStorage.getItem(SEL_KEY));if(Array.isArray(r))selWorks=r.filter(id=>workById(id))}catch{}

function saveSel(){localStorage.setItem(SEL_KEY,JSON.stringify(selWorks))}
function getItems(){return itemsForWorks(selWorks)}

function getAll(){try{const r=localStorage.getItem(SKEY);return r?JSON.parse(r).evaluations||[]:[]}catch{return[]}}
/* 書けたら true。容量いっぱい等で書けなければ false（呼び出し側が知らせる＝黙って保存したふりをしない） */
function putAll(evs){try{localStorage.setItem(SKEY,JSON.stringify({evaluations:evs}));return true}catch(e){return false}}
/* 記録ID: randomUUID の無い古い端末（iOS 15.3 以前・Chrome 91 以前）でも作れる */
function newId(){
  try{if(crypto&&typeof crypto.randomUUID==='function')return crypto.randomUUID()}catch(e){}
  let r='';try{r=[...crypto.getRandomValues(new Uint8Array(10))].map(b=>b.toString(16).padStart(2,'0')).join('')}catch(e){r=Math.random().toString(16).slice(2)+Math.random().toString(16).slice(2)}
  return Date.now().toString(36)+'-'+r;
}

/* ==============================================================
   レコードの正規化（バックアップ取り込み・保存時の共通ガード）
   スコアは1〜5の整数以外をnullへ、文字列はString化、IDはサニタイズ
   ============================================================== */
function normWorkEntry(we){
  const sc={},cm={};
  const rawSc=we.scores&&typeof we.scores==='object'?we.scores:{};
  Object.keys(rawSc).forEach(k=>{const n=Number(rawSc[k]);sc[sanitizeId(k)]=Number.isInteger(n)&&n>=1&&n<=5?n:null});
  const rawCm=we.comments&&typeof we.comments==='object'?we.comments:{};
  Object.keys(rawCm).forEach(k=>{cm[sanitizeId(k)]=rawCm[k]==null?'':String(rawCm[k])});
  return{workId:sanitizeId(we.workId||''),workName:String(we.workName||''),category:String(we.category||''),scores:sc,comments:cm};
}
function normRec(e){
  const works=Array.isArray(e.works)?e.works.filter(w=>w&&typeof w==='object').map(normWorkEntry):[];
  return{id:sanitizeId(String(e.id||'')),date:String(e.date||''),
    evaluator:String(e.evaluator||''),evaluatee:String(e.evaluatee||''),farm:String(e.farm||''),
    overall:e.overall==null?'':String(e.overall),
    createdAt:String(e.createdAt||''),...(e.updatedAt?{updatedAt:String(e.updatedAt)}:{}),
    ...(e.manual===true?{manual:true}:{}),...(normRedoOf(e.redoOf)?{redoOf:normRedoOf(e.redoOf)}:{}),works,
    sent:e.sent===true,...(e.sent===true||e.sentOnce===true?{sentOnce:true}:{})};
}
/* やり直し元（記録IDの並び）: 文字列・配列どちらも受け、ID ごとにサニタイズして半角空白でつなぐ（重複・空は落とす） */
function normRedoOf(v){
  const a=(Array.isArray(v)?v:String(v==null?'':v).split(/[\s,、]+/)).map(x=>sanitizeId(String(x==null?'':x).trim())).filter(Boolean);
  return [...new Set(a)].join(' ');
}
function validRec(r){return r&&typeof r==='object'&&typeof r.id==='string'&&r.id&&typeof r.date==='string'&&Array.isArray(r.works)&&r.works.length>0}

/* ==============================================================
   全データのバックアップ / 復元
   ============================================================== */
function exportAll(){
  const payload={_type:'jitsugi_v2_backup',version:1,dataVersion:WORKDATA_V2.version,exportedAt:new Date().toISOString()};
  payload.data={evaluations:getAll()};
  if(typeof getDels==='function')payload.dels=getDels();   // 削除待ちも持ち出す（別の端末で復元しても、シートの行を消し忘れない）
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8;'}));
  a.download='jitsugi_v2_backup_'+todayLocal().replace(/-/g,'')+'.json';   // 日本時間の日付（UTC だと朝9時前は前日になる）
  a.click();URL.revokeObjectURL(a.href);
  toast(t('tBackupExp'));
}
function importAll(input){
  const file=input.files&&input.files[0];if(!file)return;
  const rd=new FileReader();
  rd.onload=()=>{
    let data;
    try{data=JSON.parse(rd.result)}catch{toast(t('eImpCfg'),1);input.value='';return}
    if(!data||data._type!=='jitsugi_v2_backup'||!data.data||!Array.isArray(data.data.evaluations)){toast(t('eImpCfg'),1);input.value='';return}
    if(!confirm(t('cImpAll'))){input.value='';return}
    const cur=getAll();
    const ids=new Set(cur.map(e=>e.id));
    let added=0;
    data.data.evaluations.filter(validRec).forEach(e=>{
      const r=normRec(e);
      if(r.id&&!ids.has(r.id)){
        // 削除待ちの記録を復元した → 削除をやめて送り直す（シートと端末を一致させる）
        if(typeof getDels==='function'&&getDels().some(d=>d.id===r.id))putDels(getDels().filter(d=>d.id!==r.id));
        // 復元した記録は送り直す（シートで消された・届いていない行を戻す。記録IDで上書きなので重複しない）
        r.sent=false;
        ids.add(r.id);cur.push(r);added++}
    });
    // バックアップの削除待ち: 端末にその記録が無いものだけ引き継ぐ
    if(Array.isArray(data.dels)&&typeof putDels==='function'){
      const ds=getDels();data.dels.forEach(d=>{if(d&&typeof d.id==='string'&&d.id&&!ids.has(d.id)&&!ds.some(x=>x.id===d.id))ds.push({id:sanitizeId(d.id),evaluator:String(d.evaluator||''),at:String(d.at||new Date().toISOString())})});
      try{putDels(ds)}catch(e){}
    }
    if(!putAll(cur)){toast(t('eStoreFull'),1);input.value='';return}
    // 名簿の済/残りもすぐ変える（別の端末へ復元した評価者が、済んだ人をもう一度採点しないように）
    refreshSel();drawHist();if(typeof updSyncUI==='function')updSyncUI();if(typeof renderRoster==='function')renderRoster();
    if(added&&typeof syncPending==='function')syncPending(true);   // 復元した未送信（削除をやめた記録を含む）をすぐ送る
    toast(t('tBackupImp')+' (+'+added+')');
    input.value='';
  };
  rd.onerror=()=>{toast(t('eImpCfg'),1);input.value=''};
  rd.readAsText(file,'utf-8');
}
