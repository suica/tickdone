import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import './calendar.css'
import { getData, getUI, setUI, toast, updateTask, useData, useUI } from '../store'
import { fmt, todayStr } from '../dates'
import { useT, type MessageKey } from '../i18n'
import { dateFnsLocale, fmtFullDate, fmtMonthDay, fmtMonthYear, fmtWeekday, localeWeekStart } from '../i18n/format'
import type { Task } from '../types'
import { LARGE, useMedia, usePhone } from '../viewport'
import { Icon } from '../components/Icon'
import { anchorOf, Popover, type Anchor } from '../components/Popover'
import { TaskDetail } from '../components/TaskDetail'
import { TaskRow } from '../components/TaskRow'
import { beginDrag, dragging, useTouchGuard } from './calDnd'
import { dur, easing, flyFrom, playSlides, snapshotSlides } from './calMotion'
import { AddPopover, CalTask } from './calParts'
import { TimeGrid } from './CalTimeGrid'
import { dayLabel, isTyping, monthSpan, sortDay, twelveHour, useColorOf, withWeekday, type AddState } from './calUtil'

type Mode = 'month' | 'week' | 'day' | 'agenda'
const MODES: { id: Mode; label: MessageKey; phone?: MessageKey }[] = [
  { id: 'month', label: 'calendar.view.month' },
  { id: 'week', label: 'calendar.view.week', phone: 'calendar.view.threeDays' },
  { id: 'day', label: 'calendar.view.day' },
  { id: 'agenda', label: 'calendar.view.agenda' },
]
/** Titles of the previous / next buttons per view (the phone week view pages by three days). */
const NAV: Record<'month' | 'week' | 'threeDays' | 'day', [MessageKey, MessageKey]> = {
  month: ['calendar.nav.prevMonth', 'calendar.nav.nextMonth'],
  week: ['calendar.nav.prevWeek', 'calendar.nav.nextWeek'],
  threeDays: ['calendar.nav.prevThreeDays', 'calendar.nav.nextThreeDays'],
  day: ['calendar.nav.prevDay', 'calendar.nav.nextDay'],
}
const MODE_KEY = 'tickdone:cal:mode'

function loadMode(): Mode {
  try {
    const m = localStorage.getItem(MODE_KEY) as Mode | null
    if (m && MODES.some((x) => x.id === m)) return m
  } catch {
    /* ignore */
  }
  return 'month'
}

const getSelected = () => getUI().selectedTaskId

/** Pointer down on a list row: drag it (mouse presses on the title input keep selecting text). */
function rowDown(e: ReactPointerEvent<HTMLElement>, start: (e: ReactPointerEvent<HTMLElement>) => void) {
  if (e.pointerType === 'mouse' && isTyping(e.target)) return
  e.stopPropagation()
  start(e)
}
const noNativeDrag = (e: { preventDefault(): void; stopPropagation(): void }) => {
  e.preventDefault()
  e.stopPropagation()
}

// ---------------- month ----------------
interface MonthProps {
  cursor: Date
  byDay: Map<string, Task[]>
  weekStartsOn: 0 | 1
  /** Phone: small cells with dots and the picked day's tasks underneath. */
  compact: boolean
  chipH: number
  fresh: string | null
  onAdd: (s: AddState) => void
  onPick: (d: Date) => void
}

function MonthView({ cursor, byDay, weekStartsOn, compact, chipH, fresh, onAdd, onPick }: MonthProps) {
  const colorOf = useColorOf()
  const t = useT()
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor), { weekStartsOn }), end: endOfWeek(endOfMonth(cursor), { weekStartsOn }) })
  const rows = days.length / 7
  const gridRef = useRef<HTMLDivElement>(null)
  const [rowH, setRowH] = useState(110)
  const [drag, setDragState] = useState<{ id: string; over: string | null } | null>(null)
  const dragRef = useRef(drag)
  const setDrag = (d: typeof drag) => {
    dragRef.current = d
    setDragState(d)
  }
  const [more, setMore] = useState<{ date: string; anchor: Anchor } | null>(null)
  const [moreAway, setMoreAway] = useState(false)
  const settle = useRef<{ id: string; day: string; from?: DOMRect } | null>(null)
  const today = todayStr()
  const picked = fmt(cursor)

  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el || compact) return
    const ro = new ResizeObserver(() => setRowH(el.clientHeight / rows))
    ro.observe(el)
    return () => ro.disconnect()
  }, [rows, compact])
  const fit = Math.max(1, Math.floor((rowH - 30) / chipH))

  // After a drop the bar lands in its new day (or, without bars, the day marker pops).
  useLayoutEffect(() => {
    const s = settle.current
    if (!s) return
    settle.current = null
    const cell = gridRef.current?.querySelector<HTMLElement>(`.cal-cell[data-day="${s.day}"]`)
    const chip = cell?.querySelector(`[data-task-id="${s.id}"]`)
    if (chip) return flyFrom(chip, s.from, 1.02)
    const mark = cell?.querySelector('.cal-dots, .cal-more, .cal-daynum')
    const d = dur('--dur-slow')
    if (mark && d) mark.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: d, easing: easing('--ease-out') })
  })

  /** Drag a task (a bar, a row of the picked day, or a bar in the overflow list) onto another day. */
  const startDrag = (e: ReactPointerEvent<HTMLElement>, task: Task, fromMore = false) => {
    beginDrag(e.nativeEvent, {
      source: e.currentTarget,
      onStart: () => {
        setDrag({ id: task.id, over: task.dueDate ?? null })
        if (fromMore) setMoreAway(true)
      },
      onMove: (c) => {
        const cell = c.hit?.closest<HTMLElement>('.cal-cell[data-day]')
        const over = cell && gridRef.current?.contains(cell) ? cell.dataset.day! : null
        if (over !== dragRef.current?.over) setDrag({ id: task.id, over })
      },
      onDrop: (c) => {
        const over = dragRef.current?.over
        const cur = getData().tasks.find((x) => x.id === task.id)
        if (!over || !cur || cur.dueDate === over) return false
        const snap = getData()
        settle.current = { id: task.id, day: over, from: c.ghostRect }
        updateTask(task.id, { dueDate: over })
        toast(t('calendar.toast.movedToDay', { date: dayLabel(over) }), snap)
        return true
      },
      onEnd: () => {
        setDrag(null)
        if (fromMore) {
          setMoreAway(false)
          setMore(null)
        }
      },
    })
  }

  const pickedTasks = byDay.get(picked) ?? []

  return (
    <div className={'cal-month' + (compact ? ' compact' : '')}>
      <div className="cal-weekhead">
        {days.slice(0, 7).map((d) => (
          <div key={d.getDay()}>{fmtWeekday(d, compact ? 'narrow' : 'short')}</div>
        ))}
      </div>
      <div className="cal-grid" ref={gridRef} data-slide style={compact ? undefined : { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {days.map((d) => {
          const ds = fmt(d)
          const list = byDay.get(ds) ?? []
          const overflow = list.length > fit
          const shown = overflow ? list.slice(0, fit - 1) : list
          const dow = d.getDay()
          return (
            <div
              key={ds}
              data-day={ds}
              className={
                'cal-cell' +
                (isSameMonth(d, cursor) ? '' : ' other') +
                (ds === today ? ' today' : '') +
                (dow === 0 || dow === 6 ? ' weekend' : '') +
                (compact && ds === picked ? ' picked' : '') +
                (drag?.over === ds ? ' drag-over' : '')
              }
              onClick={(e) => {
                if (compact) return onPick(d)
                if (getSelected()) return setUI({ selectedTaskId: undefined })
                onAdd({ date: ds, anchor: { x: e.clientX, y: e.clientY + 4, h: 8 } })
              }}
            >
              <div className="cal-cell-head">
                <span className="cal-daynum">{d.getDate() === 1 && !isSameMonth(d, cursor) && !compact ? fmtMonthDay(d) : d.getDate()}</span>
              </div>
              {compact ? (
                list.length > 0 && (
                  <div className="cal-dots">
                    {list.slice(0, 3).map((t) => (
                      <i key={t.id} style={{ background: t.status !== 0 ? 'var(--p-none)' : colorOf(t) }} />
                    ))}
                  </div>
                )
              ) : (
                <div className="cal-cell-items">
                  {shown.map((t) => (
                    <CalTask
                      key={t.id}
                      task={t}
                      color={colorOf(t)}
                      showTime
                      className={(drag?.id === t.id ? 'cal-src' : '') + (fresh === t.id ? ' cal-fresh' : '')}
                      onPointerDown={(e) => startDrag(e, t)}
                    />
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
              )}
            </div>
          )
        })}
      </div>
      {compact && (
        <DayList
          date={picked}
          tasks={pickedTasks}
          dragId={drag?.id ?? null}
          onAdd={onAdd}
          onRowDown={(e, t) => rowDown(e, (ev) => startDrag(ev, t))}
        />
      )}
      {more && (
        <Popover anchor={more.anchor} onClose={() => setMore(null)} width={240} className={'cal-more-pop' + (moreAway ? ' cal-away' : '')}>
          <MoreList
            date={more.date}
            tasks={byDay.get(more.date) ?? []}
            dragId={drag?.id ?? null}
            onClose={() => setMore(null)}
            onDown={(e, t) => startDrag(e, t, true)}
          />
        </Popover>
      )}
    </div>
  )
}

/** Everything due on one day (opened from "+n" in a month cell); bars can be dragged out to other days. */
function MoreList({ date, tasks, dragId, onClose, onDown }: { date: string; tasks: Task[]; dragId: string | null; onClose: () => void; onDown: (e: ReactPointerEvent<HTMLElement>, t: Task) => void }) {
  const colorOf = useColorOf()
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useTouchGuard(ref)
  return (
    <div ref={ref}>
      <div className="cal-more-head">
        <span>{withWeekday(parseISO(date))}</span>
        <button className="icon-btn" title={t('common.close')} onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="cal-more-list">
        {tasks.map((t) => (
          <CalTask key={t.id} task={t} color={colorOf(t)} showTime className={dragId === t.id ? 'cal-src' : ''} onPointerDown={(e) => onDown(e, t)} />
        ))}
      </div>
    </div>
  )
}

/** Phone month view: the tasks of the picked day under the grid; long-press a row and drop it on a day. */
function DayList({
  date,
  tasks,
  dragId,
  onAdd,
  onRowDown,
}: {
  date: string
  tasks: Task[]
  dragId: string | null
  onAdd: (s: AddState) => void
  onRowDown: (e: ReactPointerEvent<HTMLElement>, t: Task) => void
}) {
  const t = useT()
  const d = parseISO(date)
  return (
    <section className="cal-daylist" data-slide>
      <div className="cal-dl-head">
        <span className="cal-dl-date">
          {withWeekday(d)}
          {date === todayStr() && ` · ${t('common.today')}`}
        </span>
        {tasks.length > 0 && <span className="cal-dl-count">{tasks.length}</span>}
        <button className="icon-btn cal-dl-add" title={t('calendar.addTask')} onClick={(e) => onAdd({ date, anchor: anchorOf(e.currentTarget) })}>
          <Icon name="plus" size={18} />
        </button>
      </div>
      <div className="cal-dl-body" key={date}>
        {tasks.length === 0 && <div className="cal-dl-empty">{t('calendar.noTasks')}</div>}
        {tasks.map((t) => (
          <div key={t.id} className={'cal-dl-item' + (dragId === t.id ? ' cal-src' : '')} data-id={t.id} onPointerDownCapture={(e) => onRowDown(e, t)} onDragStartCapture={noNativeDrag}>
            <TaskRow task={t} showList />
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------- agenda ----------------
function AgendaView({ cursor, byDay, onAdd }: { cursor: Date; byDay: Map<string, Task[]>; onAdd: (s: AddState) => void }) {
  const t = useT()
  const today = todayStr()
  const days = eachDayOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) })
    .map(fmt)
    .filter((ds) => byDay.has(ds) || ds === today)
  return (
    <div className="cal-agenda" data-slide>
      {days.length === 0 && <div className="empty">{t('calendar.agendaEmpty')}</div>}
      {days.map((ds) => {
        const d = parseISO(ds)
        const list = byDay.get(ds) ?? []
        return (
          <section key={ds} className={'cal-agenda-day' + (ds === today ? ' today' : '')}>
            <div className="cal-agenda-head">
              <span className="num">{d.getDate()}</span>
              <span className="wd">
                {format(d, 'LLL', { locale: dateFnsLocale() })} {fmtWeekday(d)}
                {ds === today && ` · ${t('common.today')}`}
              </span>
              <button className="icon-btn cal-agenda-add" title={t('calendar.addTask')} onClick={(e) => onAdd({ date: ds, anchor: { x: e.clientX - 280, y: e.clientY + 8, h: 16 } })}>
                <Icon name="plus" size={16} />
              </button>
            </div>
            <div className="cal-agenda-list">
              {list.length === 0 && <div className="cal-agenda-none">{t('calendar.noTasks')}</div>}
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

// ---------------- calendar ----------------
export default function CalendarView() {
  const data = useData()
  const ui = useUI()
  const t = useT()
  const phone = usePhone()
  const large = useMedia(LARGE)
  const weekStartsOn = data.settings.weekStartsOn ?? localeWeekStart()
  const [mode, setModeState] = useState<Mode>(loadMode)
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [add, setAdd] = useState<AddState | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const [viewAnim, setViewAnim] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const slideDir = useRef(0)
  const freshTimer = useRef(0)
  useTouchGuard(rootRef)

  const setMode = (m: Mode) => {
    if (m === mode) return
    setViewAnim(true)
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

  // Week view shows the week of the cursor; on phones it becomes three days starting at the cursor.
  const days = useMemo(() => {
    if (mode === 'day') return [cursor]
    if (mode !== 'week') return []
    if (phone) return [0, 1, 2].map((i) => addDays(cursor, i))
    const s = startOfWeek(cursor, { weekStartsOn })
    return Array.from({ length: 7 }, (_, i) => addDays(s, i))
  }, [mode, phone, cursor, weekStartsOn])

  const periodOf = (d: Date) => (mode === 'month' || mode === 'agenda' ? format(d, 'yyyy-MM') : mode === 'week' && !phone ? fmt(startOfWeek(d, { weekStartsOn })) : fmt(d))
  const period = periodOf(cursor)

  /** Move the cursor; a new month / week / day slides in from the side it comes from. */
  const go = (next: Date) => {
    if (periodOf(next) !== period && snapshotSlides(bodyRef.current, layerRef.current)) slideDir.current = next > cursor ? 1 : -1
    setCursor(next)
  }
  useLayoutEffect(() => {
    const dir = slideDir.current
    slideDir.current = 0
    if (dir) playSlides(bodyRef.current, layerRef.current, dir)
    else layerRef.current?.replaceChildren()
  }, [period, mode])

  const step = (n: number) => {
    if (mode === 'week') go(phone ? addDays(cursor, 3 * n) : addWeeks(cursor, n))
    else if (mode === 'day') go(addDays(cursor, n))
    else if (phone && mode === 'month') {
      const first = startOfMonth(addMonths(cursor, n))
      go(isSameMonth(first, new Date()) ? startOfDay(new Date()) : first)
    } else go(addMonths(cursor, n))
  }
  const goToday = () => go(startOfDay(new Date()))
  // Latest handlers for the window listeners below.
  const stepRef = useRef(step)
  const goTodayRef = useRef(goToday)
  useLayoutEffect(() => {
    stepRef.current = step
    goTodayRef.current = goToday
  })

  // Keyboard: ← → page, T back to today.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey || dragging()) return
      if (document.querySelector('.popover, .modal-mask')) return
      if (e.key === 'ArrowLeft') stepRef.current(-1)
      else if (e.key === 'ArrowRight') stepRef.current(1)
      else if (e.key === 't' || e.key === 'T') goTodayRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Touch: swipe left / right on the calendar to page.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    let s: { x: number; y: number; t: number; id: number; dragged: boolean } | null = null
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && e.isPrimary) s = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, dragged: false }
    }
    const move = (e: PointerEvent) => {
      if (s && e.pointerId === s.id && dragging()) s.dragged = true
    }
    const up = (e: PointerEvent) => {
      if (!s || e.pointerId !== s.id) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      const ok = !s.dragged && !dragging() && Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6 && e.timeStamp - s.t < 800
      s = null
      if (ok) stepRef.current(dx < 0 ? 1 : -1)
    }
    const cancel = () => (s = null)
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
    }
  }, [])

  const onAdded = (t: Task) => {
    setFresh(t.id)
    clearTimeout(freshTimer.current)
    freshTimer.current = window.setTimeout(() => setFresh(null), 800)
  }

  const title = mode === 'day' ? withWeekday(cursor, fmtFullDate) : mode === 'week' ? monthSpan(days[0], days[days.length - 1]) : fmtMonthYear(cursor)
  const [prevTitle, nextTitle] = NAV[mode === 'week' ? (phone ? 'threeDays' : 'week') : mode === 'day' ? 'day' : 'month']

  return (
    <div className={'module cal' + (phone ? ' phone' : '')} ref={rootRef}>
      <div className="cal-main">
        <div className="cal-top">
          <h2 className="cal-title">{title}</h2>
          <div className="cal-nav">
            <button className="icon-btn" title={t(prevTitle)} onClick={() => step(-1)}>
              <Icon name="chevronLeft" size={18} />
            </button>
            <button className="btn cal-today" onClick={goToday}>
              {t('common.today')}
            </button>
            <button className="icon-btn" title={t(nextTitle)} onClick={() => step(1)}>
              <Icon name="chevronRight" size={18} />
            </button>
          </div>
          <div className="cal-spacer" />
          <div className="cal-seg" role="tablist">
            {MODES.map((m) => (
              <button key={m.id} role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>
                {t(phone && m.phone ? m.phone : m.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="cal-body" ref={bodyRef}>
          <div key={mode} className={'cal-view' + (viewAnim ? ' cal-view-in' : '')}>
            {mode === 'month' && (
              <MonthView cursor={cursor} byDay={byDay} weekStartsOn={weekStartsOn} compact={phone} chipH={large ? 23 : 21} fresh={fresh} onAdd={setAdd} onPick={go} />
            )}
            {(mode === 'week' || mode === 'day') && (
              <TimeGrid days={days} byDay={byDay} hourH={phone ? 52 : large ? 56 : 48} labelW={(phone ? 40 : 56) + (twelveHour() ? 16 : 0)} add={add} fresh={fresh} onAdd={setAdd} />
            )}
            {mode === 'agenda' && <AgendaView cursor={cursor} byDay={byDay} onAdd={setAdd} />}
          </div>
          <div className="cal-slide-layer" ref={layerRef} aria-hidden="true" inert />
        </div>
      </div>
      {add && <AddPopover key={add.date + add.time + add.anchor.x + add.anchor.y} s={add} onClose={() => setAdd(null)} onAdded={onAdded} />}
      {ui.selectedTaskId && <TaskDetail floating />}
    </div>
  )
}
