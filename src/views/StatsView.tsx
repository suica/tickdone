import { useMemo, useState, type ReactNode } from 'react'
import { addDays, format, parseISO, startOfDay } from 'date-fns'
import { t as tr, useT, type MessageKey } from '../i18n'
import { fmtDateRange, fmtDayNum, fmtHour, fmtMonthDay, fmtMonthShort, fmtMonthYear, fmtNumber, fmtPercent, fmtTime, fmtWeekday, fmtWeekdayDate, fmtYear } from '../i18n/format'
import { Icon } from '../components/Icon'
import { useData } from '../store'
import { PRIORITY } from '../views'
import {
  bucketsOf,
  focusStats,
  granularityOf,
  habitStats,
  niceTicks,
  periodRange,
  rangeDays,
  shiftPeriod,
  taskStats,
  type Bucket,
  type DateRange,
  type Granularity,
  type RangeKind,
} from '../stats'
import type { AppData } from '../types'
import { BarChart, BarList, Donut, Ring, type Bar, type Slice } from './statsCharts'
import { fmtDur } from './focusFormat'
import './stats.css'

const KINDS: { id: RangeKind; name: MessageKey }[] = [
  { id: 'week', name: 'stats.range.week' },
  { id: 'month', name: 'stats.range.month' },
  { id: 'year', name: 'stats.range.year' },
  { id: 'last30', name: 'stats.range.last30' },
  { id: 'custom', name: 'stats.range.custom' },
]
const RANGE_KEY = 'tickdone:stats:range'
const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

function loadKind(): RangeKind {
  try {
    const v = localStorage.getItem(RANGE_KEY) as RangeKind | null
    if (v && KINDS.some((k) => k.id === v)) return v
  } catch {
    /* storage unavailable */
  }
  return 'week'
}

/** The heading of the shown period: "Nov 16 – 22, 2026", "November 2026", "2026". */
function periodLabel(kind: RangeKind, r: DateRange) {
  if (kind === 'month') return fmtMonthYear(r.start)
  if (kind === 'year') return fmtYear(r.start)
  return fmtDateRange(r.start, r.end)
}

/** The label under a bar and the title of its tooltip. */
function bucketLabels(b: Bucket, g: Granularity, short: boolean) {
  if (g === 'day') return { label: short ? fmtWeekday(b.start) : fmtDayNum(b.start), title: fmtWeekdayDate(b.start) }
  if (g === 'week') return { label: fmtMonthDay(b.start), title: fmtDateRange(b.start, b.end) }
  return { label: fmtMonthShort(b.start), title: fmtMonthYear(b.start) }
}

const LIST_FALLBACK = ['#4CA1FF', '#35D870', '#FFAC38', '#B37FEB', '#FF83C3', '#FF6161', '#6E75F4', '#9C9C9C']

function listInfo(d: AppData, id: string, i: number) {
  if (id === 'inbox') return { name: tr('common.list.inbox'), color: 'var(--primary)' }
  const l = d.lists.find((x) => x.id === id)
  return { name: l?.name ?? tr('stats.list.deleted'), color: l?.color ?? LIST_FALLBACK[i % LIST_FALLBACK.length] }
}

function Tile({ label, value, unit, sub, ring, tone }: { label: string; value: string; unit?: string; sub?: string; ring?: ReactNode; tone?: 'danger' }) {
  return (
    <div className={'stats-tile' + (tone ? ' ' + tone : '')}>
      <div className="stats-tile-body">
        <div className="stats-tile-label">{label}</div>
        <div className="stats-tile-value">
          {value}
          {unit && <small>{unit}</small>}
        </div>
        {sub && <div className="stats-tile-sub">{sub}</div>}
      </div>
      {ring}
    </div>
  )
}

function Card({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={'stats-card' + (wide ? ' wide' : '')}>
      <h4 className="stats-card-title">{title}</h4>
      {children}
    </div>
  )
}

const Empty = ({ text }: { text?: string }) => <div className="stats-empty">{text ?? tr('stats.empty')}</div>

export default function StatsView() {
  const t = useT()
  const data = useData()
  const ws = data.settings.weekStartsOn
  // The moment the view opened: stats count up to it.
  const [now] = useState(() => new Date())
  const today = startOfDay(now)
  const [kind, setKindState] = useState<RangeKind>(loadKind)
  const [anchor, setAnchor] = useState(today)
  const [custom, setCustom] = useState<DateRange>(() => ({ start: addDays(today, -13), end: today }))

  const setKind = (k: RangeKind) => {
    setKindState(k)
    setAnchor(today)
    try {
      localStorage.setItem(RANGE_KEY, k)
    } catch {
      /* storage unavailable */
    }
  }

  const range = useMemo(() => periodRange(kind, anchor, ws, custom), [kind, anchor, ws, custom])
  const g = granularityOf(range)
  const buckets = useMemo(() => bucketsOf(range, g, ws), [range, g, ws])
  const ts = useMemo(() => taskStats(data, range, ws, now), [data, range, ws, now])
  const fs = useMemo(() => focusStats(data.focus, data.tasks, range, ws, now), [data, range, ws, now])
  const hs = useMemo(() => habitStats(data.habits, range, ws, now), [data, range, ws, now])
  // Charts are keyed by the range, so they animate in again when it changes.
  const animKey = kind + fmt(range.start) + fmt(range.end)
  const short = rangeDays(range) <= 7
  const labels = buckets.map((b) => bucketLabels(b, g, short))
  const isCurrent = kind === 'custom' || (range.start <= today && today <= range.end)

  /** "9:00 AM – 10:00 AM" for the hour starting at `h`. */
  const hourSpan = (h: number) => t('calendar.timeRange', { start: fmtTime(`${String(h).padStart(2, '0')}:00`), end: fmtTime(`${String((h + 1) % 24).padStart(2, '0')}:00`) })
  const completedBars: Bar[] = ts.series.map((v, i) => ({ label: labels[i].label, tipTitle: labels[i].title, value: v, tip: t('stats.tip.tasks', { count: v, n: fmtNumber(v) }) }))
  const focusBars: Bar[] = fs.series.map((v, i) => ({ label: labels[i].label, tipTitle: labels[i].title, value: v, tip: fmtDur(v) }))
  const hourBars: Bar[] = fs.hours.map((v, h) => ({
    label: fmtHour(h),
    tipTitle: hourSpan(h),
    value: v,
    tip: fmtDur(v),
  }))
  const habitBars: Bar[] = hs.series.map((v, i) => ({ label: labels[i].label, tipTitle: labels[i].title, value: v, tip: v === null ? t('stats.tip.none') : fmtPercent(v) }))

  const listSlices: Slice[] = ts.byList.map((c, i) => {
    const l = listInfo(data, c.key, i)
    return { key: c.key, label: l.name, color: l.color, value: c.count, text: fmtNumber(c.count) }
  })
  const prioritySlices: Slice[] = ts.byPriority.map((c) => {
    const p = PRIORITY.find((x) => x.v === c.key)!
    return { key: String(c.key), label: t(p.name), color: p.color, value: c.count, text: fmtNumber(c.count) }
  })
  const focusListSlices: Slice[] = fs.byList.map((c, i) => {
    const l = listInfo(data, c.key, i)
    return { key: c.key, label: l.name, color: l.color, value: c.ms, text: fmtDur(c.ms) }
  })
  const taskTitle = (id: string) => {
    if (!id) return t('stats.focus.noTask')
    const task = data.tasks.find((x) => x.id === id)
    return task ? task.title || t('common.untitled') : t('misc.focus.taskDeleted')
  }
  const maxOf = (xs: (number | null)[]) => Math.max(0, ...xs.map((x) => x ?? 0))

  return (
    <div className="module stats-module">
      <div className="stats-main">
        <header className="stats-head">
          <h2>{t('common.module.stats')}</h2>
          <div className="stats-seg" role="group" aria-label={t('stats.range.label')}>
            {KINDS.map((k) => (
              <button key={k.id} className={kind === k.id ? 'on' : undefined} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
                {t(k.name)}
              </button>
            ))}
          </div>
        </header>
        <div className="stats-period">
          {kind === 'custom' ? (
            <div className="stats-custom">
              <label>
                <span>{t('stats.range.from')}</span>
                <input type="date" value={fmt(custom.start)} max={fmt(custom.end)} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, start: parseISO(e.target.value) }))} />
              </label>
              <label>
                <span>{t('stats.range.to')}</span>
                <input type="date" value={fmt(custom.end)} min={fmt(custom.start)} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, end: parseISO(e.target.value) }))} />
              </label>
            </div>
          ) : (
            <>
              <button className="icon-btn" title={t('stats.range.prev')} aria-label={t('stats.range.prev')} onClick={() => setAnchor((a) => shiftPeriod(kind, a, -1))}>
                <Icon name="chevronLeft" size={18} />
              </button>
              <span className="stats-period-label">{periodLabel(kind, range)}</span>
              <button className="icon-btn" title={t('stats.range.next')} aria-label={t('stats.range.next')} disabled={range.end >= today} onClick={() => setAnchor((a) => shiftPeriod(kind, a, 1))}>
                <Icon name="chevronRight" size={18} />
              </button>
              {!isCurrent && (
                <button className="stats-now" onClick={() => setAnchor(today)}>
                  {t('misc.goToday')}
                </button>
              )}
            </>
          )}
        </div>

        <div className="stats-scroll" key={animKey} tabIndex={0}>
          <section className="stats-section stats-tasks">
            <h3 className="stats-h">{t('common.module.tasks')}</h3>
            <div className="stats-tiles">
              <Tile label={t('stats.tasks.completed')} value={fmtNumber(ts.completed)} />
              <Tile
                label={t('stats.tasks.rate')}
                value={ts.rate === null ? '–' : fmtPercent(ts.rate)}
                sub={ts.rate === null ? t('stats.tasks.rateNone') : t('stats.tasks.rateHint', { done: fmtNumber(ts.dueDone), due: fmtNumber(ts.due) })}
                ring={<Ring share={ts.rate} />}
              />
              <Tile label={t('stats.tasks.overdue')} value={fmtNumber(ts.overdue)} sub={t('stats.tasks.overdueHint')} tone={ts.overdue ? 'danger' : undefined} />
              <Tile
                label={t('stats.tasks.streak')}
                value={fmtNumber(ts.streak)}
                unit={t('stats.unit.days', { count: ts.streak })}
                sub={t('stats.tasks.streakHint', { days: t('stats.days', { count: ts.bestStreak }) })}
              />
            </div>
            <div className="stats-grid">
              <Card title={t('stats.tasks.chart')} wide>
                <BarChart bars={completedBars} ticks={niceTicks(maxOf(ts.series))} fmtTick={fmtNumber} label={t('stats.tasks.chart')} />
              </Card>
              <Card title={t('stats.byList')}>{listSlices.length ? <Donut slices={listSlices} total={fmtNumber(ts.completed)} label={t('stats.byList')} /> : <Empty />}</Card>
              <Card title={t('stats.byPriority')}>
                {prioritySlices.length ? <Donut slices={prioritySlices} total={fmtNumber(ts.completed)} label={t('stats.byPriority')} /> : <Empty />}
              </Card>
              {ts.byTag.length > 0 && (
                <Card title={t('stats.byTag')}>
                  <BarList
                    rows={ts.byTag.map((c) => ({ key: c.key, label: '#' + c.key, value: c.count, text: fmtNumber(c.count), color: data.tags.find((x) => x.name === c.key)?.color }))}
                  />
                </Card>
              )}
            </div>
          </section>

          <section className="stats-section stats-focus">
            <h3 className="stats-h">{t('common.module.focus')}</h3>
            <div className="stats-tiles">
              <Tile label={t('stats.focus.time')} value={fmtDur(fs.totalMs)} sub={t('stats.focus.dailyAvg', { time: fmtDur(fs.dailyAvgMs) })} />
              <Tile label={t('stats.focus.sessions')} value={fmtNumber(fs.sessions)} />
              <Tile label={t('stats.focus.bestTime')} value={fs.bestHour === null ? '–' : fmtHour(fs.bestHour)} sub={fs.bestHour === null ? undefined : hourSpan(fs.bestHour)} />
            </div>
            <div className="stats-grid">
              <Card title={t('stats.focus.time')} wide>
                <BarChart bars={focusBars} ticks={niceTicks(maxOf(fs.series), 'ms')} fmtTick={fmtDur} label={t('stats.focus.time')} />
              </Card>
              <Card title={t('stats.focus.hours')} wide>
                <BarChart bars={hourBars} ticks={niceTicks(maxOf(fs.hours), 'ms')} fmtTick={fmtDur} label={t('stats.focus.hours')} height={140} />
              </Card>
              <Card title={t('stats.byTask')}>
                {fs.byTask.length ? (
                  <BarList rows={fs.byTask.map((c) => ({ key: c.key || '-', label: taskTitle(c.key), value: c.ms, text: fmtDur(c.ms) }))} />
                ) : (
                  <Empty text={t('stats.focus.none')} />
                )}
              </Card>
              <Card title={t('stats.byList')}>
                {focusListSlices.length ? <Donut slices={focusListSlices} total={fmtDur(fs.byList.reduce((s, x) => s + x.ms, 0))} label={t('stats.byList')} /> : <Empty text={t('stats.focus.none')} />}
              </Card>
            </div>
          </section>

          <section className="stats-section stats-habits">
            <h3 className="stats-h">{t('common.module.habits')}</h3>
            <div className="stats-tiles">
              <Tile
                label={t('stats.habits.rate')}
                value={hs.rate === null ? '–' : fmtPercent(hs.rate)}
                sub={t('stats.habits.rateHint', { checked: fmtNumber(hs.checked), planned: fmtNumber(Math.round(hs.planned)) })}
                ring={<Ring share={hs.rate} color="var(--swipe-green)" />}
              />
              <Tile label={t('stats.habits.checkins')} value={fmtNumber(hs.checked)} />
            </div>
            <div className="stats-grid">
              <Card title={t('stats.habits.trend')} wide>
                <BarChart bars={habitBars} ticks={niceTicks(1, 'ratio')} fmtTick={fmtPercent} label={t('stats.habits.trend')} />
              </Card>
              <Card title={t('stats.habits.streaks')} wide>
                {hs.habits.length ? (
                  <table className="stats-habits-table">
                    <thead>
                      <tr>
                        <th />
                        <th>{t('stats.habits.current')}</th>
                        <th>{t('stats.habits.best')}</th>
                        <th>{t('stats.habits.rate')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hs.habits.map((row) => (
                        <tr key={row.habit.id}>
                          <td>
                            <span className="stats-habit-name">
                              <span className="stats-habit-icon" style={{ background: row.habit.color + '26' }}>
                                {row.habit.icon}
                              </span>
                              <span>{row.habit.name}</span>
                            </span>
                          </td>
                          <td>{t('stats.days', { count: row.streak })}</td>
                          <td>{t('stats.days', { count: row.best })}</td>
                          <td>{row.rate === null ? '–' : fmtPercent(row.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty text={t('stats.habits.none')} />
                )}
              </Card>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
