import { useEffect } from 'react'
import './App.css'
import { Icon } from './components/Icon'
import { Dialogs } from './components/Dialogs'
import { ContextMenu } from './components/ContextMenu'
import { Drawer } from './components/Drawer'
import { Sidebar } from './components/Sidebar'
import { TaskListPane } from './components/TaskListPane'
import { closeDetail, TaskDetail } from './components/TaskDetail'
import { t as tr, useT, type MessageKey } from './i18n'
import { GITHUB_URL } from './links'
import { clearSelection, getData, getSelection, getUI, setUI, toast, useData, useUI, type Module } from './store'
import { escapeSelection } from './components/batchActions'
import { undoWithMotion } from './components/taskMotion'
import { isBatch } from './selection'
import { taskIdFromHash, viewOfTask } from './taskLink'
import { useMedia, usePhone } from './viewport'
import { applyLook, SYSTEM_DARK } from './look'
import { startFeedSync } from './feeds'
import { startReminders } from './reminders'
import { ReminderCards, UpdateToast } from './components/Reminders'
import CalendarView from './views/CalendarView'
import MatrixView from './views/MatrixView'
import PomoView from './views/PomoView'
import HabitView from './views/HabitView'
import SearchView from './views/SearchView'
import StatsView from './views/StatsView'

const RAIL: { id: Module; icon: string; title: MessageKey }[] = [
  { id: 'tasks', icon: 'check', title: 'common.module.tasks' },
  { id: 'calendar', icon: 'calendar', title: 'common.module.calendar' },
  { id: 'matrix', icon: 'matrix', title: 'common.module.matrix' },
  { id: 'pomo', icon: 'pomo', title: 'common.module.focus' },
  { id: 'habit', icon: 'habit', title: 'common.module.habits' },
  { id: 'stats', icon: 'stats', title: 'common.module.stats' },
  { id: 'search', icon: 'search', title: 'common.search' },
]
/** Phone bottom bar: every module except search (search lives at the top of the drawer). */
const TABS = RAIL.filter((r) => r.id !== 'search')


/** Opens the task named in the address bar (#task=<id>), if any, then removes it from the address. */
function openTaskFromHash() {
  const id = taskIdFromHash(location.hash)
  if (!id) return
  history.replaceState(null, '', location.pathname + location.search)
  const d = getData()
  const task = d.tasks.find((x) => x.id === id)
  if (!task) return toast(tr('shell.toast.taskNotFound'))
  setUI({ module: 'tasks', view: viewOfTask(task, d.lists.map((l) => l.id)), selectedTaskId: id, menu: undefined, dialog: undefined, drawerOpen: false })
}

const openModule = (id: Module) => setUI({ module: id, selectedTaskId: undefined })

/** The skip link: the keyboard goes to the content (the task list's first row, or the module itself). */
function skipToMain(e: React.MouseEvent) {
  e.preventDefault()
  const row = document.querySelector<HTMLElement>('.list-pane .task-row[tabindex="0"]')
  if (row) return row.focus()
  // the module itself takes the focus for the moment (it is not a tab stop, and clicks don't focus it)
  const main = document.getElementById('main')
  if (!main) return
  main.tabIndex = -1
  main.focus()
  main.addEventListener('blur', () => main.removeAttribute('tabindex'), { once: true })
}

export default function App() {
  const ui = useUI()
  const data = useData()
  const phone = usePhone()
  const t = useT()
  const openList = ui.view.startsWith('list:') ? data.lists.find((l) => 'list:' + l.id === ui.view) : undefined
  const timelineOpen = !phone && openList?.view === 'timeline' && !openList.archived

  // Subscribed calendars: show the cached copies and read them again when stale.
  useEffect(() => startFeedSync(), [])

  // Reminders fire while the app is open; ones missed while it was closed show as cards now.
  useEffect(() => startReminders(), [])

  // Theme and accent: applied without a reload, and following the device when the theme is "system".
  const systemDark = useMedia(SYSTEM_DARK)
  useEffect(() => applyLook(data.settings.theme, data.settings.accent, systemDark), [data.settings.theme, data.settings.accent, systemDark])

  // A task link (#task=<id>) opens that task, on load and when the address changes.
  useEffect(() => {
    openTaskFromHash()
    window.addEventListener('hashchange', openTaskFromHash)
    return () => window.removeEventListener('hashchange', openTaskFromHash)
  }, [])

  // The drawer belongs to the phone layout; picking a list or another module closes it.
  useEffect(() => {
    if (getUI().drawerOpen) setUI({ drawerOpen: false })
  }, [phone, ui.view, ui.module])

  // A selection belongs to one list: another list or module ends it.
  useEffect(() => {
    const u = getUI()
    if (u.selectMode || u.selectedIds.length) clearSelection(false)
  }, [ui.view, ui.module])

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z' && !typing && getToastUndo()) {
        e.preventDefault()
        undoWithMotion()
        return
      }
      if (typing) return
      if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setUI({ module: 'search' })
        return
      }
      if (mod) return
      if (e.altKey) {
        const n = Number(e.key)
        if (n >= 1 && n <= RAIL.length) setUI({ module: RAIL[n - 1].id })
        return
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        setUI({ module: 'tasks' })
        setTimeout(() => document.querySelector<HTMLInputElement>('.quick-add-input')?.focus(), 0)
      } else if (e.key === '?') setUI({ dialog: { kind: 'shortcuts' } })
      else if (e.key === 'Escape') {
        // a multi-selection or selection mode ends first; then the detail closes
        if (escapeSelection()) return
        if (ui.selectedTaskId) closeDetail()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui.selectedTaskId])

  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={skipToMain}>
        {t('misc.a11y.skipToContent')}
      </a>
      {!phone && (
        <nav className="rail" aria-label={t('misc.a11y.modules')}>
          <div className="rail-avatar" title="TickDone">T</div>
          {RAIL.map((r) => (
            <button key={r.id} className={'rail-btn' + (ui.module === r.id ? ' active' : '')} title={t(r.title)} aria-label={t(r.title)} aria-current={ui.module === r.id ? 'page' : undefined} onClick={() => openModule(r.id)}>
              <Icon name={r.icon} size={22} />
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <a className="rail-btn" href={GITHUB_URL} target="_blank" rel="noopener" title="GitHub" aria-label="GitHub">
            <Icon name="github" size={20} />
          </a>
          <button className="rail-btn" title={t('common.settings')} aria-label={t('common.settings')} onClick={() => setUI({ dialog: { kind: 'settings' } })}>
            <Icon name="settings" size={22} />
          </button>
        </nav>
      )}

      {/* keyed by module so switching modules fades the new one in */}
      <main className="app-main" key={ui.module} id="main" aria-label={t(RAIL.find((r) => r.id === ui.module)?.title ?? 'common.module.tasks')}>
        {/* every module but the task list (whose list name is its heading) is named by a heading for screen readers */}
        {ui.module !== 'tasks' && <h1 className="sr-only">{t(RAIL.find((r) => r.id === ui.module)?.title ?? 'common.module.tasks')}</h1>}
        {ui.module === 'tasks' && (
          <>
            {!phone && !ui.sidebarHidden && <Sidebar />}
            <TaskListPane />
            {/* the timeline needs the width: its task detail floats over it instead of taking a column */}
            <TaskDetail floating={timelineOpen} />
          </>
        )}
        {ui.module === 'calendar' && <CalendarView />}
        {ui.module === 'matrix' && <MatrixView />}
        {ui.module === 'pomo' && <PomoView />}
        {ui.module === 'habit' && <HabitView />}
        {ui.module === 'stats' && <StatsView />}
        {ui.module === 'search' && <SearchView />}
      </main>

      {/* in selection mode the action bar takes the tab bar's place */}
      {phone && !(ui.module === 'tasks' && isBatch(getSelection(ui))) && (
        <nav className="tabbar" aria-label={t('misc.a11y.modules')}>
          {TABS.map((r) => (
            <button key={r.id} className={'tabbar-btn' + (ui.module === r.id ? ' active' : '')} title={t(r.title)} aria-label={t(r.title)} aria-current={ui.module === r.id ? 'page' : undefined} onClick={() => openModule(r.id)}>
              <Icon name={r.icon} size={24} />
            </button>
          ))}
        </nav>
      )}
      {phone && <Drawer />}

      <ContextMenu />
      <Dialogs />
      <ReminderCards />
      <UpdateToast />
      {/* A live region that is always there, so screen readers announce each toast (drops, moves, undo) */}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        {ui.toast && (
          <div className="toast" key={ui.toast.id}>
            <span>{ui.toast.text}</span>
            {(ui.toast.undo || ui.toast.undoFn) && <button onClick={undoWithMotion}>{t('common.undo')}</button>}
          </div>
        )}
      </div>
    </div>
  )
}

function getToastUndo() {
  return !!document.querySelector('.toast button')
}
