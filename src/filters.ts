import { addDays, endOfWeek, startOfWeek } from 'date-fns'
import { fmt } from './dates'
import type { AppData, FilterDate, Priority, SavedFilter, Task } from './types'

// Saved filters: smart lists built from conditions. A filter's view id is "filter:<id>".

export const FILTER_PREFIX = 'filter:'
export const FILTER_DATES: FilterDate[] = ['overdue', 'today', 'tomorrow', 'thisWeek', 'next7', 'noDate', 'custom']
/** Icons a filter can have in the sidebar (names from components/Icon). */
export const FILTER_ICONS = ['filter', 'flag', 'sun', 'clock', 'focus', 'pin', 'bell', 'tag'] as const

export const filterOf = (view: string, d: AppData): SavedFilter | undefined =>
  view.startsWith(FILTER_PREFIX) ? d.filters?.find((f) => FILTER_PREFIX + f.id === view) : undefined

/** Filters in sidebar order. */
export const sortedFilters = (d: AppData): SavedFilter[] => [...(d.filters ?? [])].sort((a, b) => a.order - b.order)

/** The days a filter's date conditions compare against, computed once per match run. */
export interface FilterClock {
  today: string
  tomorrow: string
  next7: string
  weekStart: string
  weekEnd: string
}

export function filterClock(now: Date = new Date(), weekStartsOn: 0 | 1 = 1): FilterClock {
  return {
    today: fmt(now),
    tomorrow: fmt(addDays(now, 1)),
    next7: fmt(addDays(now, 6)),
    weekStart: fmt(startOfWeek(now, { weekStartsOn })),
    weekEnd: fmt(endOfWeek(now, { weekStartsOn })),
  }
}

function dateMatches(kind: FilterDate, t: Task, f: SavedFilter, c: FilterClock): boolean {
  const due = t.dueDate
  if (kind === 'noDate') return !due
  if (!due) return false
  switch (kind) {
    case 'overdue':
      return due < c.today
    case 'today':
      return due === c.today
    case 'tomorrow':
      return due === c.tomorrow
    case 'thisWeek':
      return due >= c.weekStart && due <= c.weekEnd
    case 'next7':
      return due >= c.today && due <= c.next7
    case 'custom':
      // a range with neither end set matches every dated task
      return (!f.from || due >= f.from) && (!f.to || due <= f.to)
  }
}

/** The words of a keyword condition, lower-cased. */
const words = (s: string) => s.toLocaleLowerCase().split(/\s+/).filter(Boolean)

/**
 * The checks of a filter's conditions that are set, one per condition. Conditions left empty are not
 * part of the filter: a filter without any condition matches every task.
 */
function checks(f: SavedFilter, c: FilterClock): ((t: Task) => boolean)[] {
  const out: ((t: Task) => boolean)[] = []
  if (f.lists?.length) {
    const lists = new Set(f.lists)
    out.push((t) => lists.has(t.listId))
  }
  if (f.tags?.length) {
    const tags = f.tags
    out.push(f.tagMode === 'all' ? (t) => tags.every((x) => t.tags.includes(x)) : (t) => tags.some((x) => t.tags.includes(x)))
  }
  if (f.priorities?.length) {
    const ps = new Set<number>(f.priorities)
    out.push((t) => ps.has(t.priority))
  }
  if (f.dates?.length) {
    const ds = f.dates
    out.push((t) => ds.some((k) => dateMatches(k, t, f, c)))
  }
  const ws = f.keyword ? words(f.keyword) : []
  if (ws.length) {
    out.push((t) => {
      const text = [t.title, t.content, ...t.subtasks.map((s) => s.title)].join('\n').toLocaleLowerCase()
      return ws.every((w) => text.includes(w))
    })
  }
  return out
}

/** A function telling whether a task meets the filter's conditions (it does not look at the task's status). */
export function filterMatcher(f: SavedFilter, c: FilterClock = filterClock()): (t: Task) => boolean {
  const cs = checks(f, c)
  if (!cs.length) return () => true
  return f.match === 'any' ? (t) => cs.some((x) => x(t)) : (t) => cs.every((x) => x(t))
}

/** Whether a task meets the filter's conditions. */
export const matchesFilter = (f: SavedFilter, t: Task, c?: FilterClock) => filterMatcher(f, c)(t)

/** The number of conditions that are set. */
export const conditionCount = (f: SavedFilter) => checks(f, filterClock()).length

/**
 * What a task added in a filter's view starts with, so that it shows up there: a list it accepts (none
 * when the inbox is one of them, where tasks go anyway), the tag (all of them when every tag is
 * required), the highest priority it accepts (none when "no priority" is one of them) and a date the
 * date condition accepts. With "any" one condition is enough, so only the first one filled in is used.
 */
export function filterDefaults(f: SavedFilter, d: AppData, c: FilterClock = filterClock()): Partial<Task> {
  const parts: Partial<Task>[] = []
  if (f.lists?.length && !f.lists.includes('inbox')) {
    const id = f.lists.find((x) => d.lists.some((l) => l.id === x))
    if (id) parts.push({ listId: id })
  }
  if (f.tags?.length) parts.push({ tags: f.tagMode === 'all' ? [...f.tags] : [f.tags[0]] })
  if (f.priorities?.length && !f.priorities.includes(0)) parts.push({ priority: Math.max(...f.priorities) as Priority })
  const date = defaultDate(f, c)
  if (date) parts.push({ dueDate: date })
  if (f.match === 'any') return parts[0] ?? {}
  return Object.assign({}, ...parts)
}

function defaultDate(f: SavedFilter, c: FilterClock): string | undefined {
  const ds = f.dates ?? []
  // an open task with no date already matches "no date"
  if (!ds.length || ds.includes('noDate')) return undefined
  if (ds.includes('today') || ds.includes('next7') || (ds.includes('thisWeek') && c.today <= c.weekEnd)) return c.today
  if (ds.includes('tomorrow')) return c.tomorrow
  if (ds.includes('custom')) {
    if ((!f.from || f.from <= c.today) && (!f.to || c.today <= f.to)) return c.today
    return f.from ?? f.to
  }
  // overdue only: a new task can't be overdue
  return undefined
}

/** Moves filter `id` to position `index` among the filters and renumbers them. */
export function moveFilter(d: AppData, id: string, index: number): AppData {
  const all = sortedFilters(d)
  const moving = all.find((f) => f.id === id)
  if (!moving) return d
  const rest = all.filter((f) => f.id !== id)
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, moving)
  return { ...d, filters: rest.map((f, i) => (f.order === i + 1 ? f : { ...f, order: i + 1 })) }
}
