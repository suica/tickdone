import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { quickParse } from '../quickParse'

// 2026-11-18 是周三；本地时间上午 10 点（脚本里固定 TZ=Asia/Shanghai）
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 18, 10, 0, 0))
})
afterEach(() => vi.useRealTimers())

describe('quickParse 中文', () => {
  it('识别日期、时间、优先级和标签，并从标题里去掉', () => {
    const p = quickParse('明天下午3点 开周会 !高 #重要')
    expect(p).toMatchObject({ title: '开周会', dueDate: '2026-11-19', dueTime: '15:00', priority: 5, tags: ['重要'] })
    expect(p.spans.map((s) => s.kind)).toEqual(['date', 'date', 'priority', 'tag'])
  })

  it('高亮区间对应原文里的位置', () => {
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
  ])('%s → %s', (text, date) => {
    expect(quickParse(text).dueDate).toBe(date)
  })

  it('今晚 + 几点按下午算', () => {
    expect(quickParse('今晚8点 看电影')).toMatchObject({ dueDate: '2026-11-18', dueTime: '20:00', title: '看电影' })
  })

  it('点半与分钟', () => {
    expect(quickParse('明天上午9点半 面试').dueTime).toBe('09:30')
    expect(quickParse('明天 14:05 交接').dueTime).toBe('14:05')
  })

  it('只写时间：没过就是今天，已过就是明天', () => {
    expect(quickParse('11点 站会').dueDate).toBe('2026-11-18')
    expect(quickParse('9:30 站会').dueDate).toBe('2026-11-19')
  })

  it.each([
    ['买菜 !高', 5],
    ['买菜 !中', 3],
    ['买菜 !低', 1],
    ['买菜 !无', 0],
    ['买菜 !!!', 5],
    ['买菜 !!', 3],
    ['买菜 !', 1],
  ])('%s → 优先级 %i', (text, prio) => {
    expect(quickParse(text).priority).toBe(prio)
  })

  it('句中的感叹号不算优先级', () => {
    expect(quickParse('太好了!真棒').priority).toBeUndefined()
  })

  it('多个标签、重复标签去重', () => {
    expect(quickParse('读书 #阅读 #学习 #阅读').tags).toEqual(['阅读', '学习'])
  })

  it('~ 或 ^ 指定清单，支持前缀匹配，不存在的清单不识别', () => {
    const lists = ['工作', '生活']
    expect(quickParse('写周报 ~工作', lists)).toMatchObject({ listName: '工作', title: '写周报' })
    expect(quickParse('买牛奶 ^生', lists).listName).toBe('生活')
    expect(quickParse('随便 ~学习', lists)).toMatchObject({ listName: undefined, title: '随便 ~学习' })
  })

  it('没有可识别内容时原样返回标题', () => {
    expect(quickParse('  整理  房间  ')).toMatchObject({ title: '整理 房间', dueDate: undefined, tags: [], spans: [] })
  })
})

describe('quickParse English', () => {
  it('tomorrow 3pm', () => {
    expect(quickParse('call mom tomorrow 3pm')).toMatchObject({ title: 'call mom', dueDate: '2026-11-19', dueTime: '15:00' })
  })
  it('next monday / in N days / weekday', () => {
    expect(quickParse('review next monday').dueDate).toBe('2026-11-23')
    expect(quickParse('dentist in 10 days').dueDate).toBe('2026-11-28')
    expect(quickParse('gym friday').dueDate).toBe('2026-11-20')
  })
  it('12am is midnight', () => {
    expect(quickParse('backup today 12am').dueTime).toBe('00:00')
  })
})
