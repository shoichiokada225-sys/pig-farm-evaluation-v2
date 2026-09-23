/* sync.js — スプレッドシート連携層：受験者名簿の取得（キャッシュ付き）と評価結果の送信（未送信キュー） */
/* 送信先URL = 設定タブで保存した値 > config.js の SHEET_URL */
const SHEET_KEY='jitsugi_v2_sheet_url';
const ROSTER_KEY='jitsugi_v2_roster';
const EV_KEY='jitsugi_v2_evaluator';

function sheetUrl(){
  let u='';try{u=localStorage.getItem(SHEET_KEY)||''}catch{}
  u=u||(typeof SHEET_URL==='string'?SHEET_URL:'');
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u)?u:'';
}
function setSheetUrl(u){
  u=String(u||'').trim();
  if(u&&!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u)){toast(t('eUrl'),1);return false}
  localStorage.setItem(SHEET_KEY,u);return true;
}

/* 評価者名（一度入れたら端末に記憶） */
function getEvaluator(){try{return localStorage.getItem(EV_KEY)||''}catch{return''}}
function setEvaluator(n){localStorage.setItem(EV_KEY,String(n||'').trim())}

/* ==============================================================
   受験者名簿: [{name, farm, works:[workId...], common?}]（シートの作業名/No./IDをカタログのIDへ解決）
   被評価者名が「（農場共通）」の行 = その農場で作業を個別に決めていない人に使う作業
   ============================================================== */
function resolveWork(v){
  const s=String(v||'').trim();if(!s)return null;
  const byId=workById(s);if(byId)return byId.id;
  const w=WORKDATA_V2.works.find(w=>w.name===s)
    ||WORKDATA_V2.works.find(w=>(w.no||'').replace(/^No\.?0*/,'')===s.replace(/^No\.?0*/i,''));
  return w?w.id:null;
}
function isCommonRow(n){return /^[（(]?\s*農場共通\s*[）)]?$/.test(String(n||'').trim())}
/* 名前から農場を引くのは「名簿にその名前が1人だけ」の時だけ（同名が2農場にいたら決めつけない） */
function rosterFarmOf(name){const hs=getRoster().list.filter(p=>p.name===name);return hs.length===1?hs[0].farm:''}
/* 電波の弱い豚舎で応答の返らない fetch を待ち続けないよう、時間で打ち切る */
const ROSTER_TIMEOUT_MS=8000,SEND_TIMEOUT_MS=20000;
async function fetchT(url,opt,ms){
  const ac=typeof AbortController==='function'?new AbortController():null;
  const tm=ac?setTimeout(()=>ac.abort(),ms):null;
  try{return await fetch(url,{...(opt||{}),...(ac?{signal:ac.signal}:{})})}
  finally{if(tm)clearTimeout(tm)}
}
let rosterLoading=false,rosterErr=false;   // 読み込み中 / 直近の読み込みが失敗
function getRoster(){try{const r=JSON.parse(localStorage.getItem(ROSTER_KEY));return r&&Array.isArray(r.list)?r:{list:[],at:''}}catch{return{list:[],at:''}}}
async function fetchRoster(){
  const u=sheetUrl();if(!u)return{ok:false,reason:'nourl'};
  try{
    const res=await fetchT(u+'?action=roster',{cache:'no-store'},ROSTER_TIMEOUT_MS);
    const j=await res.json();
    if(!j||!j.ok||!Array.isArray(j.roster))return{ok:false,reason:'bad'};
    const unknown=[],common={},seen=new Set();
    const all=j.roster.map(p=>{
      const works=[];
      (p.works||[]).forEach(v=>{const id=resolveWork(v);if(id){if(!works.includes(id))works.push(id)}else unknown.push(String(v))});
      return{name:String(p.name||'').trim(),farm:String(p.farm||'').trim(),works};
    }).filter(p=>p.name);
    all.forEach(p=>{if(isCommonRow(p.name))common[p.farm]=p.works});
    const list=[];
    all.forEach(p=>{
      if(isCommonRow(p.name))return;
      const k=p.farm+'\u0000'+p.name;if(seen.has(k))return;seen.add(k);   // 同じ農場の同名行は先勝ち
      if(!p.works.length&&common[p.farm]&&common[p.farm].length)list.push({...p,works:common[p.farm].slice(),common:true});
      else list.push(p);
    });
    localStorage.setItem(ROSTER_KEY,JSON.stringify({list,at:new Date().toISOString()}));
    return{ok:true,list,unknown};
  }catch(e){return{ok:false,reason:'net'}}
}

/* ==============================================================
   送信（記録IDで上書きされるので、再送・編集後の送り直しで重複しない）
   ============================================================== */
function toPayload(r){
  return{id:r.id,date:r.date,evaluator:r.evaluator,evaluatee:r.evaluatee,farm:r.farm||'',overall:r.overall||'',
    works:(r.works||[]).map(we=>{
      const w=workById(we.workId);
      const c=WORKDATA_V2.categories.find(c=>c.id===(we.category||(w&&w.category)));
      return{workName:we.workName||(w&&w.name)||'',category:c?c.name:(we.category||''),
        items:(w?w.aspects:[]).map(a=>({aspect:a.name,score:(we.scores||{})[a.id],comment:(we.comments||{})[a.id]||''}))};
    })};
}
async function sendRec(r){
  const u=sheetUrl();if(!u)return false;
  try{
    // text/plain の単純リクエスト（プリフライト無し）でGASへPOST
    // 打ち切り後に届いていても、同じ記録IDで上書きされるので再送で重複しない
    const res=await fetchT(u,{method:'POST',body:JSON.stringify({action:'submit',record:toPayload(r)})},SEND_TIMEOUT_MS);
    const j=await res.json();
    return !!(j&&j.ok&&j.id===r.id);
  }catch(e){return false}
}
let syncing=false;
async function syncPending(silent){
  if(syncing||!sheetUrl())return;
  const pend=getAll().filter(r=>!r.sent);
  if(!pend.length){updSyncUI();return}
  syncing=true;updSyncUI();
  let ok=0;
  for(const r of pend){
    if(await sendRec(r)){
      const all=getAll();const i=all.findIndex(e=>e.id===r.id);
      // 送信中に編集されていたら（updatedAtが変わっていたら）未送信のまま残す
      if(i>-1&&(all[i].updatedAt||'')===(r.updatedAt||'')){all[i].sent=true;putAll(all)}
      ok++;
    }
  }
  syncing=false;updSyncUI();
  const left=getAll().filter(r=>!r.sent).length;
  if(!silent||ok)toast(left?t('tSendFail')+' ('+left+')':t('tSent'),!!left);
  if(document.getElementById('pgHi').classList.contains('on'))drawHist();
}
function updSyncUI(){
  const n=getAll().filter(r=>!r.sent).length;
  const el=document.getElementById('syncBar');if(!el)return;
  if(!sheetUrl()){el.className='syncbar off';el.innerHTML=`<span>${esc(t('noSheet'))}</span>`;return}
  if(syncing){el.className='syncbar busy';el.innerHTML=`<span>${esc(t('sending'))}</span>`;return}
  if(!n){el.className='syncbar ok';el.innerHTML=`<span>✓ ${esc(t('allSent'))}</span>`;return}
  el.className='syncbar warn';
  el.innerHTML=`<span>${esc(t('unsent'))}: ${n}</span><button class="b b1 b-slim" onclick="syncPending()">${esc(t('btnResend'))}</button>`;
}
window.addEventListener('online',()=>syncPending(true));
