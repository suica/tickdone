import { useEffect } from 'react'
import './App.css'
import { Icon } from './components/Icon'
import { Dialogs } from './components/Dialogs'
import { ContextMenu } from './components/ContextMenu'
import { Sidebar } from './components/Sidebar'
import { TaskListPane } from './components/TaskListPane'
import { TaskDetail } from './components/TaskDetail'
import { setUI, undoToast, useData, useUI, type Module } from './store'
import CalendarView from './views/CalendarView'
import MatrixView from './views/MatrixView'
import PomoView from './views/PomoView'
import HabitView from './views/HabitView'
import SearchView from './views/SearchView'

const RAIL: { id: Module; icon: string; title: string }[] = [
  { id: 'tasks', icon: 'check', title: '任务' },
  { id: 'calendar', icon: 'calendar', title: '日历' },
  { id: 'matrix', icon: 'matrix', title: '四象限' },
  { id: 'pomo', icon: 'pomo', title: '番茄专注' },
  { id: 'habit', icon: 'habit', title: '习惯打卡' },
  { id: 'search', icon: 'search', title: '搜索' },
]

export default function App() {
  const ui = useUI()
  const data = useData()

  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme
  }, [data.settings.theme])

  // 全局快捷键
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
      else if (e.key === 'Escape' && ui.selectedTaskId) setUI({ selectedTaskId: undefined })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui.selectedTaskId])

  return (
    <div className="app">
      <nav className="rail">
        <div className="rail-avatar" title="TickDone">T</div>
        {RAIL.map((r) => (
          <button key={r.id} className={'rail-btn' + (ui.module === r.id ? ' active' : '')} title={r.title} onClick={() => setUI({ module: r.id })}>
            <Icon name={r.icon} size={22} />
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="rail-btn" title="设置" onClick={() => setUI({ dialog: { kind: 'settings' } })}>
          <Icon name="settings" size={22} />
        </button>
      </nav>

      {ui.module === 'tasks' && (
        <>
          {!ui.sidebarHidden && <Sidebar />}
          <TaskListPane />
          <TaskDetail />
        </>
      )}
      {ui.module === 'calendar' && <CalendarView />}
      {ui.module === 'matrix' && <MatrixView />}
      {ui.module === 'pomo' && <PomoView />}
      {ui.module === 'habit' && <HabitView />}
      {ui.module === 'search' && <SearchView />}

      <ContextMenu />
      <Dialogs />
      {ui.toast && (
        <div className="toast" key={ui.toast.id}>
          <span>{ui.toast.text}</span>
          {ui.toast.undo && <button onClick={undoToast}>撤销</button>}
        </div>
      )}
    </div>
  )
}

function getToastUndo() {
  return !!document.querySelector('.toast button')
}
