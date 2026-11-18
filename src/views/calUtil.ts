import { useMemo } from 'react'
import { parseISO } from 'date-fns'
import { setUI, useData } from '../store'
import { getLocale, t } from '../i18n'
import { fmtMonthDay, fmtMonthYear, fmtTime, fmtWeekday } from '../i18n/format'
import type { Task } from '../types'
import type { Anchor } from '../components/Popover'

/** Length of a timed task that has no duration yet. */
export const DEFAULT_DUR = 30
/** Grid used when moving, resizing or drawing time blocks. */
export const SNAP = 15
export const DAY_MIN = 24 * 60

export const toMin = (hm: string) => {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + (m || 0)
}
export const toHM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
export const durOf = (t: Pick<Task, 'duration'>) => Math.max(SNAP, Math.round(t.duration ?? DEFAULT_DUR))
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const snapRound = (m: number) => Math.round(m / SNAP) * SNAP
export const snapFloor = (m: number) => Math.floor(m / SNAP) * SNAP
export const snapCeil = (m: number) => Math.ceil(m / SNAP) * SNAP

/** A length in minutes in the current language: "45 minutes", "1 hour", "1 hour 30 minutes". */
export function fmtDur(m: number) {
  const h = Math.floor(m / 60)
  const r = m % 60
  if (!h) return t('calendar.duration.minutes', { count: r })
  if (!r) return t('calendar.duration.hours', { count: h })
  return t('calendar.duration.hoursMinutes', { hours: t('calendar.duration.hours', { count: h }), minutes: t('calendar.duration.minutes', { count: r }) })
}
/** "Nov 18" for a yyyy-MM-dd day. */
export const dayLabel = (ds: string) => fmtMonthDay(parseISO(ds))
/** A date with its weekday, "Wed, Nov 18"; `fmt` formats the date part. */
export const withWeekday = (d: Date, fmt: (d: Date) => string = fmtMonthDay) => t('calendar.dateWithWeekday', { date: fmt(d), weekday: fmtWeekday(d) })
/** "Wed, Nov 18" for a yyyy-MM-dd day. */
export const dayLabelWd = (ds: string) => withWeekday(parseISO(ds))
/** A time of day (minutes after midnight) in the current language; the end of the day reads as midnight. */
export const timeLabel = (min: number) => fmtTime(toHM(min))
/** "10:00 – 11:30" in the current language. */
export const timeRange = (s: number, e: number) => t('calendar.timeRange', { start: timeLabel(s), end: timeLabel(e) })

/** Month and year of a span of days: "November 2026", or "November – December 2026" across months. */
export function monthSpan(a: Date, b: Date) {
  try {
    return new Intl.DateTimeFormat(getLocale(), { year: 'numeric', month: 'long' }).formatRange(a, b)
  } catch {
    return fmtMonthYear(a)
  }
}

/** Whether the current language writes times on a 12-hour clock ("9:00 AM"), which needs wider hour labels. */
export function twelveHour() {
  const o = new Intl.DateTimeFormat(getLocale(), { hour: 'numeric' }).resolvedOptions()
  return o.hourCycle === 'h11' || o.hourCycle === 'h12'
}

/** Order inside a day: open first, timed before untimed (by time), then priority, then custom order. */
export function sortDay(a: Task, b: Task) {
  const da = a.status === 0 ? 0 : 1
  const db = b.status === 0 ? 0 : 1
  if (da !== db) return da - db
  if (!!a.dueTime !== !!b.dueTime) return a.dueTime ? -1 : 1
  if (a.dueTime && b.dueTime && a.dueTime !== b.dueTime) return a.dueTime < b.dueTime ? -1 : 1
  if (a.priority !== b.priority) return b.priority - a.priority
  return a.order - b.order
}

/** Colour of a task in the calendar: the colour of its list. */
export function useColorOf() {
  const data = useData()
  return useMemo(() => {
    const m = new Map(data.lists.map((l) => [l.id, l.color]))
    return (t: Task) => m.get(t.listId) || 'var(--primary)'
  }, [data.lists])
}

/** Open the shared task context menu at the pointer. */
export function openTaskMenuAt(e: { clientX: number; clientY: number; preventDefault(): void; stopPropagation(): void }, id: string) {
  e.preventDefault()
  e.stopPropagation()
  setUI({ menu: { x: e.clientX, y: e.clientY, kind: 'task', id }, selectedTaskId: id })
}

/** The quick-add popover of the calendar: a day, optionally a start time and a length. */
export interface AddState {
  anchor: Anchor
  date: string
  time?: string
  duration?: number
}

export const isTyping = (el: EventTarget | null) => {
  const n = el as HTMLElement | null
  return !!n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable)
}
