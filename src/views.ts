import { addDays, format } from 'date-fns'
import { dayDiff, fmt, todayStr } from './dates'
import type { AppData, GroupBy, Priority, Task, ViewPrefs } from './types'

export const SMART: { id: string; name: string; icon: string }[] = [
  { id: 'today', name: '今天', icon: 'today' },
  { id: 'tomorrow', name: '明天', icon: 'tomorrow' },
  { id: 'week', name: '最近7天', icon: 'week' },
  { id: 'inbox', name: '收件箱', icon: 'inbox' },
]
export const SMART_BOTTOM: { id: string; name: string; icon: string }[] = [
  { id: 'completed', name: '已完成', icon: 'done' },
  { id: 'wontdo', name: '已放弃', icon: 'wontdo' },
  { id: 'trash', name: '垃圾桶', icon: 'trash' },
]

export const PRIORITY: { v: Priority; name: string; color: string }[] = [
  { v: 5, name: '高优先级', color: 'var(--p-high)' },
  { v: 3, name: '中优先级', color: 'var(--p-med)' },
  { v: 1, name: '低优先级', color: 'var(--p-low)' },
  { v: 0, name: '无优先级', color: 'var(--p-none)' },
]
export const priorityColor = (p: Priority) => PRIORITY.find((x) => x.v === p)!.color

export function viewTitle(view: string, d: AppData): string {
  const s = [...SMART, ...SMART_BOTTOM, { id: 'all', name: '所有' }].find((x) => x.id === view)
  if (s) return s.name
  if (view.startsWith('list:')) return d.lists.find((l) => 'list:' + l.id === view)?.name ?? '清单'
  if (view.startsWith('tag:')) return '#' + view.slice(4)
  return ''
}

/** 新建任务时由视图带出的默认属性 */
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

/** 视图包含的任务（未完成 + 已完成两部分） */
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
        return a.title.localeCompare(b.title, 'zh')
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
  /** 拖进该分组时应用到任务的属性 */
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
      if (!t.dueDate) push('9-none', '无日期', t, { dueDate: undefined, dueTime: undefined })
      else {
        const diff = dayDiff(t.dueDate)
        if (diff < 0) push('0-overdue', '已过期', t, undefined, true)
        else if (diff === 0) push('1-today', '今天', t, { dueDate: todayStr() })
        else if (diff === 1) push('2-tomorrow', '明天', t, { dueDate: fmt(addDays(new Date(), 1)) })
        else if (diff < 7 && view === 'week') {
          const dd = addDays(new Date(), diff)
          push('3-' + diff, format(dd, 'M月d日') + ' ' + '周' + '日一二三四五六'[dd.getDay()], t, { dueDate: fmt(dd) })
        } else if (diff < 7) push('3-week', '最近7天', t)
        else push('4-later', '以后', t)
      }
    } else if (groupBy === 'priority') {
      const names: Record<number, string> = { 5: '高优先级', 3: '中优先级', 1: '低优先级', 0: '无优先级' }
      push(String(9 - t.priority), names[t.priority], t, { priority: t.priority })
    } else if (groupBy === 'list') {
      const l = d.lists.find((x) => x.id === t.listId)
      const idx = l ? d.lists.indexOf(l) + 1 : 0
      push(String(idx).padStart(4, '0'), l?.name ?? '收件箱', t, { listId: t.listId })
    } else if (groupBy === 'tag') {
      const tag = t.tags[0]
      push(tag ? '0' + tag : '9', tag ? '#' + tag : '无标签', t)
    } else if (groupBy === 'section') {
      const l = d.lists.find((x) => 'list:' + x.id === view)
      const s = l?.sections.find((x) => x.id === t.sectionId)
      const idx = s ? l!.sections.indexOf(s) + 1 : 0
      push(String(idx).padStart(4, '0'), s?.name ?? '', t, { sectionId: s?.id })
    }
  }
  // 清单分栏：把空栏也列出
  if (groupBy === 'section') {
    const l = d.lists.find((x) => 'list:' + x.id === view)
    l?.sections.forEach((s, i) => {
      const k = String(i + 1).padStart(4, '0')
      if (!map.has(k)) map.set(k, { key: k, name: s.name, tasks: [], patch: { sectionId: s.id } })
    })
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
}
