import { useMemo, useState, type DragEvent } from 'react'
import { addDays } from 'date-fns'
import { updateTask, useData, useUI } from '../store'
import { fmt, todayStr } from '../dates'
import { sortTasks } from '../views'
import type { Priority, Task } from '../types'
import { Icon } from '../components/Icon'
import { Popover, MenuList, anchorOf, type Anchor } from '../components/Popover'
import { TaskRow } from '../components/TaskRow'
import { QuickAdd } from '../components/QuickAdd'
import { TaskDetail } from '../components/TaskDetail'
import './matrix.css'

type Range = 'today' | 'week' | 'all'
const RANGE_NAME: Record<Range, string> = { today: '今天', week: '最近7天', all: '全部' }
const RANGE_KEY = 'tickdone:matrix-range'

const QUADS: { p: Priority; no: string; name: string; color: string }[] = [
  { p: 5, no: 'I', name: '重要且紧急', color: 'var(--p-high)' },
  { p: 3, no: 'II', name: '重要不紧急', color: 'var(--p-med)' },
  { p: 1, no: 'III', name: '不重要但紧急', color: 'var(--p-low)' },
  { p: 0, no: 'IV', name: '不重要不紧急', color: 'var(--q-none)' },
]

function loadRanges(): Record<number, Range> {
  try {
    const raw = localStorage.getItem(RANGE_KEY)
    if (raw) return { 5: 'all', 3: 'all', 1: 'all', 0: 'all', ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return { 5: 'all', 3: 'all', 1: 'all', 0: 'all' }
}

function inRange(t: Task, r: Range, today: string, week: string) {
  if (r === 'all') return true
  if (!t.dueDate) return false
  return r === 'today' ? t.dueDate <= today : t.dueDate <= week
}

export default function MatrixView() {
  const data = useData()
  const ui = useUI()
  const [ranges, setRanges] = useState<Record<number, Range>>(loadRanges)
  const [menu, setMenu] = useState<{ p: Priority; anchor: Anchor } | null>(null)
  const [over, setOver] = useState<Priority | null>(null)

  const setRange = (p: Priority, r: Range) => {
    const next = { ...ranges, [p]: r }
    setRanges(next)
    try {
      localStorage.setItem(RANGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  const byQuad = useMemo(() => {
    const today = todayStr()
    const week = fmt(addDays(new Date(), 6))
    const live = data.tasks.filter((t) => !t.deleted && t.status === 0 && !t.parentId)
    const m: Record<number, Task[]> = {}
    for (const q of QUADS) m[q.p] = sortTasks(live.filter((t) => t.priority === q.p && inRange(t, ranges[q.p], today, week)), 'date')
    return m
  }, [data.tasks, ranges])

  const onDragOver = (e: DragEvent, p: Priority) => {
    if (!e.dataTransfer.types.includes('text/task-id')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (over !== p) setOver(p)
  }
  const onDragLeave = (e: DragEvent, p: Priority) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    if (over === p) setOver(null)
  }
  const onDrop = (e: DragEvent, p: Priority) => {
    e.preventDefault()
    setOver(null)
    const id = e.dataTransfer.getData('text/task-id')
    const t = data.tasks.find((x) => x.id === id)
    if (t && t.priority !== p) updateTask(id, { priority: p })
  }

  return (
    <div className="module matrix-module">
      <div className="matrix-main">
        <div className="matrix-head">
          <h1>四象限</h1>
        </div>
        <div className="matrix-grid">
          {QUADS.map((q) => {
            const tasks = byQuad[q.p]
            return (
              <section
                key={q.p}
                className={'matrix-quad' + (over === q.p ? ' drag-over' : '')}
                style={{ ['--q' as string]: q.color }}
                onDragOver={(e) => onDragOver(e, q.p)}
                onDragLeave={(e) => onDragLeave(e, q.p)}
                onDrop={(e) => onDrop(e, q.p)}
              >
                <header className="matrix-quad-head">
                  <span className="matrix-no">{q.no}</span>
                  <span className="matrix-name">{q.name}</span>
                  {ranges[q.p] !== 'all' && <span className="matrix-range">{RANGE_NAME[ranges[q.p]]}</span>}
                  <span className="matrix-count">{tasks.length || ''}</span>
                  <button
                    className="icon-btn matrix-more"
                    title="更多"
                    onClick={(e) => setMenu({ p: q.p, anchor: anchorOf(e.currentTarget) })}
                  >
                    <Icon name="more" size={16} />
                  </button>
                </header>
                <div className="matrix-body">
                  {tasks.length === 0 ? (
                    <div className="matrix-empty">没有任务</div>
                  ) : (
                    tasks.map((t) => <TaskRow key={t.id} task={t} showList />)
                  )}
                </div>
                <div className="matrix-add">
                  <QuickAdd defaults={{ priority: q.p }} placeholder={`添加任务至「${q.name}」`} compact />
                </div>
              </section>
            )
          })}
        </div>
      </div>
      {menu && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)}>
          <MenuList
            onClose={() => setMenu(null)}
            items={[
              { label: '显示范围', disabled: true },
              ...(['today', 'week', 'all'] as Range[]).map((r) => ({
                label: RANGE_NAME[r],
                icon: <Icon name={r === 'today' ? 'today' : r === 'week' ? 'week' : 'inbox'} size={16} />,
                checked: ranges[menu.p] === r,
                onClick: () => setRange(menu.p, r),
              })),
            ]}
          />
        </Popover>
      )}
      {ui.selectedTaskId && <TaskDetail floating />}
    </div>
  )
}
