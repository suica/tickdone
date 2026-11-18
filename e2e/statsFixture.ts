// Data for the statistics spec (and its screenshots): a week of completed tasks, focus sessions and
// habit check-ins around Wednesday 2026-11-18, 10:30 in Asia/Shanghai.

export const NOW = new Date('2026-11-18T10:30:00+08:00')
/** yyyy-MM-dd of the day `offset` days from 2026-11-18. */
export const day = (offset: number) => new Date(Date.UTC(2026, 10, 18 + offset)).toISOString().slice(0, 10)
/** A moment on that day, Shanghai time. */
const at = (offset: number, hm: string) => new Date(`${day(offset)}T${hm}:00+08:00`).getTime()

export function statsFixture() {
  let order = 0
  const t = (p: Record<string, unknown>) => ({
    id: 't' + order,
    title: 'Task ' + order,
    content: '',
    listId: 'inbox',
    tags: [],
    priority: 0,
    status: 0,
    createdAt: at(-40, '09:00'),
    modifiedAt: at(-40, '09:00'),
    order: order++,
    subtasks: [],
    ...p,
  })
  const done = (offset: number, hm: string, p: Record<string, unknown> = {}) => t({ status: 2, completedAt: at(offset, hm), dueDate: day(offset), ...p })
  const rec = (offset: number, hm: string, minutes: number, taskId?: string) => ({
    id: `f${offset}${hm}`,
    start: at(offset, hm),
    end: at(offset, hm) + minutes * 60000,
    taskId,
    mode: 'pomo',
  })
  const checks = (...offsets: number[]) => Object.fromEntries(offsets.map((o) => [day(o), true]))
  return {
    version: 1,
    lists: [
      { id: 'L-work', name: 'Work', color: '#4CA1FF', sections: [], view: 'list', order: 1 },
      { id: 'L-life', name: 'Personal', color: '#35D870', sections: [], view: 'list', order: 2 },
    ],
    folders: [],
    tags: [{ name: 'deep', color: '#6E75F4' }],
    habits: [
      { id: 'h1', name: 'Read', icon: '📖', color: '#6E75F4', checkins: checks(-6, -5, -4, -3, -2, -1, 0), createdAt: at(-30, '08:00'), order: 0 },
      { id: 'h2', name: 'Run', icon: '🏃', color: '#35D870', checkins: checks(-2, -1), createdAt: at(-30, '08:00'), order: 1 },
    ],
    focus: [
      rec(-2, '09:00', 50, 't0'),
      rec(-2, '14:00', 25, 't3'),
      rec(-1, '09:30', 50, 't0'),
      rec(-1, '20:00', 25),
      rec(0, '09:00', 25, 't3'),
      rec(-8, '10:00', 25, 't0'),
    ],
    settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
    tasks: [
      done(-2, '10:00', { title: 'Write the report', listId: 'L-work', priority: 5, tags: ['deep'] }),
      done(-2, '16:00', { title: 'Call the bank', listId: 'L-life', priority: 3 }),
      done(-1, '11:00', { title: 'Review notes', listId: 'L-work', priority: 1 }),
      done(-1, '15:00', { title: 'Plan the trip', listId: 'L-life', tags: ['deep'] }),
      done(-1, '18:00', { title: 'Water plants' }),
      done(0, '09:30', { title: 'Answer mail', listId: 'L-work', priority: 5 }),
      done(-9, '10:00', { title: 'Last week', listId: 'L-work' }),
      t({ title: 'Pay fees', listId: 'L-life', dueDate: day(-3), priority: 5 }),
      t({ title: 'Send invoice', listId: 'L-work', dueDate: day(-1) }),
      t({ title: 'Buy milk', dueDate: day(2) }),
    ],
  }
}
