import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import './calendar.css'
import { getData, getUI, setUI, toast, updateTask, useData, useUI } from '../store'
import { fmt, todayStr } from '../dates'
import { useLocale, useT, type MessageKey } from '../i18n'
import { dateFnsLocale, fmtFullDate, fmtMonthDay, fmtMonthYear, fmtWeekday, localeWeekStart } from '../i18n/format'
import type { Task } from '../types'
import { LARGE, useMedia, usePhone } from '../viewport'
import { Icon } from '../components/Icon'
import { anchorOf, MenuList, Popover, type Anchor } from '../components/Popover'
import { TaskDetail } from '../components/TaskDetail'
import { TaskRow } from '../components/TaskRow'
import { beginDrag, dragging, useTouchGuard } from './calDnd'
import { dur, easing, flyFrom, playSlides, snapshotSlides } from './calMotion'
import { AddPopover, CalTask } from './calParts'
import { TimeGrid, type GridApi } from './CalTimeGrid'
import { UnscheduledPanel } from './calUnscheduled'
import { agendaDays, dayRange, unscheduledTasks } from './calPlan'
import { dayLabel, isTyping, monthSpan, sortDay, twelveHour, useColorOf, withWeekday, type AddState } from './calUtil'
import { capChips, weekNumber } from './monthCell'
import { lunarLabel } from '../lunar'
import { useFeedEvents, type FeedEvent } from '../feeds'
import { eventsByDay, type DayEvent } from './calEvents'
import { CalEvent, EventPopover, EventRow, type OpenEvent } from './calEventParts'
import { activeTasks } from '../views'

type Mode = 'month' | 'week' | 'day' | 'agenda'
const MODES: { id: Mode; label: MessageKey; phone?: MessageKey }[] = [
  { id: 'month', label: 'calendar.view.month' },
  { id: 'week', label: 'calendar.view.week', phone: 'calendar.view.threeDays' },
  { id: 'day', label: 'calendar.view.day' },
  { id: 'agenda', label: 'calendar.view.agenda' },
]
const MODE_ICON: Record<Mode, string> = { month: 'calendar', week: 'week', day: 'today', agenda: 'list' }
/** Titles of the previous / next buttons per view (the phone week view pages by three days). */
const NAV: Record<'month' | 'week' | 'threeDays' | 'day' | 'agenda', [MessageKey, MessageKey]> = {
  agenda: ['calendar.nav.earlier', 'calendar.nav.later'],
  month: ['calendar.nav.prevMonth', 'calendar.nav.nextMonth'],
  week: ['calendar.nav.prevWeek', 'calendar.nav.nextWeek'],
  threeDays: ['calendar.nav.prevThreeDays', 'calendar.nav.nextThreeDays'],
  day: ['calendar.nav.prevDay', 'calendar.nav.nextDay'],
}
const MODE_KEY = 'tickdone:cal:mode'
const UNSCHED_KEY = 'tickdone:cal:unsched'
/** Days the agenda shows at first, and how many more each time it reaches its end. */
const AGENDA_DAYS = 30

/** Whether the unscheduled panel is open next to the week and day views (on unless closed). */
function loadUnsched(): boolean {
  try {
    return localStorage.getItem(UNSCHED_KEY) !== '0'
  } catch {
    return true
  }
}

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
  /** Events of subscribed calendars per day. */
  evByDay: Map<string, DayEvent[]>
  onEvent: OpenEvent
  weekStartsOn: 0 | 1
  /** Phone: small cells with dots and the picked day's tasks underneath. */
  compact: boolean
  chipH: number
  fresh: string | null
  /** Chinese lunar labels in simplified or traditional characters, or none. */
  lunar: 'hans' | 'hant' | null
  weekNumbers: boolean
  onAdd: (s: AddState) => void
  onPick: (d: Date) => void
  /** "+N more": open that day in the day view. */
  onOpenDay: (date: string) => void
}

function MonthView({ cursor, byDay, evByDay, onEvent, weekStartsOn, compact, chipH, fresh, lunar, weekNumbers, onAdd, onPick, onOpenDay }: MonthProps) {
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

  /** Drag a task (a bar or a row of the picked day) onto another day. */
  const startDrag = (e: ReactPointerEvent<HTMLElement>, task: Task) => {
    beginDrag(e.nativeEvent, {
      source: e.currentTarget,
      onStart: () => setDrag({ id: task.id, over: task.dueDate ?? null }),
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
      onEnd: () => setDrag(null),
    })
  }

  const pickedTasks = byDay.get(picked) ?? []

  return (
    <div className={'cal-month' + (compact ? ' compact' : '') + (lunar ? ' lunar' : '')}>
      <div className="cal-weekhead">
        {days.slice(0, 7).map((d) => (
          <div key={d.getDay()}>{fmtWeekday(d, compact ? 'narrow' : 'short')}</div>
        ))}
      </div>
      <div className="cal-grid" ref={gridRef} data-slide style={compact ? undefined : { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {days.map((d, i) => {
          const ds = fmt(d)
          const list = byDay.get(ds) ?? []
          const evs = evByDay.get(ds) ?? []
          // Calendar events come first (all-day ones on top), then tasks; together they share the room.
          const cap = capChips(evs.length + list.length, fit)
          const shownEv = evs.slice(0, cap.shown)
          const shown = list.slice(0, Math.max(0, cap.shown - evs.length))
          const dow = d.getDay()
          const label = lunar ? lunarLabel(ds, lunar === 'hant') : undefined
          const week = weekNumbers && i % 7 === 0 ? weekNumber(d, weekStartsOn) : 0
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
                {(week > 0 || label) && (
                  <span className="cal-cell-sub">
                    {week > 0 && (
                      <span className="cal-weeknum" title={t('calendar.weekNumberTitle', { week })}>
                        {t('calendar.weekNumber', { week })}
                      </span>
                    )}
                    {label && <span className={'cal-lunar' + (label.term ? ' term' : '')}>{label.text}</span>}
                  </span>
                )}
              </div>
              {compact ? (
                evs.length + list.length > 0 && (
                  <div className="cal-dots">
                    {[...evs.map((x) => ({ id: x.ev.id, c: x.ev.color })), ...list.map((t) => ({ id: t.id, c: t.status !== 0 ? 'var(--p-none)' : colorOf(t) }))].slice(0, 3).map((x) => (
                      <i key={x.id} style={{ background: x.c }} />
                    ))}
                  </div>
                )
              ) : (
                <div className="cal-cell-items">
                  {shownEv.map((x) => (
                    <CalEvent key={x.ev.id} d={x} showTime onOpen={onEvent} />
                  ))}
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
                  {cap.more > 0 && (
                    <button
                      className="cal-more"
                      title={withWeekday(d)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenDay(ds)
                      }}
                    >
                      {t('calendar.more', { count: cap.more })}
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
          events={evByDay.get(picked) ?? []}
          onEvent={onEvent}
          dragId={drag?.id ?? null}
          onAdd={onAdd}
          onRowDown={(e, t) => rowDown(e, (ev) => startDrag(ev, t))}
        />
      )}
    </div>
  )
}

/** Phone month view: the tasks of the picked day under the grid; long-press a row and drop it on a day. */
function DayList({
  date,
  tasks,
  events,
  onEvent,
  dragId,
  onAdd,
  onRowDown,
}: {
  date: string
  tasks: Task[]
  events: DayEvent[]
  onEvent: OpenEvent
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
        {tasks.length + events.length > 0 && <span className="cal-dl-count">{tasks.length + events.length}</span>}
        <button className="icon-btn cal-dl-add" title={t('calendar.addTask')} onClick={(e) => onAdd({ date, anchor: anchorOf(e.currentTarget) })}>
          <Icon name="plus" size={18} />
        </button>
      </div>
      <div className="cal-dl-body" key={date}>
        {tasks.length + events.length === 0 && <div className="cal-dl-empty">{t('calendar.noTasks')}</div>}
        {events.map((x) => (
          <EventRow key={x.ev.id} d={x} onOpen={onEvent} />
        ))}
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
/** The coming days in one scrolling list: each day with tasks or events (and today), grouped by day. */
function AgendaView({
  start,
  count,
  onMore,
  byDay,
  evByDay,
  onEvent,
  onAdd,
}: {
  start: Date
  count: number
  /** The end of the list came into view: show more days. */
  onMore: () => void
  byDay: Map<string, Task[]>
  evByDay: Map<string, DayEvent[]>
  onEvent: OpenEvent
  onAdd: (s: AddState) => void
}) {
  const t = useT()
  const today = todayStr()
  const days = agendaDays(dayRange(start, count), (ds) => byDay.has(ds) || evByDay.has(ds), today)
  const moreRef = useRef<HTMLButtonElement>(null)
  const onMoreRef = useRef(onMore)
  useLayoutEffect(() => {
    onMoreRef.current = onMore
  })
  // Scrolling to the end loads the next days.
  useEffect(() => {
    const el = moreRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    // Only while the list scrolls: a short list keeps the button for the person to press.
    const sc = el.closest<HTMLElement>('.cal-agenda')
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting) && sc && sc.scrollHeight > sc.clientHeight + 1) onMoreRef.current()
    }, { root: sc, rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [count])
  return (
    <div className="cal-agenda" data-slide>
      {days.length === 0 && <div className="empty">{t('calendar.agenda.empty')}</div>}
      {days.map((ds, i) => {
        const d = parseISO(ds)
        const list = byDay.get(ds) ?? []
        const evs = evByDay.get(ds) ?? []
        // The month is named on the first day shown in it.
        const newMonth = i === 0 || days[i - 1].slice(0, 7) !== ds.slice(0, 7)
        return (
          <section key={ds} className={'cal-agenda-day' + (ds === today ? ' today' : '')} data-day={ds}>
            {newMonth && <h3 className="cal-agenda-month">{fmtMonthYear(d)}</h3>}
            <div className="cal-agenda-head">
              <span className="num">{d.getDate()}</span>
              <span className="wd">
                {format(d, 'LLL', { locale: dateFnsLocale() })} {fmtWeekday(d)}
                {ds === today && ` · ${t('common.today')}`}
              </span>
              <button className="icon-btn cal-agenda-add" title={t('calendar.addTask')} onClick={(e) => onAdd({ date: ds, anchor: anchorOf(e.currentTarget) })}>
                <Icon name="plus" size={16} />
              </button>
            </div>
            <div className="cal-agenda-list">
              {list.length + evs.length === 0 && <div className="cal-agenda-none">{t('calendar.noTasks')}</div>}
              {evs.map((x) => (
                <EventRow key={x.ev.id} d={x} onOpen={onEvent} />
              ))}
              {list.map((t) => (
                <TaskRow key={t.id} task={t} showList />
              ))}
            </div>
          </section>
        )
      })}
      <button ref={moreRef} className="btn cal-agenda-more" onClick={onMore}>
        {t('calendar.agenda.more')}
      </button>
    </div>
  )
}

// ---------------- calendar ----------------
export default function CalendarView() {
  const data = useData()
  const ui = useUI()
  const t = useT()
  const locale = useLocale()
  const phone = usePhone()
  const large = useMedia(LARGE)
  const chinese = locale === 'zh-CN' || locale === 'zh-TW'
  const lunar = (data.settings.showLunar ?? chinese) ? (locale === 'zh-TW' ? 'hant' : 'hans') : null
  const [viewMenu, setViewMenu] = useState<Anchor | null>(null)
  const weekStartsOn = data.settings.weekStartsOn ?? localeWeekStart()
  const [mode, setModeState] = useState<Mode>(loadMode)
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [add, setAdd] = useState<AddState | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const [evPop, setEvPop] = useState<{ ev: FeedEvent; anchor: Anchor } | null>(null)
  const [viewAnim, setViewAnim] = useState(false)
  const [agendaCount, setAgendaCount] = useState(AGENDA_DAYS)
  // Phones start with the sheet closed; wider screens remember the panel.
  const [unschedOpen, setUnschedOpen] = useState(() => !phone && loadUnsched())
  const [moving, setMoving] = useState<{ id: string; out: boolean } | null>(null)
  const gridApi = useRef<GridApi | null>(null)
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
    // tasks of archived lists stay out of the calendar
    for (const t of activeTasks(data)) {
      if (!t.dueDate) continue
      const arr = m.get(t.dueDate)
      if (arr) arr.push(t)
      else m.set(t.dueDate, [t])
    }
    m.forEach((arr) => arr.sort(sortDay))
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.tasks, data.lists])

  // Week view shows the week of the cursor; on phones it becomes three days starting at the cursor.
  const days = useMemo(() => {
    if (mode === 'day') return [cursor]
    if (mode !== 'week') return []
    if (phone) return [0, 1, 2].map((i) => addDays(cursor, i))
    const s = startOfWeek(cursor, { weekStartsOn })
    return Array.from({ length: 7 }, (_, i) => addDays(s, i))
  }, [mode, phone, cursor, weekStartsOn])

  // The days in view, for the events of subscribed calendars (recurring ones are expanded over them only).
  const [rangeFrom, rangeTo] = useMemo(() => {
    if (mode === 'week' || mode === 'day') return [days[0].getTime(), addDays(days[days.length - 1], 1).getTime()]
    if (mode === 'agenda') return [cursor.getTime(), addDays(cursor, agendaCount).getTime()]
    const s = startOfWeek(startOfMonth(cursor), { weekStartsOn })
    const e = endOfWeek(endOfMonth(cursor), { weekStartsOn })
    return [s.getTime(), addDays(startOfDay(e), 1).getTime()]
  }, [mode, days, cursor, weekStartsOn, agendaCount])
  const feedEvents = useFeedEvents(rangeFrom, rangeTo)
  const evByDay = useMemo(() => eventsByDay(feedEvents), [feedEvents])
  const openEvent: OpenEvent = (ev, anchor) => setEvPop({ ev, anchor })

  const periodOf = (d: Date) => (mode === 'month' ? format(d, 'yyyy-MM') : mode === 'week' && !phone ? fmt(startOfWeek(d, { weekStartsOn })) : fmt(d))
  const period = periodOf(cursor)

  /** Move the cursor; a new month / week / day slides in from the side it comes from. */
  const go = (next: Date) => {
    if (periodOf(next) !== period && snapshotSlides(bodyRef.current, layerRef.current)) slideDir.current = next > cursor ? 1 : -1
    setCursor(next)
    setAgendaCount(AGENDA_DAYS)
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
    else if (mode === 'agenda') go(addDays(cursor, AGENDA_DAYS * n))
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

  /** "+N more" in a month cell: show that day on its own. */
  const openDay = (ds: string) => {
    setCursor(parseISO(ds))
    setMode('day')
  }
  /** "+": a new task on the picked day, or today when it is in view, else the first day in view. */
  const newTask = (el: Element) => {
    const today = startOfDay(new Date())
    const date = phone || mode === 'day' ? cursor : periodOf(today) === period ? today : mode === 'week' ? days[0] : cursor
    setAdd({ date: fmt(date), anchor: anchorOf(el) })
  }

  // Phones leave the title less room next to the tools: short month names, no year on a single day.
  const title =
    mode === 'day'
      ? withWeekday(cursor, phone ? fmtMonthDay : fmtFullDate)
      : mode === 'agenda'
        ? // phones name the first month only; the list shows where the next one starts
          monthSpan(cursor, phone ? cursor : addDays(cursor, agendaCount - 1), phone ? 'short' : 'long')
        : mode === 'week' || phone
        ? monthSpan(mode === 'week' ? days[0] : cursor, mode === 'week' ? days[days.length - 1] : cursor, phone ? 'short' : 'long')
        : fmtMonthYear(cursor)
  const modeLabel = (m: Mode) => {
    const x = MODES.find((y) => y.id === m)!
    return phone && x.phone ? x.phone : x.label
  }
  const [prevTitle, nextTitle] = NAV[mode === 'week' ? (phone ? 'threeDays' : 'week') : mode === 'day' ? 'day' : mode === 'agenda' ? 'agenda' : 'month']
  const timed = mode === 'week' || mode === 'day'
  const showUnsched = timed && unschedOpen
  const unschedCount = useMemo(() => unscheduledTasks(data).length, [data])
  const toggleUnsched = (open: boolean) => {
    setUnschedOpen(open)
    if (!phone)
      try {
        localStorage.setItem(UNSCHED_KEY, open ? '1' : '0')
      } catch {
        /* storage unavailable */
      }
  }

  return (
    <div className={'module cal' + (phone ? ' phone' : '')} ref={rootRef}>
      <div className="cal-main">
        <div className="cal-top">
          <h2 className="cal-title">{title}</h2>
          <div className="cal-spacer" />
          <div className="cal-tools">
            {timed && !phone && (
              <button
                className={'btn cal-tool cal-unsched-btn' + (showUnsched ? ' on' : '')}
                title={t('calendar.unsched.toggle')}
                aria-label={unschedCount > 0 ? `${t('calendar.unsched.toggle')} ${unschedCount}` : t('calendar.unsched.toggle')}
                aria-pressed={showUnsched}
                onClick={() => toggleUnsched(!showUnsched)}
              >
                <Icon name="inbox" size={16} />
                {unschedCount > 0 && <span className="cal-unsched-badge">{unschedCount}</span>}
              </button>
            )}
            <button className="btn cal-tool cal-add" title={t('calendar.newTask')} aria-label={t('calendar.newTask')} onClick={(e) => newTask(e.currentTarget)}>
              <Icon name="plus" size={16} />
            </button>
            <button
              className="btn cal-tool cal-view-btn"
              title={t('calendar.changeView')}
              aria-haspopup="menu"
              aria-expanded={!!viewMenu}
              onClick={(e) => setViewMenu(viewMenu ? null : anchorOf(e.currentTarget))}
            >
              <span>{t(modeLabel(mode))}</span>
              <Icon name="chevronDown" size={14} />
            </button>
            <div className="cal-nav" role="group">
              <button className="btn cal-tool" title={t(prevTitle)} aria-label={t(prevTitle)} onClick={() => step(-1)}>
                <Icon name="chevronLeft" size={16} />
              </button>
              <button className="btn cal-tool cal-today" onClick={goToday}>
                {t('common.today')}
              </button>
              <button className="btn cal-tool" title={t(nextTitle)} aria-label={t(nextTitle)} onClick={() => step(1)}>
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </div>
        </div>
        {viewMenu && (
          <Popover anchor={viewMenu} onClose={() => setViewMenu(null)} className="cal-view-menu">
            <MenuList
              onClose={() => setViewMenu(null)}
              items={[
                ...MODES.map((m) => ({ label: t(modeLabel(m.id)), icon: <Icon name={MODE_ICON[m.id]} size={15} />, checked: mode === m.id, onClick: () => setMode(m.id) })),
                // Phones have no room for the panel's own button in the toolbar.
                ...(phone && timed
                  ? [{ divider: true }, { label: t('calendar.unsched.toggle'), icon: <Icon name="inbox" size={15} />, checked: showUnsched, hint: unschedCount ? String(unschedCount) : undefined, onClick: () => toggleUnsched(!showUnsched) }]
                  : []),
              ]}
            />
          </Popover>
        )}
        <div className="cal-body" ref={bodyRef}>
          <div key={mode} className={'cal-view' + (viewAnim ? ' cal-view-in' : '')}>
            {mode === 'month' && (
              <MonthView
                cursor={cursor}
                byDay={byDay}
                evByDay={evByDay}
                onEvent={openEvent}
                weekStartsOn={weekStartsOn}
                compact={phone}
                chipH={large ? 23 : 21}
                fresh={fresh}
                lunar={lunar}
                weekNumbers={!!data.settings.showWeekNumbers}
                onAdd={setAdd}
                onPick={go}
                onOpenDay={openDay}
              />
            )}
            {(mode === 'week' || mode === 'day') && (
              <TimeGrid
                days={days}
                byDay={byDay}
                evByDay={evByDay}
                onEvent={openEvent}
                hourH={phone ? 52 : large ? 56 : 48}
                labelW={(phone ? 40 : 56) + (twelveHour() ? 16 : 0)}
                add={add}
                fresh={fresh}
                onAdd={setAdd}
                api={gridApi}
                onMoveState={setMoving}
              />
            )}
            {mode === 'agenda' && (
              <AgendaView
                start={cursor}
                count={agendaCount}
                onMore={() => setAgendaCount((n) => Math.min(n + AGENDA_DAYS, 366))}
                byDay={byDay}
                evByDay={evByDay}
                onEvent={openEvent}
                onAdd={setAdd}
              />
            )}
          </div>
          <div className="cal-slide-layer" ref={layerRef} aria-hidden="true" inert />
        </div>
      </div>
      {showUnsched && <UnscheduledPanel grid={gridApi} moving={moving} sheet={phone} onClose={() => toggleUnsched(false)} />}
      {add && <AddPopover key={add.date + add.time + add.anchor.x + add.anchor.y} s={add} onClose={() => setAdd(null)} onAdded={onAdded} />}
      {evPop && <EventPopover key={evPop.ev.id} ev={evPop.ev} anchor={evPop.anchor} onClose={() => setEvPop(null)} />}
      {ui.selectedTaskId && <TaskDetail floating />}
    </div>
  )
}
