/* app.js — アプリ層：初期化・言語・作業選択・入力/保存/編集フロー */
/* ==============================================================
   言語
   ============================================================== */
function setLang(l){
  lang=l;localStorage.setItem(LKEY,l);document.documentElement.lang=l;
  let lbOn=null;
  document.querySelectorAll('#lswMenu button').forEach(b=>{const on=b.getAttribute('lang')===l;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);if(on)lbOn=b});
  const lb=document.getElementById('lswBtn'),lc=document.getElementById('lswCur');
  if(lbOn&&lc)lc.textContent=lbOn.dataset.code;
  if(lbOn&&lb)lb.setAttribute('aria-label','Language: '+lbOn.querySelector('.lsw-nm').textContent);
  closeLangMenu();
  applyT();buildWorkSel();buildCards();restoreSt();renderEvaluator();renderRoster();updSyncUI();renderVer();renderStore();
  const cur=document.querySelector('.tabs button.on');
  if(cur&&cur.dataset.pg==='pgHi')drawHist();
  if(cur&&cur.dataset.pg==='pgCh'){populateChWork();drawCharts()}
}
/* 言語メニュー（今の言語の1ボタン → 4言語）。外側を押す・Esc で閉じる */
function toggleLangMenu(){
  const m=document.getElementById('lswMenu');if(!m)return;
  if(!m.hidden){closeLangMenu(true);return}
  m.hidden=false;document.getElementById('lswBtn').setAttribute('aria-expanded','true');
  const on=m.querySelector('button.on')||m.querySelector('button');if(on)on.focus();
}
function closeLangMenu(refocus){
  const m=document.getElementById('lswMenu'),b=document.getElementById('lswBtn');if(!m||m.hidden)return;
  const had=m.contains(document.activeElement);
  m.hidden=true;if(b){b.setAttribute('aria-expanded','false');if(refocus||had)b.focus()}
}
document.addEventListener('click',e=>{const w=document.querySelector('.lsw');if(w&&!w.contains(e.target))closeLangMenu()});
document.addEventListener('focusin',e=>{const w=document.querySelector('.lsw');if(w&&!w.contains(e.target))closeLangMenu()});   // Tab でメニューの外へ出たら閉じる
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const m=document.getElementById('lswMenu');if(m&&!m.hidden){e.preventDefault();closeLangMenu(true)}}});
function applyT(){
  document.querySelectorAll('[data-t]').forEach(el=>{el.textContent=t(el.dataset.t)});
  document.querySelectorAll('[data-ph]').forEach(el=>{el.placeholder=t(el.dataset.ph)});
  document.getElementById('btnSave').textContent=editId?t('btnUpdate'):t('btnSave');
  document.getElementById('hFil').setAttribute('aria-label',t('filterLbl'));
  document.querySelectorAll('[data-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.aria)));   // 読み上げの名前も言語に追従
}

/* ==============================================================
   初期化
   ============================================================== */
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('fDate').value=startDate();
  document.getElementById('fDate').max=todayLocal();   // 未来の評価日は選べない（日をまたいだ時は refreshDate で更新）   // 今日（評価者が今日選んだ日付があればその日付＝送信後の再読み込みでも戻さない）
  renderVer();
  setLang(lang);
  try{restoreDraft()}catch(e){   // 壊れた下書きで起動（名簿・再送・更新の確認）を止めない。中身は控えに残す
    try{localStorage.setItem(DRAFT_KEY+'_broken_'+Date.now(),localStorage.getItem(DRAFT_KEY)||'');localStorage.removeItem(DRAFT_KEY)}catch(e2){}
  }
  document.getElementById('fEv').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commitEvaluator()}});
  // 「決定」やEnterを押さずにキーボードを閉じた・次へ進んだ時も、打った名前を確定する（iOSの「完了」や画面外のタップではEnterが出ない）
  document.getElementById('fEv').addEventListener('change',()=>adoptTypedEvaluator(true));
  document.getElementById('fDate').addEventListener('change',()=>{noteUserDate();renderRoster()});
  document.getElementById('fDate').addEventListener('input',noteUserDate);
  // 開いたまま日をまたいだ端末（iOS がメモリに残したまま翌朝に前面へ）: 既定の日付を今日へ
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshDate()});
  document.getElementById('fEe').addEventListener('input',e=>{curEe.name=e.target.value.trim();renderRoster()});   // 手入力・編集中に名前を直した
  document.getElementById('cfgUrl').value=sheetUrl();
  document.getElementById('cfgTok').value=getTok();
  document.getElementById('cfgExamStart').value=examStart();
  document.getElementById('cfgExamStart').max=todayLocal();
  document.getElementById('eeFind').addEventListener('input',e=>{eeQuery=e.target.value;renderRoster()});
  // 名簿の取得と未送信の再送は並行（電波が弱くて名簿が返らなくても再送は止めない）
  reloadRoster(true);syncPending(true);
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
  refreshSel();
  // PWAショートカット等のディープリンク（#pgHi=履歴 / #pgCh=グラフ）
  const applyDeepLink=()=>{
    const dl=location.hash.slice(1);
    if(dl==='pgHi'||dl==='pgCh'){
      const b=document.querySelector(`.tabs button[data-pg="${dl}"]`);if(b)swTab(b);
      history.replaceState(null,'',location.pathname+location.search);
    }
  };
  applyDeepLink();
  window.addEventListener('hashchange',applyDeepLink);
  // モーダル: Escで閉じる・Tabフォーカストラップ
  const mo=document.getElementById('modal');
  // Esc は文書全体で受ける（本文の文字を押してフォーカスがモーダルの外に出ても閉じる）
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mo.classList.contains('show')){e.preventDefault();closeMo()}});
  mo.addEventListener('keydown',e=>{
    if(e.key==='Escape')return;
    if(e.key!=='Tab')return;
    const f=[...mo.querySelectorAll('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
    if(!f.length)return;
    const first=f[0],last=f[f.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  });
  fixProg();window.addEventListener('resize',()=>{fixProg();if(typeof fitSl==='function')fitSl()});
  initSW();initStorage();
});

/* ==============================================================
   アプリの更新（Service Worker）・版の表示・端末の保存の保護
   ============================================================== */
let swReg=null,swVer='',updReady=false,swReloading=false,_swChkAt=0;
/* 設定タブの版表示: 「APP 動いているコードの版 / DATA 評価項目の版」。SW が別の版を持っていれば「更新待ち」も出す */
function renderVer(){
  const el=document.getElementById('dataVer');if(!el)return;
  const app=typeof APP_VER==='string'?APP_VER:'-';
  let s='APP '+app+' / DATA '+(WORKDATA_V2.version||'-')+' / '+WORKDATA_V2.works.length+t('worksUnit');
  if(swVer&&swVer!==app)s+=' — '+t('swWait').replace('{v}',swVer);
  el.textContent=s;
}
function askSwVer(){
  const c=navigator.serviceWorker&&navigator.serviceWorker.controller;if(!c||typeof MessageChannel==='undefined')return;
  const ch=new MessageChannel();
  ch.port1.onmessage=e=>{if(e.data&&typeof e.data.cache==='string'){swVer=e.data.cache;renderVer()}};
  try{c.postMessage({type:'ver'},[ch.port2])}catch(e){}
}
/* 新しい版を確かめる（前面に戻った時・60秒ごとの再送の時）。連打しない（10秒に1回まで）・圏外の失敗は無視 */
function swCheck(force){
  if(!swReg||(!force&&Date.now()-_swChkAt<10000))return;
  _swChkAt=Date.now();
  try{const p=swReg.update();if(p&&p.catch)p.catch(()=>{})}catch(e){}
}
/* 採点途中（入力あり・編集中・送信中）でなければ、新しい版をすぐ読み込む。途中なら案内だけ出す */
/* 評価日が読み込み後に戻らない値（選んだ日付を端末に覚えられなかった等）の時も、黙って読み込まない（今日に戻して記録が2つの日付に分かれないように） */
function busyForReload(){
  const ae=document.activeElement,fEv=document.getElementById('fEv'),evOpen=document.getElementById('evEdit').style.display!=='none';
  return !!(dirty||editId||(typeof syncing!=='undefined'&&syncing)||document.getElementById('fDate').value!==startDate()
    ||(evOpen&&fEv.value.trim()&&fEv.value.trim()!==getEvaluator())   // 評価者名を打ちかけ
    ||(ae&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))              // 入力中
    ||document.getElementById('pgCfg').classList.contains('on'));     // 設定タブを開いている（送信先・合言葉の入力中）
}
function maybeReloadApp(){
  if(!updReady||swReloading)return;
  if(busyForReload()){document.getElementById('updBar').hidden=false;return}
  reloadApp();
}
function reloadApp(){
  if(swReloading)return;
  if(dirty){saveDraft();dirty=false}   // 入力途中は下書きに残す（読み込み後に復元される）＝「変更が保存されない」確認を出さない
  swReloading=true;location.reload();
  setTimeout(()=>{swReloading=false},4000);   // 読み込みが始まらなかった（取り消された）時は、次の機会にまた読み込めるように
}
function initSW(){
  renderA2hs();
  if(!('serviceWorker' in navigator))return;
  const sw=navigator.serviceWorker;
  // 初めての登録（まだSWに制御されていない）で起きる controllerchange は、新しい版ではない
  let hadCtl=!!sw.controller;
  sw.addEventListener('controllerchange',()=>{
    askSwVer();
    if(!hadCtl){hadCtl=true;return}
    updReady=true;maybeReloadApp();
  });
  if(location.protocol==='https:'||window.__swForce)sw.register('sw.js').then(r=>{swReg=r}).catch(()=>{});
  else sw.getRegistration().then(r=>{if(r)swReg=r}).catch(()=>{});
  askSwVer();
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible')return;
    swCheck(true);maybeReloadApp();
  });
}
/* ホーム画面から開いていない（ブラウザのタブで開いている）時は、追加を案内し続ける */
function isStandalone(){
  try{if(window.navigator.standalone===true)return true;
    return ['standalone','fullscreen','minimal-ui'].some(m=>window.matchMedia&&window.matchMedia('(display-mode: '+m+')').matches)}catch(e){return false}
}
function renderA2hs(){const st=isStandalone();document.querySelectorAll('.a2hsbar').forEach(b=>{b.hidden=st})}
/* 端末の保存（未送信の記録・アプリ本体）を、容量不足などでブラウザに消されないよう保護を頼む */
let storePersist=null;   // true/false/null(確認できない)
function renderStore(){
  const el=document.getElementById('storeSt');if(!el)return;
  el.textContent=t(storePersist===true?'storeOn':storePersist===false?'storeOff':'storeNA');
  el.classList.toggle('warn',storePersist!==true);
}
function initStorage(){
  renderStore();
  const st=navigator.storage;
  if(!st||typeof st.persist!=='function')return;
  const done=v=>{storePersist=!!v;renderStore()};
  (typeof st.persisted==='function'?st.persisted():Promise.resolve(false))
    .then(p=>p?true:st.persist()).then(done).catch(()=>{});
}

/* 進捗バーは画面の上端（ヘッダーが貼り付く設定ならその下）・作業見出しは進捗バーの下に貼り付く
   （高さは言語・画面幅・未採点ボタンの有無で変わるので実測。ヘッダーは貼り付かない＝採点中は流れて消える） */
function hdrStk(){const hd=document.querySelector('.hdr');return hd&&getComputedStyle(hd).position==='sticky'?hd.offsetHeight:0}
function fixProg(){const p=document.querySelector('.prog'),h=hdrStk();if(p)p.style.top=h+'px';
  document.documentElement.style.setProperty('--stk',(h+(p?p.offsetHeight:0))+'px')}
function stkH(){return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stk'))||0}
/* 貼り付く帯（ヘッダー＋進捗＋作業見出し）の下に要素の頭が来るようにスクロール */
function scrollBelowStk(el,extra,smooth){
  window.scrollTo({top:Math.max(0,el.getBoundingClientRect().top+window.scrollY-stkH()-(extra||8)),behavior:smooth?smoothB():'auto'});
}
/* 未採点のカードへ（点数ボタンの群にフォーカス＝スクリーンリーダーはその種目名と「未採点」を読む） */
let _missAt=null;   // 最後に案内した未採点カード（「次へ」を押すとフォーカスはボタンに移るので、ここから次を数える）
function focusMiss(c){
  if(!c)return;_missAt=c;
  c.scrollIntoView({block:'center'});
  const sr=c.querySelector('.sr');if(sr)sr.focus({preventScroll:true});
}
function missNext(){
  const ms=[...document.querySelectorAll('#cards .ec.miss')];if(!ms.length)return;
  const ae=document.activeElement&&document.activeElement.closest?document.activeElement.closest('.ec'):null;
  const cur=ae||(_missAt&&document.body.contains(_missAt)?_missAt:null);
  let nx;
  if(cur){const all=[...document.querySelectorAll('#cards .ec')],ci=all.indexOf(cur);nx=ms.find(c=>all.indexOf(c)>ci)||ms[0]}
  else{const top=stkH();nx=ms.find(c=>c.getBoundingClientRect().top>top)||ms[0]}
  focusMiss(nx);
}

/* ==============================================================
   作業の選択/解除
   ============================================================== */
function toggleWork(id,on){
  if(editId){toast(t('editingBanner'),1);buildWorkSel();return}
  if(curEe.redo&&!on){toast(t('eRedoAll'),1);buildWorkSel();return}   // やり直しは作業を外せない（足すのは可）
  const had=selWorks.includes(id);
  if(on){if(!had)selWorks.push(id)}
  else selWorks=selWorks.filter(x=>x!==id);
  // その作業の区切りだけを足す/外す（ほかのカードは作り直さない＝開いた評価基準・入力中のコメント・点数はそのまま）
  saveSel();buildWorkSel();
  if(on&&!had)addWorkSec(id);else if(!on&&had)removeWorkSec(id);
  onCh();
}
function clearWorks(){
  if(!selWorks.length)return;
  if(editId){cancelEdit();return}
  if(curEe.redo){toast(t('eRedoAll'),1);return}   // 編集中の「全て解除」は編集の取り消し（編集前に採点していた人と点数へ戻す）
  if(dirty&&!confirm(t('cCEdit')))return;
  selWorks=[];saveSel();buildWorkSel();buildCards();
  localStorage.removeItem(DRAFT_KEY);dirty=false;
}

/* ==============================================================
   入力変更・下書き
   ============================================================== */
function onCh(){dirty=true;clearTimeout(autoT);autoT=setTimeout(saveDraft,300)}
['fDate','fEe','fOv'].forEach(id=>document.getElementById(id).addEventListener('input',onCh));
function saveDraft(){const d=collectForm();d._editId=editId;d._sel=selWorks;d._cur={...curEe};if(editId&&preEdit)d._pre=preEdit;
  try{localStorage.setItem(DRAFT_KEY,JSON.stringify(d))}catch(e){if(!saveDraft._warned){saveDraft._warned=1;toast(t('eStoreFull'),1)}}}
/* 裏に回す・閉じる時は、待たずに下書きへ書く（300ms 待つ間に OS が落とすと最後の点が消える） */
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty){clearTimeout(autoT);saveDraft()}});
window.addEventListener('pagehide',()=>{if(dirty){clearTimeout(autoT);saveDraft()}});
/* 採点・コメント・所感が1つでもあるか（collectForm の形） */
function formHasContent(d){
  return !!(d&&((d.overall||'').trim()||(d.works||[]).some(we=>Object.values(we.scores||{}).some(v=>v!=null)||Object.values(we.comments||{}).some(v=>(v||'').trim()))));
}
/* 今のカードに点数・コメントを入れる（works = collectForm().works の形） */
function fillForm(works){
  getItems().forEach(it=>{
    const we=(works||[]).find(x=>x.workId===it.workId);
    const sc=we&&we.scores&&we.scores[it.aspectId];if(sc)setScoreUI(it.id,sc);
    const ta=document.querySelector('textarea[data-cid="'+it.id+'"]');if(ta)ta.value=(we&&we.comments&&we.comments[it.aspectId])||'';
  });
}
function collectForm(){
  const works=selWorks.map(wid=>{
    const w=workById(wid);
    const sc={},cm={};
    workItems(wid).forEach(it=>{
      const b=document.querySelector('.sb[data-id="'+it.id+'"].sel');sc[it.aspectId]=b?+b.dataset.s:null;
      const ta=document.querySelector('textarea[data-cid="'+it.id+'"]');cm[it.aspectId]=ta?ta.value:'';
    });
    return{workId:wid,workName:w?w.name:'',category:w?w.category:'',scores:sc,comments:cm};
  });
  return{date:document.getElementById('fDate').value,evaluator:editEv!=null?editEv:getEvaluator(),evaluatee:document.getElementById('fEe').value,works,overall:document.getElementById('fOv').value};
}
function restoreDraft(){
  let d=null;try{d=JSON.parse(localStorage.getItem(DRAFT_KEY))}catch{}
  if(!d){if(selWorks.length&&!editId){selWorks=[];saveSel();buildWorkSel();buildCards()}return}   // 人の分からない作業だけが残っている＝人のいないカードは出さない
  // 下書きの作業選択を復元（カタログに実在するものだけ）
  if(Array.isArray(d._sel)){
    const sel=d._sel.filter(id=>workById(id));
    if(sel.length){selWorks=sel;saveSel();buildWorkSel();buildCards()}
  }
  // 復元するのは採点・コメント・所感・手入力の名前がある時だけ（評価者名は端末の設定、名簿の人はタブを押しただけ＝入力途中ではない）
  const ro=getRoster().list,ee=(d.evaluatee||'').trim();
  const dc=d._cur&&typeof d._cur==='object'&&nmKey(d._cur.name)===nmKey(ee)?d._cur:null;   // _cur の無い前の版の下書きも読む
  const eeManual=!!ee&&(!!(dc&&dc.manual)||!rosterHits(ee,'',ro).length);
  const hasContent=eeManual||formHasContent(d);
  if(!hasContent){
    // 名簿の人を押しただけ（採点はまだ）は入力途中ではない＝人は戻さない。その人の作業だけが残ると「人のいないカード」で採点させてしまうので作業も外す
    if(selWorks.length){selWorks=[];saveSel();buildWorkSel();buildCards();renderRoster()}
    return;
  }
  const isEdit=!!(d._editId&&getAll().some(e=>e.id===d._editId));
  // 前日以前の入力途中: 日付を今日にするか確認（黙って昨日の日付で記録しない）。編集中の下書きは記録の日付のまま
  let dt=d.date;
  if(dt&&!isEdit&&dt!==todayLocal()){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dt);
    if(confirm(t('cDraftDate').replace(/\{d\}/g,m?fmtMD(m[2],m[3]):dt)))dt=todayLocal();
    else setUserDate(dt,true);   // 評価者がその日付のままを選んだ＝選んだ日付として保ち、保存の時にもう一度聞かない
  }
  if(dt)document.getElementById('fDate').value=dt;
  setCur(dc?{name:ee,farm:dc.farm,manual:dc.manual,redo:dc.redo,redoOf:dc.redoOf}:{name:ee,farm:(rosterEntry(ee,chipFarm,ro)||{}).farm||'',manual:false});
  document.getElementById('fOv').value=d.overall||'';
  fillForm(d.works);
  if(isEdit){
    const rec=getAll().find(e=>e.id===d._editId);
    editId=d._editId;
    // 評価者は記録の評価者のまま（端末の評価者名を後から直しても、別の評価者タブに同じ記録を作らない）
    editEv=typeof d.evaluator==='string'&&d.evaluator.trim()?d.evaluator:(rec?rec.evaluator:null);
    preEdit=d._pre&&typeof d._pre==='object'?d._pre:null;   // 編集を終えたら、編集前に採点していた人と点数へ戻す
    document.getElementById('editBar').classList.add('show');
    document.getElementById('btnSave').textContent=t('btnUpdate');
  }
  dirty=true;   // 復元した採点は入力途中＝別の人を押す・取り消す・閉じる時に確認を出す
  updProg();renderRoster();toast(t('tDraft'));
}

/* ==============================================================
   評価日（既定=今日。評価者が選んだ日付は、その日のうちは保存・人の切替・再読み込みでも保つ）
   ============================================================== */
/* 評価者が自分で選んだ日付 {date, on:選んだ日（端末の今日）, ok:今日でない日付での保存を確認済み}。
   翌日になったら使わない（前日に選んだ日付を黙って翌日に持ち越さない） */
const DATE_KEY='jitsugi_v2_date';
function userDate(){
  try{const d=JSON.parse(localStorage.getItem(DATE_KEY));
    if(d&&typeof d.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.date)&&d.on===todayLocal())return d}catch{}
  return null;
}
function setUserDate(v,ok){
  try{
    if(!v||v===todayLocal())localStorage.removeItem(DATE_KEY);
    else localStorage.setItem(DATE_KEY,JSON.stringify({date:v,on:todayLocal(),...(ok?{ok:true}:{})}));
  }catch{}
}
/* 起動時の評価日: 今日選んだ日付があればそれ、なければ今日 */
function startDate(){const u=userDate();return u?u.date:todayLocal()}
/* 評価日の欄を評価者が変えた（input/change）。編集中は記録の日付なので覚えない */
function noteUserDate(){if(!editId)setUserDate(document.getElementById('fDate').value)}
/* 評価者が選んでいない（既定の）日付が今日でなければ今日へ直す。直した時は知らせる文を返す（'' = 直していない）。
   quiet=true はトーストを出さない（保存のトーストに添える） */
function refreshDate(quiet){
  if(editId)return'';
  const fd=document.getElementById('fDate'),td=todayLocal(),u=userDate();
  if(!fd.value){fd.value=td;fd.max=td;return''}   // 空欄は黙って今日（「日付が変わった」とは言わない）
  if(u&&u.date===fd.value)return'';
  if(!u)try{localStorage.removeItem(DATE_KEY)}catch{}   // 前日に選んだ日付の覚えは捨てる
  fd.max=td;
  if(fd.value===td)return'';
  fd.value=td;
  const m=/^\d{4}-(\d{2})-(\d{2})$/.exec(td),msg=t('tDateToday').replace('{d}',m?fmtMD(m[1],m[2]):td);
  if(dirty)saveDraft();
  renderRoster();if(!quiet)toast(msg,0,null,4000);
  return msg;
}
/* 今日でない日付で保存する前に一度だけ確認（同じ日付は2人目から聞かない）。false=保存しない */
function confirmPastDate(v){
  if(editId||!v||v===todayLocal())return true;
  const u=userDate();if(u&&u.date===v&&u.ok)return true;
  const m=/^\d{4}-(\d{2})-(\d{2})$/.exec(v);
  if(!confirm(t('cPastDate').replace(/\{d\}/g,m?fmtMD(m[1],m[2]):v))){
    const fd=document.getElementById('fDate');fd.scrollIntoView({behavior:smoothB(),block:'center'});fd.focus({preventScroll:true});return false}
  setUserDate(v,true);return true;
}

/* ==============================================================
   保存
   ============================================================== */
function doSave(){
  if(doSave._at&&performance.now()-doSave._at<450)return;   // 連打（直前の保存の直後）は無視＝編集の更新の後に戻した採点途中の人を、押していないのに保存しない
  if(!selWorks.length){toast(t('eNoWork'),1);return}
  if(!editId&&!document.getElementById('fDate').value)document.getElementById('fDate').value=todayLocal();   // 空欄は今日（「日付が変わった」とは言わない）
  const dateNote=refreshDate(true);   // 開いたまま日をまたいだ: 既定の日付は今日へ（評価者が選んだ日付はそのまま）
  adoptTypedEvaluator(false);   // 打っただけで「決定」を押していない評価者名も採用する（保存の時に消して最上部へ戻さない）
  const d=collectForm();
  if(!d.evaluator.trim()){toast(t('eEv'),1);editEvaluator();document.getElementById('evBox').scrollIntoView({behavior:smoothB(),block:'center'});return}
  if(!d.evaluatee.trim()){toast(t('eEe'),1);document.querySelector('.eebox').scrollIntoView({behavior:smoothB(),block:'center'});return}
  if(!d.date){toast(t('eDt'),1);return}
  if(d.date>todayLocal()){toast(t('eFuture'),1);document.getElementById('fDate').focus();return}   // 未来の評価日は保存しない（手入力・貼り付けで max を越えた時も）
  clearTimeout(autoT);   // 保存前の入力で予約された下書き保存を取り消す（保存後に古い日付だけの下書きが残らないように）
  if(!editId&&!confirmPastDate(d.date))return;
  let miss=getItems().filter(it=>{
    const we=d.works.find(x=>x.workId===it.workId);return !we||we.scores[it.aspectId]==null;
  });
  // 作業単位の部分保存: 採点を1つも付けていない作業だけが残っている時は、終わった作業だけを保存できる（作業8つでも途中で保存・豚がいない作業は後日）
  let partLeft=0;
  if(miss.length&&!editId&&!curEe.redo){   // やり直しは全作業がそろってから（一部だけだと、前回の残りの作業が集計から消える）
    const st=workStats(d);
    const empty=st.filter(x=>x.done===0),half=st.filter(x=>x.done>0&&x.done<x.total),full=st.filter(x=>x.total&&x.done===x.total);
    if(half.length)miss=miss.filter(it=>half.some(x=>x.wid===it.workId));   // 途中の作業の未採点だけを示す
    else if(full.length&&empty.length){
      const nm=empty.map(x=>{const w=workById(x.wid);return w?loc(w,'name'):x.wid}).join(listSep());
      const lostCm=d.works.some(we=>empty.some(x=>x.wid===we.workId)&&Object.values(we.comments||{}).some(v=>(v||'').trim()));
      if(!confirm(t('cPartSave').replace('{n}',empty.length).replace('{w}',nm)+(lostCm?'\n'+t('cPartCm'):'')))return;
      d.works=d.works.filter(we=>full.some(x=>x.wid===we.workId));partLeft=empty.length;miss=[];
    }
  }
  // 未採点の印（⚠ 未採点・太い赤枠）は点を付けるまで残す。件数と「次へ」は進捗の横に残る。1枚目の点数ボタンへフォーカス
  if(miss.length){document.querySelectorAll('#cards .ec.miss').forEach(c=>setMiss(c,false));
    miss.forEach(it=>{const c=document.getElementById('c-'+it.id);if(c){setMiss(c,false);void c.offsetWidth;setMiss(c,true)}});
    updProg();
    toast(t('eSc')+' ('+miss.length+')',1);focusMiss(document.getElementById('c-'+miss[0].id));return}
  const all=getAll();
  const who=eeSaveInfo(d.evaluatee.trim());
  if(!editId&&!who.farm&&!who.manual&&rosterHits(d.evaluatee.trim(),'',getRoster().list).length>1){toast(t('eAmbig'),1);scrollToEe();return}
  // 保存の直前に、同じ作業がもう記録されていないか見直す（同じ端末の別のタブ・別の画面で先に保存された）。やり直しは除く
  if(!editId&&!curEe.redo){const ro=getRoster().list,pe=selEntry(ro);if(pe){const ds=doneWorksOf(pe,examRecs(),ro),dup=d.works.filter(we=>ds.has(we.workId));
    if(dup.length&&!confirm(t('cAlready').replace('{n}',pe.name).replace('{w}',dup.map(we=>{const w=workById(we.workId);return w?loc(w,'name'):we.workId}).join(listSep()))))return}}   // どちらの人か決まらない記録を作らない
  if(editId){
    const idx=all.findIndex(e=>e.id===editId);
    if(idx===-1){toast(t('eEditGone'),1);exitEdit(true);return}   // 採点は残す＝人も編集していた人のまま
    if(d.date!==all[idx].date&&!confirm(t('cDateChg').replace('{a}',mdOf(all[idx].date)).replace('{b}',mdOf(d.date))))return;   // 編集で評価日を動かす時は確認
    // 画面に出せなかった作業（今のカタログに無い作業）は元の記録のまま残す（黙って消さない）
    const nw=(all[idx].works||[]).map(we=>d.works.find(x=>x.workId===we.workId)||we);
    d.works.forEach(x=>{if(!nw.some(we=>we.workId===x.workId))nw.push(x)});
    const prev=all[idx];
    // 更新時刻＝シートの版。端末の時計が戻っていても、前の版より必ず新しくする（古い版とみなされて上書きされないのを防ぐ）
    const pv=Date.parse(prev.updatedAt||prev.createdAt||'')||0,up=new Date(Math.max(Date.now(),pv+1)).toISOString();
    const ee=nmKey(d.evaluatee)===nmKey(prev.evaluatee)?prev.evaluatee:d.evaluatee.trim();   // 名前を変えていなければ元の表記（シートのセルと同じ・改行入り）のまま
    all[idx]=normRec({...prev,date:d.date,evaluator:d.evaluator.trim(),evaluatee:ee,farm:prev.farm||who.farm,works:nw,overall:d.overall,updatedAt:up,sent:false,
      ...(prev.sheetGone?{revive:true,rv:newId(),rvAt:new Date().toISOString(),sheetGone:false}:{})});   // シートで削除済みの記録を直した＝戻す（新しい合図）
    if(!putAll(all)){toast(t('eStoreFull'),1);return}
    doSave._at=performance.now();
    toast(t('tUpdated'));
    dirty=false;exitEdit();   // 編集前に採点していた人・作業・点数へ戻す（戻した内容は下書きにも残す）
    refreshSel();renderRoster();syncPending();
    return;
  }else{
    all.push(normRec({id:newId(),date:d.date,evaluator:d.evaluator.trim(),evaluatee:(who.name||d.evaluatee).trim(),farm:who.farm,...(who.manual?{manual:true}:{}),...(curEe.redoOf&&!who.manual&&nmKey(d.evaluatee)===nmKey(curEe.name)?{redoOf:curEe.redoOf}:{}),works:d.works,overall:d.overall,createdAt:new Date().toISOString(),sent:false}));
    if(!putAll(all)){toast(t('eStoreFull'),1);return}   // 書けなかった: 採点は画面に残す（消さない）
    doSave._at=performance.now();
    toast((partLeft?tN('tSavedPart',partLeft):t('tSaved'))+(dateNote?' ／ '+dateNote:''),0,null,dateNote?5000:partLeft?3000:0);   // 日付を直した・残りの作業がある知らせは送信済みの知らせで消さない
  }
  localStorage.removeItem(DRAFT_KEY);dirty=false;refreshSel();
  // 次の被評価者へ：作業選択も空に戻す（名簿のタブを押せば再セット）
  selWorks=[];saveSel();buildWorkSel();buildCards();
  eeQuery='';document.getElementById('eeFind').value='';
  clearForm();
  scrollToEe();   // 先頭ではなく被評価者の一覧へ（次の人をすぐ選べる）
  syncPending();
}

/* 作業ごとの採点数 [{wid,done,total}]（フォームの内容 d = collectForm() から） */
function workStats(d){
  return selWorks.map(wid=>{
    const its=workItems(wid),we=(d||collectForm()).works.find(x=>x.workId===wid);
    return{wid,total:its.length,done:its.filter(it=>we&&we.scores[it.aspectId]!=null).length};
  });
}
/* 作業を今回は実施しない（豚がいない・時間切れ）: その作業だけ外す。採点済みなら確認。外した作業は後で「残りの作業」として出る */
function skipWork(wid){
  if(editId){toast(t('editingBanner'),1);return}
  if(curEe.redo){toast(t('eRedoAll'),1);return}   // やり直しは全作業を採点する
  const w=workById(wid);const nm=w?loc(w,'name'):wid;
  const sc=document.querySelector('#cards .ec.scored[data-w="'+wid+'"]');
  if(sc&&!confirm(t('cSkipScored').replace('{w}',nm)))return;
  const y=window.scrollY,idx=selWorks.indexOf(wid),snap=collectForm().works.find(we=>we.workId===wid),who=document.getElementById('fEe').value;
  const cur0={...curEe};
  toggleWork(wid,false);
  // 誤タップ対策: トーストの「元に戻す」で、外した作業を同じ位置に採点ごと戻す（同じ人を選んでいる間だけ）
  const undo={label:t('undo'),fn:()=>unskipWork(wid,idx,snap,who,cur0)};
  if(!selWorks.length){   // 最後の作業を外した＝この人は今回ここまで。人を外して名簿へ（「作業を選べ」と案内しない）
    clearForm();scrollToEe();toast(t('tSkipped').replace('{w}',nm),0,undo);return;
  }
  window.scrollTo({top:y});   // 位置を保つ（外した作業の場所に次の作業が来る）
  toast(t('tSkipped').replace('{w}',nm),0,undo);
  // 押したボタンが消えてフォーカスが body に落ちた時だけ、次の作業の「今回は実施しない」へ（入力中のコメント欄などからは奪わない）
  const ae=document.activeElement;
  if(!ae||ae===document.body||!document.body.contains(ae)){const nx=document.querySelector('.wshd-skip[data-w="'+CSS.escape(selWorks[Math.min(idx,selWorks.length-1)])+'"]');if(nx)nx.focus({preventScroll:true})}
}
function unskipWork(wid,idx,snap,who,cur0){
  if(editId||selWorks.includes(wid))return;
  if(!curEe.name&&!curEe.manual&&cur0&&nmKey(cur0.name)===nmKey(who)&&!selWorks.length)setCur(cur0);   // 最後の作業を外して人も外れていた → 人ごと戻す
  if(document.getElementById('fEe').value!==who)return;
  selWorks.splice(Math.max(0,Math.min(idx,selWorks.length)),0,wid);
  saveSel();buildWorkSel();addWorkSec(wid);
  if(snap)workItems(wid).forEach(it=>{
    const sc=snap.scores[it.aspectId];if(sc)setScoreUI(it.id,sc);
    const ta=document.querySelector('textarea[data-cid="'+it.id+'"]');if(ta&&snap.comments[it.aspectId])ta.value=snap.comments[it.aspectId];
  });
  onCh();updProg();buildWorkSel();
  jumpWork(wid);
  const b=document.querySelector('.wshd-skip[data-w="'+wid+'"]');if(b)b.focus({preventScroll:true});
}
/* 作業の見出しへ移動（目次のチップから） */
function jumpWork(wid){
  const h=document.getElementById('wh-'+wid);if(!h)return;
  window.scrollTo({top:Math.max(0,h.getBoundingClientRect().top+window.scrollY-stkH()-4)});   // 40枚=1万px超を一気に（なめらかスクロールは遠いと遅い）
}

/* ==============================================================
   編集モード（レコードの作業構成に選択を合わせてから復元）
   ============================================================== */
function startEdit(id){
  const rec=getAll().find(e=>e.id===id);if(!rec)return;
  if(rec.sheetGone&&!confirm(t('cEditGone').replace('{n}',rec.evaluatee||'')))return;   // シートで削除済み: 直して送ると、シートに戻す（明示の確認）
  if(editId&&dirty&&!confirm(t('cCEdit')))return;   // 別の記録の編集へ移る前に、今の編集の修正を捨ててよいか確認（編集前の人の点数は preEdit に残る）
  if(!editId){const f=collectForm();preEdit={date:document.getElementById('fDate').value,cur:{...curEe},sel:selWorks.slice(),works:f.works,overall:f.overall,dirty:!!dirty}}   // 編集を終えたら、編集前の評価日・人・作業・点数へ戻す（採点途中の人を消さない）
  editId=id;closeMo();
  const wids=(rec.works||[]).map(we=>we.workId).filter(wid=>workById(wid));
  if(!wids.length){toast(t('eImpCfg'),1);exitEdit();return}
  selWorks=wids;saveSel();buildWorkSel();buildCards();
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('on'));
  document.querySelector('[data-pg="pgIn"]').classList.add('on');
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));
  document.getElementById('pgIn').classList.add('on');
  document.getElementById('fDate').value=rec.date;
  editEv=rec.evaluator;
  setCur({name:rec.evaluatee,farm:rec.farm||'',manual:!!rec.manual});renderRoster();   // 農場チップの好み（FARM_KEY）は書き換えない
  document.getElementById('fOv').value=rec.overall||'';
  document.querySelectorAll('#cards .ec.miss').forEach(c=>setMiss(c,false));
  fillForm(rec.works);
  document.getElementById('editBar').classList.add('show');
  document.getElementById('btnSave').textContent=t('btnUpdate');
  window.scrollTo({top:0,behavior:smoothB()});dirty=false;updProg();
  saveDraft();   // 編集前の採点（preEdit）を下書きに残す（編集中にアプリが落ちても、採点途中の人の点数を失わない）
}
function cancelEdit(){if(!editId)return;if(dirty&&!confirm(t('cCEdit')))return;exitEdit()}
/* 目次の「✓済」の作業を押す＝その作業を採点した記録（この端末の最新）を開いて修正。ほかの端末の記録なら知らせるだけ */
function openDoneWork(wid){
  if(editId)return;
  const ro=getRoster().list,p=selEntry(ro);if(!p)return;
  const r=recsOf(p,ro).find(r=>(r.works||[]).some(we=>we.workId===wid)&&getAll().some(e=>e.id===r.id));
  if(!r){toast(t('eOtherDev'),1);return}
  startEdit(r.id);
}
/* 編集バーの「やり直し」: 編集中の記録の人を、もう一度全作業で採点する（新しい記録・redoOf に前回の記録ID）。編集中の修正は捨てる（確認） */
function redoFromEdit(){
  if(!editId)return;
  const rec=getAll().find(e=>e.id===editId);
  if(dirty&&!confirm(t('cCEdit')))return;
  exitEdit();
  const ro=getRoster().list;
  const ent=rec?personKeyer(examRecs(),ro)(rec).entry:null,i=ent?ro.indexOf(ent):-1;
  if(i<0){toast(t('eRedoNoRoster'),1);return}
  selectEe(i,{redo:true});
}
/* 編集を終える。keep=true は画面をそのまま残す（編集中の記録が消えた時＝採点を失わない）。
   それ以外は編集前の評価日・人・作業・点数（preEdit）へ戻す */
function exitEdit(keep){
  const was=!!editId,pe=preEdit;
  preEdit=null;editId=null;editEv=null;document.getElementById('editBar').classList.remove('show');document.getElementById('btnSave').textContent=t('btnSave');
  if(was&&!keep)restorePreEdit(pe);
}
function restorePreEdit(pe){
  pe=pe&&typeof pe==='object'?pe:{};
  clearTimeout(autoT);
  selWorks=(Array.isArray(pe.sel)?pe.sel:[]).filter(id=>workById(id));saveSel();buildWorkSel();buildCards();
  document.querySelectorAll('#cards .ec.miss').forEach(c=>setMiss(c,false));
  document.getElementById('fDate').value=pe.date||todayLocal();
  setCur(pe.cur);
  if(!curEe.name&&!curEe.manual&&selWorks.length){selWorks=[];saveSel();buildWorkSel();buildCards()}   // 人のいないカードは出さない
  document.getElementById('fOv').value=pe.overall||'';
  fillForm(pe.works);
  dirty=!!pe.dirty||formHasContent(pe);
  if(selWorks.length||curEe.name||curEe.manual)saveDraft();else localStorage.removeItem(DRAFT_KEY);
  updProg();renderRoster();
}
function doReset(){
  if(!confirm(t('cReset')))return;
  if(editId){exitEdit();toast(t('tReset'));return}   // 編集中のリセット＝編集の取り消し（編集前に採点していた人を消さない）
  clearForm();selWorks=[];saveSel();buildWorkSel();buildCards();   // 人を外したら作業も外す（人のいないカードで採点させない）
  document.getElementById('fDate').value=todayLocal();setUserDate('');renderRoster();toast(t('tReset'))}
/* 評価日は評価者が選んだ日のまま（空の時だけ今日）。次の人へ進むたびに日付が変わると、同じ日の記録が2つの日付に分かれる */
function clearForm(keepDraft){
  clearTimeout(autoT);
  const fd=document.getElementById('fDate');if(!fd.value)fd.value=todayLocal();
  setCur(null);document.getElementById('fOv').value='';
  document.querySelectorAll('.sb.sel,.crit-lv.sel').forEach(b=>b.classList.remove('sel'));
  document.querySelectorAll('.ec.scored,.ec.miss').forEach(c=>{c.classList.remove('scored','cm-open');setMiss(c,false)});
  document.querySelectorAll('.ec textarea').forEach(ta=>ta.value='');
  if(!keepDraft)localStorage.removeItem(DRAFT_KEY);
  dirty=false;updProg();renderRoster();
}

/* ==============================================================
   評価者（一度入れたら端末に記憶・以後は表示のみ）
   ============================================================== */
function renderEvaluator(forceEdit){
  const n=getEvaluator();
  const editing=forceEdit||!n;
  document.getElementById('evShow').style.display=editing?'none':'';
  document.getElementById('evEdit').style.display=editing?'':'none';
  document.getElementById('evName').textContent=n;document.getElementById('evName').title=n;   // 長い評価者名も全文を確かめられる
  if(editing){const f=document.getElementById('fEv');if(!f.value.trim())f.value=n}   // 打ちかけの名前は上書きしない
}
function editEvaluator(){renderEvaluator(true);const f=document.getElementById('fEv');f.focus();f.select()}
/* 入力欄に打ってある評価者名（決定前）を記憶する。空なら何もしない（記憶は消さない）。入力欄は開いたまま（押した「決定」ボタンの位置をずらさない）。notify=true で「記憶しました」を出す */
function adoptTypedEvaluator(notify){
  const box=document.getElementById('evEdit'),f=document.getElementById('fEv');
  if(!f||!box||box.style.display==='none')return false;
  const v=f.value.trim();if(!v)return false;
  if(v!==getEvaluator()){setEvaluator(v);document.getElementById('evName').textContent=v;if(notify)toast(t('tEvSaved'))}
  document.getElementById('evBox').classList.remove('ev-need');
  return true;
}
function commitEvaluator(){
  const v=document.getElementById('fEv').value.trim();
  if(!v){toast(t('eEv'),1);return}
  setEvaluator(v);renderEvaluator();document.getElementById('evBox').classList.remove('ev-need');
  const chg=document.querySelector('#evShow button');if(chg)chg.focus({preventScroll:true});else document.getElementById('fEv').blur();   // 入力欄が閉じてもフォーカスを body に落とさない
  toast(t('tEvSaved'));
  const ec=document.getElementById('eeCur');if(ec&&!ec.hidden&&selWorks.length){scrollBelowStk(ec,8,true);ec.focus({preventScroll:true})}   // 人を選んでから名前を入れた＝採点の入口へ戻す
}

/* ==============================================================
   被評価者タブ（シート「受験者」の名簿→その人に用意した作業を表示）
   ============================================================== */
async function reloadRoster(silent,bg){
  if(!sheetUrl()){renderRoster();return}
  if(bg){   // 裏での取り直し（数分ごと・前面に戻った時）: 読み込み中の表示も知らせも出さない。電波の失敗は前の状態のまま
    rosterLoading=true;const r=await fetchRoster();rosterLoading=false;
    if(!r.ok&&r.reason==='net')return;
    setSheetState(r.ok?'':r.reason,r.gas);rosterKeptEmpty=!!(r.ok&&r.keptEmpty);
    renderRoster();updSyncUI();
    if(r.ok&&curEe.name&&!curEe.manual&&!editId&&!selEntry(r.list))toast(t('eCurGone').replace('{n}',curEe.name),1);
    return;
  }
  const btn=document.querySelector('.eebox .wsel-hd button'),hadFocus=!!btn&&document.activeElement===btn;if(btn){btn.disabled=true;btn.setAttribute('aria-busy','true')}
  rosterLoading=true;renderRoster();
  const r=await fetchRoster();
  rosterLoading=false;setSheetState(r.ok?'':r.reason,r.gas);
  if(btn){btn.disabled=false;btn.removeAttribute('aria-busy');if(hadFocus)btn.focus({preventScroll:true})}   // 読み込み中に押せなくしたボタンへ、フォーカスを戻す
  rosterKeptEmpty=!!(r.ok&&r.keptEmpty);
  renderRoster();updSyncUI();
  // 名簿の管理ミス（空・タブが無い・作業名不明・同名）は電波と違って放っても直らないので、起動時も知らせる
  if(r.ok){
    const w=rosterWarnText(r,5,true);   // 農場名のゆれは表記の注意＝赤いトーストにしない（画面の橙の警告に残る）
    if(r.keptEmpty)toast(t('eRosterEmptyKept'),1);
    else if(w)toast(w,1);
    else if(!silent)toast(t('tRoster')+' ('+r.list.length+')');
  }else if(r.reason==='nosheet'||r.reason==='bad'||r.reason==='auth')toast(rosterErrMsg()+(getRoster().list.length?t('showingPrev'):'')+(rosterErrGasOld()?' ／ '+rosterErrGasOld():''),1);   // 電波では直らない＝起動時も知らせる
  else if(!silent)toast(t('eRoster')+(getRoster().list.length?t('showingPrev'):''),1);
  else{const rs=getRoster();if(rs.list.length&&rosterIsOld(rs))toast(t('rosterStale').replace('{t}',fmtAt(rs.at)),1)}   // 起動時でも、古い名簿のまま試験しないよう知らせる
  // 採点中の人が名簿で見つからなくなった（改名など）: ほかの知らせより優先して出す（保存は選んだ時の農場のまま）
  if(r.ok&&curEe.name&&!curEe.manual&&!editId&&!selEntry(r.list))toast(t('eCurGone').replace('{n}',curEe.name),1);
}
/* 名簿の取得日時（端末の時刻で M/D HH:MM）と古さ */
const ROSTER_OLD_MS=12*3600*1000;
function fmtAt(at){
  const d=new Date(at||'');if(!at||isNaN(d))return'—';
  const p=n=>String(n).padStart(2,'0');
  return fmtMD(d.getMonth()+1,d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
}
/* 電波では直らない名簿の失敗（受験者タブが無い・応答が不正）の知らせ。古い GAS が名乗った版があれば添える */
function rosterErrMsg(){
  if(rosterErrReason==='nosheet')return t('eRosterNoSheet');
  if(rosterErrReason==='bad')return t('eRosterBad');
  if(rosterErrReason==='auth')return t('eAuth');
  return'';
}
function rosterErrGasOld(){return rosterErrGas&&gasMissing(rosterErrGas).length?t('eGasOld').replace('{v}',rosterErrGas.version||'?'):''}
function rosterIsOld(rs){const d=new Date(rs&&rs.at||'');return isNaN(d)||Date.now()-d.getTime()>ROSTER_OLD_MS}
/* 採点中の人はメモリの curEe={name,farm,manual} だけが持つ（画面の #fEe はその表示）。
   端末に残すのは「最後に開いた農場チップ」の好み（FARM_KEY）だけで、農場チップを押した時（selectFarm）にだけ書く
   ＝編集のような一時的な操作で担当農場のチップが変わらない */
const FARM_KEY='jitsugi_v2_farm';
let eeQuery='',rosterKeptEmpty=false;
function storedFarm(){try{return localStorage.getItem(FARM_KEY)}catch{return null}}   // 記憶が無い＝null（'' は「農場未記入」のチップを選んだ記憶）
let curEe={name:'',farm:'',manual:false},chipFarm=storedFarm();
function setCur(c){
  curEe={name:String(c&&c.name||'').trim(),farm:String(c&&c.farm||''),manual:!!(c&&c.manual)};
  // やり直し中（下書きから戻した時も保つ）: redo=前回の日付（表示）・redoOf=置き換える前回の記録ID（保存する記録とシートの「やり直し元」列へ）
  if(c&&c.redo&&!curEe.manual){curEe.redo=String(c.redo);const ro=normRedoOf(c.redoOf);if(ro)curEe.redoOf=ro}
  document.getElementById('fEe').value=nmKey(curEe.name);   // 入力欄は改行を持てない＝空白にそろえて見せる（記録の名前はシートの表記のまま）
}
/* 名簿の農場（シートの並び順・所属未確定/空欄は最後） */
/* 農場名の表示だけを訳す（空欄=農場未記入・「所属未確定」=訳語）。data-f・保存する farm・シートの値は元の文字列のまま */
function farmDisp(f){
  if(!f)return t('farmNone');
  if(!/未確定/.test(f))return f;
  const rest=f.replace(/所属未確定|未確定/,'').replace(/^[\s（(【\[]+|[\s）)】\]]+$/g,'').trim();   // 「所属未確定（A農場）」の補足は残す（未確定の農場が2つあっても見分けられる）
  return t('farmUnassigned')+(rest?paren(rest):'');
}
function rosterFarms(ro){
  const fs=[];ro.forEach(p=>{if(!fs.includes(p.farm))fs.push(p.farm)});
  const last=f=>!f||/未確定/.test(f)?1:0;
  return fs.sort((a,b)=>last(a)-last(b));
}
/* 選択中の名簿の人（person.js の規則: 名簿に同名が1人なら名前で、2人以上なら農場で。手入力中は名簿の人として扱わない） */
function selEntry(ro){
  if(!curEe.name||curEe.manual)return null;
  return rosterEntry(curEe.name,curEe.farm,ro);
}
/* 表示する農場チップ: 採点中の人の農場 > 最後に開いたチップ > 先頭 */
function curFarm(ro){
  const fs=rosterFarms(ro),sel=selEntry(ro);
  const f=sel?sel.farm:chipFarm;
  return fs.includes(f)?f:fs[0];
}
/* 保存する農場: 選んだ名簿の人の農場。手入力の名前は名簿で1人に決まればその人の農場、名簿にない名前は農場空欄＋名簿外の印 */
function eeSaveInfo(name){
  const ro=getRoster().list;
  const p=nmKey(name)===nmKey(curEe.name)?selEntry(ro):null;
  if(p)return{farm:p.farm,manual:false,name:p.raw||''};   // 名簿の人はシートのセルと同じ表記で保存（集計の式が名前で引けるように）
  // 選んだ人の農場（curEe.farm）が分かっていれば、その農場で探す（名簿の同名の片方を改名した後に、別の農場の人へ付け替えない）
  let hs=rosterHits(name,curEe.farm,ro);
  if(hs.length>1&&!curEe.farm)hs=rosterHits(name,chipFarm,ro);
  if(hs.length===1)return{farm:hs[0].farm,manual:false,name:hs[0].raw||''};   // 手入力でも名簿の人ならシートの表記で保存
  if(curEe.farm&&nmKey(name)===nmKey(curEe.name))return{farm:curEe.farm,manual:false};   // 名簿から外れた・改名された人: 選んだ時の農場のまま
  return{farm:'',manual:ro.length>0&&!rosterHits(name,'',ro).length};
}
/* 検索用の正規化: 全角半角・大小・ひらがな→カタカナ・アクセント記号（ベトナム語）・区切り記号を揃える */
function normQ(s){
  return String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase()
    .replace(/[đ]/g,'d').replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60))
    .replace(/[\s・･·.\-_,、。（）()]/g,'');
}
function selectFarm(f){
  const sel=selEntry(getRoster().list);
  if(sel&&sel.farm!==f&&!editId){         // 別の農場へ切り替えたら選択中の人は外す
    if(dirty&&document.querySelector('#cards .ec.scored')&&!confirm(t('cSwitchEe')))return;
    const dt=document.getElementById('fDate').value;clearForm();if(dt)document.getElementById('fDate').value=dt;
    selWorks=[];saveSel();buildWorkSel();buildCards();
  }
  chipFarm=f;try{localStorage.setItem(FARM_KEY,f)}catch{}
  eeQuery='';document.getElementById('eeFind').value='';
  renderRoster();
}
/* 名簿の枠（#cards より上）の作り直しで、下で採点中の評価者の画面が跳ねないようにする。
   iOS Safari はスクロールアンカリングが無いので自前で: 基準（#eeCur か #cards）の位置の差を打ち消す。
   枠が画面の上に隠れている（＝評価者が下で採点中）時だけ補正する */
function renderRoster(){
  const eb=document.querySelector('.eebox'),ec0=document.getElementById('eeCur');
  const anc=()=>ec0&&!ec0.hidden?ec0:document.getElementById('cards');
  const below=!!eb&&eb.getBoundingClientRect().bottom<(typeof stkH==='function'?stkH():0),a0=below?anc():null,y0=a0?a0.getBoundingClientRect().top:0;
  renderRosterBody();
  if(a0){const a1=anc(),d=(a1===a0?a1.getBoundingClientRect().top-y0:0);if(Math.abs(d)>=0.5)window.scrollBy(0,d)}
}
/* 農場チップの右に、まだ続きがある時だけ › を出す */
/* 長い農場名は先頭と末尾を残して中を省く（「A畜産株式会社第一農場」→「A畜産…第一農場」） */
function midCut(s){
  // 幅で判断（漢字・かな=2、英数字・ラテン文字=1）。収まる名前は省かない（訳した「Peternakan belum ditentukan」なども全文）
  const a=[...String(s||'')],w=c=>/[\u2E80-\uFFEF]/.test(c)?2:1,tot=a.reduce((n,c)=>n+w(c),0);
  if(tot<=30)return a.join('');
  let h=0,hs=0;while(hs<a.length&&h+w(a[hs])<=10){h+=w(a[hs]);hs++}
  let tl=0,te=a.length;while(te>hs&&tl+w(a[te-1])<=14){tl+=w(a[te-1]);te--}
  return a.slice(0,hs).join('')+'…'+a.slice(te).join('');
}
/* 農場チップの表示名: 頭が同じ農場どうし（「A畜産株式会社第一農場」「…第二農場」）は、違いが始まる少し手前から見せる（「…古第一農場」）。
   それ以外は幅で中省略。違いが CSS の省略で隠れないように、共通の頭（5字以上）を先に落とす */
function chipNames(fs){
  const ds=fs.map(f=>[...farmDisp(f)]),m=new Map();
  fs.forEach((f,i)=>{
    const a=ds[i];let pmax=0;
    ds.forEach((b,k)=>{if(k===i)return;let p=0;while(p<a.length&&p<b.length&&a[p]===b[p])p++;if(p>pmax)pmax=p});
    const wd=a.reduce((n,c)=>n+(/[\u2E80-\uFFEF]/.test(c)?2:1),0);   // 短い名前（チップに収まる）は頭を落とさない
    // 頭を落とすのはシートの農場名どうしだけ（訳した「所属未確定」「農場未記入」は落とさない＝訳語が消えて補足だけにならない）
    m.set(f,f&&!/未確定/.test(f)&&wd>20&&pmax>=5&&pmax<a.length?midCut('…'+a.slice(Math.max(0,pmax-2)).join('')):midCut(a.join('')));
  });
  return m;
}
function updFarmsMore(){const f=document.getElementById('eeFarms'),m=document.getElementById('eeFarmsMore');if(!f||!m)return;m.hidden=!(f.scrollWidth-f.clientWidth-f.scrollLeft>4)}
let _chipCentered=null;   // 最後に中央へ寄せた農場（同じ農場のままならユーザーが横にスクロールした位置を戻さない）
function renderRosterBody(){
  const box=document.getElementById('eeTabs'),note=document.getElementById('eeNote'),fbox=document.getElementById('eeFarms');
  const rs=getRoster(),ro=rs.list;
  const cur=curEe.name;
  const recs=examRecs();
  const pr=new Map();ro.forEach(p=>pr.set(p,eeProgress(p,recs,ro)));
  const isDone=p=>pr.get(p).complete;
  const sel=selEntry(ro);
  const fs=rosterFarms(ro),farm=curFarm(ro);
  const showF=fs.length>1||(fs.length===1&&fs[0]);
  const cn=chipNames(fs);
  const fh=showF?fs.map(f=>{
    const ps=ro.filter(p=>p.farm===f),left=ps.filter(p=>!isDone(p)).length,on=f===farm;
    return `<button type="button" class="fchip${on?' on':''}" aria-pressed="${on}" onclick="selectFarm(this.dataset.f)" data-f="${esc(f)}" data-left="${left}" data-n="${ps.length}" title="${esc(farmDisp(f))}" aria-label="${esc(farmDisp(f)+' '+(left?t('leftN').replace('{n}',left):'✓'))}">`+
      `<span class="fchip-nm">${esc(cn.get(f))}</span><span class="fchip-ct${left?'':' zero'}">${left?esc(t('leftN').replace('{n}',left)):'✓'}</span></button>`;
  }).join(''):'';
  // 同じ内容なら置き換えない（押している最中のチップ・横スクロールの位置を壊さない）
  const firstChips=!fbox.querySelector('.fchip');
  if(fbox._fh!==fh||!fbox.firstChild&&fh){fbox.innerHTML=fh;fbox._fh=fh}
  const onChip=fbox.querySelector('.fchip.on');   // 選択中の農場を横スクロールの中央へ（ページは縦に動かさない）
  // 中央へ寄せるのは、チップを初めて作った時と選択中の農場が変わった時だけ（名簿の取得完了・検索の入力のたびに戻さない）
  if(onChip&&(firstChips||_chipCentered!==farm))fbox.scrollLeft=Math.max(0,onChip.offsetLeft-(fbox.clientWidth-onChip.offsetWidth)/2);
  _chipCentered=onChip?farm:null;
  updFarmsMore();
  if(!fbox._moreBound){fbox._moreBound=1;fbox.addEventListener('scroll',updFarmsMore,{passive:true})}
  const ps=[];ro.forEach((p,i)=>{if(!showF||p.farm===farm)ps.push(i)});
  const findOn=ps.length>8;                      // 8名を超える農場は名前で絞り込めるように
  document.getElementById('eeFindBox').hidden=!findOn;
  const q=findOn?normQ(eeQuery):'';
  const hit=q?ps.filter(i=>[ro[i].name,...(ro[i].aliases||[])].some(n=>normQ(n).includes(q))):ps;
  const todo=hit.filter(i=>!isDone(ro[i])),dn=hit.filter(i=>isDone(ro[i]));   // 未実施を先・実施済みは後ろ
  const tab=i=>{
    const p=ro[i],on=p===sel,g=pr.get(p),d=g.complete,part=!d&&g.done>0;
    return `<button type="button" class="eetab${on?' on':''}${d?' done':''}${part?' part':''}" aria-pressed="${on}" data-i="${i}" data-done="${g.done}" data-total="${g.total}" title="${esc(p.name)}" onclick="selectEe(${i})">`+
      `<span class="eetab-nm${[...p.name].length>12?' long':''}">${esc(p.name)}</span><span class="eetab-ct">${d?esc(t('doneLbl'))+' · ':''}${part?`<span class="eetab-pt">${esc(t('partLbl'))} ${g.done}/${g.total}</span> · `+esc(tN('leftWorks',g.total-g.done)):p.works.length?p.works.length+esc(t(p.works.length===1&&lang==='en'?'worksUnit1':'worksUnit')):esc(t('worksNone'))}${p.common?` <span class="eetab-cm">${esc(t('commonLbl'))}</span>`:''}</span>`+
      `${p.unresolved&&p.unresolved.length?`<span class="eetab-unk">⚠ ${esc(t('unkWorkLbl'))}: ${esc(p.unresolved.join(listSep()))}</span>`:''}`+
      `${d?'<span class="eetab-ok" aria-hidden="true">✓</span>':''}</button>`;
  };
  box.innerHTML=todo.map(tab).join('')+(dn.length?`<div class="eegrp">✓ ${esc(t('doneGrp'))} (${dn.length})</div>`+dn.map(tab).join(''):'')
    +(q&&!hit.length?`<p class="eenone">${esc(t('eeNoHit'))}</p>`:'');
  // 手入力欄: 名簿が無い時／「名簿にない人を入力」を押した時／入力済みの名前が名簿の人と一致しない時（打った名前を隠さない）
  const manual=!ro.length||curEe.manual||(!!cur&&!sel);
  document.getElementById('eeManual').style.display=manual?'':'none';
  document.getElementById('eeAdd').hidden=!ro.length||manual;
  // 選んだ人の名前（全文）と農場を採点カードの上に1行で（タブの名前は長いと切れる・手入力欄は隠れるため）
  const ec=document.getElementById('eeCur');
  if(ec){ec.hidden=!sel;ec.classList.toggle('edit',!!editId);
    const er=editId?getAll().find(e=>e.id===editId):null;
    ec.innerHTML=sel?`${esc(editId?t('editingFor'):t('scoringFor'))}: <b>${esc(sel.name)}</b>${esc(paren(farmDisp(sel.farm)+(er?' · '+mdOf(er.date):'')))}`+
    (curEe.redo?` <span class="eecur-redo">${esc(t('redoLbl').replace('{d}',mdOf(curEe.redo)))}</span>`:''):''}
  // 名簿の取得日時を常に出す。今回の取得に失敗・古い名簿の時は警告色（圏外の豚舎で古い名簿のまま試験しないように）
  // 失敗の理由で文言を分ける: 電波（net）だけを「電波の良い所で」。受験者タブが無い・応答が不正は管理者へ（#eeWarn に理由）
  const atTx=fmtAt(rs.at),stale=!!ro.length&&!rosterLoading&&!!sheetUrl()&&(rosterErr||rosterIsOld(rs)),admin=rosterErr&&rosterErrReason!=='net';
  // 最初の操作（名前をタップ）の案内は名簿の先頭＝農場チップの直前に1行で（名簿の下だと最初の画面に入らない）
  const pw=document.querySelector('#cards .pickwork .pw-tx');if(pw)pw.innerHTML=pickworkTx();   // 名簿が届いた・人を外した時に空表示の案内も合わせる
  // 名簿が正常に取れている時は何も出さない（取得日時の行は出さない）。読み込み中・古い名簿・失敗の時だけ1行
  note.textContent=rosterLoading?t('eeLoading')
    :ro.length?(stale?(rosterErr?(admin?t('rosterPrev'):t('rosterStale')):t('rosterOld')).replace('{t}',atTx):'')
    :(!sheetUrl()?t('noSheet'):rosterErr?(admin?t('eRosterAdmin'):t('eRosterNet')):t('eeNoRoster'));
  note.hidden=!note.textContent;
  note.classList.toggle('eenote-stale',stale);
  // 名簿の警告は画面に残す（トーストは消える・キャッシュから起動した時は出ない）
  const wn=document.getElementById('eeWarn');
  const errW=rosterLoading?'':rosterErrMsg(),rw=rosterWarnText(rs),gOld=rosterLoading?'':rosterErrGasOld();
  const oldDone=!examStart()&&Array.isArray(rs.done)&&rs.done.some(r=>r&&(r.date||'')<todayLocal());   // 前日以前のシートの記録がある＝複数日の試験かもしれない
  if(wn){const w=[errW,rosterKeptEmpty?t('eRosterEmptyKept'):'',rw,gOld&&!rw.includes(gOld)?gOld:'',oldDone?t('wExamStart'):''].filter(Boolean).join(' ／ ');wn.textContent=w?'⚠ '+w:'';wn.hidden=!w}
}
/* 試験期間の記録（設定の「試験開始日」以降。未設定なら全部）。作業の済/残りは日付をまたいで数える（豚がいない作業は後日に回すため） */
const EXAM_START_KEY='jitsugi_v2_exam_start';
function examStart(){let v='';try{v=localStorage.getItem(EXAM_START_KEY)||''}catch{}return v&&v>todayLocal()?'':v}   // 前の版で入った未来の開始日は無視（全員が未実施に見えて二重採点になるのを防ぐ）
function setExamStart(v){
  v=/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v:'';
  if(v&&v>todayLocal()){toast(t('eExamFuture'),1);const el=document.getElementById('cfgExamStart');if(el)el.value=examStart();return}   // 未来の開始日は全員を未実施に見せる＝入れない
  try{v?localStorage.setItem(EXAM_START_KEY,v):localStorage.removeItem(EXAM_START_KEY)}catch{}
  renderRoster();toast(v?t('tExamStart').replace('{d}',v):t('tExamStartAll'));
}
/* この端末の記録＋シートの記録の要約（名簿と一緒に取った・ほかの端末で採点した分）。同じ記録IDはこの端末の記録を使う。
   シートの分は試験開始日から（未設定なら今日の分だけ＝前回の試験・練習の記録をシートから拾って「済」にしない） */
function examRecs(){
  const st=examStart(),local=getAll();
  const ids=new Set(local.map(r=>r.id));getDels().forEach(d=>ids.add(d.id));recentDeleted().forEach(d=>ids.add(d.id));   // 消した（削除待ち・最近消し終えた）記録は数えない
  const sd=getRoster().done,from=st||todayLocal();
  const extra=Array.isArray(sd)?sd.filter(r=>r&&!ids.has(r.id)&&(r.date||'')>=from):[];
  return local.filter(r=>!r.sheetGone&&(!st||(r.date||'')>=st)).concat(extra);   // シートで削除済み（別の端末で削除）は済に数えない
}
/* その人の試験期間の記録にある作業（人の特定は person.js＝履歴・グラフと同じ規則。
   所属未確定→農場が決まった・農場名の表記を直した・名前を直した（旧名）後も「済」のまま。同じ名前が2人以上いる時だけ農場も見る） */
function doneWorksOf(p,recs,ro){return doneMap(recs,ro||getRoster().list).get(p)||new Set()}
/* 進み具合: 割り当てた作業のうち試験期間の記録にある作業の数。全部そろった時だけ完了
   作業名不明の作業は評価者が作業選択で補うので、記録にある作業の数が割り当ての数に届いた時に完了とみなす
   作業未設定の人は、記録が1つでもあれば完了（従来どおり） */
function eeProgress(p,recs,ro){
  const ds=doneWorksOf(p,recs,ro),nu=p.unresolved?p.unresolved.length:0,total=p.works.length+nu;
  if(!total)return{done:ds.size?1:0,total:0,complete:ds.size>0,doneSet:ds};
  const dAssigned=p.works.filter(w=>ds.has(w)).length;
  const extra=[...ds].filter(w=>!p.works.includes(w)).length;
  const done=dAssigned+Math.min(nu,extra);
  return{done,total,complete:done>=total,doneSet:ds};
}
/* 選択中の名簿の人の、試験期間にすでに記録のある作業（編集中は出さない） */
function curDoneWorks(){
  if(editId)return[];
  const ro=getRoster().list,p=selEntry(ro);if(!p)return[];
  return [...doneWorksOf(p,examRecs(),ro)];
}
/* 'YYYY-MM-DD' → 'M/D'（形が違えばそのまま） */
function mdOf(d){const m=/^\d{4}-(\d{2})-(\d{2})$/.exec(d||'');return m?fmtMD(m[1],m[2]):String(d||'—')}   // vi/id は 日/月
/* その人の試験期間の記録（人の特定は person.js の規則）。新しい順。ro は p を取り出した名簿の配列（getRoster() は呼ぶたびに別の配列） */
function recsOf(p,ro){
  const recs=examRecs(),keyOf=personKeyer(recs,ro);
  return recs.filter(r=>keyOf(r).entry===p).sort((a,b)=>((b.date||'')+(b.createdAt||'')).localeCompare((a.date||'')+(a.createdAt||'')));
}
function lastRecOf(p,ro){return recsOf(p,ro)[0]||null}
/* 選択中の人の、その作業の前回（試験期間で最新の記録）{date, avg}。無ければ null（編集中は出さない） */
function prevWork(wid){
  if(editId)return null;
  const ro=getRoster().list,p=selEntry(ro);if(!p)return null;
  const r=recsOf(p,ro).find(r=>(r.works||[]).some(we=>we.workId===wid));if(!r)return null;
  const we=r.works.find(we=>we.workId===wid);
  let avg=typeof we.avg==='number'?we.avg:null;   // シートの記録は作業平均だけを持つ
  if(avg==null){const v=Object.values(we.scores||{}).filter(x=>typeof x==='number');avg=v.length?v.reduce((a,b)=>a+b,0)/v.length:null}
  return{date:r.date,avg};
}
function scrollToEe(){
  const eb=document.querySelector('.eebox');if(!eb)return;
  const pr=document.querySelector('.prog');
  const off=hdrStk()+(pr?pr.offsetHeight:0)+8;
  window.scrollTo({top:Math.max(0,eb.getBoundingClientRect().top+window.scrollY-off),behavior:smoothB()});
}
function selectEe(i,opt){
  opt=opt||{};
  toastClearAct();
  const ro=getRoster().list,p=ro[i];if(!p)return;
  if(editId){
    if(p===selEntry(ro))return;
    // 確認は1回だけ: 編集を始める前に採点途中だった人がいれば、その人の採点も破棄されることを同じ確認で伝える
    const pe=preEdit,peHas=!!(pe&&pe.cur&&pe.cur.name&&nmKey(pe.cur.name)!==nmKey(p.name)&&(pe.dirty||formHasContent(pe)));   // 押したのが採点途中だった本人なら、その採点は戻すだけ（破棄しない）
    if(!confirm(peHas?t('cLeaveEdit2').replace('{n}',pe.cur.name):t('cLeaveEdit')))return;   // 「編集中」とだけ出して止めない: 編集をやめてこの人へ
    dirty=false;exitEdit();
    if(peHas)dirty=false;   // 戻した採点途中の人は、いま破棄に同意した＝下の「破棄しますか」をもう一度聞かない
  }
  if(p===selEntry(ro)&&!opt.redo)return;
  const pg=eeProgress(p,examRecs(),ro),last=pg.complete?lastRecOf(p,ro):null,ro0=ro;
  // 全作業が済んでいる人を押す＝その記録を開いて修正（この端末の記録がある時。最新の記録を開く）。
  // やり直し（もう一度採点して新しい記録にする）は編集バーの「やり直し」から（opt.redo）。
  // ほかの端末の記録しか無い人は、この端末では修正できないので、やり直しだけ確認して続ける
  if(pg.complete&&!opt.redo){
    const mine=recsOf(p,ro).filter(r=>getAll().some(e=>e.id===r.id));
    // 今日以外の記録（前回の試験・練習）は黙って開かない: OK=新しく採点（やり直し）／キャンセル=その記録を開いて修正
    const md=mine.length?mine[0].date:'';
    const old=mine.length&&md!==todayLocal()&&md!==document.getElementById('fDate').value&&confirm(t('cOldRec').replace(/\{d\}/g,mdOf(mine[0].date)).replace('{n}',p.name));
    if(mine.length&&!old){startEdit(mine[0].id);if(mine.length>1&&editId===mine[0].id)toast(t('tMoreRecs').replace('{n}',mine.length-1));return}
    if(!old&&!confirm(t('cRedo').replace('{n}',p.name).replace('{d}',last?mdOf(last.date):'—')))return;
  }
  // 人がまだ決まっていないのに採点がある（前の版の下書き等）: 捨てずにこの人の採点として引き継ぐ
  const orphan=!curEe.name&&!curEe.manual&&!!document.querySelector('#cards .ec.scored');
  if(!orphan&&dirty&&document.querySelector('#cards .ec.scored')&&!confirm(t('cSwitchEe')))return;
  const snap=orphan?collectForm():null;
  const dt=document.getElementById('fDate').value;
  clearForm();
  if(dt)document.getElementById('fDate').value=dt;
  setCur({name:p.name,farm:p.farm,manual:false});
  // やり直し（#eeCur に「やり直し（前回 M/D）」）。前回までの記録ID（この端末＋シートの要約）を控え、保存する記録の redoOf に入れる
  // ＝シート・CSV で前回の行と見分けられる（集計では「やり直し元」に書かれた記録IDの行を除く）
  if(pg.complete){curEe.redo=last?last.date:'-';const ro=normRedoOf(recsOf(p,ro0).map(r=>r.id));if(ro)curEe.redoOf=ro}
  // 試験期間に済んだ作業は外し、残りの作業だけを出す（前の日に途中保存した人も同じ。全部済んでいる人を選び直した時は全作業＝やり直し）
  const ds=doneWorksOf(p,examRecs(),ro);
  const left=p.works.filter(w=>!ds.has(w));
  selWorks=(left.length?left:p.works).slice();
  // やり直し: 前回の記録にある作業（作業選択で足した・名簿から外れた作業）も全部採点し直す。前回の記録は丸ごと「やり直し前」になるため、漏れた作業が集計から消えないように
  if(pg.complete)recsOf(p,ro0).forEach(r=>(r.works||[]).forEach(we=>{if(we&&workById(we.workId)&&!selWorks.includes(we.workId))selWorks.push(we.workId)}));
  if(pg.complete){   // 今の作業一覧に無い作業の点は、やり直すと集計から外れる（採点し直せない）→ 先に確かめる
    const gone=[];recsOf(p,ro0).forEach(r=>(r.works||[]).forEach(we=>{if(we&&!workById(we.workId)){const n=we.workName||we.workId;if(!gone.includes(n))gone.push(n)}}));
    if(gone.length&&!confirm(t('cRedoGone').replace('{w}',gone.join(listSep())))){clearForm();selWorks=[];saveSel();buildWorkSel();buildCards();return}
  }
  if(snap)snap.works.forEach(we=>{if(!selWorks.includes(we.workId)&&formHasContent({works:[we]}))selWorks.push(we.workId)});
  saveSel();buildWorkSel();buildCards(true);   // 人を選んだ最初の構築だけフェード
  if(snap){fillForm(snap.works);document.getElementById('fOv').value=snap.overall||'';updProg()}
  const unk=p.unresolved&&p.unresolved.length;
  document.getElementById('wselBox').open=!selWorks.length||!!unk;   // 作業名不明の人は作業選択を開いたまま（評価者が補う）
  renderRoster();onCh();
  const unkMsg=unk?p.name+' — '+t('unkWorkLbl')+': '+p.unresolved.join(listSep()):'';
  // 「採点中: 名前（農場）」を貼り付く帯の下に出し、フォーカスも採点の入口へ（押したタブに残すと、読み上げは残りの人のタブを全部通ることになる）
  // 評価者名が未確定なら、人を選んだこの時点で知らせる（保存の時に最上部へ戻す往復をなくす）。打ちかけの名前はここで確定。
  // 作業名不明（⚠）の人でも同じ（作業名不明の案内は同じトーストに添える）
  if(!adoptTypedEvaluator(true)&&!getEvaluator()&&!editId){
    const eb=document.getElementById('evBox');eb.classList.add('ev-need');
    toast(t('eEvFirst')+(unkMsg?' ／ '+unkMsg:''),1);editEvaluator();scrollBelowStk(eb,8,true);return;
  }
  if(unk)toast(unkMsg,1);
  const ec=document.getElementById('eeCur');
  if(ec&&!ec.hidden&&selWorks.length&&!unk){scrollBelowStk(ec,8,true);ec.focus({preventScroll:true})}
}
/* 名簿にいない人（当日来た新人・登録漏れ・表記違い）をその場で手入力して評価する */
function openManualEe(){
  toastClearAct();
  if(editId){toast(t('editingBanner'),1);return}
  if(dirty&&document.querySelector('#cards .ec.scored')&&!confirm(t('cSwitchEe')))return;
  const dt=document.getElementById('fDate').value;
  clearForm();if(dt)document.getElementById('fDate').value=dt;
  selWorks=[];saveSel();buildWorkSel();buildCards();
  curEe.manual=true;renderRoster();
  document.getElementById('wselBox').open=true;
  const f=document.getElementById('fEe');f.focus();
}
async function saveSheetUrl(){
  if(!setSheetUrl(document.getElementById('cfgUrl').value))return;
  setTok(document.getElementById('cfgTok').value);
  document.getElementById('cfgUrl').value=sheetUrl();
  updSyncUI();
  if(!sheetUrl()){renderRoster();return}
  await reloadRoster();
  syncPending();
}

/* ==============================================================
   タブ（設定はPW保護）
   ============================================================== */
let cfgUnlocked=false;
function swTab(btn){
  if(btn.dataset.pg==='pgCfg'&&!cfgUnlocked){
    const want=(window.TENANT&&window.TENANT.cfgPwSha256)||'';   // パスワードは平文で持たない（tenant-config.js のハッシュと照合）
    if(want){
      const pw=prompt(t('pwPrompt'));
      if(!pw||sha256hex(pw.toUpperCase())!==want){toast(t('pwWrong'),1);return}
    }
    cfgUnlocked=true;
  }
  document.querySelectorAll('.tabs button').forEach(b=>{b.classList.remove('on');b.removeAttribute('aria-current')});
  btn.classList.add('on');btn.setAttribute('aria-current','page');
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));
  document.getElementById(btn.dataset.pg).classList.add('on');
  if(btn.dataset.pg==='pgHi'){refreshSel();drawHist()}
  if(btn.dataset.pg==='pgCh'){refreshSel();populateChWork();drawCharts()}
}
/* 履歴・グラフの被評価者 = 「農場＋名前」（同名異人を合算しない）。表示は同名が複数農場にいる時だけ「名前（農場）」 */
function refreshSel(){
  const ps=eePeople(getAll());
  const opts=ps.map(p=>`<option value="${esc(p.key)}">${esc(p.label)}</option>`).join('');
  const hf=document.getElementById('hFil'),hv=hf.value;
  hf.innerHTML=`<option value="">${t('filterAll')}</option>`+opts;hf.value=hv;
  const cs=document.getElementById('chSel'),cv=cs.value;
  cs.innerHTML=`<option value="">${t('selPh')}</option>`+opts;cs.value=cv;
}

let dirty=false,editId=null,editEv=null,autoT=null,preEdit=null;   // preEdit={date,cur,sel,works,overall,dirty}＝編集を始める前のフォーム
