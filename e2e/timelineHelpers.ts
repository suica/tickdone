import type { Page } from '@playwright/test'

// Shared setup for the timeline specs (and screenshots): a "Launch" list in the timeline view with two
// sections, bars, single-day tasks and undated tasks, on Wednesday 2026-11-18.

export const NOW = new Date('2026-11-18T10:30:00+08:00')
/** yyyy-MM-dd of the day `offset` days from 2026-11-18. */
export const day = (offset: number) => new Date(Date.UTC(2026, 10, 18 + offset)).toISOString().slice(0, 10)

export function timelineFixture(view: 'list' | 'timeline' = 'timeline') {
  let order = 0
  const t = (p: { id: string; title: string; [k: string]: unknown }) => ({
    content: '',
    listId: 'launch',
    tags: [],
    priority: 0,
    status: 0,
    createdAt: 1763400000000,
    modifiedAt: 1763400000000,
    order: order++,
    subtasks: [],
    ...p,
  })
  return {
    version: 1,
    lists: [
      {
        id: 'launch',
        name: 'Launch',
        color: '#6E75F4',
        view,
        order: 1,
        sections: [
          { id: 's-design', name: 'Design' },
          { id: 's-build', name: 'Build' },
        ],
      },
      { id: 'home', name: 'Home', color: '#35D870', sections: [], view: 'list', order: 2 },
    ],
    folders: [],
    tags: [],
    habits: [],
    focus: [],
    settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
    tasks: [
      t({ id: 'brief', title: 'Write the brief', sectionId: 's-design', dueDate: day(1), spanDays: 3 }),
      t({ id: 'mocks', title: 'Mockups', sectionId: 's-design', dueDate: day(5), spanDays: 2 }),
      t({ id: 'review', title: 'Design review', sectionId: 's-design', dueDate: day(6) }),
      t({ id: 'api', title: 'Build the API', sectionId: 's-build', dueDate: day(10), spanDays: 6 }),
      t({ id: 'qa', title: 'Night QA run', sectionId: 's-build', dueDate: day(12), dueTime: '22:00', duration: 30 * 60 }),
      t({ id: 'release', title: 'Release', dueDate: day(15) }),
      t({ id: 'docs', title: 'Write docs', sectionId: 's-build' }),
      t({ id: 'name', title: 'Pick a name' }),
      t({ id: 'chores', title: 'Water plants', listId: 'home', dueDate: day(0) }),
    ],
  }
}

/** Opens the Launch list with the fixture and a fixed clock. */
export async function openTimeline(page: Page, { zoom = 'day', view = 'timeline' as 'list' | 'timeline' } = {}) {
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(
    ([data, zoom]) => {
      if (sessionStorage.getItem('e2e-seeded')) return
      sessionStorage.setItem('e2e-seeded', '1')
      localStorage.setItem('tickdone-locale', 'en')
      localStorage.setItem('tickdone:data:v1', JSON.stringify(data))
      localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'tasks', view: 'list:launch', prefs: {}, collapsed: {}, sidebarHidden: false }))
      localStorage.setItem('tickdone:timeline:zoom', zoom)
    },
    [timelineFixture(view), zoom] as const,
  )
  await page.goto('/')
}
