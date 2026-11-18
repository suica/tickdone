import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '../i18n'
import { reminderText, repeatText, weekdayList } from '../components/dateLabels'
import { fmtDur } from '../views/focusFormat'

afterEach(() => setLocale('en'))

describe('date picker labels', () => {
  it('formats all-day reminders with the localized time', () => {
    expect(reminderText(null, false)).toBe('None')
    expect(reminderText(-540, false)).toBe('On the day (9:00 AM)')
    expect(reminderText(900, false)).toBe('1 day before (9:00 AM)')
    expect(reminderText(9540, false)).toBe('1 week before (9:00 AM)')
    expect(reminderText(0, true)).toBe('On time')
    setLocale('de')
    expect(reminderText(2340, false)).toBe('2 Tage vorher (9:00)')
    setLocale('ru')
    expect(reminderText(3780, false)).toBe('За 3 дня (9:00)')
  })

  it('formats repeat rules with localized weekdays and dates', () => {
    expect(repeatText({ kind: 'weekly', interval: 1, days: [5, 1, 3] })).toBe('Weekly on Mon, Wed, Fri')
    expect(repeatText({ kind: 'weekly', interval: 2, days: [0] })).toBe('Every 2 weeks on Sun')
    expect(repeatText({ kind: 'monthly', interval: 1 }, '2026-11-18')).toBe('Monthly on day 18')
    expect(repeatText({ kind: 'yearly', interval: 3 }, '2026-11-18')).toBe('Every 3 years on Nov 18')
    setLocale('zh-CN')
    expect(repeatText({ kind: 'weekly', interval: 1, days: [1, 3] })).toBe('每周一、周三')
    expect(repeatText({ kind: 'monthly', interval: 2 }, '2026-11-18')).toBe('每 2 个月（18日）')
  })

  it('joins weekday names Monday first', () => {
    setLocale('ja')
    expect(weekdayList([0, 1])).toBe('月・日')
  })
})

describe('focus lengths', () => {
  it('uses the locale units', () => {
    expect(fmtDur(85 * 60000)).toBe('1h 25m')
    expect(fmtDur(60 * 60000)).toBe('1h')
    expect(fmtDur(25 * 60000)).toBe('25m')
    setLocale('ru')
    expect(fmtDur(85 * 60000)).toBe('1 ч 25 мин')
  })
})
