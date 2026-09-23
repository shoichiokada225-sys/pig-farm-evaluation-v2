# 記録用スプレッドシート連携（GAS）

- スプレッドシート: 「HSS実技試験V2 記録」 https://docs.google.com/spreadsheets/d/1Uym-B4iXMO8_H1y3dBww2d_AVgIrAkdbdgVPkOTH_dI/edit
- スクリプト: https://script.google.com/d/1kD1IRPzghY_JIwsaw787_gA6PqE6t_lLNaFlVzTbgFGhST_O0G0TNLi8/edit
- ウェブアプリURL（アプリの js/config.js に設定済み）:
  https://script.google.com/macros/s/AKfycbxFqIag1AwnT6WTaWlAf8Gb2Mh-JZRRB07DTrE6MAQLhyRIqZuwIsuMsWX-OaoxdvzP/exec
- オーナー: shoichi.okada225@gmail.com（clasp ログイン済み）

## 初回だけ（社長作業・2分）
1. 上のスクリプトURLを開く → 関数 `setup` を選んで ▶実行
2. 「権限を確認」→ アカウント選択 →「詳細」→「安全ではないページに移動」→ 許可
3. スプレッドシートに「受験者」「作業一覧」タブができる。「受験者」に 被評価者名｜作業1｜作業2… を入力（作業はプルダウン）

## シートの形
- **受験者**: A列=被評価者、B〜I列=試験作業（作業名・No.どちらでも可）。アプリの「名簿を更新」で反映
- **評価者名のタブ**: 評価者ごとに自動で作られる。1種目=1行。記録IDで上書きされるので、再送・編集しても重複しない
- アプリで記録を削除しても、シートの行は消えない（シート側で消す）

## コード更新（URLを変えない）
```
node gas/build_gas.js            # Code.src.gs → Code.gs / deploy/Code.js
node gas/test_gas.js             # 単体テスト
cd gas/deploy && clasp push --force && clasp update-deployment AKfycbxFqIag1AwnT6WTaWlAf8Gb2Mh-JZRRB07DTrE6MAQLhyRIqZuwIsuMsWX-OaoxdvzP
```
🚨 `clasp create-deployment` だと新URLになり、配布済みのアプリから届かなくなる。
