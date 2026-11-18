<p align="center"><img src="public/favicon.svg" width="72" height="72" alt="TickDone"></p>

<h1 align="center">TickDone</h1>

<p align="center">ブラウザで動く ToDo リスト＆時間管理ツール。タスク、カレンダー、アイゼンハワー・マトリクス、ポモドーロタイマー、習慣トラッカーを備えています。</p>

<p align="center"><a href="https://tickdone.pages.dev"><b>TickDone を開く → tickdone.pages.dev</b></a></p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.zh-TW.md">繁體中文</a> ·
  <b>日本語</b> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.pt-BR.md">Português (Brasil)</a> ·
  <a href="README.ru.md">Русский</a>
</p>

![詳細パネルを開いたタスク画面](docs/screenshots/desktop-tasks.png)

| カレンダー | アイゼンハワー・マトリクス |
|---|---|
| ![カレンダー](docs/screenshots/desktop-calendar.png) | ![アイゼンハワー・マトリクス](docs/screenshots/desktop-matrix.png) |
| **ポモドーロタイマー** | **習慣トラッカー** |
| ![ポモドーロタイマー](docs/screenshots/desktop-pomo.png) | ![習慣トラッカー](docs/screenshots/desktop-habit.png) |

## 機能

- **タスク**：インボックス、今日、明日、今後7日間、すべて、完了済み、やらない、ゴミ箱。自分で作れるリスト・フォルダ・タグ。サブタスク、メモ、優先度、期日と時刻、リマインダー、繰り返し設定。ピン留め、すべてのタスクで使えるコンテキストメニュー、完了・削除の取り消し。
- **クイック追加**：入力した内容を読み取ってハイライト表示します。`call mom tomorrow 3pm !high #family ~Personal` と1行入力するだけで、日付・時刻・優先度・タグ・リストをまとめて設定できます。
- **リスト表示とカンバン表示**：グループ化と並べ替えに対応。
- **カレンダー**：月・週・日の表示に対応。
- **アイゼンハワー・マトリクス**：緊急度と重要度でタスクを仕分けできます。
- **ポモドーロタイマー**：ポモドーロとストップウォッチの2つのモードを備え、過去のセッションも記録します。
- **習慣トラッカー**：チェックイン、連続達成日数、統計。
- **検索**、キーボードショートカット、ダークテーマ。

データはブラウザ内（localStorage）にだけ保存されます。アカウントは不要で、サーバーには何も送信されません。

### キーボードショートカット

| キー | 操作 |
|---|---|
| `N` | 新規タスク |
| `Ctrl/⌘ F` | 検索 |
| `Alt 1`–`Alt 6` | モジュールの切り替え |
| `Ctrl/⌘ Z` | 元に戻す（取り消し通知の表示中） |
| `Esc` | タスク詳細を閉じる |
| `?` | ショートカット一覧を表示 |

## 開発

Node.js 24 が必要です。

```sh
npm install
npm run dev        # dev server at http://localhost:5173
npm run lint       # oxlint
npm test           # unit tests (Vitest)
npx playwright install chromium
npm run e2e        # end-to-end tests (Playwright)
npm run build      # type check and production build into dist/
```

React 19、TypeScript、Vite、date-fns で作られています。

## デプロイ

本番サイトは Cloudflare Pages で公開しています。

```sh
npm run build
npx wrangler pages deploy dist --project-name tickdone --branch main
```

## コントリビュート

Issue やプルリクエストを歓迎します。まず [AGENTS.md](AGENTS.md) をお読みください。プロジェクトのルール（作業言語は英語、サポートするすべての言語への翻訳、レスポンシブレイアウト、モーションとドラッグ＆ドロップの規約、すべての PR が通過しなければならない CI）がまとめてあります。

## ライセンス

[MIT](LICENSE)
