import { de, enUS, es, fr, ja, ko, ptBR, ru, zhCN, zhTW, type Locale as DateFnsLocale } from 'date-fns/locale'
import { getLocale, type Locale } from './index'

const DATE_FNS: Record<Locale, DateFnsLocale> = { en: enUS, 'zh-CN': zhCN, 'zh-TW': zhTW, ja, ko, es, fr, de, 'pt-BR': ptBR, ru }

/** The date-fns locale for the current language (for `format`, week starts, etc.). */
export const dateFnsLocale = () => DATE_FNS[getLocale()]

/** The first day of the week customary for the current language (0 = Sunday). */
export const localeWeekStart = (): 0 | 1 => (DATE_FNS[getLocale()].options?.weekStartsOn === 1 ? 1 : 0)

const formats = new Map<string, Intl.DateTimeFormat>()
function dtf(options: Intl.DateTimeFormatOptions) {
  const key = getLocale() + JSON.stringify(options)
  let f = formats.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(getLocale(), options)
    formats.set(key, f)
  }
  return f
}

/** "Nov 18", "11月18日", "18 nov." */
export const fmtMonthDay = (d: Date) => dtf({ month: 'short', day: 'numeric' }).format(d)
/** "Nov 18, 2026", "2026年11月18日" */
export const fmtFullDate = (d: Date) => dtf({ year: 'numeric', month: 'short', day: 'numeric' }).format(d)
/** "November 2026", "2026年11月" */
export const fmtMonthYear = (d: Date) => dtf({ year: 'numeric', month: 'long' }).format(d)
/** "November", "11月" — `month` is 1–12. */
export const fmtMonthName = (month: number) => dtf({ month: 'long' }).format(new Date(2000, month - 1, 1))
/** "Wed", "周三", "水" */
export const fmtWeekday = (d: Date, width: 'narrow' | 'short' | 'long' = 'short') => dtf({ weekday: width }).format(d)
/** "3:00 PM", "15:00" — `hhmm` is "HH:mm". */
export function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return dtf({ hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m))
}
/** Numbers with the locale's grouping, e.g. "1,234" / "1 234". */
export const fmtNumber = (n: number) => new Intl.NumberFormat(getLocale()).format(n)
/** "18", "18日" — the day of the month alone. */
export const fmtDayNum = (d: Date) => dtf({ day: 'numeric' }).format(d)
/** "Nov", "11月" */
export const fmtMonthShort = (d: Date) => dtf({ month: 'short' }).format(d)
/** "2026", "2026年" */
export const fmtYear = (d: Date) => dtf({ year: 'numeric' }).format(d)
/** "Wed, Nov 18", "11月18日周三" */
export const fmtWeekdayDate = (d: Date) => dtf({ weekday: 'short', month: 'short', day: 'numeric' }).format(d)
/** "Nov 16 – 22, 2026", "2026年11月16日至22日": a span of days, with the parts both ends share written once. */
export const fmtDateRange = (start: Date, end: Date) => {
  const f = dtf({ year: 'numeric', month: 'short', day: 'numeric' })
  return start.getTime() === end.getTime() ? f.format(start) : f.formatRange(start, end)
}
/** "3 PM", "15时" — an hour of the day (0–23). */
export const fmtHour = (h: number) => dtf({ hour: 'numeric' }).format(new Date(2000, 0, 1, h))
/** "42%", "42 %" — `share` is 0–1. */
export const fmtPercent = (share: number) => new Intl.NumberFormat(getLocale(), { style: 'percent', maximumFractionDigits: 0 }).format(share)
