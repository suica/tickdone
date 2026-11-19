# Motion

Every animation in TickDone, what starts it, what moves, and how long and with which curve it runs. The durations and
curves are the tokens in `src/index.css`:

| Token | Value | | Token | Value |
|---|---|---|---|---|
| `--dur-fast` | 120 ms | | `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--dur` | 200 ms | | `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` |
| `--dur-slow` | 320 ms | | `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoots: a slight bounce) |

With `prefers-reduced-motion: reduce` the duration tokens drop to 0, and the JavaScript animations (`src/components/motion.ts`,
`src/components/taskMotion.ts`, `src/views/calMotion.ts`) check `reducedMotion()` and do not run. Only `transform` and
`opacity` move, plus a few properties that cannot be drawn otherwise (a ring's stroke, a group's height while it folds).

"CSS" is a keyframe animation or a transition in the named style sheet; "JS" is the Web Animations API. A multiple such as
"`--dur-slow` × 1.5" is computed from the token at run time, so it also drops to 0.

## Tasks

| Trigger | What moves | Duration | Easing | Where |
|---|---|---|---|---|
| Tick a task's checkbox | The box fills with the priority colour and pops | `--dur` | `--ease-spring` | CSS `td-cb-fill`, `td-cb-pop`, `tasks.css` |
| | The check mark draws in | `--dur` (50 ms delay) | `--ease-out` | CSS `td-tick` |
| | A ring and a few sparks burst from the box | `--dur-slow` | `--ease-out` | CSS `td-ring`, `td-spark` |
| | The title is struck through | `--dur-slow` | `--ease-in-out` | CSS `td-strike` |
| | The row lifts and moves into the Completed group; the rows around it glide | `--dur-slow` | `--ease-out` | JS `flipChange`, `taskMotion.ts` |
| | With completed tasks hidden, the row folds away | `--dur` | `--ease-in-out` | JS `collapseEl` |
| Untick a completed task | Fill, check mark and strike-through run backwards; the row moves back up | `--dur` / `--dur-fast` | `--ease-in-out` | CSS `td-cb-unpop`, reversed `td-cb-fill`, `td-tick`, `td-strike` |
| Add a task (quick add) | The new row opens and slides down from the top | `--dur` | `--ease-out` | JS `expandEl` |
| Delete or move a task away | The row folds to nothing | `--dur` | `--ease-in-out` | JS `collapseEl` |
| Drop a dragged row; move with Alt+↑/↓ | The other rows glide to their new places (FLIP) | `--dur` | `--ease-out` | JS `flip`, `taskMotion.ts` |
| Fold or unfold a group | The chevron turns; the group's height eases | `--dur` | `--ease-out` | CSS transitions, `tasks.css` |
| Switch the list's view (list, kanban, timeline) | The view fades in | `--dur` | `--ease-out` | CSS `td-view-in` |
| Open a task's detail (tablet, or a narrow window) | The detail slides in from the right | `--dur-slow` | `--ease-out` | CSS `detail-in`, `detail.css` |
| Pick another task in the open detail | The content swaps with a short fade | `--dur` | `--ease-out` | CSS `detail-swap` |
| Open a task on a phone | The bottom sheet slides up over a fading mask; dragging its grip down closes it | `--dur-slow` | `--ease-out` | CSS `sheet-up`, `detail-fade` |
| Tap the round "+" on a phone | The button pops in; the input sheet slides up | `--dur-slow` / `--dur` | `--ease-spring` / `--ease-out` | CSS `td-fab-in`, `td-sheet-in`, `td-fade` |
| Select several tasks | The batch bar slides in | `--dur` | `--ease-out` | CSS `batch-bar-in`, `batch-in` |

## Shell

| Trigger | What moves | Duration | Easing | Where |
|---|---|---|---|---|
| Open a popover or menu | It scales up and fades in from the corner next to its trigger | `--dur` | `--ease-out` | CSS `pop-in`, `index.css` (`Popover` sets `transform-origin`) |
| Open a popover or menu on a phone | A bottom sheet slides up over a fading mask; it can be dragged down to close | `--dur-slow` | `--ease-out` | CSS `sheet-in`, `fade` |
| Open the drawer on a phone (menu button or edge swipe) | The drawer slides in; the mask fades | `--dur-slow` | `--ease-out` | CSS transitions, `App.css` |
| Switch module (rail or tab bar) | The module fades in; the tab icon gives a small spring | `--dur` | `--ease-out` / `--ease-spring` | CSS `module-in`, transitions in `App.css` |
| A toast appears (undo, moved, …) | It slides up from the bottom | `--dur-slow` | `--ease-spring` | CSS `toast-in`, `index.css` |
| Open a dialog (settings, list, filter, habit) | The mask fades; the dialog scales and fades in. Closing runs both backwards | `--dur` | `--ease-out` (in), `--ease-in-out` (out) | CSS `dlg-fade-in`, `dlg-in`, `dlg-out`, `dialogs.css` |
| Open a dialog on a phone | A full-screen sheet slides up; settings pages slide sideways | `--dur-slow` | `--ease-out` | CSS `dlg-sheet-in`, `dlg-page-in`, `dlg-home-in` |
| Type in search | Result groups and hits fade and rise in, one after another | `--dur-slow` (staggered) | `--ease-out` | CSS `search-in`, `search.css` |
| A reminder comes due | The reminder card slides in | `--dur-slow` | `--ease-out` | CSS `rem-in`, `reminders.css` |

## Calendar, matrix, habits, focus, statistics

| Trigger | What moves | Duration | Easing | Where |
|---|---|---|---|---|
| Previous / next month, week or day; swipe | The old period slides out and fades to one side (× 0.75), the new one slides in from the other | `--dur-slow` | `--ease-out` | JS `calMotion.ts` |
| Previous / next week of the habit strip | The weeks slide sideways | `--dur-slow` | `--ease-out` | CSS `slide-in-*`, `slide-out-*`, `motion.css` (`SlideSwap`) |
| Pick up a task in the calendar | It lifts | `--dur-fast` | `--ease-out` | CSS `cal-lift` |
| Drop a task on a day or time; create one by drawing | The block unfolds from the top; a bar pops in | `--dur-slow` / `--dur` | `--ease-out` | CSS `cal-expand`, `cal-pop`; JS `flyFrom` |
| Open the Unscheduled panel | It slides in | `--dur` | `--ease-out` | CSS `cal-unsched-in` |
| Check in a habit | The ring fills, the check mark draws, the button bounces and particles burst | `--dur` / `--dur-slow`; bounce `--dur-slow` × 1.5 | `--ease-out`, fill `--ease-spring` | CSS transitions, `habit.css`; JS `bounce`, `burst`, `motion.ts` |
| | The streak and total counters roll up (down when undone) | `--dur-slow` | `--ease-spring` (up), `--ease-out` (down) | CSS `num-roll-up`, `num-roll-down`, `NumberRoll` |
| Open a habit's detail | It slides in; closing runs backwards | `--dur-slow` / `--dur` | `--ease-out` / `--ease-in-out` | CSS `habit-detail-in`, `habit-detail-out` |
| Focus timer running | The progress ring moves every frame (no steps) | continuous | linear | JS `requestAnimationFrame`, `PomoView.tsx` |
| Start / pause | The play triangle morphs into pause bars; the secondary button and the label slide in | `--dur` / `--dur-slow` | `--ease-out` | CSS transitions, `pomo-btn-in`, `pomo-label-in`, `pomo.css` |
| A focus session ends | The ring stays full, swells and glows, confetti flies out, then the ring rewinds | `--dur-slow` × 3 to × 5 | `--ease-out`, rewind `--ease-in-out` | JS in `PomoView.tsx`, `burst` |
| Open statistics; change the range | Cards rise in; bars and rings grow from zero | `--dur-slow` | `--ease-out` | CSS `stats-rise`, `stats-grow`, `stats-fill`, `stats-spin-in` |
| Point at or tap a chart | The tooltip fades in | `--dur-fast` | `--ease-out` | CSS `stats-tip-in` |
| Timeline: drop a bar, open the No date panel | The bar pops; the panel slides in | `--dur-fast` / `--dur` | `--ease-out` | CSS `tl-pop`, `tl-panel`, `timeline.css` |

The launch screen (`launch-pop`, `launch-draw`, `launch-rise` in `index.html`) plays once while the app loads and is
skipped quickly with reduced motion.
