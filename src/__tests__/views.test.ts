import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '../i18n'
import { groupTasks, sortTasks, tasksForView, viewDefaults } from '../views'
import type { AppData, Task } from '../types'

beforeEach(() => {
  setLocale('en')
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 18, 10, 0, 0))
})
afterEach(() => {
  vi.useRealTimers()
  setLocale('en')
})

let n = 0
const task = (p: Partial<Task>): Task => ({
  id: 't' + ++n, title: 't' + n, content: '', listId: 'inbox', tags: [], priority: 0, status: 0,
  createdAt: 0, modifiedAt: 0, order: n, subtasks: [], ...p,
})

const data = (tasks: Task[]): AppData =>
  ({
    version: 1,
    tasks,
    lists: [{ id: 'work', name: 'Work', sections: [{ id: 's1', name: 'Doing' }, { id: 's2', name: 'Later' }], view: 'list', order: 0 }],
    folders: [],
    tags: [],
    habits: [],
    focus: [],
  }) as unknown as AppData

describe('tasksForView', () => {
  const overdue = task({ title: 'overdue', dueDate: '2026-11-10' })
  const today = task({ title: 'today', dueDate: '2026-11-18' })
  const tomorrow = task({ title: 'tomorrow', dueDate: '2026-11-19' })
  const later = task({ title: 'next month', dueDate: '2026-12-30' })
  const nodate = task({ title: 'no date' })
  const work = task({ title: 'work', listId: 'work', tags: ['important'] })
  const done = task({ title: 'done', dueDate: '2026-11-18', status: 2, completedAt: new Date(2026, 10, 18, 9).getTime() })
  const deleted = task({ title: 'deleted', dueDate: '2026-11-18', deleted: true })
  const d = data([overdue, today, tomorrow, later, nodate, work, done, deleted])
  const titles = (ts: Task[]) => ts.map((t) => t.title)

  it('Today includes overdue tasks but not deleted ones; tasks completed today are in the completed part', () => {
    const v = tasksForView('today', d)
    expect(titles(v.open)).toEqual(['overdue', 'today'])
    expect(titles(v.done)).toEqual(['done'])
  })
  it('Tomorrow, Next 7 Days', () => {
    expect(titles(tasksForView('tomorrow', d).open)).toEqual(['tomorrow'])
    expect(titles(tasksForView('week', d).open)).toEqual(['overdue', 'today', 'tomorrow'])
  })
  it('Inbox, lists, tags', () => {
    expect(titles(tasksForView('inbox', d).open)).toEqual(['overdue', 'today', 'tomorrow', 'next month', 'no date'])
    expect(titles(tasksForView('list:work', d).open)).toEqual(['work'])
    expect(titles(tasksForView('tag:important', d).open)).toEqual(['work'])
  })
  it('Trash has only deleted tasks', () => {
    expect(titles(tasksForView('trash', d).open)).toEqual(['deleted'])
  })
})

describe('sortTasks', () => {
  it('pinned first; by date, no date comes last and the same day sorts by priority', () => {
    const a = task({ title: 'a', dueDate: '2026-11-20', priority: 1 })
    const b = task({ title: 'b', dueDate: '2026-11-20', priority: 5 })
    const c = task({ title: 'c' })
    const p = task({ title: 'p', pinned: true })
    expect(sortTasks([a, b, c, p], 'date').map((t) => t.title)).toEqual(['p', 'b', 'a', 'c'])
    expect(sortTasks([a, b, c, p], 'priority').map((t) => t.title)).toEqual(['p', 'b', 'a', 'c'])
  })
  it('by title, in the current language’s order', () => {
    const tasks = ['Zebra', 'apple', 'Äpfel'].map((title) => task({ title }))
    expect(sortTasks(tasks, 'title').map((t) => t.title)).toEqual(['Äpfel', 'apple', 'Zebra'])
  })
})

describe('groupTasks', () => {
  const byDate = () =>
    groupTasks(
      [task({ dueDate: '2026-11-19' }), task({ dueDate: '2026-11-10' }), task({}), task({ dueDate: '2026-11-18' })],
      'date', data([]), 'all',
    )
  it('date groups: order, names and what a drop into them sets', () => {
    const g = byDate()
    expect(g.map((x) => x.name)).toEqual(['Overdue', 'Today', 'Tomorrow', 'No date'])
    expect(g[1].patch).toEqual({ dueDate: '2026-11-18' })
    expect(g[3].patch).toEqual({ dueDate: undefined, dueTime: undefined })
  })
  it('group names follow the language', () => {
    setLocale('zh-CN')
    expect(byDate().map((x) => x.name)).toEqual(['已过期', '今天', '明天', '无日期'])
    const g = groupTasks([task({ dueDate: '2026-11-21' })], 'date', data([]), 'week')
    expect(g[0].name).toBe('11月21日 周六')
    expect(groupTasks([task({ priority: 5 })], 'priority', data([]), 'all')[0].name).toBe('高优先级')
  })
  it('list sections include the empty ones', () => {
    const g = groupTasks([task({ listId: 'work', sectionId: 's2' })], 'section', data([]), 'list:work')
    expect(g.map((x) => [x.name, x.tasks.length])).toEqual([['Doing', 0], ['Later', 1]])
  })
  it('a new task gets defaults from the view', () => {
    expect(viewDefaults('today')).toEqual({ dueDate: '2026-11-18' })
    expect(viewDefaults('tomorrow')).toEqual({ dueDate: '2026-11-19' })
    expect(viewDefaults('list:work')).toEqual({ listId: 'work' })
    expect(viewDefaults('tag:reading')).toEqual({ tags: ['reading'] })
  })
})
