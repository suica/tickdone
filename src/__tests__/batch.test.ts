import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeMany, deleteMany, patchMany, reorderMany, tagMany, tagState, wontDoMany } from '../batch'
import { setLocale } from '../i18n'
import type { AppData, Task } from '../types'

const task = (id: string, order: number, p: Partial<Task> = {}): Task => ({
  id, title: id, content: '', listId: 'inbox', tags: [], priority: 0, status: 0, createdAt: 0, modifiedAt: 0, order, subtasks: [], ...p,
})
const data = (tasks: Task[]): AppData => ({
  version: 1,
  tasks,
  lists: [{ id: 'work', name: 'Work', sections: [], view: 'list', order: 0 }],
  folders: [],
  tags: [{ name: 'home' }],
  habits: [],
  focus: [],
  settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
})
const byId = (d: AppData, id: string) => d.tasks.find((t) => t.id === id)!
const ids = ['a', 'b', 'c']

describe('batch changes', () => {
  const d0 = data([task('a', 0), task('b', 1, { tags: ['home'] }), task('c', 2), task('d', 3), task('kid', 4, { parentId: 'b' })])

  it('patchMany changes only the given tasks and leaves the data before untouched', () => {
    const d = patchMany(d0, ['a', 'c'], { priority: 5 }, 9)
    expect(d.tasks.map((t) => t.priority)).toEqual([5, 0, 5, 0, 0])
    expect(byId(d, 'a').modifiedAt).toBe(9)
    expect(d0.tasks.every((t) => t.priority === 0)).toBe(true)
  })
  it('patchMany returns the same data when nothing changes', () => {
    expect(patchMany(d0, ['a'], () => null)).toBe(d0)
    expect(patchMany(d0, ['zzz'], { priority: 3 })).toBe(d0)
  })
  it('moving to another list takes the subtasks along', () => {
    const d = patchMany(d0, ['b'], { listId: 'work', sectionId: undefined })
    expect(byId(d, 'b').listId).toBe('work')
    expect(byId(d, 'kid').listId).toBe('work')
    expect(byId(d, 'a').listId).toBe('inbox')
  })
  it('tags: added to all, removed from all, new tags registered once', () => {
    expect(tagState(d0, ids, 'home')).toBe('some')
    const added = tagMany(d0, ids, 'home', true)
    expect(ids.map((id) => byId(added, id).tags)).toEqual([['home'], ['home'], ['home']])
    expect(tagState(added, ids, 'home')).toBe('all')
    expect(tagState(tagMany(added, ids, 'home', false), ids, 'home')).toBe('none')
    const fresh = tagMany(d0, ids, 'trip', true)
    expect(fresh.tags.filter((t) => t.name === 'trip')).toHaveLength(1)
  })
  it('completeMany completes open tasks; a repeating one moves on and leaves a completed copy', () => {
    const d = completeMany(data([task('a', 0), task('r', 1, { dueDate: '2026-11-18', repeat: { kind: 'daily', interval: 1 } }), task('x', 2, { status: 2, completedAt: 1 })]), ['a', 'r', 'x'], 5)
    expect(byId(d, 'a').status).toBe(2)
    expect(byId(d, 'r').status).toBe(0)
    expect(byId(d, 'r').dueDate).toBe('2026-11-19')
    expect(d.tasks.filter((t) => t.status === 2 && t.title === 'r')).toHaveLength(1)
    expect(byId(d, 'x').completedAt).toBe(1)
  })
  it('completeMany ends a series on its last occurrence and counts the others', () => {
    const d = completeMany(
      data([
        task('last', 0, { dueDate: '2026-11-18', repeat: { kind: 'daily', interval: 1, count: 2, done: 1 } }),
        task('more', 1, { dueDate: '2026-11-18', repeat: { kind: 'monthly', interval: 1, nth: -1, weekday: 5, count: 3 } }),
      ]),
      ['last', 'more'],
      new Date(2026, 10, 18, 12).getTime(),
    )
    expect(byId(d, 'last')).toMatchObject({ status: 2, dueDate: '2026-11-18', repeat: { done: 2 } })
    expect(byId(d, 'more')).toMatchObject({ status: 0, dueDate: '2026-11-27', repeat: { done: 1 } })
    // only the series that goes on leaves a completed copy
    expect(d.tasks).toHaveLength(3)
  })
  it("wontDoMany and deleteMany; deleting tasks already in the trash removes them", () => {
    expect(ids.map((id) => byId(wontDoMany(d0, ids), id).status)).toEqual([-1, -1, -1])
    const trashed = deleteMany(d0, ['a', 'b'])
    expect([byId(trashed, 'a').deleted, byId(trashed, 'b').deleted]).toEqual([true, true])
    const gone = deleteMany(trashed, ['a', 'c'])
    expect(gone.tasks.some((t) => t.id === 'a')).toBe(false)
    expect(byId(gone, 'c').deleted).toBe(true)
  })
  it('reorderMany moves the tasks as one block, in their order, before or after the anchor', () => {
    const order = (d: AppData) => [...d.tasks].sort((x, y) => x.order - y.order).map((t) => t.id)
    expect(order(reorderMany(d0, ['c', 'a'], 'd', true))).toEqual(['b', 'd', 'a', 'c', 'kid'])
    expect(order(reorderMany(d0, ['d', 'b'], 'a', false))).toEqual(['b', 'd', 'a', 'c', 'kid'])
    expect(reorderMany(d0, ['a', 'b'], 'a', true)).toBe(d0)
  })
})

// The store touches the browser when it loads; give it just enough of one.
describe('batch undo', () => {
  let store: typeof import('../store')
  beforeAll(async () => {
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) })
    vi.stubGlobal('window', { addEventListener() {}, setTimeout, clearTimeout })
    vi.stubGlobal('document', { addEventListener() {}, visibilityState: 'visible' })
    store = await import('../store')
  })
  beforeEach(() => setLocale('en'))
  afterEach(() => store.setUI({ toast: undefined }))

  it('a batch change is one toast and one undo puts every task back', () => {
    const start = data([task('a', 0), task('b', 1), task('c', 2)])
    store.setData(() => start)
    expect(store.runBatch('Priority: High', (d) => patchMany(d, ids, { priority: 5 }))).toBe(true)
    expect(store.getData().tasks.map((t) => t.priority)).toEqual([5, 5, 5])
    expect(store.getUI().toast?.text).toBe('Priority: High')
    store.undoToast()
    expect(store.getData()).toBe(start)
    expect(store.getUI().toast).toBeUndefined()
  })
  it('only the last batch is undone, back to the data right before it', () => {
    store.setData(() => data([task('a', 0), task('b', 1), task('c', 2)]))
    store.runBatch('one', (d) => patchMany(d, ids, { priority: 1 }))
    const between = store.getData()
    store.runBatch('two', (d) => deleteMany(d, ['a', 'b']))
    store.undoToast()
    expect(store.getData()).toBe(between)
    expect(store.getData().tasks.map((t) => t.priority)).toEqual([1, 1, 1])
  })
  it('a change that changes nothing shows no toast', () => {
    store.setData(() => data([task('a', 0)]))
    expect(store.runBatch('nothing', (d) => patchMany(d, ['a'], { priority: 0 }))).toBe(false)
    expect(store.getUI().toast).toBeUndefined()
  })
  it('the selection lives in the UI state and clears without touching the data', () => {
    store.setSelection({ ids: ['a', 'b'], cursor: 'b', anchor: 'a', mode: false })
    expect(store.getSelection()).toEqual({ ids: ['a', 'b'], cursor: 'b', anchor: 'a', mode: false })
    const d = store.getData()
    store.clearSelection()
    expect(store.getSelection()).toEqual({ ids: [], cursor: 'b', anchor: 'b', mode: false })
    expect(store.getData()).toBe(d)
  })
})
