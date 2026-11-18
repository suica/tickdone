import { describe, expect, it } from 'vitest'
import { agendaDays, dayRange, dropKind, dropPatch, unscheduledTasks } from '../views/calPlan'
import type { Task, TaskList } from '../types'

let n = 0
const task = (p: Partial<Task>): Task => ({
  id: 't' + ++n, title: 't' + n, content: '', listId: 'inbox', tags: [], priority: 0, status: 0,
  createdAt: 0, modifiedAt: 0, order: n, subtasks: [], ...p,
})
const lists: TaskList[] = [
  { id: 'work', name: 'Work', sections: [], view: 'list', order: 1 },
  { id: 'home', name: 'Home', sections: [], view: 'list', order: 2 },
  { id: 'old', name: 'Old', sections: [], view: 'list', order: 3, archived: true },
]

describe('unscheduledTasks', () => {
  const tasks = [
    task({ id: 'h1', listId: 'home' }),
    task({ id: 'w-low', listId: 'work', priority: 1 }),
    task({ id: 'w-high', listId: 'work', priority: 5 }),
    task({ id: 'in', listId: 'inbox' }),
    task({ id: 'dated', listId: 'work', dueDate: '2026-11-18' }),
    task({ id: 'done', listId: 'work', status: 2 }),
    task({ id: 'wontdo', listId: 'work', status: -1 }),
    task({ id: 'trash', listId: 'work', deleted: true }),
    task({ id: 'archived', listId: 'old' }),
  ]

  it('lists open undated tasks by list order, then priority, then their own order', () => {
    expect(unscheduledTasks({ tasks, lists }).map((t) => t.id)).toEqual(['in', 'w-high', 'w-low', 'h1'])
  })

  it('narrows to one list', () => {
    expect(unscheduledTasks({ tasks, lists }, 'work').map((t) => t.id)).toEqual(['w-high', 'w-low'])
    expect(unscheduledTasks({ tasks, lists }, 'inbox').map((t) => t.id)).toEqual(['in'])
    expect(unscheduledTasks({ tasks, lists }, 'old')).toEqual([])
  })
})

describe('dropPatch', () => {
  const undated = {}
  const allDay = { dueDate: '2026-11-18' }
  const timed = { dueDate: '2026-11-18', dueTime: '10:00' }

  it('schedules an undated task on a time or a day', () => {
    expect(dropPatch(undated, { day: '2026-11-19', time: '14:00' })).toEqual({ dueDate: '2026-11-19', dueTime: '14:00' })
    expect(dropPatch(undated, { day: '2026-11-19' })).toEqual({ dueDate: '2026-11-19' })
  })

  it('moves a dated task, and drops what belonged to its time on the all-day row', () => {
    expect(dropPatch(allDay, { day: '2026-11-20', time: '09:30' })).toEqual({ dueDate: '2026-11-20', dueTime: '09:30' })
    expect(dropPatch(timed, { day: '2026-11-18' })).toEqual({ dueDate: '2026-11-18', dueTime: undefined, reminder: undefined, duration: undefined })
    expect(dropPatch(allDay, { day: '2026-11-20' })).toEqual({ dueDate: '2026-11-20' })
  })

  it('removes the date on the unscheduled panel', () => {
    expect(dropPatch(timed, 'unscheduled')).toEqual({ dueDate: undefined, dueTime: undefined, reminder: undefined, duration: undefined })
  })

  it('changes nothing when the task is already there', () => {
    expect(dropPatch(timed, { day: '2026-11-18', time: '10:00' })).toBeNull()
    expect(dropPatch(allDay, { day: '2026-11-18' })).toBeNull()
    expect(dropPatch(undated, 'unscheduled')).toBeNull()
  })
})

describe('dropKind', () => {
  it('tells scheduling, moving and unscheduling apart', () => {
    expect(dropKind({}, { day: 'd', time: '09:00' })).toBe('scheduledTime')
    expect(dropKind({}, { day: 'd' })).toBe('scheduledDay')
    expect(dropKind({ dueDate: 'x' }, { day: 'd', time: '09:00' })).toBe('movedTime')
    expect(dropKind({ dueDate: 'x' }, { day: 'd' })).toBe('movedDay')
    expect(dropKind({ dueDate: 'x', dueTime: '10:00' }, { day: 'd' })).toBe('movedAllDay')
    expect(dropKind({ dueDate: 'x' }, 'unscheduled')).toBe('unscheduled')
  })
})

describe('agenda days', () => {
  it('counts days on from a start, across months', () => {
    expect(dayRange(new Date(2026, 10, 29), 4)).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'])
  })

  it('keeps the days with something on them, and today', () => {
    const busy = new Set(['2026-11-20', '2026-11-22'])
    expect(agendaDays(dayRange(new Date(2026, 10, 18), 7), (d) => busy.has(d), '2026-11-18')).toEqual(['2026-11-18', '2026-11-20', '2026-11-22'])
    expect(agendaDays(dayRange(new Date(2026, 10, 25), 3), (d) => busy.has(d), '2026-11-18')).toEqual([])
  })
})
