/* util.js — 汎用ユーティリティ（DOM非依存の小道具） */
/* ==============================================================
   ユーティリティ
   ============================================================== */
function toast(msg,err){const el=document.getElementById('toast');el.textContent=msg;el.classList.toggle('err',!!err);el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2500)}
function esc(s){if(!s)return'';return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function sanitizeId(s){return String(s).replace(/[^a-zA-Z0-9_\-]/g,'_');}
/* CSVの1セルを安全に組み立てる（"の二重化＋Excelの数式インジェクション対策） */
function csvCell(v){
  let s=v==null?'':String(v);
  if(/^[=+\-@\t\r]/.test(s))s="'"+s;   // =HYPERLINK(...) 等がExcelで実行されるのを防ぐ
  return '"'+s.replace(/"/g,'""')+'"';
}
