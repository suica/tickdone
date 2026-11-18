import type { Task } from '../types'

// Subtask nesting (Task.parentId) for the task list, kept free of DOM code so it can be unit tested.

/** Deepest nesting a drag can create (0 = top level). */
export const MAX_DEPTH = 4

export interface TaskTree {
  /** tasks drawn at the top level: their parent is not shown in this view */
  roots: Task[]
  /** shown children of each task, in display order */
  children: Map<string, Task[]>
}

/** Nest the tasks of a view: a task whose parent is also shown is drawn under that parent. Keeps the given order. */
export function buildTree(tasks: Task[]): TaskTree {
  const ids = new Set(tasks.map((t) => t.id))
  const children = new Map<string, Task[]>()
  const roots: Task[] = []
  for (const t of tasks) {
    if (t.parentId && t.parentId !== t.id && ids.has(t.parentId)) {
      const arr = children.get(t.parentId)
      if (arr) arr.push(t)
      else children.set(t.parentId, [t])
    } else roots.push(t)
  }
  // A parent loop (a → b → a) would hide every task in it: lift one of them to the top level.
  const seen = new Set<string>()
  const walk = (t: Task) => {
    if (seen.has(t.id)) return
    seen.add(t.id)
    children.get(t.id)?.forEach(walk)
  }
  roots.forEach(walk)
  for (const t of tasks) {
    if (seen.has(t.id)) continue
    const siblings = children.get(t.parentId!)
    if (siblings) children.set(t.parentId!, siblings.filter((x) => x.id !== t.id))
    roots.push(t)
    walk(t)
  }
  return { roots, children }
}

/** Number of tasks in these subtrees. */
export function countTree(roots: Task[], children: Map<string, Task[]>): number {
  let n = 0
  const walk = (t: Task) => {
    n++
    children.get(t.id)?.forEach(walk)
  }
  roots.forEach(walk)
  return n
}

/** Ids of all tasks below `id` (any depth), following parentId. */
export function descendantIds(id: string, tasks: Task[]): string[] {
  const byParent = new Map<string, string[]>()
  for (const t of tasks) if (t.parentId) byParent.set(t.parentId, [...(byParent.get(t.parentId) ?? []), t.id])
  const out: string[] = []
  const seen = new Set([id])
  const stack = [...(byParent.get(id) ?? [])]
  while (stack.length) {
    const x = stack.pop()!
    if (seen.has(x)) continue
    seen.add(x)
    out.push(x)
    stack.push(...(byParent.get(x) ?? []))
  }
  return out
}

export interface DropRow {
  id: string
  depth: number
}

export interface Projection {
  depth: number
  /** new parent (undefined = top level) */
  parentId?: string
  /** sibling to order against: before it, or after it */
  anchor?: { id: string; after: boolean }
}

/**
 * Where a dragged row lands when dropped between rows[index - 1] and rows[index].
 * `rows` are the visible rows of the target group in order, without the dragged row and its subtree.
 * By default the row keeps its level where the tree allows it; `shift` +1 (dragged right) nests it under the row
 * above, -1 (dragged left) moves it one level out.
 */
export function project(rows: DropRow[], index: number, origDepth: number, shift: -1 | 0 | 1, maxDepth = MAX_DEPTH): Projection {
  const prev = rows[index - 1]
  const next = rows[index]
  const minD = next ? next.depth : 0
  const maxD = prev ? Math.min(prev.depth + 1, maxDepth) : 0
  const base = Math.max(minD, Math.min(origDepth, prev ? prev.depth : 0))
  const depth = Math.max(minD, Math.min(maxD, base + shift))
  let parentId: string | undefined
  if (depth > 0)
    for (let i = index - 1; i >= 0; i--)
      if (rows[i].depth === depth - 1) {
        parentId = rows[i].id
        break
      }
  let anchor: Projection['anchor']
  if (next && next.depth === depth) anchor = { id: next.id, after: false }
  else
    for (let i = index - 1; i >= 0; i--) {
      if (rows[i].depth === depth) {
        anchor = { id: rows[i].id, after: true }
        break
      }
      if (rows[i].depth < depth) break
    }
  return { depth, parentId, anchor }
}
