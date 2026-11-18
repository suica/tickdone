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
/** "Wed", "周三", "水" */
export const fmtWeekday = (d: Date, width: 'narrow' | 'short' | 'long' = 'short') => dtf({ weekday: width }).format(d)
/** "3:00 PM", "15:00" — `hhmm` is "HH:mm". */
export function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return dtf({ hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m))
}
/** Numbers with the locale's grouping, e.g. "1,234" / "1 234". */
export const fmtNumber = (n: number) => new Intl.NumberFormat(getLocale()).format(n)
