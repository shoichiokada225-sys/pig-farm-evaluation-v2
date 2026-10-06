/* ui.js — 描画層：作業選択/採点カード/履歴/詳細/グラフ/CSV */
/* ==============================================================
   作業の複数選択パネル（カテゴリ別アコーディオン＋チェックボックス）
   ============================================================== */
function buildWorkSel(){
  const box=document.getElementById('wselCats');
  const dn=typeof curDoneWorks==='function'?curDoneWorks():[];   // 選択中の人が今日すでに済ませた作業に「済」
  box.innerHTML=WORKDATA_V2.categories.map(c=>{
    const ws=worksInCat(c.id);if(!ws.length)return'';
    const selCnt=ws.filter(w=>selWorks.includes(w.id)).length;
    return `<details class="wcat" ${selCnt?'open':''}>
      <summary><span class="wcat-nm">${esc(catLabel(c.id))}</span><span class="wcat-ct${selCnt?' has':''}">${selCnt}/${ws.length}</span></summary>
      <div class="wcat-ls">${ws.map(w=>`
        <label class="wchk${selWorks.includes(w.id)?' on':''}">
          <input type="checkbox" value="${esc(w.id)}" ${selWorks.includes(w.id)?'checked':''} onchange="toggleWork(this.value,this.checked)">
          <span class="wchk-no">${esc((w.no||'').replace('No.',''))}</span>
          <span class="wchk-nm">${esc(loc(w,'name'))}</span>${dn.includes(w.id)?`<span class="wchk-dn">✓ ${esc(t('doneMark'))}</span>`:''}
        </label>`).join('')}</div>
    </details>`;
  }).join('');
  updSelCnt();
}
function updSelCnt(){
  const el=document.getElementById('wselCnt');
  el.textContent=selWorks.length?`${selWorks.length} ${t('selCnt')}`:'';
}

/* ==============================================================
   採点カード生成（選択中の全作業×各5種目）
   ============================================================== */
/* 作業の目次（作業ごとの x/5・タップでその作業へ）＋今日すでに済んだ作業は「済」で外して見せる。出さない時は '' */
/* 選択中の作業のうち、同じ試験期間にすでに済んでいる作業（やり直し・作業選択で足した時）の「✓済（前回の点）」。済でなければ '' */
function prevDoneTx(wid){
  const pv=typeof prevWork==='function'?prevWork(wid):null;if(!pv)return'';
  return '✓ '+t('doneMark')+paren(t('prevLbl')+' '+mdOf(pv.date)+(pv.avg!=null?' · '+(Math.round(pv.avg*10)/10).toFixed(1):''));
}
/* 目次用の短い名前: 説明のかっこ（「給餌（毎日の…）」「Cho ăn (…)」）を除く */
function shortName(n){const s=String(n||'').replace(/\s*[（(][^（()）]*[）)]\s*$/,'').trim();return s||String(n||'')}   // 末尾のかっこだけ（「CSF（豚熱）子ワクチン接種」は削らない）
function wnavHtml(){
  const all=typeof curDoneWorks==='function'?curDoneWorks():[];
  const dn=all.filter(id=>!selWorks.includes(id)&&workById(id));
  if(!(selWorks.length>1||dn.length))return'';
  return `<nav class="wnav" id="wnav" aria-label="${esc(t('wnavLbl'))}">`+
    selWorks.filter(workById).map(wid=>{const w=workById(wid),pv=all.includes(wid)?prevDoneTx(wid):'';return `<button type="button" class="wnav-c${pv?' redo':''}" data-w="${esc(wid)}" title="${esc(loc(w,'name'))}" aria-label="${esc(loc(w,'name'))}" onclick="jumpWork(this.dataset.w);const n=this.querySelector('.wnav-nm');if(n&&n.scrollWidth>n.clientWidth+1)toast(this.title)"><span class="wnav-nm">${esc(shortName(loc(w,'name')))}</span><span class="wnav-ct" data-wct="${esc(wid)}">0/${workItems(wid).length}</span>${pv?`<span class="wnav-prev">${esc(pv)}</span>`:''}</button>`}).join('')+
    dn.map(wid=>`<button type="button" class="wnav-c done" data-w="${esc(wid)}" title="${esc(loc(workById(wid),'name'))}" onclick="openDoneWork(this.dataset.w)"><span class="wnav-nm">${esc(shortName(loc(workById(wid),'name')))}</span><span class="wnav-ct">✓ ${esc(t('doneMark'))}</span></button>`).join('')+
    `</nav>`;
}
/* 1作業ぶんの区切り（見出し＋5種目のカード）。ci=通し番号（最初の構築のフェードの遅れ）。作業が無ければ '' */
function wsecHtml(wid,ci){
  const w=workById(wid);if(!w)return'';
  ci=ci||{n:0};
  // 作業ごとに区切る（見出しは自分の作業のカードの間だけ貼り付き、次の作業に来たら入れ替わる）
  let h=`<section class="wsec" data-w="${esc(w.id)}"><div class="wshd" id="wh-${esc(w.id)}" data-w="${esc(w.id)}" data-full="${esc(loc(w,'name'))}" role="button" tabindex="0" aria-describedby="wct-${esc(w.id)}" onclick="toast(this.dataset.full)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toast(this.dataset.full)}">
      <span class="wshd-no">${esc(w.no||'')}</span>
      <span class="wshd-nm" title="${esc(loc(w,'name'))}">${esc(shortName(loc(w,'name')))}</span>
      <span class="wshd-ct" id="wct-${esc(w.id)}" data-wct="${esc(w.id)}">0/${workItems(wid).length}</span>
    </div>
    ${(()=>{const pv=typeof curDoneWorks==='function'&&curDoneWorks().includes(wid)?prevDoneTx(wid):'';const sk=editId?'':`<button type="button" class="wshd-skip" data-w="${esc(w.id)}" aria-label="${esc(t('skipWork')+': '+loc(w,'name'))}" onclick="skipWork(this.dataset.w)">${esc(t('skipWork'))}</button>`;return pv||sk?`<div class="wsub">${pv?`<span class="wsub-prev">${esc(pv)}</span>`:''}${sk}</div>`:''})()}`;
  workItems(wid).forEach((it,ii)=>{
    h+=`<div class="cd ec" id="c-${it.id}" data-w="${esc(wid)}" style="animation-delay:${Math.min(ci.n++,8)*0.03}s">
        <div class="en">${ii+1}</div>
        <div class="enm" id="enm-${it.id}">${esc(it.name)}</div>
        <span class="miss-bd" id="miss-${it.id}">⚠ ${esc(t('missLbl'))}</span>
        <div class="sr" role="group" tabindex="-1" aria-labelledby="enm-${it.id}">${[1,2,3,4,5].map(s=>`<button class="sb" data-id="${it.id}" data-s="${s}" onclick="pick('${it.id}',${s})" aria-pressed="false">${s}<span class="sl">${t('s'+s)}</span></button>`).join('')}</div>
        <div class="ec-tools">
          <button class="crit-tg" id="critb-${it.id}" onclick="toggleCrit('${it.id}')" aria-expanded="false" aria-controls="crit-${it.id}">▼ ${t('showCrit')}</button>
          <button type="button" class="cm-add" onclick="openCm('${it.id}')" aria-label="${esc(t('addCmt')+': '+it.name)}">${esc(t('addCmt'))}</button>
        </div>
        <div class="crit" id="crit-${it.id}">
          <div class="crit-k"><b>${t('kantenLbl')}</b>${esc(it.kanten)}</div>
          ${it.levels.map((lv,li)=>`<div class="crit-lv" data-id="${it.id}" data-s="${li+1}" role="button" tabindex="0" onclick="pick('${it.id}',${li+1})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();pick('${it.id}',${li+1})}"><span class="crit-n sb${li+1}">${li+1}</span><div class="crit-t"><b>${t('s'+(li+1))}</b>${esc(lv)}</div></div>`).join('')}
        </div>
        <div class="clbl" id="clbl-${it.id}">${t('cmtLbl')}</div>
        <textarea data-cid="${it.id}" maxlength="2000" placeholder="${t('phCmt')}" aria-labelledby="clbl-${it.id} enm-${it.id}" oninput="onCh()"></textarea>
      </div>`;
  });
  return h+'</section>';
}
/* 採点カードを全部作り直す（人を選んだ時・言語切替・編集の開始など）。
   anim=true の時だけカードをフェードで出す（人を選んだ最初の構築。作業の追加/外し・言語切替ではちらつかせない） */
let _animT=null;
/* 採点カードが空の時の案内。名簿があって人が未選択なら「名前をタップ」（作業は自動で入る）。名簿が無い・名簿にない人・作業未設定の人は「作業を選ぶ」 */
function pickworkTx(){
  const ro=typeof getRoster==='function'?getRoster().list:[];
  const pickEe=ro.length&&!curEe.name&&!curEe.manual&&!editId;
  return pickEe?`<strong>${esc(t('pickEeTitle'))}</strong><br>${esc(t('pickEeHint'))}`:`<strong>${esc(t('selWorksTitle'))}</strong><br>${esc(t('selWorksHint'))}`;
}
function buildCards(anim){
  saveSt();
  const el=document.getElementById('cards');
  if(!selWorks.length){
    el.innerHTML=`<div class="pickwork"><svg class="pw-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4a3 3 0 0 1 6 0h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm3-1a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM8 10h8v2H8zm0 4h5v2H8z"/></svg><span class="pw-tx">${pickworkTx()}</span></div>`;
    updProg();return;
  }
  const ci={n:0};
  const h=wnavHtml()+selWorks.map(wid=>wsecHtml(wid,ci)).join('');
  const miss=[...el.querySelectorAll('.ec.miss')].map(c=>c.id);   // 言語切替・作業の追加/外しで作り直しても未採点の印は残す
  clearTimeout(_animT);el.classList.toggle('anim',!!anim);
  el.innerHTML=h;
  if(anim)_animT=setTimeout(()=>el.classList.remove('anim'),900);   // フェードは最初の1回だけ（後で作り足すカードには付けない）
  miss.forEach(id=>{const c=document.getElementById(id);if(c)setMiss(c,true)});
  fitSl();
  updProg();
}
/* 目次だけを今の selWorks に合わせて差し替える（作業の追加/外しで、ほかのカードに触らない） */
function syncWnav(){
  const el=document.getElementById('cards'),old=document.getElementById('wnav'),h=wnavHtml();
  if(old){if(h)old.outerHTML=h;else old.remove()}
  else if(h)el.insertAdjacentHTML('afterbegin',h);
}
/* 作業を1つだけ外す／足す（ほかの作業のカード・点数・開いた評価基準・入力中のコメントはそのまま） */
function removeWorkSec(wid){
  const el=document.getElementById('cards');
  if(!selWorks.length||!el.querySelector('.wsec')){buildCards();return}
  const sec=el.querySelector('.wsec[data-w="'+CSS.escape(wid)+'"]');if(sec)sec.remove();
  syncWnav();updProg();
}
function addWorkSec(wid){
  const el=document.getElementById('cards');
  if(!el.querySelector('.wsec')){buildCards();return}   // 「作業を選んでください」の案内から最初の1作業＝全部作る
  if(el.querySelector('.wsec[data-w="'+CSS.escape(wid)+'"]')){syncWnav();updProg();return}
  const h=wsecHtml(wid);if(!h)return;
  // selWorks の並びどおりの位置へ（後ろの作業のうち、画面にある最初の区切りの前）
  const i=selWorks.indexOf(wid);
  const next=selWorks.slice(i+1).map(x=>el.querySelector('.wsec[data-w="'+CSS.escape(x)+'"]')).find(Boolean);
  if(next)next.insertAdjacentHTML('beforebegin',h);
  else el.insertAdjacentHTML('beforeend',h);
  syncWnav();updProg();
}
/* 段階名が語の途中で折れる幅（320px など）だけ、文字を少しずつ小さくして収める（12px 以上で収まる画面では何もしない） */
function fitSl(){
  const cards=document.getElementById('cards'),c=cards&&cards.querySelector('.ec');if(!c)return;
  cards.style.removeProperty('--slfs');
  const sls=[...c.querySelectorAll('.sl')];if(!sls.length)return;
  const broken=()=>sls.some(s=>{const r=document.createRange();r.selectNodeContents(s);const ln=new Set([...r.getClientRects()].map(x=>Math.round(x.top))).size;
    return s.scrollWidth>s.clientWidth+1||ln>Math.min(2,s.textContent.trim().split(/\s+/).length)});
  if(!broken())return;
  for(let fs=parseFloat(getComputedStyle(sls[0]).fontSize)-.5;fs>=8.5;fs-=.5){cards.style.setProperty('--slfs',fs+'px');if(!broken())return}
}
function setScoreUI(id,s){
  document.querySelectorAll('.sb[data-id="'+id+'"]').forEach(b=>{const on=+b.dataset.s===s;b.classList.toggle('sel',on);b.setAttribute('aria-pressed',on)});
  document.querySelectorAll('.crit-lv[data-id="'+id+'"]').forEach(r=>r.classList.toggle('sel',+r.dataset.s===s));
  const c=document.getElementById('c-'+id);if(c){c.classList.add('scored');setMiss(c,false)}   // 点を付けたら「未採点」の印を外す
}
/* 未採点の印（太い赤枠・⚠）と、読み上げの説明（印がある時だけ「未採点」と読む） */
function setMiss(c,on){
  c.classList.toggle('miss',on);const sr=c.querySelector('.sr');if(!sr)return;
  if(on)sr.setAttribute('aria-describedby','miss-'+c.id.slice(2));else sr.removeAttribute('aria-describedby');
}
function pick(id,s){
  const c=document.getElementById('c-'+id),first=!!c&&!c.classList.contains('scored');
  setScoreUI(id,s);onCh();updProg();if(navigator.vibrate)try{navigator.vibrate(8)}catch(e){}
  // 初めて点を付けた時は、同じ作業の次の未採点の種目へ送る（片手で何度もスワイプしない）。付け直しでは動かさない
  if(first&&c&&!c.querySelector('.crit.open')){
    const nx=[...document.querySelectorAll('#cards .ec[data-w="'+c.dataset.w+'"]')].find(x=>x!==c&&!x.classList.contains('scored')&&x.compareDocumentPosition(c)&Node.DOCUMENT_POSITION_PRECEDING);
    if(nx)setTimeout(()=>{if(!document.body.contains(nx)||!document.body.contains(c))return;   // 言語切替などで作り直された後は動かさない
      const sr=nx.querySelector('.sr');if(sr&&typeof scrollBelowStk==='function'){const r=nx.getBoundingClientRect();if(r.top>innerHeight*0.55||r.top<(typeof stkH==='function'?stkH():0))scrollBelowStk(nx,8,true)}},180);
  }
}
/* コメント欄は「＋ コメント」で開く（書いてあれば開いたまま） */
function openCm(id){const c=document.getElementById('c-'+id);if(!c)return;c.classList.add('cm-open');const ta=c.querySelector('textarea');if(ta)ta.focus()}
function updProg(){
  const f=document.getElementById('progF'),tx=document.getElementById('progT');
  if(!f||!tx)return;
  const total=getItems().length;
  const done=document.querySelectorAll('#cards .ec.scored').length;
  // 採点する作業が無い間は出さない（「採点済み 0/0」と空のバーを出さない）
  const pr=document.getElementById('prog');if(pr)pr.hidden=!total;
  // 誰を採点しているか（採点中ずっと見える貼り付く帯に）。編集中は印も
  const pw=document.getElementById('progWho');
  if(pw){const nm=typeof curEe!=='undefined'?curEe.name:'';pw.title=nm;pw.textContent=nm?(typeof editId!=='undefined'&&editId?'✎ ':'')+nm:'';pw.hidden=!nm;pw.classList.toggle('edit',typeof editId!=='undefined'&&!!editId)}
  document.querySelectorAll('#cards textarea').forEach(ta=>{if(ta.value.trim())ta.closest('.ec').classList.add('cm-open')});
  f.style.width=(total?Math.round(done/total*100):0)+'%';
  f.classList.toggle('done',total>0&&done===total);
  tx.textContent=t('progDone')+' '+done+'/'+total;
  // 作業ごとの x/5（見出し・目次）
  selWorks.forEach(wid=>{
    const n=workItems(wid).length,d=document.querySelectorAll('#cards .ec.scored[data-w="'+wid+'"]').length;
    document.querySelectorAll('#cards [data-wct="'+wid+'"]').forEach(el=>{el.textContent=(d===n?'✓ ':'')+d+'/'+n;el.classList.toggle('full',d===n)});
  });
  // 保存時に見つかった未採点（.miss）の件数を貼り付く進捗の横に残す（印は点を付けるまで消えない）
  const mb=document.getElementById('missNext');
  if(mb){const nm=document.querySelectorAll('#cards .ec.miss').length,was=!mb.hidden;
    mb.hidden=!nm;mb.textContent=nm?t('missNext').replace('{n}',nm):'';
    const pr=mb.closest('.prog');if(pr)pr.classList.toggle('has-miss',!!nm);   // 未採点がある間は「採点済 x/y」の代わりにこのボタン（件数の表示は1つ）
    if(was!==!mb.hidden&&typeof fixProg==='function')fixProg()}
  // 帯の高さが変わった（出した・隠した・名前が入った）時は、貼り付く見出しの位置（--stk）を測り直す
  if(pr&&typeof fixProg==='function'&&pr.offsetHeight!==updProg._h){updProg._h=pr.offsetHeight;fixProg()}
  const bar=document.getElementById('progB');
  if(bar){bar.setAttribute('aria-valuemax',total);bar.setAttribute('aria-valuenow',done);bar.setAttribute('aria-label',t('progDone'))}
}
function toggleCrit(id){
  const el=document.getElementById('crit-'+id),btn=document.getElementById('critb-'+id);
  if(!el||!btn)return;
  const open=el.classList.toggle('open');
  btn.textContent=(open?'▲ ':'▼ ')+t(open?'hideCrit':'showCrit');
  btn.setAttribute('aria-expanded',open);
}

/* ==============================================================
   平均（数値以外を型で弾く）
   ============================================================== */
function avgVals(sc){const v=Object.values(sc||{}).filter(x=>x!=null).map(Number).filter(x=>Number.isFinite(x));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}
function fm(a){return a==null?'-':a.toFixed(1)}
function workAvg(we){return avgVals(we.scores)}
function sessionAvg(rec){
  const all={};let i=0;
  (rec.works||[]).forEach(we=>Object.entries(we.scores||{}).forEach(([k,v])=>{all[i+++'_'+k]=v}));
  return avgVals(all);
}
/* 履歴レコードの作業名を現在言語で（保存時はja。カタログに現存すれば訳語） */
function dispWorkName(we){const w=we.workId&&workById(we.workId);return w?loc(w,'name'):(we.workName||'')}

/* ==============================================================
   履歴・グラフの被評価者 = person.js の personKeyer（名簿の進み具合と同じ規則）
   名簿に同じ名前が1人なら今の名前で1人（所属が決まった・名前を直した後も分かれない）、2人以上なら農場で分ける。名簿外は農場＋名前
   表示は同じ名前が2人以上いる時だけ「名前（農場）」
   ============================================================== */
function eePeople(all,ro){
  const keyOf=personKeyer(all,ro),m=new Map();
  all.forEach(r=>{const k=keyOf(r);if(!m.has(k.key))m.set(k.key,{key:k.key,farm:k.farm,name:k.name})});
  const ps=[...m.values()];
  const cnt={};ps.forEach(p=>{cnt[p.name]=(cnt[p.name]||0)+1});
  ps.forEach(p=>{p.label=cnt[p.name]>1?p.name+paren(farmDisp(p.farm)):p.name});
  return ps.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:a.farm<b.farm?-1:a.farm>b.farm?1:0);
}
/* 選択キーに一致する記録（キーは全記録から計算＝履歴・グラフで同じ人を指す） */
function recsOfKey(k){const all=getAll();if(!k)return all;const keyOf=personKeyer(all);return all.filter(r=>keyOf(r).key===k)}

/* ==============================================================
   履歴
   ============================================================== */
function drawHist(){
  const f=document.getElementById('hFil').value;let all=recsOfKey(f);
  all.sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||'').localeCompare(a.createdAt||''));
  const c=document.getElementById('hList');
  if(!all.length){c.innerHTML=`<div class="nd">${t('noData')}</div>`;return}
  const ro=getRoster().list,lbl={};eePeople(getAll(),ro).forEach(p=>{lbl[p.key]=p.label});const keyOf=personKeyer(getAll(),ro);
  const redone=new Set();getAll().forEach(r=>String(r.redoOf||'').split(' ').filter(Boolean).forEach(id=>redone.add(id)));   // やり直しで置き換わった前回（集計に入らない）
  c.innerHTML=all.map(r=>{
    const a0=sessionAvg(r),a=a0==null?null:Math.round(a0*10)/10;   // 色は表示の値（小数1桁）で決める（「4.0」なのに3点台の色にしない）
    const ac=a==null?'':(a>=4?' av4':(a<2?' av1':(a<3?' av2':' av3')));
    const wnames=(r.works||[]).map(dispWorkName);
    const wlbl=wnames.slice(0,2).join(dotSep())+(wnames.length>2?` +${wnames.length-2}`:'');
    return `<div class="hi" role="button" tabindex="0" onclick="showDet('${sanitizeId(r.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showDet('${sanitizeId(r.id)}')}"><div class="hii"><div class="hid">${esc(r.date)}　${t('evLbl')}: ${esc(r.evaluator)}${sheetUrl()?(r.sheetGone?` <span class="snt ng">${esc(t('goneLbl'))}</span>`:r.sent?` <span class="snt ok">✓${esc(t('sentLbl'))}</span>`:` <span class="snt ng">${esc(t('unsent'))}</span>`):''}</div><div class="hin">${esc(lbl[keyOf(r).key]||r.evaluatee)}${r.manual?` <span class="snt off">${esc(t('offRoster'))}</span>`:''}${redone.has(r.id)?` <span class="snt off">${esc(t('redoneLbl'))}</span>`:''}　<span class="hiw">${esc(wlbl)}</span></div></div><div class="hia${ac}">${fm(a)}</div></div>`;
  }).join('');
}

/* ==============================================================
   詳細モーダル（作業ごとにグループ表示）
   ============================================================== */
let _moRet=null;
function showDet(id){
  const r=getAll().find(e=>e.id===id);if(!r)return;
  let h=`<div class="mh"><h3 id="moTitle">${esc(r.evaluatee)} - ${esc(r.date)}</h3><button class="mx" onclick="closeMo()" aria-label="${t('btnClose')}">&times;</button></div>`;
  h+=`<div style="font-size:.85rem;color:var(--sub);margin-bottom:12px">${t('evLbl')}: ${esc(r.evaluator)}　／　${t('avgLbl')}: ${fm(sessionAvg(r))}</div>`;
  (r.works||[]).forEach(we=>{
    const w=workById(we.workId);
    h+=`<div class="dwh"><span class="dwh-nm">${esc(dispWorkName(we))}</span><span class="dwh-av">${t('avgLbl')} ${fm(workAvg(we))}</span></div>`;
    const aspects=w?w.aspects:[];
    const keys=aspects.length?aspects.map(a=>a.id):Object.keys(we.scores||{});
    keys.forEach(aid=>{
      const a=aspects.find(x=>x.id===aid);
      const nm=a?loc(a,'name'):aid;
      const n=Number((we.scores||{})[aid]),sc=Number.isInteger(n)&&n>=1&&n<=5?n:0,cm=(we.comments||{})[aid];
      h+=`<div class="di"><div class="dih"><span class="din">${esc(nm)}</span>${sc?`<span class="dis sb${sc}">${sc}</span>`:''}</div>${cm?`<div class="dic">${esc(cm)}</div>`:''}</div>`;
    });
  });
  if(r.overall)h+=`<div class="dov"><strong>${t('ovLbl')}:</strong><br>${esc(r.overall)}</div>`;
  h+=`<div class="ma"><button class="b bt-danger" onclick="doDel('${sanitizeId(r.id)}')">${t('btnDel')}</button><button class="b b3" style="flex:1" onclick="startEdit('${sanitizeId(r.id)}')">${t('btnEdit')}</button><button class="b b1" style="flex:1.3" onclick="closeMo()">${t('btnClose')}</button></div>`;
  _moRet=document.activeElement;
  document.getElementById('moBody').innerHTML=h;
  document.getElementById('modal').classList.add('show');
  document.body.classList.add('mo-open');setBgInert(true);
  const mx=document.querySelector('#moBody .mx');if(mx)mx.focus();
}
/* モーダルの間は背景（ヘッダー・各ページ・タブ）を操作・読み上げの外にする */
function setBgInert(on){document.querySelectorAll('.hdr,.pg,.tabs,.ebar,.updbar').forEach(el=>{if(on)el.setAttribute('inert','');else el.removeAttribute('inert')})}
function closeMo(){
  document.getElementById('modal').classList.remove('show');document.body.classList.remove('mo-open');setBgInert(false);
  if(_moRet&&document.body.contains(_moRet)){_moRet.focus()}_moRet=null;
}
/* 削除: シートに行があるかもしれない記録は「削除待ち」に入れ、シートの行も消す（圏外なら、つながった時に消す） */
function doDel(id){
  const r=getAll().find(e=>e.id===id);if(!r)return;
  // 送信先がある時は、未送信に見える記録もシートの行を消しに行く（応答が届かなかっただけで行が書かれていることがある。行が無ければ GAS は0行で ok）
  const onSheet=mayBeOnSheet(r)||syncing||!!sheetUrl();
  if(!confirm(onSheet?t('cDelSheet').replace('{n}',r.evaluatee||'').replace('{d}',mdOf(r.date)):t('cDel')))return;   // 記録ID（UUID）は見せない
  if(onSheet){try{queueDel(r)}catch(e){toast(t('eStoreFull'),1);return}}   // 削除待ちを書けない（容量）＝消さない（シートの行だけ残る事故を防ぐ）
  if(typeof dropSheetDone==='function')dropSheetDone(id);
  if(!putAll(getAll().filter(e=>e.id!==id))){toast(t('eStoreFull'),1);return}
  closeMo();drawHist();refreshSel();updSyncUI();renderRoster();
  toast(onSheet?t('tDelQueued'):t('tDel'));
  if(onSheet)syncPending();
}

/* ==============================================================
   CSV（縦持ち: 1行=1種目）
   ============================================================== */
/* CSVは事務所で集計するデータ形式なので日本語に固定（見出し・作業・種目と同じく、カテゴリも正本の日本語名。
   画面の言語で変わる catLabel は使わない＝シートへの送信 toPayload と同じ値） */
function catName(catId){const c=WORKDATA_V2.categories.find(c=>c.id===catId);return c?c.name:catId}
function doCSV(){
  const all=getAll();if(!all.length){toast(t('eCSV'),1);return}
  // 記録ID・やり直し元はシートの評価者タブと同じ意味（やり直し元に書かれた記録IDの行は、やり直しで置き換わった前回＝集計では除く）
  const hd=['評価日','評価者','被評価者','農場','名簿外','カテゴリ','作業','種目','スコア','コメント','作業平均','セッション平均','全体所感','作成日時','記録ID','やり直し元'];
  let csv='﻿'+hd.map(csvCell).join(',')+'\n';
  all.forEach(r=>{
    const sav=fm(sessionAvg(r));
    (r.works||[]).forEach(we=>{
      const w=workById(we.workId);
      const wav=fm(workAvg(we));
      const aspects=w?w.aspects:[];
      const keys=aspects.length?aspects.map(a=>a.id):Object.keys(we.scores||{});
      keys.forEach(aid=>{
        const a=aspects.find(x=>x.id===aid);
        const row=[r.date,r.evaluator,r.evaluatee,r.farm||'',r.manual?'名簿外':'',catName(we.category||(w&&w.category)||''),we.workName||(w&&w.name)||'',a?a.name:aid,(we.scores||{})[aid]||'',(we.comments||{})[aid]||'',wav,sav,r.overall||'',r.createdAt||'',r.id||'',r.redoOf||''];
        csv+=row.map(csvCell).join(',')+'\n';
      });
    });
  });
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  a.download='jitsugi_v2_'+todayLocal().replace(/-/g,'')+'.csv';a.click();toast(t('tCSV'));
}

/* ==============================================================
   グラフ（人→作業の2段選択。作業未指定=総合）
   ============================================================== */
let cL=null,cR=null;
function onChPerson(){populateChWork();drawCharts()}
function populateChWork(){
  const who=document.getElementById('chSel').value;
  const sel=document.getElementById('chWork');
  const wids=[...new Set((who?recsOfKey(who):[]).flatMap(r=>(r.works||[]).map(we=>we.workId)))];
  sel.innerHTML=`<option value="">${t('chAllWorks')}</option>`+
    wids.map(id=>{const w=workById(id);return `<option value="${esc(id)}">${esc(w?loc(w,'name'):id)}</option>`}).join('');
}
function drawCharts(){
  const who=document.getElementById('chSel').value,wid=document.getElementById('chWork').value,
    area=document.getElementById('chArea'),none=document.getElementById('chNone');
  if(!who){area.style.display='none';none.style.display='block';none.textContent=t('selEe');return}
  let all=recsOfKey(who);
  if(wid)all=all.filter(r=>(r.works||[]).some(we=>we.workId===wid));
  if(!all.length){area.style.display='none';none.style.display='block';none.textContent=t('chNone');return}
  area.style.display='block';none.style.display='none';
  all.sort((a,b)=>a.date.localeCompare(b.date)||(a.createdAt||'').localeCompare(b.createdAt||''));
  // 軸ラベルは2行まで折り返す（360幅でも端で切れない・観点の区別がつく）。ja は7字×2行、ほかは語の区切りで約12字×2行
  const trunc=n=>{
    const ja=lang==='ja',W=ja?7:12;n=String(n||'');
    if(n.length<=W)return n;
    let l1,rest;
    if(ja){l1=n.slice(0,W);rest=n.slice(W)}
    else{const ws=n.split(' ');l1='';while(ws.length&&(l1+' '+ws[0]).trim().length<=W)l1=(l1+' '+ws.shift()).trim();if(!l1)l1=ws.shift();rest=ws.join(' ')}
    return [l1,rest.length>W?rest.slice(0,W-1)+'…':rest];
  };
  const lineOpt=legend=>({responsive:true,maintainAspectRatio:false,spanGaps:true,scales:{y:{min:1,max:5,ticks:{stepSize:1,color:'#54635d'},grid:{color:'#e3eae7'}},x:{ticks:{color:'#54635d'},grid:{color:'#eef2f0'}}},plugins:{legend:{display:legend,position:'bottom'}}});
  if(cL){cL.destroy();cL=null}
  if(cR){cR.destroy();cR=null}
  let labels,cur,prv,curLbl,prvLbl;
  if(wid){
    // 作業指定: その作業の平均の推移＋5種目のレーダー（直近と前回）
    const avgOf=r=>{const we=(r.works||[]).find(x=>x.workId===wid);return we?workAvg(we):null};
    cL=new Chart(document.getElementById('cvL'),{type:'line',data:{labels:all.map(e=>e.date),datasets:[{label:t('chAvg'),data:all.map(avgOf),borderColor:'#177863',backgroundColor:'rgba(23,120,99,.10)',fill:true,tension:.3,pointRadius:5,pointHoverRadius:7,pointBackgroundColor:'#177863'}]},options:lineOpt(false)});
    const lat=all[all.length-1],prev=all.length>1?all[all.length-2]:null;
    const w=workById(wid);
    const aspects=w?w.aspects:[];
    labels=aspects.map(a=>trunc(loc(a,'name')));
    const pickSc=r=>{const we=(r.works||[]).find(x=>x.workId===wid);return aspects.map(a=>we&&we.scores[a.id]||0)};
    cur=pickSc(lat);prv=prev?pickSc(prev):null;curLbl=lat.date;prvLbl=prev?prev.date+paren(t('prevLbl')):'';
  }else{
    /* 総合: 記録単位でなく人単位でまとめる（分割保存・人ごとの作業割り当てでは記録ごとに作業が違うため）
       ・線グラフ = 作業ごとの系列（x軸は日付。同じ日に同じ作業が2回あれば後の記録）。別の作業どうしを1本の線でつながない
       ・レーダー = その人の記録にある全作業。値は各作業の直近の作業平均と、その1つ前（無ければ null＝描かない。0点にしない） */
    const seq=new Map();   // workId → [{date, avg, we}]（日付順）
    all.forEach(r=>(r.works||[]).forEach(we=>{const v=workAvg(we);if(v==null)return;const a=seq.get(we.workId)||[];a.push({date:r.date,avg:v,we});seq.set(we.workId,a)}));
    if(!seq.size){area.style.display='none';none.style.display='block';none.textContent=t('chNone');return}
    const dates=[...new Set(all.map(r=>r.date))];
    const pal=['#177863','#c0622b','#3b6fb6','#8e44ad','#b8860b','#c0392b','#16a085','#5d6d7e'];
    const ids=[...seq.keys()],nm=id=>dispWorkName(seq.get(id)[0].we);
    cL=new Chart(document.getElementById('cvL'),{type:'line',data:{labels:dates,datasets:ids.map((id,i)=>{const c=pal[i%pal.length],by=new Map();seq.get(id).forEach(e=>by.set(e.date,e.avg));
      return{label:nm(id),workId:id,data:dates.map(d=>by.has(d)?by.get(d):null),borderColor:c,backgroundColor:c,fill:false,tension:.3,pointRadius:5,pointHoverRadius:7,pointBackgroundColor:c}})},options:lineOpt(true)});
    labels=ids.map(id=>trunc(nm(id)));
    cur=ids.map(id=>{const a=seq.get(id);return a[a.length-1].avg});
    prv=ids.map(id=>{const a=seq.get(id);return a.length>1?a[a.length-2].avg:null});
    if(prv.every(v=>v==null))prv=null;
    curLbl=t('chLatest');prvLbl=t('prevLbl');
  }
  const ds=[
    {label:curLbl,data:cur,borderColor:'#177863',backgroundColor:'rgba(23,120,99,.18)',pointBackgroundColor:'#177863'},
    ...(prv?[{label:prvLbl,data:prv,borderColor:'#9e9e9e',backgroundColor:'rgba(158,158,158,.08)',pointBackgroundColor:'#9e9e9e',borderDash:[5,4],borderWidth:1.5}]:[])
  ];
  const rh=document.querySelector('[data-t="chRadar"]');if(rh)rh.textContent=t(labels.length<=2?'chBar':'chRadar');   // 棒グラフの時はレーダーと書かない
  if(labels.length<=2){
    // 軸が2本以下ではレーダーが面にならない → 棒グラフ
    ds.forEach(d=>{d.backgroundColor=d.borderColor;d.borderDash=undefined});
    cR=new Chart(document.getElementById('cvR'),{type:'bar',data:{labels,datasets:ds},options:{responsive:true,maintainAspectRatio:false,scales:{y:{min:0,max:5,ticks:{stepSize:1,color:'#54635d'},grid:{color:'#e3eae7'}},x:{ticks:{color:'#14211c'},grid:{display:false}}},plugins:{legend:{display:ds.length>1,position:'bottom'}}}});
  }else{
    cR=new Chart(document.getElementById('cvR'),{type:'radar',data:{labels,datasets:ds},options:{responsive:true,maintainAspectRatio:false,spanGaps:false,scales:{r:{min:0,max:5,ticks:{stepSize:1,font:{size:10},color:'#54635d',backdropColor:'rgba(255,255,255,.75)'},grid:{color:'#e3eae7'},angleLines:{color:'#e3eae7'},pointLabels:{font:{size:innerWidth<400?10:11},color:'#14211c',padding:4}}},layout:{padding:{left:6,right:6}},plugins:{legend:{display:ds.length>1,position:'bottom'}}}});
  }
}

/* 採点フォームの状態退避/復元（言語切替・再描画時） */
/* 点数・コメントに加えて、開いていた評価基準と入力中のコメント欄も覚えて戻す（作り直しで閉じない・キーボードが閉じない） */
let _fs=null,_fsUi=null;
function saveSt(){
  _fs=collectForm();
  const ae=document.activeElement;
  _fsUi={open:[...document.querySelectorAll('#cards .crit.open')].map(c=>c.id),cm:[...document.querySelectorAll('#cards .ec.cm-open')].map(c=>c.id),
    focus:ae&&ae.matches&&ae.matches('#cards textarea[data-cid]')?ae.dataset.cid:'',
    sel:ae&&ae.matches&&ae.matches('#cards textarea[data-cid]')?[ae.selectionStart,ae.selectionEnd]:null};
}
function restoreSt(){if(!_fs)return;const d=_fs;getItems().forEach(it=>{
  const we=d.works.find(x=>x.workId===it.workId);
  const sc=we&&we.scores[it.aspectId];if(sc)setScoreUI(it.id,sc);
  const cm=we&&we.comments[it.aspectId];if(cm){const ta=document.querySelector('textarea[data-cid="'+it.id+'"]');if(ta)ta.value=cm}
});
  const u=_fsUi;
  if(u){
    u.open.forEach(id=>{const c=document.getElementById(id);if(c&&!c.classList.contains('open'))toggleCrit(id.slice(5))});
    (u.cm||[]).forEach(id=>{const c=document.getElementById(id);if(c)c.classList.add('cm-open')});
    if(u.focus){const c=document.getElementById('c-'+u.focus);if(c)c.classList.add('cm-open')}
    const ta=u.focus&&document.querySelector('#cards textarea[data-cid="'+u.focus+'"]');
    if(ta&&document.activeElement!==ta){ta.focus({preventScroll:true});if(u.sel)try{ta.setSelectionRange(u.sel[0],u.sel[1])}catch(e){}}
  }
  _fs=null;_fsUi=null;updProg()}
