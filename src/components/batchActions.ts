import { addDays, nextMonday } from 'date-fns'
import { completeMany, deleteMany, patchMany, reopenMany, tagMany, tagState, wontDoMany } from '../batch'
import { fmt } from '../dates'
import { t } from '../i18n'
import { clearSelection, getData, getSelection, getUI, playDing, runBatch, setSelection } from '../store'
import { after, clickSelect, enterMode, inOrder, selectedIds, type ClickMods } from '../selection'
import type { Priority, Task } from '../types'
import { PRIORITY_LEVEL } from './taskDnd'
import { batchWithMotion, toggleWithMotion } from './taskMotion'

// What the batch panel, the phone action bar, the keyboard and multi-row drags do to the selected tasks.
// Every change is one setData call and one toast, so a single undo puts all the tasks back.

/** Ids of the task rows in the list pane, top to bottom, skipping folded groups and subtasks. */
export function visibleOrder(): string[] {
  const out: string[] = []
  document.querySelectorAll<HTMLElement>('.list-pane .task-row[data-task-id]').forEach((el) => {
    if (el.closest('[data-collapsed],[inert],.dnd-ghost')) return
    out.push(el.dataset.taskId!)
  })
  return [...new Set(out)]
}

export const rowEl = (id: string) => document.querySelector<HTMLElement>(`.list-pane .task-row[data-task-id="${CSS.escape(id)}"]`)

/** The selected tasks, in list order. */
export function batchIds(): string[] {
  return inOrder(visibleOrder(), selectedIds(getSelection()))
}

/** A click on a row with Ctrl / ⌘ (toggle) or Shift (range), or any tap in selection mode. */
export function clickRow(id: string, mods: ClickMods) {
  setSelection(clickSelect(visibleOrder(), getSelection(), id, mods))
}

/** Long press on a phone row (or "Select" in the list menu): selection mode, with this task selected. */
export function startSelecting(id?: string) {
  navigator.vibrate?.(10)
  setSelection({ ...enterMode(visibleOrder(), getSelection(), id), cursor: undefined })
}

/** After tasks leave the list, the selection ends; on a keyboard the cursor goes on to the next row. */
function leave(ids: string[], order: string[]) {
  const next = getUI().selectMode ? undefined : after(order, ids)
  setSelection({ ids: [], cursor: next, anchor: next, mode: false })
}

const count = (ids: string[]) => ({ count: ids.length })

export function setPriority(ids: string[], priority: Priority) {
  if (!ids.length) return
  runBatch(t('tasks.dnd.priority', { name: t(PRIORITY_LEVEL[priority]) }), (d) => patchMany(d, ids, (x) => (x.priority === priority ? null : { priority })))
}

export type DateValue = Pick<Task, 'dueDate' | 'dueTime' | 'reminder' | 'repeat'>
export function setDate(ids: string[], v: DateValue) {
  if (!ids.length) return
  const p: Partial<Task> = { dueDate: v.dueDate, dueTime: v.dueTime, reminder: v.reminder ?? null, repeat: v.repeat ?? null }
  runBatch(t('tasks.swipe.dateChanged'), (d) => patchMany(d, ids, (x) => (x.dueDate === p.dueDate && x.dueTime === p.dueTime && (x.reminder ?? null) === p.reminder && JSON.stringify(x.repeat ?? null) === JSON.stringify(p.repeat) ? null : p)))
}

/** Keyboard dates: today, tomorrow, next Monday, or none. */
export function quickDate(ids: string[], which: 'today' | 'tomorrow' | 'nextWeek' | 'clear') {
  const now = new Date()
  const day = which === 'today' ? now : which === 'tomorrow' ? addDays(now, 1) : which === 'nextWeek' ? nextMonday(now) : undefined
  if (!day) {
    if (!ids.length) return
    runBatch(t('tasks.swipe.dateChanged'), (d) => patchMany(d, ids, (x) => (x.dueDate || x.dueTime || x.repeat || x.reminder != null ? { dueDate: undefined, dueTime: undefined, reminder: null, repeat: null } : null)))
    return
  }
  const date = fmt(day)
  runBatch(t('tasks.swipe.dateChanged'), (d) => patchMany(d, ids, (x) => (x.dueDate === date ? null : { dueDate: date })))
}

export function moveToList(ids: string[], listId: string) {
  if (!ids.length) return
  const name = listId === 'inbox' ? t('common.list.inbox') : (getData().lists.find((l) => l.id === listId)?.name ?? '')
  const d0 = getData()
  // a subtask moved without its parent leaves it
  const moving = new Set(ids)
  runBatch(t('tasks.dnd.movedTo', { name }), (d) =>
    patchMany(d, ids, (x) => {
      if (x.listId === listId) return null
      const parent = x.parentId ? d0.tasks.find((p) => p.id === x.parentId) : undefined
      return { listId, sectionId: undefined, ...(parent && !moving.has(parent.id) && parent.listId !== listId ? { parentId: undefined } : {}) }
    }),
  )
}

/** Adds the tag to every selected task, or removes it when all of them already have it. */
export function toggleTag(ids: string[], tag: string) {
  if (!ids.length) return
  const add = tagState(getData(), ids, tag) !== 'all'
  runBatch(t(add ? 'tasks.batch.tagAdded' : 'tasks.batch.tagRemoved', { tag, ...count(ids) }), (d) => tagMany(d, ids, tag, add))
}

/** Completes the selected tasks, or reopens them when all of them are done already. One task animates as a click on its checkbox does. */
export function completeSelected(ids: string[]) {
  if (!ids.length) return
  const d = getData()
  const ts = d.tasks.filter((x) => ids.includes(x.id) && !x.deleted)
  if (!ts.length) return
  if (ts.length === 1 && !getUI().selectMode && getUI().selectedIds.length < 2) return toggleWithMotion(ts[0].id)
  const order = visibleOrder()
  if (ts.every((x) => x.status !== 0)) {
    batchWithMotion(ids, 'uncheck', () => runBatch(t('tasks.batch.reopened', count(ids)), (x) => reopenMany(x, ids)))
    return
  }
  const open = ts.filter((x) => x.status === 0).map((x) => x.id)
  if (batchWithMotion(open, 'check', () => runBatch(t('tasks.batch.completed', { count: open.length }), (x) => completeMany(x, ids)))) {
    playDing()
    if (!d.settings.showCompleted) leave(ids, order)
  }
}

export function wontDoSelected(ids: string[]) {
  if (!ids.length) return
  const order = visibleOrder()
  if (runBatch(t('tasks.batch.wontDo', count(ids)), (d) => wontDoMany(d, ids))) leave(ids, order)
}

export function deleteSelected(ids: string[]) {
  if (!ids.length) return
  const order = visibleOrder()
  const forever = getData().tasks.filter((x) => ids.includes(x.id)).every((x) => x.deleted)
  if (runBatch(t(forever ? 'tasks.batch.deletedForever' : 'tasks.batch.deleted', count(ids)), (d) => deleteMany(d, ids))) leave(ids, order)
}

/** Esc: ends the multi-selection or selection mode. Returns false when there was nothing to clear. */
export function escapeSelection(): boolean {
  const u = getUI()
  if (!u.selectMode && u.selectedIds.length < 2) return false
  clearSelection(!u.selectMode)
  return true
}
