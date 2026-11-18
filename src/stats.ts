// Statistics: pure aggregation of tasks, focus records and habit check-ins over a date range.
// Nothing here reads the clock or the store; callers pass the data and "now", so it is easy to test.
import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfYear,
  format,
  getDay,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import { activeTasks } from './views'
import type { AppData, FocusRecord, Habit, HabitFrequency, Priority, Task } from './types'

const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

export type RangeKind = 'week' | 'month' | 'year' | 'last30' | 'custom'
/** The size of one bar in a chart. */
export type Granularity = 'day' | 'week' | 'month'
/** A span of whole days, both ends included (local midnight). */
export interface DateRange {
  start: Date
  end: Date
}

/** The period of `kind` that holds `anchor` (for "last 30 days": the 30 days ending on it). */
export function periodRange(kind: RangeKind, anchor: Date, weekStartsOn: 0 | 1, custom?: DateRange): DateRange {
  const a = startOfDay(anchor)
  switch (kind) {
    case 'week': {
      const start = startOfWeek(a, { weekStartsOn })
      return { start, end: addDays(start, 6) }
    }
    case 'month':
      return { start: startOfMonth(a), end: startOfDay(endOfMonth(a)) }
    case 'year':
      return { start: startOfYear(a), end: startOfDay(endOfYear(a)) }
    case 'last30':
      return { start: addDays(a, -29), end: a }
    case 'custom': {
      if (!custom) return { start: a, end: a }
      const s = startOfDay(custom.start)
      const e = startOfDay(custom.end)
      return s <= e ? { start: s, end: e } : { start: e, end: s }
    }
  }
}

/** The anchor of the previous (`step` −1) or next (+1) period. */
export function shiftPeriod(kind: RangeKind, anchor: Date, step: number): Date {
  switch (kind) {
    case 'week':
      return addDays(anchor, 7 * step)
    case 'month':
      return addMonths(anchor, step)
    case 'year':
      return addYears(anchor, step)
    case 'last30':
      return addDays(anchor, 30 * step)
    case 'custom':
      return anchor
  }
}

export const rangeDays = (r: DateRange) => differenceInCalendarDays(r.end, r.start) + 1

/** Bars per day up to about two months, per week up to half a year, per month beyond. */
export function granularityOf(r: DateRange): Granularity {
  const n = rangeDays(r)
  return n <= 62 ? 'day' : n <= 186 ? 'week' : 'month'
}

export interface Bucket {
  key: string
  /** First and last day of the bucket inside the range. */
  start: Date
  end: Date
}

/** The key of the bucket a day falls in. */
export function bucketKey(d: Date, g: Granularity, weekStartsOn: 0 | 1): string {
  if (g === 'day') return fmt(d)
  if (g === 'week') return fmt(startOfWeek(d, { weekStartsOn }))
  return format(d, 'yyyy-MM')
}

/** The buckets that cover the range, in order; the first and last are cut to the range. */
export function bucketsOf(r: DateRange, g: Granularity, weekStartsOn: 0 | 1): Bucket[] {
  const out: Bucket[] = []
  for (let d = r.start; d <= r.end; d = addDays(d, 1)) {
    const key = bucketKey(d, g, weekStartsOn)
    const last = out[out.length - 1]
    if (last?.key === key) last.end = d
    else out.push({ key, start: d, end: d })
  }
  return out
}

const inRange = (ms: number, r: DateRange) => ms >= r.start.getTime() && ms < addDays(r.end, 1).getTime()

/** Values per bucket: `add(day, amount)` adds to the bucket of that day when it is in the range. */
function series(buckets: Bucket[], g: Granularity, weekStartsOn: 0 | 1) {
  const index = new Map(buckets.map((b, i) => [b.key, i]))
  const values = buckets.map(() => 0)
  return {
    values,
    add(d: Date, amount: number) {
      const i = index.get(bucketKey(d, g, weekStartsOn))
      if (i !== undefined) values[i] += amount
    },
  }
}

/** Gridline values for a chart whose largest value is `max`: 0 and two or three steps above it. */
export function niceTicks(max: number, unit: 'count' | 'ms' | 'ratio' = 'count'): number[] {
  if (unit === 'ratio') return [0, 0.5, 1]
  let step: number
  if (unit === 'ms') {
    const minutes = [5, 10, 15, 30, 60, 120, 180, 240, 360, 480, 600, 900, 1200, 1800, 2400, 3000, 6000]
    const want = max / 60000 / 2
    step = (minutes.find((m) => m >= want) ?? Math.ceil(want / 6000) * 6000) * 60000
  } else {
    const want = Math.max(1, max / 2)
    const mag = 10 ** Math.floor(Math.log10(want))
    step = ([1, 2, 5, 10].map((x) => x * mag).find((x) => x >= want) ?? 10 * mag)
  }
  const n = Math.max(1, Math.ceil(max / step))
  return Array.from({ length: n + 1 }, (_, i) => i * step)
}

/** Longest and current run of consecutive days in a set of yyyy-MM-dd keys; the current run may end yesterday. */
export function dayStreaks(days: Set<string>, today: Date): { current: number; best: number } {
  let d = startOfDay(today)
  if (!days.has(fmt(d))) d = addDays(d, -1)
  let current = 0
  while (days.has(fmt(d))) {
    current++
    d = addDays(d, -1)
  }
  let best = 0
  let run = 0
  let prev: Date | undefined
  for (const k of [...days].sort()) {
    const day = parseISO(k)
    run = prev && differenceInCalendarDays(day, prev) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = day
  }
  return { current, best }
}

// ---------------- Tasks ----------------

export interface Count<K> {
  key: K
  count: number
}

export interface TaskStats {
  /** Tasks completed in the range, and per bucket. */
  completed: number
  series: number[]
  /** Tasks due in the range up to today (won't-do left out), and how many of them are done. */
  due: number
  dueDone: number
  /** dueDone / due, or null when nothing was due. */
  rate: number | null
  /** Open tasks due before today, whatever the range. */
  overdue: number
  /** Completed in the range, by list id ("inbox" for the inbox), most first. */
  byList: Count<string>[]
  /** Completed in the range, by priority, highest priority first. */
  byPriority: Count<Priority>[]
  /** Completed in the range, by tag, most first. */
  byTag: Count<string>[]
  /** Days in a row with at least one completed task, up to today (or yesterday). */
  streak: number
  bestStreak: number
}

const sortCounts = <K,>(m: Map<K, number>): Count<K>[] => [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
const bump = <K,>(m: Map<K, number>, k: K, n = 1) => m.set(k, (m.get(k) ?? 0) + n)

export function taskStats(d: Pick<AppData, 'tasks' | 'lists'>, r: DateRange, weekStartsOn: 0 | 1, now: Date): TaskStats {
  const g = granularityOf(r)
  const s = series(bucketsOf(r, g, weekStartsOn), g, weekStartsOn)
  const live = d.tasks.filter((t) => !t.deleted)
  const done = live.filter((t): t is Task & { completedAt: number } => t.status === 2 && t.completedAt !== undefined)
  const byList = new Map<string, number>()
  const byPriority = new Map<Priority, number>()
  const byTag = new Map<string, number>()
  let completed = 0
  for (const t of done) {
    if (!inRange(t.completedAt, r)) continue
    completed++
    s.add(new Date(t.completedAt), 1)
    bump(byList, t.listId)
    bump(byPriority, t.priority)
    for (const tag of t.tags) bump(byTag, tag)
  }

  const today = fmt(now)
  const from = fmt(r.start)
  const to = fmt(r.end) < today ? fmt(r.end) : today
  let due = 0
  let dueDone = 0
  for (const t of live) {
    if (t.status === -1 || !t.dueDate || t.dueDate < from || t.dueDate > to) continue
    due++
    if (t.status === 2) dueDone++
  }

  const overdue = activeTasks(d).filter((t) => t.status === 0 && !!t.dueDate && t.dueDate < today).length
  const { current, best } = dayStreaks(new Set(done.map((t) => fmt(new Date(t.completedAt)))), now)
  return {
    completed,
    series: s.values,
    due,
    dueDone,
    rate: due ? dueDone / due : null,
    overdue,
    byList: sortCounts(byList),
    byPriority: ([5, 3, 1, 0] as Priority[]).filter((p) => byPriority.has(p)).map((p) => ({ key: p, count: byPriority.get(p)! })),
    byTag: sortCounts(byTag),
    streak: current,
    bestStreak: best,
  }
}

// ---------------- Focus ----------------

export interface FocusStats {
  totalMs: number
  sessions: number
  /** Focus time per bucket (by the day a session started). */
  series: number[]
  /** Focus time in each hour of the day (0–23); a session is split across the hours it spans. */
  hours: number[]
  /** The hour with the most focus time, or null when there is none. */
  bestHour: number | null
  /** Focus time per day over the days of the range that have begun. */
  dailyAvgMs: number
  /** By task id ("" for sessions without a task), most first. */
  byTask: { key: string; ms: number }[]
  /** By the list of the session's task, most first; sessions without a task are left out. */
  byList: { key: string; ms: number }[]
}

export function focusStats(records: FocusRecord[], tasks: Pick<Task, 'id' | 'listId'>[], r: DateRange, weekStartsOn: 0 | 1, now: Date): FocusStats {
  const g = granularityOf(r)
  const s = series(bucketsOf(r, g, weekStartsOn), g, weekStartsOn)
  const hours = Array.from({ length: 24 }, () => 0)
  const byTask = new Map<string, number>()
  const byList = new Map<string, number>()
  const listOf = new Map(tasks.map((t) => [t.id, t.listId]))
  let totalMs = 0
  let sessions = 0
  for (const rec of records) {
    const ms = rec.end - rec.start
    if (ms <= 0 || !inRange(rec.start, r)) continue
    sessions++
    totalMs += ms
    s.add(new Date(rec.start), ms)
    for (let t = rec.start; t < rec.end; ) {
      const d = new Date(t)
      const next = Math.min(rec.end, new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime())
      hours[d.getHours()] += next - t
      t = next
    }
    bump(byTask, rec.taskId ?? '', ms)
    const list = rec.taskId ? listOf.get(rec.taskId) : undefined
    if (list) bump(byList, list, ms)
  }
  let bestHour: number | null = null
  hours.forEach((v, h) => {
    if (v > 0 && (bestHour === null || v > hours[bestHour])) bestHour = h
  })
  const elapsed = Math.max(1, Math.min(rangeDays(r), differenceInCalendarDays(now, r.start) + 1))
  const ms = (m: Map<string, number>) => sortCounts(m).map(({ key, count }) => ({ key, ms: count }))
  return { totalMs, sessions, series: s.values, hours, bestHour, dailyAvgMs: totalMs / elapsed, byTask: ms(byTask), byList: ms(byList) }
}

// ---------------- Habits ----------------

const freqOf = (h: Habit): HabitFrequency => h.frequency ?? { kind: 'daily' }

/** Whether the habit is planned for that day. */
export function habitScheduled(h: Habit, d: Date): boolean {
  const f = freqOf(h)
  if (f.kind === 'days') return f.days.length === 0 || f.days.includes(getDay(d))
  return true
}

/** Check-ins in a row up to today; not checked in yet today doesn't break it, nor do days it isn't planned for. */
export function habitStreak(h: Habit, today: Date = new Date()): number {
  let d = startOfDay(today)
  if (!h.checkins[fmt(d)]) d = addDays(d, -1)
  let n = 0
  for (let i = 0; i < 3660; i++) {
    if (h.checkins[fmt(d)]) n++
    else if (habitScheduled(h, d)) break
    d = addDays(d, -1)
  }
  return n
}

/** The longest run of check-ins (days it isn't planned for don't break a run). */
export function habitBestStreak(h: Habit): number {
  const keys = Object.keys(h.checkins).sort()
  if (!keys.length) return 0
  let best = 0
  let cur = 0
  const end = parseISO(keys[keys.length - 1])
  for (let d = parseISO(keys[0]); d <= end; d = addDays(d, 1)) {
    if (h.checkins[fmt(d)]) best = Math.max(best, ++cur)
    else if (habitScheduled(h, d)) cur = 0
  }
  return best
}

/** The first day a habit counts from: the day it was made, or its first check-in when that is earlier. */
function habitFrom(h: Habit): string {
  const created = fmt(new Date(h.createdAt))
  const first = Object.keys(h.checkins).sort()[0]
  return first && first < created ? first : created
}

/** How much check-in a habit plans for a day: 1 on planned days, times/7 for "N days a week". */
function planned(h: Habit, d: Date): number {
  const f = freqOf(h)
  if (f.kind === 'weekly') return Math.min(7, Math.max(1, f.times)) / 7
  return habitScheduled(h, d) ? 1 : 0
}

export interface HabitRow {
  habit: Habit
  streak: number
  best: number
  /** Check-ins in the range and the share of planned ones (null when none were planned). */
  checked: number
  rate: number | null
}

export interface HabitStats {
  checked: number
  planned: number
  /** checked / planned over every habit, or null when nothing was planned. */
  rate: number | null
  /** The check-in rate per bucket (null for buckets with nothing planned, such as the future). */
  series: (number | null)[]
  habits: HabitRow[]
}

export function habitStats(habits: Habit[], r: DateRange, weekStartsOn: 0 | 1, now: Date): HabitStats {
  const g = granularityOf(r)
  const buckets = bucketsOf(r, g, weekStartsOn)
  const plan = series(buckets, g, weekStartsOn)
  const got = series(buckets, g, weekStartsOn)
  const today = fmt(now)
  const rows: HabitRow[] = []
  for (const h of habits) {
    if (h.archived) continue
    const from = habitFrom(h)
    let hp = 0
    let hc = 0
    for (let d = r.start; d <= r.end; d = addDays(d, 1)) {
      const k = fmt(d)
      if (k > today) break
      const checked = h.checkins[k] ? 1 : 0
      const p = k < from ? 0 : planned(h, d)
      hp += p
      hc += checked
      plan.add(d, p)
      got.add(d, checked)
    }
    rows.push({ habit: h, streak: habitStreak(h, now), best: habitBestStreak(h), checked: hc, rate: hp ? Math.min(1, hc / hp) : null })
  }
  const total = plan.values.reduce((a, b) => a + b, 0)
  const checked = got.values.reduce((a, b) => a + b, 0)
  return {
    checked,
    planned: total,
    rate: total ? Math.min(1, checked / total) : null,
    series: plan.values.map((p, i) => (p ? Math.min(1, got.values[i] / p) : null)),
    habits: rows.sort((a, b) => b.streak - a.streak || (b.rate ?? -1) - (a.rate ?? -1)),
  }
}
