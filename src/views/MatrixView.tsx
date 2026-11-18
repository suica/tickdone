import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { addDays, parseISO } from 'date-fns'
import { getData, setData, toast, updateTask, useData, useUI } from '../store'
import { fmt, todayStr } from '../dates'
import { sortTasks } from '../views'
import type { Priority, Task } from '../types'
import { usePhone } from '../viewport'
import { useT, type MessageKey } from '../i18n'
import { Icon } from '../components/Icon'
import { Popover, MenuList, anchorOf, type Anchor } from '../components/Popover'
import { TaskRow } from '../components/TaskRow'
import { QuickAdd } from '../components/QuickAdd'
import { TaskDetail } from '../components/TaskDetail'
import { beginDrag, useTouchGuard } from './calDnd'
import { dur, easing, flyFrom, glide, measure } from './calMotion'
import { isTyping } from './calUtil'
import './matrix.css'

type Range = 'today' | 'week' | 'all'
type Sort = 'date' | 'custom'
const RANGE_NAME: Record<Range, MessageKey> = { today: 'common.today', week: 'common.list.next7Days', all: 'common.list.all' }
const RANGE_KEY = 'tickdone:matrix-range'
const SORT_KEY = 'tickdone:matrix-sort'

// A quadrant is a priority: dropping a task into a quadrant gives it that priority.
const QUADS: { p: Priority; no: string; name: MessageKey; color: string }[] = [
  { p: 5, no: 'I', name: 'calendar.matrix.q1', color: 'var(--p-high)' },
  { p: 3, no: 'II', name: 'calendar.matrix.q2', color: 'var(--p-med)' },
  { p: 1, no: 'III', name: 'calendar.matrix.q3', color: 'var(--p-low)' },
  { p: 0, no: 'IV', name: 'calendar.matrix.q4', color: 'var(--q-none)' },
]

function load<T extends string>(key: string, fallback: T): Record<number, T> {
  const base = { 5: fallback, 3: fallback, 1: fallback, 0: fallback }
  try {
    const raw = localStorage.getItem(key)
    if (raw) return { ...base, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return base
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

function inRange(t: Task, r: Range, today: string, week: string) {
  if (r === 'all') return true
  if (!t.dueDate) return false
  return r === 'today' ? t.dueDate <= today : t.dueDate <= week
}

/**
 * Put task `id` at `index` among the tasks shown in a quadrant (`ids`, in display order). The quadrant
 * reuses the order values its tasks already had, so tasks elsewhere keep their relative order.
 */
function placeInQuadrant(ids: string[], id: string, index: number, patch: Partial<Task>) {
  setData((d) => {
    const byId = new Map(d.tasks.map((t) => [t.id, t]))
    if (!byId.has(id)) return d
    const rest = ids.filter((x) => x !== id && byId.has(x))
    const seq = [...rest.slice(0, index), id, ...rest.slice(index)]
    const slots = seq.map((x) => byId.get(x)!.order).sort((a, b) => a - b)
    for (let i = 1; i < slots.length; i++) if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 0.001
    const next = new Map(seq.map((x, i) => [x, slots[i]]))
    const now = Date.now()
    return {
      ...d,
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch, order: next.get(id)!, modifiedAt: now } : next.has(t.id) ? { ...t, order: next.get(t.id)! } : t)),
    }
  })
}

const noNativeDrag = (e: { preventDefault(): void; stopPropagation(): void }) => {
  e.preventDefault()
  e.stopPropagation()
}

interface DragState {
  id: string
  from: Priority
  over: Priority | null
  /** Insertion index among the target's rows (without the dragged one); null = no position shown. */
  index: number | null
  lineTop: number
}

export default function MatrixView() {
  const data = useData()
  const ui = useUI()
  const t = useT()
  const phone = usePhone()
  const [ranges, setRanges] = useState<Record<number, Range>>(() => load<Range>(RANGE_KEY, 'all'))
  const [sorts, setSorts] = useState<Record<number, Sort>>(() => load<Sort>(SORT_KEY, 'date'))
  const [menu, setMenu] = useState<{ p: Priority; anchor: Anchor } | null>(null)
  const [drag, setDragState] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const setDrag = (d: DragState | null) => {
    dragRef.current = d
    setDragState(d)
  }
  const [expandedP, setExpanded] = useState<Priority | null>(null)
  const expanded = phone ? expandedP : null
  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const pendingDrop = useRef<{ before: Map<string, DOMRect>; id: string; from?: DOMRect } | null>(null)
  const pendingExpand = useRef<{ before: Map<string, DOMRect>; p: Priority; opening: boolean } | null>(null)
  useTouchGuard(rootRef)

  const setRange = (p: Priority, r: Range) => {
    const next = { ...ranges, [p]: r }
    setRanges(next)
    save(RANGE_KEY, next)
  }
  const setSort = (p: Priority, s: Sort) => {
    const next = { ...sorts, [p]: s }
    setSorts(next)
    save(SORT_KEY, next)
  }

  const byQuad = useMemo(() => {
    const today = todayStr()
    const week = fmt(addDays(parseISO(today), 6))
    const live = data.tasks.filter((t) => !t.deleted && t.status === 0 && !t.parentId)
    const m: Record<number, Task[]> = {}
    for (const q of QUADS) m[q.p] = sortTasks(live.filter((t) => t.priority === q.p && inRange(t, ranges[q.p], today, week)), sorts[q.p] === 'custom' ? 'custom' : 'date')
    return m
  }, [data.tasks, ranges, sorts])
  const byQuadRef = useRef(byQuad)
  useLayoutEffect(() => {
    byQuadRef.current = byQuad
  })

  // After a drop: the other rows glide to their new places and the dropped one lands from the pointer.
  useLayoutEffect(() => {
    const p = pendingDrop.current
    if (!p) return
    pendingDrop.current = null
    glide(gridRef.current, p.before, 'data-id', p.id)
    const el = gridRef.current?.querySelector(`.matrix-item[data-id="${p.id}"]`)
    if (el) flyFrom(el, p.from, 1.02)
  })

  // Phone: a quadrant opens to fill the grid and closes back into its cell.
  useLayoutEffect(() => {
    const p = pendingExpand.current
    if (!p) return
    pendingExpand.current = null
    const d = dur('--dur-slow')
    const el = gridRef.current?.querySelector<HTMLElement>(`.matrix-quad[data-p="${p.p}"]`)
    const first = p.before.get(String(p.p))
    if (!d || !el || !first) return
    const last = el.getBoundingClientRect()
    const e = easing('--ease-out')
    el.animate(
      [
        { transformOrigin: 'top left', transform: `translate(${first.left - last.left}px, ${first.top - last.top}px) scale(${first.width / last.width}, ${first.height / last.height})` },
        { transformOrigin: 'top left', transform: 'none' },
      ],
      { duration: d, easing: e },
    )
    if (!p.opening)
      gridRef.current?.querySelectorAll<HTMLElement>('.matrix-quad').forEach((q) => {
        if (q !== el) q.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d, easing: e })
      })
  })

  const toggleExpand = (p: Priority) => {
    if (!phone) return
    pendingExpand.current = { before: measure(gridRef.current, 'data-p'), p, opening: expanded !== p }
    setExpanded(expanded === p ? null : p)
  }

  /** Drag a row: to another quadrant (priority) or to another place in its own quadrant (order). */
  const startDrag = (e: ReactPointerEvent<HTMLElement>, task: Task) => {
    const id = task.id
    const from = task.priority
    beginDrag(e.nativeEvent, {
      source: e.currentTarget,
      onStart: () => setDrag({ id, from, over: from, index: null, lineTop: 0 }),
      onMove: (c) => {
        const quad = c.hit?.closest<HTMLElement>('.matrix-quad[data-p]')
        if (!quad || !gridRef.current?.contains(quad)) return setDrag({ id, from, over: null, index: null, lineTop: 0 })
        const over = Number(quad.dataset.p) as Priority
        // Position only matters where the order is visible: the own quadrant, or one sorted by hand.
        if (over !== from && sorts[over] !== 'custom') return setDrag({ id, from, over, index: null, lineTop: 0 })
        const items = [...quad.querySelectorAll<HTMLElement>('.matrix-item')].filter((el) => el.dataset.id !== id)
        let index = items.findIndex((el) => {
          const r = el.getBoundingClientRect()
          return c.y < r.top + r.height / 2
        })
        if (index < 0) index = items.length
        const lineTop = items.length === 0 ? 0 : index < items.length ? items[index].offsetTop : items[items.length - 1].offsetTop + items[items.length - 1].offsetHeight
        setDrag({ id, from, over, index, lineTop })
      },
      onDrop: (c) => {
        const d = dragRef.current
        const cur = getData().tasks.find((x) => x.id === id)
        if (!d || d.over === null || !cur) return false
        const ids = (byQuadRef.current[d.over] ?? []).map((x) => x.id)
        const before = measure(gridRef.current, 'data-id')
        if (d.over === cur.priority) {
          if (d.index === null || ids.indexOf(id) === d.index) return false
          pendingDrop.current = { before, id, from: c.ghostRect }
          placeInQuadrant(ids, id, d.index, {})
          if (sorts[d.over] !== 'custom') setSort(d.over, 'custom')
          return true
        }
        const q = QUADS.find((x) => x.p === d.over)!
        const snap = getData()
        pendingDrop.current = { before, id, from: c.ghostRect }
        if (d.index !== null) placeInQuadrant(ids, id, d.index, { priority: d.over })
        else updateTask(id, { priority: d.over })
        toast(t('calendar.matrix.movedTo', { name: t(q.name) }), snap)
        return true
      },
      onEnd: () => setDrag(null),
    })
  }

  return (
    <div className={'module matrix-module' + (phone ? ' phone' : '')} ref={rootRef}>
      <div className="matrix-main">
        <div className="matrix-head">
          <h1>{t('common.module.matrix')}</h1>
        </div>
        <div className={'matrix-grid' + (expanded !== null ? ' has-expanded' : '')} ref={gridRef}>
          {QUADS.map((q) => {
            const tasks = byQuad[q.p]
            const open = expanded === q.p
            const over = drag?.over === q.p && (drag.from !== q.p || drag.index !== null)
            return (
              <section
                key={q.p}
                data-p={q.p}
                className={'matrix-quad' + (over ? ' drag-over' : '') + (open ? ' expanded' : '') + (expanded !== null && !open ? ' folded' : '')}
                style={{ ['--q' as string]: q.color }}
                aria-hidden={expanded !== null && !open ? true : undefined}
              >
                <header
                  className="matrix-quad-head"
                  onClick={() => toggleExpand(q.p)}
                  {...(phone ? { role: 'button', 'aria-expanded': open, tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && toggleExpand(q.p) } : {})}
                >
                  <span className="matrix-no">{q.no}</span>
                  <span className="matrix-name">{t(q.name)}</span>
                  {ranges[q.p] !== 'all' && <span className="matrix-range">{t(RANGE_NAME[ranges[q.p]])}</span>}
                  <span className="matrix-count">{tasks.length || ''}</span>
                  {phone && <Icon name="chevronDown" size={16} className={'matrix-fold' + (open ? ' open' : '')} />}
                  <button
                    className="icon-btn matrix-more"
                    title={t('common.more')}
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenu({ p: q.p, anchor: anchorOf(e.currentTarget) })
                    }}
                  >
                    <Icon name="more" size={16} />
                  </button>
                </header>
                <div className="matrix-body">
                  {tasks.length === 0 ? (
                    <div className="matrix-empty">{t('calendar.noTasks')}</div>
                  ) : (
                    tasks.map((t) => (
                      <div
                        key={t.id}
                        className={'matrix-item' + (drag?.id === t.id ? ' cal-src' : '')}
                        data-id={t.id}
                        onPointerDownCapture={(e) => {
                          if (e.pointerType === 'mouse' && isTyping(e.target)) return
                          e.stopPropagation()
                          startDrag(e, t)
                        }}
                        onDragStartCapture={noNativeDrag}
                      >
                        <TaskRow task={t} showList />
                      </div>
                    ))
                  )}
                  {drag?.over === q.p && drag.index !== null && <div className="matrix-drop-line" style={{ top: drag.lineTop - 1 }} />}
                </div>
                <div className="matrix-add">
                  <QuickAdd defaults={{ priority: q.p }} placeholder={t('calendar.matrix.addTo', { name: t(q.name) })} compact />
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
              { label: t('calendar.matrix.show'), disabled: true },
              ...(['today', 'week', 'all'] as Range[]).map((r) => ({
                label: t(RANGE_NAME[r]),
                icon: <Icon name={r === 'today' ? 'today' : r === 'week' ? 'week' : 'inbox'} size={16} />,
                checked: ranges[menu.p] === r,
                onClick: () => setRange(menu.p, r),
              })),
              { divider: true },
              { label: t('calendar.matrix.sort'), disabled: true },
              { label: t('calendar.matrix.sortByTime'), icon: <Icon name="clock" size={16} />, checked: sorts[menu.p] !== 'custom', onClick: () => setSort(menu.p, 'date') },
              { label: t('calendar.matrix.sortCustom'), icon: <Icon name="drag" size={16} />, checked: sorts[menu.p] === 'custom', onClick: () => setSort(menu.p, 'custom') },
            ]}
          />
        </Popover>
      )}
      {ui.selectedTaskId && <TaskDetail floating />}
    </div>
  )
}
