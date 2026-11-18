import { useEffect, useMemo, useState } from 'react'
import { format, isSameDay, isToday, isYesterday } from 'date-fns'
import { Icon } from '../components/Icon'
import { Popover, anchorOf, type Anchor } from '../components/Popover'
import { useData } from '../store'
import { todayStr } from '../dates'
import type { AppData, FocusRecord } from '../types'
import {
  abandonPomo,
  deleteFocusRecord,
  finishPomo,
  pausePomo,
  refreshPomo,
  resumePomo,
  setPomoMode,
  setPomoTask,
  skipBreak,
  startFocus,
  usePomo,
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

export default function PomoView() {
  const data = useData()
  const p = usePomo()
  const [picker, setPicker] = useState<Anchor | null>(null)

  useEffect(() => refreshPomo(), [data.settings.pomoMinutes])

  const task = p.taskId ? data.tasks.find((t) => t.id === p.taskId) : undefined
  const isBreak = p.phase === 'break'
  const stopwatch = p.mode === 'stopwatch' && !isBreak

  const R = 130
  const C = 2 * Math.PI * R
  const progress = p.phase === 'idle' ? 0 : p.progress

  const status =
    p.phase === 'idle' ? '' : isBreak ? (p.running ? (p.breakKind === 'long' ? '长休息' : '短休息') : '休息已暂停') : p.running ? '专注中' : '已暂停'

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

          <div className="pomo-ring">
            <svg viewBox="0 0 300 300" width="300" height="300">
              <circle cx="150" cy="150" r={R} className="pomo-ring-bg" />
              <circle
                cx="150"
                cy="150"
                r={R}
                className="pomo-ring-fg"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - progress)}
                transform="rotate(-90 150 150)"
              />
            </svg>
            <div className="pomo-ring-text">
              <div className="pomo-clock">{p.display}</div>
              {status && <div className="pomo-status">{status}</div>}
            </div>
          </div>

          <div className="pomo-actions">
            {p.phase === 'idle' && (
              <button className="pomo-btn primary" onClick={() => startFocus()}>
                开始
              </button>
            )}
            {p.phase === 'focus' && p.running && (
              <>
                <button className="pomo-btn primary" onClick={pausePomo}>
                  暂停
                </button>
                {stopwatch ? (
                  <button className="pomo-btn" onClick={finishPomo}>
                    结束
                  </button>
                ) : (
                  <button className="pomo-btn" onClick={abandonPomo}>
                    放弃
                  </button>
                )}
              </>
            )}
            {p.phase === 'focus' && !p.running && (
              <>
                <button className="pomo-btn primary" onClick={resumePomo}>
                  继续
                </button>
                <button className="pomo-btn" onClick={finishPomo} title={stopwatch ? undefined : '提前结束，满 1 分钟会记录为专注时长'}>
                  结束
                </button>
              </>
            )}
            {isBreak && (
              <>
                <button className="pomo-btn primary" onClick={p.running ? pausePomo : resumePomo}>
                  {p.running ? '暂停' : '继续'}
                </button>
                <button className="pomo-btn" onClick={skipBreak}>
                  跳过
                </button>
              </>
            )}
          </div>
          {p.mode === 'pomo' && (
            <div className="pomo-cycle" title="每 4 个番茄后长休息">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={'dot' + (i < p.count % 4 || (p.count > 0 && p.count % 4 === 0 && isBreak) ? ' on' : '')} />
              ))}
            </div>
          )}
        </div>
      </section>

      <FocusSide data={data} />

      {picker && <TaskPicker anchor={picker} data={data} currentId={p.taskId} onClose={() => setPicker(null)} />}
    </div>
  )
}

// ---------------- 任务选择浮层 ----------------
function TaskPicker({ anchor, data, currentId, onClose }: { anchor: Anchor; data: AppData; currentId?: string; onClose: () => void }) {
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
    <Popover anchor={{ ...anchor, x: anchor.x - 60 }} onClose={onClose} width={320} className="pomo-picker">
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
