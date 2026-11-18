// Reminder scheduling, without the browser: when a task's reminder is due, which reminders are due now,
// and how snoozing and dismissing change the saved reminder state. src/reminders.ts runs it in the app.
import { addDays, parseISO } from 'date-fns'
import type { Task } from './types'

/** What the app remembers about reminders, saved next to the app data. */
export interface ReminderState {
  /** Reminders are tracked from this time on: older ones (from before reminders existed) never show. */
  since: number
  /** Reminders that were handled (completed, opened or dismissed): task id → the reminder time handled. */
  done: Record<string, number>
  /** Snoozed reminders: task id → the reminder time snoozed and when it comes back. */
  snoozed: Record<string, { at: number; until: number }>
  /** Reminders already announced with a sound and a system notification: task id → the time announced. */
  announced: Record<string, number>
  /** Whether the hint offering notifications was shown, the first time a reminder was set. */
  hinted?: boolean
}

export const emptyReminderState = (now: number): ReminderState => ({ since: now, done: {}, snoozed: {}, announced: {} })

/**
 * When the task's reminder is due, in ms, or null when it has none. With a time, `reminder` is minutes
 * before the due time; for all-day tasks it is minutes before 00:00 of the due day (-540 = on the day at 09:00).
 */
export function reminderAt(task: Pick<Task, 'dueDate' | 'dueTime' | 'reminder'>): number | null {
  if (!task.dueDate || task.reminder == null) return null
  const day = parseISO(task.dueDate)
  if (Number.isNaN(day.getTime())) return null
  let minutes = -task.reminder
  if (task.dueTime) {
    const [h, m] = task.dueTime.split(':').map(Number)
    minutes += h * 60 + m
  }
  // Built from the local date so the time stays right across daylight saving changes
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes).getTime()
}

const open = (t: Task) => t.status === 0 && !t.deleted

/** When the reminder of `task` fires next given the state: its own time, or the end of a snooze. Null when handled or none. */
export function fireTime(task: Task, s: ReminderState): number | null {
  if (!open(task)) return null
  const at = reminderAt(task)
  if (at == null || s.done[task.id] === at) return null
  const snooze = s.snoozed[task.id]
  if (snooze && snooze.at === at) return snooze.until
  return at > s.since ? at : null
}

export interface DueReminder {
  task: Task
  /** The task's reminder time (what "done" and "snoozed" refer to). */
  at: number
  /** When it fired: the reminder time or the end of its snooze. */
  firedAt: number
}

/** Reminders due at `now` and not handled yet, oldest first. */
export function dueReminders(tasks: Task[], s: ReminderState, now: number): DueReminder[] {
  const due: DueReminder[] = []
  for (const task of tasks) {
    const firedAt = fireTime(task, s)
    if (firedAt != null && firedAt <= now) due.push({ task, at: reminderAt(task)!, firedAt })
  }
  return due.sort((a, b) => a.firedAt - b.firedAt)
}

/** The next time after `now` a reminder fires, or null when none is scheduled. */
export function nextFireTime(tasks: Task[], s: ReminderState, now: number): number | null {
  let next: number | null = null
  for (const task of tasks) {
    const f = fireTime(task, s)
    if (f != null && f > now && (next == null || f < next)) next = f
  }
  return next
}

/** A reminder that fired longer ago than this was missed (the app was closed or asleep): it gets a card but no sound or notification. */
export const MISSED_AFTER = 2 * 60_000

export const isMissed = (r: DueReminder, now: number) => now - r.firedAt > MISSED_AFTER

/** Due reminders that were not announced yet. */
export function unannounced(due: DueReminder[], s: ReminderState): DueReminder[] {
  return due.filter((r) => s.announced[r.task.id] !== r.firedAt)
}

export function markAnnounced(s: ReminderState, due: DueReminder[]): ReminderState {
  if (!due.length) return s
  const announced = { ...s.announced }
  for (const r of due) announced[r.task.id] = r.firedAt
  return { ...s, announced }
}

/** Marks a reminder handled: its card goes away and it does not fire again (until the task's time changes). */
export function dismiss(s: ReminderState, taskId: string, at: number): ReminderState {
  const snoozed = { ...s.snoozed }
  delete snoozed[taskId]
  return { ...s, done: { ...s.done, [taskId]: at }, snoozed }
}

export function snooze(s: ReminderState, taskId: string, at: number, until: number): ReminderState {
  const done = { ...s.done }
  delete done[taskId]
  return { ...s, done, snoozed: { ...s.snoozed, [taskId]: { at, until } } }
}

export type SnoozeOption = 5 | 15 | 60 | 'tomorrow'
export const SNOOZE_OPTIONS: SnoozeOption[] = [5, 15, 60, 'tomorrow']
/** Snoozing until tomorrow brings the reminder back at this time of day. */
export const TOMORROW_HOUR = 9

/** When a reminder snoozed at `now` comes back. */
export function snoozeUntil(option: SnoozeOption, now: number): number {
  if (option === 'tomorrow') {
    const d = addDays(new Date(now), 1)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), TOMORROW_HOUR).getTime()
  }
  return now + option * 60_000
}

/** Drops entries of tasks that no longer exist, so the saved state does not grow forever. */
export function pruneReminderState(s: ReminderState, tasks: Task[]): ReminderState {
  const ids = new Set(tasks.map((t) => t.id))
  const keep = <T,>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([id]) => ids.has(id)))
  return { ...s, done: keep(s.done), snoozed: keep(s.snoozed), announced: keep(s.announced) }
}
