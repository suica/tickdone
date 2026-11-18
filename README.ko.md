<p align="center"><img src="public/favicon.svg" width="72" height="72" alt="TickDone"></p>

<h1 align="center">TickDone</h1>

<p align="center">브라우저에서 실행되는 할 일 목록 겸 시간 관리 도구: 작업, 캘린더, 아이젠하워 매트릭스, 집중 타이머, 습관 트래커.</p>

<p align="center"><a href="https://tickdone.pages.dev"><b>TickDone 열기 → tickdone.pages.dev</b></a></p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.zh-TW.md">繁體中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <b>한국어</b> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.pt-BR.md">Português (Brasil)</a> ·
  <a href="README.ru.md">Русский</a>
</p>

![세부 정보 창을 연 작업 화면](docs/screenshots/desktop-tasks.png)

| 캘린더 | 아이젠하워 매트릭스 |
|---|---|
| ![캘린더](docs/screenshots/desktop-calendar.png) | ![아이젠하워 매트릭스](docs/screenshots/desktop-matrix.png) |
| **집중 타이머** | **습관 트래커** |
| ![집중 타이머](docs/screenshots/desktop-pomo.png) | ![습관 트래커](docs/screenshots/desktop-habit.png) |

## 기능

- **작업**: 수신함, 오늘, 내일, 다음 7일, 전체, 완료됨, 하지 않음, 휴지통; 직접 만드는 목록, 폴더, 태그; 하위 작업, 메모, 우선순위, 마감 날짜와 시간, 알림, 반복 규칙; 고정; 모든 작업의 컨텍스트 메뉴; 완료하거나 삭제한 뒤 실행 취소.
- **빠른 추가**: 입력한 내용을 이해하고 강조 표시합니다. `call mom tomorrow 3pm !high #family ~Personal`처럼 한 줄만 입력하면 날짜, 시간, 우선순위, 태그, 목록이 한 번에 설정됩니다.
- **목록 보기와 칸반 보기**: 그룹화와 정렬을 지원합니다.
- **캘린더**: 월, 주, 일 보기를 제공합니다.
- **아이젠하워 매트릭스**: 긴급도와 중요도에 따라 작업을 분류합니다.
- **집중 타이머**: 뽀모도로와 스톱워치 모드, 지난 세션 기록을 제공합니다.
- **습관 트래커**: 체크인, 연속 달성 기록, 통계를 제공합니다.
- **검색**, 키보드 단축키, 다크 테마.

데이터는 브라우저(localStorage)에만 저장됩니다. 계정이 필요 없고 서버로 전송되는 데이터도 없습니다.

### 키보드 단축키

| 키 | 동작 |
|---|---|
| `N` | 새 작업 |
| `Ctrl/⌘ F` | 검색 |
| `Alt 1`–`Alt 6` | 모듈 전환 |
| `Ctrl/⌘ Z` | 실행 취소(실행 취소 알림이 떠 있는 동안) |
| `Esc` | 작업 세부 정보 닫기 |
| `?` | 모든 단축키 보기 |

## 개발

Node.js 24가 필요합니다.

```sh
npm install
npm run dev        # dev server at http://localhost:5173
npm run lint       # oxlint
npm test           # unit tests (Vitest)
npx playwright install chromium
npm run e2e        # end-to-end tests (Playwright)
npm run build      # type check and production build into dist/
```

React 19, TypeScript, Vite, date-fns로 만들었습니다.

## 배포

라이브 사이트는 Cloudflare Pages에서 호스팅됩니다.

```sh
npm run build
npx wrangler pages deploy dist --project-name tickdone --branch main
```

## 기여하기

이슈와 풀 리퀘스트를 환영합니다. 먼저 [AGENTS.md](AGENTS.md)를 읽어 주세요. 프로젝트 규칙(작업 언어는 영어, 지원하는 모든 언어로의 번역, 반응형 레이아웃, 모션 및 드래그 앤 드롭 규칙, 모든 PR이 통과해야 하는 CI)이 정리되어 있습니다.

## 라이선스

[MIT](LICENSE)
