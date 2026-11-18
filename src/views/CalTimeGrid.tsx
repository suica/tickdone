import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { getData, getUI, setUI, toast, updateTask } from '../store'
import { fmt, todayStr } from '../dates'
import { useT } from '../i18n'
import { fmtWeekday } from '../i18n/format'
import type { Task } from '../types'
import { beginDrag } from './calDnd'
import { flyFrom } from './calMotion'
import { CalTask } from './calParts'
import { clamp, DAY_MIN, DEFAULT_DUR, dayLabel, durOf, fmtDur, snapCeil, snapFloor, snapRound, SNAP, timeLabel, timeRange, toHM, toMin, useColorOf, type AddState } from './calUtil'

interface Placed {
  t: Task
  s: number
  e: number
  col: number
  cols: number
}

/** Place the timed tasks of a day side by side where they overlap. */
function layoutDay(tasks: Task[]): Placed[] {
  const items: Placed[] = tasks
    .filter((t) => t.dueTime)
    .map((t) => {
      const s = toMin(t.dueTime!)
      return { t, s, e: Math.min(s + durOf(t), DAY_MIN), col: 0, cols: 1 }
    })
    .sort((a, b) => a.s - b.s || b.e - a.e)
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

type Drag =
  | { kind: 'move'; id: string; day: string | null; allDay: boolean; s: number; len: number }
  | { kind: 'resize'; id: string; day: string; s: number; e: number }
  | { kind: 'create'; day: string; s: number; e: number }

/** Blocks shorter than this (px) show only the title; the time range needs a second line. */
const TWO_LINES = 34

interface Props {
  days: Date[]
  byDay: Map<string, Task[]>
  hourH: number
  labelW: number
  /** The open quick add; a timed one is drawn as a draft block. */
  add: AddState | null
  /** A task just created here: its block expands in. */
  fresh: string | null
  onAdd: (s: AddState) => void
}

/** Week, three-day and day views: an all-day row above a 24-hour grid. */
export function TimeGrid({ days, byDay, hourH, labelW, add, fresh, onAdd }: Props) {
  const colorOf = useColorOf()
  const t = useT()
  const today = todayStr()
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [drag, setDragState] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const setDrag = (d: Drag | null) => {
    dragRef.current = d
    setDragState(d)
  }
  /** After a drop: the block lands from where its preview was. */
  const settle = useRef<{ id: string; from?: DOMRect } | null>(null)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // On entering: scroll to two hours before now when today is shown, otherwise to 8:00.
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const h = days.some((d) => fmt(d) === today) ? Math.max(0, new Date().getHours() - 2) : 8
    el.scrollTop = h * hourH
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length, hourH])

  useLayoutEffect(() => {
    const s = settle.current
    if (!s) return
    settle.current = null
    const el = rootRef.current?.querySelector(`[data-block-id="${s.id}"]`) ?? rootRef.current?.querySelector(`.cal-allday [data-task-id="${s.id}"]`)
    if (el) flyFrom(el, s.from, 1.02)
  })

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const cols = `${labelW}px repeat(${days.length}, minmax(0, 1fr))`
  const taskOf = (id: string) => getData().tasks.find((t) => t.id === id)
  const own = <T extends Element>(el: T | null | undefined) => (el && rootRef.current?.contains(el) ? el : null)
  const colAt = (el: Element | null | undefined) => own(el?.closest<HTMLElement>('.cal-col[data-day]'))
  const allDayAt = (el: Element | null | undefined) => own(el?.closest<HTMLElement>('.cal-allday-cell[data-day]'))
  const minuteAt = (y: number, col: Element) => ((y - col.getBoundingClientRect().top) / hourH) * 60
  const px = (m: number) => (m / 60) * hourH

  const blankClick = (fn: () => void) => {
    if (getUI().selectedTaskId) return setUI({ selectedTaskId: undefined })
    fn()
  }

  // ---- move a task: within the grid (snapped to 15 minutes), between days, to and from the all-day row ----
  const startMove = (e: ReactPointerEvent<HTMLElement>, task: Task, fromAllDay: boolean, source?: HTMLElement) => {
    const src = source ?? e.currentTarget
    const len = durOf(task)
    const col = colAt(src)
    const grab = !fromAllDay && task.dueTime && col ? minuteAt(e.clientY, col) - toMin(task.dueTime) : Math.min(SNAP, len / 2)
    const base = { kind: 'move' as const, id: task.id, len }
    beginDrag(e.nativeEvent, {
      source: src,
      ghost: false,
      onStart: () => setDrag({ ...base, day: task.dueDate ?? null, allDay: fromAllDay, s: task.dueTime ? toMin(task.dueTime) : 0 }),
      onMove: (c) => {
        const colEl = colAt(c.hit)
        if (colEl) {
          const s = clamp(snapRound(minuteAt(c.y, colEl) - grab), 0, DAY_MIN - SNAP)
          return setDrag({ ...base, day: colEl.dataset.day!, allDay: false, s })
        }
        const cell = allDayAt(c.hit)
        setDrag({ ...base, day: cell ? cell.dataset.day! : null, allDay: true, s: 0 })
      },
      onDrop: () => {
        const d = dragRef.current
        const cur = taskOf(task.id)
        if (!d || d.kind !== 'move' || !d.day || !cur) return false
        let patch: Partial<Task>
        let text: string
        if (d.allDay) {
          if (!cur.dueTime && cur.dueDate === d.day) return false
          patch = cur.dueTime ? { dueDate: d.day, dueTime: undefined, reminder: undefined, duration: undefined } : { dueDate: d.day }
          text = cur.dueTime ? t('calendar.toast.movedToAllDay', { date: dayLabel(d.day) }) : t('calendar.toast.movedToDay', { date: dayLabel(d.day) })
        } else {
          const hm = toHM(d.s)
          if (cur.dueTime === hm && cur.dueDate === d.day) return false
          patch = { dueDate: d.day, dueTime: hm }
          text = t('calendar.toast.movedToTime', { date: dayLabel(d.day), time: timeLabel(d.s) })
        }
        const snap = getData()
        settle.current = { id: task.id, from: rootRef.current?.querySelector('.cal-preview')?.getBoundingClientRect() }
        updateTask(task.id, patch)
        toast(text, snap)
        return true
      },
      onEnd: () => setDrag(null),
    })
  }

  // ---- drag the bottom edge of a block: change its length ----
  const startResize = (e: ReactPointerEvent<HTMLElement>, task: Task) => {
    e.stopPropagation()
    if (!task.dueDate || !task.dueTime) return
    const day = task.dueDate
    const s = toMin(task.dueTime)
    const block = e.currentTarget.closest<HTMLElement>('.cal-task') ?? e.currentTarget
    // Touch hit-testing can hand the edge to a finger that landed higher up on a short block: that is a move.
    if (e.pointerType === 'touch' && e.clientY < block.getBoundingClientRect().bottom - e.currentTarget.offsetHeight) return startMove(e, task, false, block)
    beginDrag(e.nativeEvent, {
      source: block,
      ghost: false,
      onStart: () => setDrag({ kind: 'resize', id: task.id, day, s, e: Math.min(s + durOf(task), DAY_MIN) }),
      onMove: (c) => {
        const colEl = rootRef.current?.querySelector<HTMLElement>(`.cal-col[data-day="${day}"]`)
        if (!colEl) return
        setDrag({ kind: 'resize', id: task.id, day, s, e: clamp(snapRound(minuteAt(c.y, colEl)), s + SNAP, DAY_MIN) })
      },
      onDrop: () => {
        const d = dragRef.current
        const cur = taskOf(task.id)
        if (!d || d.kind !== 'resize' || !cur) return false
        const len = d.e - d.s
        if (len === Math.min(durOf(cur), DAY_MIN - s)) return false
        const snap = getData()
        updateTask(task.id, { duration: len })
        toast(t('calendar.toast.duration', { duration: fmtDur(len) }), snap)
        return true
      },
      onEnd: () => setDrag(null),
    })
  }

  // ---- press and drag on empty time: draw a range, then name the new task ----
  const startCreate = (e: ReactPointerEvent<HTMLDivElement>, ds: string) => {
    if ((e.target as Element).closest('.cal-task, .cal-block-wrap')) return
    const col = e.currentTarget
    const anchor = clamp(snapFloor(minuteAt(e.clientY, col)), 0, DAY_MIN - SNAP)
    let moved = false
    beginDrag(e.nativeEvent, {
      source: col,
      ghost: false,
      onStart: () => setDrag({ kind: 'create', day: ds, s: anchor, e: anchor + SNAP }),
      onMove: (c) => {
        const m = clamp(minuteAt(c.y, col), 0, DAY_MIN)
        const s = m < anchor ? snapFloor(m) : anchor
        const en = m < anchor ? anchor + SNAP : Math.max(anchor + SNAP, snapCeil(m))
        if (s !== anchor || en !== anchor + SNAP) moved = true
        setDrag({ kind: 'create', day: ds, s, e: en })
      },
      onDrop: (c) => {
        const d = dragRef.current
        if (!d || d.kind !== 'create') return false
        const end = moved ? d.e : Math.min(d.s + DEFAULT_DUR, DAY_MIN)
        const r = rootRef.current?.querySelector('.cal-draft')?.getBoundingClientRect()
        onAdd({ date: ds, time: toHM(d.s), duration: end - d.s, anchor: r ? { x: r.right + 6, y: r.top, h: 0 } : { x: c.x, y: c.y, h: 0 } })
        return true
      },
      onEnd: () => setDrag(null),
    })
  }

  // The draft block: the range being drawn, or the open quick add of this grid.
  let draft: { day: string; s: number; e: number } | null = null
  if (drag?.kind === 'create') draft = drag
  else if (add?.time && days.some((d) => fmt(d) === add.date)) {
    const s = toMin(add.time)
    draft = { day: add.date, s, e: Math.min(s + (add.duration ?? DEFAULT_DUR), DAY_MIN) }
  }
  const moving = drag?.kind === 'move' ? drag : null
  const movingTask = moving ? taskOf(moving.id) : undefined

  return (
    <div className={'cal-time' + (days.length === 1 ? ' single' : '')} ref={rootRef} data-slide style={{ '--hour-h': `${hourH}px` } as CSSProperties}>
      <div className="cal-time-head" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => {
          const ds = fmt(d)
          return (
            <div key={ds} className={'cal-time-day' + (ds === today ? ' today' : '')}>
              <span className="wd">{fmtWeekday(d)}</span>
              <span className="num">{d.getDate()}</span>
            </div>
          )
        })}
      </div>
      <div className="cal-allday" style={{ gridTemplateColumns: cols }}>
        <div className="cal-allday-label">{t('calendar.allDay')}</div>
        {days.map((d) => {
          const ds = fmt(d)
          const list = (byDay.get(ds) ?? []).filter((t) => !t.dueTime)
          const over = moving?.allDay && moving.day === ds
          return (
            <div
              key={ds}
              className={'cal-allday-cell' + (over ? ' drag-over' : '')}
              data-day={ds}
              onClick={(e) => blankClick(() => onAdd({ date: ds, anchor: { x: e.clientX, y: e.clientY + 4, h: 8 } }))}
            >
              {list.map((t) => (
                <CalTask key={t.id} task={t} color={colorOf(t)} className={moving?.id === t.id ? 'cal-src' : ''} onPointerDown={(e) => startMove(e, t, true)} />
              ))}
              {over && movingTask && (movingTask.dueTime || movingTask.dueDate !== ds) && (
                <div className="cal-preview cal-preview-chip">
                  <CalTask task={movingTask} color={colorOf(movingTask)} className="lifted" />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="cal-time-body" ref={bodyRef}>
        <div className="cal-time-inner" style={{ gridTemplateColumns: cols, height: 24 * hourH }}>
          <div className="cal-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="cal-hour-label" style={{ top: h * hourH }}>
                {h === 0 ? '' : timeLabel(h * 60)}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const ds = fmt(d)
            const placed = layoutDay(byDay.get(ds) ?? [])
            return (
              <div
                key={ds}
                className={'cal-col' + (ds === today ? ' today' : '')}
                data-day={ds}
                onPointerDown={(e) => startCreate(e, ds)}
                onClick={(e) => {
                  const m = clamp(Math.floor(minuteAt(e.clientY, e.currentTarget) / 30) * 30, 0, DAY_MIN - 30)
                  blankClick(() => onAdd({ date: ds, time: toHM(m), anchor: { x: e.clientX, y: e.clientY + 4, h: 8 } }))
                }}
              >
                {placed.map((p) => {
                  const t = p.t
                  const resizing = drag?.kind === 'resize' && drag.id === t.id ? drag : null
                  const end = resizing ? resizing.e : p.e
                  const height = Math.max(20, px(end - p.s)) - 2
                  return (
                    <div
                      key={t.id}
                      className={'cal-block-wrap' + (height < TWO_LINES ? ' short' : '') + (moving?.id === t.id ? ' cal-src' : '') + (resizing ? ' resizing' : '') + (fresh === t.id ? ' cal-fresh' : '')}
                      data-block-id={t.id}
                      style={{
                        top: px(p.s),
                        height,
                        left: `calc(${(p.col / p.cols) * 100}% + 1px)`,
                        width: `calc(${100 / p.cols}% - 3px)`,
                      }}
                    >
                      <CalTask
                        task={t}
                        color={colorOf(t)}
                        block
                        range={resizing ? timeRange(p.s, end) : undefined}
                        onPointerDown={(e) => startMove(e, t, false)}
                        onResizeDown={(e) => startResize(e, t)}
                      />
                    </div>
                  )
                })}
                {moving && !moving.allDay && moving.day === ds && movingTask && (
                  <div
                    className={'cal-block-wrap cal-preview' + (px(Math.min(moving.len, DAY_MIN - moving.s)) - 2 < TWO_LINES ? ' short' : '')}
                    style={{ top: px(moving.s), height: Math.max(20, px(Math.min(moving.len, DAY_MIN - moving.s))) - 2, left: 1, width: 'calc(100% - 3px)' }}
                  >
                    <CalTask task={movingTask} color={colorOf(movingTask)} block className="lifted" range={timeRange(moving.s, Math.min(moving.s + moving.len, DAY_MIN))} />
                  </div>
                )}
                {draft && draft.day === ds && (
                  <div className="cal-block-wrap cal-draft" style={{ top: px(draft.s), height: Math.max(20, px(draft.e - draft.s)) - 2, left: 1, width: 'calc(100% - 3px)' }}>
                    <div className="cal-draft-box">
                      <span className="cal-draft-title">{t('common.untitled')}</span>
                      <span className="cal-draft-range">{timeRange(draft.s, draft.e)}</span>
                    </div>
                  </div>
                )}
                {ds === today && (
                  <div className="cal-now" style={{ top: px(nowMin) }}>
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
