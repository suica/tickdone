import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import './calendar.css'
import { getUI, setUI, toggleTask, updateTask, useData, useUI } from '../store'
import { fmt, todayStr, weekdayName } from '../dates'
import type { Task } from '../types'
import { Icon } from '../components/Icon'
import { Popover, type Anchor } from '../components/Popover'
import { QuickAdd } from '../components/QuickAdd'
import { TaskDetail } from '../components/TaskDetail'
import { TaskRow } from '../components/TaskRow'

type Mode = 'month' | 'week' | 'day' | 'agenda'
const MODES: { id: Mode; label: string }[] = [
  { id: 'month', label: '月' },
  { id: 'week', label: '周' },
  { id: 'day', label: '日' },
  { id: 'agenda', label: '列表' },
]
const MODE_KEY = 'tickdone:cal:mode'
const DND = 'application/x-tickdone-task'
const HOUR_H = 48
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

const toMin = (hm: string) => {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + (m || 0)
}
const toHM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

function loadMode(): Mode {
  try {
    const m = localStorage.getItem(MODE_KEY) as Mode | null
    if (m && MODES.some((x) => x.id === m)) return m
  } catch {
    /* ignore */
  }
  return 'month'
}

/** 当天排序：未完成在前 → 有时间的按时间 → 优先级高在前 → 自定义顺序 */
function sortDay(a: Task, b: Task) {
  const da = a.status === 0 ? 0 : 1
  const db = b.status === 0 ? 0 : 1
  if (da !== db) return da - db
  if (!!a.dueTime !== !!b.dueTime) return a.dueTime ? -1 : 1
  if (a.dueTime && b.dueTime && a.dueTime !== b.dueTime) return a.dueTime < b.dueTime ? -1 : 1
  if (a.priority !== b.priority) return b.priority - a.priority
  return a.order - b.order
}

// ---------------- 拖拽共享状态 ----------------
let grabOffsetY = 0
const ROW_DND = 'text/task-id' // TaskRow 使用的拖拽类型
const hasTask = (e: DragEvent) => e.dataTransfer.types.includes(DND) || e.dataTransfer.types.includes(ROW_DND)
const dragId = (e: DragEvent) => e.dataTransfer.getData(DND) || e.dataTransfer.getData(ROW_DND)

function useColorOf() {
  const data = useData()
  return useMemo(() => {
    const m = new Map(data.lists.map((l) => [l.id, l.color]))
    return (t: Task) => m.get(t.listId) || 'var(--primary)'
  }, [data.lists])
}

// ---------------- 任务条 ----------------
function CalTask({ task, color, showTime, block, onDragEnd }: { task: Task; color: string; showTime?: boolean; block?: boolean; onDragEnd?: () => void }) {
  const ui = useUI()
  const done = task.status !== 0
  return (
    <div
      className={'cal-task' + (done ? ' done' : '') + (block ? ' block' : '') + (ui.selectedTaskId === task.id ? ' selected' : '')}
      style={{ '--c': color } as CSSProperties}
      draggable
      title={task.title}
      onDragStart={(e) => {
        e.dataTransfer.setData(DND, task.id)
        e.dataTransfer.setData('text/plain', task.title)
        e.dataTransfer.effectAllowed = 'move'
        grabOffsetY = block ? e.clientY - e.currentTarget.getBoundingClientRect().top : 0
      }}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        e.stopPropagation()
        setUI({ selectedTaskId: task.id })
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <span
        className={'cal-cb' + (done ? ' checked' : '')}
        onClick={(e) => {
          e.stopPropagation()
          toggleTask(task.id)
        }}
        title={done ? '标记为未完成' : '完成'}
      >
        {done && <Icon name="check" size={9} stroke={3} />}
      </span>
      {showTime && task.dueTime && <span className="cal-task-time">{task.dueTime}</span>}
      <span className="cal-task-title">{task.title || '无标题'}</span>
      {block && task.dueTime && <span className="cal-task-range">{task.dueTime} - {toHM(Math.min(toMin(task.dueTime) + 60, 24 * 60 - 1))}</span>}
    </div>
  )
}

// ---------------- 快速新建浮层 ----------------
interface AddState {
  anchor: Anchor
  date: string
  time?: string
}
function AddPopover({ s, onClose }: { s: AddState; onClose: () => void }) {
  const d = parseISO(s.date)
  return (
    <Popover anchor={s.anchor} onClose={onClose} width={300} className="cal-add-pop">
      <div>
        <div className="cal-add-head">
          {format(d, 'M月d日')} {weekdayName(d)}
          {s.time && ` ${s.time}`}
        </div>
        <QuickAdd
          compact
          autoFocus
          onCancel={onClose}
          placeholder="准备做什么？回车保存"
          defaults={s.time ? { dueDate: s.date, dueTime: s.time } : { dueDate: s.date }}
          onAdded={onClose}
        />
      </div>
    </Popover>
  )
}

// ---------------- 月视图 ----------------
function MonthView({ cursor, byDay, weekStartsOn, onAdd }: { cursor: Date; byDay: Map<string, Task[]>; weekStartsOn: 0 | 1; onAdd: (s: AddState) => void }) {
  const colorOf = useColorOf()
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor), { weekStartsOn }), end: endOfWeek(endOfMonth(cursor), { weekStartsOn }) })
  const rows = days.length / 7
  const gridRef = useRef<HTMLDivElement>(null)
  const [rowH, setRowH] = useState(110)
  const [over, setOver] = useState<string | null>(null)
  const [more, setMore] = useState<{ date: string; anchor: Anchor } | null>(null)
  const today = todayStr()

  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setRowH(el.clientHeight / rows))
    ro.observe(el)
    return () => ro.disconnect()
  }, [rows])
  const fit = Math.max(1, Math.floor((rowH - 30) / 21))

  return (
    <div className="cal-month">
      <div className="cal-weekhead">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i}>周{WEEK_CN[(i + weekStartsOn) % 7]}</div>
        ))}
      </div>
      <div className="cal-grid" ref={gridRef} style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {days.map((d) => {
          const ds = fmt(d)
          const list = byDay.get(ds) ?? []
          const overflow = list.length > fit
          const shown = overflow ? list.slice(0, fit - 1) : list
          const dow = d.getDay()
          return (
            <div
              key={ds}
              className={
                'cal-cell' +
                (isSameMonth(d, cursor) ? '' : ' other') +
                (ds === today ? ' today' : '') +
                (dow === 0 || dow === 6 ? ' weekend' : '') +
                (over === ds ? ' drag-over' : '')
              }
              onClick={(e) => {
                if (getSelected()) return setUI({ selectedTaskId: undefined })
                onAdd({ date: ds, anchor: { x: e.clientX, y: e.clientY + 4, h: 8 } })
              }}
              onDragOver={(e) => {
                if (!hasTask(e)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (over !== ds) setOver(ds)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === ds ? null : o))
              }}
              onDrop={(e) => {
                const id = dragId(e)
                setOver(null)
                if (id) {
                  e.preventDefault()
                  updateTask(id, { dueDate: ds })
                }
              }}
            >
              <div className="cal-cell-head">
                <span className="cal-daynum">{d.getDate() === 1 && !isSameMonth(d, cursor) ? format(d, 'M月d日') : d.getDate()}</span>
              </div>
              <div className="cal-cell-items">
                {shown.map((t) => (
                  <CalTask key={t.id} task={t} color={colorOf(t)} showTime />
                ))}
                {overflow && (
                  <button
                    className="cal-more"
                    onClick={(e) => {
                      e.stopPropagation()
                      const r = e.currentTarget.closest('.cal-cell')!.getBoundingClientRect()
                      setMore({ date: ds, anchor: { x: r.left - 1, y: r.top - 1, h: 0 } })
                    }}
                  >
                    +{list.length - shown.length}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {more && (
        <Popover anchor={more.anchor} onClose={() => setMore(null)} width={240} className="cal-more-pop">
          <div className="cal-more-head">
            <span>
              {format(parseISO(more.date), 'M月d日')} {weekdayName(parseISO(more.date))}
            </span>
            <button className="icon-btn" onClick={() => setMore(null)}>
              <Icon name="close" size={14} />
            </button>
          </div>
          <div className="cal-more-list">
            {(byDay.get(more.date) ?? []).map((t) => (
              <CalTask key={t.id} task={t} color={colorOf(t)} showTime onDragEnd={() => setMore(null)} />
            ))}
          </div>
        </Popover>
      )}
    </div>
  )
}

const getSelected = () => getUI().selectedTaskId

// ---------------- 周 / 日视图 ----------------
interface Placed {
  t: Task
  s: number
  e: number
  col: number
  cols: number
}
function layoutDay(tasks: Task[]): Placed[] {
  const items: Placed[] = tasks
    .filter((t) => t.dueTime)
    .map((t) => {
      const s = toMin(t.dueTime!)
      return { t, s, e: Math.min(s + 60, 24 * 60), col: 0, cols: 1 }
    })
    .sort((a, b) => a.s - b.s || a.e - b.e)
  let cluster: Placed[] = []
  let ends: number[] = []
  let clusterEnd = -1
  const flush = () => {
    cluster.forEach((p) => (p.cols = ends.length))
    cluster = []
    ends = []
  }
  for (const p of items) {
    if (p.s >= clusterEnd) {
      flush()
      clusterEnd = p.e
    } else clusterEnd = Math.max(clusterEnd, p.e)
    let c = ends.findIndex((e) => e <= p.s)
    if (c < 0) {
      c = ends.length
      ends.push(p.e)
    } else ends[c] = p.e
    p.col = c
    cluster.push(p)
  }
  flush()
  return items
}

function TimeGrid({ days, byDay, onAdd }: { days: Date[]; byDay: Map<string, Task[]>; onAdd: (s: AddState) => void }) {
  const colorOf = useColorOf()
  const today = todayStr()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  // 初次进入滚动到当前时间附近（或 8 点）
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const h = days.some((d) => fmt(d) === today) ? Math.max(0, new Date().getHours() - 2) : 8
    el.scrollTop = h * HOUR_H
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length])
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`

  const dropProps = (key: string, patch: (e: DragEvent<HTMLDivElement>) => Partial<Task>) => ({
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      if (!hasTask(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (over !== key) setOver(key)
    },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === key ? null : o))
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      const id = dragId(e)
      setOver(null)
      if (id) {
        e.preventDefault()
        updateTask(id, patch(e))
      }
    },
  })
  const minuteAt = (e: { clientY: number; currentTarget: HTMLElement }, offset = 0, step = 15) => {
    const r = e.currentTarget.getBoundingClientRect()
    const m = Math.round((((e.clientY - offset - r.top) / HOUR_H) * 60) / step) * step
    return Math.max(0, Math.min(24 * 60 - step, m))
  }
  const blankClick = (fn: () => void) => () => {
    if (getSelected()) return setUI({ selectedTaskId: undefined })
    fn()
  }

  return (
    <div className={'cal-time' + (days.length === 1 ? ' single' : '')}>
      <div className="cal-time-head" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => {
          const ds = fmt(d)
          return (
            <div key={ds} className={'cal-time-day' + (ds === today ? ' today' : '')}>
              <span className="wd">{weekdayName(d)}</span>
              <span className="num">{d.getDate()}</span>
            </div>
          )
        })}
      </div>
      <div className="cal-allday" style={{ gridTemplateColumns: cols }}>
        <div className="cal-allday-label">全天</div>
        {days.map((d) => {
          const ds = fmt(d)
          const list = (byDay.get(ds) ?? []).filter((t) => !t.dueTime)
          return (
            <div
              key={ds}
              className={'cal-allday-cell' + (over === 'a' + ds ? ' drag-over' : '')}
              onClick={(e) => blankClick(() => onAdd({ date: ds, anchor: { x: e.clientX, y: e.clientY + 4, h: 8 } }))()}
              {...dropProps('a' + ds, () => ({ dueDate: ds, dueTime: undefined, reminder: undefined }))}
            >
              {list.map((t) => (
                <CalTask key={t.id} task={t} color={colorOf(t)} />
              ))}
            </div>
          )
        })}
      </div>
      <div className="cal-time-body" ref={bodyRef}>
        <div className="cal-time-inner" style={{ gridTemplateColumns: cols, height: 24 * HOUR_H }}>
          <div className="cal-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="cal-hour-label" style={{ top: h * HOUR_H }}>
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const ds = fmt(d)
            const placed = layoutDay(byDay.get(ds) ?? [])
            return (
              <div
                key={ds}
                className={'cal-col' + (ds === today ? ' today' : '') + (over?.startsWith('t' + ds) ? ' drag-over' : '')}
                onClick={(e) => {
                  const m = minuteAt(e, 0, 30)
                  blankClick(() => onAdd({ date: ds, time: toHM(m), anchor: { x: e.clientX, y: e.clientY + 4, h: 8 } }))()
                }}
                {...dropProps('t' + ds, (e) => {
                  const m = minuteAt(e, grabOffsetY)
                  return { dueDate: ds, dueTime: toHM(m) }
                })}
              >
                {placed.map((p) => (
                  <div
                    key={p.t.id}
                    className="cal-block-wrap"
                    style={{
                      top: (p.s / 60) * HOUR_H,
                      height: Math.max(22, ((p.e - p.s) / 60) * HOUR_H) - 2,
                      left: `calc(${(p.col / p.cols) * 100}% + 1px)`,
                      width: `calc(${100 / p.cols}% - 3px)`,
                    }}
                  >
                    <CalTask task={p.t} color={colorOf(p.t)} block />
                  </div>
                ))}
                {ds === today && (
                  <div className="cal-now" style={{ top: (nowMin / 60) * HOUR_H }}>
                    <span className="dot" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------- 列表（议程）视图 ----------------
function AgendaView({ cursor, byDay, onAdd }: { cursor: Date; byDay: Map<string, Task[]>; onAdd: (s: AddState) => void }) {
  const today = todayStr()
  const days = eachDayOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) })
    .map(fmt)
    .filter((ds) => byDay.has(ds) || ds === today)
  return (
    <div className="cal-agenda">
      {days.length === 0 && <div className="empty">本月没有安排任务</div>}
      {days.map((ds) => {
        const d = parseISO(ds)
        const list = byDay.get(ds) ?? []
        return (
          <section key={ds} className={'cal-agenda-day' + (ds === today ? ' today' : '')}>
            <div className="cal-agenda-head">
              <span className="num">{d.getDate()}</span>
              <span className="wd">
                {format(d, 'M月')} {weekdayName(d)}
                {ds === today && ' · 今天'}
              </span>
              <button
                className="icon-btn cal-agenda-add"
                title="添加任务"
                onClick={(e) => onAdd({ date: ds, anchor: { x: e.clientX - 280, y: e.clientY + 8, h: 16 } })}
              >
                <Icon name="plus" size={16} />
              </button>
            </div>
            <div className="cal-agenda-list">
              {list.length === 0 && <div className="cal-agenda-none">暂无任务</div>}
              {list.map((t) => (
                <TaskRow key={t.id} task={t} showList />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

// ---------------- 主视图 ----------------
export default function CalendarView() {
  const data = useData()
  const ui = useUI()
  const weekStartsOn = data.settings.weekStartsOn
  const [mode, setModeState] = useState<Mode>(loadMode)
  const [cursor, setCursor] = useState(() => new Date())
  const [add, setAdd] = useState<AddState | null>(null)

  const setMode = (m: Mode) => {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* ignore */
    }
  }

  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of data.tasks) {
      if (t.deleted || !t.dueDate) continue
      const arr = m.get(t.dueDate)
      if (arr) arr.push(t)
      else m.set(t.dueDate, [t])
    }
    m.forEach((arr) => arr.sort(sortDay))
    return m
  }, [data.tasks])

  const step = (n: number) => {
    setCursor((c) => (mode === 'week' ? addWeeks(c, n) : mode === 'day' ? addDays(c, n) : addMonths(c, n)))
  }

  // 键盘：← → 翻页，T 回到今天
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('.popover, .modal-mask')) return
      if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 't' || e.key === 'T') setCursor(new Date())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const weekDays = useMemo(() => {
    const s = startOfWeek(cursor, { weekStartsOn })
    return Array.from({ length: 7 }, (_, i) => addDays(s, i))
  }, [cursor, weekStartsOn])

  let title = format(cursor, 'yyyy年M月')
  if (mode === 'day') title = format(cursor, 'yyyy年M月d日') + ' ' + weekdayName(cursor)
  else if (mode === 'week') {
    const a = weekDays[0]
    const b = weekDays[6]
    title = isSameMonth(a, b) ? format(a, 'yyyy年M月') : a.getFullYear() === b.getFullYear() ? `${format(a, 'yyyy年M月')} - ${format(b, 'M月')}` : `${format(a, 'yyyy年M月')} - ${format(b, 'yyyy年M月')}`
  }

  const stepLabel = mode === 'week' ? '周' : mode === 'day' ? '天' : '月'

  return (
    <div className="module cal">
      <div className="cal-main">
        <div className="cal-top">
          <h2 className="cal-title">{title}</h2>
          <div className="cal-nav">
            <button className="icon-btn" title={`上一${stepLabel}`} onClick={() => step(-1)}>
              <Icon name="chevronLeft" size={18} />
            </button>
            <button className="btn cal-today" onClick={() => setCursor(new Date())}>
              今天
            </button>
            <button className="icon-btn" title={`下一${stepLabel}`} onClick={() => step(1)}>
              <Icon name="chevronRight" size={18} />
            </button>
          </div>
          <div className="cal-spacer" />
          <div className="cal-seg">
            {MODES.map((m) => (
              <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="cal-body">
          {mode === 'month' && <MonthView cursor={cursor} byDay={byDay} weekStartsOn={weekStartsOn} onAdd={setAdd} />}
          {mode === 'week' && <TimeGrid days={weekDays} byDay={byDay} onAdd={setAdd} />}
          {mode === 'day' && <TimeGrid days={[cursor]} byDay={byDay} onAdd={setAdd} />}
          {mode === 'agenda' && <AgendaView cursor={cursor} byDay={byDay} onAdd={setAdd} />}
        </div>
      </div>
      {add && <AddPopover key={add.date + add.time + add.anchor.x + add.anchor.y} s={add} onClose={() => setAdd(null)} />}
      {ui.selectedTaskId && <TaskDetail floating />}
    </div>
  )
}
