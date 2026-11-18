import { createContext } from 'react'
import { flushSync } from 'react-dom'
import { addDays } from 'date-fns'
import { fmt, todayStr } from '../dates'
import { t, type MessageKey } from '../i18n'
import { getData, reorderTask, setData, setUI, toast, updateList } from '../store'
import type { AppData, GroupBy, SortBy, Task } from '../types'
import { hideLine, highlight, hitAt, pressToDrag, showLine, type DragState } from './dnd'
import { flip, measure, quietExits } from './taskMotion'
import { descendantIds, project, type Projection } from './taskTree'

// Drag controllers for tasks: list rows (reorder, regroup, nest), kanban cards and columns, and dropping a task on
// a sidebar entry.

/** Indentation of one subtask level, px (matches tasks.css). */
export const INDENT = 24
/** Horizontal drag that nests / un-nests a row, px. */
const NEST_DX = 32

export interface TaskDragApi {
  start: (e: React.PointerEvent<HTMLElement>, task: Task, row: HTMLElement) => void
  /** rows carry data-flip (the list); kanban cards carry it themselves */
  flipRows: boolean
}
/** Provided by the task list and the kanban board; TaskRow is only draggable inside one. */
export const TaskDragContext = createContext<TaskDragApi | null>(null)

/** Names of the smart lists, by view id. */
export const SMART_NAME: Record<string, MessageKey> = {
  today: 'common.today',
  tomorrow: 'common.tomorrow',
  week: 'common.list.next7Days',
  inbox: 'common.list.inbox',
  all: 'common.list.all',
  completed: 'common.list.completed',
  wontdo: 'common.list.wontDo',
  trash: 'common.list.trash',
}

/** Short names of the priority levels. */
export const PRIORITY_LEVEL: Record<number, MessageKey> = { 5: 'common.priority.high', 3: 'common.priority.medium', 1: 'common.priority.low', 0: 'common.priority.none' }

const findTask = (id: string) => getData().tasks.find((x) => x.id === id)

/** Apply a patch to a task, and the list change to its subtasks as well. */
function patchTasks(id: string, patch: Partial<Task>, d: AppData): AppData {
  const moveList = 'listId' in patch
  const below = moveList ? new Set(descendantIds(id, d.tasks)) : new Set<string>()
  const now = Date.now()
  const known = new Set(d.tags.map((tag) => tag.name))
  const newTags = (patch.tags ?? []).filter((x) => !known.has(x)).map((name) => ({ name }))
  return {
    ...d,
    tasks: d.tasks.map((x) =>
      x.id === id ? { ...x, ...patch, modifiedAt: now } : below.has(x.id) ? { ...x, listId: patch.listId!, sectionId: undefined, modifiedAt: now } : x,
    ),
    tags: newTags.length ? [...d.tags, ...newTags] : d.tags,
  }
}

// ---------------- sidebar targets ----------------
export interface SideDrop {
  patch: Partial<Task>
  text: string
}

/** What dropping `task` on a sidebar entry does, or null when it would change nothing. */
export function sideDrop(view: string, task: Task, d: AppData = getData()): SideDrop | null {
  const today = todayStr()
  const tomorrow = fmt(addDays(new Date(), 1))
  const detach = (listId: string) => (task.parentId && d.tasks.find((x) => x.id === task.parentId)?.listId !== listId ? { parentId: undefined } : {})
  const movedTo = (name: string) => t('tasks.dnd.movedTo', { name })
  if (view === 'today') return task.dueDate === today ? null : { patch: { dueDate: today }, text: movedTo(t('common.today')) }
  if (view === 'tomorrow') return task.dueDate === tomorrow ? null : { patch: { dueDate: tomorrow }, text: movedTo(t('common.tomorrow')) }
  if (view === 'week') return task.dueDate ? null : { patch: { dueDate: today }, text: movedTo(t('common.today')) }
  if (view === 'inbox') return task.listId === 'inbox' ? null : { patch: { listId: 'inbox', sectionId: undefined, ...detach('inbox') }, text: movedTo(t('common.list.inbox')) }
  if (view.startsWith('list:')) {
    const l = d.lists.find((x) => x.id === view.slice(5))
    if (!l || task.listId === l.id) return null
    return { patch: { listId: l.id, sectionId: undefined, ...detach(l.id) }, text: movedTo(l.name) }
  }
  if (view.startsWith('tag:')) {
    const tag = view.slice(4)
    return task.tags.includes(tag) ? null : { patch: { tags: [...task.tags, tag] }, text: t('tasks.dnd.tagAdded', { tag }) }
  }
  if (view === 'completed') return task.status === 2 ? null : { patch: { status: 2, completedAt: Date.now() }, text: t('tasks.dnd.completed', { title: task.title || t('common.untitled') }) }
  if (view === 'wontdo') return task.status === -1 ? null : { patch: { status: -1, completedAt: Date.now() }, text: t('tasks.dnd.wontDo') }
  if (view === 'trash') return task.deleted ? null : { patch: { deleted: true }, text: t('tasks.dnd.deleted') }
  return null
}

/** Hit-test the sidebar: an entry that accepts the task (highlighted), an entry that does not, or nothing. */
function sideTarget(el: HTMLElement | null, task: Task): { el: HTMLElement; drop: SideDrop | null } | null {
  const item = el?.closest<HTMLElement>('[data-dnd-view]')
  if (!item) return null
  return { el: item, drop: sideDrop(item.dataset.dndView!, task) }
}

function dropOnSide(id: string, drop: SideDrop) {
  const snap = getData()
  setData((d) => patchTasks(id, drop.patch, d))
  if (getUIId() === id && (drop.patch.deleted || 'listId' in drop.patch)) setUI({ selectedTaskId: undefined })
  toast(drop.text, snap)
}
/** Moves a task as if it had been dropped on the sidebar entry for `view` (toast with undo). */
export function moveTaskTo(task: Task, view: string) {
  const drop = sideDrop(view, task)
  if (drop) dropOnSide(task.id, drop)
}
const getUIId = () => document.querySelector('.task-row.selected')?.getAttribute('data-task-id')

// ---------------- list rows ----------------
export interface ListGroupInfo {
  name: string
  patch?: Partial<Task>
}
export interface ListEnv {
  groupBy: GroupBy
  sortBy: SortBy
  setCustomSort: () => void
  groups: Map<string, ListGroupInfo>
}

interface RowInfo {
  el: HTMLElement
  id: string
  depth: number
  group: string
  rect: DOMRect
}

function visibleRows(body: HTMLElement, exclude: HTMLElement): RowInfo[] {
  const out: RowInfo[] = []
  body.querySelectorAll<HTMLElement>('[data-dnd-row]').forEach((el) => {
    if (exclude.contains(el) || el.closest('[data-collapsed],[inert],[data-done]')) return
    out.push({ el, id: el.dataset.dndRow!, depth: Number(el.dataset.depth ?? 0), group: el.closest<HTMLElement>('[data-group]')?.dataset.group ?? '', rect: el.getBoundingClientRect() })
  })
  return out
}

type ListSlot = { group: string; prev?: RowInfo; next?: RowInfo; proj: Projection; x: number; y: number }
type ListTarget = { kind: 'slot'; slot: ListSlot } | { kind: 'side'; el: HTMLElement; drop: SideDrop } | { kind: 'none'; el?: HTMLElement }

const shiftOf = (dx: number): -1 | 0 | 1 => (dx > NEST_DX ? 1 : dx < -NEST_DX ? -1 : 0)

export function startListDrag(e: React.PointerEvent<HTMLElement>, task: Task, row: HTMLElement, env: { current: ListEnv }) {
  pressToDrag(e, () => {
    const node = row.closest<HTMLElement>('.task-node')
    const body = row.closest<HTMLElement>('.list-body')
    if (!node || !body) return null
    const origGroup = row.closest<HTMLElement>('[data-group]')?.dataset.group ?? ''
    const origDepth = Number(row.dataset.depth ?? 0)
    // neighbours before the drag, to recognise a drop that changes nothing
    const all = [...body.querySelectorAll<HTMLElement>('[data-dnd-row]')].filter((el) => !el.closest('[data-collapsed],[inert],[data-done]'))
    const at = all.indexOf(row)
    const origPrev = all.slice(0, at).reverse().find((el) => !node.contains(el))?.dataset.dndRow
    const origNext = all.slice(at + 1).find((el) => !node.contains(el))?.dataset.dndRow
    let target: ListTarget = { kind: 'none' }

    const contentLeft = () => {
      const br = body.getBoundingClientRect()
      return br.left + parseFloat(getComputedStyle(body).paddingLeft)
    }
    const contentRight = () => {
      const br = body.getBoundingClientRect()
      return br.right - parseFloat(getComputedStyle(body).paddingRight)
    }

    const slotFor = (rows: RowInfo[], group: string, gi: number, s: DragState): ListSlot => {
      const groupRows = rows.filter((r) => r.group === group)
      let proj = project(groupRows, gi, origDepth, shiftOf(s.dx))
      let index = gi
      // Dragged left inside its own parent's subtree: move it out, right after that subtree.
      if (shiftOf(s.dx) === -1 && origDepth > 0 && proj.depth >= origDepth && task.parentId) {
        const parentRow = groupRows.find((r) => r.id === task.parentId)
        const parentNode = parentRow?.el.closest<HTMLElement>('.task-node')
        const prev = groupRows[gi - 1]
        const next = groupRows[gi]
        if (parentNode && ((prev && parentNode.contains(prev.el)) || (next && parentNode.contains(next.el)))) {
          const inside = groupRows.filter((r) => parentNode.contains(r.el))
          index = groupRows.indexOf(inside[inside.length - 1]) + 1
          proj = project(groupRows, index, origDepth - 1, 0)
        }
      }
      const prev = groupRows[index - 1]
      const next = groupRows[index]
      const y = prev && next ? (prev.rect.bottom + next.rect.top) / 2 : prev ? prev.rect.bottom : next ? next.rect.top : 0
      return { group, prev, next, proj, x: contentLeft() + proj.depth * INDENT, y }
    }

    const find = (s: DragState): ListTarget => {
      const el = hitAt(s.x, s.y)
      const side = sideTarget(el, task)
      if (side) return side.drop ? { kind: 'side', el: side.el, drop: side.drop } : { kind: 'none', el: side.el }
      const br = body.getBoundingClientRect()
      if (s.x < br.left || s.x > br.right) return { kind: 'none' }
      const y = Math.min(Math.max(s.y, br.top), br.bottom)
      if (s.y < br.top - 80 || s.y > br.bottom + 80) return { kind: 'none' }
      const rows = visibleRows(body, node)
      // over a group header: into that group (its top, or under the header when it shows no rows)
      const head = el?.closest<HTMLElement>('[data-group-head]')
      const headKey = head && body.contains(head) ? head.dataset.groupHead! : undefined
      if (headKey !== undefined) {
        const first = rows.find((r) => r.group === headKey)
        const hr = head!.getBoundingClientRect()
        return checked(first ? slotFor(rows, headKey, 0, s) : { group: headKey, proj: { depth: 0 }, x: contentLeft(), y: hr.bottom + 2 })
      }
      if (!rows.length) return { kind: 'none' }
      let idx = rows.findIndex((r) => y < r.rect.top + r.rect.height / 2)
      if (idx < 0) idx = rows.length
      const prev = rows[idx - 1]
      const next = rows[idx]
      let group: string
      if (prev && next && prev.group !== next.group) {
        const sec = next.el.closest<HTMLElement>('[data-group]')!.getBoundingClientRect()
        group = y < sec.top ? prev.group : next.group
      } else group = (next ?? prev)!.group
      const groupRows = rows.filter((r) => r.group === group)
      const gi = next && next.group === group ? groupRows.indexOf(next) : groupRows.indexOf(prev!) + 1
      return checked(slotFor(rows, group, gi, s))
    }
    // Another group without a way to move tasks into it (e.g. "overdue"): only nesting under one of its tasks works.
    const checked = (slot: ListSlot): ListTarget =>
      slot.group !== origGroup && slot.proj.depth === 0 && !env.current.groups.get(slot.group)?.patch ? { kind: 'none' } : { kind: 'slot', slot }

    return {
      source: node,
      ghostOf: row,
      onMove: (s) => {
        target = find(s)
        if (target.kind === 'slot') {
          highlight(null)
          showLine(target.slot.x, target.slot.y, contentRight() - target.slot.x)
        } else {
          hideLine()
          highlight(target.kind === 'side' ? target.el : null)
        }
      },
      onDrop: (s) => {
        if (target.kind === 'side') {
          dropOnSide(task.id, target.drop)
          return 'fade'
        }
        if (target.kind !== 'slot') return false
        const { slot } = target
        const cur = findTask(task.id)
        if (!cur) return false
        const cross = slot.group !== origGroup
        const parentId = slot.proj.parentId
        const oldParent = cur.parentId && getData().tasks.some((x) => x.id === cur.parentId) ? cur.parentId : undefined
        if (!cross && parentId === oldParent && slot.proj.depth === origDepth && slot.prev?.id === origPrev && slot.next?.id === origNext) return false
        const env0 = env.current
        const g = env0.groups.get(slot.group)
        const patch: Partial<Task> = {}
        if (cross && g?.patch) {
          Object.assign(patch, g.patch)
          if ('listId' in g.patch && g.patch.listId !== cur.listId) patch.sectionId = undefined
        }
        if (parentId !== oldParent) patch.parentId = parentId
        const snap = getData()
        const before = measure(body)
        before.set(task.id, s.ghost.getBoundingClientRect())
        quietExits()
        flushSync(() => {
          if (!cross && env0.sortBy !== 'custom' && slot.proj.anchor) env0.setCustomSort()
          if (slot.proj.anchor) reorderTask(task.id, slot.proj.anchor.id, slot.proj.anchor.after)
          if (Object.keys(patch).length) setData((d) => patchTasks(task.id, patch, d))
        })
        flip(body, before)
        toast(listDropText(cross ? g : undefined, env0.groupBy, parentId, oldParent), snap)
        return true
      },
      onLongPress: (x, y) => setUI({ menu: { x, y, kind: 'task', id: task.id } }),
    }
  })
}

function listDropText(g: ListGroupInfo | undefined, groupBy: GroupBy, parentId: string | undefined, oldParent: string | undefined): string {
  const title = (id: string) => findTask(id)?.title || t('common.untitled')
  if (g?.patch) {
    if (groupBy === 'priority' && g.patch.priority !== undefined) return t('tasks.dnd.priority', { name: t(PRIORITY_LEVEL[g.patch.priority]) })
    return t('tasks.dnd.movedTo', { name: g.name || t('tasks.section.none') })
  }
  if (parentId !== oldParent) return parentId ? t('tasks.dnd.nested', { title: title(parentId) }) : t('tasks.dnd.unnested')
  return t('tasks.dnd.reordered')
}

// ---------------- kanban cards ----------------
export interface KanbanEnv {
  listId: string
  sortBy: SortBy
  setCustomSort: () => void
  columns: Map<string, string>
}

type CardTarget = { kind: 'card'; col: HTMLElement; key: string; prev?: HTMLElement; next?: HTMLElement } | { kind: 'side'; el: HTMLElement; drop: SideDrop } | { kind: 'none'; el?: HTMLElement }

export function startCardDrag(e: React.PointerEvent<HTMLElement>, task: Task, row: HTMLElement, env: { current: KanbanEnv }) {
  pressToDrag(e, () => {
    const card = row.closest<HTMLElement>('.kanban-card')
    const board = row.closest<HTMLElement>('.kanban')
    if (!card || !board) return null
    const origCol = card.closest<HTMLElement>('[data-kanban-col]')?.dataset.kanbanCol ?? ''
    const siblings = [...card.parentElement!.querySelectorAll<HTMLElement>(':scope > [data-dnd-card]')]
    const origPrev = siblings[siblings.indexOf(card) - 1]
    const origNext = siblings[siblings.indexOf(card) + 1]
    let target: CardTarget = { kind: 'none' }

    const find = (s: DragState): CardTarget => {
      const el = hitAt(s.x, s.y)
      const side = sideTarget(el, task)
      if (side) return side.drop ? { kind: 'side', el: side.el, drop: side.drop } : { kind: 'none', el: side.el }
      const cols = [...board.querySelectorAll<HTMLElement>('[data-kanban-col]')]
      let col = el?.closest<HTMLElement>('[data-kanban-col]') ?? undefined
      if (!col || !board.contains(col)) {
        const br = board.getBoundingClientRect()
        if (s.y < br.top || s.y > br.bottom) return { kind: 'none' }
        col = cols.find((c) => {
          const r = c.getBoundingClientRect()
          return s.x >= r.left - 8 && s.x <= r.right + 8
        })
      }
      if (!col) return { kind: 'none' }
      const cards = [...col.querySelectorAll<HTMLElement>('[data-dnd-card]')].filter((c) => c !== card)
      const idx = cards.findIndex((c) => {
        const r = c.getBoundingClientRect()
        return s.y < r.top + r.height / 2
      })
      const i = idx < 0 ? cards.length : idx
      return { kind: 'card', col, key: col.dataset.kanbanCol ?? '', prev: cards[i - 1], next: cards[i] }
    }

    return {
      source: card,
      onMove: (s) => {
        target = find(s)
        if (target.kind === 'card') {
          highlight(target.col)
          const area = (target.col.querySelector<HTMLElement>('.kanban-cards') ?? target.col).getBoundingClientRect()
          const p = target.prev?.getBoundingClientRect()
          const n = target.next?.getBoundingClientRect()
          const y = p && n ? (p.bottom + n.top) / 2 : p ? p.bottom + 3 : n ? n.top - 3 : area.top + 2
          showLine(area.left, y, area.width)
        } else {
          hideLine()
          highlight(target.kind === 'side' ? target.el : null)
        }
      },
      onDrop: (s) => {
        if (target.kind === 'side') {
          dropOnSide(task.id, target.drop)
          return 'fade'
        }
        if (target.kind !== 'card') return false
        const { key, prev, next } = target
        const cross = key !== origCol
        if (!cross && prev === origPrev && next === origNext) return false
        const env0 = env.current
        const patch: Partial<Task> = cross ? { sectionId: key || undefined } : {}
        const anchorId = next?.dataset.dndCard ?? prev?.dataset.dndCard
        const snap = getData()
        const before = measure(board)
        before.set(task.id, s.ghost.getBoundingClientRect())
        quietExits()
        flushSync(() => {
          if (!cross && env0.sortBy !== 'custom') env0.setCustomSort()
          if (anchorId) reorderTask(task.id, anchorId, !next)
          if (cross) setData((d) => patchTasks(task.id, patch, d))
        })
        flip(board, before)
        toast(cross ? t('tasks.dnd.movedTo', { name: env0.columns.get(key) || t('tasks.section.none') }) : t('tasks.dnd.reordered'), snap)
        return true
      },
      onLongPress: (x, y) => setUI({ menu: { x, y, kind: 'task', id: task.id } }),
    }
  })
}

// ---------------- kanban columns ----------------
export function startColumnDrag(e: React.PointerEvent<HTMLElement>, listId: string, sectionId: string) {
  const head = e.currentTarget
  pressToDrag(e, () => {
    const col = head.closest<HTMLElement>('[data-kanban-col]')
    const board = head.closest<HTMLElement>('.kanban')
    if (!col || !board) return null
    let index = -1
    const sectionCols = () => [...board.querySelectorAll<HTMLElement>('[data-kanban-col]')].filter((c) => c.dataset.kanbanCol && c !== col)
    return {
      source: col,
      onMove: (s) => {
        const cols = sectionCols()
        const rects = cols.map((c) => c.getBoundingClientRect())
        const br = board.getBoundingClientRect()
        if (s.y < br.top - 40 || s.y > br.bottom + 40 || !cols.length) {
          index = -1
          return hideLine()
        }
        const i = rects.findIndex((r) => s.x < r.left + r.width / 2)
        index = i < 0 ? cols.length : i
        const gap = 14
        const x = index === 0 ? rects[0].left - gap / 2 : index === cols.length ? rects[cols.length - 1].right + gap / 2 : (rects[index - 1].right + rects[index].left) / 2
        const top = Math.min(...rects.map((r) => r.top), col.getBoundingClientRect().top)
        const bottom = Math.max(...rects.map((r) => r.bottom))
        showLine(x, top, Math.max(48, bottom - top), true)
      },
      onDrop: () => {
        const list = getData().lists.find((l) => l.id === listId)
        if (!list || index < 0) return false
        const rest = list.sections.filter((x) => x.id !== sectionId)
        const order = sectionCols().map((c) => c.dataset.kanbanCol!)
        const target = order[index]
        const moving = list.sections.find((x) => x.id === sectionId)!
        const at = target ? rest.findIndex((x) => x.id === target) : rest.length
        const next = [...rest]
        next.splice(at < 0 ? rest.length : at, 0, moving)
        if (next.every((x, i) => x.id === list.sections[i].id)) return false
        const snap = getData()
        const before = measure(board, 'data-flip-col')
        flushSync(() => updateList(listId, { sections: next }))
        flip(board, before, 'data-flip-col')
        toast(t('tasks.dnd.sectionsReordered'), snap)
        return true
      },
    }
  })
}
