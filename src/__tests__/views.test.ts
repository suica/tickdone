import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groupTasks, sortTasks, tasksForView, viewDefaults } from '../views'
import type { AppData, Task } from '../types'

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

const data = (tasks: Task[]): AppData =>
  ({
    version: 1,
    tasks,
    lists: [{ id: 'work', name: '工作', sections: [{ id: 's1', name: '进行中' }, { id: 's2', name: '待定' }], view: 'list', order: 0 }],
    folders: [],
    tags: [],
    habits: [],
    focus: [],
  }) as unknown as AppData

describe('tasksForView', () => {
  const overdue = task({ title: '过期', dueDate: '2026-11-10' })
  const today = task({ title: '今天', dueDate: '2026-11-18' })
  const tomorrow = task({ title: '明天', dueDate: '2026-11-19' })
  const later = task({ title: '下月', dueDate: '2026-12-30' })
  const nodate = task({ title: '无日期' })
  const work = task({ title: '工作', listId: 'work', tags: ['重要'] })
  const done = task({ title: '已完成', dueDate: '2026-11-18', status: 2, completedAt: new Date(2026, 10, 18, 9).getTime() })
  const deleted = task({ title: '删了', dueDate: '2026-11-18', deleted: true })
  const d = data([overdue, today, tomorrow, later, nodate, work, done, deleted])
  const titles = (ts: Task[]) => ts.map((t) => t.title)

  it('今天包含过期，不含已删除；今天完成的进已完成部分', () => {
    const v = tasksForView('today', d)
    expect(titles(v.open)).toEqual(['过期', '今天'])
    expect(titles(v.done)).toEqual(['已完成'])
  })
  it('明天、最近7天', () => {
    expect(titles(tasksForView('tomorrow', d).open)).toEqual(['明天'])
    expect(titles(tasksForView('week', d).open)).toEqual(['过期', '今天', '明天'])
  })
  it('收件箱、清单、标签', () => {
    expect(titles(tasksForView('inbox', d).open)).toEqual(['过期', '今天', '明天', '下月', '无日期'])
    expect(titles(tasksForView('list:work', d).open)).toEqual(['工作'])
    expect(titles(tasksForView('tag:重要', d).open)).toEqual(['工作'])
  })
  it('垃圾桶只有已删除的', () => {
    expect(titles(tasksForView('trash', d).open)).toEqual(['删了'])
  })
})

describe('sortTasks', () => {
  it('置顶在前；按日期排时无日期在最后，同日按优先级', () => {
    const a = task({ title: 'a', dueDate: '2026-11-20', priority: 1 })
    const b = task({ title: 'b', dueDate: '2026-11-20', priority: 5 })
    const c = task({ title: 'c' })
    const p = task({ title: 'p', pinned: true })
    expect(sortTasks([a, b, c, p], 'date').map((t) => t.title)).toEqual(['p', 'b', 'a', 'c'])
    expect(sortTasks([a, b, c, p], 'priority').map((t) => t.title)).toEqual(['p', 'b', 'a', 'c'])
  })
})

describe('groupTasks', () => {
  it('按日期分组的顺序与拖入时的属性', () => {
    const g = groupTasks(
      [task({ dueDate: '2026-11-19' }), task({ dueDate: '2026-11-10' }), task({}), task({ dueDate: '2026-11-18' })],
      'date', data([]), 'all',
    )
    expect(g.map((x) => x.name)).toEqual(['已过期', '今天', '明天', '无日期'])
    expect(g[1].patch).toEqual({ dueDate: '2026-11-18' })
    expect(g[3].patch).toEqual({ dueDate: undefined, dueTime: undefined })
  })
  it('清单分栏把空栏也列出', () => {
    const g = groupTasks([task({ listId: 'work', sectionId: 's2' })], 'section', data([]), 'list:work')
    expect(g.map((x) => [x.name, x.tasks.length])).toEqual([['进行中', 0], ['待定', 1]])
  })
  it('新建任务的默认属性跟随视图', () => {
    expect(viewDefaults('today')).toEqual({ dueDate: '2026-11-18' })
    expect(viewDefaults('tomorrow')).toEqual({ dueDate: '2026-11-19' })
    expect(viewDefaults('list:work')).toEqual({ listId: 'work' })
    expect(viewDefaults('tag:读书')).toEqual({ tags: ['读书'] })
  })
})
