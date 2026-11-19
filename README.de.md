<div align="center">

<a href="https://tickdone.pages.dev"><img src="public/favicon.svg" width="88" height="88" alt="TickDone-Logo"></a>

<h1>TickDone</h1>

<p><b>Plane deinen Tag, konzentriere dich aufs Wesentliche und bleib an guten Gewohnheiten dran – direkt im Browser.</b></p>

<p>
  <a href="https://github.com/suica/tickdone/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/suica/tickdone/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <a href="LICENSE"><img alt="MIT-Lizenz" src="https://img.shields.io/badge/Lizenz-MIT-4772fa?style=flat-square"></a>
  <a href="https://tickdone.pages.dev"><img alt="Live-Demo" src="https://img.shields.io/badge/Demo-tickdone.pages.dev-4772fa?style=flat-square"></a>
  <a href="#-sprachen"><img alt="10 Sprachen" src="https://img.shields.io/badge/i18n-10_Sprachen-7c5cff?style=flat-square"></a>
  <a href="#-mitwirken"><img alt="PRs willkommen" src="https://img.shields.io/badge/PRs-willkommen-2fbf71?style=flat-square"></a>
</p>

<p>
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

<a href="https://tickdone.pages.dev"><img src="docs/hero/hero.de.png" width="100%" alt="Illustration von TickDone auf einem Laptop und einem Smartphone: Aufgabenlisten, Aufgabendetails und ein Monatskalender"></a>

<p>
  <a href="https://tickdone.pages.dev"><b>App öffnen</b></a> ·
  <a href="#-funktionen"><b>Funktionen</b></a> ·
  <a href="#-schnellstart"><b>Schnellstart</b></a> ·
  <a href="#️-roadmap"><b>Roadmap</b></a> ·
  <a href="#-mitwirken"><b>Mitwirken</b></a>
</p>

</div>

TickDone ist eine kostenlose Open-Source-Aufgabenliste mit Zeitmanagement, die in deinem Browser läuft. Schreib Aufgaben einfach so auf, wie sie dir einfallen, plane sie im Kalender, ordne sie nach Dringlichkeit und Wichtigkeit, arbeite sie mit dem Fokus-Timer ab und bleib bei deinen Gewohnheiten – alles an einem Ort.

> [!NOTE]
> **Deine Daten bleiben bei dir.** Alles wird im lokalen Speicher deines Browsers gesichert: kein Konto, keine Anmeldung, und deine Aufgaben verlassen nie dein Gerät. Über den Server von TickDone läuft nur die Adresse eines abonnierten Kalenders: Ein kleiner Proxy ruft ihn für dich ab und speichert nichts. Eine Sicherungsdatei kannst du jederzeit in den Einstellungen exportieren.

## ✨ Funktionen

- ✅ **Aufgaben und Listen**: Heute, Morgen, Nächste 7 Tage und Eingang, dazu Erledigt, Verworfen und Papierkorb; eigene Listen, Ordner und Tags; Unteraufgaben, Notizen, Prioritäten, Fälligkeitsdatum und -uhrzeit, Erinnerungen und Wiederholungsregeln; Anheften und ein Kontextmenü für jede Aufgabe.
- ⚡ **Smarte Schnelleingabe**: Tippe `call mom tomorrow 3pm !high #family ~Personal`, und TickDone setzt Datum, Uhrzeit, Priorität, Tag und Liste und hebt jeden erkannten Teil schon beim Tippen hervor. Chinesisch versteht sie auch.
- 🗂️ **Listen- und Kanban-Ansicht** mit Gruppierung und Sortierung.
- 📏 **Zeitleistenansicht** für Listen: Aufgaben sind Balken über ihre Tage (eine Raute für einen einzelnen Tag), nach Abschnitten gruppiert, mit Heute-Linie und Zoom nach Tag, Woche und Monat. Zieh einen Balken, um ihn zu verschieben, seine Enden, um Start und Ende zu ändern, und Aufgaben ohne Datum aus dem Bereich „Ohne Datum“ hinein; alles lässt sich rückgängig machen. Auf dem Handy erscheint die Liste.
- 🗄️ **Archivierte Listen**: Erledigte Listen lassen sich über ihr Menü archivieren. Sie wandern in den eingeklappten Bereich „Archivierte Listen“, ihre Aufgaben verschwinden aus intelligenten Listen, Kalender, Matrix und Suche, und die Liste öffnet sich schreibgeschützt, bis du sie wiederherstellst.
- 🔎 **Gespeicherte Filter**: Kombiniere Listen, Tags, Prioritäten, Daten (überfällig, heute, diese Woche, ein eigener Zeitraum …), Stichwörter und erledigte Aufgaben zu einer eigenen intelligenten Liste, mit Name, Symbol und Farbe in der Seitenleiste.
- 📝 **Markdown in Notizen**: Überschriften, fett, kursiv, durchgestrichen, Code, Links, Listen, Zitate und Checklisten, die sich direkt in der Notiz abhaken lassen; `**fett**`, `# ` oder `- [ ] ` werden schon beim Tippen formatiert, gespeichert wird die Notiz weiter als Markdown.
- 🔁 **Wiederholungsregeln**: alle N Tage, Wochen, Monate oder Jahre; gewählte Wochentage; Tag N, der letzte Tag oder der N-te/letzte Wochentag im Monat; ein Datum jedes Jahr; nur Werktage. Endet nach N Malen oder an einem Datum, zählt ab Fälligkeit oder Erledigung, einzelne Termine lassen sich überspringen, und die Schnelleingabe versteht „every 2 weeks“.
- 📅 **Kalender** mit Monats-, Wochen-, Tages- und Listenansicht. Zieh eine Aufgabe auf einen anderen Tag oder eine andere Uhrzeit, oder zieh die Unterkante eines Blocks, um die Dauer zu ändern.
- 🗓️ **Im Kalender planen**: Ein Bereich „Ohne Datum“ neben der Wochen- und Tagesansicht (auf dem Handy ein Blatt am unteren Rand) zeigt die offenen Aufgaben ohne Datum, nach Liste gefiltert. Zieh eine auf einen Tag oder eine Uhrzeit, um sie einzuplanen, oder zurück in den Bereich, um das Datum zu entfernen – beides lässt sich in der Meldung rückgängig machen. Die Agenda-Ansicht zeigt die kommenden Tage in einer durchgehenden Liste mit deinen Aufgaben und den Terminen abonnierter Kalender.
- 🔔 **Kalenderabos**: Abonniere jeden Kalender mit einer iCal-Adresse (.ics oder webcal://), etwa für Arbeit, Schule, Team oder Feiertage, und sieh seine Termine schreibgeschützt und in eigener Farbe im Kalender. Sie aktualisieren sich von selbst und bleiben auch offline verfügbar.
- 🧭 **Eisenhower-Matrix**: Ordne Aufgaben nach Dringlichkeit und Wichtigkeit ein und zieh sie in einen anderen Quadranten, um ihre Priorität zu ändern.
- 🍅 **Fokus-Timer** mit Pomodoro- und Stoppuhr-Modus und einem Verlauf vergangener Sitzungen.
- 🔥 **Gewohnheitstracker** mit Check-ins, Serien und Statistiken.
- 📊 **Statistik**: erledigte Aufgaben pro Tag, Woche oder Monat, Erledigungsquote, überfällige Aufgaben, Aufteilung nach Liste, Priorität und Schlagwort sowie deine Serie; Fokuszeit pro Tag, Sitzungen, Zeit pro Aufgabe und Liste und deine beste Tageszeit; Check-in-Quote und Serien deiner Gewohnheiten. Wähle eine Woche, einen Monat, ein Jahr, die letzten 30 Tage oder einen eigenen Zeitraum, und fahre über ein Diagramm oder tippe darauf für Details.
- 🔍 **Suche** in Aufgaben, Tags und Listen.
- ↩️ **Rückgängig** über die Meldung, nachdem du eine Aufgabe erledigt, gelöscht oder verschoben hast.
- ⌨️ **Tastenkürzel**.
- 🎨 **Designs und Akzentfarben**: hell, dunkel oder wie das System, dazu acht Akzentfarben für Schaltflächen, Kontrollkästchen, Auswahl und Fokusrahmen. Änderungen wirken sofort, mit Live-Vorschau in den Einstellungen, und Startbildschirm und Tab-Symbol ziehen mit.
- ⏰ **Erinnerungen**: Zur Erinnerungszeit einer Aufgabe zeigt TickDone eine Karte zum Erledigen, Verschieben (5 Min., 15 Min., 1 Std., morgen) oder Öffnen und, wenn du es erlaubst, eine Systembenachrichtigung. TickDone hat keinen Server: Erinnerungen kommen, solange es in einem Tab geöffnet oder installiert ist und läuft; was fällig wurde, während es geschlossen war, erscheint beim nächsten Öffnen.
- 📲 **Als App installieren**: Füge TickDone unter Einstellungen → Über zum Startbildschirm oder Dock hinzu; nach dem ersten Besuch startet es auch offline. Gibt es eine neue Version, bietet ein Hinweis das Neuladen an.
- 💾 **Sichern und Wiederherstellen**: Exportiere alles als JSON-Datei und importiere sie später wieder.
- 🚀 **Schnell mit Tausenden Aufgaben**: Lange Listen und Suchergebnisse zeichnen nur die sichtbaren Zeilen, daher scrollt, wechselt und reagiert eine Liste mit 5.000 Aufgaben so schnell wie eine kurze, und Ziehen und Ablegen, die Tastatur, die Mehrfachauswahl und die Abhak-Animation funktionieren wie gewohnt. Änderungen werden im Hintergrund gespeichert.
- ♿ **Barrierefrei**: Alles geht mit der Tastatur, mit sichtbarem Fokusrahmen und einem Link zum Überspringen zum Inhalt; Dialoge, Menüs und Blätter halten den Fokus und geben ihn beim Schließen zurück; Screenreader bekommen Landmarken, Überschriften, benannte Schaltflächen und Kontrollkästchen, und jede Meldung wird angesagt. Aufgaben lassen sich mit Alt+↑ / Alt+↓ oder über ihr Menü verschieben, als Alternative zum Ziehen. Text erfüllt den WCAG-AA-Kontrast in Hell und Dunkel, und Modi mit hohem Kontrast sowie reduzierte Bewegung werden beachtet. Eine automatische Prüfung läuft über jeden Bildschirm.

## 📸 Screenshots

<table>
  <tr>
    <td colspan="2"><img src="docs/screenshots/de/desktop-tasks.png" alt="Aufgaben"></td>
  </tr>
  <tr>
    <th>Kalender</th>
    <th>Matrix</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/de/desktop-calendar.png" alt="Kalender"></td>
    <td><img src="docs/screenshots/de/desktop-matrix.png" alt="Matrix"></td>
  </tr>
  <tr>
    <th>Fokus</th>
    <th>Gewohnheiten</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/de/desktop-focus.png" alt="Fokus"></td>
    <td><img src="docs/screenshots/de/desktop-habits.png" alt="Gewohnheiten"></td>
  </tr>
</table>

<table>
  <tr>
    <td><img src="docs/screenshots/de/phone-tasks.png" alt="auf dem Handy: Aufgaben"></td>
    <td><img src="docs/screenshots/de/phone-calendar.png" alt="auf dem Handy: Kalender"></td>
    <td><img src="docs/screenshots/de/phone-matrix.png" alt="auf dem Handy: Matrix"></td>
    <td><img src="docs/screenshots/de/phone-focus.png" alt="auf dem Handy: Fokus"></td>
    <td><img src="docs/screenshots/de/phone-habits.png" alt="auf dem Handy: Gewohnheiten"></td>
  </tr>
</table>

## 🚀 Schnellstart

**Online nutzen:** Öffne [tickdone.pages.dev](https://tickdone.pages.dev). Es gibt nichts zu installieren.

**Lokal ausführen** (Node.js 24 erforderlich):

```sh
git clone https://github.com/suica/tickdone.git
cd tickdone
npm install
npm run dev        # http://localhost:5173
```

## ⌨️ Tastenkürzel

| Taste | Aktion |
|---|---|
| `N` | Neue Aufgabe |
| `Ctrl/⌘ F` | Suche |
| `Alt 1`–`Alt 6` | Modul wechseln |
| `Ctrl/⌘ Z` | Rückgängig, solange die Rückgängig-Meldung angezeigt wird |
| `Esc` | Auswahl aufheben oder Aufgabendetails schließen |
| `↑` `↓` / `J` `K` | Vorherige / nächste Aufgabe der Liste |
| `Shift ↑` `Shift ↓` | Auswahl erweitern |
| `Ctrl/⌘ Click` | Aufgabe zur Auswahl hinzufügen oder entfernen |
| `Shift Click` | Bereich von Aufgaben auswählen |
| `Ctrl/⌘ A` | Alle Aufgaben der Liste auswählen |
| `Enter` | Titel bearbeiten |
| `Space` / `Ctrl/⌘ Enter` | Erledigen oder wieder öffnen |
| `1` `2` `3` `4` | Priorität: hoch, mittel, niedrig, keine |
| `T` / `M` / `W` | Datum: heute, morgen, nächste Woche |
| `D` / `Shift D` | Datum wählen / Datum entfernen |
| `Delete` / `Backspace` | In den Papierkorb (rückgängig über die Meldung) |
| `?` | Alle Tastenkürzel anzeigen |

## 🌍 Sprachen

Diese README gibt es in 10 Sprachen: English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português (Brasil) und Русский. Die gesamte Oberfläche ist in dieselben 10 Sprachen übersetzt. TickDone folgt der Sprache deines Browsers, und du kannst sie jederzeit in den Einstellungen wechseln. Die Schnelleingabe versteht Datumsangaben auf Englisch oder Chinesisch und Prioritätswörter in allen 10 Sprachen.

Eine Übersetzung klingt holprig? Englisch ist die Ausgangssprache: Korrigiere den Text in `src/i18n/` oder in `README.<locale>.md` und öffne einen Pull Request.

## 🗺️ Roadmap

Jeder Punkt verlinkt auf sein Issue. Abgehakte Punkte sind auf [tickdone.pages.dev](https://tickdone.pages.dev) bereits live.

- [x] Aufgaben, Listen, Tags, Schnelleingabe, Kalender, Eisenhower-Matrix, Fokus-Timer und Gewohnheitstracker
- [x] CI mit Unit- und End-to-End-Tests ([#7](https://github.com/suica/tickdone/issues/7))
- [x] Open Source: README in 10 Sprachen, MIT-Lizenz, Projektregeln ([#10](https://github.com/suica/tickdone/issues/10))
- [x] Layouts für Smartphones, Tablets und große Bildschirme ([#8](https://github.com/suica/tickdone/issues/8))
- [x] Drag-and-drop überall ([#9](https://github.com/suica/tickdone/issues/9))
- [x] Animationen ([#3](https://github.com/suica/tickdone/issues/3))
- [x] GitHub-Link und Info-Bereich in der App ([#4](https://github.com/suica/tickdone/issues/4))
- [x] Oberfläche in 10 Sprachen ([#14](https://github.com/suica/tickdone/issues/14))
- [x] UI-Feinschliff, Bildschirm für Bildschirm ([#11](https://github.com/suica/tickdone/issues/11))
- [x] Mehrfachauswahl und Stapelbearbeitung ([#15](https://github.com/suica/tickdone/issues/15))
- [x] Tastaturnavigation in Aufgabenlisten ([#16](https://github.com/suica/tickdone/issues/16))
- [x] Benachrichtigungen für Erinnerungen ([#17](https://github.com/suica/tickdone/issues/17))
- [x] Als App installieren und offline nutzen ([#18](https://github.com/suica/tickdone/issues/18))
- [x] Gespeicherte Filter ([#19](https://github.com/suica/tickdone/issues/19))
- [x] Statistiken zu Aufgaben, Fokus-Timer und Gewohnheitstracker ([#20](https://github.com/suica/tickdone/issues/20))
- [x] Markdown in Aufgabennotizen ([#21](https://github.com/suica/tickdone/issues/21))
- [x] Zeitleistenansicht ([#22](https://github.com/suica/tickdone/issues/22))
- [x] Mehr Wiederholungsregeln ([#23](https://github.com/suica/tickdone/issues/23))
- [x] Listen archivieren ([#24](https://github.com/suica/tickdone/issues/24))
- [x] Barrierefreiheit ([#25](https://github.com/suica/tickdone/issues/25))
- [x] Schnell auch bei Tausenden von Aufgaben ([#26](https://github.com/suica/tickdone/issues/26))
- [x] Designs und Akzentfarben ([#27](https://github.com/suica/tickdone/issues/27))
- [x] Kalender: Aufgaben ohne Datum einplanen, Agenda-Ansicht ([#28](https://github.com/suica/tickdone/issues/28))
- [x] Kalenderabos ([#51](https://github.com/suica/tickdone/issues/51))

## 🧰 Technik

| Bereich | Gebaut mit |
|---|---|
| ⚛️ Oberfläche | React 19 und TypeScript |
| 📆 Datum | date-fns, neben React die einzige Laufzeitabhängigkeit |
| ⚡ Build | Vite |
| 💾 Speicher | `localStorage` im Browser, kein Backend |
| 🧪 Tests | Vitest (Unit-Tests) und Playwright (End-to-End-Tests) |
| 🧹 Lint | oxlint |
| ☁️ Hosting | Cloudflare Pages |

## 🛠️ Entwicklung

```sh
npm install
npm run dev        # dev server at http://localhost:5173
npm run lint       # oxlint
npm test           # unit tests (Vitest)
npx playwright install chromium
npm run e2e        # end-to-end tests (Playwright)
npm run build      # type check and production build into dist/
```

- 🖼️ Banner und Screenshots in den READMEs entstehen aus einem Produktions-Build: `npm run build`, danach `node scripts/promo/render.mjs` (die Optionen stehen oben im [Skript](scripts/promo/render.mjs)).
- 🗺️ `node scripts/roadmap.mjs done <issue>` hakt einen Roadmap-Punkt in allen READMEs ab.

## 🚢 Deployment

Die Live-Seite läuft auf Cloudflare Pages:

```sh
npm run build
npx wrangler pages deploy dist --project-name tickdone --branch main
```

## 🤝 Mitwirken

Issues und Pull Requests sind willkommen! Lies vorher bitte [AGENTS.md](AGENTS.md). Dort stehen die Projektregeln, für Menschen wie für Coding-Agents:

- 💬 Jede Änderung beginnt mit einem Issue und kommt über einen Pull Request, der darauf verweist.
- 🌐 Arbeitssprache ist Englisch, und jeder Text, den Nutzer sehen, wird in alle 10 Sprachen übersetzt.
- 📐 Jeder Bildschirm funktioniert in jeder Breite, vom 360-px-Smartphone bis zum 2560-px-Monitor, mit gemeinsamen Regeln für Animationen und Drag-and-drop.
- ✅ Die CI (Lint, Typprüfung und Build, Unit- und End-to-End-Tests) ist grün, bevor etwas gemergt wird.

Wenn dir TickDone hilft, Dinge zu erledigen, hilft ein ⭐ auf GitHub anderen, es zu finden.

## 📄 Lizenz

[MIT](LICENSE) © 2026 suica
