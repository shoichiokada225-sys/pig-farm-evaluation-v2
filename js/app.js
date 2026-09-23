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
  document.getElementById('fDate').value=new Date().toISOString().split('T')[0];
  document.getElementById('dataVer').textContent='DATA '+(WORKDATA_V2.version||'-')+' / '+WORKDATA_V2.works.length+' works';
  setLang(lang);
  restoreDraft();
  document.getElementById('fEv').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commitEvaluator()}});
  document.getElementById('fDate').addEventListener('change',renderRoster);
  document.getElementById('fEe').addEventListener('input',renderRoster);
  document.getElementById('cfgUrl').value=sheetUrl();
  reloadRoster(true).then(()=>syncPending(true));
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
  const fixProg=()=>{const p=document.querySelector('.prog');if(p)p.style.top=document.querySelector('.hdr').offsetHeight+'px'};
  fixProg();window.addEventListener('resize',fixProg);
  if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
});

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
  const hasContent=(d.evaluator||'').trim()||(d.evaluatee||'').trim()||(d.overall||'').trim()
    ||(d.works||[]).some(we=>Object.values(we.scores||{}).some(v=>v!=null)||Object.values(we.comments||{}).some(v=>(v||'').trim()));
  if(!hasContent)return;
  if(d.date)document.getElementById('fDate').value=d.date;
  document.getElementById('fEe').value=d.evaluatee||'';
  document.getElementById('fOv').value=d.overall||'';
  getItems().forEach(it=>{
    const we=(d.works||[]).find(x=>x.workId===it.workId);
    const sc=we&&we.scores[it.aspectId];if(sc)setScoreUI(it.id,sc);
    const ta=document.querySelector('textarea[data-cid="'+it.id+'"]');if(ta)ta.value=(we&&we.comments[it.aspectId])||'';
  });
  if(d._editId&&getAll().some(e=>e.id===d._editId)){
    editId=d._editId;
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
  const miss=getItems().filter(it=>{
    const we=d.works.find(x=>x.workId===it.workId);return !we||we.scores[it.aspectId]==null;
  });
  if(miss.length){miss.forEach(it=>{const c=document.getElementById('c-'+it.id);if(c){c.classList.add('warn');setTimeout(()=>c.classList.remove('warn'),1000)}});
    toast(t('eSc')+'('+miss.length+')',1);const c0=document.getElementById('c-'+miss[0].id);if(c0)c0.scrollIntoView({behavior:'smooth',block:'center'});return}
  const all=getAll();
  if(editId){
    const idx=all.findIndex(e=>e.id===editId);
    if(idx===-1){toast(t('eEditGone'),1);exitEdit();return}
    all[idx]=normRec({...all[idx],date:d.date,evaluator:d.evaluator.trim(),evaluatee:d.evaluatee.trim(),farm:rosterFarmOf(d.evaluatee.trim())||all[idx].farm||'',works:d.works,overall:d.overall,updatedAt:new Date().toISOString(),sent:false});
    putAll(all);toast(t('tUpdated'));exitEdit();
  }else{
    all.push(normRec({id:crypto.randomUUID(),date:d.date,evaluator:d.evaluator.trim(),evaluatee:d.evaluatee.trim(),farm:rosterFarmOf(d.evaluatee.trim()),works:d.works,overall:d.overall,createdAt:new Date().toISOString(),sent:false}));
    putAll(all);toast(t('tSaved'));
  }
  localStorage.removeItem(DRAFT_KEY);dirty=false;refreshSel();
  // 次の被評価者へ：作業選択も空に戻す（名簿のタブを押せば再セット）
  selWorks=[];saveSel();buildWorkSel();buildCards();
  clearForm();
  window.scrollTo({top:0,behavior:'smooth'});
  syncPending();
}

/* ==============================================================
   編集モード（レコードの作業構成に選択を合わせてから復元）
   ============================================================== */
function startEdit(id){
  const rec=getAll().find(e=>e.id===id);if(!rec)return;
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
function cancelEdit(){if(dirty&&!confirm(t('cCEdit')))return;exitEdit();clearForm()}
function exitEdit(){editId=null;editEv=null;document.getElementById('editBar').classList.remove('show');document.getElementById('btnSave').textContent=t('btnSave')}
function doReset(){if(!confirm(t('cReset')))return;clearForm();if(editId)exitEdit();toast(t('tReset'))}
function clearForm(keepDraft){
  document.getElementById('fDate').value=new Date().toISOString().split('T')[0];
  ['fEe','fOv'].forEach(id=>document.getElementById(id).value='');
  document.querySelectorAll('.sb.sel,.crit-lv.sel').forEach(b=>b.classList.remove('sel'));
  document.querySelectorAll('.ec.scored').forEach(c=>c.classList.remove('scored'));
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
  const btn=document.querySelector('.eebox .wsel-hd button');if(btn)btn.disabled=true;
  const r=await fetchRoster();
  if(btn)btn.disabled=false;
  renderRoster();
  if(r.ok){
    if(r.unknown.length)toast(t('eUnknownWork')+': '+r.unknown.slice(0,3).join('、'),1);
    else if(!silent)toast(t('tRoster')+' ('+r.list.length+')');
  }else if(!silent)toast(t('eRoster'),1);
}
const FARM_KEY='jitsugi_v2_farm';
/* 名簿の農場（シートの並び順・所属未確定/空欄は最後） */
function rosterFarms(ro){
  const fs=[];ro.forEach(p=>{if(!fs.includes(p.farm))fs.push(p.farm)});
  const last=f=>!f||/未確定/.test(f)?1:0;
  return fs.sort((a,b)=>last(a)-last(b));
}
function curFarm(ro){
  const fs=rosterFarms(ro);
  const cur=document.getElementById('fEe').value.trim();
  const hit=cur&&ro.find(p=>p.name===cur);
  let f='';try{f=localStorage.getItem(FARM_KEY)||''}catch{}
  if(hit&&hit.farm!==f)f=hit.farm;          // 選択中・編集中の人の農場を優先
  return fs.includes(f)?f:fs[0];
}
function selectFarm(f){
  try{localStorage.setItem(FARM_KEY,f)}catch{}
  const cur=document.getElementById('fEe').value.trim();
  const p=cur&&getRoster().list.find(p=>p.name===cur);
  if(p&&p.farm!==f&&!editId){                 // 別の農場へ切り替えたら選択中の人は外す
    if(dirty&&document.querySelector('#cards .ec.scored')&&!confirm(t('cSwitchEe')))return;
    const dt=document.getElementById('fDate').value;clearForm();if(dt)document.getElementById('fDate').value=dt;
    selWorks=[];saveSel();buildWorkSel();buildCards();
  }
  renderRoster();
}
function renderRoster(){
  const box=document.getElementById('eeTabs'),note=document.getElementById('eeNote'),fbox=document.getElementById('eeFarms');
  const ro=getRoster().list;
  const cur=document.getElementById('fEe').value.trim();
  const date=document.getElementById('fDate').value;
  const done=new Set(getAll().filter(r=>r.date===date).map(r=>r.evaluatee));
  const fs=rosterFarms(ro),farm=curFarm(ro);
  const showF=fs.length>1||(fs.length===1&&fs[0]);
  fbox.innerHTML=showF?fs.map(f=>{
    const ps=ro.filter(p=>p.farm===f),dn=ps.filter(p=>done.has(p.name)).length,on=f===farm;
    return `<button type="button" class="fchip${on?' on':''}" aria-pressed="${on}" onclick="selectFarm(this.dataset.f)" data-f="${esc(f)}">`+
      `${esc(f||t('farmNone'))}<span class="fchip-ct">${dn?dn+'/':''}${ps.length}</span></button>`;
  }).join(''):'';
  const idx=[];ro.forEach((p,i)=>{if(!showF||p.farm===farm)idx.push(i)});
  box.innerHTML=idx.map(i=>{
    const p=ro[i],on=p.name===cur;
    return `<button type="button" role="tab" class="eetab${on?' on':''}${done.has(p.name)?' done':''}" aria-selected="${on}" onclick="selectEe(${i})">`+
      `<span class="eetab-nm">${esc(p.name)}</span><span class="eetab-ct">${done.has(p.name)?'✓ ':''}${p.works.length?p.works.length+esc(t('worksUnit')):esc(t('worksNone'))}</span></button>`;
  }).join('');
  document.getElementById('eeManual').style.display=ro.length?'none':'';
  note.textContent=ro.length?t('eeTabHint'):(sheetUrl()?t('eeNoRoster'):t('noSheet'));
  const onTab=box.querySelector('.eetab.on');if(onTab&&onTab.scrollIntoView)onTab.scrollIntoView({block:'nearest',inline:'center'});
}
function selectEe(i){
  const p=getRoster().list[i];if(!p)return;
  if(editId){toast(t('editingBanner'),1);return}
  if(p.name===document.getElementById('fEe').value.trim())return;
  if(dirty&&document.querySelector('#cards .ec.scored')&&!confirm(t('cSwitchEe')))return;
  const dt=document.getElementById('fDate').value;
  clearForm();
  if(dt)document.getElementById('fDate').value=dt;
  document.getElementById('fEe').value=p.name;
  try{localStorage.setItem(FARM_KEY,p.farm)}catch{}
  selWorks=p.works.slice();saveSel();buildWorkSel();buildCards();
  document.getElementById('wselBox').open=!selWorks.length;
  renderRoster();onCh();
  const c=document.getElementById('cards');if(c&&selWorks.length)c.scrollIntoView({behavior:'smooth',block:'start'});
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
function refreshSel(){
  const ns=[...new Set(getAll().map(e=>e.evaluatee))].sort();
  const hf=document.getElementById('hFil'),hv=hf.value;
  hf.innerHTML=`<option value="">${t('filterAll')}</option>`+ns.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');hf.value=hv;
  const cs=document.getElementById('chSel'),cv=cs.value;
  cs.innerHTML=`<option value="">${t('selPh')}</option>`+ns.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');cs.value=cv;
}

let dirty=false,editId=null,editEv=null,autoT=null;
