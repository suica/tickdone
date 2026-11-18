import { addDays } from 'date-fns'
import { dayDiff, fmt, todayStr } from './dates'
import { getLocale, t as tr, type MessageKey } from './i18n'
import { fmtMonthDay, fmtWeekday } from './i18n/format'
import { FILTER_PREFIX, filterClock, filterDefaults, filterMatcher, filterOf } from './filters'
import type { AppData, GroupBy, Priority, Task, ViewPrefs } from './types'

/** Smart lists; `name` is a message key. */
export const SMART: { id: string; name: MessageKey; icon: string }[] = [
  { id: 'today', name: 'common.today', icon: 'today' },
  { id: 'tomorrow', name: 'common.tomorrow', icon: 'tomorrow' },
  { id: 'week', name: 'common.list.next7Days', icon: 'week' },
  { id: 'inbox', name: 'common.list.inbox', icon: 'inbox' },
]
export const SMART_BOTTOM: { id: string; name: MessageKey; icon: string }[] = [
  { id: 'completed', name: 'common.list.completed', icon: 'done' },
  { id: 'wontdo', name: 'common.list.wontDo', icon: 'wontdo' },
  { id: 'trash', name: 'common.list.trash', icon: 'trash' },
]

/** Priority levels, highest first; `name` is a message key. */
export const PRIORITY: { v: Priority; name: MessageKey; color: string }[] = [
  { v: 5, name: 'common.priorityGroup.high', color: 'var(--p-high)' },
  { v: 3, name: 'common.priorityGroup.medium', color: 'var(--p-med)' },
  { v: 1, name: 'common.priorityGroup.low', color: 'var(--p-low)' },
  { v: 0, name: 'common.priorityGroup.none', color: 'var(--p-none)' },
]
export const priorityColor = (p: Priority) => PRIORITY.find((x) => x.v === p)!.color

// Memoised by the arrays they read: the data is immutable, so a result stays right until the array changes.
const archivedCache = new WeakMap<object, Set<string>>()
/** The ids of archived lists. */
export function archivedListIds(d: Pick<AppData, 'lists'>): Set<string> {
  let s = archivedCache.get(d.lists)
  if (!s) archivedCache.set(d.lists, (s = new Set(d.lists.filter((l) => l.archived).map((l) => l.id))))
  return s
}

/** Whether a task belongs to an archived list. */
export const inArchivedList = (t: Pick<Task, 'listId'>, d: Pick<AppData, 'lists'>) => archivedListIds(d).has(t.listId)

/** A task that cannot be changed where it is shown: in the trash, or in an archived list. */
export const isLocked = (t: Pick<Task, 'listId' | 'deleted'>, d: Pick<AppData, 'lists'>) => !!t.deleted || inArchivedList(t, d)

/**
 * The tasks views outside a list work with: not deleted and not in an archived list
 * (smart lists, tags, filters, the calendar, the matrix and the counts).
 */
let activeMemo: { tasks: Task[]; lists: AppData['lists']; out: Task[] } | undefined
export function activeTasks(d: Pick<AppData, 'tasks' | 'lists'>): Task[] {
  if (activeMemo?.tasks === d.tasks && activeMemo.lists === d.lists) return activeMemo.out
  const archived = archivedListIds(d)
  const out = d.tasks.filter((t) => !t.deleted && !archived.has(t.listId))
  activeMemo = { tasks: d.tasks, lists: d.lists, out }
  return out
}

/**
 * The number of open tasks in each of `views`, as `tasksForView(view, d).open.length` would count them, in one
 * pass over the tasks (the sidebar shows dozens of counts and updates them on every change).
 */
export function openCounts(views: string[], d: AppData): Record<string, number> {
  const c: Record<string, number> = {}
  for (const v of views) c[v] = 0
  const today = todayStr()
  const week = fmt(addDays(new Date(), 6))
  const tomorrow = fmt(addDays(new Date(), 1))
  const archived = archivedListIds(d)
  const bump = (v: string) => {
    if (v in c) c[v]++
  }
  const filters = views.filter((v) => v.startsWith(FILTER_PREFIX)).flatMap((v) => {
    const f = filterOf(v, d)
    return f ? [[v, filterMatcher(f, filterClock(new Date(), d.settings?.weekStartsOn ?? 1))] as const] : []
  })
  for (const t of d.tasks) {
    if (t.deleted || t.status !== 0) continue
    // a list's own view counts its tasks even when the list is archived
    bump(t.listId === 'inbox' ? 'inbox' : 'list:' + t.listId)
    if (archived.has(t.listId)) continue
    if (t.dueDate) {
      if (t.dueDate <= today) bump('today')
      if (t.dueDate === tomorrow) bump('tomorrow')
      if (t.dueDate <= week) bump('week')
    }
    bump('all')
    for (const tag of new Set(t.tags)) bump('tag:' + tag)
    for (const [v, match] of filters) if (match(t)) c[v]++
  }
  return c
}

/** Lists in the sidebar's lists section and in "move to" menus: the ones not archived. */
export const activeLists = (d: Pick<AppData, 'lists'>) => d.lists.filter((l) => !l.archived)

/** Properties a new task gets from the view it is added in (a filter's view needs the data). */
export function viewDefaults(view: string, d?: AppData): Partial<Task> {
  if (view.startsWith(FILTER_PREFIX)) {
    const f = d && filterOf(view, d)
    return f && d ? filterDefaults(f, d, filterClock(new Date(), d.settings?.weekStartsOn ?? 1)) : {}
  }
  if (view === 'today') return { dueDate: todayStr() }
  if (view === 'tomorrow') return { dueDate: fmt(addDays(new Date(), 1)) }
  if (view === 'week') return { dueDate: todayStr() }
  if (view.startsWith('list:')) return { listId: view.slice(5) }
  if (view.startsWith('tag:')) return { tags: [view.slice(4)] }
  return {}
}

export function defaultPrefs(view: string): ViewPrefs {
  if (view.startsWith('list:') || view === 'inbox') return { groupBy: 'section', sortBy: 'custom' }
  if (view.startsWith('tag:')) return { groupBy: 'list', sortBy: 'date' }
  if (view === 'completed' || view === 'wontdo' || view === 'trash') return { groupBy: 'none', sortBy: 'date' }
  return { groupBy: 'date', sortBy: 'date' }
}

/** The tasks a view shows, in two parts: open and completed. */
export function tasksForView(view: string, d: AppData): { open: Task[]; done: Task[] } {
  // A list's own view shows all its tasks, archived or not; every other view leaves archived lists out.
  const own = view.startsWith('list:') && d.lists.some((l) => 'list:' + l.id === view)
  const live = own ? d.tasks.filter((t) => !t.deleted) : activeTasks(d)
  const today = todayStr()
  const week = fmt(addDays(new Date(), 6))
  const tomorrow = fmt(addDays(new Date(), 1))
  let match: (t: Task) => boolean
  let doneMatch: ((t: Task) => boolean) | undefined
  switch (view) {
    case 'today':
      match = (t) => !!t.dueDate && t.dueDate <= today
      doneMatch = (t) => !!t.completedAt && fmt(new Date(t.completedAt)) === today
      break
    case 'tomorrow':
      match = (t) => t.dueDate === tomorrow
      break
    case 'week':
      match = (t) => !!t.dueDate && t.dueDate <= week
      doneMatch = (t) => !!t.dueDate && t.dueDate >= today && t.dueDate <= week
      break
    case 'all':
      match = () => true
      break
    case 'completed':
      return { open: [], done: live.filter((t) => t.status === 2).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)) }
    case 'wontdo':
      return { open: [], done: live.filter((t) => t.status === -1).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)) }
    case 'trash':
      return { open: d.tasks.filter((t) => t.deleted).sort((a, b) => b.modifiedAt - a.modifiedAt), done: [] }
    default:
      if (view === 'inbox' || view.startsWith('list:')) {
        const id = view === 'inbox' ? 'inbox' : view.slice(5)
        match = (t) => t.listId === id
      } else if (view.startsWith('tag:')) {
        const tag = view.slice(4)
        match = (t) => t.tags.includes(tag)
      } else if (view.startsWith(FILTER_PREFIX)) {
        const f = filterOf(view, d)
        if (!f) return { open: [], done: [] }
        match = filterMatcher(f, filterClock(new Date(), d.settings?.weekStartsOn ?? 1))
        // completed tasks are part of a filter only when it says so
        if (!f.showCompleted) doneMatch = () => false
      } else match = () => false
  }
  return {
    open: live.filter((t) => t.status === 0 && match(t)),
    done: live.filter((t) => t.status === 2 && (doneMatch ?? match)(t)).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
  }
}

export function sortTasks(tasks: Task[], sortBy: ViewPrefs['sortBy']): Task[] {
  const arr = [...tasks]
  // the date keys are built once per task, not once per comparison
  const keys = new Map<Task, string>()
  if (sortBy === 'date' || sortBy === 'priority') for (const t of arr) keys.set(t, t.dueDate ? t.dueDate + (t.dueTime ?? '99:99') : '9999')
  const dateKey = (t: Task) => keys.get(t)!
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0)
  arr.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    switch (sortBy) {
      case 'title':
        return a.title.localeCompare(b.title, getLocale())
      case 'priority':
        return b.priority - a.priority || cmp(dateKey(a), dateKey(b)) || a.order - b.order
      case 'date':
        return cmp(dateKey(a), dateKey(b)) || b.priority - a.priority || a.order - b.order
      default:
        return a.order - b.order
    }
  })
  return arr
}

export interface Group {
  key: string
  name: string
  tasks: Task[]
  /** Properties applied to a task dropped into this group */
  patch?: Partial<Task>
  overdue?: boolean
  /** The group of pinned tasks, shown first */
  pinned?: boolean
  /** A fixed heading (a message key), translated when shown */
  nameKey?: MessageKey
}

/** Groupings that put pinned tasks in a group of their own at the top: by date, by section (the
 *  default in lists), and the inbox's default, which has no sections and so no groups. */
const pinGrouped = (groupBy: GroupBy, view: string) => groupBy === 'date' || groupBy === 'section' || (groupBy === 'none' && view === 'inbox')
export const PINNED_GROUP = 'pinned'

export function groupTasks(tasks: Task[], groupBy: GroupBy, d: AppData, view: string): Group[] {
  const map = new Map<string, Group>()
  // a group's name and patch are worked out once, when its first task arrives (not once per task)
  const push = (key: string, name: string | (() => string), t: Task, patch?: Partial<Task> | (() => Partial<Task>), overdue?: boolean) => {
    let g = map.get(key)
    if (!g) map.set(key, (g = { key, name: typeof name === 'function' ? name() : name, tasks: [], patch: typeof patch === 'function' ? patch() : patch, overdue }))
    g.tasks.push(t)
  }
  const listIndex = groupBy === 'list' ? new Map(d.lists.map((l, i) => [l.id, i])) : undefined
  const viewList = groupBy === 'section' ? d.lists.find((x) => 'list:' + x.id === view) : undefined
  const pinGroup = pinGrouped(groupBy, view) && tasks.some((t) => t.pinned)
  if (groupBy === 'none' && !pinGroup) return [{ key: 'all', name: '', tasks }]
  for (const t of tasks) {
    if (pinGroup && t.pinned) {
      push(PINNED_GROUP, tr('tasks.group.pinned'), t, { pinned: true })
      continue
    }
    if (groupBy === 'none') push('all', '', t, {})
    else if (groupBy === 'date') {
      if (!t.dueDate) push('9-none', () => tr('common.noDate'), t, { dueDate: undefined, dueTime: undefined })
      else {
        const diff = dayDiff(t.dueDate)
        if (diff < 0) push('0-overdue', () => tr('common.overdue'), t, undefined, true)
        else if (diff === 0) push('1-today', () => tr('common.today'), t, () => ({ dueDate: todayStr() }))
        else if (diff === 1) push('2-tomorrow', () => tr('common.tomorrow'), t, () => ({ dueDate: fmt(addDays(new Date(), 1)) }))
        else if (diff < 7 && view === 'week') {
          const dd = () => addDays(new Date(), diff)
          push('3-' + diff, () => fmtMonthDay(dd()) + ' ' + fmtWeekday(dd()), t, () => ({ dueDate: fmt(dd()) }))
        } else if (diff < 7) push('3-week', () => tr('common.list.next7Days'), t)
        else push('4-later', () => tr('common.later'), t)
      }
    } else if (groupBy === 'priority') {
      push(String(9 - t.priority), () => tr(PRIORITY.find((p) => p.v === t.priority)!.name), t, { priority: t.priority })
    } else if (groupBy === 'list') {
      const i = listIndex!.get(t.listId)
      const l = i === undefined ? undefined : d.lists[i]
      push(String(i === undefined ? 0 : i + 1).padStart(4, '0'), () => l?.name ?? tr('common.list.inbox'), t, { listId: t.listId })
    } else if (groupBy === 'tag') {
      const tag = t.tags[0]
      push(tag ? '0' + tag : '9', () => (tag ? '#' + tag : tr('tasks.group.noTag')), t)
    } else if (groupBy === 'section') {
      const l = viewList
      const i = t.sectionId && l ? l.sections.findIndex((x) => x.id === t.sectionId) : -1
      const s = i >= 0 ? l!.sections[i] : undefined
      push(String(i + 1).padStart(4, '0'), s?.name ?? '', t, { sectionId: s?.id })
    }
  }
  // List sections: include the empty ones too
  if (groupBy === 'section') {
    const l = d.lists.find((x) => 'list:' + x.id === view)
    l?.sections.forEach((s, i) => {
      const k = String(i + 1).padStart(4, '0')
      if (!map.has(k)) map.set(k, { key: k, name: s.name, tasks: [], patch: { sectionId: s.id } })
    })
  }
  const groups = [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
  if (!pinGroup) return groups
  const pinned = map.get(PINNED_GROUP)!
  pinned.pinned = true
  pinned.nameKey = 'tasks.group.pinned'
  const rest = groups.filter((g) => g !== pinned)
  for (const g of rest) {
    // A task dropped into another group is no longer pinned.
    if (g.patch) g.patch = { ...g.patch, pinned: undefined }
    // The tasks outside any section get a heading, so they don't read as part of the pinned group.
    if ((groupBy === 'section' || groupBy === 'none') && !g.patch?.sectionId && !g.name) {
      g.nameKey = rest.some((x) => x.patch?.sectionId) ? 'tasks.section.none' : 'tasks.group.unpinned'
      g.name = tr(g.nameKey)
    }
  }
  return [pinned, ...rest]
}
