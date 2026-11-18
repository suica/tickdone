import type { AppData, FocusRecord, Habit, Priority, Task, TaskList } from '../types'

// A large, deterministic data set for measuring performance: thousands of tasks spread over lists, tags,
// dates, subtasks and nesting. Used by the perf e2e test and, in development only, by `?seed=<count>`.

/** A small seeded random number generator (mulberry32), so every run builds the same data. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const WORDS = [
  'review', 'draft', 'call', 'plan', 'fix', 'write', 'read', 'send', 'book', 'check', 'update', 'prepare', 'clean', 'order', 'pay',
  'report', 'budget', 'meeting', 'invoice', 'garden', 'kitchen', 'slides', 'notes', 'design', 'tests', 'release', 'trip', 'gift', 'paper', 'ideas',
]
const COLORS = ['#FF6161', '#FFAC38', '#FFD324', '#35D870', '#4CA1FF', '#6E75F4', '#B37FEB', '#FF83C3']
const PRIORITIES: Priority[] = [0, 0, 0, 1, 3, 5]

export interface SeedOptions {
  tasks?: number
  lists?: number
  tags?: number
  /** The day dates are spread around; defaults to now. */
  today?: Date
  seed?: number
}

/** Builds app data with `tasks` tasks (default 5,000) across `lists` lists (default 30). */
export function bigData({ tasks = 5000, lists = 30, tags = 12, today = new Date(), seed = 26 }: SeedOptions = {}): AppData {
  const r = rng(seed)
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)]
  const now = today.getTime()
  const day = (offset: number) => ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset))

  const allLists: TaskList[] = Array.from({ length: lists }, (_, i) => ({
    id: 'l' + i,
    name: 'List ' + (i + 1),
    color: COLORS[i % COLORS.length],
    // every third list has sections
    sections: i % 3 === 0 ? [{ id: 'l' + i + 's0', name: 'Section A' }, { id: 'l' + i + 's1', name: 'Section B' }] : [],
    view: 'list',
    order: i + 1,
  }))
  const tagNames = Array.from({ length: tags }, (_, i) => 'tag' + (i + 1))

  const out: Task[] = []
  for (let i = 0; i < tasks; i++) {
    // one task in ten goes to the inbox
    const list = r() < 0.1 ? undefined : allLists[i % lists]
    const status = r() < 0.25 ? 2 : r() < 0.03 ? -1 : 0
    const dated = r() < 0.7
    const offset = Math.floor(r() * 90) - 30
    const created = now - Math.floor(r() * 60) * 86_400_000 - i
    const parent = i > 0 && r() < 0.08 ? out[out.length - 1] : undefined
    const nSub = r() < 0.2 ? 1 + Math.floor(r() * 4) : 0
    const t: Task = {
      id: 't' + i,
      title: `${pick(WORDS)} ${pick(WORDS)} ${i + 1}`,
      content: r() < 0.2 ? `Notes for task ${i + 1}: ${pick(WORDS)} ${pick(WORDS)} ${pick(WORDS)}` : '',
      listId: parent ? parent.listId : (list?.id ?? 'inbox'),
      sectionId: !parent && list?.sections.length && r() < 0.6 ? pick(list.sections).id : undefined,
      tags: r() < 0.4 ? [...new Set([pick(tagNames), ...(r() < 0.3 ? [pick(tagNames)] : [])])] : [],
      priority: pick(PRIORITIES),
      dueDate: dated ? day(offset) : undefined,
      dueTime: dated && r() < 0.3 ? `${pad(8 + Math.floor(r() * 10))}:${r() < 0.5 ? '00' : '30'}` : undefined,
      status,
      completedAt: status !== 0 ? Math.min(now, created + Math.floor(r() * 20) * 86_400_000) : undefined,
      createdAt: created,
      modifiedAt: created,
      order: i,
      subtasks: Array.from({ length: nSub }, (_, k) => ({ id: `t${i}c${k}`, title: `${pick(WORDS)} step ${k + 1}`, done: r() < 0.4 })),
      parentId: parent?.id,
      pinned: r() < 0.005 || undefined,
    }
    out.push(t)
  }

  const habits: Habit[] = Array.from({ length: 6 }, (_, i) => {
    const checkins: Record<string, true> = {}
    for (let k = 0; k < 120; k++) if (r() < 0.6) checkins[day(-k)] = true
    return { id: 'h' + i, name: 'Habit ' + (i + 1), icon: '✅', color: COLORS[i % COLORS.length], checkins, createdAt: now - 200 * 86_400_000, order: i }
  })
  const focus: FocusRecord[] = Array.from({ length: 400 }, (_, i) => {
    const start = now - Math.floor(r() * 120) * 86_400_000 - Math.floor(r() * 12) * 3_600_000
    return { id: 'f' + i, start, end: start + 25 * 60_000, taskId: 't' + Math.floor(r() * tasks), mode: 'pomo' }
  })

  return {
    version: 1,
    lists: allLists,
    folders: [],
    tags: tagNames.map((name, i) => ({ name, color: COLORS[i % COLORS.length] })),
    habits,
    focus,
    settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
    tasks: out,
  }
}
