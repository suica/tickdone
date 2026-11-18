import { useSyncExternalStore } from 'react'
import { getData, playDing, setData, uid } from './store'
import type { FocusRecord } from './types'

/** 番茄专注计时器：模块级 store，切换模块时计时继续；状态存 localStorage，刷新可恢复 */

const KEY = 'tickdone:pomo'
const MIN = 60000

export type PomoMode = 'pomo' | 'stopwatch'
export type PomoPhase = 'idle' | 'focus' | 'break'

interface PomoCore {
  mode: PomoMode
  phase: PomoPhase
  breakKind?: 'short' | 'long'
  /** false = 已暂停（phase !== idle 时有意义） */
  running: boolean
  /** 本段运行开始的时间戳 */
  segStart?: number
  /** segStart 之前累计的毫秒 */
  elapsed: number
  /** 目标时长（番茄 / 休息），毫秒；正计时为 0 */
  duration: number
  taskId?: string
  /** 本轮已完成番茄数（每 4 个长休息） */
  count: number
}

export interface PomoSnapshot extends PomoCore {
  now: number
  /** 已计时毫秒 */
  elapsedMs: number
  /** 剩余毫秒（正计时为 0） */
  remaining: number
  /** 0..1 进度 */
  progress: number
  /** 圆环中心显示的时间 mm:ss */
  display: string
  /** 是否有进行中（含暂停）的专注/休息 */
  active: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

const pomoMs = () => Math.max(1, getData().settings.pomoMinutes || 25) * MIN

function idleCore(mode: PomoMode = 'pomo', taskId?: string, count = 0): PomoCore {
  return { mode, phase: 'idle', running: false, elapsed: 0, duration: mode === 'pomo' ? pomoMs() : 0, taskId, count }
}

function load(): PomoCore {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as PomoCore
      if (p && (p.mode === 'pomo' || p.mode === 'stopwatch') && typeof p.elapsed === 'number') return p
    }
  } catch {
    /* ignore */
  }
  return idleCore()
}

let core: PomoCore = load()
let snap: PomoSnapshot = derive(core, Date.now())
const subs = new Set<() => void>()
let timer: number | undefined
let baseTitle = typeof document !== 'undefined' ? document.title : 'TickDone'

function elapsedOf(c: PomoCore, now: number) {
  return c.elapsed + (c.running && c.segStart ? Math.max(0, now - c.segStart) : 0)
}

function derive(c: PomoCore, now: number): PomoSnapshot {
  // 空闲时番茄时长跟随设置
  const duration = c.phase === 'idle' && c.mode === 'pomo' ? pomoMs() : c.duration
  const elapsedMs = elapsedOf(c, now)
  const countdown = c.phase === 'break' || c.mode === 'pomo'
  const remaining = countdown ? Math.max(0, duration - elapsedMs) : 0
  const progress = countdown ? (duration ? Math.min(1, elapsedMs / duration) : 0) : (elapsedMs % (60 * MIN)) / (60 * MIN)
  return {
    ...c,
    duration,
    now,
    elapsedMs,
    remaining,
    progress,
    display: formatClock(countdown ? remaining : elapsedMs),
    active: c.phase !== 'idle',
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(core))
  } catch {
    /* ignore */
  }
}

function updateTitle() {
  if (typeof document === 'undefined') return
  if (snap.active) {
    const label = snap.phase === 'break' ? '休息' : snap.mode === 'stopwatch' ? '正计时' : '专注'
    document.title = `${snap.display}${snap.running ? '' : ' 已暂停'} · ${label} - TickDone`
  } else {
    document.title = baseTitle
  }
}

function emit() {
  snap = derive(core, Date.now())
  updateTitle()
  subs.forEach((f) => f())
}

function set(c: PomoCore) {
  core = c
  persist()
  syncTimer()
  emit()
}

function syncTimer() {
  const need = core.phase !== 'idle' && core.running
  if (need && timer === undefined) timer = window.setInterval(tick, 250)
  else if (!need && timer !== undefined) {
    clearInterval(timer)
    timer = undefined
  }
}

let lastShown = ''
function tick() {
  const now = Date.now()
  const c = core
  if (c.phase !== 'idle' && c.running && (c.phase === 'break' || c.mode === 'pomo') && elapsedOf(c, now) >= c.duration) {
    complete(now)
    return
  }
  const next = derive(c, now)
  if (next.display !== lastShown) {
    lastShown = next.display
    snap = next
    updateTitle()
    subs.forEach((f) => f())
  }
}

// ---------------- 提醒 ----------------
function ring(times = 3) {
  for (let i = 0; i < times; i++) setTimeout(() => playDing(i % 2 ? 1175 : 880), i * 450)
}

function ensurePermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission().catch(() => {})
  } catch {
    /* ignore */
  }
}

function notify(title: string, body: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body, tag: 'tickdone-pomo' })
  } catch {
    /* ignore */
  }
}

function taskTitle(id?: string) {
  return id ? getData().tasks.find((t) => t.id === id)?.title : undefined
}

function addRecord(start: number, end: number, mode: FocusRecord['mode'], taskId?: string) {
  const r: FocusRecord = { id: uid(), start, end, mode, ...(taskId ? { taskId } : {}) }
  setData((d) => ({ ...d, focus: [...(d.focus ?? []), r] }))
}

/** 到点：番茄完成 → 记录并进入休息；休息结束 → 回到空闲 */
function complete(now: number) {
  const c = core
  // 结束时刻 = 本段开始 + 剩余所需（刷新恢复时可能早于 now）
  const end = c.segStart ? c.segStart + (c.duration - c.elapsed) : now
  const late = now - end > MIN // 关闭页面期间已到点：不响铃
  if (c.phase === 'focus') {
    addRecord(end - c.duration, end, 'pomo', c.taskId)
    const count = c.count + 1
    const s = getData().settings
    const long = count % 4 === 0
    const mins = Math.max(1, (long ? s.longBreak : s.shortBreak) || (long ? 15 : 5))
    if (!late) {
      ring(4)
      const t = taskTitle(c.taskId)
      notify('专注完成 🍅', `${t ? `「${t}」` : ''}已完成一个番茄，休息 ${mins} 分钟吧`)
    }
    const breakDur = mins * MIN
    // 自动进入休息；若离线期间休息也已结束，直接回空闲
    if (late && now - end >= breakDur) set(idleCore('pomo', c.taskId, count))
    else set({ ...c, phase: 'break', breakKind: long ? 'long' : 'short', running: true, segStart: end, elapsed: 0, duration: breakDur, count })
  } else if (c.phase === 'break') {
    if (!late) {
      ring(3)
      notify('休息结束', '开始下一个番茄吧')
    }
    set(idleCore('pomo', c.taskId, c.count))
  }
}

// ---------------- 操作 ----------------
export function setPomoMode(mode: PomoMode) {
  if (core.phase !== 'idle') return
  set(idleCore(mode, core.taskId, core.count))
}

export function setPomoTask(taskId?: string) {
  set({ ...core, taskId })
}

/** 开始专注（可绑定任务）。已在专注中时仅切换绑定的任务 */
export function startFocus(taskId?: string) {
  ensurePermission()
  if (core.phase === 'focus') {
    if (taskId !== undefined) set({ ...core, taskId })
    if (!core.running) resumePomo()
    return
  }
  const base = core.phase === 'break' ? idleCore('pomo', core.taskId, core.count) : core
  const mode = base.mode
  set({
    ...base,
    phase: 'focus',
    breakKind: undefined,
    running: true,
    segStart: Date.now(),
    elapsed: 0,
    duration: mode === 'pomo' ? pomoMs() : 0,
    taskId: taskId ?? base.taskId,
  })
}

export function pausePomo() {
  if (core.phase === 'idle' || !core.running) return
  set({ ...core, running: false, elapsed: elapsedOf(core, Date.now()), segStart: undefined })
}

export function resumePomo() {
  if (core.phase === 'idle' || core.running) return
  set({ ...core, running: true, segStart: Date.now() })
}

/** 放弃：不记录 */
export function abandonPomo() {
  set(idleCore(core.mode, core.taskId, core.count))
}

/** 结束：≥1 分钟则记录（番茄提前结束记为自由专注，不计番茄数） */
export function finishPomo() {
  const c = core
  if (c.phase === 'break') return skipBreak()
  if (c.phase !== 'focus') return
  const now = Date.now()
  const ms = elapsedOf(c, now)
  if (ms >= MIN) addRecord(now - ms, now, 'stopwatch', c.taskId)
  set(idleCore(c.mode, c.taskId, c.count))
}

export function skipBreak() {
  if (core.phase !== 'break') return
  set(idleCore('pomo', core.taskId, core.count))
}

export function deleteFocusRecord(id: string) {
  setData((d) => ({ ...d, focus: (d.focus ?? []).filter((r) => r.id !== id) }))
}

// ---------------- 订阅 ----------------
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => subs.delete(f)
}
export const getPomo = () => snap
export const usePomo = () => useSyncExternalStore(subscribe, getPomo)

// 启动：恢复计时，并处理关闭页面期间已到点的情况
if (typeof window !== 'undefined') {
  if (document.title.includes(' - TickDone') && /^\d/.test(document.title)) baseTitle = 'TickDone'
  syncTimer()
  if (core.phase !== 'idle') {
    tick()
    updateTitle()
  }
}

/** 设置里番茄时长变化后刷新空闲显示（PomoView 调用） */
export function refreshPomo() {
  if (core.phase === 'idle') emit()
}
