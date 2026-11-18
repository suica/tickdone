import { describe, expect, it } from 'vitest'
import { lunarDate, lunarDayName, lunarLabel, solarTermOn, solarTerms, sunLongitude } from '../lunar'

// Published dates (China Standard Time) of the 24 solar terms, in calendar order from early January.
const KNOWN: Record<number, string[]> = {
  2025: ['01-05', '01-20', '02-03', '02-18', '03-05', '03-20', '04-04', '04-20', '05-05', '05-21', '06-05', '06-21', '07-07', '07-22', '08-07', '08-23', '09-07', '09-23', '10-08', '10-23', '11-07', '11-22', '12-07', '12-21'],
  2026: ['01-05', '01-20', '02-04', '02-18', '03-05', '03-20', '04-05', '04-20', '05-05', '05-21', '06-05', '06-21', '07-07', '07-23', '08-07', '08-23', '09-07', '09-23', '10-08', '10-23', '11-07', '11-22', '12-07', '12-22'],
  2027: ['01-05', '01-20', '02-04', '02-19', '03-06', '03-21', '04-05', '04-20', '05-06', '05-21', '06-06', '06-21', '07-07', '07-23', '08-08', '08-23', '09-08', '09-23', '10-08', '10-23', '11-07', '11-22', '12-07', '12-22'],
}
const NAMES = ['小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至']

describe('solar terms', () => {
  for (const [year, dates] of Object.entries(KNOWN)) {
    it(`matches the published dates of ${year}`, () => {
      const got = [...solarTerms(Number(year)).keys()].sort()
      expect(got).toEqual(dates.map((d) => `${year}-${d}`))
      dates.forEach((d, i) => expect(solarTermOn(`${year}-${d}`)).toBe(NAMES[i]))
    })
  }

  it('has no term on other days and uses traditional characters when asked', () => {
    expect(solarTermOn('2026-11-18')).toBeUndefined()
    expect(solarTermOn('2026-04-20')).toBe('谷雨')
    expect(solarTermOn('2026-04-20', true)).toBe('穀雨')
    expect(solarTermOn('2027-03-06', true)).toBe('驚蟄')
  })

  it('puts the sun at 0° at the March equinox of 2026 (20 Mar 14:46 UTC)', () => {
    const jd = Date.UTC(2026, 2, 20, 14, 46) / 86400000 + 2440587.5 + 69 / 86400
    const lon = sunLongitude(jd)
    expect(Math.min(lon, 360 - lon)).toBeLessThan(0.02)
  })
})

describe('lunar days', () => {
  it('names the days of a lunar month', () => {
    expect([1, 2, 10, 11, 15, 19, 20, 21, 29, 30].map(lunarDayName)).toEqual(['初一', '初二', '初十', '十一', '十五', '十九', '二十', '廿一', '廿九', '三十'])
  })

  it('reads the lunar date from the Chinese calendar', () => {
    expect(lunarDate('2026-11-18')).toEqual({ month: '十月', day: 10 })
    expect(lunarDate('2026-02-17')).toEqual({ month: '正月', day: 1 })
    expect(lunarDate('2025-07-25')).toEqual({ month: '闰六月', day: 1 })
    expect(lunarDate('2025-07-25', true)).toEqual({ month: '閏六月', day: 1 })
  })

  it('labels a cell with the term, the month on its first day, or the day', () => {
    expect(lunarLabel('2026-11-18')).toEqual({ text: '初十', term: false })
    expect(lunarLabel('2026-12-09')).toEqual({ text: '十一月', term: false })
    expect(lunarLabel('2026-11-22')).toEqual({ text: '小雪', term: true })
    expect(lunarLabel('2026-02-17')).toEqual({ text: '正月', term: false })
  })
})
