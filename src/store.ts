import { useSyncExternalStore } from 'react'
import { addDays } from 'date-fns'
import { fmt, nextOccurrence } from './dates'
import type { AppData, Habit, Task, TaskList, ViewPrefs } from './types'

const KEY = 'tickdone:data:v1'
const UI_KEY = 'tickdone:ui:v1'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export const LIST_COLORS = ['#FF6161', '#FFAC38', '#FFD324', '#E6EA49', '#35D870', '#4CA1FF', '#6E75F4', '#B37FEB', '#FF83C3', '#9C9C9C']

function seed(): AppData {
  const now = Date.now()
  const today = fmt(new Date())
  const mk = (p: Partial<Task> & { title: string }, i: number): Task => ({
    id: uid(),
    content: '',
    listId: 'inbox',
    tags: [],
    priority: 0,
    status: 0,
    createdAt: now - i,
    modifiedAt: now - i,
    order: i,
    subtasks: [],
    ...p,
  })
  const work: TaskList = { id: uid(), name: '工作', color: '#4CA1FF', sections: [], view: 'list', order: 1 }
  const life: TaskList = { id: uid(), name: '生活', color: '#35D870', sections: [], view: 'list', order: 2 }
  return {
    version: 1,
    lists: [work, life],
    folders: [],
    tags: [{ name: '重要', color: '#FF6161' }, { name: '阅读', color: '#6E75F4' }],
    habits: [
      { id: uid(), name: '早起', icon: '🌅', color: '#FFAC38', checkins: {}, createdAt: now, order: 0 },
      { id: uid(), name: '喝水', icon: '💧', color: '#4CA1FF', checkins: {}, createdAt: now, order: 1 },
      { id: uid(), name: '阅读', icon: '📖', color: '#6E75F4', checkins: {}, createdAt: now, order: 2 },
    ],
    focus: [],
    settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
    tasks: [
      mk({ title: '欢迎使用 TickDone 👋', content: '点击任务查看详情，在右侧可以编辑日期、优先级、子任务和描述。', dueDate: today }, 0),
      mk(
        {
          title: '试试快速添加：在输入框输入「明天下午3点 开会 !高 #重要」',
          dueDate: today,
          priority: 5,
          tags: ['重要'],
        },
        1,
      ),
      mk(
        {
          title: '整理本周工作计划',
          listId: work.id,
          dueDate: fmt(addDays(new Date(), 1)),
          dueTime: '10:00',
          priority: 3,
          subtasks: [
            { id: uid(), title: '回顾上周进展', done: true },
            { id: uid(), title: '列出本周重点', done: false },
          ],
        },
        2,
      ),
      mk({ title: '读完《原则》第三章', listId: life.id, tags: ['阅读'], priority: 1, dueDate: fmt(addDays(new Date(), 3)) }, 3),
      mk({ title: '买菜', listId: life.id }, 4),
    ],
  }
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as AppData
  } catch {
    /* ignore */
  }
  return seed()
}

let data: AppData = load()
const subs = new Set<() => void>()
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => subs.delete(f)
}
let saveTimer: number | undefined
function save() {
  saveTimer = undefined
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
}
function persist() {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(save, 150)
}
/** 页面隐藏、刷新或关闭时立刻写入还没落盘的修改 */
function flush() {
  if (saveTimer === undefined) return
  clearTimeout(saveTimer)
  save()
}
window.addEventListener('pagehide', flush)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush()
})

export const getData = () => data
export function setData(fn: (d: AppData) => AppData) {
  data = fn(data)
  persist()
  subs.forEach((f) => f())
}
export const useData = () => useSyncExternalStore(subscribe, getData)

// ---------------- UI 状态 ----------------
export type Module = 'tasks' | 'calendar' | 'matrix' | 'pomo' | 'habit' | 'search'

export interface Toast {
  id: string
  text: string
  undo?: AppData
}

export interface Menu {
  x: number
  y: number
  kind: 'task' | 'list' | 'tag' | 'section'
  id: string
}

export interface UIState {
  module: Module
  view: string // 'today' | 'tomorrow' | 'week' | 'inbox' | 'all' | 'completed' | 'wontdo' | 'trash' | 'list:<id>' | 'tag:<name>'
  selectedTaskId?: string
  prefs: Record<string, ViewPrefs>
  collapsed: Record<string, boolean>
  sidebarHidden: boolean
  /** 手机上侧栏抽屉是否打开（不持久化） */
  drawerOpen: boolean
  toast?: Toast
  menu?: Menu
  dialog?: { kind: 'list' | 'tag' | 'folder' | 'settings' | 'habit' | 'shortcuts'; id?: string }
  search: string
}

function loadUI(): UIState {
  const base: UIState = { module: 'tasks', view: 'today', prefs: {}, collapsed: {}, sidebarHidden: false, drawerOpen: false, search: '' }
  try {
    const raw = localStorage.getItem(UI_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return { ...base, module: p.module ?? 'tasks', view: p.view ?? 'today', prefs: p.prefs ?? {}, collapsed: p.collapsed ?? {}, sidebarHidden: !!p.sidebarHidden }
    }
  } catch {
    /* ignore */
  }
  return base
}

let ui: UIState = loadUI()
const uiSubs = new Set<() => void>()
const uiSubscribe = (f: () => void) => {
  uiSubs.add(f)
  return () => uiSubs.delete(f)
}
export const getUI = () => ui
export function setUI(p: Partial<UIState> | ((u: UIState) => Partial<UIState>)) {
  const patch = typeof p === 'function' ? p(ui) : p
  ui = { ...ui, ...patch }
  try {
    const { module, view, prefs, collapsed, sidebarHidden } = ui
    localStorage.setItem(UI_KEY, JSON.stringify({ module, view, prefs, collapsed, sidebarHidden }))
  } catch {
    /* ignore */
  }
  uiSubs.forEach((f) => f())
}
export const useUI = () => useSyncExternalStore(uiSubscribe, getUI)

let toastTimer: number | undefined
export function toast(text: string, undo?: AppData) {
  clearTimeout(toastTimer)
  setUI({ toast: { id: uid(), text, undo } })
  toastTimer = window.setTimeout(() => setUI({ toast: undefined }), 4000)
}
export function undoToast() {
  const t = ui.toast
  if (t?.undo) {
    const snap = t.undo
    setData(() => snap)
  }
  setUI({ toast: undefined })
}

// ---------------- 任务操作 ----------------
export function addTask(p: Partial<Task> & { title: string }): Task {
  const now = Date.now()
  const minOrder = Math.min(0, ...data.tasks.map((t) => t.order))
  const t: Task = {
    id: uid(),
    content: '',
    listId: 'inbox',
    tags: [],
    priority: 0,
    status: 0,
    createdAt: now,
    modifiedAt: now,
    order: minOrder - 1,
    subtasks: [],
    ...p,
  }
  setData((d) => {
    const known = new Set(d.tags.map((x) => x.name))
    const newTags = t.tags.filter((x) => !known.has(x)).map((name) => ({ name }))
    return { ...d, tasks: [...d.tasks, t], tags: newTags.length ? [...d.tags, ...newTags] : d.tags }
  })
  return t
}

export function updateTask(id: string, p: Partial<Task>) {
  setData((d) => {
    const known = new Set(d.tags.map((x) => x.name))
    const newTags = (p.tags ?? []).filter((x) => !known.has(x)).map((name) => ({ name }))
    return {
      ...d,
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...p, modifiedAt: Date.now() } : t)),
      tags: newTags.length ? [...d.tags, ...newTags] : d.tags,
    }
  })
}

export function toggleTask(id: string) {
  const t = data.tasks.find((x) => x.id === id)
  if (!t) return
  const snap = data
  if (t.status !== 0) {
    updateTask(id, { status: 0, completedAt: undefined })
    return
  }
  if (t.repeat && t.dueDate) {
    // 重复任务：生成一条已完成记录，原任务顺延到下一次
    const done: Task = { ...t, id: uid(), status: 2, completedAt: Date.now(), repeat: null }
    const next = nextOccurrence(t.dueDate, t.repeat)
    setData((d) => ({
      ...d,
      tasks: [
        ...d.tasks.map((x) =>
          x.id === id ? { ...x, dueDate: next, subtasks: x.subtasks.map((s) => ({ ...s, done: false })), modifiedAt: Date.now() } : x,
        ),
        done,
      ],
    }))
    toast(`已完成，下次：${next}`, snap)
  } else {
    updateTask(id, { status: 2, completedAt: Date.now() })
    toast(`已完成「${t.title || '无标题'}」`, snap)
  }
  playDing()
}

export function wontDo(id: string) {
  const snap = data
  updateTask(id, { status: -1, completedAt: Date.now() })
  toast('已放弃', snap)
}

export function deleteTask(id: string) {
  const snap = data
  const t = data.tasks.find((x) => x.id === id)
  if (!t) return
  if (t.deleted) {
    setData((d) => ({ ...d, tasks: d.tasks.filter((x) => x.id !== id) }))
    toast('已永久删除', snap)
  } else {
    updateTask(id, { deleted: true })
    toast('已删除，可在垃圾桶恢复', snap)
  }
  if (ui.selectedTaskId === id) setUI({ selectedTaskId: undefined })
}

export function duplicateTask(id: string) {
  const t = data.tasks.find((x) => x.id === id)
  if (!t) return
  const copy: Task = { ...t, id: uid(), createdAt: Date.now(), modifiedAt: Date.now(), order: t.order + 0.5, subtasks: t.subtasks.map((s) => ({ ...s, id: uid() })) }
  setData((d) => ({ ...d, tasks: [...d.tasks, copy] }))
  setUI({ selectedTaskId: copy.id })
}

/** 把 id 移动到 targetId 之前/之后（拖拽排序） */
export function reorderTask(id: string, targetId: string, after: boolean, patch: Partial<Task> = {}) {
  setData((d) => {
    const sorted = [...d.tasks].sort((a, b) => a.order - b.order).filter((t) => t.id !== id)
    const idx = sorted.findIndex((t) => t.id === targetId)
    const moving = d.tasks.find((t) => t.id === id)
    if (!moving || idx < 0) return d
    sorted.splice(after ? idx + 1 : idx, 0, { ...moving, ...patch })
    const order = new Map(sorted.map((t, i) => [t.id, i]))
    return { ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch, order: order.get(t.id)! } : { ...t, order: order.get(t.id)! })) }
  })
}

// ---------------- 清单 / 标签 ----------------
export function addList(p: Partial<TaskList> & { name: string }): TaskList {
  const l: TaskList = { id: uid(), sections: [], view: 'list', order: data.lists.length + 1, color: undefined, ...p }
  setData((d) => ({ ...d, lists: [...d.lists, l] }))
  return l
}
export function updateList(id: string, p: Partial<TaskList>) {
  setData((d) => ({ ...d, lists: d.lists.map((l) => (l.id === id ? { ...l, ...p } : l)) }))
}
export function deleteList(id: string) {
  const snap = data
  setData((d) => ({
    ...d,
    lists: d.lists.filter((l) => l.id !== id),
    tasks: d.tasks.map((t) => (t.listId === id ? { ...t, deleted: true } : t)),
  }))
  if (ui.view === 'list:' + id) setUI({ view: 'inbox' })
  toast('清单已删除', snap)
}
export function renameTag(old: string, name: string, color?: string) {
  setData((d) => ({
    ...d,
    tags: d.tags.map((t) => (t.name === old ? { name, color: color ?? t.color } : t)),
    tasks: d.tasks.map((t) => (t.tags.includes(old) ? { ...t, tags: t.tags.map((x) => (x === old ? name : x)) } : t)),
  }))
  if (ui.view === 'tag:' + old) setUI({ view: 'tag:' + name })
}
export function deleteTag(name: string) {
  const snap = data
  setData((d) => ({
    ...d,
    tags: d.tags.filter((t) => t.name !== name),
    tasks: d.tasks.map((t) => (t.tags.includes(name) ? { ...t, tags: t.tags.filter((x) => x !== name) } : t)),
  }))
  if (ui.view === 'tag:' + name) setUI({ view: 'inbox' })
  toast('标签已删除', snap)
}

// ---------------- 习惯 ----------------
export function toggleCheckin(id: string, date: string) {
  setData((d) => ({
    ...d,
    habits: d.habits.map((h) => {
      if (h.id !== id) return h
      const c = { ...h.checkins }
      if (c[date]) delete c[date]
      else c[date] = true
      return { ...h, checkins: c }
    }),
  }))
}
export function upsertHabit(h: Partial<Habit> & { name: string }) {
  setData((d) => {
    if (h.id && d.habits.some((x) => x.id === h.id)) return { ...d, habits: d.habits.map((x) => (x.id === h.id ? { ...x, ...h } : x)) }
    const nh: Habit = { id: uid(), icon: '✅', color: '#4772FA', checkins: {}, createdAt: Date.now(), order: d.habits.length, ...h }
    return { ...d, habits: [...d.habits, nh] }
  })
}

// ---------------- 声音 ----------------
let ac: AudioContext | undefined
export function playDing(freq = 880) {
  try {
    ac ??= new AudioContext()
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.frequency.value = freq
    o.type = 'sine'
    g.gain.setValueAtTime(0.0001, ac.currentTime)
    g.gain.exponentialRampToValueAtTime(0.15, ac.currentTime + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.35)
    o.connect(g).connect(ac.destination)
    o.start()
    o.stop(ac.currentTime + 0.4)
  } catch {
    /* ignore */
  }
}
