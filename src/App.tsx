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
import { getData, getUI, setUI, toast, undoToast, useData, useUI, type Module } from './store'
import { taskIdFromHash, viewOfTask } from './taskLink'
import { usePhone } from './viewport'
import { startFeedSync } from './feeds'
import CalendarView from './views/CalendarView'
import MatrixView from './views/MatrixView'
import PomoView from './views/PomoView'
import HabitView from './views/HabitView'
import SearchView from './views/SearchView'

const RAIL: { id: Module; icon: string; title: MessageKey }[] = [
  { id: 'tasks', icon: 'check', title: 'common.module.tasks' },
  { id: 'calendar', icon: 'calendar', title: 'common.module.calendar' },
  { id: 'matrix', icon: 'matrix', title: 'common.module.matrix' },
  { id: 'pomo', icon: 'pomo', title: 'common.module.focus' },
  { id: 'habit', icon: 'habit', title: 'common.module.habits' },
  { id: 'search', icon: 'search', title: 'common.search' },
]
/** Phone bottom bar: every module except search (search lives at the top of the drawer). */
const TABS = RAIL.filter((r) => r.id !== 'search')

const THEME_COLOR = { light: '#ffffff', dark: '#1e1e1e' }

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

export default function App() {
  const ui = useUI()
  const data = useData()
  const phone = usePhone()
  const t = useT()

  // Subscribed calendars: show the cached copies and read them again when stale.
  useEffect(() => startFeedSync(), [])

  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[data.settings.theme] ?? THEME_COLOR.light)
  }, [data.settings.theme])

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

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z' && !typing && getToastUndo()) {
        e.preventDefault()
        undoToast()
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
      else if (e.key === 'Escape' && ui.selectedTaskId) closeDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui.selectedTaskId])

  return (
    <div className="app">
      {!phone && (
        <nav className="rail">
          <div className="rail-avatar" title="TickDone">T</div>
          {RAIL.map((r) => (
            <button key={r.id} className={'rail-btn' + (ui.module === r.id ? ' active' : '')} title={t(r.title)} onClick={() => openModule(r.id)}>
              <Icon name={r.icon} size={22} />
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <a className="rail-btn" href={GITHUB_URL} target="_blank" rel="noopener" title="GitHub" aria-label="GitHub">
            <Icon name="github" size={20} />
          </a>
          <button className="rail-btn" title={t('common.settings')} onClick={() => setUI({ dialog: { kind: 'settings' } })}>
            <Icon name="settings" size={22} />
          </button>
        </nav>
      )}

      {/* keyed by module so switching modules fades the new one in */}
      <div className="app-main" key={ui.module}>
        {ui.module === 'tasks' && (
          <>
            {!phone && !ui.sidebarHidden && <Sidebar />}
            <TaskListPane />
            <TaskDetail />
          </>
        )}
        {ui.module === 'calendar' && <CalendarView />}
        {ui.module === 'matrix' && <MatrixView />}
        {ui.module === 'pomo' && <PomoView />}
        {ui.module === 'habit' && <HabitView />}
        {ui.module === 'search' && <SearchView />}
      </div>

      {phone && (
        <nav className="tabbar">
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
      {ui.toast && (
        <div className="toast" key={ui.toast.id} role="status">
          <span>{ui.toast.text}</span>
          {ui.toast.undo && <button onClick={undoToast}>{t('common.undo')}</button>}
        </div>
      )}
    </div>
  )
}

function getToastUndo() {
  return !!document.querySelector('.toast button')
}
