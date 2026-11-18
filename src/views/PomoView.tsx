import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { format, isSameDay, isToday, isYesterday } from 'date-fns'
import { Icon } from '../components/Icon'
import { Popover, anchorOf, type Anchor } from '../components/Popover'
import { bounce, burst, dur, ease, reducedMotion } from '../components/motion'
import { useData } from '../store'
import { todayStr } from '../dates'
import { usePhone } from '../viewport'
import type { AppData, FocusRecord } from '../types'
import {
  abandonPomo,
  deleteFocusRecord,
  finishPomo,
  getPomo,
  onPomoDone,
  pausePomo,
  refreshPomo,
  resumePomo,
  setPomoMode,
  setPomoTask,
  skipBreak,
  startFocus,
  usePomo,
  type PomoSnapshot,
} from '../pomo'
import './pomo.css'

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 时长：1h25m / 25m / 0m */
export function fmtDur(ms: number) {
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  return h ? `${h}h${m % 60 ? `${m % 60}m` : ''}` : `${m}m`
}

function DurBig({ ms }: { ms: number }) {
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  return (
    <span className="pomo-stat-num">
      {h > 0 && (
        <>
          {h}
          <small>h</small>
        </>
      )}
      {m % 60}
      <small>m</small>
    </span>
  )
}

// Ring geometry in the 300x300 viewBox
const R = 130
const C = 2 * Math.PI * R
const HOUR = 3600000

type RingState = Pick<PomoSnapshot, 'phase' | 'mode' | 'running' | 'segStart' | 'elapsed' | 'duration'>

/** Ring progress (0..1) at a moment: countdown share for pomodoros and breaks, minutes of the hour for the stopwatch. */
function progressAt(p: RingState, now: number) {
  if (p.phase === 'idle') return 0
  const e = p.elapsed + (p.running && p.segStart ? Math.max(0, now - p.segStart) : 0)
  if (p.phase === 'break' || p.mode === 'pomo') return p.duration ? Math.min(1, e / p.duration) : 0
  return (e % HOUR) / HOUR
}

/** Play triangle that morphs into pause bars (two clip-path halves). */
function PlayPause({ playing }: { playing: boolean }) {
  return (
    <span className={'pomo-pp' + (playing ? ' playing' : '')} aria-hidden="true">
      <i />
      <i />
    </span>
  )
}

export default function PomoView() {
  const data = useData()
  const p = usePomo()
  const phone = usePhone()
  const [picker, setPicker] = useState<Anchor | null>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const fgRef = useRef<SVGCircleElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const cycleRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const lastPrimary = useRef<{ left: number; split: boolean } | null>(null)

  useEffect(() => refreshPomo(), [data.settings.pomoMinutes])

  const task = p.taskId ? data.tasks.find((t) => t.id === p.taskId) : undefined
  const isBreak = p.phase === 'break'
  const stopwatch = p.mode === 'stopwatch' && !isBreak
  const playing = p.phase !== 'idle' && p.running

  // Smooth ring: while running, a rAF loop writes the exact progress every frame (the clock text still ticks
  // once a second). When stopped, the value is written once and CSS eases it (e.g. rewinding after 放弃).
  const { phase, mode, running, segStart, elapsed, duration } = p
  useLayoutEffect(() => {
    const el = fgRef.current
    if (!el) return
    const st = { phase, mode, running, segStart, elapsed, duration }
    const write = () => {
      el.style.strokeDashoffset = `${C * (1 - progressAt(st, Date.now()))}px`
    }
    write()
    if (phase === 'idle' || !running) return
    let raf = 0
    const loop = () => {
      write()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase, mode, running, segStart, elapsed, duration])

  // A finished pomodoro: the ring stays full, glows and swells a little, confetti flies out, then it rewinds.
  useEffect(
    () =>
      onPomoDone((done) => {
        if (done !== 'focus' || reducedMotion()) return
        const slow = dur('--dur-slow')
        if (!slow) return
        const total = slow * 5
        const fg = fgRef.current
        if (fg) {
          const end = C * (1 - progressAt(getPomo(), Date.now() + total))
          fg.animate([{ strokeDashoffset: '0px' }, { strokeDashoffset: '0px', offset: 0.55 }, { strokeDashoffset: `${end}px` }], { duration: total, easing: ease('--ease-in-out') })
        }
        svgRef.current?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: slow * 3, easing: ease('--ease-out') })
        glowRef.current?.animate(
          [
            { opacity: 0, transform: 'scale(0.94)' },
            { opacity: 1, transform: 'scale(1.03)', offset: 0.3 },
            { opacity: 0, transform: 'scale(1.16)' },
          ],
          { duration: slow * 4.5, easing: 'ease-out' },
        )
        const ring = ringRef.current
        if (ring) {
          const rr = (ring.getBoundingClientRect().width / 2) * (R / 150)
          const primary = getComputedStyle(ring).getPropertyValue('--primary').trim() || '#4772fa'
          burst(ring, [primary, '#35b36b', '#ffac38', '#ff83c3'], { count: 18, from: rr, to: rr + 46, size: 7, duration: slow * 3 })
        }
        const dots = cycleRef.current?.querySelectorAll('.dot.on')
        if (dots?.length) bounce(dots[dots.length - 1], 2)
      }),
    [],
  )

  const status =
    p.phase === 'idle' ? '' : isBreak ? (p.running ? (p.breakKind === 'long' ? '长休息' : '短休息') : '休息已暂停') : p.running ? '专注中' : '已暂停'

  const primary = p.phase === 'idle' ? { label: '开始', on: () => startFocus() } : p.running ? { label: '暂停', on: pausePomo } : { label: '继续', on: resumePomo }
  const secondary =
    p.phase === 'idle'
      ? null
      : isBreak
        ? { label: '跳过', on: skipBreak, title: undefined }
        : p.running
          ? stopwatch
            ? { label: '结束', on: finishPomo, title: undefined }
            : { label: '放弃', on: abandonPomo, title: undefined }
          : { label: '结束', on: finishPomo, title: stopwatch ? undefined : '提前结束，满 1 分钟会记录为专注时长' }

  // The primary button slides aside when the second button appears (FLIP on its x position).
  const split = !!secondary
  useLayoutEffect(() => {
    const el = primaryRef.current
    if (!el) return
    const left = el.getBoundingClientRect().left
    const prev = lastPrimary.current
    lastPrimary.current = { left, split }
    if (!prev || prev.split === split || Math.abs(prev.left - left) < 1 || reducedMotion()) return
    el.animate([{ transform: `translateX(${prev.left - left}px)` }, { transform: 'none' }], { duration: dur('--dur-slow'), easing: ease('--ease-out') })
  })

  return (
    <div className={'module pomo-view' + (isBreak ? ' is-break' : '')}>
      <section className="pomo-main">
        <header className="pomo-head">
          <h2>番茄专注</h2>
        </header>
        <div className="pomo-center">
          <div className="pomo-tabs" role="tablist">
            {(['pomo', 'stopwatch'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                className={'pomo-tab' + (p.mode === m ? ' active' : '')}
                disabled={p.phase !== 'idle' && p.mode !== m}
                title={p.phase !== 'idle' && p.mode !== m ? '计时进行中，无法切换' : undefined}
                onClick={() => setPomoMode(m)}
              >
                {m === 'pomo' ? '番茄钟' : '正计时'}
              </button>
            ))}
          </div>

          <button className={'pomo-task' + (task ? ' bound' : '')} onClick={(e) => setPicker(anchorOf(e.currentTarget))}>
            {isBreak ? (
              <span>{p.breakKind === 'long' ? '长休息一下吧' : '休息一下吧'}</span>
            ) : (
              <>
                <span className="pomo-task-name">{task ? task.title || '无标题' : '专注'}</span>
                <Icon name="chevronRight" size={14} />
              </>
            )}
          </button>

          <div className={'pomo-ring' + (playing ? ' running' : '')} ref={ringRef}>
            <div className="pomo-ring-glow" ref={glowRef} />
            <svg viewBox="0 0 300 300" width="300" height="300" ref={svgRef}>
              <circle cx="150" cy="150" r={R} className="pomo-ring-bg" />
              <circle ref={fgRef} cx="150" cy="150" r={R} className="pomo-ring-fg" strokeDasharray={C} transform="rotate(-90 150 150)" />
            </svg>
            <div className="pomo-ring-text">
              <div className="pomo-clock">{p.display}</div>
              {status && <div className="pomo-status">{status}</div>}
            </div>
          </div>

          <div className="pomo-actions">
            <button ref={primaryRef} className={'pomo-btn primary' + (playing ? ' playing' : '')} onClick={primary.on}>
              <PlayPause playing={playing} />
              <span key={primary.label} className="pomo-btn-label">
                {primary.label}
              </span>
            </button>
            {secondary && (
              <button key="secondary" className="pomo-btn pomo-btn-2" onClick={secondary.on} title={secondary.title}>
                {secondary.label}
              </button>
            )}
          </div>
          {p.mode === 'pomo' && (
            <div className="pomo-cycle" title="每 4 个番茄后长休息" ref={cycleRef}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={'dot' + (i < p.count % 4 || (p.count > 0 && p.count % 4 === 0 && isBreak) ? ' on' : '')} />
              ))}
            </div>
          )}
        </div>
      </section>

      <FocusSide data={data} />

      {picker && <TaskPicker anchor={picker} data={data} currentId={p.taskId} wide={!phone} onClose={() => setPicker(null)} />}
    </div>
  )
}

// ---------------- 任务选择浮层 ----------------
function TaskPicker({ anchor, data, currentId, wide, onClose }: { anchor: Anchor; data: AppData; currentId?: string; wide: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const today = todayStr()
  const groups = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const open = data.tasks.filter((t) => !t.deleted && t.status === 0 && (!kw || t.title.toLowerCase().includes(kw)))
    const byOrder = (a: (typeof open)[0], b: (typeof open)[0]) => a.order - b.order
    const todayT = open.filter((t) => t.dueDate && t.dueDate <= today).sort(byOrder)
    const rest = open.filter((t) => !(t.dueDate && t.dueDate <= today)).sort(byOrder)
    return [
      { name: '今天', items: todayT },
      { name: '未完成', items: rest },
    ].filter((g) => g.items.length)
  }, [data.tasks, q, today])
  const listName = (id: string) => (id === 'inbox' ? '收集箱' : data.lists.find((l) => l.id === id)?.name ?? '')

  const pick = (id?: string) => {
    setPomoTask(id)
    onClose()
  }

  return (
    // On phones the popover is a full-width bottom sheet, so no fixed width is passed there
    <Popover anchor={{ ...anchor, x: anchor.x - 60 }} onClose={onClose} width={wide ? 320 : undefined} className="pomo-picker">
      <div className="pomo-picker-search">
        <Icon name="search" size={15} />
        <input autoFocus placeholder="搜索任务" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="pomo-picker-list">
        {groups.length === 0 && <div className="pomo-picker-empty">没有匹配的任务</div>}
        {groups.map((g) => (
          <div key={g.name}>
            <div className="pomo-picker-group">{g.name}</div>
            {g.items.map((t) => (
              <div key={t.id} className={'pomo-picker-item' + (t.id === currentId ? ' active' : '')} onClick={() => pick(t.id)}>
                <span className="pomo-picker-title">{t.title || '无标题'}</span>
                <span className="pomo-picker-list-name">{listName(t.listId)}</span>
                {t.id === currentId && <Icon name="check" size={14} />}
              </div>
            ))}
          </div>
        ))}
      </div>
      {currentId && (
        <div className="pomo-picker-foot">
          <button onClick={() => pick(undefined)}>
            <Icon name="close" size={14} /> 清除关联任务
          </button>
        </div>
      )}
    </Popover>
  )
}

// ---------------- 右侧概览 & 记录 ----------------
function FocusSide({ data }: { data: AppData }) {
  const records = data.focus ?? []
  const stats = useMemo(() => {
    const now = new Date()
    let todayPomo = 0
    let todayMs = 0
    let totalPomo = 0
    let totalMs = 0
    for (const r of records) {
      const ms = Math.max(0, r.end - r.start)
      const isPomo = r.mode === 'pomo'
      totalMs += ms
      if (isPomo) totalPomo++
      if (isSameDay(new Date(r.end), now)) {
        todayMs += ms
        if (isPomo) todayPomo++
      }
    }
    return { todayPomo, todayMs, totalPomo, totalMs }
  }, [records])

  const days = useMemo(() => {
    const sorted = [...records].sort((a, b) => b.start - a.start)
    const map = new Map<string, FocusRecord[]>()
    for (const r of sorted) {
      const k = format(new Date(r.start), 'yyyy-MM-dd')
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(r)
    }
    return [...map.entries()]
  }, [records])

  const dayLabel = (k: string) => {
    const d = new Date(k + 'T00:00:00')
    if (isToday(d)) return '今天'
    if (isYesterday(d)) return '昨天'
    const sameYear = d.getFullYear() === new Date().getFullYear()
    return format(d, sameYear ? 'M月d日' : 'yyyy年M月d日') + ' ' + WEEK[d.getDay()]
  }

  return (
    <aside className="pomo-side">
      <div className="pomo-side-title">概览</div>
      <div className="pomo-stats">
        <div className="pomo-stat">
          <div className="pomo-stat-label">今日番茄</div>
          <span className="pomo-stat-num">{stats.todayPomo}</span>
        </div>
        <div className="pomo-stat">
          <div className="pomo-stat-label">今日专注时长</div>
          <DurBig ms={stats.todayMs} />
        </div>
        <div className="pomo-stat">
          <div className="pomo-stat-label">总番茄</div>
          <span className="pomo-stat-num">{stats.totalPomo}</span>
        </div>
        <div className="pomo-stat">
          <div className="pomo-stat-label">总专注时长</div>
          <DurBig ms={stats.totalMs} />
        </div>
      </div>

      <div className="pomo-side-title">专注记录</div>
      <div className="pomo-records">
        {days.length === 0 && (
          <div className="pomo-records-empty">
            <Icon name="pomo" size={36} />
            <div>还没有专注记录</div>
            <div className="sub">完成一个番茄或正计时满 1 分钟后会显示在这里</div>
          </div>
        )}
        {days.map(([k, rs]) => (
          <div key={k} className="pomo-day">
            <div className="pomo-day-head">
              <span>{dayLabel(k)}</span>
              <span className="pomo-day-sum">{fmtDur(rs.reduce((s, r) => s + (r.end - r.start), 0))}</span>
            </div>
            {rs.map((r) => {
              const t = r.taskId ? data.tasks.find((x) => x.id === r.taskId) : undefined
              return (
                <div key={r.id} className="pomo-rec">
                  <span className={'pomo-rec-dot' + (r.mode === 'pomo' ? ' pomo' : '')}>
                    <Icon name={r.mode === 'pomo' ? 'pomo' : 'clock'} size={13} />
                  </span>
                  <div className="pomo-rec-body">
                    <div className="pomo-rec-time">
                      {format(new Date(r.start), 'HH:mm')} - {format(new Date(r.end), 'HH:mm')}
                      <span className="pomo-rec-dur">{fmtDur(r.end - r.start)}</span>
                    </div>
                    <div className="pomo-rec-task">{t ? t.title || '无标题' : r.taskId ? '任务已删除' : r.mode === 'pomo' ? '番茄专注' : '正计时专注'}</div>
                  </div>
                  <button
                    className="icon-btn pomo-rec-del"
                    title="删除记录"
                    onClick={() => {
                      if (confirm('删除这条专注记录？')) deleteFocusRecord(r.id)
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </aside>
  )
}
