import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { addDays, addMonths, getDay, isSameMonth, nextMonday, parseISO, startOfMonth } from 'date-fns'
import type { RepeatRule } from '../types'
import { fmt, todayStr } from '../dates'
import { useData } from '../store'
import { useT, type MessageKey } from '../i18n'
import { fmtMonthDay, fmtMonthName, fmtMonthYear, fmtTime } from '../i18n/format'
import { daysInMonth, reanchor, sameRule, withDays } from '../repeat'
import { reminderText, repeatText, dayName, nthName } from './dateLabels'
import { Icon } from './Icon'
import { Popover, anchorOf, type Anchor } from './Popover'
import './datepicker.css'

export { reminderText, repeatText } from './dateLabels'

export interface DateValue {
  dueDate?: string
  dueTime?: string
  reminder?: number | null
  repeat?: RepeatRule | null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Parses a typed time: 9, 930, 0930, 9:30, 21：05 (full-width colon too). */
function parseTime(s: string): string | null {
  const t = s.trim()
  let h: number, m: number
  let mm = t.match(/^(\d{1,2})\s*[:：.]\s*(\d{1,2})$/)
  if (mm) {
    h = +mm[1]
    m = +mm[2]
  } else if ((mm = t.match(/^\d{1,4}$/))) {
    if (t.length <= 2) {
      h = +t
      m = 0
    } else {
      h = +t.slice(0, t.length - 2)
      m = +t.slice(-2)
    }
  } else return null
  if (h > 23 || m > 59) return null
  return `${pad(h)}:${pad(m)}`
}

/* ---------- component ---------- */

type Sub = { kind: 'time' | 'reminder' | 'repeat'; anchor: Anchor }

export function DatePicker({ anchor, value, onChange, onClose }: { anchor: Anchor; value: DateValue; onChange: (v: DateValue) => void; onClose: () => void }) {
  const t = useT()
  const weekStartsOn = useData().settings.weekStartsOn
  const [draft, setDraft] = useState<DateValue>(() => ({ ...value }))
  const [mode, setMode] = useState<'date' | 'range'>('date')
  const [rangeEnd, setRangeEnd] = useState<string | undefined>(value.dueDate)
  const [rangeFocus, setRangeFocus] = useState<'start' | 'end'>('start')
  const [month, setMonth] = useState(() => startOfMonth(value.dueDate ? parseISO(value.dueDate) : new Date()))
  const [sub, setSub] = useState<Sub | null>(null)

  const today = todayStr()
  const patch = (p: Partial<DateValue>) =>
    setDraft((d) => {
      const n = { ...d, ...p }
      // A rule that repeats the day of the date (weekly on its weekday, monthly on its day) follows a new date
      if (p.dueDate && n.repeat && !('repeat' in p)) n.repeat = reanchor(n.repeat, d.dueDate, p.dueDate)
      // Setting a time, reminder or repeat without a date picks today
      if (!n.dueDate && (n.dueTime || n.reminder != null || n.repeat)) n.dueDate = today
      return n
    })

  const quick = (date: Date) => {
    onChange({ ...draft, dueDate: fmt(date) })
    onClose()
  }

  const pickDay = (ds: string) => {
    if (mode === 'date') {
      patch({ dueDate: ds })
      return
    }
    if (rangeFocus === 'start' || !draft.dueDate) {
      patch({ dueDate: ds })
      if (rangeEnd && rangeEnd < ds) setRangeEnd(ds)
      setRangeFocus('end')
    } else {
      if (ds < draft.dueDate) {
        patch({ dueDate: ds })
      } else setRangeEnd(ds)
      setRangeFocus('start')
    }
  }

  const days = useMemo(() => {
    const offset = (getDay(month) - weekStartsOn + 7) % 7
    const start = addDays(month, -offset)
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [month, weekStartsOn])
  const weekHead = Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7)

  const hasTime = !!draft.dueTime
  const openSub = (kind: Sub['kind'], el: HTMLElement) => setSub((s) => (s?.kind === kind ? null : { kind, anchor: anchorOf(el) }))

  const setTime = (t: string | undefined) => {
    setDraft((d) => {
      const n: DateValue = { ...d, dueTime: t }
      if (t && !n.dueDate) n.dueDate = today
      // Reminders mean different things with and without a time: reset when switching; a new time defaults to "on time"
      if (!!t !== !!d.dueTime) n.reminder = t ? 0 : null
      return n
    })
  }

  const endLabel = rangeEnd && draft.dueDate && rangeEnd >= draft.dueDate ? rangeEnd : draft.dueDate

  return (
    <Popover anchor={anchor} onClose={onClose} width={260} className="dp">
      <div className="dp-seg">
        <button className={mode === 'date' ? 'on' : ''} onClick={() => setMode('date')}>
          {t('misc.date.modeDate')}
        </button>
        <button
          className={mode === 'range' ? 'on' : ''}
          onClick={() => {
            setMode('range')
            setRangeFocus('start')
          }}
        >
          {t('misc.date.modeRange')}
        </button>
      </div>

      {mode === 'date' ? (
        <div className="dp-quick">
          <QuickBtn tip={t('common.today')} onClick={() => quick(new Date())}>
            <TodayGlyph day={new Date().getDate()} />
          </QuickBtn>
          <QuickBtn tip={t('common.tomorrow')} onClick={() => quick(addDays(new Date(), 1))}>
            <Icon name="sunrise" size={20} />
          </QuickBtn>
          <QuickBtn tip={t('shell.menu.nextMonday')} onClick={() => quick(nextMonday(new Date()))}>
            <Icon name="nextWeek" size={20} />
          </QuickBtn>
          <QuickBtn tip={t('misc.date.inAMonth')} onClick={() => quick(addMonths(new Date(), 1))}>
            <Icon name="moon" size={20} />
          </QuickBtn>
        </div>
      ) : (
        <div className="dp-range">
          <button className={'dp-range-f' + (rangeFocus === 'start' ? ' on' : '')} onClick={() => setRangeFocus('start')}>
            <span className="dp-range-k">{t('misc.date.start')}</span>
            {draft.dueDate ? fmtMonthDay(parseISO(draft.dueDate)) : t('misc.date.pick')}
          </button>
          <span className="dp-range-sep">—</span>
          <button className={'dp-range-f' + (rangeFocus === 'end' ? ' on' : '')} onClick={() => setRangeFocus('end')}>
            <span className="dp-range-k">{t('misc.date.end')}</span>
            {endLabel ? fmtMonthDay(parseISO(endLabel)) : t('misc.date.pick')}
          </button>
        </div>
      )}

      <div className="dp-cal">
        <div className="dp-cal-head">
          <span className="dp-cal-title">{fmtMonthYear(month)}</span>
          <button className="dp-nav" title={t('calendar.nav.prevMonth')} onClick={() => setMonth((m) => addMonths(m, -1))}>
            <Icon name="chevronLeft" size={14} />
          </button>
          <button className="dp-nav" title={t('misc.goToday')} onClick={() => setMonth(startOfMonth(new Date()))}>
            <span className="dp-dot" />
          </button>
          <button className="dp-nav" title={t('calendar.nav.nextMonth')} onClick={() => setMonth((m) => addMonths(m, 1))}>
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
        <div className="dp-grid">
          {weekHead.map((w) => (
            <span key={w} className="dp-wd">
              {dayName(w)}
            </span>
          ))}
          {days.map((d) => {
            const ds = fmt(d)
            const sel = ds === draft.dueDate || (mode === 'range' && ds === endLabel)
            const inRange = mode === 'range' && draft.dueDate && endLabel && ds > draft.dueDate && ds < endLabel
            const cls = ['dp-day', isSameMonth(d, month) ? '' : 'out', ds === today ? 'today' : '', sel ? 'sel' : '', inRange ? 'in' : ''].join(' ')
            return (
              <button key={ds} className={cls} onClick={() => pickDay(ds)} onDoubleClick={() => mode === 'date' && (onChange({ ...draft, dueDate: ds }), onClose())}>
                <span>{d.getDate()}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="dp-rows">
        {mode === 'date' && (
          <Row icon="clock" label={t('misc.date.time')} value={draft.dueTime ? fmtTime(draft.dueTime) : t('misc.date.none')} set={hasTime} active={sub?.kind === 'time'} onClick={(el) => openSub('time', el)} onClear={hasTime ? () => setTime(undefined) : undefined} />
        )}
        <Row
          icon="bell"
          label={t('misc.date.reminder')}
          value={reminderText(draft.reminder, hasTime)}
          set={draft.reminder != null}
          active={sub?.kind === 'reminder'}
          onClick={(el) => openSub('reminder', el)}
          onClear={draft.reminder != null ? () => patch({ reminder: null }) : undefined}
        />
        <Row
          icon="repeat"
          label={t('misc.date.repeat')}
          value={repeatText(draft.repeat, draft.dueDate)}
          set={!!draft.repeat}
          active={sub?.kind === 'repeat'}
          onClick={(el) => openSub('repeat', el)}
          onClear={draft.repeat ? () => patch({ repeat: null }) : undefined}
        />
      </div>

      <div className="dp-foot">
        <button
          className="btn"
          onClick={() => {
            onChange({ dueDate: undefined, dueTime: undefined, reminder: null, repeat: null })
            onClose()
          }}
        >
          {t('misc.clear')}
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            onChange(mode === 'range' ? { ...draft, dueTime: undefined } : draft)
            onClose()
          }}
        >
          {t('common.ok')}
        </button>
      </div>

      {sub?.kind === 'time' && (
        <Popover anchor={sub.anchor} onClose={() => setSub(null)} width={226} className="dp-sub">
          <TimePanel
            value={draft.dueTime}
            onPick={(t) => {
              setTime(t)
              setSub(null)
            }}
          />
        </Popover>
      )}
      {sub?.kind === 'reminder' && (
        <Popover anchor={sub.anchor} onClose={() => setSub(null)} width={226} className="dp-sub">
          <OptionList
            options={(hasTime
              ? ([
                  [t('core.reminder.none'), null],
                  [t('core.reminder.onTime'), 0],
                  [t('core.reminder.minutesBefore', { count: 5 }), 5],
                  [t('core.reminder.minutesBefore', { count: 30 }), 30],
                  [t('core.reminder.hoursBefore', { count: 1 }), 60],
                  [t('core.reminder.daysBefore', { count: 1 }), 1440],
                ] as [string, number | null][])
              : [[t('core.reminder.none'), null] as [string, number | null], ...[-540, 900, 2340, 3780, 9540].map((v): [string, number | null] => [reminderText(v, false), v])]
            ).map(([label, v]) => ({ label, checked: (draft.reminder ?? null) === v, onClick: () => patch({ reminder: v }) }))}
            onDone={() => setSub(null)}
          />
        </Popover>
      )}
      {sub?.kind === 'repeat' && (
        <Popover anchor={sub.anchor} onClose={() => setSub(null)} width={290} className="dp-sub">
          <RepeatPanel
            value={draft.repeat ?? null}
            date={draft.dueDate ?? today}
            weekStartsOn={weekStartsOn}
            onPick={(r) => {
              patch({ repeat: r })
              setSub(null)
            }}
          />
        </Popover>
      )}
    </Popover>
  )
}

/* ---------- parts ---------- */

function QuickBtn({ tip, onClick, children }: { tip: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className="dp-qbtn" onClick={onClick}>
      {/* the glyph (a day number on Today) is decoration: the button is named by its tip */}
      <span aria-hidden="true">{children}</span>
      <span className="dp-tip">{tip}</span>
    </button>
  )
}

function TodayGlyph({ day }: { day: number }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 3v4M16 3v4" />
      <text x="12" y="17.2" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="currentColor" stroke="none">
        {day}
      </text>
    </svg>
  )
}

function Row({ icon, label, value, set, active, onClick, onClear }: { icon: string; label: string; value: string; set: boolean; active?: boolean; onClick: (el: HTMLElement) => void; onClear?: () => void }) {
  const t = useT()
  return (
    <div className={'dp-row' + (active ? ' active' : '')} onClick={(e) => onClick(e.currentTarget)}>
      <Icon name={icon} size={16} className="dp-row-icon" />
      <span className="dp-row-label">{label}</span>
      <span className={'dp-row-val' + (set ? ' set' : '')} title={value}>{value}</span>
      {onClear && (
        <button
          className="dp-row-x"
          title={t('misc.clear')}
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
        >
          <Icon name="close" size={12} />
        </button>
      )}
      <Icon name="chevronRight" size={14} className="dp-row-arrow" />
    </div>
  )
}

function OptionList({ options, onDone }: { options: { label: string; checked: boolean; onClick: () => void }[]; onDone: () => void }) {
  return (
    <div className="menu">
      {options.map((o) => (
        <div
          key={o.label}
          className={'menu-item' + (o.checked ? ' dp-checked' : '')}
          onClick={() => {
            o.onClick()
            onDone()
          }}
        >
          <span className="menu-label">{o.label}</span>
          {o.checked && <span className="menu-check">✓</span>}
        </div>
      ))}
    </div>
  )
}

const TIMES = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`)

function TimePanel({ value, onPick }: { value?: string; onPick: (t: string | undefined) => void }) {
  const t = useT()
  const [text, setText] = useState(value ?? '')
  const [err, setErr] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    // Scroll to the selected time (or the nearest half hour); 09:00 when there is none
    const base = value ?? '09:00'
    const [h, m] = base.split(':').map(Number)
    const idx = Math.min(47, h * 2 + (m >= 30 ? 1 : 0))
    const el = list.children[idx] as HTMLElement | undefined
    if (el) list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.offsetHeight / 2
  }, [value])

  const commit = () => {
    if (!text.trim()) return onPick(undefined)
    const parsed = parseTime(text)
    if (parsed) onPick(parsed)
    else setErr(true)
  }

  return (
    <div className="dp-time">
      <input
        className={'input dp-time-input' + (err ? ' err' : '')}
        autoFocus
        placeholder={t('misc.date.timePlaceholder')}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setErr(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      <div className="dp-time-list" ref={listRef}>
        {TIMES.map((hm) => (
          <div key={hm} className={'dp-time-item' + (hm === value ? ' sel' : '')} onClick={() => onPick(hm)}>
            {fmtTime(hm)}
            {hm === value && <span className="menu-check">✓</span>}
          </div>
        ))}
      </div>
      <div className="dp-sub-foot">
        <button className="btn" onClick={() => onPick(undefined)}>
          {t('misc.clear')}
        </button>
        <button className="btn btn-primary" onClick={commit}>
          {t('common.ok')}
        </button>
      </div>
    </div>
  )
}

type Unit = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays'
const UNIT_LABEL: Record<Exclude<Unit, 'weekdays'>, MessageKey> = { daily: 'misc.repeat.unit.daily', weekly: 'misc.repeat.unit.weekly', monthly: 'misc.repeat.unit.monthly', yearly: 'misc.repeat.unit.yearly' }
const NTH = [1, 2, 3, 4, -1]
const clampInt = (v: number, lo: number, hi: number, fb: number) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fb)

function RepeatPanel({ value, date, weekStartsOn, onPick }: { value: RepeatRule | null; date: string; weekStartsOn: 0 | 1; onPick: (r: RepeatRule | null) => void }) {
  const t = useT()
  const d = parseISO(date)
  const dow = getDay(d)
  const presets: { label: string; rule: RepeatRule | null }[] = [
    { label: t('core.repeat.none'), rule: null },
    { label: t('core.repeat.daily'), rule: { kind: 'daily', interval: 1 } },
    { label: t('core.repeat.weeklyOn', { days: dayName(dow, 'long') }), rule: { kind: 'weekly', interval: 1, days: [dow] } },
    { label: t('misc.repeat.monthlyOn', { day: d.getDate() }), rule: { kind: 'monthly', interval: 1, day: d.getDate() } },
    { label: t('misc.repeat.yearlyOn', { date: fmtMonthDay(d) }), rule: { kind: 'yearly', interval: 1, month: d.getMonth() + 1, day: d.getDate() } },
    { label: t('core.repeat.weekdays'), rule: { kind: 'weekdays' } },
  ]
  const isPreset = presets.some((p) => sameRule(p.rule, value))
  const [custom, setCustom] = useState(false)

  if (!custom)
    return (
      <div className="menu">
        {presets.map((p) => {
          const on = sameRule(p.rule, value)
          return (
            <div key={p.label} className={'menu-item' + (on ? ' dp-checked' : '')} onClick={() => onPick(p.rule)}>
              <span className="menu-label">{p.label}</span>
              {on && <span className="menu-check">✓</span>}
            </div>
          )
        })}
        <div className="menu-divider" />
        <div className={'menu-item dp-rep-custom' + (value && !isPreset ? ' dp-checked' : '')} onClick={() => setCustom(true)}>
          <span className="menu-label">{t('misc.repeat.custom')}</span>
          {value && !isPreset && <span className="menu-hint">{repeatText(value, date)}</span>}
          <span className="menu-hint">›</span>
        </div>
      </div>
    )
  return <RepeatEditor value={value} date={date} weekStartsOn={weekStartsOn} onBack={() => setCustom(false)} onPick={onPick} />
}

/** The custom repeat editor: frequency and interval, the days, how the series ends and where it counts from. */
function RepeatEditor({ value, date, weekStartsOn, onBack, onPick }: { value: RepeatRule | null; date: string; weekStartsOn: 0 | 1; onBack: () => void; onPick: (r: RepeatRule) => void }) {
  const t = useT()
  const d = parseISO(date)
  const dow = getDay(d)
  const init = value ? withDays(value, date) : null
  const [unit, setUnit] = useState<Unit>(init?.kind ?? 'weekly')
  const [interval, setIntv] = useState(init && init.kind !== 'weekdays' ? init.interval : 1)
  const [wdays, setWdays] = useState<number[]>(init?.kind === 'weekly' && init.days?.length ? init.days : [dow])
  const m = init?.kind === 'monthly' ? init : null
  const [monthMode, setMonthMode] = useState<'day' | 'nth'>(m?.nth != null ? 'nth' : 'day')
  const [mday, setMday] = useState(m?.day ?? d.getDate())
  const [nth, setNth] = useState(m?.nth ?? Math.min(4, Math.ceil(d.getDate() / 7)))
  const [nthWd, setNthWd] = useState(m?.weekday ?? dow)
  const y = init?.kind === 'yearly' ? init : null
  const [ymonth, setYmonth] = useState(y?.month ?? d.getMonth() + 1)
  const [yday, setYday] = useState(y?.day ?? d.getDate())
  const [endMode, setEndMode] = useState<'never' | 'count' | 'until'>(value?.count ? 'count' : value?.until ? 'until' : 'never')
  const [count, setCount] = useState(value?.count ?? 5)
  const [until, setUntil] = useState(value?.until ?? fmt(addMonths(d, 3)))
  const [from, setFrom] = useState<'due' | 'completion'>(value?.from ?? 'due')

  const order = Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7)
  const n = clampInt(interval, 1, 999, 1)
  const ydays = daysInMonth(2000, ymonth) // 2000 was a leap year: Feb 29 can be chosen

  const build = (): RepeatRule => {
    const opts = {
      ...(from === 'completion' ? { from } : {}),
      ...(endMode === 'count' ? { count: clampInt(count, 1, 999, 1), ...(value?.done ? { done: value.done } : {}) } : {}),
      ...(endMode === 'until' && until ? { until } : {}),
    }
    switch (unit) {
      case 'weekdays':
        return { kind: 'weekdays', ...opts }
      case 'daily':
        return { kind: 'daily', interval: n, ...opts }
      case 'weekly':
        return { kind: 'weekly', interval: n, days: wdays.length ? [...wdays].sort() : [dow], ...opts }
      case 'monthly':
        return monthMode === 'nth' ? { kind: 'monthly', interval: n, nth, weekday: nthWd, ...opts } : { kind: 'monthly', interval: n, day: mday, ...opts }
      case 'yearly':
        return { kind: 'yearly', interval: n, month: ymonth, day: Math.min(yday, ydays), ...opts }
    }
  }

  return (
    <div className="dp-custom dp-rep">
      <div className="dp-custom-title">
        <button className="dp-nav" onClick={onBack} aria-label={t('common.back')}>
          <Icon name="chevronLeft" size={14} />
        </button>
        {t('misc.repeat.customTitle')}
      </div>

      <div className="dp-custom-line">
        {unit !== 'weekdays' && (
          <>
            <span>{t('misc.repeat.every')}</span>
            <input className="input dp-custom-n" type="number" min={1} max={999} value={interval} aria-label={t('misc.repeat.every')} onChange={(e) => setIntv(parseInt(e.target.value) || 1)} />
          </>
        )}
        <select className="input dp-custom-u" value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label={t('misc.date.repeat')}>
          {(Object.keys(UNIT_LABEL) as (keyof typeof UNIT_LABEL)[]).map((u) => (
            <option key={u} value={u}>
              {t(UNIT_LABEL[u], { count: n })}
            </option>
          ))}
          <option value="weekdays">{t('misc.repeat.unit.weekdays')}</option>
        </select>
      </div>

      {unit === 'weekly' && (
        <div className="dp-custom-week" role="group" aria-label={t('misc.repeat.on')}>
          {order.map((i) => (
            <button key={i} className={wdays.includes(i) ? 'on' : ''} aria-pressed={wdays.includes(i)} aria-label={dayName(i, 'long')} onClick={() => setWdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i]))}>
              {dayName(i, 'narrow')}
            </button>
          ))}
        </div>
      )}

      {unit === 'monthly' && (
        <div className="dp-rep-block" role="radiogroup">
          <label className="dp-rep-opt">
            <input type="radio" name="dp-month-mode" checked={monthMode === 'day'} onChange={() => setMonthMode('day')} />
            <span className="dp-rep-k">{t('misc.repeat.onDay')}</span>
            <select className="input dp-rep-sel dp-rep-mday" aria-label={t('misc.repeat.onDay')} value={mday} onChange={(e) => (setMday(+e.target.value), setMonthMode('day'))}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
              <option value={-1}>{t('misc.repeat.lastDay')}</option>
            </select>
          </label>
          <label className="dp-rep-opt">
            <input type="radio" name="dp-month-mode" checked={monthMode === 'nth'} onChange={() => setMonthMode('nth')} />
            <span className="dp-rep-k">{t('misc.repeat.onThe')}</span>
            <select className="input dp-rep-sel dp-rep-nth" aria-label={t('misc.repeat.onThe')} value={nth} onChange={(e) => (setNth(+e.target.value), setMonthMode('nth'))}>
              {NTH.map((x) => (
                <option key={x} value={x}>
                  {nthName(x)}
                </option>
              ))}
            </select>
            <select className="input dp-rep-sel dp-rep-nthwd" aria-label={t('misc.repeat.onThe')} value={nthWd} onChange={(e) => (setNthWd(+e.target.value), setMonthMode('nth'))}>
              {order.map((x) => (
                <option key={x} value={x}>
                  {dayName(x, 'long')}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {unit === 'yearly' && (
        <div className="dp-rep-block">
          <div className="dp-rep-opt">
            <span className="dp-rep-k">{t('misc.repeat.on')}</span>
            <select className="input dp-rep-sel dp-rep-month" value={ymonth} onChange={(e) => setYmonth(+e.target.value)} aria-label={t('misc.repeat.on')}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((x) => (
                <option key={x} value={x}>
                  {fmtMonthName(x)}
                </option>
              ))}
            </select>
            <select className="input dp-rep-sel dp-rep-yday" aria-label={t('misc.repeat.on')} value={Math.min(yday, ydays)} onChange={(e) => setYday(+e.target.value)}>
              {Array.from({ length: ydays }, (_, i) => i + 1).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="dp-rep-block">
        <div className="dp-rep-opt">
          <span className="dp-rep-k">{t('misc.repeat.ends')}</span>
          <select className="input dp-rep-sel dp-rep-end" value={endMode} onChange={(e) => setEndMode(e.target.value as typeof endMode)} aria-label={t('misc.repeat.ends')}>
            <option value="never">{t('misc.repeat.end.never')}</option>
            <option value="count">{t('misc.repeat.end.count')}</option>
            <option value="until">{t('misc.repeat.end.until')}</option>
          </select>
        </div>
        {endMode === 'count' && (
          <div className="dp-rep-opt dp-rep-sub">
            <input className="input dp-custom-n dp-rep-count" type="number" min={1} max={999} value={count} aria-label={t('misc.repeat.end.count')} onChange={(e) => setCount(parseInt(e.target.value) || 1)} />
            <span>{t('misc.repeat.end.times', { count: clampInt(count, 1, 999, 1) })}</span>
          </div>
        )}
        {endMode === 'until' && (
          <div className="dp-rep-opt dp-rep-sub">
            <input className="input dp-rep-until" type="date" min={date} value={until} aria-label={t('misc.repeat.end.until')} onChange={(e) => setUntil(e.target.value)} />
          </div>
        )}
        <div className="dp-rep-opt">
          <span className="dp-rep-k">{t('misc.repeat.from')}</span>
          <select className="input dp-rep-sel dp-rep-from" value={from} onChange={(e) => setFrom(e.target.value as typeof from)} aria-label={t('misc.repeat.from')}>
            <option value="due">{t('misc.repeat.from.due')}</option>
            <option value="completion">{t('misc.repeat.from.completion')}</option>
          </select>
        </div>
      </div>

      <div className="dp-custom-preview" aria-live="polite" aria-label={t('misc.repeat.summary')}>
        {repeatText(build(), date)}
      </div>
      <div className="dp-sub-foot">
        <button className="btn" onClick={onBack}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" onClick={() => onPick(build())}>
          {t('common.ok')}
        </button>
      </div>
    </div>
  )
}
