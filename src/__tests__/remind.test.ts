import { describe, expect, it } from 'vitest'
import {
  dismiss,
  dueReminders,
  emptyReminderState,
  fireTime,
  isMissed,
  markAnnounced,
  nextFireTime,
  pruneReminderState,
  reminderAt,
  snooze,
  snoozeUntil,
  unannounced,
} from '../remind'
import type { Task } from '../types'

// npm test runs in Asia/Shanghai, so local times below are fixed.
const at = (s: string) => new Date(s).getTime()

const task = (p: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'Call the bank',
  content: '',
  listId: 'inbox',
  tags: [],
  priority: 0,
  status: 0,
  createdAt: 0,
  modifiedAt: 0,
  order: 0,
  subtasks: [],
  dueDate: '2026-11-18',
  dueTime: '09:00',
  reminder: 0,
  ...p,
})

describe('reminderAt', () => {
  it('is the due time minus the reminder for timed tasks', () => {
    expect(reminderAt(task())).toBe(at('2026-11-18T09:00'))
    expect(reminderAt(task({ reminder: 30 }))).toBe(at('2026-11-18T08:30'))
    expect(reminderAt(task({ reminder: 1440 }))).toBe(at('2026-11-17T09:00'))
  })

  it('counts from 00:00 of the due day for all-day tasks', () => {
    // -540 = on the day at 09:00; 900 = the day before at 09:00
    expect(reminderAt(task({ dueTime: undefined, reminder: -540 }))).toBe(at('2026-11-18T09:00'))
    expect(reminderAt(task({ dueTime: undefined, reminder: 900 }))).toBe(at('2026-11-17T09:00'))
  })

  it('is null without a date or a reminder', () => {
    expect(reminderAt(task({ dueDate: undefined }))).toBeNull()
    expect(reminderAt(task({ reminder: null }))).toBeNull()
    expect(reminderAt(task({ reminder: undefined }))).toBeNull()
  })
})

describe('scheduling', () => {
  const s = emptyReminderState(at('2026-11-18T08:00'))

  it('fires at the reminder time, not before', () => {
    const tasks = [task()]
    expect(dueReminders(tasks, s, at('2026-11-18T08:59:59'))).toEqual([])
    expect(nextFireTime(tasks, s, at('2026-11-18T08:59'))).toBe(at('2026-11-18T09:00'))
    const due = dueReminders(tasks, s, at('2026-11-18T09:00'))
    expect(due.map((r) => [r.task.id, r.at, r.firedAt])).toEqual([['t1', at('2026-11-18T09:00'), at('2026-11-18T09:00')]])
  })

  it('skips completed, won’t do and deleted tasks', () => {
    const now = at('2026-11-18T10:00')
    expect(dueReminders([task({ status: 2 }), task({ id: 't2', status: -1 }), task({ id: 't3', deleted: true })], s, now)).toEqual([])
  })

  it('lists due reminders oldest first and picks the earliest next one', () => {
    const tasks = [task({ id: 'b', dueTime: '09:30' }), task({ id: 'a', dueTime: '09:10' }), task({ id: 'c', dueTime: '11:00' })]
    expect(dueReminders(tasks, s, at('2026-11-18T10:00')).map((r) => r.task.id)).toEqual(['a', 'b'])
    expect(nextFireTime(tasks, s, at('2026-11-18T10:00'))).toBe(at('2026-11-18T11:00'))
    expect(nextFireTime([], s, 0)).toBeNull()
  })

  it('ignores reminders from before reminders were tracked', () => {
    const later = emptyReminderState(at('2026-11-18T12:00'))
    expect(fireTime(task(), later)).toBeNull()
    expect(dueReminders([task()], later, at('2026-11-18T12:30'))).toEqual([])
  })

  it('a dismissed reminder stays away until the task’s time changes', () => {
    const done = dismiss(s, 't1', at('2026-11-18T09:00'))
    expect(dueReminders([task()], done, at('2026-11-18T10:00'))).toEqual([])
    // moved to tomorrow (or a repeating task moved on): it fires again
    const moved = task({ dueDate: '2026-11-19' })
    expect(fireTime(moved, done)).toBe(at('2026-11-19T09:00'))
  })
})

describe('snooze', () => {
  const s = emptyReminderState(at('2026-11-18T08:00'))
  const first = at('2026-11-18T09:00')

  it('brings the reminder back after 5, 15 or 60 minutes, or tomorrow at 09:00', () => {
    const now = at('2026-11-18T09:02')
    expect(snoozeUntil(5, now)).toBe(at('2026-11-18T09:07'))
    expect(snoozeUntil(15, now)).toBe(at('2026-11-18T09:17'))
    expect(snoozeUntil(60, now)).toBe(at('2026-11-18T10:02'))
    expect(snoozeUntil('tomorrow', now)).toBe(at('2026-11-19T09:00'))
    expect(snoozeUntil('tomorrow', at('2026-11-30T23:30'))).toBe(at('2026-12-01T09:00'))
  })

  it('hides the card until the snooze ends, then fires again', () => {
    const snoozed = snooze(s, 't1', first, at('2026-11-18T09:07'))
    expect(dueReminders([task()], snoozed, at('2026-11-18T09:06'))).toEqual([])
    expect(nextFireTime([task()], snoozed, at('2026-11-18T09:06'))).toBe(at('2026-11-18T09:07'))
    const due = dueReminders([task()], snoozed, at('2026-11-18T09:07'))
    expect(due.map((r) => [r.at, r.firedAt])).toEqual([[first, at('2026-11-18T09:07')]])
    // it is announced again: a new fire time
    const announced = markAnnounced(s, dueReminders([task()], s, first))
    expect(unannounced(due, { ...snoozed, announced: announced.announced })).toHaveLength(1)
  })

  it('a snooze for an older time of the task does not apply once the task moved', () => {
    const snoozed = snooze(s, 't1', first, at('2026-11-18T09:07'))
    expect(fireTime(task({ dueTime: '15:00' }), snoozed)).toBe(at('2026-11-18T15:00'))
  })

  it('snoozing a dismissed reminder and dismissing a snoozed one replace each other', () => {
    const snoozed = snooze(dismiss(s, 't1', first), 't1', first, at('2026-11-18T09:20'))
    expect(fireTime(task(), snoozed)).toBe(at('2026-11-18T09:20'))
    expect(fireTime(task(), dismiss(snoozed, 't1', first))).toBeNull()
  })
})

describe('missed reminders', () => {
  const s = emptyReminderState(at('2026-11-17T08:00'))

  it('reminders that came due while the app was closed are due when it opens, but count as missed', () => {
    const tasks = [task({ id: 'old', dueDate: '2026-11-17', dueTime: '18:00' }), task({ id: 'now', dueTime: '09:00' })]
    const open = at('2026-11-18T09:01')
    const due = dueReminders(tasks, s, open)
    expect(due.map((r) => r.task.id)).toEqual(['old', 'now'])
    expect(due.map((r) => isMissed(r, open))).toEqual([true, false])
  })

  it('are announced once: after a reload they are still cards, but not new', () => {
    const due = dueReminders([task()], s, at('2026-11-18T12:00'))
    expect(unannounced(due, s)).toHaveLength(1)
    const after = markAnnounced(s, due)
    expect(unannounced(dueReminders([task()], after, at('2026-11-18T12:05')), after)).toEqual([])
    expect(dueReminders([task()], after, at('2026-11-18T12:05'))).toHaveLength(1)
  })

  it('pruning forgets tasks that no longer exist', () => {
    const st = snooze(dismiss(s, 'gone', 1), 'kept', 2, 3)
    const pruned = pruneReminderState({ ...st, announced: { gone: 1, kept: 2 } }, [task({ id: 'kept' })])
    expect(pruned.done).toEqual({})
    expect(pruned.snoozed).toEqual({ kept: { at: 2, until: 3 } })
    expect(pruned.announced).toEqual({ kept: 2 })
  })
})
