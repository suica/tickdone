import { afterEach, describe, expect, it } from 'vitest'
import { catalogs, en } from '../i18n/catalogs'
import { fmtMonthDay, fmtTime, fmtWeekday } from '../i18n/format'
import { getLocale, LOCALES, matchLocale, setLocale, t } from '../i18n'
import type { Msg } from '../i18n/types'

afterEach(() => setLocale('en'))

const placeholders = (m: Msg) =>
  [...new Set((typeof m === 'string' ? [m] : Object.values(m)).flatMap((s) => [...(s ?? '').matchAll(/\{(\w+)\}/g)].map((x) => x[1])))].sort()

describe('catalogs', () => {
  for (const { code } of LOCALES) {
    it(`${code} has every key, no empty text, the same placeholders as English`, () => {
      const cat = catalogs[code]
      expect(Object.keys(cat).sort()).toEqual(Object.keys(en).sort())
      for (const [key, msg] of Object.entries(cat) as [keyof typeof en, Msg][]) {
        const texts = typeof msg === 'string' ? [msg] : Object.values(msg)
        for (const s of texts) expect(s, `${code} ${key}`).not.toBe('')
        if (typeof msg !== 'string') expect(msg.other, `${code} ${key} needs "other"`).toBeTruthy()
        expect(placeholders(msg), `${code} ${key}`).toEqual(placeholders(en[key]))
      }
    })
  }
})

describe('matchLocale', () => {
  it.each([
    [['en-US'], 'en'],
    [['zh-CN'], 'zh-CN'],
    [['zh'], 'zh-CN'],
    [['zh-Hans-CN'], 'zh-CN'],
    [['zh-TW'], 'zh-TW'],
    [['zh-HK'], 'zh-TW'],
    [['zh-Hant'], 'zh-TW'],
    [['pt-PT'], 'pt-BR'],
    [['de-AT'], 'de'],
    [['fr-CA'], 'fr'],
    [['it-IT', 'es-MX'], 'es'],
    [['it-IT'], 'en'],
    [[], 'en'],
  ])('%j → %s', (tags, locale) => {
    expect(matchLocale(tags)).toBe(locale)
  })
})

describe('t', () => {
  it('translates into the current language and falls back to the key for unknown ones', () => {
    expect(t('common.today')).toBe('Today')
    setLocale('zh-CN')
    expect(getLocale()).toBe('zh-CN')
    expect(t('common.today')).toBe('今天')
    setLocale('de')
    expect(t('common.tomorrow')).toBe('Morgen')
  })
})

describe('format', () => {
  const d = new Date(2026, 10, 18, 15, 5)
  it('formats dates, weekdays and times for the locale', () => {
    expect(fmtMonthDay(d)).toBe('Nov 18')
    expect(fmtWeekday(d)).toBe('Wed')
    expect(fmtTime('15:05')).toBe('3:05 PM')
    setLocale('zh-CN')
    expect(fmtMonthDay(d)).toBe('11月18日')
    expect(fmtWeekday(d)).toBe('周三')
    expect(fmtTime('15:05')).toBe('15:05')
  })
})
