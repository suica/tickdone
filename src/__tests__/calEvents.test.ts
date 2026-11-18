import { describe, expect, it } from 'vitest'
import type { FeedEvent } from '../feeds'
import { eventsByDay } from '../views/calEvents'

const ev = (title: string, start: string, end: string, allDay = false): FeedEvent => ({
  id: title,
  key: title,
  feedId: 'f',
  feedName: 'Feed',
  color: '#000',
  title,
  location: '',
  description: '',
  allDay,
  start: new Date(start).getTime(),
  end: new Date(end).getTime(),
})

describe('eventsByDay', () => {
  it('puts all-day events on every day they cover, all-day first', () => {
    const m = eventsByDay([ev('Trip', '2026-11-20T00:00:00', '2026-11-23T00:00:00', true), ev('Call', '2026-11-21T09:00:00', '2026-11-21T09:30:00')])
    expect([...m.keys()].sort()).toEqual(['2026-11-20', '2026-11-21', '2026-11-22'])
    expect(m.get('2026-11-21')!.map((x) => [x.ev.title, x.allDay, x.s, x.e])).toEqual([
      ['Trip', true, 0, 1440],
      ['Call', false, 540, 570],
    ])
  })

  it('splits a timed event at midnight and treats 24 hours or more as all-day', () => {
    const m = eventsByDay([ev('Late', '2026-11-20T22:00:00', '2026-11-21T01:30:00'), ev('Long', '2026-11-25T08:00:00', '2026-11-26T09:00:00')])
    expect(m.get('2026-11-20')!.map((x) => [x.s, x.e])).toEqual([[1320, 1440]])
    expect(m.get('2026-11-21')!.map((x) => [x.s, x.e])).toEqual([[0, 90]])
    expect(m.get('2026-11-25')![0].allDay).toBe(true)
    expect(m.get('2026-11-26')![0].allDay).toBe(true)
  })

  it('an event that ends at midnight stays on its day; a zero-length event keeps its start', () => {
    const m = eventsByDay([ev('Eve', '2026-11-20T20:00:00', '2026-11-21T00:00:00'), ev('Ping', '2026-11-22T07:00:00', '2026-11-22T07:00:00')])
    expect(m.has('2026-11-21')).toBe(false)
    expect(m.get('2026-11-20')![0].e).toBe(1440)
    expect(m.get('2026-11-22')!.map((x) => [x.s, x.e])).toEqual([[420, 420]])
  })
})
