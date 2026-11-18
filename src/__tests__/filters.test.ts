import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { conditionCount, filterClock, filterDefaults, filterMatcher, matchesFilter, moveFilter, sortedFilters } from '../filters'
import { tasksForView, viewDefaults } from '../views'
import type { AppData, SavedFilter, Task } from '../types'

// Wednesday 2026-11-18; with weeks starting on Monday this week is 11-16 … 11-22.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 18, 10, 0, 0))
})
afterEach(() => vi.useRealTimers())

let n = 0
const task = (p: Partial<Task>): Task => ({
  id: 't' + ++n, title: 't' + n, content: '', listId: 'inbox', tags: [], priority: 0, status: 0,
  createdAt: 0, modifiedAt: 0, order: n, subtasks: [], ...p,
})
const filter = (p: Partial<SavedFilter>): SavedFilter => ({ id: 'f', name: 'F', order: 1, match: 'all', ...p })
const data = (tasks: Task[], filters: SavedFilter[] = []): AppData =>
  ({
    version: 1,
    tasks,
    lists: [{ id: 'work', name: 'Work', sections: [], view: 'list', order: 1 }],
    folders: [],
    tags: [{ name: 'urgent' }, { name: 'home' }],
    habits: [],
    focus: [],
    settings: { weekStartsOn: 1 },
    filters,
  }) as unknown as AppData

const clock = () => filterClock(new Date(), 1)
const match = (f: Partial<SavedFilter>, t: Task) => matchesFilter(filter(f), t, clock())

describe('filter conditions', () => {
  it('a filter without conditions matches every task', () => {
    expect(conditionCount(filter({}))).toBe(0)
    expect(match({}, task({}))).toBe(true)
    // empty arrays and a blank keyword are not conditions
    expect(conditionCount(filter({ lists: [], tags: [], priorities: [], dates: [], keyword: '   ' }))).toBe(0)
  })

  it('lists: any of them, the inbox included', () => {
    const f = { lists: ['work', 'inbox'] }
    expect(match(f, task({ listId: 'work' }))).toBe(true)
    expect(match(f, task({ listId: 'inbox' }))).toBe(true)
    expect(match(f, task({ listId: 'other' }))).toBe(false)
  })

  it('tags: any of them by default, or all of them', () => {
    const both = task({ tags: ['urgent', 'home'] })
    const one = task({ tags: ['home'] })
    const none = task({})
    expect(match({ tags: ['urgent', 'home'] }, one)).toBe(true)
    expect(match({ tags: ['urgent', 'home'] }, none)).toBe(false)
    expect(match({ tags: ['urgent', 'home'], tagMode: 'all' }, both)).toBe(true)
    expect(match({ tags: ['urgent', 'home'], tagMode: 'all' }, one)).toBe(false)
  })

  it('priority: any of the chosen levels, "none" included', () => {
    const f = { priorities: [5, 0] as SavedFilter['priorities'] }
    expect(match(f, task({ priority: 5 }))).toBe(true)
    expect(match(f, task({ priority: 0 }))).toBe(true)
    expect(match(f, task({ priority: 3 }))).toBe(false)
  })

  it.each([
    ['overdue', '2026-11-17', true],
    ['overdue', '2026-11-18', false],
    ['today', '2026-11-18', true],
    ['today', '2026-11-19', false],
    ['tomorrow', '2026-11-19', true],
    ['thisWeek', '2026-11-16', true],
    ['thisWeek', '2026-11-22', true],
    ['thisWeek', '2026-11-23', false],
    ['next7', '2026-11-18', true],
    ['next7', '2026-11-24', true],
    ['next7', '2026-11-25', false],
    ['next7', '2026-11-17', false],
  ] as const)('date %s: due %s → %s', (kind, due, expected) => {
    expect(match({ dates: [kind] }, task({ dueDate: due }))).toBe(expected)
    // a task without a date only matches "no date"
    expect(match({ dates: [kind] }, task({}))).toBe(false)
  })

  it('date: no date, and several date choices are combined with "or"', () => {
    expect(match({ dates: ['noDate'] }, task({}))).toBe(true)
    expect(match({ dates: ['noDate'] }, task({ dueDate: '2026-11-18' }))).toBe(false)
    const f = { dates: ['overdue', 'noDate'] as SavedFilter['dates'] }
    expect(match(f, task({ dueDate: '2026-11-01' }))).toBe(true)
    expect(match(f, task({}))).toBe(true)
    expect(match(f, task({ dueDate: '2026-11-18' }))).toBe(false)
  })

  it('this week follows the first day of the week', () => {
    const sunday = task({ dueDate: '2026-11-22' })
    expect(matchesFilter(filter({ dates: ['thisWeek'] }), sunday, filterClock(new Date(), 1))).toBe(true)
    // weeks starting on Sunday: this week is 11-15 … 11-21
    expect(matchesFilter(filter({ dates: ['thisWeek'] }), sunday, filterClock(new Date(), 0))).toBe(false)
  })

  it('custom range: both ends included, either end may be open', () => {
    const range = { dates: ['custom'] as SavedFilter['dates'], from: '2026-11-20', to: '2026-11-30' }
    expect(match(range, task({ dueDate: '2026-11-20' }))).toBe(true)
    expect(match(range, task({ dueDate: '2026-11-30' }))).toBe(true)
    expect(match(range, task({ dueDate: '2026-12-01' }))).toBe(false)
    expect(match(range, task({ dueDate: '2026-11-19' }))).toBe(false)
    expect(match({ dates: ['custom'], from: '2026-12-01' }, task({ dueDate: '2027-05-01' }))).toBe(true)
    expect(match({ dates: ['custom'], to: '2026-11-01' }, task({ dueDate: '2026-10-01' }))).toBe(true)
    expect(match({ dates: ['custom'] }, task({}))).toBe(false)
  })

  it('keywords: every word, case-insensitive, in the title, notes or subtasks', () => {
    const t = task({ title: 'Quarterly Report', content: 'send to finance', subtasks: [{ id: 's', title: 'Charts', done: false }] })
    expect(match({ keyword: 'report' }, t)).toBe(true)
    expect(match({ keyword: 'FINANCE' }, t)).toBe(true)
    expect(match({ keyword: 'charts quarterly' }, t)).toBe(true)
    expect(match({ keyword: 'report budget' }, t)).toBe(false)
  })

  it('match all needs every condition, match any needs one', () => {
    const t = task({ listId: 'work', priority: 1 })
    const conds = { lists: ['work'], priorities: [5] as SavedFilter['priorities'] }
    expect(match({ ...conds, match: 'all' }, t)).toBe(false)
    expect(match({ ...conds, match: 'any' }, t)).toBe(true)
    expect(match({ ...conds, match: 'any' }, task({ listId: 'inbox' }))).toBe(false)
  })
})

describe('filter views', () => {
  it('shows the open tasks that match; completed ones only when the filter says so', () => {
    const open = task({ title: 'open', tags: ['urgent'] })
    const done = task({ title: 'done', tags: ['urgent'], status: 2, completedAt: 1 })
    const other = task({ title: 'other' })
    const deleted = task({ title: 'deleted', tags: ['urgent'], deleted: true })
    const wontDo = task({ title: 'wont', tags: ['urgent'], status: -1 })
    const d = data([open, done, other, deleted, wontDo], [filter({ id: 'a', tags: ['urgent'] }), filter({ id: 'b', tags: ['urgent'], showCompleted: true })])
    expect(tasksForView('filter:a', d)).toEqual({ open: [open], done: [] })
    expect(tasksForView('filter:b', d)).toEqual({ open: [open], done: [done] })
    expect(tasksForView('filter:missing', d)).toEqual({ open: [], done: [] })
  })

  it('quick add pre-fills what the filter asks for', () => {
    const d = data([])
    expect(filterDefaults(filter({ lists: ['work'], tags: ['urgent'], priorities: [5], dates: ['today'] }), d, clock())).toEqual({
      listId: 'work',
      tags: ['urgent'],
      priority: 5,
      dueDate: '2026-11-18',
    })
    // several lists: the first one, unless the inbox is one of them; several priorities: the highest
    expect(filterDefaults(filter({ lists: ['work', 'inbox'], priorities: [3, 5] }), d, clock())).toEqual({ priority: 5 })
    expect(filterDefaults(filter({ lists: ['gone', 'work'] }), d, clock())).toEqual({ listId: 'work' })
    // "no priority" accepted: a new task can keep none
    expect(filterDefaults(filter({ priorities: [5, 0] }), d, clock())).toEqual({})
    // every tag when all are required
    expect(filterDefaults(filter({ tags: ['urgent', 'home'], tagMode: 'all' }), d, clock())).toEqual({ tags: ['urgent', 'home'] })
    // a list that no longer exists is not used
    expect(filterDefaults(filter({ lists: ['gone'] }), d, clock())).toEqual({})
    // dates: tomorrow, a custom range in the future, no date, overdue
    expect(filterDefaults(filter({ dates: ['tomorrow'] }), d, clock())).toEqual({ dueDate: '2026-11-19' })
    expect(filterDefaults(filter({ dates: ['custom'], from: '2026-12-01', to: '2026-12-05' }), d, clock())).toEqual({ dueDate: '2026-12-01' })
    expect(filterDefaults(filter({ dates: ['noDate', 'today'] }), d, clock())).toEqual({})
    expect(filterDefaults(filter({ dates: ['overdue'] }), d, clock())).toEqual({})
    // "any": one condition is enough
    expect(filterDefaults(filter({ match: 'any', lists: ['work'], priorities: [5] }), d, clock())).toEqual({ listId: 'work' })
    // a task added with the defaults shows up in the filter
    const f = filter({ lists: ['work'], tags: ['urgent'], priorities: [5], dates: ['next7'] })
    const added = task(filterDefaults(f, d, clock()))
    expect(filterMatcher(f, clock())(added)).toBe(true)
    expect(viewDefaults('filter:f', data([], [f]))).toEqual(filterDefaults(f, d, clock()))
  })

  it('reorders filters', () => {
    const d = data([], [filter({ id: 'a', order: 1 }), filter({ id: 'b', order: 2 }), filter({ id: 'c', order: 3 })])
    expect(sortedFilters(moveFilter(d, 'c', 0)).map((f) => f.id)).toEqual(['c', 'a', 'b'])
    expect(sortedFilters(moveFilter(d, 'a', 2)).map((f) => f.id)).toEqual(['b', 'c', 'a'])
    expect(moveFilter(d, 'missing', 0)).toBe(d)
  })
})
