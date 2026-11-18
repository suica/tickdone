import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { addDays, addMonths, format, getDay, isSameMonth, nextMonday, parseISO, startOfMonth } from 'date-fns'
import type { RepeatRule } from '../types'
import { fmt, repeatLabel, reminderLabel, todayStr } from '../dates'
import { useData } from '../store'
import { Icon } from './Icon'
import { Popover, anchorOf, type Anchor } from './Popover'
import './datepicker.css'

export interface DateValue {
  dueDate?: string
  dueTime?: string
  reminder?: number | null
  repeat?: RepeatRule | null
}

const WEEK_SHORT = ['日', '一', '二', '三', '四', '五', '六']

/* ---------- 本地标签函数 ---------- */

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 提醒文字。有时间时 reminder = 提前分钟数；
 * 全天任务时 reminder 以“到期日 00:00”为基准的提前分钟数，例如 -540 = 当天 09:00，900 = 提前 1 天 09:00。
 */
export function reminderText(m: number | null | undefined, hasTime: boolean): string {
  if (m == null) return '无'
  if (hasTime) {
    if (m === 0) return '准时'
    if (m > 0 && m % 10080 === 0) return `提前 ${m / 10080} 周`
    return reminderLabel(m)
  }
  const days = Math.max(0, Math.ceil(m / 1440))
  const tod = days * 1440 - m
  const hm = `${pad(Math.floor(tod / 60))}:${pad(tod % 60)}`
  if (days === 0) return `当天(${hm})`
  if (days % 7 === 0) return `提前 ${days / 7} 周(${hm})`
  return `提前 ${days} 天(${hm})`
}

export function repeatText(rule: RepeatRule | null | undefined, date?: string): string {
  if (!rule) return '无'
  const d = date ? parseISO(date) : new Date()
  switch (rule.kind) {
    case 'weekly':
      if (rule.days?.length) {
        const days = '周' + [...rule.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((x) => WEEK_SHORT[x]).join('、')
        return rule.interval === 1 ? `每${days}` : `每 ${rule.interval} 周（${days}）`
      }
      return repeatLabel(rule)
    case 'monthly':
      return rule.interval === 1 ? `每月（${d.getDate()}日）` : `每 ${rule.interval} 个月（${d.getDate()}日）`
    case 'yearly':
      return rule.interval === 1 ? `每年（${format(d, 'M月d日')}）` : `每 ${rule.interval} 年（${format(d, 'M月d日')}）`
    default:
      return repeatLabel(rule)
  }
}

/** 解析手输时间：9、930、0930、9:30、21：05 */
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

/* ---------- 组件 ---------- */

type Sub = { kind: 'time' | 'reminder' | 'repeat'; anchor: Anchor }

export function DatePicker({ anchor, value, onChange, onClose }: { anchor: Anchor; value: DateValue; onChange: (v: DateValue) => void; onClose: () => void }) {
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
      // 设置时间/提醒/重复但没有日期时，默认今天
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
  const weekHead = Array.from({ length: 7 }, (_, i) => WEEK_SHORT[(i + weekStartsOn) % 7])

  const hasTime = !!draft.dueTime
  const openSub = (kind: Sub['kind'], el: HTMLElement) => setSub((s) => (s?.kind === kind ? null : { kind, anchor: anchorOf(el) }))

  const setTime = (t: string | undefined) => {
    setDraft((d) => {
      const n: DateValue = { ...d, dueTime: t }
      if (t && !n.dueDate) n.dueDate = today
      // 有/无时间两种提醒口径不同：切换时重置；新设时间默认“准时”提醒
      if (!!t !== !!d.dueTime) n.reminder = t ? 0 : null
      return n
    })
  }

  const endLabel = rangeEnd && draft.dueDate && rangeEnd >= draft.dueDate ? rangeEnd : draft.dueDate

  return (
    <Popover anchor={anchor} onClose={onClose} width={260} className="dp">
      <div className="dp-seg">
        <button className={mode === 'date' ? 'on' : ''} onClick={() => setMode('date')}>
          日期
        </button>
        <button
          className={mode === 'range' ? 'on' : ''}
          onClick={() => {
            setMode('range')
            setRangeFocus('start')
          }}
        >
          时间段
        </button>
      </div>

      {mode === 'date' ? (
        <div className="dp-quick">
          <QuickBtn tip="今天" onClick={() => quick(new Date())}>
            <TodayGlyph day={new Date().getDate()} />
          </QuickBtn>
          <QuickBtn tip="明天" onClick={() => quick(addDays(new Date(), 1))}>
            <Icon name="sunrise" size={20} />
          </QuickBtn>
          <QuickBtn tip="下周一" onClick={() => quick(nextMonday(new Date()))}>
            <Icon name="nextWeek" size={20} />
          </QuickBtn>
          <QuickBtn tip="下个月" onClick={() => quick(addMonths(new Date(), 1))}>
            <Icon name="moon" size={20} />
          </QuickBtn>
        </div>
      ) : (
        <div className="dp-range">
          <button className={'dp-range-f' + (rangeFocus === 'start' ? ' on' : '')} onClick={() => setRangeFocus('start')}>
            <span className="dp-range-k">开始</span>
            {draft.dueDate ? format(parseISO(draft.dueDate), 'M月d日') : '选择日期'}
          </button>
          <span className="dp-range-sep">—</span>
          <button className={'dp-range-f' + (rangeFocus === 'end' ? ' on' : '')} onClick={() => setRangeFocus('end')}>
            <span className="dp-range-k">结束</span>
            {endLabel ? format(parseISO(endLabel), 'M月d日') : '选择日期'}
          </button>
        </div>
      )}

      <div className="dp-cal">
        <div className="dp-cal-head">
          <span className="dp-cal-title">{format(month, 'yyyy年M月')}</span>
          <button className="dp-nav" title="上个月" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <Icon name="chevronLeft" size={14} />
          </button>
          <button className="dp-nav" title="回到今天" onClick={() => setMonth(startOfMonth(new Date()))}>
            <span className="dp-dot" />
          </button>
          <button className="dp-nav" title="下个月" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
        <div className="dp-grid">
          {weekHead.map((w) => (
            <span key={w} className="dp-wd">
              {w}
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
          <Row icon="clock" label="时间" value={draft.dueTime ?? '无'} active={sub?.kind === 'time'} onClick={(el) => openSub('time', el)} onClear={hasTime ? () => setTime(undefined) : undefined} />
        )}
        <Row
          icon="bell"
          label="提醒"
          value={reminderText(draft.reminder, hasTime)}
          active={sub?.kind === 'reminder'}
          onClick={(el) => openSub('reminder', el)}
          onClear={draft.reminder != null ? () => patch({ reminder: null }) : undefined}
        />
        <Row
          icon="repeat"
          label="重复"
          value={repeatText(draft.repeat, draft.dueDate)}
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
          清除
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            onChange(mode === 'range' ? { ...draft, dueTime: undefined } : draft)
            onClose()
          }}
        >
          确定
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
              ? [
                  ['无', null],
                  ['准时', 0],
                  ['提前 5 分钟', 5],
                  ['提前 30 分钟', 30],
                  ['提前 1 小时', 60],
                  ['提前 1 天', 1440],
                ]
              : [
                  ['无', null],
                  ['当天(09:00)', -540],
                  ['提前 1 天(09:00)', 900],
                  ['提前 2 天(09:00)', 2340],
                  ['提前 3 天(09:00)', 3780],
                  ['提前 1 周(09:00)', 9540],
                ]
            ).map(([label, v]) => ({ label: label as string, checked: (draft.reminder ?? null) === v, onClick: () => patch({ reminder: v as number | null }) }))}
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

/* ---------- 子组件 ---------- */

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

function Row({ icon, label, value, active, onClick, onClear }: { icon: string; label: string; value: string; active?: boolean; onClick: (el: HTMLElement) => void; onClear?: () => void }) {
  return (
    <div className={'dp-row' + (active ? ' active' : '')} onClick={(e) => onClick(e.currentTarget)}>
      <Icon name={icon} size={16} className="dp-row-icon" />
      <span className="dp-row-label">{label}</span>
      <span className={'dp-row-val' + (value === '无' ? '' : ' set')}>{value}</span>
      {onClear && (
        <button
          className="dp-row-x"
          title="清除"
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
  const [text, setText] = useState(value ?? '')
  const [err, setErr] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    // 定位到选中时间（或最接近的半点），无值时定位到 09:00
    const base = value ?? '09:00'
    const [h, m] = base.split(':').map(Number)
    const idx = Math.min(47, h * 2 + (m >= 30 ? 1 : 0))
    const el = list.children[idx] as HTMLElement | undefined
    if (el) list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.offsetHeight / 2
  }, [value])

  const commit = () => {
    if (!text.trim()) return onPick(undefined)
    const t = parseTime(text)
    if (t) onPick(t)
    else setErr(true)
  }

  return (
    <div className="dp-time">
      <input
        className={'input dp-time-input' + (err ? ' err' : '')}
        autoFocus
        placeholder="输入时间，如 9:30"
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
        {TIMES.map((t) => (
          <div key={t} className={'dp-time-item' + (t === value ? ' sel' : '')} onClick={() => onPick(t)}>
            {t}
            {t === value && <span className="menu-check">✓</span>}
          </div>
        ))}
      </div>
      <div className="dp-sub-foot">
        <button className="btn" onClick={() => onPick(undefined)}>
          清除
        </button>
        <button className="btn btn-primary" onClick={commit}>
          确定
        </button>
      </div>
    </div>
  )
}

type Unit = 'daily' | 'weekly' | 'monthly' | 'yearly'
const UNIT_LABEL: Record<Unit, string> = { daily: '天', weekly: '周', monthly: '月', yearly: '年' }

function RepeatPanel({ value, date, weekStartsOn, onPick }: { value: RepeatRule | null; date: string; weekStartsOn: 0 | 1; onPick: (r: RepeatRule | null) => void }) {
  const d = parseISO(date)
  const dow = getDay(d)
  const presets: { label: string; rule: RepeatRule | null }[] = [
    { label: '无', rule: null },
    { label: '每天', rule: { kind: 'daily', interval: 1 } },
    { label: `每周（周${WEEK_SHORT[dow]}）`, rule: { kind: 'weekly', interval: 1, days: [dow] } },
    { label: `每月（${d.getDate()}日）`, rule: { kind: 'monthly', interval: 1 } },
    { label: `每年（${format(d, 'M月d日')}）`, rule: { kind: 'yearly', interval: 1 } },
    { label: '每个工作日（周一至周五）', rule: { kind: 'weekdays' } },
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
          <span className="menu-label">自定义</span>
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
        自定义重复
      </div>
      <div className="dp-custom-line">
        <span>每</span>
        <input className="input dp-custom-n" type="number" min={1} max={999} value={interval} onChange={(e) => setIntv(parseInt(e.target.value) || 1)} />
        <select className="input dp-custom-u" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
          {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => (
            <option key={u} value={u}>
              {UNIT_LABEL[u]}
            </option>
          ))}
        </select>
      </div>
      {unit === 'weekly' && (
        <div className="dp-custom-week">
          {order.map((i) => (
            <button key={i} className={wdays.includes(i) ? 'on' : ''} onClick={() => setWdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i]))}>
              {WEEK_SHORT[i]}
            </button>
          ))}
        </div>
      )}
      <div className="dp-custom-preview">{repeatText(build(), date)}</div>
      <div className="dp-sub-foot">
        <button className="btn" onClick={() => setCustom(false)}>
          取消
        </button>
        <button className="btn btn-primary" onClick={() => onPick(build())}>
          确定
        </button>
      </div>
    </div>
  )
}
