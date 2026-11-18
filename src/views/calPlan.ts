// Planning in the calendar: the tasks that have no date yet, where a drop puts a task, and which days
// the agenda lists. Pure functions, so they are easy to test.
import { addDays, format } from 'date-fns'
import { activeTasks } from '../views'
import type { AppData, Task } from '../types'

/** "all", or a list id ("inbox" for the inbox). */
export type ListFilter = string

/**
 * Open tasks without a date, in the lists that are not archived: in the order of their lists in the
 * sidebar (the inbox first), then highest priority first, then their own order.
 */
export function unscheduledTasks(d: Pick<AppData, 'tasks' | 'lists'>, list: ListFilter = 'all'): Task[] {
  const rank = new Map(d.lists.map((l, i) => [l.id, i + 1]))
  rank.set('inbox', 0)
  return activeTasks(d)
    .filter((t) => t.status === 0 && !t.dueDate && (list === 'all' || t.listId === list))
    .sort((a, b) => (rank.get(a.listId) ?? 999) - (rank.get(b.listId) ?? 999) || b.priority - a.priority || a.order - b.order)
}

/** Where a dragged task lands: a day's all-day row, a time on a day, or the unscheduled panel. */
export type DropTarget = { day: string; time?: string } | 'unscheduled'

/**
 * The change a drop makes to a task, or null when it changes nothing. A task dropped on a time gets
 * that day and time; on a day's all-day row it keeps no time (and loses the reminder and length that
 * belonged to its time); on the unscheduled panel it loses its date altogether.
 */
export function dropPatch(task: Pick<Task, 'dueDate' | 'dueTime'>, to: DropTarget): Partial<Task> | null {
  if (to === 'unscheduled') {
    if (!task.dueDate) return null
    return { dueDate: undefined, dueTime: undefined, reminder: undefined, duration: undefined }
  }
  if (to.time) {
    if (task.dueDate === to.day && task.dueTime === to.time) return null
    return { dueDate: to.day, dueTime: to.time }
  }
  if (task.dueDate === to.day && !task.dueTime) return null
  return task.dueTime ? { dueDate: to.day, dueTime: undefined, reminder: undefined, duration: undefined } : { dueDate: to.day }
}

/** How a drop reads in the toast: a task that had no date is scheduled; one that had is moved. */
export function dropKind(task: Pick<Task, 'dueDate' | 'dueTime'>, to: DropTarget): 'unscheduled' | 'scheduledDay' | 'scheduledTime' | 'movedDay' | 'movedTime' | 'movedAllDay' {
  if (to === 'unscheduled') return 'unscheduled'
  if (!task.dueDate) return to.time ? 'scheduledTime' : 'scheduledDay'
  if (to.time) return 'movedTime'
  return task.dueTime ? 'movedAllDay' : 'movedDay'
}

/** The first `count` days from `start` (yyyy-MM-dd). */
export function dayRange(start: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'))
}

/** The days the agenda lists: those with tasks or events, plus today when it is among them. */
export function agendaDays(days: string[], has: (day: string) => boolean, today: string): string[] {
  return days.filter((d) => d === today || has(d))
}
