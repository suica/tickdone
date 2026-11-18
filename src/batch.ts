import { descendantIds } from './components/taskTree'
import { nextOccurrence } from './dates'
import type { AppData, Task } from './types'

// Changes to several tasks at once, as pure functions of the app data. Each returns new data (or the same
// object when nothing changes); the caller keeps the data from before as the one undo step for the whole batch.

type Patch = Partial<Task> | ((t: Task) => Partial<Task> | null)

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

/** Applies `patch` to every task in `ids`. Moving to another list takes the subtasks along; new tags are registered. */
export function patchMany(d: AppData, ids: string[], patch: Patch, now = Date.now()): AppData {
  const want = new Set(ids)
  const patches = new Map<string, Partial<Task>>()
  for (const t of d.tasks) {
    if (!want.has(t.id)) continue
    const p = typeof patch === 'function' ? patch(t) : patch
    // fields that already have the value are no change
    if (p && Object.keys(p).some((k) => !same(t[k as keyof Task], p[k as keyof Task]))) patches.set(t.id, p)
  }
  if (!patches.size) return d
  // subtasks follow their parent into another list
  const follow = new Map<string, string>()
  for (const [id, p] of patches)
    if (p.listId !== undefined) for (const c of descendantIds(id, d.tasks)) if (!patches.has(c)) follow.set(c, p.listId)
  const known = new Set(d.tags.map((x) => x.name))
  const added: string[] = []
  for (const p of patches.values())
    for (const tag of p.tags ?? [])
      if (!known.has(tag)) {
        known.add(tag)
        added.push(tag)
      }
  return {
    ...d,
    tasks: d.tasks.map((t) => {
      const p = patches.get(t.id)
      if (p) return { ...t, ...p, modifiedAt: now }
      const list = follow.get(t.id)
      return list !== undefined ? { ...t, listId: list, sectionId: undefined, modifiedAt: now } : t
    }),
    tags: added.length ? [...d.tags, ...added.map((name) => ({ name }))] : d.tags,
  }
}

/** Adds `tag` to every task in `ids`, or removes it from all of them. */
export const tagMany = (d: AppData, ids: string[], tag: string, add: boolean) =>
  patchMany(d, ids, (t) => (add ? (t.tags.includes(tag) ? null : { tags: [...t.tags, tag] }) : t.tags.includes(tag) ? { tags: t.tags.filter((x) => x !== tag) } : null))

/** How many of the tasks in `ids` carry `tag`: 'all', 'some' or 'none'. */
export function tagState(d: AppData, ids: string[], tag: string): 'all' | 'some' | 'none' {
  const want = new Set(ids)
  const ts = d.tasks.filter((t) => want.has(t.id))
  const n = ts.filter((t) => t.tags.includes(tag)).length
  return n === 0 ? 'none' : n === ts.length ? 'all' : 'some'
}

/**
 * Completes the open tasks in `ids`. A repeating task with a date stays open on its next date and leaves a
 * completed copy behind, as completing it on its own does.
 */
export function completeMany(d: AppData, ids: string[], now = Date.now()): AppData {
  const want = new Set(ids)
  const copies: Task[] = []
  const tasks = d.tasks.map((t) => {
    if (!want.has(t.id) || t.status !== 0 || t.deleted) return t
    if (t.repeat && t.dueDate) {
      copies.push({ ...t, id: uid(), status: 2, completedAt: now, repeat: null })
      return { ...t, dueDate: nextOccurrence(t.dueDate, t.repeat), subtasks: t.subtasks.map((s) => ({ ...s, done: false })), modifiedAt: now }
    }
    return { ...t, status: 2 as const, completedAt: now, modifiedAt: now }
  })
  if (!copies.length && tasks.every((t, i) => t === d.tasks[i])) return d
  return { ...d, tasks: [...tasks, ...copies] }
}

/** Reopens the tasks in `ids` that are completed or won't do. */
export const reopenMany = (d: AppData, ids: string[], now = Date.now()) => patchMany(d, ids, (t) => (t.status !== 0 ? { status: 0, completedAt: undefined } : null), now)

/** Marks the open tasks in `ids` as won't do. */
export const wontDoMany = (d: AppData, ids: string[], now = Date.now()) => patchMany(d, ids, (t) => (t.status === 0 ? { status: -1, completedAt: now } : null), now)

/** Moves the tasks in `ids` to the trash; tasks already there are deleted for good. */
export function deleteMany(d: AppData, ids: string[], now = Date.now()): AppData {
  const want = new Set(ids)
  const forever = new Set(d.tasks.filter((t) => want.has(t.id) && t.deleted).map((t) => t.id))
  const next = forever.size ? { ...d, tasks: d.tasks.filter((t) => !forever.has(t.id)) } : d
  return patchMany(next, ids.filter((id) => !forever.has(id)), (t) => (t.deleted ? null : { deleted: true }), now)
}

/**
 * Moves the tasks in `ids` (in their current order) next to `anchorId`, before or after it, as one block.
 * Every task's `order` is renumbered, as a single drag does.
 */
export function reorderMany(d: AppData, ids: string[], anchorId: string, after: boolean): AppData {
  const moving = new Set(ids)
  if (moving.has(anchorId)) return d
  const sorted = [...d.tasks].sort((a, b) => a.order - b.order)
  const block = sorted.filter((t) => moving.has(t.id))
  const rest = sorted.filter((t) => !moving.has(t.id))
  const at = rest.findIndex((t) => t.id === anchorId)
  if (at < 0 || !block.length) return d
  rest.splice(after ? at + 1 : at, 0, ...block)
  const order = new Map(rest.map((t, i) => [t.id, i]))
  return { ...d, tasks: d.tasks.map((t) => (t.order === order.get(t.id) ? t : { ...t, order: order.get(t.id)! })) }
}
