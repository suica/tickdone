import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dueLabel, isOverdue, nextOccurrence, reminderLabel, repeatLabel } from '../dates'
import { setLocale } from '../i18n'
import type { Task } from '../types'

beforeEach(() => {
  setLocale('en')
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 18, 10, 0, 0)) // Wednesday 10:00
})
afterEach(() => {
  vi.useRealTimers()
  setLocale('en')
})

const task = (p: Partial<Task>): Task => ({
  id: 't', title: 't', content: '', listId: 'inbox', tags: [], priority: 0, status: 0,
  createdAt: 0, modifiedAt: 0, order: 0, subtasks: [], ...p,
})

describe('dueLabel', () => {
  it.each([
    [{ dueDate: '2026-11-18' }, 'Today'],
    [{ dueDate: '2026-11-19' }, 'Tomorrow'],
    [{ dueDate: '2026-11-17' }, 'Yesterday'],
    [{ dueDate: '2026-11-21' }, 'Sat'],
    [{ dueDate: '2026-12-01' }, 'Dec 1'],
    [{ dueDate: '2027-02-03' }, 'Feb 3, 2027'],
    [{ dueDate: '2026-11-18', dueTime: '15:00' }, 'Today, 3:00 PM'],
    [{ dueDate: '2026-12-01', dueTime: '09:30' }, 'Dec 1, 9:30 AM'],
    [{}, ''],
  ])('en: %j → %s', (t, label) => {
    expect(dueLabel(t)).toBe(label)
  })

  it.each([
    [{ dueDate: '2026-11-18' }, '今天'],
    [{ dueDate: '2026-11-19' }, '明天'],
    [{ dueDate: '2026-11-17' }, '昨天'],
    [{ dueDate: '2026-11-21' }, '周六'],
    [{ dueDate: '2026-12-01' }, '12月1日'],
    [{ dueDate: '2027-02-03' }, '2027年2月3日'],
    [{ dueDate: '2026-11-18', dueTime: '15:00' }, '今天 15:00'],
    [{ dueDate: '2026-12-01', dueTime: '09:30' }, '12月1日 9:30'],
  ])('zh-CN: %j → %s', (t, label) => {
    setLocale('zh-CN')
    expect(dueLabel(t)).toBe(label)
  })

  it('uses the locale’s words and formats', () => {
    setLocale('de')
    expect(dueLabel({ dueDate: '2026-11-19', dueTime: '15:00' })).toBe('Morgen, 15:00')
    expect(dueLabel({ dueDate: '2026-12-01' })).toBe('1. Dez.')
  })
})

describe('isOverdue', () => {
  it('an open task from yesterday is overdue, a completed one is not', () => {
    expect(isOverdue(task({ dueDate: '2026-11-17' }))).toBe(true)
    expect(isOverdue(task({ dueDate: '2026-11-17', status: 2 }))).toBe(false)
  })
  it('today: only when it has a time that has passed', () => {
    expect(isOverdue(task({ dueDate: '2026-11-18' }))).toBe(false)
    expect(isOverdue(task({ dueDate: '2026-11-18', dueTime: '09:00' }))).toBe(true)
    expect(isOverdue(task({ dueDate: '2026-11-18', dueTime: '11:00' }))).toBe(false)
  })
})

describe('nextOccurrence', () => {
  it('daily / every N days', () => {
    expect(nextOccurrence('2026-11-18', { kind: 'daily', interval: 1 })).toBe('2026-11-19')
    expect(nextOccurrence('2026-11-18', { kind: 'daily', interval: 3 })).toBe('2026-11-21')
  })
  it('weekdays: Monday comes after Friday', () => {
    expect(nextOccurrence('2026-11-20', { kind: 'weekdays' })).toBe('2026-11-23')
  })
  it('weekly on given days', () => {
    expect(nextOccurrence('2026-11-18', { kind: 'weekly', interval: 1, days: [1, 5] })).toBe('2026-11-20')
    expect(nextOccurrence('2026-11-20', { kind: 'weekly', interval: 1, days: [1, 5] })).toBe('2026-11-23')
  })
  it('monthly, yearly', () => {
    expect(nextOccurrence('2026-01-31', { kind: 'monthly', interval: 1 })).toBe('2026-02-28')
    expect(nextOccurrence('2024-02-29', { kind: 'yearly', interval: 1 })).toBe('2025-02-28')
  })
})

describe('labels', () => {
  it('repeatLabel', () => {
    expect(repeatLabel(null)).toBe('None')
    expect(repeatLabel({ kind: 'daily', interval: 1 })).toBe('Daily')
    expect(repeatLabel({ kind: 'daily', interval: 3 })).toBe('Every 3 days')
    expect(repeatLabel({ kind: 'weekly', interval: 1, days: [1, 3] })).toBe('Weekly on Mon, Wed')
    expect(repeatLabel({ kind: 'monthly', interval: 2 })).toBe('Every 2 months')
    expect(repeatLabel({ kind: 'yearly', interval: 1 })).toBe('Yearly')
    setLocale('zh-CN')
    expect(repeatLabel(null)).toBe('无')
    expect(repeatLabel({ kind: 'daily', interval: 1 })).toBe('每天')
    expect(repeatLabel({ kind: 'weekly', interval: 1, days: [1, 3] })).toBe('每周一、周三')
    expect(repeatLabel({ kind: 'monthly', interval: 2 })).toBe('每 2 个月')
  })
  it('reminderLabel', () => {
    expect(reminderLabel(null)).toBe('None')
    expect(reminderLabel(0)).toBe('On time')
    expect(reminderLabel(1)).toBe('1 minute before')
    expect(reminderLabel(5)).toBe('5 minutes before')
    expect(reminderLabel(60)).toBe('1 hour before')
    expect(reminderLabel(1440)).toBe('1 day before')
    setLocale('zh-CN')
    expect(reminderLabel(0)).toBe('准时')
    expect(reminderLabel(5)).toBe('提前 5 分钟')
    setLocale('ru')
    expect(reminderLabel(5)).toBe('За 5 минут')
    expect(reminderLabel(120)).toBe('За 2 часа')
    expect(reminderLabel(1440)).toBe('За 1 день')
  })
})
