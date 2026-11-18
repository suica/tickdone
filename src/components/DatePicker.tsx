import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { addDays, addMonths, getDay, isSameMonth, nextMonday, parseISO, startOfMonth } from 'date-fns'
import type { RepeatRule } from '../types'
import { fmt, todayStr } from '../dates'
import { useData } from '../store'
import { useT, type MessageKey } from '../i18n'
import { fmtMonthDay, fmtMonthYear, fmtTime } from '../i18n/format'
import { reminderText, repeatText, dayName } from './dateLabels'
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

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

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
        <Popover anchor={sub.anchor} onClose={() => setSub(null)} width={240} className="dp-sub">
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
    <button className="dp-qbtn" onClick={onClick} aria-label={tip}>
      {children}
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

type Unit = 'daily' | 'weekly' | 'monthly' | 'yearly'
const UNIT_LABEL: Record<Unit, MessageKey> = { daily: 'misc.repeat.unit.daily', weekly: 'misc.repeat.unit.weekly', monthly: 'misc.repeat.unit.monthly', yearly: 'misc.repeat.unit.yearly' }

function RepeatPanel({ value, date, weekStartsOn, onPick }: { value: RepeatRule | null; date: string; weekStartsOn: 0 | 1; onPick: (r: RepeatRule | null) => void }) {
  const t = useT()
  const d = parseISO(date)
  const dow = getDay(d)
  const presets: { label: string; rule: RepeatRule | null }[] = [
    { label: t('core.repeat.none'), rule: null },
    { label: t('core.repeat.daily'), rule: { kind: 'daily', interval: 1 } },
    { label: t('core.repeat.weeklyOn', { days: dayName(dow, 'long') }), rule: { kind: 'weekly', interval: 1, days: [dow] } },
    { label: t('misc.repeat.monthlyOn', { day: d.getDate() }), rule: { kind: 'monthly', interval: 1 } },
    { label: t('misc.repeat.yearlyOn', { date: fmtMonthDay(d) }), rule: { kind: 'yearly', interval: 1 } },
    { label: t('core.repeat.weekdays'), rule: { kind: 'weekdays' } },
  ]
  const isPreset = presets.some((p) => same(p.rule, value))
  const [custom, setCustom] = useState(false)
  const init = value && value.kind !== 'weekdays' ? value : null
  const [interval, setIntv] = useState(init?.interval ?? 1)
  const [unit, setUnit] = useState<Unit>((init?.kind as Unit) ?? 'weekly')
  const [wdays, setWdays] = useState<number[]>(init?.kind === 'weekly' && init.days?.length ? init.days : [dow])

  if (!custom)
    return (
      <div className="menu">
        {presets.map((p) => {
          const on = same(p.rule, value)
          return (
            <div key={p.label} className={'menu-item' + (on ? ' dp-checked' : '')} onClick={() => onPick(p.rule)}>
              <span className="menu-label">{p.label}</span>
              {on && <span className="menu-check">✓</span>}
            </div>
          )
        })}
        <div className="menu-divider" />
        <div className={'menu-item' + (value && !isPreset ? ' dp-checked' : '')} onClick={() => setCustom(true)}>
          <span className="menu-label">{t('misc.repeat.custom')}</span>
          {value && !isPreset && <span className="menu-hint">{repeatText(value, date)}</span>}
          <span className="menu-hint">›</span>
        </div>
      </div>
    )

  const order = Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7)
  const build = (): RepeatRule => {
    const n = Math.max(1, Math.min(999, interval || 1))
    if (unit === 'weekly') return { kind: 'weekly', interval: n, days: wdays.length ? [...wdays].sort() : [dow] }
    return { kind: unit, interval: n }
  }

  return (
    <div className="dp-custom">
      <div className="dp-custom-title">
        <button className="dp-nav" onClick={() => setCustom(false)}>
          <Icon name="chevronLeft" size={14} />
        </button>
        {t('misc.repeat.customTitle')}
      </div>
      <div className="dp-custom-line">
        <span>{t('misc.repeat.every')}</span>
        <input className="input dp-custom-n" type="number" min={1} max={999} value={interval} onChange={(e) => setIntv(parseInt(e.target.value) || 1)} />
        <select className="input dp-custom-u" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
          {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => (
            <option key={u} value={u}>
              {t(UNIT_LABEL[u], { count: interval })}
            </option>
          ))}
        </select>
      </div>
      {unit === 'weekly' && (
        <div className="dp-custom-week">
          {order.map((i) => (
            <button key={i} className={wdays.includes(i) ? 'on' : ''} onClick={() => setWdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i]))}>
              {dayName(i)}
            </button>
          ))}
        </div>
      )}
      <div className="dp-custom-preview">{repeatText(build(), date)}</div>
      <div className="dp-sub-foot">
        <button className="btn" onClick={() => setCustom(false)}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" onClick={() => onPick(build())}>
          {t('common.ok')}
        </button>
      </div>
    </div>
  )
}
