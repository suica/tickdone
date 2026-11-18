import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '../i18n'
import type { AppData, Task, TaskList } from '../types'
import { activeLists, activeTasks, archivedListIds, inArchivedList, isLocked, tasksForView } from '../views'

// 2026-11-18, 10:00 local time (the test script pins TZ=Asia/Shanghai)
const TODAY = '2026-11-18'
const task = (id: string, listId: string, p: Partial<Task> = {}): Task => ({
  id, title: id, content: '', listId, tags: [], priority: 0, status: 0, createdAt: 0, modifiedAt: 0, order: 0, subtasks: [], ...p,
})
const list = (id: string, p: Partial<TaskList> = {}): TaskList => ({ id, name: id, sections: [], view: 'list', order: 0, ...p })
const data = (): AppData => ({
  version: 1,
  lists: [list('work'), list('old', { archived: true })],
  folders: [],
  tags: [{ name: 'home' }],
  habits: [],
  focus: [],
  settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
  filters: [{ id: 'f', name: 'Home', order: 0, match: 'all', tags: ['home'] }],
  tasks: [
    task('w1', 'work', { dueDate: TODAY, tags: ['home'] }),
    task('o1', 'old', { dueDate: TODAY, tags: ['home'] }),
    task('o2', 'old', { status: 2, completedAt: new Date(2026, 10, 18, 9).getTime(), dueDate: TODAY }),
    task('i1', 'inbox', { dueDate: TODAY }),
    task('gone', 'old', { deleted: true }),
  ],
})
const ids = (ts: Task[]) => ts.map((t) => t.id).sort()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 18, 10, 0, 0))
})
afterEach(() => vi.useRealTimers())

describe('archived lists in views', () => {
  it('helpers', () => {
    const d = data()
    expect([...archivedListIds(d)]).toEqual(['old'])
    expect(activeLists(d).map((l) => l.id)).toEqual(['work'])
    expect(inArchivedList(task('x', 'old'), d)).toBe(true)
    expect(inArchivedList(task('x', 'inbox'), d)).toBe(false)
    expect(isLocked(task('x', 'old'), d)).toBe(true)
    expect(isLocked(task('x', 'work', { deleted: true }), d)).toBe(true)
    expect(isLocked(task('x', 'work'), d)).toBe(false)
    expect(ids(activeTasks(d))).toEqual(['i1', 'w1'])
  })

  it.each(['today', 'week', 'all', 'tag:home', 'filter:f'])('%s leaves out archived lists', (view) => {
    const { open, done } = tasksForView(view, data())
    expect([...open, ...done].some((t) => t.listId === 'old')).toBe(false)
  })

  it('the completed list leaves them out too', () => {
    expect(tasksForView('completed', data()).done).toEqual([])
  })

  it("the archived list's own view shows its tasks", () => {
    const { open, done } = tasksForView('list:old', data())
    expect(ids(open)).toEqual(['o1'])
    expect(ids(done)).toEqual(['o2'])
  })

  it('the trash still holds deleted tasks of archived lists', () => {
    expect(ids(tasksForView('trash', data()).open)).toEqual(['gone'])
  })

  it('archiving survives a backup round trip', () => {
    const back = JSON.parse(JSON.stringify(data())) as AppData
    expect(back.lists.find((l) => l.id === 'old')?.archived).toBe(true)
    expect(ids(tasksForView('today', back).open)).toEqual(['i1', 'w1'])
  })
})

// The store touches the browser when it loads; give it just enough of one.
describe('archiveList', () => {
  let store: typeof import('../store')
  beforeAll(async () => {
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) })
    vi.stubGlobal('window', { addEventListener() {}, setTimeout, clearTimeout })
    vi.stubGlobal('document', { addEventListener() {}, visibilityState: 'visible' })
    store = await import('../store')
  })
  beforeEach(() => setLocale('en'))
  afterEach(() => store.setUI({ toast: undefined, selectedTaskId: undefined, view: 'today' }))

  it('archives with an undo toast, and undo brings the list back', () => {
    const start = { ...data(), lists: [list('work', { name: 'Work' })] }
    store.setData(() => start)
    store.archiveList('work')
    expect(store.getData().lists[0].archived).toBe(true)
    expect(store.getUI().toast?.text).toBe('Archived “Work”')
    expect(tasksForView('today', store.getData()).open.some((t) => t.listId === 'work')).toBe(false)
    store.undoToast()
    expect(store.getData()).toBe(start)
  })

  it('unarchives', () => {
    store.setData(() => data())
    store.archiveList('old', false)
    expect(store.getData().lists.find((l) => l.id === 'old')?.archived).toBeUndefined()
    expect(store.getUI().toast?.text).toBe('“old” is back in your lists')
  })

  it('does nothing when the list is already in that state', () => {
    const d = data()
    store.setData(() => d)
    store.archiveList('old', true)
    expect(store.getData()).toBe(d)
    expect(store.getUI().toast).toBeUndefined()
  })

  it("a selected task of the list is let go, unless its own list is open", () => {
    store.setData(() => data())
    store.setUI({ view: 'today', selectedTaskId: 'w1' })
    store.archiveList('work')
    expect(store.getUI().selectedTaskId).toBeUndefined()
    store.archiveList('work', false)
    store.setUI({ view: 'list:work', selectedTaskId: 'w1' })
    store.archiveList('work')
    expect(store.getUI().selectedTaskId).toBe('w1')
  })
})
