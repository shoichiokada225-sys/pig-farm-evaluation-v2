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
   受験者名簿: [{name, farm, works:[workId...], common?, unresolved?:[原文]}]（シートの作業名/No./IDをカタログのIDへ解決）
   被評価者名が「（農場共通）」の行 = その農場で作業を個別に決めていない人に使う作業
   解決できない作業名が1つでもある人には共通行を当てない（予定外の作業を黙って採点させない）
   ============================================================== */
/* 作業名の照合用: 全角半角（NFKC=かっこ・英数字）・空白・大小をそろえる */
function normWorkName(v){return String(v||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase()}
function resolveWork(v){
  const s=String(v||'').trim();if(!s)return null;
  const byId=workById(s);if(byId)return byId.id;
  const n=normWorkName(s);
  const w=WORKDATA_V2.works.find(w=>w.name===s)
    ||WORKDATA_V2.works.find(w=>normWorkName(w.name)===n)
    ||WORKDATA_V2.works.find(w=>normWorkName(w.no).replace(/^no\.?0*/,'')===n.replace(/^no\.?0*/,''));
  return w?w.id:null;
}
/* 農場名の照合用（共通行と受験者の農場の突き合わせ）: 全角半角・空白をそろえる */
function normFarm(v){return String(v||'').normalize('NFKC').replace(/\s+/g,'')}
function isCommonRow(n){return /^[（(]?\s*農場共通\s*[）)]?$/.test(String(n||'').trim())}
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
/* 名簿を取り直す。0件が返った時は前回の名簿（1件以上）を上書きしない（貼り替え中・タブ取り違えで全員が消えないように）
   戻り値 {ok, list, unknown:[{name,farm,work}], dup:[{name,farm}], cdup:[共通行が2行以上の農場], corphan:[受験者と一致しない共通行の農場], keptEmpty?} / {ok:false, reason:'nourl'|'bad'|'nosheet'|'net'} */
async function fetchRoster(){
  const u=sheetUrl();if(!u)return{ok:false,reason:'nourl'};
  try{
    const res=await fetchT(u+'?action=roster',{cache:'no-store'},ROSTER_TIMEOUT_MS);
    const j=await res.json();
    if(j&&j.ok===false&&j.error==='no roster sheet')return{ok:false,reason:'nosheet'};
    if(!j||!j.ok||!Array.isArray(j.roster))return{ok:false,reason:'bad'};
    const unknown=[],dup=[],common={},seen=new Set();
    const all=j.roster.map(p=>{
      const name=String(p&&p.name||'').trim(),farm=String(p&&p.farm||'').trim(),works=[],unresolved=[];
      // 旧名（別名）: 名前を直した人の、直す前の名前で保存した記録も「済」に数える
      const aliases=(Array.isArray(p&&p.aliases)?p.aliases:String(p&&p.aliases||'').split(/[、,，\/／;；\n]/)).map(a=>String(a==null?'':a).trim()).filter(a=>a&&a!==name);
      (p&&Array.isArray(p.works)?p.works:[]).forEach(v=>{
        const raw=String(v==null?'':v).trim();if(!raw)return;
        const id=resolveWork(raw);
        if(id){if(!works.includes(id))works.push(id)}
        else if(!unresolved.includes(raw))unresolved.push(raw);
      });
      if(name)unresolved.forEach(w=>unknown.push({name,farm,work:w}));
      return{name,farm,works,unresolved,aliases};
    }).filter(p=>p.name);
    // 人の行の農場名も全角半角・空白をそろえて1つの農場にまとめる（表記は多い方）。ゆれは警告に出す
    const fvar=farmVariants(all.filter(p=>!isCommonRow(p.name)));
    // 共通行: 農場名は作業名と同じく全角半角・空白をそろえて照合。同じ農場に2行以上あれば統合して警告（後の行で前の行を黙って消さない）
    const cdup=[],corphan=[];
    all.forEach(p=>{
      if(!isCommonRow(p.name))return;
      const k=normFarm(p.farm),c=common[k];
      if(!c){common[k]={farm:p.farm,works:p.works.slice(),unresolved:p.unresolved.slice()};return}
      if(!cdup.includes(c.farm))cdup.push(c.farm);
      p.works.forEach(w=>{if(!c.works.includes(w))c.works.push(w)});
      p.unresolved.forEach(w=>{if(!c.unresolved.includes(w))c.unresolved.push(w)});
    });
    Object.keys(common).forEach(k=>{if(!all.some(p=>!isCommonRow(p.name)&&normFarm(p.farm)===k))corphan.push(common[k].farm)});   // どの受験者とも農場名が合わない共通行
    const list=[];
    all.forEach(p=>{
      if(isCommonRow(p.name))return;
      const k=p.farm+'\u0000'+p.name;
      if(seen.has(k)){if(!dup.some(d=>d.name===p.name&&d.farm===p.farm))dup.push({name:p.name,farm:p.farm});return}   // 同じ農場の同名行: 2行目以降は区別できないので警告
      seen.add(k);
      const e={name:p.name,farm:p.farm,works:p.works};
      if(p.aliases.length)e.aliases=p.aliases;
      const c=common[normFarm(p.farm)];
      if(p.unresolved.length)e.unresolved=p.unresolved;
      else if(!p.works.length&&c&&(c.works.length||c.unresolved.length)){
        // 共通行に不明な作業名があれば、その人のタブにも ⚠（解決できた分だけを黙って配らない。評価者が作業選択で補う）
        e.works=c.works.slice();e.common=true;if(c.unresolved.length)e.unresolved=c.unresolved.slice();
      }
      list.push(e);
    });
    const prev=getRoster();
    if(!list.length&&prev.list.length)return{ok:true,list:prev.list,unknown:prev.unknown||[],dup:prev.dup||[],cdup:prev.cdup||[],corphan:prev.corphan||[],fvar:prev.fvar||[],keptEmpty:true};
    try{localStorage.setItem(ROSTER_KEY,JSON.stringify({list,at:new Date().toISOString(),unknown,dup,cdup,corphan,fvar}))}catch{}
    return{ok:true,list,unknown,dup,cdup,corphan,fvar};
  }catch(e){return{ok:false,reason:'net'}}
}
/* 農場名のゆれ: ps（人の行）の farm を書き換えてそろえ、[{farm:ゆれた表記, n:人数, like:そろえた先/似た農場}] を返す
   ① 全角半角・空白だけの違い（normFarm が同じ）→ 人数の多い表記（同数なら先の行）に統一
   ② 1〜2人しかいない農場の名前が、ほかの農場の名前を含む/含まれる（「大田原農場」と「大田原」）→ 統一はせず警告だけ */
function farmVariants(ps){
  const out=[],grp=new Map();
  ps.forEach(p=>{const k=normFarm(p.farm);if(!grp.has(k))grp.set(k,new Map());const g=grp.get(k);g.set(p.farm,(g.get(p.farm)||0)+1)});
  const canon=new Map();
  grp.forEach((g,k)=>{
    let best='',bn=-1;g.forEach((n,f)=>{if(n>bn){best=f;bn=n}});
    canon.set(k,best);
    g.forEach((n,f)=>{if(f!==best)out.push({farm:f,n,like:best})});
  });
  ps.forEach(p=>{p.farm=canon.get(normFarm(p.farm))});
  const cnt=new Map();ps.forEach(p=>cnt.set(p.farm,(cnt.get(p.farm)||0)+1));
  const fs=[...cnt.keys()].filter(f=>f&&!/未確定/.test(f));
  const core=f=>normFarm(f).replace(/農場$/,'');
  fs.forEach(a=>{
    if(cnt.get(a)>2)return;
    const ca=core(a);if(!ca)return;
    const b=fs.find(b=>b!==a&&cnt.get(b)>cnt.get(a)&&(()=>{const cb=core(b);return cb&&(ca===cb||ca.includes(cb)||cb.includes(ca))})());
    if(b)out.push({farm:a,n:cnt.get(a),like:b});
  });
  return out;
}
/* 名簿の警告（誰の・何が）。max を渡すと各項目をその件数で打ち切り「…+残り」 */
function rosterWarnText(r,max){
  const u=r&&r.unknown||[],d=r&&r.dup||[],cd=r&&r.cdup||[],co=r&&r.corphan||[],fv=r&&r.fvar||[];const parts=[];
  const cut=a=>max&&a.length>max?a.slice(0,max).join('、')+' …+'+(a.length-max):a.join('、');
  const fn=f=>f||t('farmNone');
  if(u.length)parts.push(t('eUnknownWork')+' ('+u.length+'): '+cut(u.map(x=>x.name+(isCommonRow(x.name)&&x.farm?'（'+x.farm+'）':'')+': '+x.work)));
  if(d.length)parts.push(t('eDupName')+' ('+d.length+'): '+cut(d.map(x=>x.name+(x.farm?'（'+x.farm+'）':''))));
  if(cd.length)parts.push(t('eCommonDup')+' ('+cd.length+'): '+cut(cd.map(fn)));
  if(co.length)parts.push(t('eCommonOrphan')+' ('+co.length+'): '+cut(co.map(fn)));
  if(fv.length)parts.push(t('eFarmVar')+' ('+fv.length+'): '+cut(fv.map(x=>'「'+x.farm+'」('+x.n+') ≈ 「'+x.like+'」')));
  return parts.join(' ／ ');
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
/* ==============================================================
   削除待ち（送信済みかもしれない記録を端末で消した時、シートの行も消す）
   記録本体とは別のキーに置く（記録の形式は変えない＝旧データ・バックアップと互換）: [{id, evaluator, at}]
   ============================================================== */
const DEL_KEY='jitsugi_v2_deletes';
function getDels(){try{const r=JSON.parse(localStorage.getItem(DEL_KEY));return Array.isArray(r)?r.filter(d=>d&&typeof d.id==='string'&&d.id):[]}catch{return[]}}
function putDels(a){localStorage.setItem(DEL_KEY,JSON.stringify(a))}
function queueDel(r){const a=getDels().filter(d=>d.id!==r.id);a.push({id:r.id,evaluator:r.evaluator||'',at:new Date().toISOString()});putDels(a)}
/* シートに行があるかもしれない記録 = 送信済み、または一度でも送った可能性がある（編集後の未送信） */
function mayBeOnSheet(r){return !!(r&&(r.sent||r.sentOnce||r.updatedAt))}
let delOld=false;   // シート側（GAS）が削除に未対応の古い版
async function sendDel(d){
  const u=sheetUrl();if(!u)return false;
  try{
    const res=await fetchT(u,{method:'POST',body:JSON.stringify({action:'delete',id:d.id,evaluator:d.evaluator})},SEND_TIMEOUT_MS);
    const j=await res.json();
    if(j&&j.ok===false&&j.error==='bad request')delOld=true;
    return !!(j&&j.ok&&j.id===d.id);
  }catch(e){return false}
}
function pendCount(){return getAll().filter(r=>!r.sent).length+getDels().length}

/* ==============================================================
   未送信の送信ループ
   - 送信中に保存・編集・削除された分も、同じループでもう一周して送る（取りこぼさない）
   - 「送信できなかった」は実際に送って失敗した件数だけ（まだ試していない分を失敗と言わない）
   ============================================================== */
let syncing=false,syncLoud=false;
async function syncPending(silent){
  if(!sheetUrl())return;
  if(!silent)syncLoud=true;
  if(syncing)return;             // 実行中のループが、増えた分を次の周で拾う
  syncing=true;updSyncUI();
  const tried=new Set();         // 今回のループで試した版（記録ID＋更新時刻）
  const failed=new Set();
  let ok=0;
  try{
    for(;;){
      const dels=getDels().filter(d=>!tried.has('del:'+d.id+':'+d.at));
      const pend=getAll().filter(r=>!r.sent&&!tried.has('rec:'+r.id+':'+(r.updatedAt||'')));
      if(!dels.length&&!pend.length)break;
      for(const r of pend){
        const k='rec:'+r.id+':'+(r.updatedAt||'');tried.add(k);
        if(getDels().some(d=>d.id===r.id))continue;   // 送る前に削除された
        if(await sendRec(r)){
          const all=getAll();const i=all.findIndex(e=>e.id===r.id);
          // 送信中に編集されていたら（updatedAtが変わっていたら）未送信のまま残す＝次の周で送る
          if(i>-1&&(all[i].updatedAt||'')===(r.updatedAt||'')){all[i].sent=true;all[i].sentOnce=true;putAll(all)}
          else if(i>-1&&!all[i].sentOnce){all[i].sentOnce=true;putAll(all)}
          failed.delete(r.id);ok++;
        }else failed.add(r.id);
      }
      for(const d of dels){
        tried.add('del:'+d.id+':'+d.at);
        if(await sendDel(d)){
          putDels(getDels().filter(x=>!(x.id===d.id&&x.at===d.at)));
          failed.delete('del:'+d.id);ok++;
        }else failed.add('del:'+d.id);
      }
      updSyncUI();
    }
  }finally{syncing=false}
  updSyncUI();
  // まだ未送信で、今回実際に送って失敗したものだけを数える
  const recLeft=new Set(getAll().filter(r=>!r.sent).map(r=>r.id)),delLeft=new Set(getDels().map(d=>'del:'+d.id));
  const nFail=[...failed].filter(k=>recLeft.has(k)||delLeft.has(k)).length;
  const loud=syncLoud;syncLoud=false;
  if(nFail&&(loud||ok)&&delOld&&[...failed].some(k=>k.startsWith('del:')&&delLeft.has(k)))toast(t('eDelOld'),1);
  else if(nFail&&(loud||ok))toast(t('tSendFail')+' ('+nFail+')',1);
  else if(ok&&!nFail)toast(t('tSent'));
  if(document.getElementById('pgHi').classList.contains('on'))drawHist();
}
function updSyncUI(){
  const n=getAll().filter(r=>!r.sent).length,nd=getDels().length;
  const el=document.getElementById('syncBar');if(!el)return;
  if(!sheetUrl()){el.className='syncbar off';el.innerHTML=`<span>${esc(t('noSheet'))}</span>`;return}
  if(syncing){el.className='syncbar busy';el.innerHTML=`<span>${esc(t('sending'))}</span>`;return}
  if(!n&&!nd){el.className='syncbar ok';el.innerHTML=`<span>✓ ${esc(t('allSent'))}</span>`;return}
  el.className='syncbar warn';
  const parts=[];if(n)parts.push(`${esc(t('unsent'))}: ${n}`);if(nd)parts.push(`${esc(t('delPend'))}: ${nd}`);
  el.innerHTML=`<span>${parts.join(' ／ ')}</span><button class="b b1 b-slim" onclick="syncPending()">${esc(t('btnResend'))}</button>`;
}
/* 自動再送のきっかけ: 圏外→圏内・アプリが前面に戻った時・未送信がある間は一定間隔
   （'online' は圏外→圏内でしか起きない。電波が弱い→強いでは起きないので、周期でも試す） */
let SYNC_RETRY_MS=60000,retryT=null;
function schedRetry(){
  clearTimeout(retryT);
  retryT=setTimeout(()=>{
    if(!syncing&&pendCount()&&sheetUrl()&&!(typeof document!=='undefined'&&document.visibilityState==='hidden'))syncPending(true);
    schedRetry();
  },SYNC_RETRY_MS);
}
window.addEventListener('online',()=>syncPending(true));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&pendCount())syncPending(true)});
schedRetry();
