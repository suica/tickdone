<p align="center"><img src="public/favicon.svg" width="72" height="72" alt="TickDone"></p>

<h1 align="center">TickDone</h1>

<p align="center">To-do-Liste und Zeitmanagement-Tool, das in deinem Browser läuft: Aufgaben, Kalender, Eisenhower-Matrix, Fokus-Timer und Gewohnheitstracker.</p>

<p align="center"><a href="https://tickdone.pages.dev"><b>TickDone öffnen → tickdone.pages.dev</b></a></p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.zh-TW.md">繁體中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <b>Deutsch</b> ·
  <a href="README.pt-BR.md">Português (Brasil)</a> ·
  <a href="README.ru.md">Русский</a>
</p>

![Aufgaben mit geöffnetem Detailbereich](docs/screenshots/desktop-tasks.png)

| Kalender | Eisenhower-Matrix |
|---|---|
| ![Kalender](docs/screenshots/desktop-calendar.png) | ![Eisenhower-Matrix](docs/screenshots/desktop-matrix.png) |
| **Fokus-Timer** | **Gewohnheitstracker** |
| ![Fokus-Timer](docs/screenshots/desktop-pomo.png) | ![Gewohnheitstracker](docs/screenshots/desktop-habit.png) |

## Funktionen

- **Aufgaben**: Eingang, Heute, Morgen, Nächste 7 Tage, Alle, Erledigt, Verworfen und Papierkorb; eigene Listen, Ordner und Tags; Unteraufgaben, Notizen, Prioritäten, Fälligkeitsdatum und -uhrzeit, Erinnerungen und Wiederholungsregeln; Anheften; ein Kontextmenü für jede Aufgabe; Rückgängigmachen nach dem Erledigen oder Löschen.
- **Schnelleingabe**, die versteht, was du tippst, und es hervorhebt: `call mom tomorrow 3pm !high #family ~Personal` setzt Datum, Uhrzeit, Priorität, Tag und Liste in einer Zeile.
- **Listen- und Kanban-Ansicht** mit Gruppierung und Sortierung.
- **Kalender** mit Monats-, Wochen- und Tagesansicht.
- **Eisenhower-Matrix**, um Aufgaben nach Dringlichkeit und Wichtigkeit einzuordnen.
- **Fokus-Timer** mit Pomodoro- und Stoppuhr-Modus und einem Verlauf vergangener Sitzungen.
- **Gewohnheitstracker** mit Check-ins, Serien und Statistiken.
- **Suche**, Tastenkürzel und dunkles Design.

Deine Daten bleiben in deinem Browser (localStorage). Es gibt kein Konto, und nichts wird an einen Server gesendet.

### Tastenkürzel

| Taste | Aktion |
|---|---|
| `N` | Neue Aufgabe |
| `Ctrl/⌘ F` | Suche |
| `Alt 1`–`Alt 6` | Modul wechseln |
| `Ctrl/⌘ Z` | Rückgängig, solange die Rückgängig-Meldung angezeigt wird |
| `Esc` | Aufgabendetails schließen |
| `?` | Alle Tastenkürzel anzeigen |

## Entwicklung

Benötigt Node.js 24.

```sh
npm install
npm run dev        # dev server at http://localhost:5173
npm run lint       # oxlint
npm test           # unit tests (Vitest)
npx playwright install chromium
npm run e2e        # end-to-end tests (Playwright)
npm run build      # type check and production build into dist/
```

Gebaut mit React 19, TypeScript, Vite und date-fns.

## Deployment

Die Live-Seite läuft auf Cloudflare Pages:

```sh
npm run build
npx wrangler pages deploy dist --project-name tickdone --branch main
```

## Mitwirken

Issues und Pull Requests sind willkommen. Bitte lies zuerst [AGENTS.md](AGENTS.md): Dort stehen die Projektregeln (Englisch als Arbeitssprache, Übersetzungen für alle unterstützten Sprachen, responsive Layouts, Konventionen für Animationen und Drag-and-drop sowie die CI, die jeder PR bestehen muss).

## Lizenz

[MIT](LICENSE)
