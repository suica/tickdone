import { describe, expect, it } from 'vitest'
import type { Task } from '../types'
import {
  DAY_PX,
  barBox,
  dayAt,
  daysFor,
  dropPatch,
  groupRows,
  isMilestone,
  moveBy,
  rangeFor,
  scheduleOn,
  setEnd,
  setStart,
  spanAfter,
  spanLength,
  spanOf,
  spillDays,
  ticks,
  visibleDays,
  xOf,
} from '../views/timeline'
import { dayNum } from '../repeat'

const task = (p: Partial<Task>): Task => ({ id: 'x', title: 'x', content: '', listId: 'l', tags: [], priority: 0, status: 0, createdAt: 0, modifiedAt: 0, order: 0, subtasks: [], ...p })

describe('spans', () => {
  it('is null without a date', () => {
    expect(spanOf(task({}))).toBeNull()
  })
  it('is a single day (milestone) for a plain due date', () => {
    const s = spanOf(task({ dueDate: '2026-11-18' }))!
    expect(s).toEqual({ start: '2026-11-18', end: '2026-11-18' })
    expect(isMilestone(s)).toBe(true)
    expect(spanLength(s)).toBe(1)
  })
  it('starts spanDays before the due date', () => {
    const s = spanOf(task({ dueDate: '2026-11-20', spanDays: 3 }))!
    expect(s).toEqual({ start: '2026-11-17', end: '2026-11-20' })
    expect(spanLength(s)).toBe(4)
    expect(isMilestone(s)).toBe(false)
  })
  it('runs on for timed tasks whose duration passes midnight', () => {
    expect(spillDays({ dueTime: '22:00', duration: 60 })).toBe(0)
    expect(spillDays({ dueTime: '22:00', duration: 120 })).toBe(0) // ends exactly at midnight
    expect(spillDays({ dueTime: '22:00', duration: 121 })).toBe(1)
    expect(spillDays({ dueTime: '22:00', duration: 360 })).toBe(1)
    expect(spillDays({ dueTime: '22:00', duration: 30 * 60 })).toBe(2)
    expect(spillDays({ dueTime: '09:00', duration: 3 * 24 * 60 })).toBe(3)
    expect(spillDays({ duration: 3000 })).toBe(0) // no time: duration does not apply
    expect(spanOf(task({ dueDate: '2026-11-30', dueTime: '22:00', duration: 360 }))).toEqual({ start: '2026-11-30', end: '2026-12-01' })
  })
  it('crosses month and year ends', () => {
    expect(spanOf(task({ dueDate: '2027-01-02', spanDays: 5 }))).toEqual({ start: '2026-12-28', end: '2027-01-02' })
  })
})

describe('days and pixels', () => {
  const origin = '2026-11-01'
  it('maps days to x and back at every zoom', () => {
    for (const px of Object.values(DAY_PX)) {
      expect(xOf('2026-11-01', origin, px)).toBe(0)
      expect(xOf('2026-11-18', origin, px)).toBe(17 * px)
      expect(xOf('2026-10-31', origin, px)).toBe(-px)
      expect(dayAt(17 * px, origin, px)).toBe('2026-11-18')
      expect(dayAt(17 * px + px - 0.01, origin, px)).toBe('2026-11-18')
      expect(dayAt(-0.5, origin, px)).toBe('2026-10-31')
    }
  })
  it('keeps DST changes out of the maths (whole days)', () => {
    // 2026-03-29 is a DST change in Europe; day numbers are UTC so every day is one column
    expect(xOf('2026-03-30', '2026-03-28', 44)).toBe(88)
  })
  it('rounds drags to whole days', () => {
    expect(daysFor(0, 44)).toBe(0)
    expect(daysFor(21, 44)).toBe(0)
    expect(daysFor(23, 44)).toBe(1)
    expect(daysFor(-23, 44)).toBe(-1)
    expect(daysFor(-21, 44)).toBe(0)
    expect(Object.is(daysFor(-1, 44), -0)).toBe(false)
    expect(daysFor(100, 16)).toBe(6)
    expect(daysFor(14, 4)).toBe(4)
  })
  it('sizes bars by their days', () => {
    expect(barBox({ start: '2026-11-17', end: '2026-11-20' }, origin, 44)).toEqual({ left: 16 * 44, width: 4 * 44 })
    expect(barBox({ start: '2026-11-18', end: '2026-11-18' }, origin, 4)).toEqual({ left: 68, width: 4 })
  })
  it('renders only the days around the screen', () => {
    // 1000 days from the origin, 44 px a day, scrolled 4400 px in, 880 px wide, 400 px margin
    const v = visibleDays(4400, 880, 44, origin, 1000)
    expect(v.from - dayNum(origin)).toBe(Math.floor((4400 - 400) / 44))
    expect(v.to - dayNum(origin)).toBe(Math.ceil((4400 + 880 + 400) / 44))
    // clamped to the range
    const a = visibleDays(0, 880, 44, origin, 10)
    expect(a.from).toBe(dayNum(origin))
    expect(a.to).toBe(dayNum(origin) + 9)
  })
})

describe('header ticks', () => {
  const n = (d: string) => dayNum(d)
  it('makes one cell per day', () => {
    const c = ticks(n('2026-11-16'), n('2026-11-18'), 'day')
    expect(c.map((x) => x.day)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18'])
    expect(c.every((x) => x.days === 1)).toBe(true)
  })
  it('splits weeks on the chosen first weekday, cutting the ends', () => {
    // 2026-11-18 is a Wednesday
    const mon = ticks(n('2026-11-18'), n('2026-11-30'), 'week', 1)
    expect(mon.map((x) => [x.day, x.days])).toEqual([
      ['2026-11-18', 5],
      ['2026-11-23', 7],
      ['2026-11-30', 1],
    ])
    const sun = ticks(n('2026-11-18'), n('2026-11-30'), 'week', 0)
    expect(sun.map((x) => x.day)).toEqual(['2026-11-18', '2026-11-22', '2026-11-29'])
  })
  it('splits months and years', () => {
    const m = ticks(n('2026-11-20'), n('2027-01-10'), 'month')
    expect(m.map((x) => [x.day, x.days])).toEqual([
      ['2026-11-20', 11],
      ['2026-12-01', 31],
      ['2027-01-01', 10],
    ])
    expect(ticks(n('2026-12-30'), n('2027-01-02'), 'year').map((x) => x.day)).toEqual(['2026-12-30', '2027-01-01'])
  })
})

describe('range', () => {
  it('covers today and every bar with a margin', () => {
    const r = rangeFor([{ start: '2026-01-10', end: '2026-01-12' }], '2026-11-18')
    expect(r.start).toBe('2025-12-27')
    expect(dayNum(r.end) - dayNum('2026-11-18')).toBe(120)
  })
})

describe('drop rules', () => {
  const bar = task({ dueDate: '2026-11-20', spanDays: 3 }) // Nov 17–20
  const one = task({ dueDate: '2026-11-18' })

  it('moves the whole bar and keeps its length', () => {
    expect(moveBy(bar, 2)).toEqual({ dueDate: '2026-11-22' })
    expect(spanAfter(bar, moveBy(bar, -20))).toEqual({ start: '2026-10-28', end: '2026-10-31' })
    expect(moveBy(bar, 0)).toBeNull()
    expect(moveBy(task({}), 3)).toBeNull()
  })
  it('keeps the time and duration of a timed task when moved', () => {
    const t = task({ dueDate: '2026-11-30', dueTime: '22:00', duration: 360 })
    const p = moveBy(t, 1)!
    expect(p).toEqual({ dueDate: '2026-12-01' })
    expect(spanAfter(t, p)).toEqual({ start: '2026-12-01', end: '2026-12-02' })
  })
  it('moves the start edge, never past the due date', () => {
    expect(setStart(bar, '2026-11-15')).toEqual({ spanDays: 5 })
    expect(setStart(bar, '2026-11-19')).toEqual({ spanDays: 1 })
    expect(setStart(bar, '2026-11-20')).toEqual({ spanDays: undefined }) // back to a single day
    expect(setStart(bar, '2026-11-25')).toEqual({ spanDays: undefined })
    expect(setStart(bar, '2026-11-17')).toBeNull()
    // a diamond grows into a bar from its start edge
    expect(setStart(one, '2026-11-16')).toEqual({ spanDays: 2 })
  })
  it('moves the end edge of a date-only task, keeping its start', () => {
    expect(setEnd(bar, '2026-11-24')).toEqual({ dueDate: '2026-11-24', spanDays: 7 })
    expect(setEnd(bar, '2026-11-18')).toEqual({ dueDate: '2026-11-18', spanDays: 1 })
    expect(setEnd(bar, '2026-11-10')).toEqual({ dueDate: '2026-11-17', spanDays: undefined }) // not before the start
    expect(setEnd(bar, '2026-11-20')).toBeNull()
    expect(setEnd(one, '2026-11-21')).toEqual({ dueDate: '2026-11-21', spanDays: 3 })
  })
  it('stretches or trims a timed task through its duration, keeping the clock times', () => {
    const t = task({ dueDate: '2026-11-30', dueTime: '22:00', duration: 360 }) // to Dec 1, 04:00 (6 hours)
    expect(setEnd(t, '2026-12-03')).toEqual({ duration: 3 * 1440 + 240 - 1320 }) // to Dec 3, 04:00
    expect(spanAfter(t, setEnd(t, '2026-12-03'))).toEqual({ start: '2026-11-30', end: '2026-12-03' })
    expect(setEnd(t, '2026-11-30')).toEqual({ duration: 120 }) // cut to the end of its day
    // before its own day: the due date follows and the duration fits the day
    const lead = task({ dueDate: '2026-11-30', dueTime: '22:00', duration: 360, spanDays: 3 })
    expect(setEnd(lead, '2026-11-28')).toEqual({ dueDate: '2026-11-28', spanDays: 1, duration: 120 })
  })
  it('schedules an undated task on the day it is dropped on', () => {
    expect(scheduleOn(task({}), '2026-11-25')).toEqual({ dueDate: '2026-11-25', spanDays: undefined })
    expect(scheduleOn(one, '2026-11-18')).toBeNull()
  })
  it('routes by drag kind', () => {
    expect(dropPatch(bar, 'move', 1, '')).toEqual({ dueDate: '2026-11-21' })
    expect(dropPatch(bar, 'start', -2, '')).toEqual({ spanDays: 5 })
    expect(dropPatch(bar, 'end', 3, '')).toEqual({ dueDate: '2026-11-23', spanDays: 6 })
    expect(dropPatch(task({}), 'schedule', 0, '2026-12-01')).toEqual({ dueDate: '2026-12-01', spanDays: undefined })
    expect(dropPatch(task({}), 'start', 1, '')).toBeNull()
  })
})

describe('rows', () => {
  const a = task({ id: 'a', dueDate: '2026-11-20', sectionId: 's2', order: 1 })
  const b = task({ id: 'b', dueDate: '2026-11-10', sectionId: 's2', order: 2 })
  const c = task({ id: 'c', dueDate: '2026-11-12', order: 3 })
  const d = task({ id: 'd', dueDate: '2026-11-12', sectionId: 'gone', order: 0 })
  it('is one group without sections, sorted by start', () => {
    const g = groupRows([a, b, c], [])
    expect(g).toHaveLength(1)
    expect(g[0].rows.map((r) => r.task.id)).toEqual(['b', 'c', 'a'])
  })
  it('groups by section in list order, unknown sections last', () => {
    const g = groupRows([a, b, c, d], [
      { id: 's1', name: 'One' },
      { id: 's2', name: 'Two' },
    ])
    expect(g.map((x) => x.key)).toEqual(['s1', 's2', 'none'])
    expect(g[1].rows.map((r) => r.task.id)).toEqual(['b', 'a'])
    expect(g[2].rows.map((r) => r.task.id)).toEqual(['d', 'c']) // same start: list order
  })
})
