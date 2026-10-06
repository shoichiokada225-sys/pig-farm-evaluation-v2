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
  const before=sheetUrl();
  // 未送信の記録は新しい送信先へ送られる（削除待ちは、消す行がある元の送信先へ送る）。変える前に確かめる
  if(u!==before&&typeof pendCount==='function'&&getAll().some(r=>!r.sent)&&!confirm(t('cUrlPend').replace('{n}',getAll().filter(r=>!r.sent).length)))return false;
  localStorage.setItem(SHEET_KEY,u);
  // 送信先が変わったら、前のシートの名簿（と版の情報）は捨てる＝別のシートの人名・農場で採点させない。記録（jitsugi_v2_records）には触れない
  if(sheetUrl()!==before){try{localStorage.removeItem(ROSTER_KEY)}catch{}setSheetState('',null)}
  return true;
}

/* 合言葉（シートの GAS が APP_TOKEN を持つ時に必須）。配布リンク …/#k=合言葉 を開くと端末に記憶し、アドレスからは消す。設定タブでも入れられる */
const TOK_KEY='jitsugi_v2_k';
function getTok(){try{return localStorage.getItem(TOK_KEY)||''}catch{return''}}
function setTok(v){try{v=String(v||'').trim();v?localStorage.setItem(TOK_KEY,v):localStorage.removeItem(TOK_KEY)}catch{}}
function takeTokHash(){
  const m=/(?:^#|&)k=([^&]*)/.exec(location.hash||'');if(!m)return false;
  let v=m[1];try{v=decodeURIComponent(v)}catch{}   // 壊れたエンコードでも、そのままの値を使い、アドレスからは必ず消す
  if(v)setTok(v);
  try{history.replaceState(null,'',location.pathname+location.search)}catch{}
  return !!v;
}
takeTokHash();
// 開いたままのアプリでリンクを開き直した時も（hashchange）。新しい合言葉ですぐ名簿を取り直し、未送信を送る
window.addEventListener('hashchange',()=>{if(takeTokHash()&&typeof reloadRoster==='function'){const c=document.getElementById('cfgTok');if(c)c.value=getTok();reloadRoster();syncPending(true)}});

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
/* 農場名の照合 normFarm・名前の照合 nmKey は person.js（人の特定の規則と同じもの） */
function isCommonRow(n){const s=String(n||'').normalize('NFKC').replace(/\s+/g,'');return /農場共通/.test(s)&&s.replace(/[\[\]（）()【】〔〕［］「」『』<>＜＞{}]/g,'')==='農場共通'}   // 【農場共通】など括弧の種類が違っても共通行
/* 電波の弱い豚舎で応答の返らない fetch を待ち続けないよう、時間で打ち切る */
const ROSTER_TIMEOUT_MS=8000,SEND_TIMEOUT_MS=20000;
/* 応答の本文を読み終えるまでを1つの期限で打ち切る（ヘッダーだけ届いて本文が止まると、送信・名簿の取得が永久に「中」のままになる）
   戻り値 {res, text}。期限切れ・通信失敗は例外 */
async function fetchTxt(url,opt,ms){
  const ac=typeof AbortController==='function'?new AbortController():null;
  let tm=null;
  const limit=new Promise((_,rej)=>{tm=setTimeout(()=>{try{if(ac)ac.abort()}catch(e){}rej(new Error('timeout'))},ms)});
  try{
    return await Promise.race([(async()=>{const res=await fetch(url,{...(opt||{}),...(ac?{signal:ac.signal}:{})});return{res,text:await res.text()}})(),limit]);
  }finally{clearTimeout(tm)}
}
let rosterLoading=false,rosterErr=false;   // 読み込み中 / 直近の読み込みが失敗
/* 直近の名簿取得の失敗理由（''=失敗していない / 'net'=電波・通信 / 'nosheet'=受験者タブが無い（setup 未実行）/ 'bad'=応答が不正（GASの版・デプロイ違い））
   と、その応答が名乗った GAS の版（古い GAS の判定用）。電波では直らない nosheet/bad は、画面にも同期バーにも残す */
let rosterErrReason='',rosterErrGas=null,sheetReached=false;   // sheetReached: 名簿の取得（net）に失敗した後、送信がシートに届いた
function setSheetState(reason,gas){rosterErrReason=reason||'';rosterErrGas=gas||null;rosterErr=!!reason;sheetReached=false}
/* 名簿キャッシュ: 取得元の url を持つ。今の送信先と違うシートの名簿は表示しない（url の無い旧キャッシュは今の送信先のものとして読む＝互換） */
function getRoster(){
  const none={list:[],at:''};
  try{const r=JSON.parse(localStorage.getItem(ROSTER_KEY));if(!r||!Array.isArray(r.list))return none;if(r.url&&r.url!==sheetUrl())return none;
    // 壊れた要素（null・作業が配列でない）で起動できなくならないよう、形をそろえる
    r.list=r.list.filter(p=>p&&typeof p==='object'&&p.name).map(p=>({...p,name:String(p.name),farm:String(p.farm||''),works:Array.isArray(p.works)?p.works:[],...(Array.isArray(p.aliases)?{}:{aliases:undefined})}));
    if(r.done!=null&&!Array.isArray(r.done))r.done=null;
    return r}catch{return none}
}
/* 名簿を取り直す。0件が返った時は前回の名簿（1件以上）を上書きしない（貼り替え中・タブ取り違えで全員が消えないように）
   戻り値 {ok, list, unknown:[{name,farm,work}], dup:[{name,farm}], cdup:[共通行が2行以上の農場], corphan:[受験者と一致しない共通行の農場], keptEmpty?} / {ok:false, reason:'nourl'|'bad'|'nosheet'|'net'} */
async function fetchRoster(){
  const u=sheetUrl();if(!u)return{ok:false,reason:'nourl'};
  let j,tx;
  try{tx=(await fetchTxt(u+'?action=roster'+(getTok()?'&k='+encodeURIComponent(getTok()):''),{cache:'no-store'},ROSTER_TIMEOUT_MS)).text}catch(e){return{ok:false,reason:'net'}}
  // 届いたが JSON でない（doGet の無い版・誤った版のエラーページ）・HTTP エラー = シート側の問題（電波では直らない）
  try{j=JSON.parse(tx)}catch(e){return{ok:false,reason:'bad'}}
  const jg=j&&typeof j==='object'&&(j.version||Array.isArray(j.capabilities))?gasInfo(j):null;
  if(j&&j.ok===false&&j.error==='no roster sheet')return{ok:false,reason:'nosheet',gas:jg};
  if(j&&j.ok===false&&j.error==='auth')return{ok:false,reason:'auth',gas:jg};   // 合言葉が無い・違う（電波では直らない）
  if(!j||!j.ok||!Array.isArray(j.roster))return{ok:false,reason:'bad',gas:jg};
  try{
    const gas=gasInfo(j);   // シート側の版と機能（古い GAS は旧名・削除が使えない → 警告）
    const unknown=[],dup=[],common={},seen=new Set();
    const all=j.roster.map(p=>{
      const raw=String(p&&p.name||'').trim(),name=raw.replace(/[\s\u3000]+/g,' ').trim(),farm=String(p&&p.farm||'').trim(),works=[],unresolved=[];   // セル内改行・全角空白は1つの半角空白（手入力・保存の名前とそろう）
      // 旧名（別名）: 名前を直した人の、直す前の名前で保存した記録も「済」に数える
      const aliases=(Array.isArray(p&&p.aliases)?p.aliases:String(p&&p.aliases||'').split(/[、,，\/／;；\n]/)).map(a=>String(a==null?'':a).trim()).filter(a=>a&&a!==name);
      (p&&Array.isArray(p.works)?p.works:[]).forEach(v=>{
        const raw=String(v==null?'':v).trim();if(!raw)return;
        const id=resolveWork(raw);
        if(id){if(!works.includes(id))works.push(id)}
        else if(!unresolved.includes(raw))unresolved.push(raw);
      });
      if(name)unresolved.forEach(w=>unknown.push({name,farm,work:w}));
      return{name,farm,works,unresolved,aliases,...(raw!==name?{raw}:{})};
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
      const k=JSON.stringify([normFarm(p.farm),nmKey(p.name)]);   // 同じ人か＝person.js と同じそろえ方
      if(seen.has(k)){if(!dup.some(d=>d.name===p.name&&d.farm===p.farm))dup.push({name:p.name,farm:p.farm});return}   // 同じ農場の同名行: 2行目以降は区別できないので警告
      seen.add(k);
      const e={name:p.name,farm:p.farm,works:p.works,...(p.raw?{raw:p.raw}:{})};   // raw=シートのセルの表記（改行・全角空白入り）
      if(p.aliases.length)e.aliases=p.aliases;
      const c=common[normFarm(p.farm)];
      if(p.unresolved.length)e.unresolved=p.unresolved;
      else if(!p.works.length&&c&&(c.works.length||c.unresolved.length)){
        // 共通行に不明な作業名があれば、その人のタブにも ⚠（解決できた分だけを黙って配らない。評価者が作業選択で補う）
        e.works=c.works.slice();e.common=true;if(c.unresolved.length)e.unresolved=c.unresolved.slice();
      }
      list.push(e);
    });
    // シートの記録の要約（ほかの端末で済んだ人・作業）。古い GAS は返さない＝null（この端末の記録だけで数える）
    const done=parseSheetDone(j.done);
    const prev=getRoster();
    if(!list.length&&prev.list.length){
      try{localStorage.setItem(ROSTER_KEY,JSON.stringify({...prev,gas,url:u,done}))}catch{}
      return{ok:true,list:prev.list,unknown:prev.unknown||[],dup:prev.dup||[],cdup:prev.cdup||[],corphan:prev.corphan||[],fvar:prev.fvar||[],gas,keptEmpty:true};
    }
    try{localStorage.setItem(ROSTER_KEY,JSON.stringify({list,at:new Date().toISOString(),unknown,dup,cdup,corphan,fvar,gas,url:u,done}))}catch{}
    return{ok:true,list,unknown,dup,cdup,corphan,fvar,gas};
  }catch(e){return{ok:false,reason:'bad',gas:jg}}
}
/* GAS の done（[{id,date,name,farm,works:[作業名]}]）→ 記録の形 [{id,date,evaluatee,farm,works:[{workId}],sheet:true}]（作業名はカタログのIDへ。解決できない作業は数えない）。
   配列でなければ null（シートが要約を返さない＝古い GAS） */
function parseSheetDone(a){
  if(!Array.isArray(a))return null;
  const out=[];
  a.slice(0,20000).forEach(o=>{
    if(!o||typeof o!=='object')return;
    const id=sanitizeId(String(o.id||'')),date=String(o.date||''),name=String(o.name||'').trim();
    if(!id||!name||!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
    const ws=[];(Array.isArray(o.works)?o.works:[]).forEach(v=>{const w=resolveWork(v);if(w&&!ws.some(x=>x.workId===w))ws.push({workId:w})});
    if(ws.length)out.push({id,date,evaluatee:name,farm:String(o.farm||'').trim(),works:ws,sheet:true});
  });
  return out;
}
/* この端末で消した記録を、名簿と一緒に取ったシートの要約からも外す（次に名簿を取るまで「済」に数えない） */
function dropSheetDone(id){
  try{const r=JSON.parse(localStorage.getItem(ROSTER_KEY));if(!r||!Array.isArray(r.done))return;
    r.done=r.done.filter(x=>x.id!==id);localStorage.setItem(ROSTER_KEY,JSON.stringify(r))}catch{}
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
    const b=fs.find(b=>b!==a&&cnt.get(b)>cnt.get(a)&&core(b)===ca);   // 「大田原」と「大田原農場」だけ（「第二テスト農場」と「テスト農場」は別の農場）
    if(b)out.push({farm:a,n:cnt.get(a),like:b});
  });
  return out;
}
/* 名簿の警告（誰の・何が）。max を渡すと各項目をその件数で打ち切り「…+残り」 */
function rosterWarnText(r,max,noFvar){
  const u=r&&r.unknown||[],d=r&&r.dup||[],cd=r&&r.cdup||[],co=r&&r.corphan||[],fv=r&&r.fvar||[];const parts=[];
  const cut=a=>max&&a.length>max?a.slice(0,max).join(listSep())+' …+'+(a.length-max):a.join(listSep());
  const fn=f=>f||t('farmNone');
  if(u.length)parts.push(t('eUnknownWork')+' ('+u.length+'): '+cut(u.map(x=>x.name+(isCommonRow(x.name)&&x.farm?paren(x.farm):'')+': '+x.work)));
  if(d.length)parts.push(t('eDupName')+' ('+d.length+'): '+cut(d.map(x=>x.name+(x.farm?paren(x.farm):''))));
  if(cd.length)parts.push(t('eCommonDup')+' ('+cd.length+'): '+cut(cd.map(fn)));
  if(co.length)parts.push(t('eCommonOrphan')+' ('+co.length+'): '+cut(co.map(fn)));
  if(r&&gasMissing(r.gas).length)parts.push(t('eGasOld').replace('{v}',r.gas.version||'?'));
  if(fv.length&&!noFvar)parts.push(t('eFarmVar')+' ('+fv.length+'): '+cut(fv.map(x=>'「'+x.farm+'」('+x.n+') ≈ 「'+x.like+'」')));
  return parts.join(' ／ ');
}

/* ==============================================================
   送信（記録IDで上書きされるので、再送・編集後の送り直しで重複しない）
   ============================================================== */
/* 送る形（toPayload・submitReq・deleteReq）は contract.js */
/* 直近の送信の失敗理由: 'net'=電波・打ち切り / 'auth'=合言葉 / 'sheet'=シート側（応答が JSON でない・HTTP エラー・GAS のエラー・0行） */
let sendErr='';
function noteSendErr(why){if(why==='auth'||why==='sheet'||!sendErr)sendErr=why}
async function postJ(body,url){
  const u=url||sheetUrl();if(!u)return null;
  let tx;
  try{tx=(await fetchTxt(u,{method:'POST',body:JSON.stringify({...body,...(getTok()?{k:getTok()}:{})})},SEND_TIMEOUT_MS)).text}catch(e){noteSendErr('net');return null}   // 本文が途中で止まった時も期限で打ち切る
  let j;try{j=JSON.parse(tx)}catch(e){noteSendErr('sheet');return null}   // ログイン画面・HTTP エラー等（電波ではない）
  if(j&&j.ok===false){noteSendErr(j.error==='auth'?'auth':j.error==='busy'?'net':'sheet')}
  return j;
}
async function sendRec(r){
  // text/plain の単純リクエスト（プリフライト無し）でGASへPOST
  // 打ち切り後に届いていても、同じ記録IDで上書きされるので再送で重複しない
  lastGone=false;
  const req=submitReq(r),j=await postJ(req);
  if(!j||!j.ok||j.id!==r.id)return false;
  // シートに新しい版がある（古いバックアップの復元・遅れて届いた再送）: 上書きしていない。この端末の古い版は送り済みとして扱い、知らせる
  lastGone=j.stale==='deleted';
  if(j.stale){(lastGone?sendNotes.gone:sendNotes.stale).add(r.evaluatee||r.id);return true}
  // 別の記録が同じ人・同じ作業を採点している（別の端末の二重採点）: 送信は成功。知らせて集計で確かめてもらう
  if(Array.isArray(j.dups)&&j.dups.length)sendNotes.dup.add((r.evaluatee||'')+': '+j.dups.join(listSep()));
  // 書いた行が0（応答の rows を返す GAS で、送った種目があるのに0行）は届いていない扱い
  const want=req.record.works.reduce((n,w)=>n+w.items.length,0);
  if(typeof j.rows==='number'&&want>0&&j.rows<1){noteSendErr('sheet');return false}
  if(rosterErrReason==='net')sheetReached=true;   // 名簿は取れなかったが、その後シートに届いた
  return true;
}
/* ==============================================================
   削除待ち（送信済みかもしれない記録を端末で消した時、シートの行も消す）
   記録本体とは別のキーに置く（記録の形式は変えない＝旧データ・バックアップと互換）: [{id, evaluator, at}]
   ============================================================== */
const DEL_KEY='jitsugi_v2_deletes';
function getDels(){try{const r=JSON.parse(localStorage.getItem(DEL_KEY));return Array.isArray(r)?r.filter(d=>d&&typeof d.id==='string'&&d.id):[]}catch{return[]}}
function putDels(a){localStorage.setItem(DEL_KEY,JSON.stringify(a))}   // 書けなければ例外（呼び出し側で知らせる）
function queueDel(r){const a=getDels().filter(d=>d.id!==r.id);a.push({id:r.id,evaluator:r.evaluator||'',at:new Date().toISOString(),url:sheetUrl(),...(r.rv?{rv:r.rv}:{})});putDels(a)}   // rv: 戻しの合図（その戻しの送信が遅れて届いても生き返らせない・戻した後の削除だと GAS に分かる）   // url=行がある送信先（後で送信先を変えても、元のシートの行を消す）
/* シートに行があるかもしれない記録 = 送信済み、または一度でも送った可能性がある（編集後の未送信） */
function mayBeOnSheet(r){return !!(r&&(r.sent||r.sentOnce||r.updatedAt))}
let delOld=false;   // シート側（GAS）が削除に未対応の古い版
async function sendDel(d){
  const du=/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(d.url||'')?d.url:'';
  const j=await postJ(deleteReq(d),du);
  if(isUnsupportedOp(j))delOld=true;   // 削除を知らない古い GAS（契約は contract.js）
  const good=!!(j&&j.ok&&j.id===d.id);
  if(good&&rosterErrReason==='net')sheetReached=true;
  return good;
}
/* 最近シートから消した記録ID（1時間）。名簿の要約（done）が消す前の状態で返っても、済に数えない */
const DELD_KEY='jitsugi_v2_deleted';
function recentDeleted(){try{const a=JSON.parse(localStorage.getItem(DELD_KEY));const lim=Date.now()-3600e3;return Array.isArray(a)?a.filter(x=>x&&x.id&&Date.parse(x.at)>lim):[]}catch{return[]}}
function noteDeleted(id){try{const a=recentDeleted().filter(x=>x.id!==id);a.push({id,at:new Date().toISOString()});localStorage.setItem(DELD_KEY,JSON.stringify(a.slice(-200)))}catch{}if(typeof dropSheetDone==='function')dropSheetDone(id)}
function pendCount(){return getAll().filter(r=>!r.sent).length+getDels().length}

/* ==============================================================
   未送信の送信ループ
   - 送信中に保存・編集・削除された分も、同じループでもう一周して送る（取りこぼさない）
   - 「送信できなかった」は実際に送って失敗した件数だけ（まだ試していない分を失敗と言わない）
   ============================================================== */
let syncing=false,syncLoud=false;
const sendNotes={stale:new Set(),dup:new Set(),gone:new Set()};
let lastGone=false;   // 直前の送信が「シートで削除済み」だった（その記録に印を付ける）   // 送信の結果の知らせ（1周の終わりにまとめて出す）
async function syncPending(silent){
  if(!sheetUrl())return;
  if(!silent)syncLoud=true;
  if(syncing)return;             // 実行中のループが、増えた分を次の周で拾う
  syncing=true;sendErr='';updSyncUI();
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
          if(i>-1&&(all[i].updatedAt||'')===(r.updatedAt||'')){all[i].sent=true;all[i].sentOnce=true;delete all[i].revive;if(!lastGone)delete all[i].sheetGone;putAll(all)}
          else if(i>-1){all[i].sentOnce=true;delete all[i].revive;if(!lastGone)delete all[i].sheetGone;putAll(all)}   // シートに書けた＝削除済みの印も外す   // 戻す（revive）は最初に届いた時点で果たした＝以後の編集はふつうの送信（別の端末の削除を越えない）
          if(i>-1&&lastGone){const a2=getAll(),k=a2.findIndex(e=>e.id===r.id);if(k>-1){a2[k].sheetGone=true;putAll(a2)}if(typeof renderRoster==='function')renderRoster()}
          failed.delete(r.id);ok++;
        }else failed.add(r.id);
      }
      for(const d of dels){
        tried.add('del:'+d.id+':'+d.at);
        if(await sendDel(d)){
          putDels(getDels().filter(x=>!(x.id===d.id&&x.at===d.at)));
          noteDeleted(d.id);   // 消し終えた記録を、その後に届いた（消す前の）名簿の要約でも「済」に数えない
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
  const notes=[sendNotes.dup.size?t('wDup').replace('{x}',[...sendNotes.dup].join(' ／ ')):'',sendNotes.gone.size?t('wGone').replace('{x}',[...sendNotes.gone].join(listSep())):'',sendNotes.stale.size?t('wStale').replace('{x}',[...sendNotes.stale].join(listSep())):''].filter(Boolean).join(' ／ ');
  if(nFail&&(loud||ok)&&delOld&&[...failed].some(k=>k.startsWith('del:')&&delLeft.has(k)))toast(t('eDelOld')+(notes?' ／ '+notes:''),1,null,notes?8000:0);
  else if(nFail&&(loud||ok))toast((sendErr==='auth'?t('eAuth'):sendErr==='sheet'?t('tSendFailSheet'):t('tSendFail'))+' ('+nFail+')'+(notes?' ／ '+notes:''),1,null,notes?8000:0);   // 送れなかった知らせと、二重採点・削除済みの知らせを1つに（どちらも消さない）
  else if(sendNotes.dup.size)toast(t('wDup').replace('{x}',[...sendNotes.dup].join(' ／ ')),1,null,8000);
  else if(sendNotes.gone.size)toast(t('wGone').replace('{x}',[...sendNotes.gone].join(listSep())),1,null,6000);
  else if(sendNotes.stale.size)toast(t('wStale').replace('{x}',[...sendNotes.stale].join(listSep())),1,null,6000);
  else if(ok&&!nFail&&!(typeof toastHeld==='function'&&toastHeld()))toast(t('tSent'));   // 読ませたい知らせ（日付を今日に直した等）は消さない
  sendNotes.dup.clear();sendNotes.stale.clear();sendNotes.gone.clear();
  if(document.getElementById('pgHi').classList.contains('on'))drawHist();
  // 送信中に新しい版が入っていた（前面に戻った直後の再送と重なった）→ 送信が終わって入力途中でなければ読み込む（結果の表示を見せてから）
  if(typeof maybeReloadApp==='function'&&typeof updReady!=='undefined'&&updReady)setTimeout(maybeReloadApp,1500);
}
function updSyncUI(){
  const n=getAll().filter(r=>!r.sent).length,nd=getDels().length;
  const el=document.getElementById('syncBar');if(!el)return;
  if(!sheetUrl()){el.className='syncbar off';el.innerHTML=`<span>${esc(t('noSheet'))}</span>`;return}
  if(syncing){el.className='syncbar busy';el.innerHTML=`<span>${esc(t('sending'))}</span>`;return}
  // 送る記録が無くても、シートを確認できていない時は緑の「送信済み」にしない（シート側の問題を見落とさない）
  if(!n&&!nd&&(rosterErrReason==='nosheet'||rosterErrReason==='bad'||rosterErrReason==='auth')){el.className='syncbar warn';el.innerHTML=`<span>⚠ ${esc(t('sheetCheck'))}</span>`;return}
  if(!n&&!nd&&rosterErrReason==='net'&&!sheetReached){el.className='syncbar warn';el.innerHTML=`<span>${esc(t('sheetUnreach'))}</span>`;return}
  const ng=getAll().filter(r=>r.sheetGone).length;
  if(!n&&!nd&&ng){el.className='syncbar warn';el.innerHTML=`<span>⚠ ${esc(t('goneBar').replace('{n}',ng))}</span>`;return}   // シートで削除済みの記録がある＝「すべて送信済み」と言わない
  if(!n&&!nd){el.className='syncbar ok';el.innerHTML=`<span>✓ ${esc(t('allSent'))}</span>`;return}
  el.className='syncbar warn';
  const parts=[];if(n)parts.push(`${esc(t('unsent'))}: ${n}`);if(nd)parts.push(`${esc(t('delPend'))}: ${nd}`);if(ng)parts.push(esc(t('goneBar').replace('{n}',ng)));   // 未送信がある間も、削除済みの件数を隠さない
  el.innerHTML=`<span>${parts.join(' ／ ')}</span><button class="b b1 b-slim" onclick="syncPending()">${esc(t('btnResend'))}</button>`;
}
/* 自動再送のきっかけ: 圏外→圏内・アプリが前面に戻った時・未送信がある間は一定間隔
   （'online' は圏外→圏内でしか起きない。電波が弱い→強いでは起きないので、周期でも試す） */
let SYNC_RETRY_MS=60000,retryT=null;
function schedRetry(){
  clearTimeout(retryT);
  retryT=setTimeout(()=>{
    const vis=!(typeof document!=='undefined'&&document.visibilityState==='hidden');
    if(!syncing&&pendCount()&&sheetUrl()&&vis)syncPending(true);
    if(vis&&typeof swCheck==='function')swCheck();   // 裏に回すだけで閉じない端末にも、新しい版を届ける
    schedRetry();
  },SYNC_RETRY_MS);
}
window.addEventListener('online',()=>syncPending(true));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(pendCount())syncPending(true);bgRoster()}});
/* 名簿（ほかの端末の「済」を含む）を裏で取り直す: 2台で1農場を分けて採点しても、相手の済が数分で入る。知らせは出さない */
const ROSTER_BG_MS=180000;let _bgRosterAt=0;
function bgRoster(){
  if(!sheetUrl()||rosterLoading||typeof reloadRoster!=='function'||Date.now()-_bgRosterAt<30000)return;
  if(typeof document!=='undefined'&&document.visibilityState==='hidden')return;
  _bgRosterAt=Date.now();reloadRoster(true,true);
}
setInterval(bgRoster,ROSTER_BG_MS);
schedRetry();
