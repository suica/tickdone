import type { RepeatRule, Task } from './types'

// Repeat rules: the next date of a repeating task, the end of a series and the migration of rules
// saved before they had explicit days.
//
// Dates are "yyyy-MM-dd" strings and all arithmetic is done on calendar day numbers (days since
// 1970-01-01, computed in UTC), so daylight saving changes and the local time zone never move a date.

/** A calendar date as its day number (days since 1970-01-01). */
export function dayNum(s: string): number {
  const [y, m, d] = s.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 864e5)
}

/** The "yyyy-MM-dd" text of a day number. */
export function dayStr(n: number): string {
  return new Date(n * 864e5).toISOString().slice(0, 10)
}

const ymd = (s: string) => s.split('-').map(Number) as [number, number, number]
const ofYmd = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m - 1, d) / 864e5)
/** 0 = Sunday … 6 = Saturday. 1970-01-01 was a Thursday. */
export const weekdayOf = (n: number) => (((n + 4) % 7) + 7) % 7
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const isWorkday = (n: number) => weekdayOf(n) !== 0 && weekdayOf(n) !== 6

/** Month index counted from year 0, so months can be added and compared. */
const monthIdx = (y: number, m: number) => y * 12 + (m - 1)
const fromMonthIdx = (i: number): [number, number] => [Math.floor(i / 12), (i % 12) + 1]

/**
 * The day of month `y-m` that a monthly rule falls on: day N (the last day when the month is
 * shorter), the last day, or the Nth / last given weekday.
 */
function monthlyDay(rule: Extract<RepeatRule, { kind: 'monthly' }>, y: number, m: number, fallbackDay: number): number {
  const len = daysInMonth(y, m)
  if (rule.nth != null && rule.weekday != null) {
    if (rule.nth === -1) {
      const last = ofYmd(y, m, len)
      return len - ((weekdayOf(last) - rule.weekday + 7) % 7)
    }
    const first = ofYmd(y, m, 1)
    const day = 1 + ((rule.weekday - weekdayOf(first) + 7) % 7) + 7 * (rule.nth - 1)
    return day // may be past the month's end for a 5th weekday; callers check
  }
  const want = rule.day ?? fallbackDay
  return want === -1 ? len : Math.min(want, len)
}

/** The date of a yearly rule in year `y`; Feb 29 falls on Feb 28 in common years. */
function yearlyDate(rule: Extract<RepeatRule, { kind: 'yearly' }>, y: number, fb: [number, number]): number {
  const m = rule.month ?? fb[0]
  const d = rule.day ?? fb[1]
  return ofYmd(y, m, Math.min(d, daysInMonth(y, m)))
}

/** Monday-based week start of a day number. */
const weekStart = (n: number, weekStartsOn: 0 | 1) => n - ((weekdayOf(n) - weekStartsOn + 7) % 7)

/**
 * The first date strictly after `after` that the rule falls on, counting its interval from `after`
 * (the current due date, or the completion date when the task repeats from completion).
 */
export function nextMatch(rule: RepeatRule, after: string, weekStartsOn: 0 | 1 = 1): string {
  const base = dayNum(after)
  const [by, bm, bd] = ymd(after)
  switch (rule.kind) {
    case 'daily':
      return dayStr(base + Math.max(1, rule.interval))
    case 'weekdays': {
      let n = base + 1
      while (!isWorkday(n)) n++
      return dayStr(n)
    }
    case 'weekly': {
      const step = Math.max(1, rule.interval)
      const days = rule.days?.length ? rule.days : [weekdayOf(base)]
      const ws = weekStart(base, weekStartsOn)
      // the rest of this week first, then the first chosen day `interval` weeks later
      for (let k = 0; k < 2; k++) {
        const start = ws + 7 * step * k
        const hits = days
          .map((d) => start + ((d - weekStartsOn + 7) % 7))
          .filter((n) => n > base)
          .sort((a, b) => a - b)
        if (hits.length) return dayStr(hits[0])
      }
      return dayStr(base + 7 * step)
    }
    case 'monthly': {
      const step = Math.max(1, rule.interval)
      const start = monthIdx(by, bm)
      // a 5th weekday does not exist in every month: look further ahead (it always shows up within a few years)
      for (let k = 0; k < 120; k++) {
        const [y, m] = fromMonthIdx(start + step * k)
        const d = monthlyDay(rule, y, m, bd)
        if (d > daysInMonth(y, m)) continue
        const n = ofYmd(y, m, d)
        if (n > base) return dayStr(n)
      }
      return dayStr(base + 1)
    }
    case 'yearly': {
      const step = Math.max(1, rule.interval)
      for (let k = 0; k < 3; k++) {
        const n = yearlyDate(rule, by + step * k, [bm, bd])
        if (n > base) return dayStr(n)
      }
      return dayStr(base + 1)
    }
  }
}

/** Whether `date` is a day the rule falls on (ignoring the interval). */
export function fallsOn(rule: RepeatRule, date: string): boolean {
  const n = dayNum(date)
  const [y, m, d] = ymd(date)
  switch (rule.kind) {
    case 'daily':
      return true
    case 'weekdays':
      return isWorkday(n)
    case 'weekly':
      return !rule.days?.length || rule.days.includes(weekdayOf(n))
    case 'monthly':
      return (rule.day == null && rule.nth == null) || monthlyDay(rule, y, m, d) === d
    case 'yearly':
      return (rule.month == null || rule.month === m) && (rule.day == null || yearlyDate(rule, y, [m, d]) === n)
  }
}

/** The first date on or after `from` that the rule falls on: where a new repeating task starts. */
export function firstOccurrence(rule: RepeatRule, from: string, weekStartsOn: 0 | 1 = 1): string {
  return fallsOn(rule, from) ? from : nextMatch(rule, from, weekStartsOn)
}

export type Advance =
  /** The series goes on: the task moves to `dueDate`; `repeat` carries the updated count. */
  | { next: true; dueDate: string; repeat: RepeatRule }
  /** That was the last occurrence (its count is reached or the next date is past the end date). */
  | { next: false; repeat: RepeatRule }

/**
 * What happens to a repeating task when its current occurrence is completed (or skipped) on `today`:
 * the next due date, or the end of the series.
 */
export function advance(task: Pick<Task, 'dueDate' | 'repeat'>, today: string, weekStartsOn: 0 | 1 = 1): Advance | null {
  const rule = task.repeat
  if (!rule || !task.dueDate) return null
  const done = (rule.done ?? 0) + 1
  const counted: RepeatRule = rule.count ? { ...rule, done } : rule
  if (rule.count && done >= rule.count) return { next: false, repeat: counted }
  const from = rule.from === 'completion' ? today : task.dueDate
  const dueDate = nextMatch(rule, from, weekStartsOn)
  if (rule.until && dueDate > rule.until) return { next: false, repeat: counted }
  return { next: true, dueDate, repeat: counted }
}

/** How many occurrences are left, counting the current one; undefined when the rule has no count. */
export const remaining = (rule: RepeatRule) => (rule.count ? Math.max(0, rule.count - (rule.done ?? 0)) : undefined)

/** The days a rule falls on, taken from `date`: what the date picker's presets and new rules use. */
export function withDays(rule: RepeatRule, date: string): RepeatRule {
  const n = dayNum(date)
  const [, m, d] = ymd(date)
  switch (rule.kind) {
    case 'weekly':
      return rule.days?.length ? rule : { ...rule, days: [weekdayOf(n)] }
    case 'monthly':
      return rule.day != null || rule.nth != null ? rule : { ...rule, day: d }
    case 'yearly':
      return rule.month != null && rule.day != null ? rule : { ...rule, month: m, day: d }
    default:
      return rule
  }
}

/**
 * When a task's date changes and its rule only repeats the day of the old date (weekly on its
 * weekday, monthly on its day, yearly on its date), the rule follows the new date.
 */
export function reanchor(rule: RepeatRule, oldDate: string | undefined, newDate: string | undefined): RepeatRule {
  if (!oldDate || !newDate || oldDate === newDate) return rule
  const plain = (r: RepeatRule): RepeatRule => {
    switch (r.kind) {
      case 'weekly':
        return { ...r, days: undefined }
      case 'monthly':
        return { ...r, day: undefined, nth: undefined, weekday: undefined }
      case 'yearly':
        return { ...r, month: undefined, day: undefined }
      default:
        return r
    }
  }
  if (rule.kind === 'weekly' && (rule.days?.length ?? 0) > 1) return rule
  if (!sameRule(withDays(plain(rule), oldDate), rule)) return rule
  return withDays(plain(rule), newDate)
}

/** Whether two rules are the same, whatever the order of their fields. */
export function sameRule(a: RepeatRule | null | undefined, b: RepeatRule | null | undefined): boolean {
  const canon = (r: RepeatRule | null | undefined) =>
    r ? JSON.stringify(Object.entries(r).filter(([, v]) => v !== undefined).sort(([x], [y]) => (x < y ? -1 : 1))) : 'null'
  return canon(a) === canon(b)
}

const KINDS = ['daily', 'weekly', 'weekdays', 'monthly', 'yearly']
const int = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi

/**
 * Brings a saved rule up to date. Rules saved before explicit days took the weekday, the day of
 * month or the date from the task's due date at each completion; they get those days written in.
 * Anything unreadable becomes no repeat.
 */
export function migrateRepeat(rule: unknown, dueDate?: string): RepeatRule | null {
  if (!rule || typeof rule !== 'object') return null
  const r = { ...(rule as Record<string, unknown>) }
  if (typeof r.kind !== 'string' || !KINDS.includes(r.kind)) return null
  if (r.kind !== 'weekdays' && !int(r.interval, 1, 9999)) r.interval = 1
  if (r.kind === 'weekly' && Array.isArray(r.days)) r.days = [...new Set((r.days as unknown[]).filter((x) => int(x, 0, 6)))].sort()
  if (!int(r.count, 1, 9999)) delete r.count
  if (typeof r.until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.until)) delete r.until
  if (r.from !== 'completion') delete r.from
  if (!int(r.done, 0, 9999)) delete r.done
  const out = r as unknown as RepeatRule
  return dueDate ? withDays(out, dueDate) : out
}

/** A task with its saved rule migrated; the same object when nothing changed. */
export function migrateTask<T extends Pick<Task, 'repeat' | 'dueDate'>>(task: T): T {
  if (!task.repeat) return task
  const next = migrateRepeat(task.repeat, task.dueDate)
  return sameRule(next, task.repeat) ? task : { ...task, repeat: next }
}
