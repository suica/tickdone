// The timeline view's maths, kept free of the DOM so it can be unit tested: where a task's bar starts and
// ends, how days map to pixels at each zoom, which columns are on screen, and what a drop changes.
import type { Task } from '../types'
import { dayNum, dayStr } from '../repeat'

export type Zoom = 'day' | 'week' | 'month'
export const ZOOMS: Zoom[] = ['day', 'week', 'month']

/** Width of one day at each zoom, in pixels. */
export const DAY_PX: Record<Zoom, number> = { day: 44, week: 16, month: 4 }

const DAY_MIN = 24 * 60

/** The days a task covers, inclusive (yyyy-MM-dd); null for a task without a date. */
export interface Span {
  start: string
  end: string
}

/** Days a timed task runs past its due day, from its time and duration (a 22:00 task of 4 hours ends the next day). */
export function spillDays(t: Pick<Task, 'dueTime' | 'duration'>): number {
  if (!t.dueTime || !t.duration || t.duration <= 0) return 0
  const [h, m] = t.dueTime.split(':').map(Number)
  return Math.max(0, Math.floor((h * 60 + m + t.duration - 1) / DAY_MIN))
}

/**
 * The bar of a task: from `spanDays` days before its due date to its due date, plus the days a timed
 * task's duration runs on. A task with a single day is a milestone (drawn as a diamond).
 */
export function spanOf(t: Pick<Task, 'dueDate' | 'dueTime' | 'duration' | 'spanDays'>): Span | null {
  if (!t.dueDate) return null
  const due = dayNum(t.dueDate)
  const lead = Math.max(0, Math.round(t.spanDays ?? 0))
  return { start: dayStr(due - lead), end: dayStr(due + spillDays(t)) }
}

export const spanLength = (s: Span) => dayNum(s.end) - dayNum(s.start) + 1
export const isMilestone = (s: Span) => s.start === s.end

// ---- Days and pixels ----

/** x of the left edge of `day`, with `origin` at x = 0. */
export const xOf = (day: string, origin: string, px: number) => (dayNum(day) - dayNum(origin)) * px

/** The day under x (any x inside a day's column gives that day). */
export const dayAt = (x: number, origin: string, px: number) => dayStr(dayNum(origin) + Math.floor(x / px))

/** Whole days a horizontal drag of `dx` pixels moves by, rounded to the nearest day. */
export const daysFor = (dx: number, px: number) => {
  const n = Math.round(dx / px)
  return n === 0 ? 0 : n // no -0
}

/** Left and width of a bar; milestones are one day wide, centred on their day. */
export function barBox(s: Span, origin: string, px: number): { left: number; width: number } {
  return { left: xOf(s.start, origin, px), width: spanLength(s) * px }
}

/** The days to render for a scroll position: what is on screen plus `buffer` pixels either side, clamped to the range. */
export function visibleDays(scrollLeft: number, viewWidth: number, px: number, origin: string, total: number, buffer = 400): { from: number; to: number } {
  const from = Math.max(0, Math.floor((scrollLeft - buffer) / px))
  const to = Math.min(total - 1, Math.ceil((scrollLeft + viewWidth + buffer) / px))
  return { from: dayNum(origin) + from, to: dayNum(origin) + to }
}

export interface Tick {
  /** First day of the cell */
  day: string
  /** Days the cell spans (cut at the edges of the rendered window) */
  days: number
  kind: 'day' | 'week' | 'month' | 'year'
}

const ymd = (n: number) => dayStr(n).split('-').map(Number)
const weekday = (n: number) => (((n + 4) % 7) + 7) % 7

/** Whether day number `n` starts a cell of `kind`. */
function starts(n: number, kind: Tick['kind'], weekStartsOn: 0 | 1) {
  if (kind === 'day') return true
  if (kind === 'week') return weekday(n) === weekStartsOn
  const [, m, d] = ymd(n)
  return kind === 'month' ? d === 1 : d === 1 && m === 1
}

/** Header cells of one kind between day numbers `from` and `to` (inclusive). */
export function ticks(from: number, to: number, kind: Tick['kind'], weekStartsOn: 0 | 1 = 1): Tick[] {
  const out: Tick[] = []
  let cur = from
  for (let n = from + 1; n <= to + 1; n++) {
    if (n === to + 1 || starts(n, kind, weekStartsOn)) {
      out.push({ day: dayStr(cur), days: n - cur, kind })
      cur = n
    }
  }
  return out
}

/** The two header rows at each zoom: the upper groups the lower. */
export const HEADER: Record<Zoom, [Tick['kind'], Tick['kind']]> = { day: ['month', 'day'], week: ['month', 'week'], month: ['year', 'month'] }

/**
 * The days the timeline covers: a margin around today and every bar, so there is room to drag. It only
 * grows (see `grow`), which keeps the scroll position steady while you work.
 */
export function rangeFor(spans: Span[], today: string, before = 60, after = 120): { start: string; end: string } {
  let lo = dayNum(today) - before
  let hi = dayNum(today) + after
  for (const s of spans) {
    lo = Math.min(lo, dayNum(s.start) - 14)
    hi = Math.max(hi, dayNum(s.end) + 14)
  }
  return { start: dayStr(lo), end: dayStr(hi) }
}

// ---- Drop rules ----

const plus = (day: string, n: number) => dayStr(dayNum(day) + n)
const clipToDay = (t: Pick<Task, 'dueTime' | 'duration'>) => {
  if (!t.dueTime || !t.duration) return t.duration
  const [h, m] = t.dueTime.split(':').map(Number)
  return Math.min(t.duration, DAY_MIN - (h * 60 + m))
}
const lead = (n: number) => (n > 0 ? n : undefined)

/** Moving the whole bar by `days`: the due date moves and the shape is kept. Null when nothing changes. */
export function moveBy(t: Task, days: number): Partial<Task> | null {
  if (!t.dueDate || days === 0) return null
  return { dueDate: plus(t.dueDate, days) }
}

/**
 * Dragging the start edge to `day`. The start cannot pass the due date; dragging it there makes the task
 * a single day again.
 */
export function setStart(t: Task, day: string): Partial<Task> | null {
  const s = spanOf(t)
  if (!s || !t.dueDate) return null
  const start = dayNum(day) > dayNum(t.dueDate) ? t.dueDate : day
  if (start === s.start) return null
  return { spanDays: lead(dayNum(t.dueDate) - dayNum(start)) }
}

/**
 * Dragging the end edge to `day`. The end cannot pass the start. A date-only task's due date becomes the
 * new end and its start stays put. A timed task keeps its start time: its duration grows or shrinks to
 * end on the new day at the same clock time, and if the end moves before its due day, the due date
 * follows and the duration is cut to that day.
 */
export function setEnd(t: Task, day: string): Partial<Task> | null {
  const s = spanOf(t)
  if (!s || !t.dueDate) return null
  const end = dayNum(day) < dayNum(s.start) ? s.start : day
  if (end === s.end) return null
  const due = dayNum(t.dueDate)
  const startN = dayNum(s.start)
  const endN = dayNum(end)
  if (t.dueTime && t.duration && endN >= due) {
    const [h, m] = t.dueTime.split(':').map(Number)
    const startMin = h * 60 + m
    const endClock = ((startMin + t.duration - 1) % DAY_MIN) + 1
    const days = endN - due
    const duration = days === 0 ? clipToDay(t) : days * DAY_MIN + endClock - startMin
    return { duration }
  }
  return { dueDate: end, spanDays: lead(endN - startN), ...(t.dueTime && t.duration ? { duration: clipToDay(t) } : {}) }
}

/** Dropping an undated task on `day`: it becomes a single-day task due that day. */
export function scheduleOn(t: Task, day: string): Partial<Task> | null {
  if (t.dueDate === day && !t.spanDays) return null
  return { dueDate: day, spanDays: undefined }
}

/** The change a drag makes, by what was dragged: the whole bar, one of its edges, or an undated task. */
export type DragKind = 'move' | 'start' | 'end' | 'schedule'

export function dropPatch(t: Task, kind: DragKind, deltaDays: number, day: string): Partial<Task> | null {
  const s = spanOf(t)
  switch (kind) {
    case 'move':
      return moveBy(t, deltaDays)
    case 'start':
      return s ? setStart(t, plus(s.start, deltaDays)) : null
    case 'end':
      return s ? setEnd(t, plus(s.end, deltaDays)) : null
    case 'schedule':
      return scheduleOn(t, day)
  }
}

/** The span a task would have after a patch (for the live preview and the toast). */
export const spanAfter = (t: Task, p: Partial<Task> | null) => spanOf(p ? { ...t, ...p } : t)

/**
 * Rows of the timeline, grouped like the list: by section when the list has sections (tasks without one
 * last), otherwise one group. Tasks keep the list's order within a group, with dated tasks first.
 */
export interface Row {
  task: Task
  span: Span | null
}
export interface RowGroup {
  key: string
  sectionId?: string
  name?: string
  rows: Row[]
}

export function groupRows(tasks: Task[], sections: { id: string; name: string }[]): RowGroup[] {
  const rows = tasks.map((task) => ({ task, span: spanOf(task) }))
  const byStart = (a: Row, b: Row) => (a.span && b.span ? a.span.start.localeCompare(b.span.start) || a.task.order - b.task.order : a.task.order - b.task.order)
  if (!sections.length) return [{ key: 'all', rows: rows.sort(byStart) }]
  const known = new Set(sections.map((s) => s.id))
  const groups: RowGroup[] = sections.map((s) => ({ key: s.id, sectionId: s.id, name: s.name, rows: [] }))
  const rest: RowGroup = { key: 'none', rows: [] }
  for (const r of rows) {
    const g = r.task.sectionId && known.has(r.task.sectionId) ? groups.find((x) => x.sectionId === r.task.sectionId)! : rest
    g.rows.push(r)
  }
  for (const g of [...groups, rest]) g.rows.sort(byStart)
  return [...groups, rest]
}
