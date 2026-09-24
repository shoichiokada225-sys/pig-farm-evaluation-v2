/* app.js — アプリ層：初期化・言語・作業選択・入力/保存/編集フロー */
/* ==============================================================
   言語
   ============================================================== */
function setLang(l){
  lang=l;localStorage.setItem(LKEY,l);document.documentElement.lang=l;
  document.querySelectorAll('.lsw button').forEach(b=>{const on=b.textContent.trim()==={ja:'JP',en:'EN',vi:'VI',id:'ID'}[l];b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
  applyT();buildWorkSel();buildCards();restoreSt();renderEvaluator();renderRoster();updSyncUI();
  const cur=document.querySelector('.tabs button.on');
  if(cur&&cur.dataset.pg==='pgHi')drawHist();
  if(cur&&cur.dataset.pg==='pgCh'){populateChWork();drawCharts()}
}
function applyT(){
  document.querySelectorAll('[data-t]').forEach(el=>{el.textContent=t(el.dataset.t)});
  document.querySelectorAll('[data-ph]').forEach(el=>{el.placeholder=t(el.dataset.ph)});
  document.getElementById('btnSave').textContent=editId?t('btnUpdate'):t('btnSave');
  document.getElementById('hFil').setAttribute('aria-label',t('filterLbl'));
}

/* ==============================================================
   初期化
   ============================================================== */
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('fDate').value=todayLocal();
  document.getElementById('dataVer').textContent='DATA '+(WORKDATA_V2.version||'-')+' / '+WORKDATA_V2.works.length+' works';
  setLang(lang);
  restoreDraft();
  document.getElementById('fEv').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commitEvaluator()}});
  document.getElementById('fDate').addEventListener('change',renderRoster);
  document.getElementById('fEe').addEventListener('input',renderRoster);
  document.getElementById('cfgUrl').value=sheetUrl();
  document.getElementById('cfgExamStart').value=examStart();
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
  mo.addEventListener('keydown',e=>{
    if(e.key==='Escape'){closeMo();return}
    if(e.key!=='Tab')return;
    const f=[...mo.querySelectorAll('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
    if(!f.length)return;
    const first=f[0],last=f[f.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  });
  fixProg();window.addEventListener('resize',fixProg);
  if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
});

/* 進捗バーはヘッダーの下・作業見出しは進捗バーの下に貼り付く（高さは言語・画面幅・未採点ボタンの有無で変わるので実測） */
function fixProg(){const p=document.querySelector('.prog'),hd=document.querySelector('.hdr');if(!hd)return;const h=hd.offsetHeight;if(p)p.style.top=h+'px';
  document.documentElement.style.setProperty('--stk',(h+(p?p.offsetHeight:0))+'px')}
function stkH(){return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stk'))||0}
/* 貼り付く帯（ヘッダー＋進捗＋作業見出し）の下に要素の頭が来るようにスクロール */
function scrollBelowStk(el,extra,smooth){
  window.scrollTo({top:Math.max(0,el.getBoundingClientRect().top+window.scrollY-stkH()-(extra||8)),behavior:smooth?'smooth':'auto'});
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
  if(on){if(!selWorks.includes(id))selWorks.push(id)}
  else selWorks=selWorks.filter(x=>x!==id);
  saveSel();saveSt();buildWorkSel();buildCards();restoreSt();onCh();
}
function clearWorks(){
  if(!selWorks.length)return;
  if(dirty&&!confirm(t('cCEdit')))return;
  if(editId)exitEdit();
  selWorks=[];saveSel();buildWorkSel();buildCards();
  localStorage.removeItem(DRAFT_KEY);dirty=false;
}

/* ==============================================================
   入力変更・下書き
   ============================================================== */
function onCh(){dirty=true;clearTimeout(autoT);autoT=setTimeout(saveDraft,300)}
['fDate','fEe','fOv'].forEach(id=>document.getElementById(id).addEventListener('input',onCh));
function saveDraft(){const d=collectForm();d._editId=editId;d._sel=selWorks;localStorage.setItem(DRAFT_KEY,JSON.stringify(d))}
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
  if(!d)return;
  // 下書きの作業選択を復元（カタログに実在するものだけ）
  if(Array.isArray(d._sel)){
    const sel=d._sel.filter(id=>workById(id));
    if(sel.length){selWorks=sel;saveSel();buildWorkSel();buildCards()}
  }
  // 復元するのは採点・コメント・所感・手入力の名前がある時だけ（評価者名は端末の設定、名簿の人はタブを押しただけ＝入力途中ではない）
  const ee=(d.evaluatee||'').trim();
  const eeManual=!!ee&&!getRoster().list.some(p=>p.name===ee);
  const hasContent=eeManual||(d.overall||'').trim()
    ||(d.works||[]).some(we=>Object.values(we.scores||{}).some(v=>v!=null)||Object.values(we.comments||{}).some(v=>(v||'').trim()));
  if(!hasContent)return;
  const isEdit=!!(d._editId&&getAll().some(e=>e.id===d._editId));
  // 前日以前の入力途中: 日付を今日にするか確認（黙って昨日の日付で記録しない）。編集中の下書きは記録の日付のまま
  let dt=d.date;
  if(dt&&!isEdit&&dt!==todayLocal()){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dt);
    if(confirm(t('cDraftDate').replace(/\{d\}/g,m?(+m[2])+'/'+(+m[3]):dt)))dt=todayLocal();
  }
  if(dt)document.getElementById('fDate').value=dt;
  document.getElementById('fEe').value=d.evaluatee||'';
  document.getElementById('fOv').value=d.overall||'';
  getItems().forEach(it=>{
    const we=(d.works||[]).find(x=>x.workId===it.workId);
    const sc=we&&we.scores[it.aspectId];if(sc)setScoreUI(it.id,sc);
    const ta=document.querySelector('textarea[data-cid="'+it.id+'"]');if(ta)ta.value=(we&&we.comments[it.aspectId])||'';
  });
  if(isEdit){
    editId=d._editId;preEditDate=null;
    document.getElementById('editBar').classList.add('show');
    document.getElementById('btnSave').textContent=t('btnUpdate');
  }
  updProg();toast(t('tDraft'));
}

/* ==============================================================
   保存
   ============================================================== */
function doSave(){
  if(!selWorks.length){toast(t('eNoWork'),1);return}
  const d=collectForm();
  if(!d.evaluator.trim()){toast(t('eEv'),1);editEvaluator();document.getElementById('evBox').scrollIntoView({behavior:'smooth',block:'center'});return}
  if(!d.evaluatee.trim()){toast(t('eEe'),1);document.querySelector('.eebox').scrollIntoView({behavior:'smooth',block:'center'});return}
  if(!d.date){toast(t('eDt'),1);return}
  clearTimeout(autoT);   // 保存前の入力で予約された下書き保存を取り消す（保存後に古い日付だけの下書きが残らないように）
  let miss=getItems().filter(it=>{
    const we=d.works.find(x=>x.workId===it.workId);return !we||we.scores[it.aspectId]==null;
  });
  // 作業単位の部分保存: 採点を1つも付けていない作業だけが残っている時は、終わった作業だけを保存できる（作業8つでも途中で保存・豚がいない作業は後日）
  let partLeft=0;
  if(miss.length&&!editId){
    const st=workStats(d);
    const empty=st.filter(x=>x.done===0),half=st.filter(x=>x.done>0&&x.done<x.total),full=st.filter(x=>x.total&&x.done===x.total);
    if(half.length)miss=miss.filter(it=>half.some(x=>x.wid===it.workId));   // 途中の作業の未採点だけを示す
    else if(full.length&&empty.length){
      const nm=empty.map(x=>{const w=workById(x.wid);return w?loc(w,'name'):x.wid}).join('、');
      if(!confirm(t('cPartSave').replace('{n}',empty.length).replace('{w}',nm)))return;
      d.works=d.works.filter(we=>full.some(x=>x.wid===we.workId));partLeft=empty.length;miss=[];
    }
  }
  // 未採点の印（⚠ 未採点・太い赤枠）は点を付けるまで残す。件数と「次へ」は進捗の横に残る。1枚目の点数ボタンへフォーカス
  if(miss.length){document.querySelectorAll('#cards .ec.miss').forEach(c=>c.classList.remove('miss'));
    miss.forEach(it=>{const c=document.getElementById('c-'+it.id);if(c){c.classList.remove('miss');void c.offsetWidth;c.classList.add('miss')}});
    updProg();
    toast(t('eSc')+'('+miss.length+')',1);focusMiss(document.getElementById('c-'+miss[0].id));return}
  const all=getAll();
  const who=eeSaveInfo(d.evaluatee.trim());
  if(editId){
    const idx=all.findIndex(e=>e.id===editId);
    if(idx===-1){toast(t('eEditGone'),1);exitEdit();return}
    all[idx]=normRec({...all[idx],date:d.date,evaluator:d.evaluator.trim(),evaluatee:d.evaluatee.trim(),farm:all[idx].farm||who.farm,works:d.works,overall:d.overall,updatedAt:new Date().toISOString(),sent:false});
    putAll(all);toast(t('tUpdated'));exitEdit();
  }else{
    all.push(normRec({id:crypto.randomUUID(),date:d.date,evaluator:d.evaluator.trim(),evaluatee:d.evaluatee.trim(),farm:who.farm,...(who.manual?{manual:true}:{}),works:d.works,overall:d.overall,createdAt:new Date().toISOString(),sent:false}));
    putAll(all);toast(partLeft?t('tSavedPart').replace('{n}',partLeft):t('tSaved'));
  }
  localStorage.removeItem(DRAFT_KEY);dirty=false;refreshSel();
  // 次の被評価者へ：作業選択も空に戻す（名簿のタブを押せば再セット）
  selWorks=[];saveSel();buildWorkSel();buildCards();
  eeQuery='';eeManualOpen=false;document.getElementById('eeFind').value='';
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
  const w=workById(wid);const nm=w?loc(w,'name'):wid;
  const sc=document.querySelector('#cards .ec.scored[data-w="'+wid+'"]');
  if(sc&&!confirm(t('cSkipScored').replace('{w}',nm)))return;
  const y=window.scrollY,idx=selWorks.indexOf(wid),snap=collectForm().works.find(we=>we.workId===wid),who=document.getElementById('fEe').value;
  toggleWork(wid,false);
  window.scrollTo({top:y});   // 位置を保つ（外した作業の場所に次の作業が来る）
  // 誤タップ対策: トーストの「元に戻す」で、外した作業を同じ位置に採点ごと戻す（同じ人を選んでいる間だけ）
  toast(t('tSkipped').replace('{w}',nm),0,{label:t('undo'),fn:()=>unskipWork(wid,idx,snap,who)});
}
function unskipWork(wid,idx,snap,who){
  if(editId||selWorks.includes(wid)||document.getElementById('fEe').value!==who)return;
  selWorks.splice(Math.max(0,Math.min(idx,selWorks.length)),0,wid);
  saveSel();saveSt();buildWorkSel();buildCards();restoreSt();
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
  if(!editId)preEditDate=document.getElementById('fDate').value;   // 編集を終えたら、編集前に選んでいた評価日へ戻す
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
  if(rec.farm){try{localStorage.setItem(FARM_KEY,rec.farm)}catch{}}
  eeManualOpen=!!rec.manual;
  document.getElementById('fEe').value=rec.evaluatee;renderRoster();
  document.getElementById('fOv').value=rec.overall||'';
  getItems().forEach(it=>{
    const we=(rec.works||[]).find(x=>x.workId===it.workId);
    const sc=we&&we.scores[it.aspectId];if(sc)setScoreUI(it.id,sc);
    const ta=document.querySelector('textarea[data-cid="'+it.id+'"]');if(ta)ta.value=(we&&we.comments[it.aspectId])||'';
  });
  document.getElementById('editBar').classList.add('show');
  document.getElementById('btnSave').textContent=t('btnUpdate');
  window.scrollTo({top:0,behavior:'smooth'});dirty=false;updProg();
}
function cancelEdit(){if(dirty&&!confirm(t('cCEdit')))return;exitEdit();buildCards();clearForm()}
function exitEdit(){if(editId)document.getElementById('fDate').value=preEditDate||todayLocal();preEditDate=null;editId=null;editEv=null;document.getElementById('editBar').classList.remove('show');document.getElementById('btnSave').textContent=t('btnSave')}
function doReset(){if(!confirm(t('cReset')))return;clearForm();if(editId)exitEdit();document.getElementById('fDate').value=todayLocal();renderRoster();toast(t('tReset'))}
/* 評価日は評価者が選んだ日のまま（空の時だけ今日）。次の人へ進むたびに日付が変わると、同じ日の記録が2つの日付に分かれる */
function clearForm(keepDraft){
  clearTimeout(autoT);
  const fd=document.getElementById('fDate');if(!fd.value)fd.value=todayLocal();
  ['fEe','fOv'].forEach(id=>document.getElementById(id).value='');
  document.querySelectorAll('.sb.sel,.crit-lv.sel').forEach(b=>b.classList.remove('sel'));
  document.querySelectorAll('.ec.scored,.ec.miss').forEach(c=>c.classList.remove('scored','miss'));
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
  document.getElementById('evName').textContent=n;
  if(editing)document.getElementById('fEv').value=n;
}
function editEvaluator(){renderEvaluator(true);const f=document.getElementById('fEv');f.focus();f.select()}
function commitEvaluator(){
  const v=document.getElementById('fEv').value.trim();
  if(!v){toast(t('eEv'),1);return}
  setEvaluator(v);renderEvaluator();document.getElementById('fEv').blur();toast(t('tEvSaved'));
}

/* ==============================================================
   被評価者タブ（シート「受験者」の名簿→その人に用意した作業を表示）
   ============================================================== */
async function reloadRoster(silent){
  if(!sheetUrl()){renderRoster();return}
  const btn=document.querySelector('.eebox .wsel-hd button');if(btn){btn.disabled=true;btn.setAttribute('aria-busy','true')}
  rosterLoading=true;renderRoster();
  const r=await fetchRoster();
  rosterLoading=false;rosterErr=!r.ok;
  if(btn){btn.disabled=false;btn.removeAttribute('aria-busy')}
  rosterKeptEmpty=!!(r.ok&&r.keptEmpty);
  renderRoster();
  // 名簿の管理ミス（空・タブが無い・作業名不明・同名）は電波と違って放っても直らないので、起動時も知らせる
  if(r.ok){
    const w=rosterWarnText(r,5);
    if(r.keptEmpty)toast(t('eRosterEmptyKept'),1);
    else if(w)toast(w,1);
    else if(!silent)toast(t('tRoster')+' ('+r.list.length+')');
  }else if(r.reason==='nosheet')toast(t('eRosterNoSheet'),1);
  else if(!silent)toast(t('eRoster'),1);
  else{const rs=getRoster();if(rs.list.length&&rosterIsOld(rs))toast(t('rosterStale').replace('{t}',fmtAt(rs.at)),1)}   // 起動時でも、古い名簿のまま試験しないよう知らせる
}
/* 名簿の取得日時（端末の時刻で M/D HH:MM）と古さ */
const ROSTER_OLD_MS=12*3600*1000;
function fmtAt(at){
  const d=new Date(at||'');if(!at||isNaN(d))return'—';
  const p=n=>String(n).padStart(2,'0');
  return (d.getMonth()+1)+'/'+d.getDate()+' '+p(d.getHours())+':'+p(d.getMinutes());
}
function rosterIsOld(rs){const d=new Date(rs&&rs.at||'');return isNaN(d)||Date.now()-d.getTime()>ROSTER_OLD_MS}
const FARM_KEY='jitsugi_v2_farm';
let eeQuery='',eeManualOpen=false,rosterKeptEmpty=false;
function storedFarm(){try{return localStorage.getItem(FARM_KEY)||''}catch{return''}}
/* 名簿の農場（シートの並び順・所属未確定/空欄は最後） */
/* 農場名の表示だけを訳す（空欄=農場未記入・「所属未確定」=訳語）。data-f・保存する farm・シートの値は元の文字列のまま */
function farmDisp(f){return !f?t('farmNone'):/未確定/.test(f)?t('farmUnassigned'):f}
function rosterFarms(ro){
  const fs=[];ro.forEach(p=>{if(!fs.includes(p.farm))fs.push(p.farm)});
  const last=f=>!f||/未確定/.test(f)?1:0;
  return fs.sort((a,b)=>last(a)-last(b));
}
/* 選択中の名簿の人 = 「農場＋名前」で特定（同じ名前が2農場にいても取り違えない） */
function selEntry(ro){
  const cur=document.getElementById('fEe').value.trim();if(!cur)return null;
  const f=storedFarm();
  return ro.find(p=>p.name===cur&&p.farm===f)||null;
}
function curFarm(ro){
  const fs=rosterFarms(ro);
  const cur=document.getElementById('fEe').value.trim();
  let f=storedFarm();
  if(cur&&!ro.some(p=>p.name===cur&&p.farm===f)){const hit=ro.find(p=>p.name===cur);if(hit)f=hit.farm}  // 編集中など
  return fs.includes(f)?f:fs[0];
}
/* 保存する農場: 選んだ名簿の人の農場。名簿にない名前は農場空欄＋名簿外の印 */
function eeSaveInfo(name){
  const ro=getRoster().list;
  const p=ro.find(p=>p.name===name&&p.farm===storedFarm());
  if(p)return{farm:p.farm,manual:false};
  const hs=ro.filter(p=>p.name===name);
  if(hs.length===1)return{farm:hs[0].farm,manual:false};
  return{farm:'',manual:ro.length>0&&!hs.length};
}
/* 検索用の正規化: 全角半角・大小・ひらがな→カタカナ・アクセント記号（ベトナム語）・区切り記号を揃える */
function normQ(s){
  return String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase()
    .replace(/[đ]/g,'d').replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60))
    .replace(/[\s・･·.\-_,、。（）()]/g,'');
}
function selectFarm(f){
  const cur=document.getElementById('fEe').value.trim();
  const sel=selEntry(getRoster().list);
  try{localStorage.setItem(FARM_KEY,f)}catch{}
  eeQuery='';document.getElementById('eeFind').value='';
  if(cur&&sel&&sel.farm!==f&&!editId){         // 別の農場へ切り替えたら選択中の人は外す
    if(dirty&&document.querySelector('#cards .ec.scored')&&!confirm(t('cSwitchEe'))){try{localStorage.setItem(FARM_KEY,sel.farm)}catch{};return}
    const dt=document.getElementById('fDate').value;clearForm();if(dt)document.getElementById('fDate').value=dt;
    selWorks=[];saveSel();buildWorkSel();buildCards();
  }
  renderRoster();
}
function renderRoster(){
  const box=document.getElementById('eeTabs'),note=document.getElementById('eeNote'),fbox=document.getElementById('eeFarms');
  const rs=getRoster(),ro=rs.list;
  const cur=document.getElementById('fEe').value.trim();
  const recs=examRecs();
  const pr=new Map();ro.forEach(p=>pr.set(p,eeProgress(p,recs,ro)));
  const isDone=p=>pr.get(p).complete;
  const sel=selEntry(ro);
  const fs=rosterFarms(ro),farm=curFarm(ro);
  const showF=fs.length>1||(fs.length===1&&fs[0]);
  fbox.innerHTML=showF?fs.map(f=>{
    const ps=ro.filter(p=>p.farm===f),left=ps.filter(p=>!isDone(p)).length,on=f===farm;
    return `<button type="button" class="fchip${on?' on':''}" aria-pressed="${on}" onclick="selectFarm(this.dataset.f)" data-f="${esc(f)}" data-left="${left}" data-n="${ps.length}">`+
      `${esc(farmDisp(f))}<span class="fchip-ct${left?'':' zero'}">${left?esc(t('leftN').replace('{n}',left)):'✓'}</span></button>`;
  }).join(''):'';
  const onChip=fbox.querySelector('.fchip.on');   // 選択中の農場を横スクロールの中央へ（ページは縦に動かさない）
  if(onChip)fbox.scrollLeft=Math.max(0,onChip.offsetLeft-(fbox.clientWidth-onChip.offsetWidth)/2);
  const ps=[];ro.forEach((p,i)=>{if(!showF||p.farm===farm)ps.push(i)});
  const findOn=ps.length>8;                      // 8名を超える農場は名前で絞り込めるように
  document.getElementById('eeFindBox').hidden=!findOn;
  const q=findOn?normQ(eeQuery):'';
  const hit=q?ps.filter(i=>[ro[i].name,...(ro[i].aliases||[])].some(n=>normQ(n).includes(q))):ps;
  const todo=hit.filter(i=>!isDone(ro[i])),dn=hit.filter(i=>isDone(ro[i]));   // 未実施を先・実施済みは後ろ
  const tab=i=>{
    const p=ro[i],on=p===sel,g=pr.get(p),d=g.complete,part=!d&&g.done>0;
    return `<button type="button" class="eetab${on?' on':''}${d?' done':''}${part?' part':''}" aria-pressed="${on}" data-i="${i}" data-done="${g.done}" data-total="${g.total}" title="${esc(p.name)}" onclick="selectEe(${i})">`+
      `<span class="eetab-nm${[...p.name].length>12?' long':''}">${esc(p.name)}</span><span class="eetab-ct">${d?esc(t('doneLbl'))+' · ':''}${part?`<span class="eetab-pt">${esc(t('partLbl'))} ${g.done}/${g.total}</span>`+esc(t('worksUnit')):p.works.length?p.works.length+esc(t('worksUnit')):esc(t('worksNone'))}${p.common?` <span class="eetab-cm">${esc(t('commonLbl'))}</span>`:''}</span>`+
      `${p.unresolved&&p.unresolved.length?`<span class="eetab-unk">⚠ ${esc(t('unkWorkLbl'))}: ${esc(p.unresolved.join('、'))}</span>`:''}`+
      `${d?'<span class="eetab-ok" aria-hidden="true">✓</span>':''}</button>`;
  };
  box.innerHTML=todo.map(tab).join('')+(dn.length?`<div class="eegrp">✓ ${esc(t('doneGrp'))} (${dn.length})</div>`+dn.map(tab).join(''):'')
    +(q&&!hit.length?`<p class="eenone">${esc(t('eeNoHit'))}</p>`:'');
  // 手入力欄: 名簿が無い時／「名簿にない人を入力」を押した時／入力済みの名前が名簿の人と一致しない時（打った名前を隠さない）
  const manual=!ro.length||eeManualOpen||(!!cur&&!sel);
  document.getElementById('eeManual').style.display=manual?'':'none';
  document.getElementById('eeAdd').hidden=!ro.length||manual;
  // 選んだ人の名前（全文）と農場を採点カードの上に1行で（タブの名前は長いと切れる・手入力欄は隠れるため）
  const ec=document.getElementById('eeCur');
  if(ec){ec.hidden=!sel;ec.innerHTML=sel?`${esc(t('scoringFor'))}: <b>${esc(sel.name)}</b>（${esc(farmDisp(sel.farm))}）`:''}
  // 名簿の取得日時を常に出す。今回の取得に失敗・古い名簿の時は警告色（圏外の豚舎で古い名簿のまま試験しないように）
  const atTx=fmtAt(rs.at),stale=!!ro.length&&!rosterLoading&&!!sheetUrl()&&(rosterErr||rosterIsOld(rs));
  note.textContent=rosterLoading?t('eeLoading')+(ro.length?' ／ '+t('rosterAt').replace('{t}',atTx):'')
    :ro.length?(stale?(rosterErr?t('rosterStale'):t('rosterOld')).replace('{t}',atTx):t('eeTabHint')+' ／ '+t('rosterAt').replace('{t}',atTx))
    :(!sheetUrl()?t('noSheet'):rosterErr?t('eRosterNet'):t('eeNoRoster'));
  note.classList.toggle('eenote-stale',stale);
  // 名簿の警告は画面に残す（トーストは消える・キャッシュから起動した時は出ない）
  const wn=document.getElementById('eeWarn');
  if(wn){const w=[rosterKeptEmpty?t('eRosterEmptyKept'):'',rosterWarnText(rs)].filter(Boolean).join(' ／ ');wn.textContent=w?'⚠ '+w:'';wn.hidden=!w}
}
/* 試験期間の記録（設定の「試験開始日」以降。未設定なら全部）。作業の済/残りは日付をまたいで数える（豚がいない作業は後日に回すため） */
const EXAM_START_KEY='jitsugi_v2_exam_start';
function examStart(){try{return localStorage.getItem(EXAM_START_KEY)||''}catch{return''}}
function setExamStart(v){
  v=/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v:'';
  try{v?localStorage.setItem(EXAM_START_KEY,v):localStorage.removeItem(EXAM_START_KEY)}catch{}
  renderRoster();toast(v?t('tExamStart').replace('{d}',v):t('tExamStartAll'));
}
function examRecs(){const st=examStart();return getAll().filter(r=>!st||(r.date||'')>=st)}
/* その人の試験期間の記録にある作業
   記録の農場は「保存した時の農場」。所属未確定→農場が決まった・農場名の表記を直した後も「済」のままにするため、
   名簿で同じ名前（旧名を含む）が1人だけなら農場を見ずに名前で数える。同じ名前が2人以上いる時だけ農場も見る（農場が空の旧記録は名前で数える） */
function nmKey(v){return String(v==null?'':v).normalize('NFC').trim()}
const nameIdxCache=new WeakMap();
function nameIndex(ro){
  let m=nameIdxCache.get(ro);if(m)return m;
  m=new Map();
  ro.forEach(p=>[p.name,...(Array.isArray(p.aliases)?p.aliases:[])].forEach(n=>{const k=nmKey(n);if(!k)return;const a=m.get(k)||[];if(!a.includes(p))a.push(p);m.set(k,a)}));
  nameIdxCache.set(ro,m);return m;
}
function doneWorksOf(p,recs,ro){
  const idx=nameIndex(ro||getRoster().list),s=new Set();
  const keys=new Set([p.name,...(Array.isArray(p.aliases)?p.aliases:[])].map(nmKey));
  recs.forEach(r=>{
    const k=nmKey(r.evaluatee);if(!keys.has(k))return;
    const cs=idx.get(k)||[p];
    if(cs.length>1&&r.farm&&normFarm(r.farm)!==normFarm(p.farm))return;
    (r.works||[]).forEach(we=>s.add(we.workId));
  });
  return s;
}
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
function scrollToEe(){
  const eb=document.querySelector('.eebox');if(!eb)return;
  const hdr=document.querySelector('.hdr'),pr=document.querySelector('.prog');
  const off=(hdr?hdr.offsetHeight:0)+(pr?pr.offsetHeight:0)+8;
  window.scrollTo({top:Math.max(0,eb.getBoundingClientRect().top+window.scrollY-off),behavior:'smooth'});
}
function selectEe(i){
  const ro=getRoster().list,p=ro[i];if(!p)return;
  if(editId){toast(t('editingBanner'),1);return}
  if(p===selEntry(ro))return;
  if(dirty&&document.querySelector('#cards .ec.scored')&&!confirm(t('cSwitchEe')))return;
  const dt=document.getElementById('fDate').value;
  clearForm();
  if(dt)document.getElementById('fDate').value=dt;
  eeManualOpen=false;
  document.getElementById('fEe').value=p.name;
  try{localStorage.setItem(FARM_KEY,p.farm)}catch{}
  // 試験期間に済んだ作業は外し、残りの作業だけを出す（前の日に途中保存した人も同じ。全部済んでいる人を選び直した時は全作業＝やり直し）
  const ds=doneWorksOf(p,examRecs(),ro);
  const left=p.works.filter(w=>!ds.has(w));
  selWorks=(left.length?left:p.works).slice();saveSel();buildWorkSel();buildCards();
  const unk=p.unresolved&&p.unresolved.length;
  document.getElementById('wselBox').open=!selWorks.length||!!unk;   // 作業名不明の人は作業選択を開いたまま（評価者が補う）
  renderRoster();onCh();
  if(unk)toast(p.name+' — '+t('unkWorkLbl')+': '+p.unresolved.join('、'),1);
  // 「採点中: 名前（農場）」を貼り付く帯の下に出し、フォーカスも採点の入口へ（押したタブに残すと、読み上げは残りの人のタブを全部通ることになる）
  const ec=document.getElementById('eeCur');
  if(ec&&!ec.hidden&&selWorks.length&&!unk){scrollBelowStk(ec,8,true);ec.focus({preventScroll:true})}
}
/* 名簿にいない人（当日来た新人・登録漏れ・表記違い）をその場で手入力して評価する */
function openManualEe(){
  if(editId){toast(t('editingBanner'),1);return}
  if(dirty&&document.querySelector('#cards .ec.scored')&&!confirm(t('cSwitchEe')))return;
  const dt=document.getElementById('fDate').value;
  clearForm();if(dt)document.getElementById('fDate').value=dt;
  selWorks=[];saveSel();buildWorkSel();buildCards();
  eeManualOpen=true;renderRoster();
  document.getElementById('wselBox').open=true;
  const f=document.getElementById('fEe');f.focus();
}
async function saveSheetUrl(){
  if(!setSheetUrl(document.getElementById('cfgUrl').value))return;
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
    const pw=prompt(lang==='ja'?'設定画面のパスワードを入力してください':'Enter password for settings:');
    if(!pw||pw.toUpperCase()!=='OOIRI'){toast(lang==='ja'?'パスワードが違います':'Wrong password',1);return}
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

let dirty=false,editId=null,editEv=null,autoT=null,preEditDate=null;
