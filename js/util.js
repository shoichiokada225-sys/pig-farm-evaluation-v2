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

/* SHA-256（同期・依存なし）。設定タブのパスワードを平文で持たず、tenant-config.js のハッシュと照合するために使う */
function sha256hex(str){
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const b=Array.from(new TextEncoder().encode(String(str)));const l=b.length*8;b.push(0x80);while(b.length%64!==56)b.push(0);
  for(let i=7;i>=0;i--)b.push(i>3?0:(l>>>(i*8))&255);
  let h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const rr=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let o=0;o<b.length;o+=64){
    const w=new Array(64);for(let i=0;i<16;i++)w[i]=((b[o+i*4]<<24)|(b[o+i*4+1]<<16)|(b[o+i*4+2]<<8)|b[o+i*4+3])>>>0;
    for(let i=16;i<64;i++){const s0=rr(w[i-15],7)^rr(w[i-15],18)^(w[i-15]>>>3),s1=rr(w[i-2],17)^rr(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0}
    let [a,c,d,e,f,g,hh,j]=h;
    for(let i=0;i<64;i++){const S1=rr(f,6)^rr(f,11)^rr(f,25),ch=(f&g)^(~f&hh),t1=(j+S1+ch+K[i]+w[i])>>>0,S0=rr(a,2)^rr(a,13)^rr(a,22),mj=(a&c)^(a&d)^(c&d),t2=(S0+mj)>>>0;j=hh;hh=g;g=f;f=(e+t1)>>>0;e=d;d=c;c=a;a=(t1+t2)>>>0}
    h=[h[0]+a,h[1]+c,h[2]+d,h[3]+e,h[4]+f,h[5]+g,h[6]+hh,h[7]+j].map(x=>x>>>0);
  }
  return h.map(x=>x.toString(16).padStart(8,'0')).join('');
}
