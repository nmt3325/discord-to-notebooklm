# Security notes

## Discordトークンの取り扱い

- トークンは `chrome.storage.local` にのみ保存され、外部サーバーには一切送信されません
- トークンはDiscord APIへの直接リクエストにのみ使用されます
- Base64は暗号化ではありません。トークンを共有・公開した場合はDiscordのパスワード変更でセッションを無効化してください

## Data flow (API mode)

1. ユーザーがペーストしたトークンで Discord API を直接呼び出し
2. サーバー一覧・チャンネル一覧・メッセージを取得
3. ブラウザ内でMarkdownへ整形
4. NotebookLMのソース追加画面へファイルまたはテキストとして渡す

## Data flow (DOM mode / fallback)

1. Discord Webの表示済みDOMからメッセージを抽出
2. ブラウザ内でMarkdownへ整形
3. ユーザーが選んだ場合のみChromeローカルストレージへ一時保存
4. NotebookLMのソース追加画面へファイルまたはテキストとして渡す

独自バックエンド・中間サーバーは一切ありません。すべてブラウザ内で完結します。
