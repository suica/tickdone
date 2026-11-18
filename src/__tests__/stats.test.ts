import { describe, expect, it } from 'vitest'
import { format } from 'date-fns'
import {
  bucketsOf,
  dayStreaks,
  focusStats,
  granularityOf,
  habitBestStreak,
  habitStats,
  habitStreak,
  niceTicks,
  periodRange,
  shiftPeriod,
  taskStats,
} from '../stats'
import type { FocusRecord, Habit, Task, TaskList } from '../types'

const d = (s: string) => new Date(s + 'T00:00:00')
const at = (s: string, hm = '10:00') => new Date(`${s}T${hm}:00`).getTime()
const day = (x: Date) => format(x, 'yyyy-MM-dd')
/** Wednesday 2026-11-18, 15:00 */
const NOW = new Date('2026-11-18T15:00:00')

let n = 0
const task = (p: Partial<Task>): Task => ({
  id: 't' + ++n, title: 't' + n, content: '', listId: 'inbox', tags: [], priority: 0, status: 0,
  createdAt: 0, modifiedAt: 0, order: n, subtasks: [], ...p,
})
const done = (when: string, p: Partial<Task> = {}) => task({ status: 2, completedAt: at(when), ...p })
const lists: TaskList[] = [
  { id: 'work', name: 'Work', sections: [], view: 'list', order: 1 },
  { id: 'old', name: 'Old', sections: [], view: 'list', order: 2, archived: true },
]

describe('periods', () => {
  it('covers the week, month, year and the last 30 days around the anchor', () => {
    const w = periodRange('week', NOW, 1)
    expect([day(w.start), day(w.end)]).toEqual(['2026-11-16', '2026-11-22'])
    const ws = periodRange('week', NOW, 0)
    expect([day(ws.start), day(ws.end)]).toEqual(['2026-11-15', '2026-11-21'])
    const m = periodRange('month', NOW, 1)
    expect([day(m.start), day(m.end)]).toEqual(['2026-11-01', '2026-11-30'])
    const y = periodRange('year', NOW, 1)
    expect([day(y.start), day(y.end)]).toEqual(['2026-01-01', '2026-12-31'])
    const l = periodRange('last30', NOW, 1)
    expect([day(l.start), day(l.end)]).toEqual(['2026-10-20', '2026-11-18'])
  })

  it('orders a custom range and steps periods back and forth', () => {
    const c = periodRange('custom', NOW, 1, { start: d('2026-11-10'), end: d('2026-11-01') })
    expect([day(c.start), day(c.end)]).toEqual(['2026-11-01', '2026-11-10'])
    expect(day(shiftPeriod('week', NOW, -1))).toBe('2026-11-11')
    expect(day(shiftPeriod('month', NOW, 1))).toBe('2026-12-18')
    expect(day(shiftPeriod('year', NOW, -1))).toBe('2025-11-18')
  })

  it('draws a bar per day, week or month depending on the length', () => {
    expect(granularityOf(periodRange('month', NOW, 1))).toBe('day')
    expect(granularityOf({ start: d('2026-01-01'), end: d('2026-04-30') })).toBe('week')
    expect(granularityOf(periodRange('year', NOW, 1))).toBe('month')
    expect(bucketsOf(periodRange('week', NOW, 1), 'day', 1)).toHaveLength(7)
    expect(bucketsOf(periodRange('year', NOW, 1), 'month', 1)).toHaveLength(12)
    // weeks are cut to the range at both ends
    const weeks = bucketsOf({ start: d('2026-11-04'), end: d('2026-11-18') }, 'week', 1)
    expect(weeks.map((b) => [day(b.start), day(b.end)])).toEqual([
      ['2026-11-04', '2026-11-08'],
      ['2026-11-09', '2026-11-15'],
      ['2026-11-16', '2026-11-18'],
    ])
  })
})

describe('niceTicks', () => {
  it('picks round steps for counts, durations and shares', () => {
    expect(niceTicks(0)).toEqual([0, 1])
    expect(niceTicks(7)).toEqual([0, 5, 10])
    expect(niceTicks(4)).toEqual([0, 2, 4])
    expect(niceTicks(130 * 60000, 'ms')).toEqual([0, 120, 240].map((m) => m * 60000))
    expect(niceTicks(0.3, 'ratio')).toEqual([0, 0.5, 1])
  })
})

describe('dayStreaks', () => {
  it('counts the current run up to today or yesterday, and the longest run', () => {
    const s = new Set(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-16', '2026-11-17'])
    expect(dayStreaks(s, NOW)).toEqual({ current: 2, best: 4 })
    expect(dayStreaks(new Set([...s, '2026-11-18']), NOW)).toEqual({ current: 3, best: 4 })
    expect(dayStreaks(new Set(['2026-11-10']), NOW)).toEqual({ current: 0, best: 1 })
    expect(dayStreaks(new Set(), NOW)).toEqual({ current: 0, best: 0 })
  })
})

describe('taskStats', () => {
  const week = periodRange('week', NOW, 1)
  const tasks = [
    done('2026-11-16', { listId: 'work', priority: 5, tags: ['a'], dueDate: '2026-11-16' }),
    done('2026-11-16', { listId: 'work', priority: 3, tags: ['a', 'b'] }),
    done('2026-11-17', { priority: 5 }),
    done('2026-11-18', { listId: 'old' }),
    done('2026-11-10'), // last week
    done('2026-11-17', { deleted: true }), // in the trash
    task({ status: -1, completedAt: at('2026-11-17'), dueDate: '2026-11-17' }), // won't do
    task({ dueDate: '2026-11-17' }), // due this week, open, overdue
    task({ dueDate: '2026-11-01' }), // overdue, before the range
    task({ dueDate: '2026-11-20' }), // due later this week: not counted yet
    task({ dueDate: '2026-11-02', listId: 'old' }), // overdue in an archived list: left out
  ]
  const s = taskStats({ tasks, lists }, week, 1, NOW)

  it('counts completed tasks in the range, per day', () => {
    expect(s.completed).toBe(4)
    expect(s.series).toEqual([2, 1, 1, 0, 0, 0, 0])
  })

  it('works out the completion rate of tasks due so far and the overdue count', () => {
    expect([s.dueDone, s.due]).toEqual([1, 2])
    expect(s.rate).toBe(0.5)
    expect(s.overdue).toBe(2)
    expect(taskStats({ tasks: [], lists }, week, 1, NOW).rate).toBeNull()
  })

  it('breaks completed tasks down by list, priority and tag', () => {
    expect(s.byList).toEqual([
      { key: 'work', count: 2 },
      { key: 'inbox', count: 1 },
      { key: 'old', count: 1 },
    ])
    expect(s.byPriority).toEqual([
      { key: 5, count: 2 },
      { key: 3, count: 1 },
      { key: 0, count: 1 },
    ])
    expect(s.byTag).toEqual([
      { key: 'a', count: 2 },
      { key: 'b', count: 1 },
    ])
  })

  it('keeps a streak of days with completed tasks', () => {
    expect(s.streak).toBe(3)
    expect(s.bestStreak).toBe(3)
  })

  it('counts per month over a year', () => {
    const y = taskStats({ tasks, lists }, periodRange('year', NOW, 1), 1, NOW)
    expect(y.series).toHaveLength(12)
    expect(y.series[10]).toBe(5)
  })
})

describe('focusStats', () => {
  const rec = (start: string, minutes: number, taskId?: string): FocusRecord => ({
    id: start, start: new Date(start).getTime(), end: new Date(start).getTime() + minutes * 60000, taskId, mode: 'pomo',
  })
  const tasks = [task({ id: 'w1', listId: 'work' }), task({ id: 'i1' })]
  const records = [
    rec('2026-11-16T09:40:00', 40, 'w1'), // 20 min in the 9 o'clock hour, 20 in the 10 o'clock one
    rec('2026-11-16T10:30:00', 25, 'w1'),
    rec('2026-11-18T14:00:00', 30, 'i1'),
    rec('2026-11-17T21:00:00', 15),
    rec('2026-11-01T10:00:00', 60, 'w1'), // outside the week
  ]
  const s = focusStats(records, tasks, periodRange('week', NOW, 1), 1, NOW)
  const M = 60000

  it('totals focus time and sessions in the range, per day', () => {
    expect(s.sessions).toBe(4)
    expect(s.totalMs).toBe(110 * M)
    expect(s.series.slice(0, 3)).toEqual([65 * M, 15 * M, 30 * M])
    // three days of the week have begun
    expect(s.dailyAvgMs).toBeCloseTo((110 * M) / 3)
  })

  it('splits sessions across the hours of the day and finds the best one', () => {
    expect(s.hours[9]).toBe(20 * M)
    expect(s.hours[10]).toBe(45 * M)
    expect(s.hours[14]).toBe(30 * M)
    expect(s.bestHour).toBe(10)
    expect(focusStats([], tasks, periodRange('week', NOW, 1), 1, NOW).bestHour).toBeNull()
  })

  it('adds up time per task and per list', () => {
    expect(s.byTask).toEqual([
      { key: 'w1', ms: 65 * M },
      { key: 'i1', ms: 30 * M },
      { key: '', ms: 15 * M },
    ])
    expect(s.byList).toEqual([
      { key: 'work', ms: 65 * M },
      { key: 'inbox', ms: 30 * M },
    ])
  })
})

describe('habits', () => {
  const habit = (p: Partial<Habit>): Habit => ({ id: 'h' + ++n, name: 'h', icon: '', color: '', checkins: {}, createdAt: at('2026-11-01'), order: 0, ...p })
  const marks = (...days: string[]) => Object.fromEntries(days.map((x) => [x, true as const]))

  it('keeps streaks across days a habit is not planned for', () => {
    // Mondays and Wednesdays only
    const h = habit({ frequency: { kind: 'days', days: [1, 3] }, checkins: marks('2026-11-09', '2026-11-11', '2026-11-16') })
    expect(habitStreak(h, NOW)).toBe(3)
    expect(habitBestStreak(h)).toBe(3)
    const daily = habit({ checkins: marks('2026-11-15', '2026-11-16', '2026-11-17') })
    expect(habitStreak(daily, NOW)).toBe(3)
    expect(habitStreak(daily, new Date('2026-11-20T09:00:00'))).toBe(0)
  })

  it('works out the check-in rate over planned days up to today', () => {
    const a = habit({ checkins: marks('2026-11-16', '2026-11-17') }) // 2 of 3 days
    const b = habit({ createdAt: at('2026-11-18'), checkins: marks('2026-11-18') }) // 1 of 1 (made today)
    const archived = habit({ archived: true, checkins: marks('2026-11-16') })
    const s = habitStats([a, b, archived], periodRange('week', NOW, 1), 1, NOW)
    expect([s.checked, s.planned]).toEqual([3, 4])
    expect(s.rate).toBe(0.75)
    expect(s.series).toEqual([1, 1, 0.5, null, null, null, null])
    // longest current streak first; archived habits are left out
    expect(s.habits.map((r) => r.habit.id)).toEqual([a.id, b.id])
    expect(s.habits.find((r) => r.habit.id === a.id)).toMatchObject({ streak: 2, checked: 2 })
    expect(s.habits.find((r) => r.habit.id === a.id)!.rate).toBeCloseTo(2 / 3)
    expect(s.habits).toHaveLength(2)
  })

  it('plans "N days a week" habits as a share of each day', () => {
    const h = habit({ frequency: { kind: 'weekly', times: 3 }, checkins: marks('2026-11-16') })
    const s = habitStats([h], periodRange('week', NOW, 1), 1, NOW)
    expect(s.planned).toBeCloseTo(9 / 7)
    expect(s.rate).toBeCloseTo(7 / 9)
  })
})
