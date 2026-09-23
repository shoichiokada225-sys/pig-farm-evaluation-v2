/* ui.js — 描画層：作業選択/採点カード/履歴/詳細/グラフ/CSV */
/* ==============================================================
   作業の複数選択パネル（カテゴリ別アコーディオン＋チェックボックス）
   ============================================================== */
function buildWorkSel(){
  const box=document.getElementById('wselCats');
  box.innerHTML=WORKDATA_V2.categories.map(c=>{
    const ws=worksInCat(c.id);if(!ws.length)return'';
    const selCnt=ws.filter(w=>selWorks.includes(w.id)).length;
    return `<details class="wcat" ${selCnt?'open':''}>
      <summary><span class="wcat-nm">${esc(catLabel(c.id))}</span><span class="wcat-ct${selCnt?' has':''}">${selCnt}/${ws.length}</span></summary>
      <div class="wcat-ls">${ws.map(w=>`
        <label class="wchk${selWorks.includes(w.id)?' on':''}">
          <input type="checkbox" value="${esc(w.id)}" ${selWorks.includes(w.id)?'checked':''} onchange="toggleWork(this.value,this.checked)">
          <span class="wchk-no">${esc((w.no||'').replace('No.',''))}</span>
          <span class="wchk-nm">${esc(loc(w,'name'))}</span>
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
function buildCards(){
  saveSt();
  const el=document.getElementById('cards');
  if(!selWorks.length){
    el.innerHTML=`<div class="pickwork"><svg class="pw-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4a3 3 0 0 1 6 0h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm3-1a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM8 10h8v2H8zm0 4h5v2H8z"/></svg><strong>${t('selWorksTitle')}</strong><br>${t('selWorksHint')}</div>`;
    updProg();return;
  }
  let h='',ci=0;
  selWorks.forEach(wid=>{
    const w=workById(wid);if(!w)return;
    h+=`<div class="wshd" id="wh-${esc(w.id)}">
      <span class="wshd-no">${esc(w.no||'')}</span>
      <span class="wshd-nm">${esc(loc(w,'name'))}</span>
      <span class="wshd-cat">${esc(catLabel(w.category))}</span>
    </div>`;
    if(w.gyomu)h+=`<a class="man-link" href="https://genba-manual.vercel.app/#g_${esc(w.gyomu)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/></svg>${t('manualLink')}</a>`;
    workItems(wid).forEach((it,ii)=>{
      h+=`<div class="cd ec" id="c-${it.id}" style="animation-delay:${Math.min(ci++,8)*0.03}s">
        <div class="en">${ii+1}</div>
        <div class="enm">${esc(it.name)}</div>
        <button class="crit-tg" id="critb-${it.id}" onclick="toggleCrit('${it.id}')" aria-expanded="false" aria-controls="crit-${it.id}">▼ ${t('showCrit')}</button>
        <div class="crit" id="crit-${it.id}">
          <div class="crit-k"><b>${t('kantenLbl')}</b>${esc(it.kanten)}</div>
          ${it.levels.map((lv,li)=>`<div class="crit-lv" data-id="${it.id}" data-s="${li+1}" role="button" tabindex="0" onclick="pick('${it.id}',${li+1})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();pick('${it.id}',${li+1})}"><span class="crit-n sb${li+1}">${li+1}</span><div class="crit-t"><b>${t('s'+(li+1))}</b>${esc(lv)}</div></div>`).join('')}
        </div>
        <div class="sr" role="group">${[1,2,3,4,5].map(s=>`<button class="sb" data-id="${it.id}" data-s="${s}" onclick="pick('${it.id}',${s})" aria-pressed="false">${s}<span class="sl">${t('s'+s)}</span></button>`).join('')}</div>
        <div class="clbl">${t('cmtLbl')}</div>
        <textarea data-cid="${it.id}" placeholder="${t('phCmt')}" oninput="onCh()"></textarea>
      </div>`;
    });
  });
  el.innerHTML=h;
  updProg();
}
function setScoreUI(id,s){
  document.querySelectorAll('.sb[data-id="'+id+'"]').forEach(b=>{const on=+b.dataset.s===s;b.classList.toggle('sel',on);b.setAttribute('aria-pressed',on)});
  document.querySelectorAll('.crit-lv[data-id="'+id+'"]').forEach(r=>r.classList.toggle('sel',+r.dataset.s===s));
  const c=document.getElementById('c-'+id);if(c)c.classList.add('scored');
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
   被評価者のキー = 農場＋名前（同名異人を1人に合算しない）
   農場が空の記録（農場列ができる前の記録・名簿外）は、同じ名前の記録の農場が1つだけならその農場の人とみなす
   ============================================================== */
function eeKeyer(all){
  const fs={};
  all.forEach(r=>{if(r.farm)(fs[r.evaluatee]=fs[r.evaluatee]||new Set()).add(r.farm)});
  return r=>{let f=r.farm||'';if(!f&&fs[r.evaluatee]&&fs[r.evaluatee].size===1)f=[...fs[r.evaluatee]][0];return JSON.stringify([f,r.evaluatee])};
}
function eePeople(all){
  const keyOf=eeKeyer(all),m=new Map();
  all.forEach(r=>{const k=keyOf(r);if(!m.has(k)){const [farm,name]=JSON.parse(k);m.set(k,{key:k,farm,name})}});
  const ps=[...m.values()];
  const cnt={};ps.forEach(p=>{cnt[p.name]=(cnt[p.name]||0)+1});
  ps.forEach(p=>{p.label=cnt[p.name]>1?p.name+'（'+(p.farm||t('farmNone'))+'）':p.name});
  return ps.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:a.farm<b.farm?-1:a.farm>b.farm?1:0);
}
/* 選択キーに一致する記録（キーは全記録から計算＝履歴・グラフで同じ人を指す） */
function recsOfKey(k){const all=getAll();if(!k)return all;const keyOf=eeKeyer(all);return all.filter(r=>keyOf(r)===k)}

/* ==============================================================
   履歴
   ============================================================== */
function drawHist(){
  const f=document.getElementById('hFil').value;let all=recsOfKey(f);
  all.sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||'').localeCompare(a.createdAt||''));
  const c=document.getElementById('hList');
  if(!all.length){c.innerHTML=`<div class="nd">${t('noData')}</div>`;return}
  const lbl={};eePeople(getAll()).forEach(p=>{lbl[p.key]=p.label});const keyOf=eeKeyer(getAll());
  c.innerHTML=all.map(r=>{
    const a=sessionAvg(r);
    const ac=a==null?'':(a>=4?' av4':(a<2?' av1':(a<3?' av2':' av3')));
    const wnames=(r.works||[]).map(dispWorkName);
    const wlbl=wnames.slice(0,2).join('・')+(wnames.length>2?` +${wnames.length-2}`:'');
    return `<div class="hi" role="button" tabindex="0" onclick="showDet('${sanitizeId(r.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showDet('${sanitizeId(r.id)}')}"><div class="hii"><div class="hid">${esc(r.date)}　${t('evLbl')}: ${esc(r.evaluator)}${sheetUrl()?(r.sent?` <span class="snt ok">✓${esc(t('sentLbl'))}</span>`:` <span class="snt ng">${esc(t('unsent'))}</span>`):''}</div><div class="hin">${esc(lbl[keyOf(r)]||r.evaluatee)}${r.manual?` <span class="snt off">${esc(t('offRoster'))}</span>`:''}　<span class="hiw">${esc(wlbl)}</span></div></div><div class="hia${ac}">${fm(a)}</div></div>`;
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
  putAll(getAll().filter(e=>e.id!==id));closeMo();drawHist();refreshSel();updSyncUI();renderRoster();
  toast(onSheet?t('tDelQueued'):t('tDel'));
  if(onSheet)syncPending();
}

/* ==============================================================
   CSV（縦持ち: 1行=1種目）
   ============================================================== */
function doCSV(){
  const all=getAll();if(!all.length){toast(t('eCSV'),1);return}
  const hd=['評価日','評価者','被評価者','農場','名簿外','カテゴリ','作業','種目','スコア','コメント','作業平均','セッション平均','全体所感','作成日時'];
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
        const row=[r.date,r.evaluator,r.evaluatee,r.farm||'',r.manual?'名簿外':'',catLabel(we.category||(w&&w.category)||''),we.workName||(w&&w.name)||'',a?a.name:aid,(we.scores||{})[aid]||'',(we.comments||{})[aid]||'',wav,sav,r.overall||'',r.createdAt||''];
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
  const avgOf=r=>{if(!wid)return sessionAvg(r);const we=(r.works||[]).find(x=>x.workId===wid);return we?workAvg(we):null};
  if(cL)cL.destroy();
  cL=new Chart(document.getElementById('cvL'),{type:'line',data:{labels:all.map(e=>e.date),datasets:[{label:t('chAvg'),data:all.map(avgOf),borderColor:'#177863',backgroundColor:'rgba(23,120,99,.10)',fill:true,tension:.3,pointRadius:5,pointHoverRadius:7,pointBackgroundColor:'#177863'}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{min:1,max:5,ticks:{stepSize:1,color:'#54635d'},grid:{color:'#e3eae7'}},x:{ticks:{color:'#54635d'},grid:{color:'#eef2f0'}}},plugins:{legend:{display:false}}}});
  const lat=all[all.length-1],prev=all.length>1?all[all.length-2]:null;
  const trunc=n=>{const mx=lang==='ja'?8:16;return n.length>mx?n.slice(0,mx)+'…':n};
  let labels,cur,prv;
  if(wid){
    // 作業指定: 5種目のレーダー
    const w=workById(wid);
    const aspects=w?w.aspects:[];
    labels=aspects.map(a=>trunc(loc(a,'name')));
    const pickSc=r=>{const we=(r.works||[]).find(x=>x.workId===wid);return aspects.map(a=>we&&we.scores[a.id]||0)};
    cur=pickSc(lat);prv=prev?pickSc(prev):null;
  }else{
    // 総合: 直近セッションの作業別平均レーダー
    labels=(lat.works||[]).map(we=>trunc(dispWorkName(we)));
    cur=(lat.works||[]).map(we=>workAvg(we)||0);
    prv=prev?(lat.works||[]).map(we=>{const p=(prev.works||[]).find(x=>x.workId===we.workId);return p?workAvg(p)||0:0}):null;
  }
  if(cR)cR.destroy();
  cR=new Chart(document.getElementById('cvR'),{type:'radar',data:{labels,datasets:[
    {label:lat.date,data:cur,borderColor:'#177863',backgroundColor:'rgba(23,120,99,.18)',pointBackgroundColor:'#177863'},
    ...(prv?[{label:prev.date+'（'+t('prevLbl')+'）',data:prv,borderColor:'#9e9e9e',backgroundColor:'rgba(158,158,158,.08)',pointBackgroundColor:'#9e9e9e',borderDash:[5,4],borderWidth:1.5}]:[])
  ]},options:{responsive:true,maintainAspectRatio:false,scales:{r:{min:0,max:5,ticks:{stepSize:1,font:{size:10},color:'#54635d',backdropColor:'rgba(255,255,255,.75)'},grid:{color:'#e3eae7'},angleLines:{color:'#e3eae7'},pointLabels:{font:{size:11},color:'#14211c'}}},plugins:{legend:{display:true,position:'bottom'}}}});
}

/* 採点フォームの状態退避/復元（言語切替・再描画時） */
let _fs=null;
function saveSt(){_fs=collectForm()}
function restoreSt(){if(!_fs)return;const d=_fs;getItems().forEach(it=>{
  const we=d.works.find(x=>x.workId===it.workId);
  const sc=we&&we.scores[it.aspectId];if(sc)setScoreUI(it.id,sc);
  const cm=we&&we.comments[it.aspectId];if(cm){const ta=document.querySelector('textarea[data-cid="'+it.id+'"]');if(ta)ta.value=cm}
});_fs=null;updProg()}
