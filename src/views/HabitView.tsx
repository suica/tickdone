import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { addDays, addMonths, addWeeks, endOfMonth, getDay, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { getData, LIST_COLORS, playDing, setData, setUI, toast, toggleCheckin, upsertHabit, useData, useUI } from '../store'
import { fmt, todayStr } from '../dates'
import { usePhone, useTablet } from '../viewport'
import { Icon } from '../components/Icon'
import { anchorOf, MenuList, Popover, type Anchor } from '../components/Popover'
import { bounce, burst, dur, ease, shrink, usePresence, useSwipe } from '../components/motion'
import { NumberRoll, SlideSwap } from '../components/Anim'
import { habitDragStart, sectionName } from './habitDrag'
import { weekdayList, dayName } from '../components/dateLabels'
import { t, useT, type MessageKey } from '../i18n'
import { fmtMonthYear, fmtTime } from '../i18n/format'
import type { Habit, HabitFrequency, HabitSection } from '../types'
import './habit.css'

const SECTIONS: HabitSection[] = ['morning', 'afternoon', 'night', 'other']
const EMOJIS = [
  '✅', '🌅', '💧', '📖', '🏃', '🧘', '😴', '🍎', '🥗', '💪', '🚴', '🏊',
  '✍️', '📝', '🎹', '🎸', '🎨', '📷', '💊', '🦷', '🧹', '🌱', '🐶', '☕',
  '🚭', '🍵', '🥛', '🍳', '📚', '💻', '🧠', '🗣️', '❤️', '😊', '🙏', '💰',
  '⏰', '🌙', '☀️', '🎯', '🏋️', '⚽', '🧗', '🚶', '📵', '🎧', '🛏️', '⭐',
]
const COLORS = [...LIST_COLORS.slice(0, 9), '#4772FA']

type TemplateId = 'earlyRise' | 'water' | 'breakfast' | 'read' | 'exercise' | 'meditate' | 'sleepEarly' | 'fruit' | 'language' | 'journal' | 'lessPhone' | 'skincare'
interface Template {
  id: TemplateId
  icon: string
  color: string
  section: HabitSection
}
const TEMPLATES: Template[] = [
  { id: 'earlyRise', icon: '🌅', color: '#FFAC38', section: 'morning' },
  { id: 'water', icon: '💧', color: '#4CA1FF', section: 'other' },
  { id: 'breakfast', icon: '🍳', color: '#FFD324', section: 'morning' },
  { id: 'read', icon: '📖', color: '#6E75F4', section: 'night' },
  { id: 'exercise', icon: '🏃', color: '#35D870', section: 'afternoon' },
  { id: 'meditate', icon: '🧘', color: '#B37FEB', section: 'morning' },
  { id: 'sleepEarly', icon: '😴', color: '#6E75F4', section: 'night' },
  { id: 'fruit', icon: '🍎', color: '#FF6161', section: 'afternoon' },
  { id: 'language', icon: '🗣️', color: '#FF83C3', section: 'night' },
  { id: 'journal', icon: '✍️', color: '#9C9C9C', section: 'night' },
  { id: 'lessPhone', icon: '📵', color: '#FF6161', section: 'other' },
  { id: 'skincare', icon: '😊', color: '#FF83C3', section: 'night' },
]
const tplName = (tp: Template) => t(`misc.habit.tpl.${tp.id}` as MessageKey)
const tplMotto = (tp: Template) => t(`misc.habit.tpl.${tp.id}.motto` as MessageKey)

/** Fills a message whose `{name}` placeholders are React nodes (e.g. animated numbers). */
function withNodes(text: string, nodes: Record<string, ReactNode>): ReactNode {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part)
    return m && m[1] in nodes ? <span key={i}>{nodes[m[1]]}</span> : part
  })
}

// ---------------- stats ----------------
const freqOf = (h: Habit): HabitFrequency => h.frequency ?? { kind: 'daily' }

/** Whether the habit is planned for that day */
function scheduled(h: Habit, d: Date): boolean {
  const f = freqOf(h)
  if (f.kind === 'days') return f.days.length === 0 || f.days.includes(getDay(d))
  return true
}

function currentStreak(h: Habit): number {
  let d = new Date()
  // Not checked in yet today doesn't break the streak
  if (!h.checkins[fmt(d)]) d = addDays(d, -1)
  let n = 0
  for (let i = 0; i < 3660; i++) {
    const k = fmt(d)
    if (h.checkins[k]) n++
    else if (scheduled(h, d)) break
    d = addDays(d, -1)
  }
  return n
}

function longestStreak(h: Habit): number {
  const keys = Object.keys(h.checkins).sort()
  if (!keys.length) return 0
  let d = parseISO(keys[0])
  const end = parseISO(keys[keys.length - 1])
  let best = 0
  let cur = 0
  while (d <= end) {
    if (h.checkins[fmt(d)]) {
      cur++
      best = Math.max(best, cur)
    } else if (scheduled(h, d)) cur = 0
    d = addDays(d, 1)
  }
  return best
}

const totalDays = (h: Habit) => Object.keys(h.checkins).length

function monthStats(h: Habit, month: Date) {
  const start = startOfMonth(month)
  const end = endOfMonth(month)
  const today = new Date()
  let checked = 0
  let plan = 0
  const created = new Date(h.createdAt)
  created.setHours(0, 0, 0, 0)
  const firstCheck = Object.keys(h.checkins).sort()[0]
  const from = firstCheck && parseISO(firstCheck) < created ? parseISO(firstCheck) : created
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const k = fmt(d)
    if (h.checkins[k]) checked++
    if (d <= today && d >= from && scheduled(h, d)) plan++
  }
  const f = freqOf(h)
  if (f.kind === 'weekly') plan = Math.max(1, Math.round((plan / 7) * f.times))
  const rate = plan ? Math.min(100, Math.round((checked / plan) * 100)) : 0
  return { checked, rate }
}

function weekCount(h: Habit, day: Date, weekStartsOn: 0 | 1) {
  const s = startOfWeek(day, { weekStartsOn })
  let n = 0
  for (let i = 0; i < 7; i++) if (h.checkins[fmt(addDays(s, i))]) n++
  return n
}

function freqLabel(f: HabitFrequency): string {
  if (f.kind === 'daily') return t('misc.habit.freq.daily')
  if (f.kind === 'weekly') return t('misc.habit.freq.weekly', { count: f.times })
  if (f.days.length === 7) return t('misc.habit.freq.daily')
  return t('misc.habit.freq.days', { days: weekdayList(f.days) })
}

// ---------------- main view ----------------
export default function HabitView() {
  const t = useT()
  const data = useData()
  const ui = useUI()
  const phone = usePhone()
  const tablet = useTablet()
  // Phones and tablets: the detail slides over the list (full screen on phones) instead of taking a column
  const overlay = phone || tablet
  const weekStartsOn = data.settings.weekStartsOn
  const today = todayStr()
  const [day, setDay] = useState(today)
  const [selId, setSelId] = useState<string | undefined>()
  const [editing, setEditing] = useState<{ habit?: Habit } | null>(null)
  const [dialog, dialogClosing] = usePresence(editing)

  // Other modules can open the edit dialog with setUI({ dialog: { kind: 'habit', id? } })
  useEffect(() => {
    if (ui.dialog?.kind === 'habit') {
      setEditing({ habit: data.habits.find((h) => h.id === ui.dialog?.id) })
      setUI({ dialog: undefined })
    }
  }, [ui.dialog, data.habits])

  const habits = useMemo(() => [...data.habits].sort((a, b) => a.order - b.order), [data.habits])
  const active = habits.filter((h) => !h.archived)
  const archived = habits.filter((h) => h.archived)
  const selected = habits.find((h) => h.id === selId)
  const [shownId, detailClosing] = usePresence(overlay ? selId : undefined, '--dur')
  const shown = overlay ? habits.find((h) => h.id === shownId) : undefined
  const closeDetail = () => setSelId(undefined)

  // Escape closes the sliding detail (dialogs and popovers handle their own Escape first)
  useEffect(() => {
    if (!overlay || !selId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal-mask, .popover')) setSelId(undefined)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlay, selId])

  const isCollapsed = (k: string) => !!ui.collapsed['habit:' + k]
  const toggleCollapse = (k: string) => setUI((u) => ({ collapsed: { ...u.collapsed, ['habit:' + k]: !u.collapsed['habit:' + k] } }))

  const dayDate = parseISO(day)
  const dayHabits = active.filter((h) => scheduled(h, dayDate))

  return (
    <div className="module habit-module">
      <div className="habit-main">
        <div className="habit-head">
          <h2>{t('common.module.habits')}</h2>
          <button className="icon-btn" title={t('misc.habit.add')} onClick={() => setEditing({})}>
            <Icon name="plus" />
          </button>
        </div>
        <WeekStrip day={day} setDay={setDay} habits={active} weekStartsOn={weekStartsOn} />
        <div
          className="habit-scroll"
          onClick={(e) => {
            // Tablet: tapping empty list space closes the detail panel
            const t = e.target as HTMLElement
            if (tablet && selId && (t === e.currentTarget || t.classList.contains('habit-list'))) closeDetail()
          }}
        >
          <div className="habit-list">
            {active.length === 0 && (
              <div className="empty">
                <div style={{ fontSize: 40 }}>🌱</div>
                <div>{t('misc.habit.empty')}</div>
                <button className="btn btn-primary" onClick={() => setEditing({})}>
                  {t('misc.habit.add')}
                </button>
              </div>
            )}
            {active.length > 0 && dayHabits.length === 0 && <div className="habit-none">{t('misc.habit.noneToday')}</div>}
            {SECTIONS.map((sec) => {
              const list = dayHabits.filter((h) => (h.section ?? 'other') === sec)
              if (!list.length) return null
              const done = list.filter((h) => h.checkins[day]).length
              return (
                <div key={sec} className="habit-group">
                  <div className="habit-group-head" data-drop-section={sec} onClick={() => toggleCollapse(sec)}>
                    <Icon name={isCollapsed(sec) ? 'chevronRight' : 'chevronDown'} size={14} />
                    <span>{sectionName(sec)}</span>
                    <span className="habit-group-count">
                      {done}/{list.length}
                    </span>
                  </div>
                  {!isCollapsed(sec) &&
                    list.map((h) => <HabitRow key={h.id} habit={h} day={day} selected={h.id === selId} onSelect={() => setSelId(h.id)} weekStartsOn={weekStartsOn} />)}
                </div>
              )
            })}
            {archived.length > 0 && (
              <div className="habit-group archived">
                <div className="habit-group-head" onClick={() => toggleCollapse('archivedOpen')}>
                  <Icon name={isCollapsed('archivedOpen') ? 'chevronDown' : 'chevronRight'} size={14} />
                  <span>{t('misc.habit.archived')}</span>
                  <span className="habit-group-count">{archived.length}</span>
                </div>
                {/* The archived group starts collapsed */}
                {isCollapsed('archivedOpen') &&
                  archived.map((h) => <HabitRow key={h.id} habit={h} day={day} selected={h.id === selId} onSelect={() => setSelId(h.id)} weekStartsOn={weekStartsOn} archived />)}
              </div>
            )}
          </div>
        </div>
      </div>
      {!overlay && (
        <div className="habit-detail">
          {selected ? (
            <HabitDetail key={selected.id} habit={selected} weekStartsOn={weekStartsOn} onEdit={() => setEditing({ habit: selected })} onClose={closeDetail} />
          ) : (
            <div className="empty habit-detail-empty">
              <Icon name="habit" size={48} stroke={1.2} />
              <div>{t('misc.habit.detailEmpty')}</div>
            </div>
          )}
        </div>
      )}
      {overlay && shown && (
        <DetailOverlay phone={phone} closing={detailClosing} onClose={closeDetail}>
          <HabitDetail key={shown.id} habit={shown} weekStartsOn={weekStartsOn} phone={phone} onEdit={() => setEditing({ habit: shown })} onClose={closeDetail} />
        </DetailOverlay>
      )}
      {dialog && (
        <HabitDialog
          habit={dialog.habit}
          closing={dialogClosing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            if (id) setSelId(id)
          }}
        />
      )}
    </div>
  )
}

/**
 * The detail as a panel over the list: slides in from the right (full screen on phones). On phones a
 * rightward swipe outside the calendar drags it away and closes it.
 */
function DetailOverlay({ phone, closing, onClose, children }: { phone: boolean; closing: boolean; onClose: () => void; children: ReactNode }) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const sw = useRef<{ id: number; x: number; y: number; t: number; on: boolean } | null>(null)
  const back = (el: HTMLElement, dx: number) => {
    el.style.transform = ''
    el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: dur('--dur'), easing: ease('--ease-out') })
  }
  return (
    <div
      ref={ref}
      className={'habit-detail overlay' + (closing ? ' closing' : '')}
      role="dialog"
      aria-label={t('misc.habit.details')}
      onPointerDown={(e) => {
        if (!phone || e.pointerType === 'mouse' || (e.target as HTMLElement).closest('.habit-card')) return
        sw.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, on: false }
      }}
      onPointerMove={(e) => {
        const s = sw.current
        const el = ref.current
        if (!s || !el || e.pointerId !== s.id) return
        const dx = e.clientX - s.x
        const dy = e.clientY - s.y
        if (!s.on) {
          if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) sw.current = null
          else if (dx > 10 && dx > Math.abs(dy) * 1.2) s.on = true
          if (!s.on) return
        }
        el.style.transform = `translateX(${Math.max(0, dx)}px)`
      }}
      onPointerUp={(e) => {
        const s = sw.current
        const el = ref.current
        sw.current = null
        if (!s?.on || !el || e.pointerId !== s.id) return
        const dx = Math.max(0, e.clientX - s.x)
        const v = dx / Math.max(1, e.timeStamp - s.t)
        if (dx > 90 || (dx > 30 && v > 0.5)) {
          el.style.transform = 'translateX(100%)'
          el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(100%)' }], { duration: dur('--dur'), easing: ease('--ease-out') })
          onClose()
        } else back(el, dx)
      }}
      onPointerCancel={() => {
        const s = sw.current
        sw.current = null
        const el = ref.current
        if (s?.on && el) back(el, parseFloat(el.style.transform.replace(/[^\d.-]/g, '')) || 0)
      }}
    >
      {children}
    </div>
  )
}

// ---------------- week strip ----------------
function WeekStrip({ day, setDay, habits, weekStartsOn }: { day: string; setDay: (d: string) => void; habits: Habit[]; weekStartsOn: 0 | 1 }) {
  const t = useT()
  const today = todayStr()
  const [anchor, setAnchor] = useState(() => startOfWeek(parseISO(day), { weekStartsOn }))
  // Follow the selected day (e.g. "Back to today") without an effect
  const key = day + '|' + weekStartsOn
  const [seen, setSeen] = useState(key)
  if (seen !== key) {
    setSeen(key)
    setAnchor(startOfWeek(parseISO(day), { weekStartsOn }))
  }
  const thisWeek = startOfWeek(parseISO(today), { weekStartsOn })
  const canNext = anchor < thisWeek
  const go = (n: number) => {
    if (n > 0 && !canNext) return
    setAnchor((a) => addWeeks(a, n))
  }
  const swipe = useSwipe(go)
  const week = (start: Date) => (
    <div className="habit-week-days">
      {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => {
        const k = fmt(d)
        const sch = habits.filter((h) => scheduled(h, d))
        const ratio = sch.length ? sch.filter((h) => h.checkins[k]).length / sch.length : 0
        const future = k > today
        const r = 15
        const c = 2 * Math.PI * r
        return (
          <button key={k} className={'habit-day' + (k === day ? ' active' : '') + (k === today ? ' today' : '') + (future ? ' future' : '')} disabled={future} onClick={() => setDay(k)}>
            <span className="habit-day-wd">{k === today ? t('common.today') : dayName(getDay(d))}</span>
            <span className="habit-day-ring">
              <svg width="36" height="36" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r={r} className="ring-bg" />
                <circle cx="18" cy="18" r={r} className="ring-fg" strokeDasharray={`${c * ratio} ${c}`} opacity={ratio > 0 ? 1 : 0} transform="rotate(-90 18 18)" />
              </svg>
              <span className="habit-day-num">{ratio === 1 ? <Icon name="check" size={14} stroke={2.4} /> : d.getDate()}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
  return (
    <div className="habit-week" {...swipe}>
      <button className="icon-btn habit-week-nav" title={t('calendar.nav.prevWeek')} onClick={() => go(-1)}>
        <Icon name="chevronLeft" size={16} />
      </button>
      <SlideSwap order={anchor.getTime()} className="habit-week-swap" render={(o) => week(new Date(o))} />
      <button className="icon-btn habit-week-nav" title={t('calendar.nav.nextWeek')} disabled={!canNext} style={{ opacity: canNext ? 1 : 0.3 }} onClick={() => go(1)}>
        <Icon name="chevronRight" size={16} />
      </button>
      {day !== today && (
        <button className="habit-back-today" onClick={() => setDay(today)}>
          {t('misc.goToday')}
        </button>
      )}
    </div>
  )
}

// ---------------- list rows ----------------
function doCheckin(h: Habit, day: string) {
  const was = !!h.checkins[day]
  toggleCheckin(h.id, day)
  if (!was) {
    playDing(1046)
    const total = totalDays(h) + 1
    if (h.goalDays && total === h.goalDays) toast(t('misc.habit.goalReached', { name: h.name, count: h.goalDays }))
  }
}

/** Check-in button art: ring, a fill disc that scales in, and a tick drawn with its stroke. */
function CheckGlyph() {
  return (
    <svg className="hc-svg" viewBox="0 0 30 30" aria-hidden="true">
      <circle className="hc-ring" cx="15" cy="15" r="14" />
      <circle className="hc-fill" cx="15" cy="15" r="15" />
      <path className="hc-tick" d="M10.33 15.33l3 3L19.67 12" pathLength={1} />
    </svg>
  )
}

function HabitRow({ habit: h, day, selected, onSelect, weekStartsOn, archived }: { habit: Habit; day: string; selected: boolean; onSelect: () => void; weekStartsOn: 0 | 1; archived?: boolean }) {
  const t = useT()
  const done = !!h.checkins[day]
  const streak = currentStreak(h)
  const total = totalDays(h)
  const f = freqOf(h)
  const totalText = withNodes(t('misc.habit.row.total', { count: total }), { num: <NumberRoll value={total} /> })
  let sub: ReactNode
  if (archived) sub = <>{t('misc.habit.archived')} · {t('misc.habit.row.total', { count: total, num: total })}</>
  else {
    if (f.kind === 'weekly') {
      const week = weekCount(h, parseISO(day), weekStartsOn)
      sub = (
        <>
          {withNodes(t('misc.habit.row.week', { count: f.times }), { num: <NumberRoll value={week} /> })} · {totalText}
        </>
      )
    } else
      sub =
        streak > 0 ? (
          <>
            {withNodes(t('misc.habit.row.streak', { count: streak }), { num: <NumberRoll value={streak} /> })} · {totalText}
          </>
        ) : (
          totalText
        )
    if (h.goalDays)
      sub = (
        <>
          {sub} · {t('misc.habit.row.goal', { count: h.goalDays })}
        </>
      )
  }
  const drag = archived ? {} : { 'data-drag-id': h.id, 'data-section': h.section ?? 'other', onPointerDown: (e: RPointerEvent<HTMLDivElement>) => habitDragStart(e, h.id) }
  return (
    <div className={'habit-row' + (selected ? ' selected' : '') + (done ? ' done' : '')} onClick={onSelect} {...drag}>
      <span className="habit-icon" style={{ background: `color-mix(in srgb, ${h.color} 18%, transparent)` }}>
        {h.icon}
      </span>
      <div className="habit-row-text">
        <div className="habit-row-name">{h.name}</div>
        <div className="habit-row-sub">{sub}</div>
      </div>
      {archived ? (
        <button
          className="btn habit-restore"
          onClick={(e) => {
            e.stopPropagation()
            upsertHabit({ id: h.id, name: h.name, archived: false })
            toast(t('misc.habit.restored', { name: h.name }))
          }}
        >
          {t('shell.task.restore')}
        </button>
      ) : (
        <button
          className={'habit-check' + (done ? ' checked' : '')}
          style={{ ['--hc' as string]: h.color }}
          title={done ? t('misc.habit.uncheck') : t('misc.habit.check')}
          aria-pressed={done}
          onClick={(e) => {
            e.stopPropagation()
            const btn = e.currentTarget
            if (done) shrink(btn)
            else {
              bounce(btn)
              burst(btn, h.color, { count: 8, from: 12, to: 28, size: 5 })
            }
            doCheckin(h, day)
          }}
        >
          <CheckGlyph />
        </button>
      )}
    </div>
  )
}

// ---------------- detail panel ----------------
function HabitDetail({ habit: h, weekStartsOn, phone, onEdit, onClose }: { habit: Habit; weekStartsOn: 0 | 1; phone?: boolean; onEdit: () => void; onClose: () => void }) {
  const t = useT()
  const today = todayStr()
  const thisMonth = startOfMonth(parseISO(today))
  const [month, setMonth] = useState(thisMonth)
  const [menu, setMenu] = useState<Anchor | null>(null)
  const stats = monthStats(h, month)
  const streak = currentStreak(h)
  const longest = longestStreak(h)
  const total = totalDays(h)
  const swipe = useSwipe((dir) => setMonth((m) => addMonths(m, dir)))

  const cellsOf = (m: Date) => {
    const cells: Date[] = []
    for (let d = startOfWeek(m, { weekStartsOn }); cells.length < 42; d = addDays(d, 1)) cells.push(d)
    while (cells.length > 35 && !isSameMonth(cells[cells.length - 7], m)) cells.splice(cells.length - 7, 7)
    return cells
  }
  const weekHead = Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7)

  const del = () => {
    const snap = getData()
    setData((d) => ({ ...d, habits: d.habits.filter((x) => x.id !== h.id) }))
    toast(t('misc.habit.deleted', { name: h.name }), snap)
    onClose()
  }

  const grid = (m: Date) => (
    <div className="habit-cal">
      {cellsOf(m).map((d) => {
        const k = fmt(d)
        const on = !!h.checkins[k]
        const out = !isSameMonth(d, m)
        const future = k > today
        return (
          <button
            key={k}
            className={'habit-cal-day' + (on ? ' on' : '') + (out ? ' out' : '') + (future ? ' future' : '') + (k === today ? ' today' : '') + (!scheduled(h, d) ? ' off' : '')}
            disabled={future}
            title={future ? '' : on ? t('misc.habit.calUncheck') : t('misc.habit.calCheck')}
            onClick={(e) => {
              const el = e.currentTarget
              if (on) shrink(el)
              else {
                bounce(el, 0.7)
                burst(el, h.color, { count: 6, from: 10, to: 22, size: 4 })
              }
              doCheckin(h, k)
            }}
          >
            {d.getDate()}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="habit-detail-inner" style={{ ['--hc' as string]: h.color }}>
      <div className="habit-detail-head">
        {phone && (
          <button className="icon-btn habit-detail-back" title={t('common.back')} onClick={onClose}>
            <Icon name="chevronLeft" size={20} />
          </button>
        )}
        <span className="habit-icon lg" style={{ background: `color-mix(in srgb, ${h.color} 18%, transparent)` }}>
          {h.icon}
        </span>
        <div className="habit-detail-title">
          <div className="name">{h.name}</div>
          <div className="meta">
            {freqLabel(freqOf(h))}
            {h.reminders?.length ? ' · ' + t('misc.habit.reminders', { times: h.reminders.map(fmtTime).join(t('misc.listSeparator')) }) : ''}
            {h.archived ? ' · ' + t('misc.habit.archived') : ''}
          </div>
        </div>
        <button className="icon-btn" title={t('common.more')} onClick={(e) => setMenu(anchorOf(e.currentTarget))}>
          <Icon name="more" />
        </button>
        {!phone && (
          <button className="icon-btn" title={t('common.close')} onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
      {h.encouragement && <div className="habit-encourage">“{h.encouragement}”</div>}

      <div className="habit-card" {...swipe}>
        <div className="habit-cal-head">
          <span>{fmtMonthYear(month)}</span>
          <div style={{ display: 'flex', gap: 2 }}>
            <button className="icon-btn" title={t('calendar.nav.prevMonth')} onClick={() => setMonth((m) => addMonths(m, -1))}>
              <Icon name="chevronLeft" size={16} />
            </button>
            {month.getTime() !== thisMonth.getTime() && (
              <button className="habit-cal-today" onClick={() => setMonth(thisMonth)}>
                {t('misc.habit.thisMonth')}
              </button>
            )}
            <button className="icon-btn" title={t('calendar.nav.nextMonth')} onClick={() => setMonth((m) => addMonths(m, 1))}>
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        </div>
        <div className="habit-cal-wds">
          {weekHead.map((w) => (
            <div key={w} className="habit-cal-wd">
              {dayName(w)}
            </div>
          ))}
        </div>
        <SlideSwap order={month.getTime()} render={(o) => grid(new Date(o))} />
      </div>

      <div className="habit-stats">
        <Stat label={t('misc.habit.stat.monthChecks')} value={stats.checked} unit={t('misc.habit.unit.days', { count: stats.checked })} />
        <Stat label={t('misc.habit.stat.totalChecks')} value={total} unit={t('misc.habit.unit.days', { count: total })} />
        <Stat label={t('misc.habit.stat.monthRate')} value={stats.rate} unit="%" />
        <Stat label={t('misc.habit.stat.streak')} value={streak} unit={t('misc.habit.unit.days', { count: streak })} />
        <Stat label={t('misc.habit.stat.longest')} value={longest} unit={t('misc.habit.unit.days', { count: longest })} />
        {h.goalDays ? <Stat label={t('misc.habit.stat.goal')} value={Math.min(total, h.goalDays)} unit={t('misc.habit.unit.ofDays', { count: h.goalDays })} /> : null}
      </div>
      {h.goalDays ? (
        <div className="habit-goal-bar">
          <div style={{ transform: `scaleX(${Math.min(1, total / h.goalDays)})` }} />
        </div>
      ) : null}

      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <MenuList
            onClose={() => setMenu(null)}
            items={[
              { label: t('common.edit'), icon: <Icon name="edit" size={16} />, onClick: onEdit },
              h.archived
                ? { label: t('misc.habit.unarchive'), icon: <Icon name="restore" size={16} />, onClick: () => upsertHabit({ id: h.id, name: h.name, archived: false }) }
                : {
                    label: t('misc.habit.archive'),
                    icon: <Icon name="archive" size={16} />,
                    onClick: () => {
                      const snap = getData()
                      upsertHabit({ id: h.id, name: h.name, archived: true })
                      toast(t('misc.habit.archivedToast', { name: h.name }), snap)
                    },
                  },
              { divider: true },
              { label: t('common.delete'), icon: <Icon name="trash" size={16} />, danger: true, onClick: del },
            ]}
          />
        </Popover>
      )}
    </div>
  )
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="habit-stat">
      <div className="habit-stat-val">
        <NumberRoll value={value} />
        <small>{unit}</small>
      </div>
      <div className="habit-stat-label">{label}</div>
    </div>
  )
}

// ---------------- add / edit dialog ----------------
type FreqKind = HabitFrequency['kind']

function HabitDialog({ habit, closing, onClose, onSaved }: { habit?: Habit; closing?: boolean; onClose: () => void; onSaved: (id?: string) => void }) {
  const t = useT()
  const isNew = !habit
  const [step, setStep] = useState<'gallery' | 'form'>(isNew ? 'gallery' : 'form')
  const [name, setName] = useState(habit?.name ?? '')
  const [icon, setIcon] = useState(habit?.icon ?? '✅')
  const [color, setColor] = useState(habit?.color ?? '#4772FA')
  const f0 = habit ? freqOf(habit) : ({ kind: 'daily' } as HabitFrequency)
  const [fk, setFk] = useState<FreqKind>(f0.kind)
  const [times, setTimes] = useState(f0.kind === 'weekly' ? f0.times : 3)
  const [days, setDays] = useState<number[]>(f0.kind === 'days' ? f0.days : [1, 2, 3, 4, 5])
  const [section, setSection] = useState<HabitSection>(habit?.section ?? 'other')
  const [goal, setGoal] = useState(habit?.goalDays ? String(habit.goalDays) : '')
  const [reminders, setReminders] = useState<string[]>(habit?.reminders ?? [])
  const [remInput, setRemInput] = useState('09:00')
  const [enc, setEnc] = useState(habit?.encouragement ?? '')
  const [iconPicker, setIconPicker] = useState(false)

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])

  const pickTemplate = (tp: Template) => {
    setName(tplName(tp))
    setIcon(tp.icon)
    setColor(tp.color)
    setSection(tp.section)
    setEnc(tplMotto(tp))
    setStep('form')
  }
  const quickAdd = (tp: Template) => {
    const name = tplName(tp)
    upsertHabit({ name, icon: tp.icon, color: tp.color, section: tp.section, encouragement: tplMotto(tp), frequency: { kind: 'daily' } })
    toast(t('misc.habit.added', { name }))
    const added = getData().habits[getData().habits.length - 1]
    onSaved(added?.id)
    onClose()
  }

  const save = () => {
    const n = name.trim()
    if (!n) return
    const frequency: HabitFrequency = fk === 'daily' ? { kind: 'daily' } : fk === 'weekly' ? { kind: 'weekly', times } : { kind: 'days', days: [...days].sort() }
    const g = parseInt(goal, 10)
    upsertHabit({
      id: habit?.id,
      name: n,
      icon,
      color,
      frequency,
      section,
      goalDays: g > 0 ? g : undefined,
      reminders: [...reminders].sort(),
      encouragement: enc.trim() || undefined,
    })
    if (isNew) {
      const added = getData().habits[getData().habits.length - 1]
      onSaved(added?.id)
    } else onSaved(habit.id)
    onClose()
  }

  return (
    <div className={'modal-mask' + (closing ? ' closing' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal habit-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <span>{step === 'gallery' ? t('misc.habit.add') : isNew ? t('misc.habit.new') : t('misc.habit.edit')}</span>
          <button className="icon-btn" title={t('common.close')} onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
        {step === 'gallery' ? (
          <div className="modal-body">
            <div className="habit-gallery">
              <button className="habit-tpl custom" onClick={() => setStep('form')}>
                <span className="habit-icon" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                  <Icon name="plus" size={18} />
                </span>
                <span className="habit-tpl-name">{t('misc.habit.custom')}</span>
              </button>
              {TEMPLATES.map((tp) => (
                <div key={tp.id} className="habit-tpl" onClick={() => pickTemplate(tp)}>
                  <span className="habit-icon" style={{ background: `color-mix(in srgb, ${tp.color} 18%, transparent)` }}>
                    {tp.icon}
                  </span>
                  <span className="habit-tpl-name">{tplName(tp)}</span>
                  <button
                    className="habit-tpl-add"
                    title={t('misc.habit.quickAdd')}
                    onClick={(e) => {
                      e.stopPropagation()
                      quickAdd(tp)
                    }}
                  >
                    <Icon name="plus" size={14} stroke={2.2} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="modal-body habit-form">
              <div className="habit-form-top">
                <button className="habit-icon lg pick" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }} title={t('misc.habit.chooseIcon')} onClick={() => setIconPicker((v) => !v)}>
                  {icon}
                </button>
                <input className="input" autoFocus placeholder={t('misc.habit.namePlaceholder')} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
              </div>
              {iconPicker && (
                <div className="habit-emoji-grid">
                  {EMOJIS.map((em) => (
                    <button
                      key={em}
                      className={em === icon ? 'on' : ''}
                      onClick={() => {
                        setIcon(em)
                        setIconPicker(false)
                      }}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}
              <div className="habit-colors">
                {COLORS.map((c) => (
                  <button key={c} className={'habit-swatch' + (c.toLowerCase() === color.toLowerCase() ? ' on' : '')} style={{ background: c }} onClick={() => setColor(c)} />
                ))}
              </div>

              <label className="habit-field">
                <span>{t('misc.habit.frequency')}</span>
                <select className="input" value={fk} onChange={(e) => setFk(e.target.value as FreqKind)}>
                  <option value="daily">{t('misc.habit.freq.daily')}</option>
                  <option value="weekly">{t('misc.habit.freqWeekly')}</option>
                  <option value="days">{t('misc.habit.freqDays')}</option>
                </select>
              </label>
              {fk === 'weekly' && (
                <div className="habit-field">
                  <span />
                  <div className="habit-seg">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <button key={n} className={n === times ? 'on' : ''} onClick={() => setTimes(n)}>
                        {t('misc.habit.timesPerWeek', { count: n })}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {fk === 'days' && (
                <div className="habit-field">
                  <span />
                  <div className="habit-seg">
                    {[1, 2, 3, 4, 5, 6, 0].map((n) => (
                      <button key={n} className={days.includes(n) ? 'on' : ''} onClick={() => setDays((ds) => (ds.includes(n) ? (ds.length > 1 ? ds.filter((x) => x !== n) : ds) : [...ds, n]))}>
                        {dayName(n)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="habit-field">
                <span>{t('misc.habit.section')}</span>
                <div className="habit-seg">
                  {SECTIONS.map((s) => (
                    <button key={s} className={s === section ? 'on' : ''} onClick={() => setSection(s)}>
                      {sectionName(s)}
                    </button>
                  ))}
                </div>
              </div>
              <label className="habit-field">
                <span>{t('misc.habit.goal')}</span>
                <input className="input" type="number" min={1} placeholder={t('misc.habit.goalPlaceholder')} value={goal} onChange={(e) => setGoal(e.target.value.replace(/\D/g, ''))} />
              </label>
              <div className="habit-field">
                <span>{t('misc.habit.reminder')}</span>
                <div className="habit-reminders">
                  {reminders.map((r) => (
                    <span key={r} className="habit-chip">
                      <Icon name="bell" size={12} />
                      {fmtTime(r)}
                      <button title={t('common.delete')} onClick={() => setReminders((rs) => rs.filter((x) => x !== r))}>
                        <Icon name="close" size={10} stroke={2.4} />
                      </button>
                    </span>
                  ))}
                  <input className="input habit-time" type="time" value={remInput} onChange={(e) => setRemInput(e.target.value)} />
                  <button className="btn" onClick={() => remInput && !reminders.includes(remInput) && setReminders((rs) => [...rs, remInput])}>
                    {t('common.add')}
                  </button>
                </div>
              </div>
              <label className="habit-field">
                <span>{t('misc.habit.motto')}</span>
                <input className="input" placeholder={t('misc.habit.mottoPlaceholder')} value={enc} maxLength={60} onChange={(e) => setEnc(e.target.value)} />
              </label>
            </div>
            <div className="modal-foot">
              {isNew && (
                <button className="btn" style={{ marginRight: 'auto' }} onClick={() => setStep('gallery')}>
                  {t('common.back')}
                </button>
              )}
              <button className="btn" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" disabled={!name.trim()} onClick={save}>
                {t('common.save')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
