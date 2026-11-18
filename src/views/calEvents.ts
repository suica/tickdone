// Subscribed calendar events laid out on the days of a calendar view. No DOM or store code.
import { addDays, startOfDay } from 'date-fns'
import { fmt } from '../dates'
import type { FeedEvent } from '../feeds'

/** An event on one day: in the all-day row, or a time span (minutes after midnight) in the grid. */
export interface DayEvent {
  ev: FeedEvent
  allDay: boolean
  /** Start and end on this day in minutes; 0 and 1440 for parts that run past midnight. */
  s: number
  e: number
}

const DAY_MIN = 24 * 60
const minOf = (d: Date) => d.getHours() * 60 + d.getMinutes()

/**
 * The events of each local day (yyyy-MM-dd). All-day events and timed events of 24 hours or more are
 * all-day on every day they cover; shorter timed events are split at midnight.
 */
export function eventsByDay(events: FeedEvent[]): Map<string, DayEvent[]> {
  const m = new Map<string, DayEvent[]>()
  const put = (ds: string, x: DayEvent) => {
    const arr = m.get(ds)
    if (arr) arr.push(x)
    else m.set(ds, [x])
  }
  for (const ev of events) {
    const start = new Date(ev.start)
    const end = new Date(Math.max(ev.end, ev.start))
    const allDay = ev.allDay || ev.end - ev.start >= DAY_MIN * 60_000
    let day = startOfDay(start)
    for (let i = 0; i < 400; i++) {
      const next = addDays(day, 1)
      const first = i === 0
      if (!first && day.getTime() >= end.getTime()) break
      if (allDay) put(fmt(day), { ev, allDay: true, s: 0, e: DAY_MIN })
      else {
        const s = first ? minOf(start) : 0
        const e = end.getTime() >= next.getTime() ? DAY_MIN : minOf(end)
        if (first || e > s) put(fmt(day), { ev, allDay: false, s, e: Math.max(s, e) })
      }
      day = next
    }
  }
  // All-day first, then by start time
  m.forEach((arr) => arr.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.s - b.s || a.ev.title.localeCompare(b.ev.title)))
  return m
}
