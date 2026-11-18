# TickDone project rules

These rules apply to everyone working on this repository, people and coding agents alike.

## Product

- TickDone is an original work. Do not name, reference or compare with other to-do apps, and do not use their names, logos, icons, images or copy, anywhere in the repository: code, comments, tests, commit messages, issues, pull requests, docs and file names.
- All data lives in the browser (localStorage). There is no backend and no account.

## Language

- **English is the working language.** Identifiers, comments, commit messages, issues, pull requests and docs are written in English.
- **Every user-facing string is translated.** Supported languages: English (`en`, the source and default), Simplified Chinese (`zh-CN`), Traditional Chinese (`zh-TW`), Japanese (`ja`), Korean (`ko`), Spanish (`es`), French (`fr`), German (`de`), Brazilian Portuguese (`pt-BR`) and Russian (`ru`).
  - UI text goes through the i18n layer (`t()`); English messages are the source of truth. A change that adds or edits a string updates every locale in the same pull request; the type checker and unit tests fail when a locale is missing a key. (The existing UI is being moved onto this layer in #14.)
  - Dates, weekdays, months and counts are formatted for the active locale, never hard-coded.
- **The README exists in every supported language.** `README.md` is the English source; `README.<locale>.md` are the translations, all linked from the language bar at the top. A pull request that changes the README updates all of them.

## UI

- **Responsive.** Every screen works at 360, 390, 768, 1024, 1440, 1920 and 2560 px wide. Breakpoints: phone ≤767px, tablet 768–1199px, desktop ≥1200px, large ≥1920px (`src/viewport.ts`, same values in CSS). No horizontal page scroll and nothing sticking out of the viewport (`e2e/layout.spec.ts`); closed drawers and sheets are `inert`. Touch targets are at least 40 px on touch screens.
- **Motion.** Use the tokens in `src/index.css` (`--ease-out`, `--ease-in-out`, `--ease-spring`, `--dur-fast`, `--dur`, `--dur-slow`). Animate `transform` and `opacity`. Respect `prefers-reduced-motion` (the tokens drop to 0; check it before JS animations).
- **Drag and drop.** Pointer Events, so it works with mouse and touch: start after 4 px of mouse movement or a 350 ms long press on touch; lift the dragged item, show where it will land, auto-scroll near container edges, and cancel with Esc. Drops that change data can be undone from the toast.
- **Dependencies.** No new runtime dependency without agreeing on it in an issue first.

## Workflow

- Every change starts from an issue and lands through a pull request that references it.
- CI (lint, type check and build, unit tests, end-to-end tests) must be green before merging.
- Pull requests that change the UI include screenshots at phone and desktop sizes (before and after for changes to existing screens).
- After merging to `main`, deploy: `npm run build && npx wrangler pages deploy dist --project-name tickdone --branch main`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run lint` | oxlint |
| `npm test` | Unit tests (Vitest, `src/**/*.test.ts`) |
| `npm run e2e` | End-to-end tests (Playwright, `e2e/`); `PW_CHROMIUM_PATH` uses an installed Chromium |
| `npm run build` | Type check and production build into `dist/` |
