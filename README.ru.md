<p align="center"><img src="public/favicon.svg" width="72" height="72" alt="TickDone"></p>

<h1 align="center">TickDone</h1>

<p align="center">Список дел и тайм-менеджер, который работает прямо в браузере: задачи, календарь, матрица Эйзенхауэра, таймер фокусировки и трекер привычек.</p>

<p align="center"><a href="https://tickdone.pages.dev"><b>Открыть TickDone → tickdone.pages.dev</b></a></p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.zh-TW.md">繁體中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.pt-BR.md">Português (Brasil)</a> ·
  <b>Русский</b>
</p>

![Задачи с открытой панелью подробностей](docs/screenshots/desktop-tasks.png)

| Календарь | Матрица Эйзенхауэра |
|---|---|
| ![Календарь](docs/screenshots/desktop-calendar.png) | ![Матрица Эйзенхауэра](docs/screenshots/desktop-matrix.png) |
| **Таймер фокусировки** | **Трекер привычек** |
| ![Таймер фокусировки](docs/screenshots/desktop-pomo.png) | ![Трекер привычек](docs/screenshots/desktop-habit.png) |

## Возможности

- **Задачи**: «Входящие», «Сегодня», «Завтра», «Ближайшие 7 дней», «Все», «Выполненные», «Не буду делать» и «Корзина»; собственные списки, папки и теги; подзадачи, заметки, приоритеты, сроки с датой и временем, напоминания и правила повторения; закрепление; контекстное меню у каждой задачи; отмена после выполнения или удаления.
- **Быстрое добавление** понимает, что вы вводите, и подсвечивает это: `call mom tomorrow 3pm !high #family ~Personal` одной строкой задаёт дату, время, приоритет, тег и список.
- **Вид списка и канбан-доски** с группировкой и сортировкой.
- **Календарь** с видами на месяц, неделю и день.
- **Матрица Эйзенхауэра**, чтобы распределять задачи по срочности и важности.
- **Таймер фокусировки** с режимами помодоро и секундомера и историей прошлых сессий.
- **Трекер привычек** с отметками, сериями и статистикой.
- **Поиск**, горячие клавиши и тёмная тема.

Ваши данные остаются в браузере (localStorage). Аккаунт не нужен, и ничего не отправляется на сервер.

### Горячие клавиши

| Клавиша | Действие |
|---|---|
| `N` | Новая задача |
| `Ctrl/⌘ F` | Поиск |
| `Alt 1`–`Alt 6` | Переключить модуль |
| `Ctrl/⌘ Z` | Отменить, пока видно уведомление об отмене |
| `Esc` | Закрыть подробности задачи |
| `?` | Показать все горячие клавиши |

## Разработка

Требуется Node.js 24.

```sh
npm install
npm run dev        # dev server at http://localhost:5173
npm run lint       # oxlint
npm test           # unit tests (Vitest)
npx playwright install chromium
npm run e2e        # end-to-end tests (Playwright)
npm run build      # type check and production build into dist/
```

Сделано на React 19, TypeScript, Vite и date-fns.

## Развёртывание

Рабочая версия сайта размещена на Cloudflare Pages:

```sh
npm run build
npx wrangler pages deploy dist --project-name tickdone --branch main
```

## Участие в разработке

Issues и pull requests приветствуются. Сначала прочитайте [AGENTS.md](AGENTS.md): там описаны правила проекта (английский как рабочий язык, переводы на все поддерживаемые языки, адаптивная вёрстка, соглашения по анимации и перетаскиванию, а также CI, который должен пройти каждый PR).

## Лицензия

[MIT](LICENSE)
