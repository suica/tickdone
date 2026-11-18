import { useSyncExternalStore } from 'react'
import { addDays } from 'date-fns'
import { dueLabel, fmt, todayStr } from './dates'
import { advance, migrateTask } from './repeat'
import { t } from './i18n'
import { EMPTY_SELECTION, type Selection } from './selection'
import type { AppData, Habit, SavedFilter, Task, TaskList, ViewPrefs } from './types'

const KEY = 'tickdone:data:v1'
const UI_KEY = 'tickdone:ui:v1'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export const LIST_COLORS = ['#FF6161', '#FFAC38', '#FFD324', '#E6EA49', '#35D870', '#4CA1FF', '#6E75F4', '#B37FEB', '#FF83C3', '#9C9C9C']

/** First-run sample data. */
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
  // The sample data is written once, in the language the app starts in.
  const work: TaskList = { id: uid(), name: t('core.seed.list.work'), color: '#4CA1FF', sections: [], view: 'list', order: 1 }
  const life: TaskList = { id: uid(), name: t('core.seed.list.personal'), color: '#35D870', sections: [], view: 'list', order: 2 }
  const important = t('core.seed.tag.important')
  const reading = t('core.seed.tag.reading')
  return {
    version: 1,
    lists: [work, life],
    folders: [],
    tags: [{ name: important, color: '#FF6161' }, { name: reading, color: '#6E75F4' }],
    habits: [
      { id: uid(), name: t('core.seed.habit.wakeUpEarly'), icon: '🌅', color: '#FFAC38', checkins: {}, createdAt: now, order: 0 },
      { id: uid(), name: t('core.seed.habit.drinkWater'), icon: '💧', color: '#4CA1FF', checkins: {}, createdAt: now, order: 1 },
      { id: uid(), name: t('core.seed.habit.read'), icon: '📖', color: '#6E75F4', checkins: {}, createdAt: now, order: 2 },
    ],
    focus: [],
    settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
    tasks: [
      mk({ title: t('core.seed.task.welcome'), content: t('core.seed.task.welcomeNote'), dueDate: today }, 0),
      mk(
        {
          title: t('core.seed.task.quickAdd', { example: t('core.seed.quickAddExample', { tag: important }) }),
          dueDate: today,
          priority: 5,
          tags: [important],
        },
        1,
      ),
      mk(
        {
          title: t('core.seed.task.weeklyPlan'),
          listId: work.id,
          dueDate: fmt(addDays(new Date(), 1)),
          dueTime: '10:00',
          priority: 3,
          subtasks: [
            { id: uid(), title: t('core.seed.subtask.reviewLastWeek'), done: true },
            { id: uid(), title: t('core.seed.subtask.listPriorities'), done: false },
          ],
        },
        2,
      ),
      mk({ title: t('core.seed.task.readBook'), listId: life.id, tags: [reading], priority: 1, dueDate: fmt(addDays(new Date(), 3)) }, 3),
      mk({ title: t('core.seed.task.groceries'), listId: life.id }, 4),
    ],
  }
}

/** Brings saved data up to date (repeat rules from before explicit days); returns the same object when nothing changed. */
export function migrateData(d: AppData): AppData {
  if (!Array.isArray(d.tasks)) return d
  let changed = false
  const tasks = d.tasks.map((x) => {
    const m = migrateTask(x)
    if (m !== x) changed = true
    return m
  })
  return changed ? { ...d, tasks } : d
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return migrateData(JSON.parse(raw) as AppData)
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
/** Writes pending changes right away when the page is hidden, reloaded or closed. */
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
/** Calls `f` after every data change. */
export const subscribeData = subscribe

// ---------------- UI state ----------------
export type Module = 'tasks' | 'calendar' | 'matrix' | 'pomo' | 'habit' | 'stats' | 'search'

export interface Toast {
  id: string
  text: string
  undo?: AppData
  /** Undoes something outside the app data (or alongside it), such as a snoozed reminder. */
  undoFn?: () => void
}

export interface Menu {
  x: number
  y: number
  kind: 'task' | 'list' | 'tag' | 'section' | 'filter'
  id: string
}

export interface UIState {
  module: Module
  view: string // 'today' | 'tomorrow' | 'week' | 'inbox' | 'all' | 'completed' | 'wontdo' | 'trash' | 'list:<id>' | 'tag:<name>' | 'filter:<id>'
  /** The task the detail shows and the keyboard is on (the selection's cursor). */
  selectedTaskId?: string
  /** Tasks selected together (two or more; any number in selection mode). Not persisted. */
  selectedIds: string[]
  /** Where a Shift range starts. */
  selectAnchor?: string
  /** Selection mode: rows show check marks and a tap selects (phones, or "Select" in the list menu). */
  selectMode: boolean
  prefs: Record<string, ViewPrefs>
  collapsed: Record<string, boolean>
  sidebarHidden: boolean
  /** Whether the sidebar drawer is open on phones (not persisted). */
  drawerOpen: boolean
  /** Desktop task detail width in px after the user dragged the divider; undefined = automatic width. Persisted. */
  detailWidth?: number
  toast?: Toast
  menu?: Menu
  dialog?: { kind: 'list' | 'tag' | 'folder' | 'filter' | 'settings' | 'habit' | 'shortcuts'; id?: string }
  search: string
}

function loadUI(): UIState {
  const base: UIState = { module: 'tasks', view: 'today', selectedIds: [], selectMode: false, prefs: {}, collapsed: {}, sidebarHidden: false, drawerOpen: false, search: '' }
  try {
    const raw = localStorage.getItem(UI_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      const detailWidth = typeof p.detailWidth === 'number' && p.detailWidth > 0 ? p.detailWidth : undefined
      return { ...base, module: p.module ?? 'tasks', view: p.view ?? 'today', prefs: p.prefs ?? {}, collapsed: p.collapsed ?? {}, sidebarHidden: !!p.sidebarHidden, detailWidth }
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
    const { module, view, prefs, collapsed, sidebarHidden, detailWidth } = ui
    localStorage.setItem(UI_KEY, JSON.stringify({ module, view, prefs, collapsed, sidebarHidden, detailWidth }))
  } catch {
    /* ignore */
  }
  uiSubs.forEach((f) => f())
}
export const useUI = () => useSyncExternalStore(uiSubscribe, getUI)

// ---------------- Selection ----------------
export const getSelection = (u: UIState = ui): Selection => ({ ids: u.selectedIds, cursor: u.selectedTaskId, anchor: u.selectAnchor, mode: u.selectMode })
export function setSelection(s: Selection) {
  setUI({ selectedIds: s.ids, selectedTaskId: s.cursor, selectAnchor: s.anchor, selectMode: s.mode })
}
/** Ends a multi-selection and selection mode; the cursor stays, so the detail keeps its task. */
export function clearSelection(keepCursor = true) {
  setSelection({ ...EMPTY_SELECTION, cursor: keepCursor ? ui.selectedTaskId : undefined, anchor: keepCursor ? ui.selectedTaskId : undefined })
}

/** Changes several tasks in one step: one toast, one undo back to the data from before. */
export function runBatch(text: string, change: (d: AppData) => AppData): boolean {
  const snap = data
  setData(change)
  if (data === snap) return false
  toast(text, snap)
  return true
}

let toastTimer: number | undefined
export function toast(text: string, undo?: AppData, undoFn?: () => void) {
  clearTimeout(toastTimer)
  setUI({ toast: { id: uid(), text, undo, undoFn } })
  toastTimer = window.setTimeout(() => setUI({ toast: undefined }), 4000)
}
export function undoToast() {
  const t = ui.toast
  if (t?.undo) {
    const snap = t.undo
    setData(() => snap)
  }
  t?.undoFn?.()
  setUI({ toast: undefined })
}

// ---------------- Tasks ----------------
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
  const task = data.tasks.find((x) => x.id === id)
  if (!task) return
  const snap = data
  if (task.status !== 0) {
    updateTask(id, { status: 0, completedAt: undefined })
    return
  }
  let text: string
  const step = advance(task, todayStr(), data.settings.weekStartsOn)
  if (step?.next) {
    // Repeating task: add a completed copy and move the task itself to its next date
    const done: Task = { ...task, id: uid(), status: 2, completedAt: Date.now(), repeat: null }
    const next = step.dueDate
    setData((d) => ({
      ...d,
      tasks: [
        ...d.tasks.map((x) =>
          x.id === id ? { ...x, dueDate: next, repeat: step.repeat, subtasks: x.subtasks.map((s) => ({ ...s, done: false })), modifiedAt: Date.now() } : x,
        ),
        done,
      ],
    }))
    text = t('core.toast.completedNext', { date: dueLabel({ dueDate: next }) })
  } else {
    // A plain task, or the last occurrence of a series (its count is reached or its end date passed)
    updateTask(id, { status: 2, completedAt: Date.now(), ...(step ? { repeat: step.repeat } : {}) })
    text = t('core.toast.completed', { title: task.title || t('common.untitled') })
  }
  // The first ding creates the AudioContext, which can take seconds on a busy machine; start the
  // undo toast's countdown only after that.
  playDing()
  toast(text, snap)
}

/** Whether a task repeats and has an occurrence after the current one, so it can be skipped. */
export function canSkip(task: Task): boolean {
  return task.status === 0 && !task.deleted && !!advance(task, todayStr(), data.settings.weekStartsOn)?.next
}

/** Skips the current occurrence of a repeating task: it moves to its next date without a completed copy. */
export function skipOccurrence(id: string) {
  const task = data.tasks.find((x) => x.id === id)
  if (!task || !canSkip(task)) return
  const step = advance(task, todayStr(), data.settings.weekStartsOn)
  if (!step?.next) return
  const snap = data
  updateTask(id, { dueDate: step.dueDate, repeat: step.repeat, subtasks: task.subtasks.map((s) => ({ ...s, done: false })) })
  toast(t('core.toast.skipped', { date: dueLabel({ dueDate: step.dueDate }) }), snap)
}

export function wontDo(id: string) {
  const snap = data
  updateTask(id, { status: -1, completedAt: Date.now() })
  toast(t('core.toast.wontDo'), snap)
}

export function deleteTask(id: string) {
  const snap = data
  const task = data.tasks.find((x) => x.id === id)
  if (!task) return
  if (task.deleted) {
    setData((d) => ({ ...d, tasks: d.tasks.filter((x) => x.id !== id) }))
    toast(t('core.toast.deletedForever'), snap)
  } else {
    updateTask(id, { deleted: true })
    toast(t('core.toast.deleted'), snap)
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

/** Moves task `id` before or after `targetId` (drag to reorder). */
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

// ---------------- Lists and tags ----------------
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
  toast(t('core.toast.listDeleted'), snap)
}
/** Archives a list (or brings it back); undo from the toast. */
export function archiveList(id: string, archived = true) {
  const snap = data
  const l = data.lists.find((x) => x.id === id)
  if (!l || !!l.archived === archived) return
  setData((d) => ({ ...d, lists: d.lists.map((x) => (x.id === id ? { ...x, archived: archived || undefined } : x)) }))
  // Tasks of an archived list are not selected any more outside its own view
  if (archived && ui.view !== 'list:' + id) {
    const sel = ui.selectedTaskId && data.tasks.find((x) => x.id === ui.selectedTaskId)
    if (sel && sel.listId === id) setUI({ selectedTaskId: undefined })
  }
  toast(t(archived ? 'shell.toast.listArchived' : 'shell.toast.listUnarchived', { name: l.name }), snap)
}
export function renameTag(old: string, name: string, color?: string) {
  setData((d) => ({
    ...d,
    tags: d.tags.map((t) => (t.name === old ? { name, color: color ?? t.color } : t)),
    tasks: d.tasks.map((t) => (t.tags.includes(old) ? { ...t, tags: t.tags.map((x) => (x === old ? name : x)) } : t)),
    // saved filters follow the new name
    filters: d.filters?.map((f) => (f.tags?.includes(old) ? { ...f, tags: f.tags.map((x) => (x === old ? name : x)) } : f)),
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
  toast(t('core.toast.tagDeleted'), snap)
}

// ---------------- Saved filters ----------------
export function addFilter(p: Omit<SavedFilter, 'id' | 'order'>): SavedFilter {
  const f: SavedFilter = { ...p, id: uid(), order: Math.max(0, ...(data.filters ?? []).map((x) => x.order)) + 1 }
  setData((d) => ({ ...d, filters: [...(d.filters ?? []), f] }))
  return f
}
export function updateFilter(id: string, p: Partial<SavedFilter>) {
  setData((d) => ({ ...d, filters: (d.filters ?? []).map((f) => (f.id === id ? { ...f, ...p } : f)) }))
}
export function deleteFilter(id: string) {
  const snap = data
  setData((d) => ({ ...d, filters: (d.filters ?? []).filter((f) => f.id !== id) }))
  if (ui.view === 'filter:' + id) setUI({ view: 'today' })
  toast(t('core.toast.filterDeleted'), snap, () => setUI({ view: 'filter:' + id, module: 'tasks' }))
}

// ---------------- Habits ----------------
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

// ---------------- Sound ----------------
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
