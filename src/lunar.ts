// Chinese calendar labels for the month view: the lunar day (from the browser's Intl Chinese
// calendar) and the 24 solar terms (from the sun's apparent longitude). No data tables, no dependency.

/** Solar term names in order of the sun's longitude, 0° = March equinox, 15° apart. */
const TERMS_HANS = ['春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至', '小寒', '大寒', '立春', '雨水', '惊蛰']
const TERMS_HANT = ['春分', '清明', '穀雨', '立夏', '小滿', '芒種', '夏至', '小暑', '大暑', '立秋', '處暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至', '小寒', '大寒', '立春', '雨水', '驚蟄']

const DAY_TENS = ['初', '十', '廿', '三']
const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

/** 1 → 初一, 10 → 初十, 15 → 十五, 20 → 二十, 21 → 廿一, 30 → 三十. */
export function lunarDayName(day: number): string {
  if (day === 10) return '初十'
  if (day === 20) return '二十'
  if (day === 30) return '三十'
  return DAY_TENS[Math.floor(day / 10)] + DIGITS[day % 10]
}

const rad = Math.PI / 180
const norm = (deg: number) => ((deg % 360) + 360) % 360

/**
 * The sun's apparent ecliptic longitude in degrees at Julian Ephemeris Day `jde`
 * (low-precision solar theory, good to about 0.01°, i.e. a quarter of an hour of the sun's motion).
 */
export function sunLongitude(jde: number): number {
  const T = (jde - 2451545) / 36525
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * rad
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M)
  const omega = (125.04 - 1934.136 * T) * rad
  return norm(L0 + C - 0.00569 - 0.00478 * Math.sin(omega))
}

const JD_UNIX_EPOCH = 2440587.5
/** Terrestrial time runs about 69 s ahead of UTC in the 2020s; close enough for whole days. */
const DELTA_T_DAYS = 69 / 86400
const TROPICAL_YEAR = 365.2422

/** The moment (ms since the epoch, UTC) the sun reaches `longitude` degrees, searching near `guessMs`. */
function crossing(longitude: number, guessMs: number): number {
  let jde = guessMs / 86400000 + JD_UNIX_EPOCH + DELTA_T_DAYS
  for (let i = 0; i < 8; i++) {
    let diff = longitude - sunLongitude(jde)
    diff = ((diff + 540) % 360) - 180
    jde += (diff / 360) * TROPICAL_YEAR
    if (Math.abs(diff) < 1e-6) break
  }
  return (jde - DELTA_T_DAYS - JD_UNIX_EPOCH) * 86400000
}

/** China Standard Time (UTC+8), which fixes the date of a solar term. */
const CST_MS = 8 * 3600000
const ymd = (ms: number) => new Date(ms + CST_MS).toISOString().slice(0, 10)

const termCache = new Map<number, Map<string, number>>()

/** The dates (yyyy-MM-dd, China time) of the 24 solar terms in `year`, mapped to their index in longitude order. */
export function solarTerms(year: number): Map<string, number> {
  const hit = termCache.get(year)
  if (hit) return hit
  const out = new Map<string, number>()
  const equinox = Date.UTC(year, 2, 20, 12)
  for (let k = 0; k < 24; k++) {
    // Terms 19-23 (from 285°, early January to early March) fall before the equinox of the same year.
    const offset = ((k < 19 ? k : k - 24) * 15 * TROPICAL_YEAR) / 360
    out.set(ymd(crossing(k * 15, equinox + offset * 86400000)), k)
  }
  termCache.set(year, out)
  return out
}

/** The solar term on `date` (yyyy-MM-dd), or undefined. */
export function solarTermOn(date: string, traditional = false): string | undefined {
  const k = solarTerms(Number(date.slice(0, 4))).get(date)
  return k === undefined ? undefined : (traditional ? TERMS_HANT : TERMS_HANS)[k]
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function lunarFormatter(traditional: boolean) {
  const key = traditional ? 'zh-Hant' : 'zh'
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(key + '-u-ca-chinese', { month: 'long', day: 'numeric', timeZone: 'UTC' })
    formatters.set(key, f)
  }
  return f
}

/** Lunar month and day of `date` (yyyy-MM-dd); month is the name the browser gives it, e.g. 十月 or 闰六月. */
export function lunarDate(date: string, traditional = false): { month: string; day: number } | undefined {
  const [y, m, d] = date.split('-').map(Number)
  try {
    const parts = lunarFormatter(traditional).formatToParts(new Date(Date.UTC(y, m - 1, d, 12)))
    const month = parts.find((p) => p.type === 'month')?.value
    const day = Number(parts.find((p) => p.type === 'day')?.value)
    if (!month || !(day >= 1 && day <= 30)) return undefined
    return { month, day }
  } catch {
    return undefined
  }
}

/**
 * The small label of a month cell: the solar term on its day, else the lunar day
 * (the month name on the first day of a lunar month: 十月, 闰六月).
 */
export function lunarLabel(date: string, traditional = false): { text: string; term: boolean } | undefined {
  const term = solarTermOn(date, traditional)
  if (term) return { text: term, term: true }
  const l = lunarDate(date, traditional)
  if (!l) return undefined
  return { text: l.day === 1 ? l.month : lunarDayName(l.day), term: false }
}
