import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { t as tr } from './i18n'
import { fmtFullDate, fmtMonthDay, fmtTime, fmtWeekday } from './i18n/format'
import { nextMatch } from './repeat'
import type { RepeatRule, Task } from './types'

export const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
export const todayStr = () => fmt(new Date())
export const parse = (s: string) => parseISO(s)
export const dayDiff = (s: string) => differenceInCalendarDays(parseISO(s), new Date())

/** The short weekday name in the current language ("Wed", "Mi.", "ср"). */
export const weekdayName = (d: Date) => fmtWeekday(d)

/** The date text on the right of a task row: Today / Tomorrow / weekday / month and day, plus the time. */
export function dueLabel(t: Pick<Task, 'dueDate' | 'dueTime'>): string {
  if (!t.dueDate) return ''
  const d = parseISO(t.dueDate)
  const diff = dayDiff(t.dueDate)
  let s: string
  if (diff === 0) s = tr('common.today')
  else if (diff === 1) s = tr('common.tomorrow')
  else if (diff === -1) s = tr('common.yesterday')
  else if (diff > 1 && diff < 7) s = weekdayName(d)
  else if (d.getFullYear() === new Date().getFullYear()) s = fmtMonthDay(d)
  else s = fmtFullDate(d)
  return t.dueTime ? tr('core.date.withTime', { date: s, time: fmtTime(t.dueTime) }) : s
}

export function isOverdue(t: Task): boolean {
  if (!t.dueDate || t.status !== 0) return false
  const diff = dayDiff(t.dueDate)
  if (diff < 0) return true
  if (diff === 0 && t.dueTime) {
    const [h, m] = t.dueTime.split(':').map(Number)
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes() > h * 60 + m
  }
  return false
}

/** The next date of a repeating task counted from `date` (see `nextMatch` in repeat.ts). */
export function nextOccurrence(date: string, rule: RepeatRule, weekStartsOn: 0 | 1 = 1): string {
  return nextMatch(rule, date, weekStartsOn)
}

/** A day of the week (0 = Sunday) as a date, to format its name. 2023-01-01 was a Sunday. */
const weekday = (day: number) => new Date(2023, 0, 1 + day)

export function repeatLabel(rule?: RepeatRule | null): string {
  if (!rule) return tr('core.repeat.none')
  switch (rule.kind) {
    case 'daily':
      return rule.interval === 1 ? tr('core.repeat.daily') : tr('core.repeat.everyNDays', { count: rule.interval })
    case 'weekdays':
      return tr('core.repeat.weekdays')
    case 'weekly':
      if (rule.days?.length)
        return tr('core.repeat.weeklyOn', { days: rule.days.map((x) => fmtWeekday(weekday(x))).join(tr('core.repeat.daySeparator')) })
      return rule.interval === 1 ? tr('core.repeat.weekly') : tr('core.repeat.everyNWeeks', { count: rule.interval })
    case 'monthly':
      return rule.interval === 1 ? tr('core.repeat.monthly') : tr('core.repeat.everyNMonths', { count: rule.interval })
    case 'yearly':
      return rule.interval === 1 ? tr('core.repeat.yearly') : tr('core.repeat.everyNYears', { count: rule.interval })
  }
}

/** A reminder `m` minutes before the task's time; 0 = on time. */
export function reminderLabel(m?: number | null): string {
  if (m == null) return tr('core.reminder.none')
  if (m === 0) return tr('core.reminder.onTime')
  if (m < 60) return tr('core.reminder.minutesBefore', { count: m })
  if (m < 1440) return tr('core.reminder.hoursBefore', { count: m / 60 })
  return tr('core.reminder.daysBefore', { count: m / 1440 })
}
