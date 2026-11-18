import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bigData } from '../dev/seed'
import { setLocale } from '../i18n'
import { activeLists, openCounts, SMART, tasksForView } from '../views'
import { FILTER_PREFIX } from '../filters'
import type { AppData } from '../types'

beforeEach(() => {
  setLocale('en')
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 18, 10, 0, 0))
})
afterEach(() => vi.useRealTimers())

describe('the large seed', () => {
  it('builds 5,000 tasks in 30 lists with tags, subtasks, nesting and dates, the same every time', () => {
    const d = bigData({ today: new Date(2026, 10, 18) })
    expect(d.tasks).toHaveLength(5000)
    expect(d.lists).toHaveLength(30)
    expect(new Set(d.tasks.map((t) => t.listId)).size).toBe(31) // and the inbox
    expect(d.tasks.filter((t) => t.tags.length).length).toBeGreaterThan(1000)
    expect(d.tasks.filter((t) => t.subtasks.length).length).toBeGreaterThan(500)
    expect(d.tasks.filter((t) => t.parentId).length).toBeGreaterThan(100)
    expect(d.tasks.filter((t) => t.dueDate).length).toBeGreaterThan(3000)
    expect(d.tasks.filter((t) => t.status === 2).length).toBeGreaterThan(800)
    expect(bigData({ today: new Date(2026, 10, 18) })).toEqual(d)
  })
})

describe('openCounts', () => {
  it('counts what tasksForView shows, for every sidebar view', () => {
    const base = bigData({ today: new Date(2026, 10, 18) })
    const d: AppData = {
      ...base,
      // an archived list, and saved filters
      lists: base.lists.map((l, i) => (i === 4 ? { ...l, archived: true } : l)),
      filters: [
        { id: 'f1', name: 'High', order: 1, match: 'all', priorities: [5] },
        { id: 'f2', name: 'Tagged soon', order: 2, match: 'any', tags: ['tag3'], dates: ['today', 'tomorrow'] },
      ],
    }
    const views = [
      ...SMART.map((s) => s.id),
      'all',
      ...d.lists.map((l) => 'list:' + l.id),
      ...d.tags.map((t) => 'tag:' + t.name),
      ...(d.filters ?? []).map((f) => FILTER_PREFIX + f.id),
    ]
    const counts = openCounts(views, d)
    for (const v of views) expect(counts[v], v).toBe(tasksForView(v, d).open.length)
    expect(activeLists(d)).toHaveLength(29)
  })
})
