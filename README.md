# Discord → NotebookLM

Discord のチャット履歴を NotebookLM にインポートする Chrome 拡張機能です。

## 使い方

### API モード（推奨）
1. Discord ユーザートークンを取得（F12 → Network → 適当なリクエスト → Authorization ヘッダー）
2. 拡張のポップアップでトークンをペースト → 「読込」
3. サーバーとチャンネルを選択
4. 「NotebookLMへ送る」でインポート

### DOM モード（トークン不要）
1. Discord Web で対象チャンネルを表示
2. 拡張を開く → 自動でサーバー・チャンネルを検出
3. 「NotebookLMへ送る」でインポート

## インストール
1. ZIP を展開
2. Chrome で `chrome://extensions` を開く
3. 「デベロッパー モード」をオン
4. 「パッケージ化されていない拡張機能を読み込む」
5. 展開したフォルダを選択

## 機能
- ✅ Discord API 経由のサーバー一覧・チャンネル一覧取得
- ✅ API 経由の高速メッセージ取得（最大 10,000 件）
- ✅ DOM スクレイピングによるフォールバック
- ✅ 日付フィルター・件数制限
- ✅ NotebookLM への自動インポート補助
- ✅ Markdown ファイル保存
- ✅ トークンは端末内の storage.local にのみ保存

## バージョン
v0.2.0 — API モード追加
