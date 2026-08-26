/* store.js — 永続化層：評価セッション（1保存=複数作業）の読み書き・バックアップ */
/* レコード形式:
   {id,date,evaluator,evaluatee,overall,createdAt,updatedAt?,
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
function putAll(evs){localStorage.setItem(SKEY,JSON.stringify({evaluations:evs}))}

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
    evaluator:String(e.evaluator||''),evaluatee:String(e.evaluatee||''),
    overall:e.overall==null?'':String(e.overall),
    createdAt:String(e.createdAt||''),...(e.updatedAt?{updatedAt:String(e.updatedAt)}:{}),works};
}
function validRec(r){return r&&typeof r==='object'&&typeof r.id==='string'&&r.id&&typeof r.date==='string'&&Array.isArray(r.works)&&r.works.length>0}

/* ==============================================================
   全データのバックアップ / 復元
   ============================================================== */
function exportAll(){
  const payload={_type:'jitsugi_v2_backup',version:1,dataVersion:WORKDATA_V2.version,exportedAt:new Date().toISOString()};
  payload.data={evaluations:getAll()};
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8;'}));
  a.download='jitsugi_v2_backup_'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'.json';
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
      if(r.id&&!ids.has(r.id)){ids.add(r.id);cur.push(r);added++}
    });
    putAll(cur);
    refreshSel();drawHist();
    toast(t('tBackupImp')+' (+'+added+')');
    input.value='';
  };
  rd.onerror=()=>{toast(t('eImpCfg'),1);input.value=''};
  rd.readAsText(file,'utf-8');
}
