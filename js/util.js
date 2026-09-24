/* util.js — 汎用ユーティリティ（DOM非依存の小道具） */
/* ==============================================================
   ユーティリティ
   ============================================================== */
/* act={label,fn}: トーストに押せるボタン（「元に戻す」等）を付ける。表示は長め（6秒） */
function toast(msg,err,act){const el=document.getElementById('toast');el.textContent=msg;el.classList.toggle('err',!!err);el.classList.toggle('act',!!act);
  if(act){const b=document.createElement('button');b.type='button';b.className='toast-act';b.textContent=act.label;
    b.onclick=()=>{clearTimeout(toast._t);el.classList.remove('show','act');act.fn()};el.appendChild(b)}
  el.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('show','act'),act?6000:err?4500:2500)}
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
