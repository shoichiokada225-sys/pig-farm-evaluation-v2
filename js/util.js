/* util.js — 汎用ユーティリティ（DOM非依存の小道具） */
/* ==============================================================
   ユーティリティ
   ============================================================== */
/* act={label,fn}: トーストに押せるボタン（「元に戻す」等）を付ける。表示は長め（6秒） */
/* hold（ms）: 長めに出し、その間は裏の「送信済み」で上書きしない（toastHeld で確かめる）＝読む前に消さない */
function toast(msg,err,act,hold){
  toast._holdTo=hold?Date.now()+hold:0;
  const el=document.getElementById('toast');el.textContent=msg;el.classList.toggle('err',!!err);el.classList.toggle('act',!!act);
  const ms=Math.max(hold||0,act?6000:err?4500:2500);
  // 消えたトーストのボタン（「元に戻す」）は押せないように取り除く（見えないのに Enter で動く・読み上げに残るのを防ぐ）
  const hide=()=>{el.classList.remove('show','act');el.querySelectorAll('.toast-act').forEach(x=>x.remove())};
  if(act){const b=document.createElement('button');b.type='button';b.className='toast-act';b.textContent=act.label;
    b.onclick=()=>{clearTimeout(toast._t);hide();act.fn()};
    // フォーカスしている間は消さない（キーボード・読み上げで押す前に消えない）
    b.addEventListener('focus',()=>clearTimeout(toast._t));b.addEventListener('blur',()=>{clearTimeout(toast._t);toast._t=setTimeout(hide,2500)});
    el.appendChild(b)}
  el.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(hide,ms)}
/* 「元に戻す」付きのトーストを片付ける（別の人へ移った後に、効かないボタンを残さない） */
function toastClearAct(){const el=document.getElementById('toast');if(el&&el.classList.contains('act')){clearTimeout(toast._t);el.classList.remove('show','act');el.querySelectorAll('.toast-act').forEach(x=>x.remove())}}
/* 動きを減らす設定の端末では、なめらかスクロールにしない */
function smoothB(){try{return matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}catch(e){return'smooth'}}
/* 言語に合わせた区切り・かっこ（日本語以外の画面に「、」「（）」「・」を出さない） */
function listSep(){return typeof lang!=='undefined'&&lang!=='ja'?', ':'、'}
function paren(s){return typeof lang!=='undefined'&&lang!=='ja'?' ('+s+')':'（'+s+'）'}
function dotSep(){return typeof lang!=='undefined'&&lang!=='ja'?' / ':'・'}
/* 端末のローカル日付 YYYY-MM-DD（toISOString はUTCなので日本時間9:00前は前日になる） */
function todayLocal(d){d=d||new Date();const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())}
function esc(s){if(!s)return'';return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function sanitizeId(s){return String(s).replace(/[^a-zA-Z0-9_\-]/g,'_');}
/* CSVの1セルを安全に組み立てる（"の二重化＋Excelの数式インジェクション対策） */
function csvCell(v){
  let s=v==null?'':String(v);
  if(/^[=+\-@\t\r]/.test(s))s="'"+s;   // =HYPERLINK(...) 等がExcelで実行されるのを防ぐ
  return '"'+s.replace(/"/g,'""')+'"';
}
function toastHeld(){return toast._holdTo>Date.now()}
