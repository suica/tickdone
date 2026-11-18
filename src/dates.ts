import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  getDay,
  parseISO,
} from 'date-fns'
import type { RepeatRule, Task } from './types'

export const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
export const todayStr = () => fmt(new Date())
export const parse = (s: string) => parseISO(s)
export const dayDiff = (s: string) => differenceInCalendarDays(parseISO(s), new Date())

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const weekdayName = (d: Date) => WEEK[getDay(d)]

/** 任务行右侧的日期文字 */
export function dueLabel(t: Pick<Task, 'dueDate' | 'dueTime'>): string {
  if (!t.dueDate) return ''
  const d = parseISO(t.dueDate)
  const diff = dayDiff(t.dueDate)
  let s: string
  if (diff === 0) s = '今天'
  else if (diff === 1) s = '明天'
  else if (diff === -1) s = '昨天'
  else if (diff > 1 && diff < 7) s = weekdayName(d)
  else if (d.getFullYear() === new Date().getFullYear()) s = format(d, 'M月d日')
  else s = format(d, 'yyyy年M月d日')
  if (t.dueTime) s += (diff === 0 || diff === 1 || diff === -1 ? '' : ', ') + t.dueTime
  return s
}

export function isOverdue(t: Task): boolean {
  if (!t.dueDate || t.status !== 0) return false
  const diff = dayDiff(t.dueDate)
  if (diff < 0) return true
  if (diff === 0 && t.dueTime) {
    const [h, m] = t.dueTime.split(':').map(Number)
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes() > h * 60 + m
  }
  return false
}

export function nextOccurrence(date: string, rule: RepeatRule): string {
  const d = parseISO(date)
  switch (rule.kind) {
    case 'daily':
      return fmt(addDays(d, rule.interval))
    case 'weekdays': {
      let n = addDays(d, 1)
      while (getDay(n) === 0 || getDay(n) === 6) n = addDays(n, 1)
      return fmt(n)
    }
    case 'weekly': {
      if (rule.days && rule.days.length) {
        let n = addDays(d, 1)
        for (let i = 0; i < 7 * rule.interval + 7; i++) {
          if (rule.days.includes(getDay(n))) return fmt(n)
          n = addDays(n, 1)
        }
      }
      return fmt(addWeeks(d, rule.interval))
    }
    case 'monthly':
      return fmt(addMonths(d, rule.interval))
    case 'yearly':
      return fmt(addYears(d, rule.interval))
  }
}

export function repeatLabel(rule?: RepeatRule | null): string {
  if (!rule) return '无'
  switch (rule.kind) {
    case 'daily':
      return rule.interval === 1 ? '每天' : `每 ${rule.interval} 天`
    case 'weekdays':
      return '每个工作日（周一至周五）'
    case 'weekly':
      if (rule.days?.length) return '每周' + rule.days.map((x) => WEEK[x].slice(1)).join('、')
      return rule.interval === 1 ? '每周' : `每 ${rule.interval} 周`
    case 'monthly':
      return rule.interval === 1 ? '每月' : `每 ${rule.interval} 个月`
    case 'yearly':
      return rule.interval === 1 ? '每年' : `每 ${rule.interval} 年`
  }
}

export function reminderLabel(m?: number | null): string {
  if (m == null) return '无'
  if (m === 0) return '准时'
  if (m < 60) return `提前 ${m} 分钟`
  if (m < 1440) return `提前 ${m / 60} 小时`
  return `提前 ${m / 1440} 天`
}
