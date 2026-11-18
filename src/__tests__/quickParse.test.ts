import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { quickParse } from '../quickParse'
import { catalogs } from '../i18n/catalogs'
import { LOCALES } from '../i18n'

// 2026-11-18 is a Wednesday; 10:00 local time (the test script pins TZ=Asia/Shanghai)
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 18, 10, 0, 0))
})
afterEach(() => vi.useRealTimers())

// Chinese fixtures below are what Chinese users type.
describe('quickParse, Chinese', () => {
  it('finds the date, time, priority and tags, and removes them from the title', () => {
    const p = quickParse('明天下午3点 开周会 !高 #重要')
    expect(p).toMatchObject({ title: '开周会', dueDate: '2026-11-19', dueTime: '15:00', priority: 5, tags: ['重要'] })
    expect(p.spans.map((s) => s.kind)).toEqual(['date', 'date', 'priority', 'tag'])
  })

  it('highlight spans point into the original text', () => {
    const text = '明天下午3点 开周会 !高 #重要'
    const p = quickParse(text)
    expect(p.spans.map((s) => text.slice(s.start, s.end))).toEqual(['明天', '下午3点', '!高', '#重要'])
  })

  it.each([
    ['今天 写日报', '2026-11-18'],
    ['后天 体检', '2026-11-20'],
    ['大后天 出差', '2026-11-21'],
    ['周五 健身', '2026-11-20'],
    ['周三 例会', '2026-11-18'],
    ['下周一 交报告', '2026-11-23'],
    ['下下周一 复盘', '2026-11-30'],
    ['3天后 复查', '2026-11-21'],
    ['两周后 回访', '2026-12-02'],
    ['12月25日 圣诞', '2026-12-25'],
    ['5号 交房租', '2026-12-05'],
    ['20号 还信用卡', '2026-11-20'],
    ['2027年1月2日 年会', '2027-01-02'],
    ['下个月 续费', '2026-12-18'],
    // Traditional Chinese
    ['後天 體檢', '2026-11-20'],
    ['下週一 交報告', '2026-11-23'],
    ['兩週後 回訪', '2026-12-02'],
  ])('%s → %s', (text, date) => {
    expect(quickParse(text).dueDate).toBe(date)
  })

  it('tonight + an hour means PM', () => {
    expect(quickParse('今晚8点 看电影')).toMatchObject({ dueDate: '2026-11-18', dueTime: '20:00', title: '看电影' })
  })

  it('half hours and minutes', () => {
    expect(quickParse('明天上午9点半 面试').dueTime).toBe('09:30')
    expect(quickParse('明天 14:05 交接').dueTime).toBe('14:05')
    expect(quickParse('明天下午3點 開會').dueTime).toBe('15:00')
  })

  it('only a time: today if it has not passed, otherwise tomorrow', () => {
    expect(quickParse('11点 站会').dueDate).toBe('2026-11-18')
    expect(quickParse('9:30 站会').dueDate).toBe('2026-11-19')
  })

  it.each([
    ['买菜 !高', 5],
    ['买菜 !中', 3],
    ['买菜 !低', 1],
    ['买菜 !无', 0],
    ['买菜 !無', 0],
    ['买菜 !!!', 5],
    ['买菜 !!', 3],
    ['买菜 !', 1],
  ])('%s → priority %i', (text, prio) => {
    expect(quickParse(text).priority).toBe(prio)
  })

  it('an exclamation mark inside a sentence is not a priority', () => {
    expect(quickParse('太好了!真棒').priority).toBeUndefined()
  })

  it('several tags, duplicates removed', () => {
    expect(quickParse('读书 #阅读 #学习 #阅读').tags).toEqual(['阅读', '学习'])
  })

  it('~ or ^ picks a list, by prefix too; unknown lists are left alone', () => {
    const lists = ['工作', '生活']
    expect(quickParse('写周报 ~工作', lists)).toMatchObject({ listName: '工作', title: '写周报' })
    expect(quickParse('买牛奶 ^生', lists).listName).toBe('生活')
    expect(quickParse('随便 ~学习', lists)).toMatchObject({ listName: undefined, title: '随便 ~学习' })
  })

  it('returns the title as typed when there is nothing to recognise', () => {
    expect(quickParse('  整理  房间  ')).toMatchObject({ title: '整理 房间', dueDate: undefined, tags: [], spans: [] })
  })
})

describe('quickParse, English', () => {
  it('finds the date, time, priority and tags, and removes them from the title', () => {
    const text = 'Team meeting tomorrow 3pm !high #Work'
    const p = quickParse(text)
    expect(p).toMatchObject({ title: 'Team meeting', dueDate: '2026-11-19', dueTime: '15:00', priority: 5, tags: ['Work'] })
    expect(p.spans.map((s) => text.slice(s.start, s.end))).toEqual(['tomorrow', '3pm', '!high', '#Work'])
  })
  it('tomorrow 3pm', () => {
    expect(quickParse('call mom tomorrow 3pm')).toMatchObject({ title: 'call mom', dueDate: '2026-11-19', dueTime: '15:00' })
  })
  it.each([
    ['write report today', '2026-11-18'],
    ['flight day after tomorrow', '2026-11-20'],
    ['review next monday', '2026-11-23'],
    ['plan next week', '2026-11-23'],
    ['renew next month', '2026-12-18'],
    ['dentist in 10 days', '2026-11-28'],
    ['follow up in 2 weeks', '2026-12-02'],
    ['checkup in 3 months', '2027-02-18'],
    ['gym friday', '2026-11-20'],
    ['party on Sat', '2026-11-21'],
    ['gifts Dec 25', '2026-12-25'],
    ['rent December 5th', '2026-12-05'],
    ['taxes 15 April', '2027-04-15'],
    ['old note Jan 2, 2027', '2027-01-02'],
    ['ship 2026-12-01', '2026-12-01'],
  ])('%s → %s', (text, date) => {
    expect(quickParse(text).dueDate).toBe(date)
  })
  it.each([
    ['standup at 9:15am tomorrow', '09:15', 'standup'],
    ['standup tomorrow at 14:30', '14:30', 'standup'],
    ['call tomorrow 11:45', '11:45', 'call'],
    ['movie tonight 8pm', '20:00', 'movie'],
  ])('%s → %s', (text, time, title) => {
    expect(quickParse(text)).toMatchObject({ dueTime: time, title })
  })
  it('12am is midnight', () => {
    expect(quickParse('backup today 12am').dueTime).toBe('00:00')
  })
  it.each([
    ['buy milk !high', 5],
    ['buy milk !HIGH', 5],
    ['buy milk !medium', 3],
    ['buy milk !med', 3],
    ['buy milk !low', 1],
    ['buy milk !none', 0],
    ['buy milk !3', 5],
  ])('%s → priority %i', (text, prio) => {
    expect(quickParse(text)).toMatchObject({ priority: prio, title: 'buy milk' })
  })
  it('leaves words that only look like dates alone', () => {
    expect(quickParse('read about the monthly budget')).toMatchObject({ dueDate: undefined, title: 'read about the monthly budget' })
    expect(quickParse('fix the 3 hour bug').dueTime).toBeUndefined()
  })
})

describe('quickParse, other languages', () => {
  it.each([
    ['明日 会議', '2026-11-19'],
    ['会議は明後日', '2026-11-20'],
    ['내일 회의', '2026-11-19'],
    ['모레까지 보고서', '2026-11-20'],
    ['Reunión mañana', '2026-11-19'],
    ['Viaje pasado mañana', '2026-11-20'],
    ['Réunion demain', '2026-11-19'],
    ['Voyage après-demain', '2026-11-20'],
    ["Appeler aujourd'hui", '2026-11-18'],
    ['Meeting morgen', '2026-11-19'],
    ['Reise übermorgen', '2026-11-20'],
    ['Reunião amanhã', '2026-11-19'],
    ['Viagem depois de amanhã', '2026-11-20'],
    ['Встреча завтра', '2026-11-19'],
    ['Поездка послезавтра', '2026-11-20'],
  ])('%s → %s', (text, date) => {
    expect(quickParse(text).dueDate).toBe(date)
  })
  it('a word that only contains a date word is not a date', () => {
    expect(quickParse('Morgenroutine').dueDate).toBeUndefined()
    expect(quickParse('Завтрак').dueDate).toBeUndefined()
  })
  it('Japanese and Korean hours', () => {
    expect(quickParse('明日 午後3時 会議').dueTime).toBe('15:00')
    expect(quickParse('내일 오후 3시 회의').dueTime).toBe('15:00')
    expect(quickParse('3시간 공부').dueTime).toBeUndefined()
  })
})

describe('quick-add words in every language', () => {
  const levels = [['high', 5], ['medium', 3], ['low', 1], ['none', 0]] as const
  for (const { code } of LOCALES) {
    const cat = catalogs[code] as Record<string, string>
    it(`${code}: the priority words the suggestions insert are understood`, () => {
      for (const [level, prio] of levels) {
        const word = cat[`tasks.quickAdd.token.${level}`]
        expect(quickParse(`x !${word}`), `${code} ${word}`).toMatchObject({ priority: prio, title: 'x' })
      }
    })
    it(`${code}: the first-run quick-add example parses`, () => {
      const tag = cat['core.seed.tag.important']
      const example = cat['core.seed.quickAddExample'].replace('{tag}', tag)
      const p = quickParse(example)
      expect(p, example).toMatchObject({ dueDate: '2026-11-19', dueTime: '15:00', priority: 5, tags: [tag] })
      expect(p.title, example).not.toMatch(/[!#]/)
    })
  }
})

// Chinese fixtures below are what Chinese users type.
describe('quickParse, repeat rules', () => {
  it.each([
    ['Standup every 2 weeks', 'Standup', { kind: 'weekly', interval: 2, days: [3] }, '2026-11-18'],
    ['Water plants every other day', 'Water plants', { kind: 'daily', interval: 2 }, '2026-11-18'],
    ['Gym every Mon and Fri', 'Gym', { kind: 'weekly', interval: 1, days: [1, 5] }, '2026-11-20'],
    ['Gym every monday, wednesday', 'Gym', { kind: 'weekly', interval: 1, days: [1, 3] }, '2026-11-18'],
    ['Report every last Friday', 'Report', { kind: 'monthly', interval: 1, nth: -1, weekday: 5 }, '2026-11-27'],
    ['Book club every 2nd Tuesday of the month', 'Book club', { kind: 'monthly', interval: 1, nth: 2, weekday: 2 }, '2026-12-08'],
    ['Rent every month on the 1st', 'Rent', { kind: 'monthly', interval: 1, day: 1 }, '2026-12-01'],
    ['Invoices monthly on the last day', 'Invoices', { kind: 'monthly', interval: 1, day: -1 }, '2026-11-30'],
    ['Check in every weekday', 'Check in', { kind: 'weekdays' }, '2026-11-18'],
    ['Renew domain every year', 'Renew domain', { kind: 'yearly', interval: 1, month: 11, day: 18 }, '2026-11-18'],
    ['每月最后一个周五 交周报', '交周报', { kind: 'monthly', interval: 1, nth: -1, weekday: 5 }, '2026-11-27'],
    ['每月第二个星期一 例会', '例会', { kind: 'monthly', interval: 1, nth: 2, weekday: 1 }, '2026-12-14'],
    ['每月最后一天 对账', '对账', { kind: 'monthly', interval: 1, day: -1 }, '2026-11-30'],
    ['每月15号 还信用卡', '还信用卡', { kind: 'monthly', interval: 1, day: 15 }, '2026-12-15'],
    ['每年3月8日 送花', '送花', { kind: 'yearly', interval: 1, month: 3, day: 8 }, '2027-03-08'],
    ['每个工作日 打卡', '打卡', { kind: 'weekdays' }, '2026-11-18'],
    ['每周一三五 跑步', '跑步', { kind: 'weekly', interval: 1, days: [1, 3, 5] }, '2026-11-18'],
    ['每周五 周会', '周会', { kind: 'weekly', interval: 1, days: [5] }, '2026-11-20'],
    ['每2周 复盘', '复盘', { kind: 'weekly', interval: 2, days: [3] }, '2026-11-18'],
    ['每天 背单词', '背单词', { kind: 'daily', interval: 1 }, '2026-11-18'],
    ['每三个月 体检', '体检', { kind: 'monthly', interval: 3, day: 18 }, '2026-11-18'],
    // Traditional Chinese
    ['每週二 開會', '開會', { kind: 'weekly', interval: 1, days: [2] }, '2026-11-24'],
  ])('%s', (text, title, repeat, date) => {
    const p = quickParse(text)
    expect(p).toMatchObject({ title, dueDate: date })
    expect(p.repeat).toEqual(repeat)
  })

  it('a date or time given with the rule is kept', () => {
    expect(quickParse('每周五 下午3点 周会')).toMatchObject({ title: '周会', dueDate: '2026-11-20', dueTime: '15:00', repeat: { kind: 'weekly', days: [5] } })
    expect(quickParse('Review every 2 weeks from Dec 4')).toMatchObject({ dueDate: '2026-12-04', repeat: { kind: 'weekly', interval: 2, days: [5] } })
  })

  it('words that only look like a rule stay in the title', () => {
    expect(quickParse('Weekly report').repeat).toBeUndefined()
    expect(quickParse('Weekly report').title).toBe('Weekly report')
    expect(quickParse('Everyone meets on Monday')).toMatchObject({ title: 'Everyone meets', repeat: undefined, dueDate: '2026-11-23' })
    expect(quickParse('every month planning').repeat).toEqual({ kind: 'monthly', interval: 1, day: 18 })
  })

  it('the rule is highlighted like a date', () => {
    const text = 'Report every last Friday !high'
    const p = quickParse(text)
    expect(p.spans.map((s) => [s.kind, text.slice(s.start, s.end)])).toEqual([
      ['date', 'every last Friday'],
      ['priority', '!high'],
    ])
  })
})
