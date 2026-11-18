import { parseISO } from 'date-fns'
import type { RepeatRule } from '../types'
import { repeatLabel, reminderLabel } from '../dates'
import { t } from '../i18n'
import { fmtMonthDay, fmtTime, fmtWeekday } from '../i18n/format'

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

export function repeatText(rule: RepeatRule | null | undefined, date?: string): string {
  if (!rule) return t('core.repeat.none')
  const d = date ? parseISO(date) : new Date()
  switch (rule.kind) {
    case 'weekly':
      if (rule.days?.length) {
        const days = weekdayList(rule.days)
        return rule.interval === 1 ? t('core.repeat.weeklyOn', { days }) : t('misc.repeat.everyWeeksOn', { count: rule.interval, days })
      }
      return repeatLabel(rule)
    case 'monthly':
      return rule.interval === 1 ? t('misc.repeat.monthlyOn', { day: d.getDate() }) : t('misc.repeat.everyMonthsOn', { count: rule.interval, day: d.getDate() })
    case 'yearly':
      return rule.interval === 1 ? t('misc.repeat.yearlyOn', { date: fmtMonthDay(d) }) : t('misc.repeat.everyYearsOn', { count: rule.interval, date: fmtMonthDay(d) })
    default:
      return repeatLabel(rule)
  }
}
