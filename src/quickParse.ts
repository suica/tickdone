import { addDays, addMonths, getDay, setDate } from 'date-fns'
import { fmt } from './dates'
import type { Priority } from './types'

export interface Span {
  start: number
  end: number
  kind: 'date' | 'priority' | 'tag' | 'list'
}

export interface Parsed {
  title: string
  dueDate?: string
  dueTime?: string
  priority?: Priority
  tags: string[]
  listName?: string
  spans: Span[]
}

const CN_WEEK: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
const EN_WEEK: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
}
const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12,
}

function num(s: string): number {
  return /^\d+$/.test(s) ? Number(s) : (CN_NUM[s] ?? NaN)
}

/** 下一个星期 wd（含今天） */
function upcoming(wd: number, base = new Date()): Date {
  const diff = (wd - getDay(base) + 7) % 7
  return addDays(base, diff)
}

/** 下周的星期 wd（周一为一周开始） */
function nextWeek(wd: number, base = new Date()): Date {
  const dow = (getDay(base) + 6) % 7 // 周一=0
  const monday = addDays(base, 7 - dow)
  return addDays(monday, (wd + 6) % 7)
}

export function quickParse(text: string, listNames: string[] = []): Parsed {
  const spans: Span[] = []
  let dueDate: string | undefined
  let dueTime: string | undefined
  let priority: Priority | undefined
  let ampm: 'am' | 'pm' | undefined
  const tags: string[] = []
  let listName: string | undefined
  const now = new Date()

  const taken = (s: number, e: number) => spans.some((x) => s < x.end && e > x.start)
  const take = (re: RegExp, kind: Span['kind'], fn: (m: RegExpExecArray) => boolean | void) => {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    let m: RegExpExecArray | null
    while ((m = g.exec(text))) {
      const s = m.index
      const e = s + m[0].length
      if (m[0].length === 0) {
        g.lastIndex++
        continue
      }
      if (taken(s, e)) continue
      if (fn(m) !== false) spans.push({ start: s, end: e, kind })
    }
  }
  const setDue = (d: Date) => {
    if (!dueDate) dueDate = fmt(d)
  }

  // ---- 日期 ----
  take(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})[日号]?/, 'date', (m) => {
    if (dueDate) return false
    setDue(new Date(+m[1], +m[2] - 1, +m[3]))
  })
  take(/(\d{1,2}|十[一二]?|[一二三四五六七八九])月(\d{1,2})[日号]?/, 'date', (m) => {
    if (dueDate) return false
    let d = new Date(now.getFullYear(), num(m[1]) - 1, +m[2])
    if (fmt(d) < fmt(now)) d = new Date(now.getFullYear() + 1, num(m[1]) - 1, +m[2])
    setDue(d)
  })
  take(/(大后天|后天|明天|今天|明晚|今晚|明早|今早)/, 'date', (m) => {
    if (dueDate) return false
    const k = m[1]
    const off = k === '大后天' ? 3 : k === '后天' ? 2 : k.startsWith('明') ? 1 : 0
    if (k.endsWith('晚')) ampm = 'pm'
    if (k.endsWith('早')) ampm = 'am'
    setDue(addDays(now, off))
  })
  take(/(下+)(?:个)?(?:周|星期|礼拜)([一二三四五六日天])/, 'date', (m) => {
    if (dueDate) return false
    let d = nextWeek(CN_WEEK[m[2]])
    for (let i = 1; i < m[1].length; i++) d = addDays(d, 7)
    setDue(d)
  })
  take(/(?:这个?|本)?(?:周|星期|礼拜)([一二三四五六日天])/, 'date', (m) => {
    if (dueDate) return false
    setDue(upcoming(CN_WEEK[m[1]]))
  })
  take(/下(?:个)?(?:周|星期|礼拜)/, 'date', () => {
    if (dueDate) return false
    setDue(nextWeek(1))
  })
  take(/下个?月(?:(\d{1,2})[号日])?/, 'date', (m) => {
    if (dueDate) return false
    let d = addMonths(now, 1)
    if (m[1]) d = setDate(d, +m[1])
    setDue(d)
  })
  take(/(\d+|[一二两三四五六七八九十])\s*(天|周|个月)(?:后|以后|之后)/, 'date', (m) => {
    if (dueDate) return false
    const n = num(m[1])
    setDue(m[2] === '天' ? addDays(now, n) : m[2] === '周' ? addDays(now, 7 * n) : addMonths(now, n))
  })
  take(/(?<![\d月])(\d{1,2})[号日](?!\d)/, 'date', (m) => {
    if (dueDate) return false
    const day = +m[1]
    if (day < 1 || day > 31) return false
    let d = setDate(now, day)
    if (fmt(d) < fmt(now)) d = setDate(addMonths(now, 1), day)
    setDue(d)
  })
  // English
  take(/\b(today|tonight|tomorrow|tmr)\b/i, 'date', (m) => {
    if (dueDate) return false
    const k = m[1].toLowerCase()
    if (k === 'tonight') ampm = 'pm'
    setDue(addDays(now, k === 'today' || k === 'tonight' ? 0 : 1))
  })
  take(/\bnext\s+(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i, 'date', (m) => {
    if (dueDate) return false
    setDue(nextWeek(EN_WEEK[m[1].toLowerCase()]))
  })
  take(/\bnext\s+week\b/i, 'date', () => {
    if (dueDate) return false
    setDue(nextWeek(1))
  })
  take(/\b(?:on\s+)?(mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?\b/i, 'date', (m) => {
    if (dueDate) return false
    setDue(upcoming(EN_WEEK[m[1].toLowerCase()]))
  })
  take(/\bin\s+(\d+)\s+days?\b/i, 'date', (m) => {
    if (dueDate) return false
    setDue(addDays(now, +m[1]))
  })

  // ---- 时间 ----
  take(
    /(上午|早上|早晨|中午|下午|傍晚|晚上)?\s?(\d{1,2}|十[一二]?|[一二两三四五六七八九])(?:[:：](\d{2})|点(?:(半)|(\d{1,2})分?)?)/,
    'date',
    (m) => {
      if (dueTime) return false
      let h = num(m[2])
      const min = m[3] ? +m[3] : m[4] ? 30 : m[5] ? +m[5] : 0
      if (isNaN(h) || h > 23 || min > 59) return false
      const p = m[1]
      if (p && /下午|傍晚|晚上/.test(p) && h < 12) h += 12
      else if (p === '中午' && h < 6) h += 12
      else if (!p && ampm === 'pm' && h < 12) h += 12
      dueTime = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
    },
  )
  take(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i, 'date', (m) => {
    if (dueTime) return false
    let h = +m[1]
    if (h > 12) return false
    if (m[3].toLowerCase() === 'pm' && h < 12) h += 12
    if (m[3].toLowerCase() === 'am' && h === 12) h = 0
    dueTime = `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`
  })
  if (dueTime && !dueDate) {
    // 只写了时间：今天；若时间已过则为明天
    const [h, mm] = dueTime.split(':').map(Number)
    const passed = now.getHours() * 60 + now.getMinutes() > h * 60 + mm
    dueDate = fmt(addDays(now, passed ? 1 : 0))
  }

  // ---- 优先级 ----
  take(/(?:^|(?<=\s))!(高|中|低|无|high|medium|med|low|none|[0-3])(?=\s|$)/i, 'priority', (m) => {
    if (priority !== undefined) return false
    const v = m[1].toLowerCase()
    priority = (
      { 高: 5, high: 5, '3': 5, 中: 3, medium: 3, med: 3, '2': 3, 低: 1, low: 1, '1': 1, 无: 0, none: 0, '0': 0 } as Record<string, Priority>
    )[v]
  })
  take(/(?:^|(?<=\s))(!{1,3})(?=\s|$)/, 'priority', (m) => {
    if (priority !== undefined) return false
    priority = ([0, 1, 3, 5] as Priority[])[m[1].length]
  })

  // ---- 标签 ----
  take(/(?:^|(?<=\s))#([^\s#]+)/, 'tag', (m) => {
    if (!tags.includes(m[1])) tags.push(m[1])
  })

  // ---- 清单 ^ 或 ~ ----
  take(/(?:^|(?<=\s))[~^]([^\s~^]+)/, 'list', (m) => {
    const hit = listNames.find((n) => n === m[1]) ?? listNames.find((n) => n.startsWith(m[1]))
    if (!hit || listName) return false
    listName = hit
  })

  spans.sort((a, b) => a.start - b.start)
  let title = ''
  let pos = 0
  for (const s of spans) {
    title += text.slice(pos, s.start)
    pos = s.end
  }
  title += text.slice(pos)
  title = title.replace(/\s{2,}/g, ' ').trim()

  return { title, dueDate, dueTime, priority, tags, listName, spans }
}
