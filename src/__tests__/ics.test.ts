import { describe, expect, it } from 'vitest'
import { expandEvents, parseDuration, parseICS, parseRRule, unescapeText, unfold, wallToMs } from '../ics'

// Unit tests run in Asia/Shanghai (UTC+8, no DST), see package.json.

const cal = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Team', ...events, 'END:VCALENDAR'].join('\r\n')
const vevent = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n')

/** Local dates (yyyy-MM-dd) of occurrence starts. */
const days = (occ: { start: number }[]) =>
  occ.map((o) => {
    const d = new Date(o.start)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
const local = (s: string) => new Date(s).getTime()
const range = (a: string, b: string) => [local(a + 'T00:00:00'), local(b + 'T00:00:00')] as const

function expand(text: string, from: string, to: string) {
  const [f, t] = range(from, to)
  return expandEvents(parseICS(text).events, f, t)
}

describe('lines and values', () => {
  it('unfolds continuation lines and unescapes text', () => {
    expect(unfold('SUMMARY:Long ti\r\n tle\r\n\tend\r\nUID:1')).toEqual(['SUMMARY:Long title' + 'end', 'UID:1'])
    expect(unescapeText('a\\, b\\; c\\nd\\\\e')).toBe('a, b; c\nd\\e')
  })

  it('reads a folded, escaped event with a quoted parameter', () => {
    const c = parseICS(
      cal(
        vevent(
          'UID:a1',
          'DTSTART;TZID="Asia/Tokyo":20261118T100000',
          'DTEND;TZID="Asia/Tokyo":20261118T113000',
          'SUMMARY:Planning\\, part 1',
          'LOCATION:Room 4\\; floor 2',
          'DESCRIPTION:Agenda:\\n- one\\n- t',
          ' wo',
        ),
      ),
    )
    expect(c.name).toBe('Team')
    const [e] = c.events
    expect(e.summary).toBe('Planning, part 1')
    expect(e.location).toBe('Room 4; floor 2')
    expect(e.description).toBe('Agenda:\n- one\n- two')
    expect(e.start.zone).toEqual({ kind: 'tz', tz: 'Asia/Tokyo' })
  })

  it('reads durations', () => {
    expect(parseDuration('PT1H30M')).toBe(5400)
    expect(parseDuration('P1D')).toBe(86400)
    expect(parseDuration('P2W')).toBe(14 * 86400)
    expect(parseDuration('-PT15M')).toBe(-900)
    expect(parseDuration('P')).toBeUndefined()
  })

  it('reads rules with ordinal weekdays', () => {
    expect(parseRRule('FREQ=MONTHLY;BYDAY=2MO,-1FR;INTERVAL=2')).toMatchObject({ freq: 'MONTHLY', interval: 2, byDay: [{ n: 2, wd: 1 }, { n: -1, wd: 5 }] })
    expect(parseRRule('FREQ=HOURLY')).toBeUndefined()
  })
})

describe('times', () => {
  it('UTC, time zones and floating times', () => {
    const text = cal(
      vevent('UID:u', 'DTSTART:20261118T020000Z', 'DTEND:20261118T030000Z', 'SUMMARY:UTC'),
      vevent('UID:ny', 'DTSTART;TZID=America/New_York:20260705T090000', 'DURATION:PT1H', 'SUMMARY:NY summer'),
      vevent('UID:ny2', 'DTSTART;TZID=America/New_York:20261210T090000', 'DURATION:PT1H', 'SUMMARY:NY winter'),
      vevent('UID:fl', 'DTSTART:20261118T150000', 'SUMMARY:Floating'),
      vevent('UID:win', 'DTSTART;TZID=W. Europe Standard Time:20261118T100000', 'SUMMARY:Windows zone'),
    )
    const all = expand(text, '2026-07-01', '2026-12-31')
    const at = (title: string) => all.find((o) => o.title === title)!
    expect(at('UTC').start).toBe(local('2026-11-18T10:00:00+08:00'))
    expect(at('UTC').end - at('UTC').start).toBe(3600_000)
    // EDT is UTC-4 in July, EST UTC-5 in December
    expect(at('NY summer').start).toBe(Date.parse('2026-07-05T13:00:00Z'))
    expect(at('NY winter').start).toBe(Date.parse('2026-12-10T14:00:00Z'))
    expect(at('Floating').start).toBe(local('2026-11-18T15:00:00'))
    expect(at('Windows zone').start).toBe(Date.parse('2026-11-18T09:00:00Z'))
  })

  it('falls back to the offset of the feed’s own VTIMEZONE for unknown zone names', () => {
    const text = cal(
      'BEGIN:VTIMEZONE',
      'TZID:Custom Zone',
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+0300',
      'TZOFFSETTO:+0300',
      'END:STANDARD',
      'END:VTIMEZONE',
      vevent('UID:c', 'DTSTART;TZID=Custom Zone:20261118T120000', 'SUMMARY:Custom'),
    )
    expect(expand(text, '2026-11-18', '2026-11-19')[0].start).toBe(Date.parse('2026-11-18T09:00:00Z'))
  })

  it('a wall time in a zone with DST maps to the right instant around the change', () => {
    // Europe/Berlin leaves summer time on 2026-10-25 at 03:00 → 02:00
    expect(wallToMs({ y: 2026, mo: 10, d: 24, h: 12, mi: 0, s: 0 }, { kind: 'tz', tz: 'Europe/Berlin' })).toBe(Date.parse('2026-10-24T10:00:00Z'))
    expect(wallToMs({ y: 2026, mo: 10, d: 26, h: 12, mi: 0, s: 0 }, { kind: 'tz', tz: 'Europe/Berlin' })).toBe(Date.parse('2026-10-26T11:00:00Z'))
  })
})

describe('all-day events', () => {
  it('span whole local days; DTEND is exclusive; no end means one day', () => {
    const text = cal(
      vevent('UID:h', 'DTSTART;VALUE=DATE:20261118', 'SUMMARY:Holiday'),
      vevent('UID:t', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261123', 'SUMMARY:Trip'),
    )
    const [h, trip] = expand(text, '2026-11-01', '2026-12-01')
    expect(h.allDay).toBe(true)
    expect(h.start).toBe(local('2026-11-18T00:00:00'))
    expect(h.end).toBe(local('2026-11-19T00:00:00'))
    expect(trip.end).toBe(local('2026-11-23T00:00:00'))
    // A range that only touches the last day still shows the trip
    expect(expand(text, '2026-11-22', '2026-11-23').map((o) => o.title)).toEqual(['Trip'])
  })
})

describe('recurrence', () => {
  it('DAILY with INTERVAL and COUNT', () => {
    const text = cal(vevent('UID:d', 'DTSTART:20261101T090000', 'RRULE:FREQ=DAILY;INTERVAL=3;COUNT=4', 'SUMMARY:x'))
    expect(days(expand(text, '2026-10-01', '2027-01-01'))).toEqual(['2026-11-01', '2026-11-04', '2026-11-07', '2026-11-10'])
  })

  it('WEEKLY on several days until a date, expanded only over the range', () => {
    const text = cal(vevent('UID:w', 'DTSTART:20261102T090000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261113T235959Z', 'SUMMARY:x'))
    expect(days(expand(text, '2026-11-01', '2026-12-01'))).toEqual(['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13'])
    expect(days(expand(text, '2026-11-05', '2026-11-10'))).toEqual(['2026-11-06', '2026-11-09'])
  })

  it('WEEKLY every other week, years after DTSTART', () => {
    const text = cal(vevent('UID:w2', 'DTSTART:20200106T100000', 'RRULE:FREQ=WEEKLY;INTERVAL=2', 'SUMMARY:x'))
    // 2020-01-06 is a Monday; every 14 days lands on 2026-11-16 and 2026-11-30
    expect(days(expand(text, '2026-11-10', '2026-12-05'))).toEqual(['2026-11-16', '2026-11-30'])
  })

  it('MONTHLY on the second Monday and the last Friday', () => {
    const text = cal(vevent('UID:m', 'DTSTART:20261109T090000', 'RRULE:FREQ=MONTHLY;BYDAY=2MO,-1FR;COUNT=5', 'SUMMARY:x'))
    expect(days(expand(text, '2026-11-01', '2027-03-01'))).toEqual(['2026-11-09', '2026-11-27', '2026-12-14', '2026-12-25', '2027-01-11'])
  })

  it('MONTHLY by month day, skipping months without that day, and the last day of the month', () => {
    const text = cal(
      vevent('UID:m31', 'DTSTART:20261031T090000', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3', 'SUMMARY:a'),
      vevent('UID:mlast', 'DTSTART;VALUE=DATE:20261130', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3', 'SUMMARY:b'),
    )
    const occ = expand(text, '2026-10-01', '2027-06-01')
    expect(days(occ.filter((o) => o.title === 'a'))).toEqual(['2026-10-31', '2026-12-31', '2027-01-31'])
    expect(days(occ.filter((o) => o.title === 'b'))).toEqual(['2026-11-30', '2026-12-31', '2027-01-31'])
  })

  it('MONTHLY on the last weekday with BYSETPOS', () => {
    const text = cal(vevent('UID:sp', 'DTSTART:20261130T090000', 'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3', 'SUMMARY:x'))
    expect(days(expand(text, '2026-11-01', '2027-03-01'))).toEqual(['2026-11-30', '2026-12-31', '2027-01-29'])
  })

  it('YEARLY birthdays, on Feb 29 only in leap years, and in given months', () => {
    const text = cal(
      vevent('UID:y', 'DTSTART;VALUE=DATE:19900315', 'RRULE:FREQ=YEARLY', 'SUMMARY:birthday'),
      vevent('UID:leap', 'DTSTART;VALUE=DATE:20240229', 'RRULE:FREQ=YEARLY', 'SUMMARY:leap'),
      vevent('UID:tg', 'DTSTART;VALUE=DATE:20261126', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=4TH', 'SUMMARY:fourth thursday'),
      vevent('UID:q', 'DTSTART;VALUE=DATE:20260101', 'RRULE:FREQ=YEARLY;BYMONTH=1,4,7,10;BYMONTHDAY=1', 'SUMMARY:quarter'),
    )
    const occ = expand(text, '2026-01-01', '2029-01-01')
    expect(days(occ.filter((o) => o.title === 'birthday'))).toEqual(['2026-03-15', '2027-03-15', '2028-03-15'])
    expect(days(occ.filter((o) => o.title === 'leap'))).toEqual(['2028-02-29'])
    expect(days(occ.filter((o) => o.title === 'fourth thursday'))).toEqual(['2026-11-26', '2027-11-25', '2028-11-23'])
    expect(days(occ.filter((o) => o.title === 'quarter')).slice(0, 5)).toEqual(['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01', '2027-01-01'])
  })

  it('keeps the wall-clock time of a zone across a DST change', () => {
    const text = cal(vevent('UID:b', 'DTSTART;TZID=Europe/Berlin:20261023T090000', 'RRULE:FREQ=DAILY;COUNT=4', 'SUMMARY:x'))
    const occ = expand(text, '2026-10-20', '2026-10-30')
    expect(occ.map((o) => new Date(o.start).toISOString())).toEqual(['2026-10-23T07:00:00.000Z', '2026-10-24T07:00:00.000Z', '2026-10-25T08:00:00.000Z', '2026-10-26T08:00:00.000Z'])
  })

  it('drops EXDATEs, in the event’s zone or in UTC', () => {
    const text = cal(
      vevent(
        'UID:e',
        'DTSTART;TZID=Asia/Tokyo:20261116T100000',
        'RRULE:FREQ=DAILY;COUNT=5',
        'EXDATE;TZID=Asia/Tokyo:20261117T100000',
        'EXDATE:20261119T010000Z',
        'SUMMARY:x',
      ),
      vevent('UID:ad', 'DTSTART;VALUE=DATE:20261116', 'RRULE:FREQ=WEEKLY;COUNT=3', 'EXDATE;VALUE=DATE:20261123', 'SUMMARY:y'),
    )
    const occ = expand(text, '2026-11-01', '2026-12-31')
    expect(days(occ.filter((o) => o.title === 'x'))).toEqual(['2026-11-16', '2026-11-18', '2026-11-20'])
    expect(days(occ.filter((o) => o.title === 'y'))).toEqual(['2026-11-16', '2026-11-30'])
  })

  it('replaces an occurrence moved by a RECURRENCE-ID override and drops a cancelled one', () => {
    const text = cal(
      vevent('UID:r', 'DTSTART:20261116T090000Z', 'DURATION:PT1H', 'RRULE:FREQ=DAILY;COUNT=4', 'SUMMARY:Standup'),
      vevent('UID:r', 'RECURRENCE-ID:20261117T090000Z', 'DTSTART:20261117T140000Z', 'DTEND:20261117T143000Z', 'SUMMARY:Standup (moved)', 'LOCATION:Hall'),
      vevent('UID:r', 'RECURRENCE-ID:20261118T090000Z', 'DTSTART:20261118T090000Z', 'STATUS:CANCELLED', 'SUMMARY:Standup'),
    )
    const occ = expand(text, '2026-11-16', '2026-11-25')
    expect(occ.map((o) => [new Date(o.start).toISOString(), o.title])).toEqual([
      ['2026-11-16T09:00:00.000Z', 'Standup'],
      ['2026-11-17T14:00:00.000Z', 'Standup (moved)'],
      ['2026-11-19T09:00:00.000Z', 'Standup'],
    ])
    expect(occ[1].location).toBe('Hall')
    expect(occ[1].end - occ[1].start).toBe(30 * 60_000)
  })

  it('stays bounded for an endless daily rule', () => {
    const text = cal(vevent('UID:inf', 'DTSTART:19800101T080000', 'RRULE:FREQ=DAILY', 'SUMMARY:x'))
    expect(expand(text, '2026-11-01', '2026-11-08')).toHaveLength(7)
  })
})
