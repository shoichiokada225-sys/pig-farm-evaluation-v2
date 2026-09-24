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
  return '✓ '+t('doneMark')+'（'+t('prevLbl')+' '+mdOf(pv.date)+(pv.avg!=null?' · '+(Math.round(pv.avg*10)/10).toFixed(1):'')+'）';
}
function wnavHtml(){
  const all=typeof curDoneWorks==='function'?curDoneWorks():[];
  const dn=all.filter(id=>!selWorks.includes(id)&&workById(id));
  if(!(selWorks.length>1||dn.length))return'';
  return `<nav class="wnav" id="wnav" aria-label="${esc(t('wnavLbl'))}">`+
    selWorks.filter(workById).map(wid=>{const w=workById(wid),pv=all.includes(wid)?prevDoneTx(wid):'';return `<button type="button" class="wnav-c${pv?' redo':''}" data-w="${esc(wid)}" title="${esc(loc(w,'name'))}" onclick="jumpWork(this.dataset.w)"><span class="wnav-nm">${esc(loc(w,'name'))}</span><span class="wnav-ct" data-wct="${esc(wid)}">0/${workItems(wid).length}</span>${pv?`<span class="wnav-prev">${esc(pv)}</span>`:''}</button>`}).join('')+
    dn.map(wid=>`<span class="wnav-c done" data-w="${esc(wid)}" title="${esc(loc(workById(wid),'name'))}"><span class="wnav-nm">${esc(loc(workById(wid),'name'))}</span><span class="wnav-ct">✓ ${esc(t('doneMark'))}</span></span>`).join('')+
    `</nav>`;
}
/* 1作業ぶんの区切り（見出し＋5種目のカード）。ci=通し番号（最初の構築のフェードの遅れ）。作業が無ければ '' */
function wsecHtml(wid,ci){
  const w=workById(wid);if(!w)return'';
  ci=ci||{n:0};
  // 作業ごとに区切る（見出しは自分の作業のカードの間だけ貼り付き、次の作業に来たら入れ替わる）
  let h=`<section class="wsec" data-w="${esc(w.id)}"><div class="wshd" id="wh-${esc(w.id)}" data-w="${esc(w.id)}">
      <span class="wshd-no">${esc(w.no||'')}</span>
      <span class="wshd-nm" title="${esc(loc(w,'name'))}">${esc(loc(w,'name'))}</span>
      <span class="wshd-ct" data-wct="${esc(w.id)}">0/${workItems(wid).length}</span>
    </div>
    <div class="wsub"><span class="wsub-nm">${esc(loc(w,'name'))} ${w.category?`<span class="wsub-cat">· ${esc(catLabel(w.category))}</span>`:''}${(()=>{const pv=typeof curDoneWorks==='function'&&curDoneWorks().includes(wid)?prevDoneTx(wid):'';return pv?` <span class="wsub-prev">${esc(pv)}</span>`:''})()}</span>${editId?'':`<button type="button" class="wshd-skip" data-w="${esc(w.id)}" onclick="skipWork(this.dataset.w)">${esc(t('skipWork'))}</button>`}</div>`;
  if(w.gyomu)h+=`<a class="man-link" href="https://genba-manual.vercel.app/#g_${esc(w.gyomu)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/></svg>${t('manualLink')}</a>`;
  workItems(wid).forEach((it,ii)=>{
    h+=`<div class="cd ec" id="c-${it.id}" data-w="${esc(wid)}" style="animation-delay:${Math.min(ci.n++,8)*0.03}s">
        <div class="en">${ii+1}</div>
        <div class="enm" id="enm-${it.id}">${esc(it.name)}</div>
        <span class="miss-bd" id="miss-${it.id}">⚠ ${esc(t('missLbl'))}</span>
        <button class="crit-tg" id="critb-${it.id}" onclick="toggleCrit('${it.id}')" aria-expanded="false" aria-controls="crit-${it.id}">▼ ${t('showCrit')}</button>
        <div class="crit" id="crit-${it.id}">
          <div class="crit-k"><b>${t('kantenLbl')}</b>${esc(it.kanten)}</div>
          ${it.levels.map((lv,li)=>`<div class="crit-lv" data-id="${it.id}" data-s="${li+1}" role="button" tabindex="0" onclick="pick('${it.id}',${li+1})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();pick('${it.id}',${li+1})}"><span class="crit-n sb${li+1}">${li+1}</span><div class="crit-t"><b>${t('s'+(li+1))}</b>${esc(lv)}</div></div>`).join('')}
        </div>
        <div class="sr" role="group" tabindex="-1" aria-labelledby="enm-${it.id}" aria-describedby="miss-${it.id}">${[1,2,3,4,5].map(s=>`<button class="sb" data-id="${it.id}" data-s="${s}" onclick="pick('${it.id}',${s})" aria-pressed="false">${s}<span class="sl">${t('s'+s)}</span></button>`).join('')}</div>
        <div class="clbl">${t('cmtLbl')}</div>
        <textarea data-cid="${it.id}" placeholder="${t('phCmt')}" oninput="onCh()"></textarea>
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
  miss.forEach(id=>{const c=document.getElementById(id);if(c)c.classList.add('miss')});
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
function setScoreUI(id,s){
  document.querySelectorAll('.sb[data-id="'+id+'"]').forEach(b=>{const on=+b.dataset.s===s;b.classList.toggle('sel',on);b.setAttribute('aria-pressed',on)});
  document.querySelectorAll('.crit-lv[data-id="'+id+'"]').forEach(r=>r.classList.toggle('sel',+r.dataset.s===s));
  const c=document.getElementById('c-'+id);if(c){c.classList.add('scored');c.classList.remove('miss')}   // 点を付けたら「未採点」の印を外す
}
function pick(id,s){setScoreUI(id,s);onCh();updProg();if(navigator.vibrate)try{navigator.vibrate(8)}catch(e){}}
function updProg(){
  const f=document.getElementById('progF'),tx=document.getElementById('progT');
  if(!f||!tx)return;
  const total=getItems().length;
  const done=document.querySelectorAll('#cards .ec.scored').length;
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
  ps.forEach(p=>{p.label=cnt[p.name]>1?p.name+'（'+farmDisp(p.farm)+'）':p.name});
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
  c.innerHTML=all.map(r=>{
    const a=sessionAvg(r);
    const ac=a==null?'':(a>=4?' av4':(a<2?' av1':(a<3?' av2':' av3')));
    const wnames=(r.works||[]).map(dispWorkName);
    const wlbl=wnames.slice(0,2).join('・')+(wnames.length>2?` +${wnames.length-2}`:'');
    return `<div class="hi" role="button" tabindex="0" onclick="showDet('${sanitizeId(r.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showDet('${sanitizeId(r.id)}')}"><div class="hii"><div class="hid">${esc(r.date)}　${t('evLbl')}: ${esc(r.evaluator)}${sheetUrl()?(r.sent?` <span class="snt ok">✓${esc(t('sentLbl'))}</span>`:` <span class="snt ng">${esc(t('unsent'))}</span>`):''}</div><div class="hin">${esc(lbl[keyOf(r).key]||r.evaluatee)}${r.manual?` <span class="snt off">${esc(t('offRoster'))}</span>`:''}　<span class="hiw">${esc(wlbl)}</span></div></div><div class="hia${ac}">${fm(a)}</div></div>`;
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
  document.body.classList.add('mo-open');
  const mx=document.querySelector('#moBody .mx');if(mx)mx.focus();
}
function closeMo(){
  document.getElementById('modal').classList.remove('show');document.body.classList.remove('mo-open');
  if(_moRet&&document.body.contains(_moRet)){_moRet.focus()}_moRet=null;
}
/* 削除: シートに行があるかもしれない記録は「削除待ち」に入れ、シートの行も消す（圏外なら、つながった時に消す） */
function doDel(id){
  const r=getAll().find(e=>e.id===id);if(!r)return;
  const onSheet=mayBeOnSheet(r)||syncing;   // 送信中の記録は、この後シートに届くかもしれない
  if(!confirm(onSheet?t('cDelSheet').replace('{id}',r.id):t('cDel')))return;
  if(onSheet)queueDel(r);
  if(typeof dropSheetDone==='function')dropSheetDone(id);
  putAll(getAll().filter(e=>e.id!==id));closeMo();drawHist();refreshSel();updSyncUI();renderRoster();
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
  a.download='jitsugi_v2_'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'.csv';a.click();toast(t('tCSV'));
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
  const trunc=n=>{const mx=lang==='ja'?8:16;return n.length>mx?n.slice(0,mx)+'…':n};
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
    cur=pickSc(lat);prv=prev?pickSc(prev):null;curLbl=lat.date;prvLbl=prev?prev.date+'（'+t('prevLbl')+'）':'';
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
  if(labels.length<=2){
    // 軸が2本以下ではレーダーが面にならない → 棒グラフ
    ds.forEach(d=>{d.backgroundColor=d.borderColor;d.borderDash=undefined});
    cR=new Chart(document.getElementById('cvR'),{type:'bar',data:{labels,datasets:ds},options:{responsive:true,maintainAspectRatio:false,scales:{y:{min:0,max:5,ticks:{stepSize:1,color:'#54635d'},grid:{color:'#e3eae7'}},x:{ticks:{color:'#14211c'},grid:{display:false}}},plugins:{legend:{display:true,position:'bottom'}}}});
  }else{
    cR=new Chart(document.getElementById('cvR'),{type:'radar',data:{labels,datasets:ds},options:{responsive:true,maintainAspectRatio:false,spanGaps:false,scales:{r:{min:0,max:5,ticks:{stepSize:1,font:{size:10},color:'#54635d',backdropColor:'rgba(255,255,255,.75)'},grid:{color:'#e3eae7'},angleLines:{color:'#e3eae7'},pointLabels:{font:{size:11},color:'#14211c'}}},plugins:{legend:{display:true,position:'bottom'}}}});
  }
}

/* 採点フォームの状態退避/復元（言語切替・再描画時） */
/* 点数・コメントに加えて、開いていた評価基準と入力中のコメント欄も覚えて戻す（作り直しで閉じない・キーボードが閉じない） */
let _fs=null,_fsUi=null;
function saveSt(){
  _fs=collectForm();
  const ae=document.activeElement;
  _fsUi={open:[...document.querySelectorAll('#cards .crit.open')].map(c=>c.id),
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
    const ta=u.focus&&document.querySelector('#cards textarea[data-cid="'+u.focus+'"]');
    if(ta&&document.activeElement!==ta){ta.focus({preventScroll:true});if(u.sel)try{ta.setSelectionRange(u.sel[0],u.sel[1])}catch(e){}}
  }
  _fs=null;_fsUi=null;updProg()}
