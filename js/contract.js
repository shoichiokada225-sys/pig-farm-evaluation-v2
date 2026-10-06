/* contract.js — アプリ ⇔ シート（GAS: gas/Code.src.gs）の契約。ここが正本（GAS側の見出しコメントもここを指す）
   GET  ?action=roster → {ok:true, version, capabilities:[...], roster:[{name, farm, works:[作業名|No.|ID], aliases?:[旧名]}],
                          done?:[{id, date:'YYYY-MM-DD', name:被評価者, farm, works:[作業名]}]}（点数・評価者名は含まない）
                        done = シートの評価者タブにある記録の要約（ほかの端末で済んだ人・作業も数える。'roster.done' の GAS だけが返す＝無くても動く）
                        受験者タブが無い時 {ok:false, version, capabilities, error:'no roster sheet'}
   GET  ?action=ping   → {ok:true, version, capabilities}
   POST {action:'submit', record: toPayload(記録)} → {ok:true, id, rows}（record.redoOf=やり直し元の記録ID。'submit.redoOf' の GAS が「やり直し元」列に書く・古い GAS は無視＝送っても安全） ／ {ok:false, error:'no record'|'no id'|'busy'|…}
        record.ver=端末の更新時刻（updatedAt||createdAt）。'submit.ver' の GAS は、シートに新しい版があれば書かずに {ok:true, id, rows:0, stale:true}
        'submit.revive' の GAS（2026-10-06c〜）は、record.revive:true＋rv（戻しの合図・ランダム）の送信だけが削除済みの記録を書き戻す。削除は {rv} を持ち、その合図の戻しは以後通さない。
        戻した後に、戻すより前に出された削除（合図が違い、at が rvAt より前）が遅れて届いたら {ok:true, deleted:0, staleDelete:true}＝行を消さない
        'submit.dups' の GAS は、別の記録が同じ人（被評価者＋農場）・同じ作業を採点していれば dups:[作業名]（やり直しの関係は除く）
   POST {action:'delete', id, evaluator}          → {ok:true, id, deleted:行数（無ければ0＝再送しても安全）} ／ {ok:false, error:'no id'|'busy'}
   知らない action → {ok:false, error:'unknown action'}（2026-09-24b 以前の GAS は何でも 'bad request'）
   capabilities（GAS の API_CAPABILITIES）: 'roster'=名簿 / 'roster.aliases'=旧名の列 / 'roster.done'=記録の要約 / 'submit'=記録の書き込み / 'submit.redoOf'=やり直し元の列 / 'delete'=行の削除
   GAS に機能を足したら: GAS の CODE_VERSION と API_CAPABILITIES を上げ、アプリが必要とするならここの GAS_REQUIRED_CAPS・GAS_MIN_VERSION も上げる
   （gas/test_gas.js が、GAS の返す capabilities ⊇ GAS_REQUIRED_CAPS と、toPayload の出力を本物の doPost に通せることを確かめる） */
const GAS_MIN_VERSION='2026-10-06d';   // 戻し・削除の順序の判定（at/rvAt）が入った版
const GAS_REQUIRED_CAPS=['roster','roster.aliases','submit','delete','submit.revive'];

/* 応答から GAS の版と機能を取り出す（capabilities の無い古い GAS は caps=null） */
function gasInfo(j){return{version:String(j&&j.version||''),caps:Array.isArray(j&&j.capabilities)?j.capabilities.map(String):null}}
/* 足りない機能（空=十分）。g が無い（まだ名簿を取っていない・前の版のアプリのキャッシュ）時は判断しない */
function gasMissing(g){
  if(!g||typeof g!=='object')return[];
  const caps=Array.isArray(g.caps)?g.caps:[];
  const miss=GAS_REQUIRED_CAPS.filter(c=>!caps.includes(c));
  if(!miss.length&&(!g.version||g.version<GAS_MIN_VERSION))miss.push('version');
  return miss;
}
/* GAS がその操作を知らない（古い版） */
function isUnsupportedOp(j){return !!(j&&j.ok===false&&(j.error==='unknown action'||j.error==='bad request'))}

/* 送る形 */
function submitReq(r){return{action:'submit',record:toPayload(r)}}
function deleteReq(d){return{action:'delete',id:d.id,evaluator:d.evaluator||'',rv:d.rv||'',at:d.at||''}}   // at=削除を出した時刻（戻しより前に出された古い削除を見分ける）
/* 端末の記録 → シートの行の元（作業名・カテゴリ・種目名は日本語の正本の名前） */
function toPayload(r){
  return{id:r.id,date:r.date,evaluator:r.evaluator,evaluatee:r.evaluatee,farm:r.farm||'',overall:r.overall||'',redoOf:r.redoOf||'',ver:r.updatedAt||r.createdAt||'',...(r.revive?{revive:true}:{}),...(r.rv?{rv:r.rv,rvAt:r.rvAt||''}:{}),
    works:(r.works||[]).map(we=>{
      const w=workById(we.workId);
      const c=WORKDATA_V2.categories.find(c=>c.id===(we.category||(w&&w.category)));
      return{workName:we.workName||(w&&w.name)||'',category:c?c.name:(we.category||''),
        // 今のカタログに無い作業（作業一覧の更新前の記録）は、記録にある種目のキーで行を作る（0行で送って行を消さない）
        items:w?w.aspects.map(a=>({aspect:a.name,score:(we.scores||{})[a.id],comment:(we.comments||{})[a.id]||''}))
          :Object.keys({...(we.scores||{}),...(we.comments||{})}).map(k=>({aspect:k,score:(we.scores||{})[k],comment:(we.comments||{})[k]||''}))};
    })};
}
