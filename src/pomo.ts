import { useSyncExternalStore } from 'react'
import { t } from './i18n'
import { getData, playDing, setData, uid } from './store'
import type { FocusRecord } from './types'

/** Focus timer: a module-level store, so it keeps running when you switch modules; its state is in localStorage and survives a reload. */

const KEY = 'tickdone:pomo'
const MIN = 60000

export type PomoMode = 'pomo' | 'stopwatch'
export type PomoPhase = 'idle' | 'focus' | 'break'

interface PomoCore {
  mode: PomoMode
  phase: PomoPhase
  breakKind?: 'short' | 'long'
  /** false = paused (meaningful when phase !== idle) */
  running: boolean
  /** When the current running segment started */
  segStart?: number
  /** Milliseconds run before segStart */
  elapsed: number
  /** Target length (pomodoro or break) in ms; 0 for the stopwatch */
  duration: number
  taskId?: string
  /** Pomodoros finished in this round (a long break every 4) */
  count: number
}

export interface PomoSnapshot extends PomoCore {
  now: number
  /** Milliseconds timed */
  elapsedMs: number
  /** Milliseconds left (0 for the stopwatch) */
  remaining: number
  /** Progress, 0..1 */
  progress: number
  /** The mm:ss time in the middle of the ring */
  display: string
  /** Whether a focus or break is under way (paused included) */
  active: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

// The settings UI keeps this at 5+ minutes; the low floor (3 s) only lets tests and recordings use short pomodoros.
const pomoMs = () => Math.max(0.05, getData().settings.pomoMinutes || 25) * MIN

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
/** Listeners told when a focus or break runs out while the page is open (the view celebrates a finished pomodoro). */
const doneSubs = new Set<(phase: 'focus' | 'break') => void>()
let timer: number | undefined
let baseTitle = typeof document !== 'undefined' ? document.title : 'TickDone'

function elapsedOf(c: PomoCore, now: number) {
  return c.elapsed + (c.running && c.segStart ? Math.max(0, now - c.segStart) : 0)
}

function derive(c: PomoCore, now: number): PomoSnapshot {
  // While idle, the pomodoro length follows the settings
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
    const phase = t(snap.phase === 'break' ? 'core.pomo.phase.break' : snap.mode === 'stopwatch' ? 'core.pomo.phase.stopwatch' : 'core.pomo.phase.focus')
    document.title = t(snap.running ? 'core.pomo.title' : 'core.pomo.titlePaused', { time: snap.display, phase }) + ' - TickDone'
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

// ---------------- Alerts ----------------
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

/** Time is up: a finished pomodoro is recorded and a break starts; a finished break goes back to idle. */
function complete(now: number) {
  const c = core
  // End time = segment start + what was left (earlier than now when restored after a reload)
  const end = c.segStart ? c.segStart + (c.duration - c.elapsed) : now
  const late = now - end > MIN // it ran out while the page was closed: no sound
  if (c.phase === 'focus') {
    addRecord(end - c.duration, end, 'pomo', c.taskId)
    const count = c.count + 1
    const s = getData().settings
    const long = count % 4 === 0
    const mins = Math.max(1, (long ? s.longBreak : s.shortBreak) || (long ? 15 : 5))
    if (!late) {
      ring(4)
      const task = taskTitle(c.taskId)
      notify(
        t('core.pomo.focusDone.title'),
        task ? t('core.pomo.focusDone.bodyTask', { task, count: mins }) : t('core.pomo.focusDone.body', { count: mins }),
      )
    }
    const breakDur = mins * MIN
    // Start the break; if the break also ran out while the page was closed, go straight back to idle
    if (late && now - end >= breakDur) set(idleCore('pomo', c.taskId, count))
    else set({ ...c, phase: 'break', breakKind: long ? 'long' : 'short', running: true, segStart: end, elapsed: 0, duration: breakDur, count })
    if (!late) doneSubs.forEach((f) => f('focus'))
  } else if (c.phase === 'break') {
    if (!late) {
      ring(3)
      notify(t('core.pomo.breakDone.title'), t('core.pomo.breakDone.body'))
    }
    set(idleCore('pomo', c.taskId, c.count))
    if (!late) doneSubs.forEach((f) => f('break'))
  }
}

export function onPomoDone(f: (phase: 'focus' | 'break') => void) {
  doneSubs.add(f)
  return () => {
    doneSubs.delete(f)
  }
}

// ---------------- Actions ----------------
export function setPomoMode(mode: PomoMode) {
  if (core.phase !== 'idle') return
  set(idleCore(mode, core.taskId, core.count))
}

export function setPomoTask(taskId?: string) {
  set({ ...core, taskId })
}

/** Starts focusing (optionally on a task). While already focusing, only switches the task. */
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

/** Abandon: nothing is recorded */
export function abandonPomo() {
  set(idleCore(core.mode, core.taskId, core.count))
}

/** Finish: recorded if at least 1 minute (a pomodoro ended early counts as free focus, not as a pomodoro) */
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

// ---------------- Subscriptions ----------------
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => subs.delete(f)
}
export const getPomo = () => snap
export const usePomo = () => useSyncExternalStore(subscribe, getPomo)

// On start: resume the timer and handle a timer that ran out while the page was closed
if (typeof window !== 'undefined') {
  if (document.title.includes(' - TickDone') && /^\d/.test(document.title)) baseTitle = 'TickDone'
  syncTimer()
  if (core.phase !== 'idle') {
    tick()
    updateTitle()
  }
}

/** Refreshes the idle display after the pomodoro length changes in Settings (called by PomoView) */
export function refreshPomo() {
  if (core.phase === 'idle') emit()
}
