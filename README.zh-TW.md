<p align="center"><img src="public/favicon.svg" width="72" height="72" alt="TickDone"></p>

<h1 align="center">TickDone</h1>

<p align="center">在瀏覽器中執行的待辦清單與時間管理工具：任務、行事曆、四象限、番茄專注和習慣打卡。</p>

<p align="center"><a href="https://tickdone.pages.dev"><b>開啟 TickDone → tickdone.pages.dev</b></a></p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <b>繁體中文</b> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.pt-BR.md">Português (Brasil)</a> ·
  <a href="README.ru.md">Русский</a>
</p>

![展開詳細資訊面板的任務列表](docs/screenshots/desktop-tasks.png)

| 行事曆 | 四象限 |
|---|---|
| ![行事曆](docs/screenshots/desktop-calendar.png) | ![四象限](docs/screenshots/desktop-matrix.png) |
| **番茄專注** | **習慣打卡** |
| ![番茄專注](docs/screenshots/desktop-pomo.png) | ![習慣打卡](docs/screenshots/desktop-habit.png) |

## 功能

- **任務**：收件匣、今天、明天、未來 7 天、全部、已完成、已放棄和垃圾桶；自訂清單、資料夾和標籤；子任務、備註、優先順序、截止日期與時間、提醒和重複規則；置頂；每個任務都有右鍵選單；完成或刪除後可以復原。
- **快速新增**：能理解你輸入的內容並標示出來，一行 `call mom tomorrow 3pm !high #family ~Personal` 就能設定好日期、時間、優先順序、標籤和清單；也支援簡體中文輸入，例如 `明天下午3点 开周会 !高 #重要`。
- **列表與看板檢視**，可分組和排序。
- **行事曆**：月、週、日三種檢視。
- **四象限**：依緊急程度和重要性為任務分類。
- **番茄專注**：番茄鐘和碼錶兩種模式，並保留過往的專注紀錄。
- **習慣打卡**：打卡、連續打卡天數和統計。
- **搜尋**、鍵盤快速鍵和深色主題。

資料只會儲存在你的瀏覽器裡（localStorage）。不需要帳號，也不會把任何資料傳送到伺服器。

### 鍵盤快速鍵

| 按鍵 | 動作 |
|---|---|
| `N` | 新增任務 |
| `Ctrl/⌘ F` | 搜尋 |
| `Alt 1`–`Alt 6` | 切換模組 |
| `Ctrl/⌘ Z` | 復原（復原提示顯示期間） |
| `Esc` | 關閉任務詳細資訊 |
| `?` | 顯示所有快速鍵 |

## 路線圖

每一項都連結到對應的 Issue。打勾的項目已在 [tickdone.pages.dev](https://tickdone.pages.dev) 上線。

- [x] 任務、清單、標籤、快速新增、行事曆、四象限、番茄專注和習慣打卡
- [x] CI：單元測試與端對端測試 ([#7](https://github.com/suica/tickdone/issues/7))
- [x] 開源：10 種語言的 README、MIT 授權條款、專案規則 ([#10](https://github.com/suica/tickdone/issues/10))
- [ ] 適用手機、平板和大螢幕的版面 ([#8](https://github.com/suica/tickdone/issues/8))
- [ ] 全面支援拖放 ([#9](https://github.com/suica/tickdone/issues/9))
- [ ] 動畫 ([#3](https://github.com/suica/tickdone/issues/3))
- [ ] App 內的 GitHub 連結與「關於」頁面 ([#4](https://github.com/suica/tickdone/issues/4))
- [ ] 介面支援 10 種語言 ([#14](https://github.com/suica/tickdone/issues/14))
- [ ] 逐一打磨每個畫面 ([#11](https://github.com/suica/tickdone/issues/11))
- [ ] 多選與批次編輯 ([#15](https://github.com/suica/tickdone/issues/15))
- [ ] 任務列表的鍵盤導覽 ([#16](https://github.com/suica/tickdone/issues/16))
- [ ] 提醒通知 ([#17](https://github.com/suica/tickdone/issues/17))
- [ ] 可安裝為 App 並離線使用 ([#18](https://github.com/suica/tickdone/issues/18))
- [ ] 可儲存的篩選條件 ([#19](https://github.com/suica/tickdone/issues/19))
- [ ] 任務、番茄專注和習慣打卡的統計 ([#20](https://github.com/suica/tickdone/issues/20))
- [ ] 任務備註支援 Markdown ([#21](https://github.com/suica/tickdone/issues/21))
- [ ] 時間軸檢視 ([#22](https://github.com/suica/tickdone/issues/22))
- [ ] 更多重複規則 ([#23](https://github.com/suica/tickdone/issues/23))
- [ ] 封存清單 ([#24](https://github.com/suica/tickdone/issues/24))
- [ ] 無障礙 ([#25](https://github.com/suica/tickdone/issues/25))
- [ ] 上千個任務依然流暢 ([#26](https://github.com/suica/tickdone/issues/26))
- [ ] 主題與強調色 ([#27](https://github.com/suica/tickdone/issues/27))
- [ ] 行事曆：安排沒有日期的任務、議程檢視 ([#28](https://github.com/suica/tickdone/issues/28))

## 開發

需要 Node.js 24。

```sh
npm install
npm run dev        # dev server at http://localhost:5173
npm run lint       # oxlint
npm test           # unit tests (Vitest)
npx playwright install chromium
npm run e2e        # end-to-end tests (Playwright)
npm run build      # type check and production build into dist/
```

使用 React 19、TypeScript、Vite 和 date-fns 開發。

## 部署

正式網站架設在 Cloudflare Pages：

```sh
npm run build
npx wrangler pages deploy dist --project-name tickdone --branch main
```

## 參與貢獻

歡迎提出 Issue 和 Pull Request。請先閱讀 [AGENTS.md](AGENTS.md)，裡面列出了專案規則（以英文為工作語言、為每種支援的語言提供翻譯、響應式版面、動畫與拖放慣例，以及每個 PR 都必須通過的 CI）。

## 授權條款

[MIT](LICENSE)
