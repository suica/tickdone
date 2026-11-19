import { addDays, addMonths, getDay, setDate } from 'date-fns'
import { fmt } from './dates'
import { firstOccurrence, withDays } from './repeat'
import type { Priority, RepeatRule } from './types'

// Quick-add parser: picks dates, times, repeat rules, priorities, #tags and ~lists out of a task title.
// It understands dates, times and priorities in every UI language; repeat rules in Chinese and English.
// The CJK and other non-English words in this file are the words users type, so they stay as they are.

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
  /** A repeat rule from phrases like "every 2 weeks", "every last Friday", 每月最后一个周五 */
  repeat?: RepeatRule
  tags: string[]
  listName?: string
  spans: Span[]
}

const CN_WEEK: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
const EN_WEEK: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
}
const EN_MONTH = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12,
}

/** Words for today (0), tomorrow (1) and the day after tomorrow (2) in the other UI languages. */
const DAY_WORDS: Record<string, number> = {
  // Japanese
  今日: 0, きょう: 0, 明日: 1, あした: 1, 明後日: 2, あさって: 2,
  // Korean
  오늘: 0, 내일: 1, 모레: 2,
  // Spanish
  hoy: 0, mañana: 1, 'pasado mañana': 2,
  // French
  "aujourd'hui": 0, 'aujourd’hui': 0, demain: 1, 'après-demain': 2, 'apres-demain': 2,
  // German
  heute: 0, morgen: 1, übermorgen: 2,
  // Portuguese
  hoje: 0, amanhã: 1, amanha: 1, 'depois de amanhã': 2, 'depois de amanha': 2,
  // Russian
  сегодня: 0, завтра: 1, послезавтра: 2,
}

/**
 * Priority words after "!", in every UI language (lower case). Keep in sync with the
 * `tasks.quickAdd.token.*` messages, which the quick-add suggestions insert.
 */
export const PRIORITY_WORDS: Record<string, Priority> = {
  '3': 5, '2': 3, '1': 1, '0': 0,
  high: 5, medium: 3, med: 3, low: 1, none: 0,
  // Chinese (simplified and traditional), Japanese
  高: 5, 中: 3, 低: 1, 无: 0, 無: 0, なし: 0,
  // Korean
  높음: 5, 보통: 3, 낮음: 1, 없음: 0,
  // Spanish, Portuguese
  alta: 5, media: 3, média: 3, baja: 1, baixa: 1, ninguna: 0, nenhuma: 0,
  // French
  haute: 5, moyenne: 3, basse: 1, aucune: 0,
  // German
  hoch: 5, mittel: 3, niedrig: 1, keine: 0,
  // Russian
  высокий: 5, средний: 3, низкий: 1, нет: 0,
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')
const alternation = (words: string[]) => [...words].sort((a, b) => b.length - a.length).map(escape).join('|')
// Latin and Cyrillic words need a word boundary; Japanese and Korean words may touch other letters (no spaces in Japanese, particles in Korean).
const WORD = '\\p{Script=Latin}\\p{Script=Cyrillic}\\p{N}'
const DAY_WORDS_RE = new RegExp(`(?<![${WORD}])(${alternation(Object.keys(DAY_WORDS))})(?![${WORD}]|['’-])`, 'iu')
const PRIORITY_RE = new RegExp(`(?:^|(?<=\\s))!(${alternation(Object.keys(PRIORITY_WORDS))})(?=\\s|$)`, 'iu')

const EN_WD = '(mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?s?'

// ---- words of the other UI languages (Japanese, Korean, Spanish, French, German, Portuguese, Russian) ----
// These are the words users type, so they stay in their own language.

/** Not after / not before a letter or digit (`\b` only knows ASCII). */
const B = '(?<![\\p{L}\\p{N}])'
const E = '(?![\\p{L}\\p{N}])'
const ure = (source: string) => new RegExp(source, 'iu')
const alt = (words: Record<string, number>) => alternation(Object.keys(words))

const WD_ES: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3, jueves: 4, viernes: 5, sábado: 6, sabado: 6 }
const WD_FR: Record<string, number> = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 }
const WD_DE: Record<string, number> = { sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonnabend: 6 }
/** Portuguese weekdays that are never anything else */
const WD_PT: Record<string, number> = {
  domingo: 0, 'segunda-feira': 1, 'terça-feira': 2, 'terca-feira': 2, 'quarta-feira': 3, 'quinta-feira': 4, 'sexta-feira': 5, sábado: 6, sabado: 6,
}
/** Short Portuguese weekdays: also ordinary words ("segunda" is "second"), so only after na / no / próxima, or before "que vem" */
const WD_PT_SHORT: Record<string, number> = { segunda: 1, terça: 2, terca: 2, quarta: 3, quinta: 4, sexta: 5 }
/** Russian weekdays, nominative and accusative ("в среду") */
const WD_RU: Record<string, number> = {
  воскресенье: 0, понедельник: 1, вторник: 2, среда: 3, среду: 3, четверг: 4, пятница: 5, пятницу: 5, суббота: 6, субботу: 6,
}
/** Russian weekdays that may stand alone ("среда" is also "environment") */
const WD_RU_ALONE: Record<string, number> = { воскресенье: 0, понедельник: 1, вторник: 2, четверг: 4, пятница: 5, суббота: 6 }
const WD_JA: Record<string, number> = {
  日曜日: 0, 月曜日: 1, 火曜日: 2, 水曜日: 3, 木曜日: 4, 金曜日: 5, 土曜日: 6, 日曜: 0, 月曜: 1, 火曜: 2, 水曜: 3, 木曜: 4, 金曜: 5, 土曜: 6,
}
const WD_KO: Record<string, number> = { 일요일: 0, 월요일: 1, 화요일: 2, 수요일: 3, 목요일: 4, 금요일: 5, 토요일: 6 }
const WD_ALL: Record<string, number> = { ...WD_ES, ...WD_FR, ...WD_DE, ...WD_PT, ...WD_PT_SHORT, ...WD_RU, ...WD_JA, ...WD_KO }
const WD_LATIN = { ...WD_ES, ...WD_FR, ...WD_DE, ...WD_PT }
const WD_PT_ANY = { ...WD_PT, ...WD_PT_SHORT }

const monthsOf = (names: string[][]) => Object.fromEntries(names.flatMap((forms, i) => forms.map((f) => [f, i + 1])))
const MONTH_ES_PT = monthsOf([
  ['enero', 'janeiro'], ['febrero', 'fevereiro'], ['marzo', 'março', 'marco'], ['abril'], ['mayo', 'maio'], ['junio', 'junho'],
  ['julio', 'julho'], ['agosto'], ['septiembre', 'setiembre', 'setembro'], ['octubre', 'outubro'], ['noviembre', 'novembro'], ['diciembre', 'dezembro'],
])
const MONTH_FR_DE = monthsOf([
  ['janvier', 'januar', 'jänner'], ['février', 'fevrier', 'februar'], ['mars', 'märz', 'maerz'], ['avril', 'april'], ['mai'], ['juin', 'juni'],
  ['juillet', 'juli'], ['août', 'aout', 'august'], ['septembre', 'september'], ['octobre', 'oktober'], ['novembre', 'november'], ['décembre', 'decembre', 'dezember'],
])
/** Russian months in the genitive, as in "15 марта" */
const MONTH_RU = monthsOf([['января'], ['февраля'], ['марта'], ['апреля'], ['мая'], ['июня'], ['июля'], ['августа'], ['сентября'], ['октября'], ['ноября'], ['декабря']])

/** Day, week or month, from a unit word of any language ("días", "Wochen", "месяца", "일", "週間"…). */
function unitOf(word: string): 'day' | 'week' | 'month' {
  const w = word.toLowerCase()
  if (/^(d[ií]a|jour|tag|д|일|日)/u.test(w)) return 'day'
  if (/^(semana|semaine|woche|недел|주|週)/u.test(w)) return 'week'
  return 'month'
}
const EN_NTH: Record<string, number> = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, last: -1 }
const EN_UNIT: Record<string, Exclude<RepeatRule['kind'], 'weekdays'>> = { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }
const CN_UNIT: Record<string, Exclude<RepeatRule['kind'], 'weekdays'>> = { 天: 'daily', 日: 'daily', 周: 'weekly', 週: 'weekly', 星期: 'weekly', 礼拜: 'weekly', 禮拜: 'weekly', 月: 'monthly', 年: 'yearly' }

function num(s: string): number {
  return /^\d+$/.test(s) ? Number(s) : (CN_NUM[s] ?? NaN)
}

/** The next weekday `wd`, today included. */
function upcoming(wd: number, base = new Date()): Date {
  const diff = (wd - getDay(base) + 7) % 7
  return addDays(base, diff)
}

/** Weekday `wd` of next week (weeks start on Monday). */
function nextWeek(wd: number, base = new Date()): Date {
  const dow = (getDay(base) + 6) % 7 // Monday = 0
  const monday = addDays(base, 7 - dow)
  return addDays(monday, (wd + 6) % 7)
}

export function quickParse(text: string, listNames: string[] = []): Parsed {
  const spans: Span[] = []
  let dueDate: string | undefined
  let dueTime: string | undefined
  let priority: Priority | undefined
  let repeat: RepeatRule | undefined
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
  /** Month (1-12) and day this year, or next year when that day has passed. */
  const monthDay = (month: number, day: number, year?: number) => {
    if (month < 1 || month > 12 || day < 1 || day > 31) return false
    let d = new Date(year ?? now.getFullYear(), month - 1, day)
    if (!year && fmt(d) < fmt(now)) d = new Date(now.getFullYear() + 1, month - 1, day)
    setDue(d)
  }

  // ---- repeat rules (before dates, so "every Monday" and 每周五 are not read as one date) ----
  const setRepeat = (r: RepeatRule) => {
    if (repeat) return false
    repeat = r
  }
  // Chinese: 每月最后一个周五, 每月第二个星期一, 每月最后一天, 每月15号, 每年3月8日, 每个工作日, 每周一三五, 每2周, 每天
  take(/每(?:个|個)?月(?:的)?(?:第([一二三四1-4])|(最后一|最後一))(?:个|個)?(?:周|週|星期|礼拜|禮拜)([一二三四五六日天])/, 'date', (m) =>
    setRepeat({ kind: 'monthly', interval: 1, nth: m[2] ? -1 : num(m[1]), weekday: CN_WEEK[m[3]] }),
  )
  take(/每(?:个|個)?月(?:的)?(?:最后一天|最後一天|月底)/, 'date', () => setRepeat({ kind: 'monthly', interval: 1, day: -1 }))
  take(/每(?:个|個)?月(?:的)?(\d{1,2})[号號日]/, 'date', (m) => (+m[1] >= 1 && +m[1] <= 31 ? setRepeat({ kind: 'monthly', interval: 1, day: +m[1] }) : false))
  take(/每年(?:的)?(\d{1,2}|十[一二]?|[一二三四五六七八九])月(\d{1,2})[日号號]/, 'date', (m) => {
    const month = num(m[1])
    if (!(month >= 1 && month <= 12) || +m[2] < 1 || +m[2] > 31) return false
    return setRepeat({ kind: 'yearly', interval: 1, month, day: +m[2] })
  })
  take(/每(?:个|個)?工作日/, 'date', () => setRepeat({ kind: 'weekdays' }))
  take(/每(?:个|個)?(?:周|週|星期|礼拜|禮拜)([一二三四五六日天](?:[、,，和及]?[一二三四五六日天])*)/, 'date', (m) =>
    setRepeat({ kind: 'weekly', interval: 1, days: [...new Set([...m[1].replace(/[、,，和及]/g, '')].map((c) => CN_WEEK[c]))].sort() }),
  )
  take(/每\s*(\d+|[一二两兩三四五六七八九十])?\s*(?:个|個)?(天|日|周|週|星期|礼拜|禮拜|月|年)/, 'date', (m) => {
    const n = m[1] ? num(m[1]) : 1
    if (!(n >= 1)) return false
    return setRepeat({ kind: CN_UNIT[m[2]], interval: n } as RepeatRule)
  })
  // English: every last Friday, every month on the 15th / last day, every weekday, every Mon and Wed, every 2 weeks, every other day
  take(new RegExp(`\\bevery\\s+(first|1st|second|2nd|third|3rd|fourth|4th|last)\\s+${EN_WD}(?:\\s+of\\s+(?:the|each|every)\\s+month)?\\b`, 'i'), 'date', (m) =>
    setRepeat({ kind: 'monthly', interval: 1, nth: EN_NTH[m[1].toLowerCase()], weekday: EN_WEEK[m[2].toLowerCase()] }),
  )
  take(/\b(?:every\s+month|monthly)\s+on\s+the\s+(?:(last)\s+day|(\d{1,2})(?:st|nd|rd|th)?)\b/i, 'date', (m) => {
    const day = m[1] ? -1 : +m[2]
    if (day !== -1 && (day < 1 || day > 31)) return false
    return setRepeat({ kind: 'monthly', interval: 1, day })
  })
  take(/\b(?:every\s+(?:week\s?day|work\s?day)s?|on\s+weekdays)\b/i, 'date', () => setRepeat({ kind: 'weekdays' }))
  take(new RegExp(`\\bevery\\s+${EN_WD}((?:\\s*,\\s*|\\s*&\\s*|\\s+and\\s+|,\\s*and\\s+)${EN_WD})*\\b`, 'i'), 'date', (m) => {
    const days = [...m[0].matchAll(new RegExp(EN_WD, 'gi'))].map((x) => EN_WEEK[x[1].toLowerCase()])
    return setRepeat({ kind: 'weekly', interval: 1, days: [...new Set(days)].sort() })
  })
  take(/\bevery\s+(?:(other)\s+|(\d+)\s+)?(day|week|month|year)s?\b/i, 'date', (m) => {
    const n = m[1] ? 2 : m[2] ? +m[2] : 1
    if (n < 1) return false
    return setRepeat({ kind: EN_UNIT[m[3].toLowerCase()], interval: n } as RepeatRule)
  })

  // ---- the other UI languages ----
  // Times first, so "de la mañana" is a time of day and not "tomorrow", and "в 15:00" loses its "в".
  const setTime = (h: number, min: number, part?: 'am' | 'pm' | 'night') => {
    if (dueTime || h > 23 || min > 59) return false
    if (part === 'pm' && h < 12) h += 12
    if ((part === 'am' || part === 'night') && h === 12) h = 0
    dueTime = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }
  const partOf = (w?: string): 'am' | 'pm' | 'night' | undefined => {
    if (!w) return undefined
    const x = w.toLowerCase()
    if (/^(mañana|manana|manhã|manha|morgens|vormittags|утра)$/u.test(x)) return 'am'
    if (/^(ночи|nachts)$/u.test(x)) return 'night'
    return 'pm'
  }
  // Spanish: a las 3 de la tarde, a las 15:00, 9 de la mañana
  take(ure(`${B}a\\s+las?\\s+(\\d{1,2})(?:[:.h](\\d{2}))?(?:\\s*h)?(?:\\s+(?:de|por)\\s+la\\s+(mañana|manana|tarde|noche))?${E}`), 'date', (m) =>
    setTime(+m[1], m[2] ? +m[2] : 0, partOf(m[3])),
  )
  take(ure(`${B}(\\d{1,2})(?::(\\d{2}))?\\s+de\\s+la\\s+(mañana|manana|tarde|noche)${E}`), 'date', (m) => setTime(+m[1], m[2] ? +m[2] : 0, partOf(m[3])))
  // Portuguese: às 3 da tarde, às 15h da tarde
  take(ure(`${B}(?:às?\\s+)?(\\d{1,2})(?:h(\\d{2})?|:(\\d{2}))?\\s+da\\s+(manhã|manha|tarde|noite)${E}`), 'date', (m) =>
    setTime(+m[1], m[2] ? +m[2] : m[3] ? +m[3] : 0, partOf(m[4])),
  )
  // French and Portuguese: 15h, 15h30, à 15h, às 15h ("2h" alone is a duration, so a short hour needs à / às or minutes)
  take(ure(`${B}(?:(à|às)\\s+)?(\\d{1,2})\\s?h(?:\\s?(\\d{2}))?${E}`), 'date', (m) => {
    if (!m[1] && !m[3] && m[2].length < 2) return false
    return setTime(+m[2], m[3] ? +m[3] : 0)
  })
  // German: 15 Uhr, um 15:30 Uhr, um 3 Uhr nachmittags
  take(ure(`${B}(?:um\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*Uhr(?:\\s+(morgens|vormittags|nachmittags|abends|nachts))?${E}`), 'date', (m) =>
    setTime(+m[1], m[2] ? +m[2] : 0, partOf(m[3])),
  )
  // Russian: в 15:00, в 15 часов, в 3 часа дня, в 9 утра
  take(ure(`${B}(?:во?\\s+)?(\\d{1,2})\\s*(?:час(?:а|ов)?|ч\\.?)(?:\\s+(утра|дня|вечера|ночи))?${E}`), 'date', (m) => setTime(+m[1], 0, partOf(m[2])))
  take(ure(`${B}во?\\s+(\\d{1,2})\\s+(утра|дня|вечера|ночи)${E}`), 'date', (m) => setTime(+m[1], 0, partOf(m[2])))
  // à 15:00, às 15:00, um 15:30, в 15:00: the word before the time goes with it
  take(ure(`${B}(?:à|às|um|во?)\\s+(\\d{1,2}):(\\d{2})${E}`), 'date', (m) => setTime(+m[1], +m[2]))

  const dateOnce = (fn: () => Date | false | undefined) => {
    if (dueDate) return false
    const d = fn()
    if (!d) return false
    setDue(d)
  }
  const relative = (n: number, unit: string) => {
    const u = unitOf(unit)
    return u === 'day' ? addDays(now, n) : u === 'week' ? addDays(now, 7 * n) : addMonths(now, n)
  }
  const wdOf = (m: RegExpExecArray) => WD_ALL[m.slice(1).find(Boolean)!.toLowerCase()]
  // next Monday: el próximo lunes, lundi prochain, nächsten Montag, na próxima segunda, в следующий понедельник, 来週の月曜日, 다음 주 월요일
  for (const source of [
    `${B}(?:el\\s+)?(?:próximo|proximo)\\s+(${alt(WD_ES)})${E}`,
    `${B}(?:el\\s+)?(${alt(WD_ES)})\\s+(?:que\\s+viene|próximo|proximo)${E}`,
    `${B}(?:le\\s+)?(${alt(WD_FR)})\\s+prochain${E}`,
    `${B}(?:le\\s+)?prochain\\s+(${alt(WD_FR)})${E}`,
    `${B}(?:am\\s+)?(?:nächsten|nächster|naechsten|kommenden)\\s+(${alt(WD_DE)})${E}`,
    `${B}(?:n[ao]\\s+)?(?:próxim[ao]|proxim[ao])\\s+(${alt(WD_PT_ANY)})${E}`,
    `${B}(?:n[ao]\\s+)?(${alt(WD_PT_ANY)})\\s+que\\s+vem${E}`,
    `${B}(?:во?\\s+)?следующ(?:ий|ую|ее|ая)\\s+(${alt(WD_RU)})${E}`,
    `来週の?(${alt(WD_JA)})`,
    `다음\\s*주\\s*(${alt(WD_KO)})`,
  ])
    take(ure(source), 'date', (m) => dateOnce(() => nextWeek(wdOf(m))))
  // next week (its Monday), next month
  take(
    ure(
      `${B}(?:(?:la|na)\\s+)?(?:próxima|proxima)\\s+semana${E}|${B}(?:(?:la|na)\\s+)?semana\\s+que\\s+(?:viene|vem)${E}|${B}(?:la\\s+)?semaine\\s+prochaine${E}|${B}la\\s+prochaine\\s+semaine${E}|${B}(?:nächste|naechste|kommende)\\s+woche${E}|${B}(?:на\\s+)?следующей\\s+неделе${E}|${B}следующую\\s+неделю${E}|来週|다음\\s*주`,
    ),
    'date',
    () => dateOnce(() => nextWeek(1)),
  )
  take(
    ure(
      `${B}(?:el\\s+)?(?:próximo|proximo)\\s+mes${E}|${B}(?:el\\s+)?mes\\s+que\\s+viene${E}|${B}(?:no\\s+)?(?:próximo|proximo)\\s+m[eê]s${E}|${B}(?:no\\s+)?m[eê]s\\s+que\\s+vem${E}|${B}(?:le\\s+)?mois\\s+prochain${E}|${B}(?:im\\s+)?(?:nächsten|naechsten|kommenden)\\s+monat${E}|${B}(?:в\\s+)?следующем\\s+месяце${E}|来月|다음\\s*달`,
    ),
    'date',
    () => dateOnce(() => addMonths(now, 1)),
  )
  // a weekday: el lunes, lundi, am Montag, na segunda, segunda-feira, в среду, понедельник, 月曜日, 월요일
  for (const source of [
    `${B}(?:(?:el|le|am|n[ao])\\s+)?(${alt(WD_LATIN)})${E}`,
    `${B}(?:n[ao]|nesta|esta)\\s+(${alt(WD_PT_SHORT)})${E}`,
    `${B}во?\\s+(${alt(WD_RU)})${E}`,
    `${B}(${alt(WD_RU_ALONE)})${E}`,
    `(?:今週の?)?(${alt(WD_JA)})`,
    `(?:이번\\s*주\\s*)?(${alt(WD_KO)})`,
  ])
    take(ure(source), 'date', (m) => dateOnce(() => upcoming(wdOf(m))))
  // in 3 days: en 3 días, em 3 dias, dans 3 jours, in 3 Tagen, через 3 дня, 3일 후, 3日後
  for (const source of [
    `${B}(?:en|em|daqui\\s+a|dans|in|через)\\s+(\\d+)\\s+(d[ií]as?|semanas?|mes(?:es)?|m[eê]s|meses|jours?|semaines?|mois|tag(?:en)?|wochen?|monat(?:en)?|д(?:ень|ня|ней)|недел[юиь]|месяц(?:а|ев)?)${E}`,
    `(\\d+)\\s*(일|주|개월|달)\\s*(?:후|뒤)`,
    `(\\d+)\\s*(日|週間|か月|ヶ月|カ月|ヵ月|ケ月)\\s*[後后]`,
  ])
    take(ure(source), 'date', (m) => dateOnce(() => relative(+m[1], m[2])))
  // month dates: 15 de marzo, 15 de março, 15 mars, le 1er mai, 15. März, 15 марта, 3월 15일
  take(ure(`${B}(?:(?:el|o|dia)\\s+)?(\\d{1,2})\\s+de\\s+(${alternation(Object.keys(MONTH_ES_PT))})(?:\\s+de\\s+(\\d{4}))?${E}`), 'date', (m) => {
    if (dueDate) return false
    return monthDay(MONTH_ES_PT[m[2].toLowerCase()], +m[1], m[3] ? +m[3] : undefined)
  })
  take(ure(`${B}(?:(?:le|am)\\s+)?(\\d{1,2})(?:er|\\.)?\\s*(${alternation(Object.keys(MONTH_FR_DE))})(?:\\s+(\\d{4}))?${E}`), 'date', (m) => {
    if (dueDate) return false
    return monthDay(MONTH_FR_DE[m[2].toLowerCase()], +m[1], m[3] ? +m[3] : undefined)
  })
  take(ure(`${B}(\\d{1,2})\\s+(${alternation(Object.keys(MONTH_RU))})(?:\\s+(\\d{4})(?:\\s*(?:года|г\\.?))?)?${E}`), 'date', (m) => {
    if (dueDate) return false
    return monthDay(MONTH_RU[m[2].toLowerCase()], +m[1], m[3] ? +m[3] : undefined)
  })
  take(/(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/, 'date', (m) => {
    if (dueDate) return false
    return monthDay(+m[2], +m[3], m[1] ? +m[1] : undefined)
  })

  // ---- dates: Chinese ----
  take(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})[日号號]?/, 'date', (m) => {
    if (dueDate) return false
    setDue(new Date(+m[1], +m[2] - 1, +m[3]))
  })
  take(/(\d{1,2}|十[一二]?|[一二三四五六七八九])月(\d{1,2})[日号號]?/, 'date', (m) => {
    if (dueDate) return false
    return monthDay(num(m[1]), +m[2])
  })
  take(/(大[后後]天|[后後]天|明天|今天|明晚|今晚|明早|今早)/, 'date', (m) => {
    if (dueDate) return false
    const k = m[1]
    const off = k.startsWith('大') ? 3 : /^[后後]/.test(k) ? 2 : k.startsWith('明') ? 1 : 0
    if (k.endsWith('晚')) ampm = 'pm'
    if (k.endsWith('早')) ampm = 'am'
    setDue(addDays(now, off))
  })
  take(/(下+)(?:个|個)?(?:周|週|星期|礼拜|禮拜)([一二三四五六日天])/, 'date', (m) => {
    if (dueDate) return false
    let d = nextWeek(CN_WEEK[m[2]])
    for (let i = 1; i < m[1].length; i++) d = addDays(d, 7)
    setDue(d)
  })
  take(/(?:这个?|這個?|本)?(?:周|週|星期|礼拜|禮拜)([一二三四五六日天])/, 'date', (m) => {
    if (dueDate) return false
    setDue(upcoming(CN_WEEK[m[1]]))
  })
  take(/下(?:个|個)?(?:周|週|星期|礼拜|禮拜)/, 'date', () => {
    if (dueDate) return false
    setDue(nextWeek(1))
  })
  take(/下[个個]?月(?:(\d{1,2})[号號日])?/, 'date', (m) => {
    if (dueDate) return false
    let d = addMonths(now, 1)
    if (m[1]) d = setDate(d, +m[1])
    setDue(d)
  })
  take(/(\d+|[一二两兩三四五六七八九十])\s*(天|周|週|个月|個月)(?:[后後]|以[后後]|之[后後])/, 'date', (m) => {
    if (dueDate) return false
    const n = num(m[1])
    setDue(m[2] === '天' ? addDays(now, n) : /[周週]/.test(m[2]) ? addDays(now, 7 * n) : addMonths(now, n))
  })
  take(/(?<![\d月])(\d{1,2})[号號日](?!\d)/, 'date', (m) => {
    if (dueDate) return false
    const day = +m[1]
    if (day < 1 || day > 31) return false
    let d = setDate(now, day)
    if (fmt(d) < fmt(now)) d = setDate(addMonths(now, 1), day)
    setDue(d)
  })

  // ---- dates: English ----
  take(/\b(?:the\s+)?day\s+after\s+tomorrow\b/i, 'date', () => {
    if (dueDate) return false
    setDue(addDays(now, 2))
  })
  take(/\b(today|tonight|tomorrow|tmr)\b/i, 'date', (m) => {
    if (dueDate) return false
    const k = m[1].toLowerCase()
    if (k === 'tonight') ampm = 'pm'
    setDue(addDays(now, k === 'today' || k === 'tonight' ? 0 : 1))
  })
  take(new RegExp(`\\b(?:on\\s+)?(${EN_MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'), 'date', (m) => {
    if (dueDate) return false
    return monthDay(EN_MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2], m[3] ? +m[3] : undefined)
  })
  take(new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${EN_MONTH})\\b(?:,?\\s+(\\d{4})\\b)?`, 'i'), 'date', (m) => {
    if (dueDate) return false
    return monthDay(EN_MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1], m[3] ? +m[3] : undefined)
  })
  take(/\bnext\s+(mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?\b/i, 'date', (m) => {
    if (dueDate) return false
    setDue(nextWeek(EN_WEEK[m[1].toLowerCase()]))
  })
  take(/\bnext\s+week\b/i, 'date', () => {
    if (dueDate) return false
    setDue(nextWeek(1))
  })
  take(/\bnext\s+month\b/i, 'date', () => {
    if (dueDate) return false
    setDue(addMonths(now, 1))
  })
  take(/\b(?:on\s+)?(mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?\b/i, 'date', (m) => {
    if (dueDate) return false
    setDue(upcoming(EN_WEEK[m[1].toLowerCase()]))
  })
  take(/\bin\s+(\d+)\s+(days?|weeks?|months?)\b/i, 'date', (m) => {
    if (dueDate) return false
    const n = +m[1]
    const unit = m[2].toLowerCase()
    setDue(unit.startsWith('day') ? addDays(now, n) : unit.startsWith('week') ? addDays(now, 7 * n) : addMonths(now, n))
  })

  // ---- dates: today / tomorrow in the other languages ----
  take(DAY_WORDS_RE, 'date', (m) => {
    if (dueDate) return false
    setDue(addDays(now, DAY_WORDS[m[1].toLowerCase().replace(/\s+/g, ' ')] ?? 0))
  })

  // ---- times ----
  // English first, so "3:30pm" and "at 15:00" are taken whole
  take(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i, 'date', (m) => {
    if (dueTime) return false
    let h = +m[1]
    if (h > 12) return false
    if (m[3].toLowerCase() === 'pm' && h < 12) h += 12
    if (m[3].toLowerCase() === 'am' && h === 12) h = 0
    dueTime = `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`
  })
  take(/\bat\s+(\d{1,2}):(\d{2})\b/i, 'date', (m) => {
    if (dueTime) return false
    const h = +m[1]
    const min = +m[2]
    if (h > 23 || min > 59) return false
    dueTime = `${String(h).padStart(2, '0')}:${m[2]}`
  })
  // Chinese, Japanese and Korean hours (3点, 3點, 3時, 3시) and plain HH:mm
  take(
    /(上午|早上|早晨|中午|下午|傍晚|晚上|午前|午後|오전|오후)?\s?(\d{1,2}|十[一二]?|[一二两兩三四五六七八九])(?:[:：](\d{2})|[点點時시](?:(半|반)|(\d{1,2})[分분]?)?(?![간間]))/,
    'date',
    (m) => {
      if (dueTime) return false
      let h = num(m[2])
      const min = m[3] ? +m[3] : m[4] ? 30 : m[5] ? +m[5] : 0
      if (isNaN(h) || h > 23 || min > 59) return false
      const p = m[1]
      if (p && /下午|傍晚|晚上|午後|오후/.test(p) && h < 12) h += 12
      else if (p === '中午' && h < 6) h += 12
      else if (!p && ampm === 'pm' && h < 12) h += 12
      dueTime = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
    },
  )
  if (repeat) {
    // A repeating task starts on the first day its rule falls on, and the rule takes its days from that date
    if (!dueDate) dueDate = firstOccurrence(repeat, fmt(now))
    repeat = withDays(repeat, dueDate)
  }
  if (dueTime && !dueDate) {
    // Only a time: today, or tomorrow when that time has passed
    const [h, mm] = dueTime.split(':').map(Number)
    const passed = now.getHours() * 60 + now.getMinutes() > h * 60 + mm
    dueDate = fmt(addDays(now, passed ? 1 : 0))
  }

  // ---- priority ----
  take(PRIORITY_RE, 'priority', (m) => {
    if (priority !== undefined) return false
    priority = PRIORITY_WORDS[m[1].toLowerCase()]
  })
  take(/(?:^|(?<=\s))(!{1,3})(?=\s|$)/, 'priority', (m) => {
    if (priority !== undefined) return false
    priority = ([0, 1, 3, 5] as Priority[])[m[1].length]
  })

  // ---- tags ----
  take(/(?:^|(?<=\s))#([^\s#]+)/, 'tag', (m) => {
    if (!tags.includes(m[1])) tags.push(m[1])
  })

  // ---- list, with ~ or ^ ----
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

  return { title, dueDate, dueTime, priority, repeat, tags, listName, spans }
}
