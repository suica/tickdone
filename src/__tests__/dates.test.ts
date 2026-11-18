import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dueLabel, isOverdue, nextOccurrence, reminderLabel, repeatLabel } from '../dates'
import type { Task } from '../types'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 18, 10, 0, 0)) // 周三 10:00
})
afterEach(() => vi.useRealTimers())

const task = (p: Partial<Task>): Task => ({
  id: 't', title: 't', content: '', listId: 'inbox', tags: [], priority: 0, status: 0,
  createdAt: 0, modifiedAt: 0, order: 0, subtasks: [], ...p,
})

describe('dueLabel', () => {
  it.each([
    [{ dueDate: '2026-11-18' }, '今天'],
    [{ dueDate: '2026-11-19' }, '明天'],
    [{ dueDate: '2026-11-17' }, '昨天'],
    [{ dueDate: '2026-11-21' }, '周六'],
    [{ dueDate: '2026-12-01' }, '12月1日'],
    [{ dueDate: '2027-02-03' }, '2027年2月3日'],
    [{ dueDate: '2026-11-18', dueTime: '15:00' }, '今天15:00'],
    [{ dueDate: '2026-12-01', dueTime: '09:30' }, '12月1日, 09:30'],
    [{}, ''],
  ])('%j → %s', (t, label) => {
    expect(dueLabel(t)).toBe(label)
  })
})

describe('isOverdue', () => {
  it('昨天的未完成任务过期，已完成的不算', () => {
    expect(isOverdue(task({ dueDate: '2026-11-17' }))).toBe(true)
    expect(isOverdue(task({ dueDate: '2026-11-17', status: 2 }))).toBe(false)
  })
  it('今天：有时间且已过才算过期', () => {
    expect(isOverdue(task({ dueDate: '2026-11-18' }))).toBe(false)
    expect(isOverdue(task({ dueDate: '2026-11-18', dueTime: '09:00' }))).toBe(true)
    expect(isOverdue(task({ dueDate: '2026-11-18', dueTime: '11:00' }))).toBe(false)
  })
})

describe('nextOccurrence', () => {
  it('每天 / 每 N 天', () => {
    expect(nextOccurrence('2026-11-18', { kind: 'daily', interval: 1 })).toBe('2026-11-19')
    expect(nextOccurrence('2026-11-18', { kind: 'daily', interval: 3 })).toBe('2026-11-21')
  })
  it('工作日：周五之后是周一', () => {
    expect(nextOccurrence('2026-11-20', { kind: 'weekdays' })).toBe('2026-11-23')
  })
  it('每周指定几天', () => {
    expect(nextOccurrence('2026-11-18', { kind: 'weekly', interval: 1, days: [1, 5] })).toBe('2026-11-20')
    expect(nextOccurrence('2026-11-20', { kind: 'weekly', interval: 1, days: [1, 5] })).toBe('2026-11-23')
  })
  it('每月、每年', () => {
    expect(nextOccurrence('2026-01-31', { kind: 'monthly', interval: 1 })).toBe('2026-02-28')
    expect(nextOccurrence('2024-02-29', { kind: 'yearly', interval: 1 })).toBe('2025-02-28')
  })
})

describe('文案', () => {
  it('repeatLabel', () => {
    expect(repeatLabel(null)).toBe('无')
    expect(repeatLabel({ kind: 'daily', interval: 1 })).toBe('每天')
    expect(repeatLabel({ kind: 'weekly', interval: 1, days: [1, 3] })).toBe('每周一、三')
    expect(repeatLabel({ kind: 'monthly', interval: 2 })).toBe('每 2 个月')
  })
  it('reminderLabel', () => {
    expect(reminderLabel(null)).toBe('无')
    expect(reminderLabel(0)).toBe('准时')
    expect(reminderLabel(5)).toBe('提前 5 分钟')
    expect(reminderLabel(60)).toBe('提前 1 小时')
    expect(reminderLabel(1440)).toBe('提前 1 天')
  })
})
