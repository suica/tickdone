// A small iCalendar (RFC 5545) reader for subscribed calendars: events, all-day events, time zones,
// recurrence rules with exceptions and moved occurrences. Only what a read-only calendar needs; no
// DOM or store code, so it can be unit tested.

/** A date and time of day as written in the feed, before any time zone is applied. */
export interface Wall {
  y: number
  /** 1–12 */
  mo: number
  d: number
  h: number
  mi: number
  s: number
}

export type Zone = { kind: 'utc' } | { kind: 'floating' } | { kind: 'tz'; tz: string } | { kind: 'offset'; minutes: number }

export interface IcsTime {
  wall: Wall
  /** A date without a time (VALUE=DATE): an all-day value. */
  date: boolean
  zone: Zone
}

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

export interface RRule {
  freq: Freq
  interval: number
  count?: number
  until?: IcsTime
  /** Weekdays (0 = Sunday), each with an optional ordinal: 2MO = { n: 2, wd: 1 }, -1FR = { n: -1, wd: 5 }. */
  byDay?: { n: number; wd: number }[]
  byMonthDay?: number[]
  byMonth?: number[]
  bySetPos?: number[]
  /** First day of the week (0 = Sunday), Monday by default. */
  wkst: number
}

export interface IcsEvent {
  uid: string
  summary: string
  location: string
  description: string
  start: IcsTime
  end?: IcsTime
  /** DURATION in seconds. */
  duration?: number
  rrule?: RRule
  rdates: IcsTime[]
  exdates: IcsTime[]
  recurrenceId?: IcsTime
  cancelled: boolean
}

export interface IcsCalendar {
  /** X-WR-CALNAME, when the feed names itself. */
  name?: string
  events: IcsEvent[]
}

/** One occurrence of an event in the requested range. */
export interface Occurrence {
  /** Unique within the feed: the event's UID and the occurrence's original start. */
  key: string
  title: string
  location: string
  description: string
  allDay: boolean
  /** Start in ms; for all-day events local midnight of the first day. */
  start: number
  /** End in ms (exclusive); for all-day events local midnight after the last day. */
  end: number
}

// ---------------- dates ----------------

const DAY_MS = 86_400_000
/** Days since 1970-01-01 of a calendar date. */
export const dayNum = (y: number, mo: number, d: number) => Math.floor(Date.UTC(y, mo - 1, d) / DAY_MS)
function fromDayNum(n: number) {
  const dt = new Date(n * DAY_MS)
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}
/** 0 = Sunday. 1970-01-01 was a Thursday. */
const weekday = (n: number) => (((n + 4) % 7) + 7) % 7
const daysInMonth = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate()

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function tzFormat(tz: string) {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    fmtCache.set(tz, f)
  }
  return f
}

/** Minutes the zone is ahead of UTC at instant `ms`. */
export function tzOffset(ms: number, tz: string): number {
  const p: Record<string, number> = {}
  for (const x of tzFormat(tz).formatToParts(ms)) if (x.type !== 'literal') p[x.type] = Number(x.value)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second)
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000)
}

const validZones = new Map<string, boolean>()
function isZone(tz: string) {
  let ok = validZones.get(tz)
  if (ok === undefined) {
    try {
      tzFormat(tz)
      ok = true
    } catch {
      ok = false
    }
    validZones.set(tz, ok)
  }
  return ok
}

/** The instant (ms) of a wall-clock time in a zone. Times skipped by a DST change move forward. */
export function wallToMs(w: Wall, zone: Zone): number {
  const naive = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s)
  switch (zone.kind) {
    case 'utc':
      return naive
    case 'offset':
      return naive - zone.minutes * 60_000
    case 'floating':
      return new Date(w.y, w.mo - 1, w.d, w.h, w.mi, w.s).getTime()
    case 'tz': {
      const o1 = tzOffset(naive, zone.tz)
      const ms = naive - o1 * 60_000
      const o2 = tzOffset(ms, zone.tz)
      return o2 === o1 ? ms : naive - o2 * 60_000
    }
  }
}

/** Windows time zone names some servers write as TZID, mapped to IANA zones. */
const WINDOWS_ZONES: Record<string, string> = {
  'Dateline Standard Time': 'Etc/GMT+12',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'Alaskan Standard Time': 'America/Anchorage',
  'Pacific Standard Time': 'America/Los_Angeles',
  'US Mountain Standard Time': 'America/Phoenix',
  'Mountain Standard Time': 'America/Denver',
  'Central Standard Time': 'America/Chicago',
  'Central Standard Time (Mexico)': 'America/Mexico_City',
  'Canada Central Standard Time': 'America/Regina',
  'Eastern Standard Time': 'America/New_York',
  'SA Pacific Standard Time': 'America/Bogota',
  'Atlantic Standard Time': 'America/Halifax',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'Argentina Standard Time': 'America/Argentina/Buenos_Aires',
  'Newfoundland Standard Time': 'America/St_Johns',
  UTC: 'UTC',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'Romance Standard Time': 'Europe/Paris',
  'GTB Standard Time': 'Europe/Bucharest',
  'FLE Standard Time': 'Europe/Helsinki',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'Turkey Standard Time': 'Europe/Istanbul',
  'Israel Standard Time': 'Asia/Jerusalem',
  'Egypt Standard Time': 'Africa/Cairo',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'Russian Standard Time': 'Europe/Moscow',
  'Arabian Standard Time': 'Asia/Dubai',
  'Iran Standard Time': 'Asia/Tehran',
  'Pakistan Standard Time': 'Asia/Karachi',
  'India Standard Time': 'Asia/Kolkata',
  'Nepal Standard Time': 'Asia/Kathmandu',
  'Bangladesh Standard Time': 'Asia/Dhaka',
  'SE Asia Standard Time': 'Asia/Bangkok',
  'China Standard Time': 'Asia/Shanghai',
  'Singapore Standard Time': 'Asia/Singapore',
  'Taipei Standard Time': 'Asia/Taipei',
  'W. Australia Standard Time': 'Australia/Perth',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Korea Standard Time': 'Asia/Seoul',
  'Cen. Australia Standard Time': 'Australia/Adelaide',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'New Zealand Standard Time': 'Pacific/Auckland',
}

/** A TZID as a zone: an IANA name (also inside a longer path), a Windows name, or the feed's own VTIMEZONE offset. */
function resolveZone(tzid: string, fixed: Map<string, number>): Zone {
  const id = tzid.replace(/^"|"$/g, '').trim()
  const tail = /([A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/.exec(id)?.[1]
  for (const c of [id, tail, WINDOWS_ZONES[id]]) if (c && isZone(c)) return { kind: 'tz', tz: c }
  const off = fixed.get(id)
  if (off !== undefined) return { kind: 'offset', minutes: off }
  return { kind: 'floating' }
}

// ---------------- parsing ----------------

interface Prop {
  name: string
  params: Record<string, string>
  value: string
}

/** Joins folded lines (a line starting with a space or tab continues the previous one). */
export function unfold(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r\n|\n|\r/)) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) out[out.length - 1] += line.slice(1)
    else if (line) out.push(line)
  }
  return out
}

function parseLine(line: string): Prop | null {
  let i = 0
  const n = line.length
  while (i < n && line[i] !== ';' && line[i] !== ':') i++
  const name = line.slice(0, i).toUpperCase()
  const params: Record<string, string> = {}
  while (i < n && line[i] === ';') {
    i++
    const ks = i
    while (i < n && line[i] !== '=' && line[i] !== ':' && line[i] !== ';') i++
    const key = line.slice(ks, i).toUpperCase()
    let val = ''
    if (line[i] === '=') {
      i++
      while (i < n && line[i] !== ';' && line[i] !== ':') {
        if (line[i] === '"') {
          const close = line.indexOf('"', i + 1)
          const end = close < 0 ? n : close
          val += line.slice(i + 1, end)
          i = end + 1
        } else val += line[i++]
      }
    }
    params[key] = val
  }
  if (line[i] !== ':') return null
  return { name, params, value: line.slice(i + 1) }
}

/** TEXT values: \n is a line break, \, \; \\ are literal. */
export function unescapeText(s: string) {
  return s.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}

function parseTime(value: string, params: Record<string, string>, fixed: Map<string, number>): IcsTime | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim())
  if (!m) return undefined
  const date = !m[4] || params.VALUE === 'DATE'
  const wall: Wall = { y: +m[1], mo: +m[2], d: +m[3], h: date ? 0 : +m[4], mi: date ? 0 : +m[5], s: date ? 0 : +(m[6] ?? 0) }
  let zone: Zone = { kind: 'floating' }
  if (!date) {
    if (m[7]) zone = { kind: 'utc' }
    else if (params.TZID) zone = resolveZone(params.TZID, fixed)
  }
  return { wall, date, zone }
}

const timeList = (p: Prop, fixed: Map<string, number>) =>
  p.value
    .split(',')
    .map((v) => parseTime(v, p.params, fixed))
    .filter((x): x is IcsTime => !!x)

/** DURATION, e.g. P1D, PT1H30M, -PT15M, P2W, in seconds. */
export function parseDuration(s: string): number | undefined {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s.trim())
  if (!m || s.trim() === 'P') return undefined
  const v = (+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 86400 + +(m[4] ?? 0) * 3600 + +(m[5] ?? 0) * 60 + +(m[6] ?? 0)
  return m[1] === '-' ? -v : v
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

export function parseRRule(value: string, fixed: Map<string, number> = new Map()): RRule | undefined {
  const parts: Record<string, string> = {}
  for (const kv of value.split(';')) {
    const [k, v] = kv.split('=')
    if (k && v !== undefined) parts[k.trim().toUpperCase()] = v.trim()
  }
  const freq = parts.FREQ?.toUpperCase()
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return undefined
  const nums = (s?: string) => s?.split(',').map(Number).filter((n) => Number.isInteger(n) && n !== 0)
  const rule: RRule = { freq, interval: Math.max(1, parseInt(parts.INTERVAL ?? '1', 10) || 1), wkst: 1 }
  if (parts.COUNT) rule.count = Math.max(0, parseInt(parts.COUNT, 10) || 0)
  if (parts.UNTIL) rule.until = parseTime(parts.UNTIL, {}, fixed)
  if (parts.WKST && WEEKDAYS.includes(parts.WKST.toUpperCase())) rule.wkst = WEEKDAYS.indexOf(parts.WKST.toUpperCase())
  if (parts.BYDAY) {
    const days = parts.BYDAY.split(',')
      .map((x) => /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(x.trim()))
      .filter((x): x is RegExpExecArray => !!x)
      .map((x) => ({ n: x[1] ? parseInt(x[1], 10) : 0, wd: WEEKDAYS.indexOf(x[2].toUpperCase()) }))
    if (days.length) rule.byDay = days
  }
  const md = nums(parts.BYMONTHDAY)?.filter((n) => Math.abs(n) <= 31)
  if (md?.length) rule.byMonthDay = md
  const mo = nums(parts.BYMONTH)?.filter((n) => n >= 1 && n <= 12)
  if (mo?.length) rule.byMonth = mo
  const sp = nums(parts.BYSETPOS)
  if (sp?.length) rule.bySetPos = sp
  return rule
}

/** Reads the events of an iCalendar feed. Anything it cannot read is skipped. */
export function parseICS(text: string): IcsCalendar {
  const lines = unfold(text.replace(/^﻿/, ''))
  const props = lines.map(parseLine).filter((p): p is Prop => !!p)
  // Fixed offsets of the feed's own time zones, for TZIDs the browser does not know.
  const fixed = new Map<string, number>()
  let tzid: string | undefined
  let inStandard = false
  for (const p of props) {
    if (p.name === 'BEGIN' && p.value.toUpperCase() === 'VTIMEZONE') tzid = undefined
    else if (p.name === 'TZID' && !inStandard) tzid = p.value.trim()
    else if (p.name === 'BEGIN' && p.value.toUpperCase() === 'STANDARD') inStandard = true
    else if (p.name === 'END' && p.value.toUpperCase() === 'STANDARD') inStandard = false
    else if (p.name === 'TZOFFSETTO' && inStandard && tzid && !fixed.has(tzid)) {
      const m = /^([+-])(\d{2})(\d{2})/.exec(p.value.trim())
      if (m) fixed.set(tzid, (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]))
    }
  }

  const cal: IcsCalendar = { events: [] }
  const stack: string[] = []
  let ev: Partial<IcsEvent> & { rdates: IcsTime[]; exdates: IcsTime[] } = { rdates: [], exdates: [] }
  for (const p of props) {
    const v = p.value
    if (p.name === 'BEGIN') {
      stack.push(v.toUpperCase())
      if (v.toUpperCase() === 'VEVENT' && stack.length <= 2) ev = { rdates: [], exdates: [], summary: '', location: '', description: '', uid: '', cancelled: false }
      continue
    }
    if (p.name === 'END') {
      const top = stack.pop()
      if (top === 'VEVENT' && stack[stack.length - 1] !== 'VEVENT' && ev.start) {
        cal.events.push({ uid: '', summary: '', location: '', description: '', cancelled: false, ...ev, start: ev.start } as IcsEvent)
      }
      continue
    }
    const where = stack[stack.length - 1]
    if (where === 'VCALENDAR' && p.name === 'X-WR-CALNAME') cal.name = unescapeText(v).trim() || undefined
    if (where !== 'VEVENT') continue
    switch (p.name) {
      case 'UID':
        ev.uid = v.trim()
        break
      case 'SUMMARY':
        ev.summary = unescapeText(v).trim()
        break
      case 'LOCATION':
        ev.location = unescapeText(v).trim()
        break
      case 'DESCRIPTION':
        ev.description = unescapeText(v).trim()
        break
      case 'STATUS':
        ev.cancelled = v.trim().toUpperCase() === 'CANCELLED'
        break
      case 'DTSTART':
        ev.start = parseTime(v, p.params, fixed)
        break
      case 'DTEND':
        ev.end = parseTime(v, p.params, fixed)
        break
      case 'DURATION':
        ev.duration = parseDuration(v)
        break
      case 'RRULE':
        ev.rrule = parseRRule(v, fixed)
        break
      case 'RDATE':
        if (p.params.VALUE !== 'PERIOD') ev.rdates.push(...timeList(p, fixed))
        break
      case 'EXDATE':
        ev.exdates.push(...timeList(p, fixed))
        break
      case 'RECURRENCE-ID':
        ev.recurrenceId = parseTime(v, p.params, fixed)
        break
    }
  }
  return cal
}

// ---------------- recurrence ----------------

/** Days (as day numbers) of a month that a MONTHLY or YEARLY rule picks; `fallback` is DTSTART's day. */
function monthDays(y: number, mo: number, rule: RRule, fallback: number): number[] {
  const len = daysInMonth(y, mo)
  const base = dayNum(y, mo, 1)
  let byMd: Set<number> | undefined
  if (rule.byMonthDay) byMd = new Set(rule.byMonthDay.map((n) => (n > 0 ? n : len + 1 + n)).filter((n) => n >= 1 && n <= len))
  let byWd: Set<number> | undefined
  if (rule.byDay) {
    byWd = new Set()
    for (const { n, wd } of rule.byDay) {
      const first = 1 + ((wd - weekday(base) + 7) % 7)
      const all: number[] = []
      for (let d = first; d <= len; d += 7) all.push(d)
      if (n === 0) all.forEach((d) => byWd!.add(d))
      else {
        const d = n > 0 ? all[n - 1] : all[all.length + n]
        if (d) byWd.add(d)
      }
    }
  }
  let days: number[]
  if (byMd && byWd) days = [...byMd].filter((d) => byWd.has(d))
  else if (byMd) days = [...byMd]
  else if (byWd) days = [...byWd]
  else days = fallback <= len ? [fallback] : []
  return days.sort((a, b) => a - b).map((d) => base + d - 1)
}

/** Weekdays of a whole year that a YEARLY rule with BYDAY but no BYMONTH picks (20MO = the 20th Monday). */
function yearDays(y: number, rule: RRule): number[] {
  const start = dayNum(y, 1, 1)
  const len = dayNum(y + 1, 1, 1) - start
  const out = new Set<number>()
  for (const { n, wd } of rule.byDay ?? []) {
    const all: number[] = []
    for (let d = start + ((wd - weekday(start) + 7) % 7); d < start + len; d += 7) all.push(d)
    if (n === 0) all.forEach((d) => out.add(d))
    else {
      const d = n > 0 ? all[n - 1] : all[all.length + n]
      if (d !== undefined) out.add(d)
    }
  }
  let days = [...out]
  if (rule.byMonthDay) {
    const md = new Set(days.filter((d) => {
      const { y: yy, mo, d: dd } = fromDayNum(d)
      const len2 = daysInMonth(yy, mo)
      return rule.byMonthDay!.some((n) => (n > 0 ? n : len2 + 1 + n) === dd)
    }))
    days = days.filter((d) => md.has(d))
  }
  return days.sort((a, b) => a - b)
}

function setPos(days: number[], pos?: number[]) {
  if (!pos) return days
  const out = new Set<number>()
  for (const p of pos) {
    const d = p > 0 ? days[p - 1] : days[days.length + p]
    if (d !== undefined) out.add(d)
  }
  return [...out].sort((a, b) => a - b)
}

/**
 * Day numbers on which a rule falls, from DTSTART's day (always the first occurrence) up to `limit`.
 * `fromDay` lets rules without COUNT skip whole periods before the range; `stop` ends the series (UNTIL).
 */
export function ruleDays(rule: RRule, start: Wall, fromDay: number, limit: number, stop: (day: number) => boolean): number[] {
  const startDay = dayNum(start.y, start.mo, start.d)
  const out: number[] = [startDay]
  if (stop(startDay)) return []
  let count = 1
  const max = rule.count ?? Infinity
  if (count >= max) return out
  const iv = rule.interval
  const inMonth = (d: number) => !rule.byMonth || rule.byMonth.includes(fromDayNum(d).mo)
  const weekStart = startDay - ((weekday(startDay) - rule.wkst + 7) % 7)

  // Periods that can be skipped without changing the result (only without COUNT, which counts from DTSTART).
  let p = 0
  if (rule.count === undefined && fromDay > startDay) {
    const s = fromDayNum(fromDay)
    const span =
      rule.freq === 'DAILY'
        ? Math.floor((fromDay - startDay) / iv)
        : rule.freq === 'WEEKLY'
          ? Math.floor((fromDay - weekStart) / (7 * iv))
          : rule.freq === 'MONTHLY'
            ? Math.floor(((s.y - start.y) * 12 + s.mo - start.mo) / iv)
            : Math.floor((s.y - start.y) / iv)
    p = Math.max(0, span - 1)
  }

  for (let guard = 0; guard < 20_000; guard++, p++) {
    let days: number[]
    let periodStart: number
    if (rule.freq === 'DAILY') {
      periodStart = startDay + p * iv
      days = [periodStart].filter((d) => {
        if (!inMonth(d)) return false
        const { y, mo, d: dd } = fromDayNum(d)
        if (rule.byMonthDay && !rule.byMonthDay.some((n) => (n > 0 ? n : daysInMonth(y, mo) + 1 + n) === dd)) return false
        if (rule.byDay && !rule.byDay.some((x) => x.wd === weekday(d))) return false
        return true
      })
    } else if (rule.freq === 'WEEKLY') {
      periodStart = weekStart + p * 7 * iv
      const wds = rule.byDay ? [...new Set(rule.byDay.map((x) => x.wd))] : [weekday(startDay)]
      days = setPos(
        wds.map((wd) => periodStart + ((wd - rule.wkst + 7) % 7)).sort((a, b) => a - b).filter(inMonth),
        rule.bySetPos,
      )
    } else if (rule.freq === 'MONTHLY') {
      const mIdx = start.mo - 1 + p * iv
      const y = start.y + Math.floor(mIdx / 12)
      const mo = (mIdx % 12) + 1
      periodStart = dayNum(y, mo, 1)
      days = rule.byMonth && !rule.byMonth.includes(mo) ? [] : setPos(monthDays(y, mo, rule, start.d), rule.bySetPos)
    } else {
      const y = start.y + p * iv
      periodStart = dayNum(y, 1, 1)
      if (rule.byDay && !rule.byMonth && rule.byDay.some((x) => x.n !== 0)) days = yearDays(y, rule)
      else {
        const months = rule.byMonth ?? (rule.byDay || rule.byMonthDay ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [start.mo])
        days = months.sort((a, b) => a - b).flatMap((mo) => monthDays(y, mo, rule, start.d))
      }
      days = setPos(days, rule.bySetPos)
    }
    if (periodStart > limit) break
    for (const d of days) {
      if (d <= startDay) continue
      if (d > limit || stop(d)) return out
      out.push(d)
      if (++count >= max) return out
    }
  }
  return out
}

// ---------------- occurrences ----------------

const timeKey = (t: IcsTime) => (t.date ? 'd' + dayNum(t.wall.y, t.wall.mo, t.wall.d) : 't' + wallToMs(t.wall, t.zone))
const localMidnight = (day: number) => {
  const { y, mo, d } = fromDayNum(day)
  return new Date(y, mo - 1, d).getTime()
}

/** Length of an event: whole days for all-day events, ms for timed ones. */
function lengthOf(e: IcsEvent): { days: number; ms: number } {
  const s = e.start
  if (s.date) {
    let days = 1
    if (e.end) days = dayNum(e.end.wall.y, e.end.wall.mo, e.end.wall.d) - dayNum(s.wall.y, s.wall.mo, s.wall.d)
    else if (e.duration !== undefined) days = Math.round(e.duration / 86400)
    return { days: Math.max(1, days), ms: 0 }
  }
  let ms = 0
  if (e.end) ms = (e.end.date ? localMidnight(dayNum(e.end.wall.y, e.end.wall.mo, e.end.wall.d)) : wallToMs(e.end.wall, e.end.zone)) - wallToMs(s.wall, s.zone)
  else if (e.duration !== undefined) ms = e.duration * 1000
  return { days: 0, ms: Math.max(0, ms) }
}

function occurrence(e: IcsEvent, start: IcsTime, key: string, len: { days: number; ms: number }): Occurrence {
  const base = { key: `${e.uid}|${key}`, title: e.summary, location: e.location, description: e.description }
  if (start.date) {
    const day = dayNum(start.wall.y, start.wall.mo, start.wall.d)
    return { ...base, allDay: true, start: localMidnight(day), end: localMidnight(day + len.days) }
  }
  const s = wallToMs(start.wall, start.zone)
  return { ...base, allDay: false, start: s, end: s + len.ms }
}

const overlaps = (o: Occurrence, from: number, to: number) => (o.end > o.start ? o.start < to && o.end > from : o.start >= from && o.start < to)

/**
 * The occurrences of `events` that overlap [from, to) (ms), sorted by start: recurring events are
 * expanded only over that range, EXDATEs dropped, and occurrences moved by a RECURRENCE-ID override
 * replaced by the override.
 */
export function expandEvents(events: IcsEvent[], from: number, to: number): Occurrence[] {
  const overrides = new Map<string, Set<string>>()
  for (const e of events) {
    if (!e.recurrenceId) continue
    let s = overrides.get(e.uid)
    if (!s) overrides.set(e.uid, (s = new Set()))
    s.add(timeKey(e.recurrenceId))
  }
  const out: Occurrence[] = []
  const fromDay = Math.floor(from / DAY_MS) - 2
  const toDay = Math.floor(to / DAY_MS) + 2
  for (const e of events) {
    const len = lengthOf(e)
    if (e.recurrenceId) {
      if (e.cancelled) continue
      const o = occurrence(e, e.start, timeKey(e.recurrenceId), len)
      if (overlaps(o, from, to)) out.push(o)
      continue
    }
    if (e.cancelled) continue
    const moved = overrides.get(e.uid)
    const excluded = new Set(e.exdates.map(timeKey))
    const starts: IcsTime[] = []
    if (e.rrule) {
      const r = e.rrule
      const w = e.start.wall
      let stop = (_day: number) => false
      if (r.until) {
        const u = r.until
        if (e.start.date || u.date) {
          const ud = dayNum(u.wall.y, u.wall.mo, u.wall.d)
          // A UTC UNTIL on an all-day event: compare by its date
          stop = (day) => day > ud
        } else {
          const um = wallToMs(u.wall, u.zone)
          stop = (day) => {
            const { y, mo, d } = fromDayNum(day)
            return wallToMs({ ...w, y, mo, d }, e.start.zone) > um
          }
        }
      }
      const lenDays = len.days || Math.ceil(len.ms / DAY_MS)
      for (const day of ruleDays(r, w, fromDay - lenDays, toDay, stop)) {
        const { y, mo, d } = fromDayNum(day)
        starts.push({ ...e.start, wall: { ...w, y, mo, d } })
      }
    } else starts.push(e.start)
    for (const rd of e.rdates) starts.push(e.start.date && !rd.date ? { ...rd, date: true } : rd)
    const seen = new Set<string>()
    for (const st of starts) {
      const key = timeKey(st)
      if (seen.has(key) || excluded.has(key) || moved?.has(key)) continue
      seen.add(key)
      const o = occurrence(e, st, key, len)
      if (overlaps(o, from, to)) out.push(o)
    }
  }
  return out.sort((a, b) => a.start - b.start || Number(b.allDay) - Number(a.allDay) || a.title.localeCompare(b.title))
}
