import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { advance, firstOccurrence, migrateRepeat, migrateTask, nextMatch, reanchor, sameRule, withDays } from '../repeat'
import { repeatText } from '../components/dateLabels'
import { setLocale } from '../i18n'
import type { RepeatRule } from '../types'

// 2026-11-18 is a Wednesday; November 2026 starts on a Sunday.

/** The next `n` dates of a rule counted from `from`, as completing on the due date each time gives. */
function series(rule: RepeatRule, from: string, n: number): string[] {
  const out: string[] = []
  let d = from
  for (let i = 0; i < n; i++) out.push((d = nextMatch(rule, d)))
  return out
}

describe('next date: days, weeks and weekdays', () => {
  it('every N days', () => {
    expect(series({ kind: 'daily', interval: 1 }, '2026-12-30', 3)).toEqual(['2026-12-31', '2027-01-01', '2027-01-02'])
    expect(series({ kind: 'daily', interval: 10 }, '2026-11-25', 2)).toEqual(['2026-12-05', '2026-12-15'])
  })

  it('weekly on chosen days', () => {
    const r: RepeatRule = { kind: 'weekly', interval: 1, days: [1, 3, 5] }
    expect(series(r, '2026-11-18', 4)).toEqual(['2026-11-20', '2026-11-23', '2026-11-25', '2026-11-27'])
  })

  it('every 2 weeks on Monday and Friday skips the week in between', () => {
    const r: RepeatRule = { kind: 'weekly', interval: 2, days: [1, 5] }
    expect(series(r, '2026-11-16', 4)).toEqual(['2026-11-20', '2026-11-30', '2026-12-04', '2026-12-14'])
  })

  it('weeks start on Sunday or Monday', () => {
    // Sunday, every 2 weeks on Sunday and Monday: with Monday-first weeks the Monday after is in the next week
    const r: RepeatRule = { kind: 'weekly', interval: 2, days: [0, 1] }
    expect(nextMatch(r, '2026-11-22', 1)).toBe('2026-11-30')
    expect(nextMatch(r, '2026-11-22', 0)).toBe('2026-11-23')
  })

  it('weekdays only', () => {
    expect(series({ kind: 'weekdays' }, '2026-11-19', 3)).toEqual(['2026-11-20', '2026-11-23', '2026-11-24'])
    expect(nextMatch({ kind: 'weekdays' }, '2026-11-21')).toBe('2026-11-23')
  })
})

describe('next date: months and years', () => {
  it('day 31 falls on the last day of shorter months and comes back to 31', () => {
    const r: RepeatRule = { kind: 'monthly', interval: 1, day: 31 }
    expect(series(r, '2026-01-31', 4)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
    expect(nextMatch(r, '2028-01-31')).toBe('2028-02-29')
  })

  it('the last day of the month', () => {
    const r: RepeatRule = { kind: 'monthly', interval: 1, day: -1 }
    expect(series(r, '2027-12-31', 3)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31'])
  })

  it('every 3 months on day 15', () => {
    expect(series({ kind: 'monthly', interval: 3, day: 15 }, '2026-11-15', 3)).toEqual(['2027-02-15', '2027-05-15', '2027-08-15'])
  })

  it('a later day in the same month comes first', () => {
    expect(nextMatch({ kind: 'monthly', interval: 1, day: 20 }, '2026-11-18')).toBe('2026-11-20')
  })

  it('the Nth weekday', () => {
    expect(nextMatch({ kind: 'monthly', interval: 1, nth: 2, weekday: 1 }, '2026-11-01')).toBe('2026-11-09')
    expect(nextMatch({ kind: 'monthly', interval: 1, nth: 4, weekday: 4 }, '2026-11-18')).toBe('2026-11-26')
    expect(series({ kind: 'monthly', interval: 1, nth: 1, weekday: 1 }, '2026-11-18', 3)).toEqual(['2026-12-07', '2027-01-04', '2027-02-01'])
  })

  it('the last weekday', () => {
    const r: RepeatRule = { kind: 'monthly', interval: 1, nth: -1, weekday: 5 }
    expect(series(r, '2026-11-18', 4)).toEqual(['2026-11-27', '2026-12-25', '2027-01-29', '2027-02-26'])
    // February 2026 ends on a Saturday
    expect(nextMatch({ kind: 'monthly', interval: 1, nth: -1, weekday: 6 }, '2026-02-01')).toBe('2026-02-28')
  })

  it('every 2 months on the last Sunday', () => {
    expect(series({ kind: 'monthly', interval: 2, nth: -1, weekday: 0 }, '2026-11-29', 2)).toEqual(['2027-01-31', '2027-03-28'])
  })

  it('yearly on a date; Feb 29 falls on Feb 28 in common years', () => {
    expect(series({ kind: 'yearly', interval: 1, month: 3, day: 8 }, '2026-11-18', 2)).toEqual(['2027-03-08', '2028-03-08'])
    const leap: RepeatRule = { kind: 'yearly', interval: 1, month: 2, day: 29 }
    expect(series(leap, '2028-02-29', 4)).toEqual(['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'])
  })

  it('every 4 years', () => {
    expect(nextMatch({ kind: 'yearly', interval: 4, month: 2, day: 29 }, '2028-02-29')).toBe('2032-02-29')
  })

  it('leap days for daily rules', () => {
    expect(series({ kind: 'daily', interval: 1 }, '2028-02-28', 2)).toEqual(['2028-02-29', '2028-03-01'])
    expect(nextMatch({ kind: 'daily', interval: 1 }, '2027-02-28')).toBe('2027-03-01')
  })
})

// Node reads TZ again whenever it changes, so each zone below is the process's local time zone.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env

describe('next date across daylight saving changes', () => {
  const tz = env.TZ
  afterAll(() => {
    env.TZ = tz
  })
  for (const zone of ['America/New_York', 'Europe/Berlin', 'Australia/Sydney', 'Pacific/Chatham']) {
    it(zone, () => {
      env.TZ = zone
      // the clocks change in this zone on one of these days
      expect(new Date(2026, 2, 1).getTimezoneOffset() !== new Date(2026, 4, 1).getTimezoneOffset() || new Date(2026, 9, 1).getTimezoneOffset() !== new Date(2026, 11, 1).getTimezoneOffset()).toBe(true)
      expect(series({ kind: 'daily', interval: 1 }, '2026-03-07', 3)).toEqual(['2026-03-08', '2026-03-09', '2026-03-10'])
      expect(series({ kind: 'daily', interval: 1 }, '2026-03-28', 3)).toEqual(['2026-03-29', '2026-03-30', '2026-03-31'])
      expect(series({ kind: 'daily', interval: 1 }, '2026-04-04', 2)).toEqual(['2026-04-05', '2026-04-06'])
      expect(series({ kind: 'daily', interval: 1 }, '2026-10-03', 2)).toEqual(['2026-10-04', '2026-10-05'])
      expect(series({ kind: 'weekly', interval: 1, days: [0] }, '2026-10-25', 2)).toEqual(['2026-11-01', '2026-11-08'])
      expect(nextMatch({ kind: 'weekdays' }, '2026-03-06')).toBe('2026-03-09')
      expect(nextMatch({ kind: 'monthly', interval: 1, nth: 2, weekday: 0 }, '2026-02-08')).toBe('2026-03-08')
    })
  }
})

describe('ends and where the next date counts from', () => {
  it('after N times: each completion counts, the last one ends the series', () => {
    let task = { dueDate: '2026-11-18', repeat: { kind: 'daily', interval: 1, count: 3 } as RepeatRule }
    const a = advance(task, '2026-11-18')
    expect(a).toEqual({ next: true, dueDate: '2026-11-19', repeat: { kind: 'daily', interval: 1, count: 3, done: 1 } })
    task = { dueDate: '2026-11-19', repeat: a!.repeat }
    const b = advance(task, '2026-11-19')
    expect(b).toMatchObject({ next: true, dueDate: '2026-11-20', repeat: { done: 2 } })
    const c = advance({ dueDate: '2026-11-20', repeat: b!.repeat }, '2026-11-20')
    expect(c).toEqual({ next: false, repeat: { kind: 'daily', interval: 1, count: 3, done: 3 } })
  })

  it('a count of 1 ends at once', () => {
    expect(advance({ dueDate: '2026-11-18', repeat: { kind: 'weekly', interval: 1, days: [3], count: 1 } }, '2026-11-18')).toMatchObject({ next: false })
  })

  it('until a date, that date included', () => {
    const repeat: RepeatRule = { kind: 'weekly', interval: 1, days: [3], until: '2026-11-25' }
    expect(advance({ dueDate: '2026-11-18', repeat }, '2026-11-18')).toEqual({ next: true, dueDate: '2026-11-25', repeat })
    expect(advance({ dueDate: '2026-11-25', repeat }, '2026-11-25')).toEqual({ next: false, repeat })
  })

  it('from the completion date', () => {
    const repeat: RepeatRule = { kind: 'daily', interval: 3, from: 'completion' }
    expect(advance({ dueDate: '2026-11-10', repeat }, '2026-11-18')).toMatchObject({ next: true, dueDate: '2026-11-21' })
    // from the due date, an overdue task's next date follows its due date
    expect(advance({ dueDate: '2026-11-10', repeat: { kind: 'daily', interval: 3 } }, '2026-11-18')).toMatchObject({ dueDate: '2026-11-13' })
    // monthly on the 15th, completed late on the 20th: the next 15th after the 20th
    expect(advance({ dueDate: '2026-11-15', repeat: { kind: 'monthly', interval: 1, day: 15, from: 'completion' } }, '2026-11-20')).toMatchObject({ dueDate: '2026-12-15' })
  })

  it('no rule or no date: nothing to advance', () => {
    expect(advance({ dueDate: undefined, repeat: { kind: 'daily', interval: 1 } }, '2026-11-18')).toBeNull()
    expect(advance({ dueDate: '2026-11-18', repeat: null }, '2026-11-18')).toBeNull()
  })
})

describe('first occurrence, anchors and migration', () => {
  it('first occurrence on or after a date', () => {
    expect(firstOccurrence({ kind: 'weekly', interval: 1, days: [1] }, '2026-11-18')).toBe('2026-11-23')
    expect(firstOccurrence({ kind: 'weekly', interval: 1, days: [3] }, '2026-11-18')).toBe('2026-11-18')
    expect(firstOccurrence({ kind: 'monthly', interval: 1, nth: -1, weekday: 5 }, '2026-11-18')).toBe('2026-11-27')
    expect(firstOccurrence({ kind: 'weekdays' }, '2026-11-21')).toBe('2026-11-23')
    expect(firstOccurrence({ kind: 'daily', interval: 4 }, '2026-11-21')).toBe('2026-11-21')
  })

  it('old rules get the days of their due date written in', () => {
    expect(migrateRepeat({ kind: 'monthly', interval: 1 }, '2026-01-31')).toEqual({ kind: 'monthly', interval: 1, day: 31 })
    expect(migrateRepeat({ kind: 'weekly', interval: 2 }, '2026-11-18')).toEqual({ kind: 'weekly', interval: 2, days: [3] })
    expect(migrateRepeat({ kind: 'yearly', interval: 1 }, '2028-02-29')).toEqual({ kind: 'yearly', interval: 1, month: 2, day: 29 })
    expect(migrateRepeat({ kind: 'daily', interval: 2 }, '2026-11-18')).toEqual({ kind: 'daily', interval: 2 })
    expect(migrateRepeat({ kind: 'weekdays' }, '2026-11-18')).toEqual({ kind: 'weekdays' })
    // without a date the rule stays as it is
    expect(migrateRepeat({ kind: 'monthly', interval: 1 })).toEqual({ kind: 'monthly', interval: 1 })
  })

  it('an old monthly rule on the 31st no longer drifts to the 28th', () => {
    const r = migrateRepeat({ kind: 'monthly', interval: 1 }, '2026-01-31')!
    expect(series(r, '2026-01-31', 2)).toEqual(['2026-02-28', '2026-03-31'])
  })

  it('unreadable rules and fields are dropped', () => {
    expect(migrateRepeat(null)).toBeNull()
    expect(migrateRepeat('daily')).toBeNull()
    expect(migrateRepeat({ kind: 'hourly', interval: 1 })).toBeNull()
    expect(migrateRepeat({ kind: 'daily', interval: -3, count: 0, until: 'soon', from: 'x' })).toEqual({ kind: 'daily', interval: 1 })
    expect(migrateRepeat({ kind: 'weekly', interval: 1, days: [9, 1, 1, 'x'] }, '2026-11-18')).toEqual({ kind: 'weekly', interval: 1, days: [1] })
  })

  it('migrateTask keeps tasks that need nothing', () => {
    const t = { dueDate: '2026-11-18', repeat: { kind: 'weekly', interval: 1, days: [3] } as RepeatRule }
    expect(migrateTask(t)).toBe(t)
    const old = { dueDate: '2026-11-18', repeat: { kind: 'monthly', interval: 1 } as RepeatRule }
    expect(migrateTask(old)).toEqual({ dueDate: '2026-11-18', repeat: { kind: 'monthly', interval: 1, day: 18 } })
  })

  it('a rule on the day of its date follows a new date; other rules stay', () => {
    expect(reanchor({ kind: 'monthly', interval: 1, day: 18 }, '2026-11-18', '2026-11-20')).toEqual({ kind: 'monthly', interval: 1, day: 20 })
    expect(reanchor({ kind: 'weekly', interval: 1, days: [3] }, '2026-11-18', '2026-11-20')).toEqual({ kind: 'weekly', interval: 1, days: [5] })
    expect(reanchor({ kind: 'monthly', interval: 1, day: 5 }, '2026-11-18', '2026-11-20')).toEqual({ kind: 'monthly', interval: 1, day: 5 })
    expect(reanchor({ kind: 'weekly', interval: 1, days: [1, 3] }, '2026-11-18', '2026-11-20')).toEqual({ kind: 'weekly', interval: 1, days: [1, 3] })
    expect(reanchor({ kind: 'monthly', interval: 1, nth: -1, weekday: 5 }, '2026-11-27', '2026-11-20')).toEqual({ kind: 'monthly', interval: 1, nth: -1, weekday: 5 })
  })

  it('sameRule ignores the order of fields', () => {
    expect(sameRule({ kind: 'monthly', interval: 1, day: 3 }, { day: 3, interval: 1, kind: 'monthly' } as RepeatRule)).toBe(true)
    expect(sameRule(withDays({ kind: 'weekly', interval: 1 }, '2026-11-18'), { kind: 'weekly', interval: 1, days: [3] })).toBe(true)
  })
})

describe('readable summary', () => {
  afterEach(() => setLocale('en'))
  beforeAll(() => setLocale('en'))

  it('English', () => {
    expect(repeatText({ kind: 'monthly', interval: 1, nth: -1, weekday: 5 })).toBe('Monthly on the last Friday')
    expect(repeatText({ kind: 'monthly', interval: 2, nth: 2, weekday: 1 })).toBe('Every 2 months on the second Monday')
    expect(repeatText({ kind: 'monthly', interval: 1, day: -1 })).toBe('Monthly on the last day')
    expect(repeatText({ kind: 'monthly', interval: 1, day: 31 })).toBe('Monthly on day 31')
    expect(repeatText({ kind: 'yearly', interval: 1, month: 2, day: 29 })).toBe('Yearly on Feb 29')
    expect(repeatText({ kind: 'weekdays', count: 1 })).toBe('Every weekday (Mon–Fri), 1 time')
    expect(repeatText({ kind: 'daily', interval: 3, from: 'completion', count: 5 })).toBe('Every 3 days, after completion, 5 times')
    expect(repeatText({ kind: 'weekly', interval: 2, days: [1, 5], until: '2027-03-01' })).toBe('Every 2 weeks on Mon, Fri, until Mar 1, 2027')
  })

  it('Chinese', () => {
    setLocale('zh-CN')
    expect(repeatText({ kind: 'monthly', interval: 1, nth: -1, weekday: 5 })).toBe('每月最后一个星期五')
    expect(repeatText({ kind: 'monthly', interval: 1, day: -1, count: 12 })).toBe('每月（最后一天），共 12 次')
    expect(repeatText({ kind: 'weekly', interval: 1, days: [1, 3, 5], from: 'completion' })).toBe('每周一、周三、周五，从完成日起')
  })

  it('plural forms and weekday names follow the language', () => {
    setLocale('ru')
    expect(repeatText({ kind: 'daily', interval: 1, count: 2 })).toBe('Ежедневно, 2 раза')
    expect(repeatText({ kind: 'daily', interval: 1, count: 5 })).toBe('Ежедневно, 5 раз')
    expect(repeatText({ kind: 'monthly', interval: 5, nth: 1, weekday: 3 })).toBe('Раз в 5 месяцев: среда, 1-я неделя')
    setLocale('de')
    expect(repeatText({ kind: 'monthly', interval: 1, nth: -1, weekday: 1 })).toBe('Monatlich am letzten Montag')
    setLocale('ja')
    expect(repeatText({ kind: 'monthly', interval: 1, nth: 3, weekday: 0 })).toBe('毎月第3日曜日')
  })
})
