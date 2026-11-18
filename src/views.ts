import { addDays } from 'date-fns'
import { dayDiff, fmt, todayStr } from './dates'
import { getLocale, t as tr, type MessageKey } from './i18n'
import { fmtMonthDay, fmtWeekday } from './i18n/format'
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

/** Properties a new task gets from the view it is added in. */
export function viewDefaults(view: string): Partial<Task> {
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
  const live = d.tasks.filter((t) => !t.deleted)
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
      } else match = () => false
  }
  return {
    open: live.filter((t) => t.status === 0 && match(t)),
    done: live.filter((t) => t.status === 2 && (doneMatch ?? match)(t)).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
  }
}

export function sortTasks(tasks: Task[], sortBy: ViewPrefs['sortBy']): Task[] {
  const arr = [...tasks]
  const dateKey = (t: Task) => (t.dueDate ? t.dueDate + (t.dueTime ?? '99:99') : '9999')
  arr.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    switch (sortBy) {
      case 'title':
        return a.title.localeCompare(b.title, getLocale())
      case 'priority':
        return b.priority - a.priority || dateKey(a).localeCompare(dateKey(b)) || a.order - b.order
      case 'date':
        return dateKey(a).localeCompare(dateKey(b)) || b.priority - a.priority || a.order - b.order
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
}

export function groupTasks(tasks: Task[], groupBy: GroupBy, d: AppData, view: string): Group[] {
  const map = new Map<string, Group>()
  const push = (key: string, name: string, t: Task, patch?: Partial<Task>, overdue?: boolean) => {
    if (!map.has(key)) map.set(key, { key, name, tasks: [], patch, overdue })
    map.get(key)!.tasks.push(t)
  }
  if (groupBy === 'none') return [{ key: 'all', name: '', tasks }]
  for (const t of tasks) {
    if (groupBy === 'date') {
      if (!t.dueDate) push('9-none', tr('common.noDate'), t, { dueDate: undefined, dueTime: undefined })
      else {
        const diff = dayDiff(t.dueDate)
        if (diff < 0) push('0-overdue', tr('common.overdue'), t, undefined, true)
        else if (diff === 0) push('1-today', tr('common.today'), t, { dueDate: todayStr() })
        else if (diff === 1) push('2-tomorrow', tr('common.tomorrow'), t, { dueDate: fmt(addDays(new Date(), 1)) })
        else if (diff < 7 && view === 'week') {
          const dd = addDays(new Date(), diff)
          push('3-' + diff, fmtMonthDay(dd) + ' ' + fmtWeekday(dd), t, { dueDate: fmt(dd) })
        } else if (diff < 7) push('3-week', tr('common.list.next7Days'), t)
        else push('4-later', tr('common.later'), t)
      }
    } else if (groupBy === 'priority') {
      const name = PRIORITY.find((p) => p.v === t.priority)!.name
      push(String(9 - t.priority), tr(name), t, { priority: t.priority })
    } else if (groupBy === 'list') {
      const l = d.lists.find((x) => x.id === t.listId)
      const idx = l ? d.lists.indexOf(l) + 1 : 0
      push(String(idx).padStart(4, '0'), l?.name ?? tr('common.list.inbox'), t, { listId: t.listId })
    } else if (groupBy === 'tag') {
      const tag = t.tags[0]
      push(tag ? '0' + tag : '9', tag ? '#' + tag : tr('tasks.group.noTag'), t)
    } else if (groupBy === 'section') {
      const l = d.lists.find((x) => 'list:' + x.id === view)
      const s = l?.sections.find((x) => x.id === t.sectionId)
      const idx = s ? l!.sections.indexOf(s) + 1 : 0
      push(String(idx).padStart(4, '0'), s?.name ?? '', t, { sectionId: s?.id })
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
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
}
