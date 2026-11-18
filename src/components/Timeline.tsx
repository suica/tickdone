// The timeline view of a list: each dated task is a bar across the days it covers (a diamond when it is a
// single day), in rows grouped by section, with a today line, three zoom levels and a "No date" panel.
// Bars move by dragging, their edges change the start and end, and undated tasks are dragged in from
// the panel. Only the columns on screen are drawn. The maths lives in src/views/timeline.ts.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { parseISO } from 'date-fns'
import { useT } from '../i18n'
import { fmtDateRange, fmtDayNum, fmtMonthDay, fmtMonthShort, fmtMonthYear, fmtWeekday, fmtYear } from '../i18n/format'
import { getData, setUI, toast, updateTask, useUI } from '../store'
import type { AppData, Task, TaskList } from '../types'
import { todayStr } from '../dates'
import { dayNum, dayStr } from '../repeat'
import { blockTouchScrollWhileDragging, pressToDrag, type Point } from '../dnd'
import { reducedMotion } from './motion'
import { Icon } from './Icon'
import {
  DAY_PX,
  HEADER,
  ZOOMS,
  barBox,
  dayAt,
  daysFor,
  dropPatch,
  groupRows,
  isMilestone,
  rangeFor,
  spanAfter,
  spanOf,
  ticks,
  visibleDays,
  xOf,
  type DragKind,
  type Span,
  type Tick,
  type Zoom,
} from '../views/timeline'

const ZOOM_KEY = 'tickdone:timeline:zoom'
const PANEL_KEY = 'tickdone:timeline:nodate'
const ROW_H = 40
const HEAD_H = 52

const readPref = <T extends string>(key: string, ok: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && ok.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
const writePref = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* private mode: not remembered */
  }
}

const rangeText = (s: Span) => fmtDateRange(parseISO(s.start), parseISO(s.end))

interface BarDrag {
  id: string
  kind: DragKind
  span: Span | null
}
interface Ghost {
  id: string
  title: string
  x: number
  y: number
  /** The day under the pointer when it is over the timeline */
  day?: string
}

export function Timeline({ list, data }: { list: TaskList; data: AppData }) {
  const t = useT()
  const ui = useUI()
  const today = todayStr()
  const weekStartsOn = data.settings.weekStartsOn
  const [zoom, setZoomState] = useState<Zoom>(() => readPref(ZOOM_KEY, ZOOMS, 'day'))
  const [panel, setPanel] = useState(() => readPref(PANEL_KEY, ['open', 'closed'] as const, 'open') === 'open')
  const px = DAY_PX[zoom]

  const tasks = useMemo(() => data.tasks.filter((x) => x.listId === list.id && !x.deleted && x.status === 0), [data.tasks, list.id])
  const dated = useMemo(() => tasks.filter((x) => x.dueDate), [tasks])
  const undated = useMemo(() => tasks.filter((x) => !x.dueDate).sort((a, b) => a.order - b.order), [tasks])
  const groups = useMemo(() => groupRows(dated, list.sections), [dated, list.sections])
  const color = list.color || 'var(--primary)'

  // The days drawn: around today and every bar, and further out once you scroll near an edge.
  const need = useMemo(() => rangeFor(dated.map(spanOf).filter((s): s is Span => !!s), today), [dated, today])
  const [ext, setRange] = useState(need)
  const range = { start: need.start < ext.start ? need.start : ext.start, end: need.end > ext.end ? need.end : ext.end }
  const origin = range.start
  const total = dayNum(range.end) - dayNum(range.start) + 1

  const scrollRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ left: 0, width: 800 })
  const labelW = useLabelWidth()

  // Keep what is on screen in place when days are added or dropped on the left.
  const prevStart = useRef(range.start)
  useLayoutEffect(() => {
    const el = scrollRef.current
    const added = dayNum(prevStart.current) - dayNum(range.start)
    prevStart.current = range.start
    if (el && added !== 0) el.scrollLeft += added * px
  }, [range.start, px])

  // First paint: today a little in from the left edge.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = Math.max(0, xOf(today, origin, px) - (el.clientWidth - labelW) * 0.2)
    setView({ left: el.scrollLeft, width: el.clientWidth })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Changing the zoom keeps the day in the middle of the screen where it was.
  const centre = useRef<string | null>(null)
  const setZoom = (z: Zoom) => {
    const el = scrollRef.current
    if (el) centre.current = dayAt(el.scrollLeft + (el.clientWidth - labelW) / 2, origin, px)
    setZoomState(z)
    writePref(ZOOM_KEY, z)
  }
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !centre.current) return
    el.scrollLeft = Math.max(0, xOf(centre.current, origin, px) + px / 2 - (el.clientWidth - labelW) / 2)
    centre.current = null
    setView({ left: el.scrollLeft, width: el.clientWidth })
  }, [zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setView({ left: el.scrollLeft, width: el.clientWidth })
    if (el.scrollLeft < 200) setRange((r) => ({ ...r, start: dayStr(dayNum(r.start) - Math.ceil(1200 / px)) }))
    else if (el.scrollLeft + el.clientWidth > el.scrollWidth - 200) setRange((r) => ({ ...r, end: dayStr(Math.max(dayNum(r.end), dayNum(range.end)) + Math.ceil(1200 / px)) }))
  }
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setView({ left: el.scrollLeft, width: el.clientWidth }))
    ro.observe(el)
    const unblock = blockTouchScrollWhileDragging(el)
    return () => {
      ro.disconnect()
      unblock?.()
    }
  }, [])

  const goToday = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: Math.max(0, xOf(today, origin, px) - (el.clientWidth - labelW) * 0.2), behavior: reducedMotion() ? 'auto' : 'smooth' })
  }

  // ---- Lazy columns: only the days on screen, plus a margin ----
  const vis = visibleDays(view.left, view.width - labelW, px, origin, total)
  const [upperKind, lowerKind] = HEADER[zoom]
  const upper = useMemo(() => ticks(vis.from, vis.to, upperKind, weekStartsOn), [vis.from, vis.to, upperKind, weekStartsOn])
  const lower = useMemo(() => ticks(vis.from, vis.to, lowerKind, weekStartsOn), [vis.from, vis.to, lowerKind, weekStartsOn])
  const trackW = total * px

  // ---- Dragging a bar or one of its edges ----
  const [drag, setDrag] = useState<BarDrag | null>(null)
  const startBarDrag = (e: React.PointerEvent, task: Task, kind: DragKind) => {
    e.stopPropagation()
    const el = scrollRef.current
    if (!el) return
    const x0 = e.clientX + el.scrollLeft
    let patch: Partial<Task> | null = null
    const at = (p: Point) => {
      patch = dropPatch(task, kind, daysFor(p.x + el.scrollLeft - x0, px), '')
      setDrag({ id: task.id, kind, span: spanAfter(task, patch) })
    }
    pressToDrag(
      e.nativeEvent,
      {
        onStart: at,
        onMove: at,
        onDrop: (p) => {
          at(p)
          setDrag(null)
          if (!patch) return
          const snap = getData()
          updateTask(task.id, patch)
          const s = spanAfter(task, patch)
          if (s) toast(t(kind === 'move' ? 'tasks.timeline.moved' : 'tasks.timeline.resized', { range: rangeText(s) }), snap)
        },
        onCancel: () => setDrag(null),
      },
      el,
    )
  }

  // ---- Dragging an undated task in from the panel ----
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const startPanelDrag = (e: React.PointerEvent, task: Task) => {
    const el = scrollRef.current
    if (!el) return
    const dayUnder = (p: Point) => {
      const r = el.getBoundingClientRect()
      if (p.x < r.left + labelW || p.x > r.right || p.y < r.top + HEAD_H || p.y > r.bottom) return undefined
      return dayAt(p.x - r.left - labelW + el.scrollLeft, origin, px)
    }
    const at = (p: Point) => setGhost({ id: task.id, title: task.title || t('common.untitled'), x: p.x, y: p.y, day: dayUnder(p) })
    pressToDrag(
      e.nativeEvent,
      {
        onStart: at,
        onMove: at,
        onDrop: (p) => {
          setGhost(null)
          const day = dayUnder(p)
          const patch = day ? dropPatch(task, 'schedule', 0, day) : null
          if (!day || !patch) return
          const snap = getData()
          updateTask(task.id, patch)
          toast(t('tasks.timeline.scheduled', { date: fmtMonthDay(parseISO(day)) }), snap)
        },
        onCancel: () => setGhost(null),
      },
      el,
    )
  }

  const open = (id: string) => setUI({ selectedTaskId: id })
  const togglePanel = () => {
    setPanel(!panel)
    writePref(PANEL_KEY, panel ? 'closed' : 'open')
  }

  const todayX = xOf(today, origin, px)
  const empty = dated.length === 0

  return (
    <div className={'tl' + (drag || ghost ? ' tl-dragging' : '')} data-zoom={zoom} style={{ '--tl-label': labelW + 'px', '--tl-row': ROW_H + 'px', '--tl-head': HEAD_H + 'px' } as CSSProperties}>
      <div className="tl-bar">
        <div className="tl-zoom" role="radiogroup" aria-label={t('tasks.timeline.zoom')}>
          {ZOOMS.map((z) => (
            <button key={z} type="button" role="radio" aria-checked={zoom === z} className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)}>
              {t(`tasks.timeline.${z}` as 'tasks.timeline.day')}
            </button>
          ))}
        </div>
        <button type="button" className="tl-btn" onClick={goToday}>
          {t('common.today')}
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" className={'tl-btn tl-panel-btn' + (panel ? ' on' : '')} aria-pressed={panel} onClick={togglePanel}>
          <Icon name="inbox" size={15} />
          {t('tasks.timeline.noDate')}
          {undated.length > 0 && <span className="tl-count">{undated.length}</span>}
        </button>
      </div>
      <div className="tl-main">
        <div className="tl-scroll" ref={scrollRef} onScroll={onScroll}>
          <div className="tl-canvas" style={{ width: labelW + trackW }}>
            <div className="tl-head">
              <div className="tl-corner" />
              <div className="tl-head-track" style={{ width: trackW }}>
                {upper.map((c) => (
                  <HeadCell key={'u' + c.day} c={c} origin={origin} px={px} row="upper" />
                ))}
                {lower.map((c) => (
                  <HeadCell key={'l' + c.day} c={c} origin={origin} px={px} row="lower" today={today} />
                ))}
              </div>
            </div>
            <div className="tl-body">
              <div className="tl-cols" style={{ width: trackW }} aria-hidden="true">
                {lower.map((c) => (
                  <div
                    key={c.day}
                    className={'tl-col' + (zoom === 'day' && isWeekend(c.day) ? ' weekend' : '')}
                    style={{ left: xOf(c.day, origin, px), width: c.days * px }}
                  />
                ))}
                <div className="tl-today" style={{ left: todayX + px / 2 }} />
                {ghost?.day && <div className="tl-drop-col" style={{ left: xOf(ghost.day, origin, px), width: Math.max(px, 4) }} />}
              </div>
              {empty && (
                <div className="tl-empty">
                  <div className="tl-label tl-empty-label">{undated.length ? t('tasks.timeline.emptyHint') : t('tasks.timeline.empty')}</div>
                </div>
              )}
              {groups.map((g) =>
                g.rows.length === 0 && !g.sectionId ? null : (
                  <section key={g.key} className="tl-group" data-group={g.key}>
                    {(g.sectionId || groups.length > 1) && (
                      <div className="tl-row tl-group-head">
                        <div className="tl-label">
                          <span>{g.name ?? t('tasks.section.none')}</span>
                          <span className="tl-count">{g.rows.length}</span>
                        </div>
                      </div>
                    )}
                    {g.rows.map(({ task }) => {
                      const live = drag?.id === task.id ? drag.span : spanOf(task)
                      return (
                        <div key={task.id} className={'tl-row' + (ui.selectedTaskId === task.id ? ' selected' : '')} data-task-id={task.id}>
                          <button type="button" className="tl-label tl-title" onClick={() => open(task.id)}>
                            {task.title || t('common.untitled')}
                          </button>
                          <div className="tl-track" style={{ width: trackW }}>
                            {live && (
                              <Bar
                                task={task}
                                span={live}
                                origin={origin}
                                px={px}
                                color={color}
                                dragging={drag?.id === task.id ? drag.kind : undefined}
                                visible={dayNum(live.end) >= vis.from - 31 && dayNum(live.start) <= vis.to + 31}
                                onPress={startBarDrag}
                                onOpen={open}
                              />
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </section>
                ),
              )}
            </div>
          </div>
        </div>
        {panel && (
          <aside className="tl-nodate" aria-label={t('tasks.timeline.noDate')}>
            <div className="tl-nodate-head">
              <span>{t('tasks.timeline.noDate')}</span>
              <span className="tl-count">{undated.length}</span>
            </div>
            <p className="tl-nodate-hint">{undated.length ? t('tasks.timeline.noDateHint') : t('tasks.timeline.noDateEmpty')}</p>
            <div className="tl-nodate-list">
              {undated.map((task) => (
                <div
                  key={task.id}
                  className={'tl-nodate-item' + (ghost?.id === task.id ? ' lifted-src' : '') + (ui.selectedTaskId === task.id ? ' selected' : '')}
                  data-task-id={task.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => startPanelDrag(e, task)}
                  onClick={() => open(task.id)}
                  onKeyDown={(e) => e.key === 'Enter' && open(task.id)}
                >
                  <span className="tl-dot" style={{ background: color }} />
                  <span className="tl-nodate-title">{task.title || t('common.untitled')}</span>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
      {ghost && (
        <div className="tl-ghost" style={{ transform: `translate(${ghost.x + 12}px, ${ghost.y - 16}px)` }}>
          <span className="tl-dot" style={{ background: color }} />
          <span>{ghost.title}</span>
          {ghost.day && <span className="tl-ghost-date">{fmtMonthDay(parseISO(ghost.day))}</span>}
        </div>
      )}
    </div>
  )
}

const isWeekend = (day: string) => {
  const w = parseISO(day).getDay()
  return w === 0 || w === 6
}

/** Width of the title column: narrower on tablets. */
function useLabelWidth() {
  const [w, setW] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 1200 ? 160 : 220))
  useEffect(() => {
    const f = () => setW(window.innerWidth < 1200 ? 160 : 220)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  return w
}

function HeadCell({ c, origin, px, row, today }: { c: Tick; origin: string; px: number; row: 'upper' | 'lower'; today?: string }) {
  const d = parseISO(c.day)
  let text: string
  switch (c.kind) {
    case 'year':
      text = fmtYear(d)
      break
    case 'month':
      text = row === 'upper' ? fmtMonthYear(d) : fmtMonthShort(d)
      break
    case 'week':
      text = fmtMonthDay(d)
      break
    default:
      text = fmtDayNum(d)
  }
  const isToday = c.kind === 'day' && c.day === today
  return (
    <div className={'tl-hcell ' + row + (isToday ? ' today' : '')} style={{ left: xOf(c.day, origin, px), width: c.days * px }} data-day={c.day}>
      {c.kind === 'day' ? (
        <span className="tl-hday">
          <small>{fmtWeekday(d, 'narrow')}</small>
          <b>{text}</b>
        </span>
      ) : (
        <span className="tl-hlabel">{text}</span>
      )}
    </div>
  )
}

function Bar({
  task,
  span,
  origin,
  px,
  color,
  dragging,
  visible,
  onPress,
  onOpen,
}: {
  task: Task
  span: Span
  origin: string
  px: number
  color: string
  dragging?: DragKind
  visible: boolean
  onPress: (e: React.PointerEvent, task: Task, kind: DragKind) => void
  onOpen: (id: string) => void
}) {
  const t = useT()
  if (!visible && !dragging) return null
  const one = isMilestone(span)
  // A single day is at least 24 px wide so the diamond and its edges stay easy to grab when zoomed out.
  const raw = barBox(span, origin, px)
  const box = one && raw.width < 24 ? { left: raw.left + raw.width / 2 - 12, width: 24 } : raw
  // too short for its title inside: the title sits after it, like a diamond's
  const narrow = !one && box.width < 64
  const label = `${task.title || t('common.untitled')}, ${rangeText(span)}`
  return (
    <div
      className={'tl-item' + (one ? ' milestone' : ' bar') + (dragging ? ' lifted' : '')}
      style={{ left: box.left, width: box.width, '--bar': color } as CSSProperties}
      data-bar={task.id}
      data-start={span.start}
      data-end={span.end}
    >
      <div
        className="tl-bar-body"
        role="button"
        tabIndex={0}
        aria-label={label}
        title={label}
        onPointerDown={(e) => onPress(e, task, 'move')}
        onClick={() => onOpen(task.id)}
        onKeyDown={(e) => e.key === 'Enter' && onOpen(task.id)}
      >
        {one ? <span className="tl-diamond" /> : !narrow && <span className="tl-bar-title">{task.title || t('common.untitled')}</span>}
      </div>
      {(one || narrow) && <span className="tl-ms-title">{task.title || t('common.untitled')}</span>}
      <span className="tl-handle start" data-edge="start" onPointerDown={(e) => onPress(e, task, 'start')} />
      <span className="tl-handle end" data-edge="end" onPointerDown={(e) => onPress(e, task, 'end')} />
      {dragging && <span className="tl-tip">{rangeText(span)}</span>}
    </div>
  )
}
