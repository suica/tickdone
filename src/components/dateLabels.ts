import { parseISO } from 'date-fns'
import type { RepeatRule } from '../types'
import { repeatLabel, reminderLabel } from '../dates'
import { t } from '../i18n'
import { fmtFullDate, fmtMonthDay, fmtTime, fmtWeekday } from '../i18n/format'

// Date, reminder and repeat labels shared by the date picker, task details and habits.

const pad = (n: number) => String(n).padStart(2, '0')

/** The name of weekday `i` (0 = Sunday) in the current language: "Wed", "Mi.", "ср". */
export const dayName = (i: number, width: 'narrow' | 'short' | 'long' = 'short') => fmtWeekday(new Date(2023, 0, 1 + i), width)

/** Weekday names joined for the current language, Monday first: "Mon, Wed, Fri". */
export const weekdayList = (days: number[], width: 'short' | 'long' = 'short') =>
  [...days]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((x) => dayName(x, width))
    .join(t('core.repeat.daySeparator'))

/**
 * Reminder text. With a time, `reminder` is minutes before the due time.
 * For all-day tasks it is minutes before 00:00 of the due day, e.g. -540 = on the day at 09:00, 900 = 1 day before at 09:00.
 */
export function reminderText(m: number | null | undefined, hasTime: boolean): string {
  if (m == null) return t('core.reminder.none')
  if (hasTime) {
    if (m === 0) return t('core.reminder.onTime')
    if (m > 0 && m % 10080 === 0) return t('misc.reminder.weeksBefore', { count: m / 10080 })
    return reminderLabel(m)
  }
  const days = Math.max(0, Math.ceil(m / 1440))
  const tod = days * 1440 - m
  const time = fmtTime(`${pad(Math.floor(tod / 60))}:${pad(tod % 60)}`)
  const when = days === 0 ? t('misc.reminder.onTheDay') : days % 7 === 0 ? t('misc.reminder.weeksBefore', { count: days / 7 }) : t('core.reminder.daysBefore', { count: days })
  return t('misc.reminder.at', { when, time })
}

/** "first", "last" …: the word for the Nth (1–4) or last (-1) weekday of a month. */
export const nthName = (n: number) => t(n === -1 ? 'misc.repeat.nth.last' : (`misc.repeat.nth.${n}` as 'misc.repeat.nth.1'))

/** The rule's days, without its end or where it counts from: "Every 2 weeks on Mon, Fri". */
function ruleText(rule: RepeatRule, d: Date): string {
  switch (rule.kind) {
    case 'weekly':
      if (rule.days?.length) {
        const days = weekdayList(rule.days)
        return rule.interval === 1 ? t('core.repeat.weeklyOn', { days }) : t('misc.repeat.everyWeeksOn', { count: rule.interval, days })
      }
      return repeatLabel(rule)
    case 'monthly': {
      const count = rule.interval
      if (rule.nth != null && rule.weekday != null) {
        const v = { count, nth: nthName(rule.nth), weekday: dayName(rule.weekday, 'long') }
        return count === 1 ? t('misc.repeat.monthlyNth', v) : t('misc.repeat.everyMonthsNth', v)
      }
      if (rule.day === -1) return count === 1 ? t('misc.repeat.monthlyLastDay') : t('misc.repeat.everyMonthsLastDay', { count })
      const day = rule.day ?? d.getDate()
      return count === 1 ? t('misc.repeat.monthlyOn', { day }) : t('misc.repeat.everyMonthsOn', { count, day })
    }
    case 'yearly': {
      // 2000 was a leap year, so Feb 29 can be named
      const date = fmtMonthDay(rule.month != null && rule.day != null ? new Date(2000, rule.month - 1, rule.day) : d)
      return rule.interval === 1 ? t('misc.repeat.yearlyOn', { date }) : t('misc.repeat.everyYearsOn', { count: rule.interval, date })
    }
    default:
      return repeatLabel(rule)
  }
}

/**
 * The readable summary of a repeat rule, everywhere one is shown: its days, whether it counts from
 * completion and how it ends ("Monthly on the last Friday, after completion, 5 times").
 * `date` is the task's due date, which rules saved without explicit days repeat.
 */
export function repeatText(rule: RepeatRule | null | undefined, date?: string): string {
  if (!rule) return t('core.repeat.none')
  let s = ruleText(rule, date ? parseISO(date) : new Date())
  if (rule.from === 'completion') s = t('misc.repeat.fromCompletion', { rule: s })
  if (rule.count) s = t('misc.repeat.endCount', { rule: s, count: rule.count })
  else if (rule.until) s = t('misc.repeat.endUntil', { rule: s, date: fmtDate(parseISO(rule.until)) })
  return s
}

/** "Nov 18" this year, "Nov 18, 2027" otherwise. */
const fmtDate = (d: Date) => (d.getFullYear() === new Date().getFullYear() ? fmtMonthDay(d) : fmtFullDate(d))
