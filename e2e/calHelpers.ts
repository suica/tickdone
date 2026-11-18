import type { Page } from '@playwright/test'

// Shared setup for the calendar and matrix specs: a fixed clock, a small data set and drag drivers
// for mouse and touch (touch goes through CDP touch events, which Chromium turns into pointer events).

/** Every calendar and matrix test runs on Wednesday 2026-11-18, 10:30 in Asia/Shanghai. */
export const NOW = new Date('2026-11-18T10:30:00+08:00')
/** yyyy-MM-dd of the day `offset` days from 2026-11-18. */
export const day = (offset: number) => new Date(Date.UTC(2026, 10, 18 + offset)).toISOString().slice(0, 10)

interface Seed {
  id: string
  title: string
  [k: string]: unknown
}

export function fixture() {
  let order = 0
  const t = (p: Seed) => ({
    content: '',
    listId: 'inbox',
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
      { id: 'L-work', name: '工作', color: '#4CA1FF', sections: [], view: 'list', order: 1 },
      { id: 'L-life', name: '生活', color: '#35D870', sections: [], view: 'list', order: 2 },
    ],
    folders: [],
    tags: [],
    habits: [],
    focus: [],
    settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
    tasks: [
      t({ id: 'review', title: 'Design review', listId: 'L-work', dueDate: day(0), dueTime: '10:00', duration: 60, priority: 5 }),
      t({ id: 'walk', title: 'Walk', listId: 'L-life', dueDate: day(0), dueTime: '12:30' }),
      t({ id: 'gym', title: 'Gym', listId: 'L-life', dueDate: day(0), dueTime: '19:00', duration: 60, priority: 1 }),
      t({ id: 'weekly', title: 'Weekly sync', listId: 'L-work', dueDate: day(2), dueTime: '09:30', duration: 45, priority: 3 }),
      t({ id: 'groceries', title: 'Groceries', listId: 'L-life', dueDate: day(2) }),
      t({ id: 'fees', title: 'Pay fees', listId: 'L-life', dueDate: day(-13), dueTime: '09:00', priority: 5 }),
      t({ id: 'mail', title: 'Answer mail', listId: 'L-work', priority: 5 }),
      t({ id: 'plan', title: 'Plan sprint', listId: 'L-work', priority: 3 }),
      t({ id: 'tidy', title: 'Tidy desk' }),
    ],
  }
}

export type TaskData = { id: string; title: string; dueDate?: string; dueTime?: string; duration?: number; priority: number; order: number }

/** Load the app on a module with the fixture and a fixed clock. */
export async function open(page: Page, module: 'calendar' | 'matrix', mode = 'month') {
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(
    ([data, module, mode]) => {
      if (sessionStorage.getItem('e2e-seeded')) return
      sessionStorage.setItem('e2e-seeded', '1')
      localStorage.setItem('tickdone:data:v1', JSON.stringify(data))
      localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module, view: 'today', prefs: {}, collapsed: {}, sidebarHidden: false }))
      localStorage.setItem('tickdone:cal:mode', mode)
    },
    [fixture(), module, mode] as const,
  )
  await page.goto('/')
}

/** The stored copy of a task (the app writes to localStorage shortly after each change). */
export const stored = (page: Page, id: string) =>
  page.evaluate((id) => (JSON.parse(localStorage.getItem('tickdone:data:v1') ?? '{"tasks":[]}').tasks as TaskData[]).find((t) => t.id === id), id)

export const tasks = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('tickdone:data:v1') ?? '{"tasks":[]}').tasks as TaskData[])

export interface Pt {
  x: number
  y: number
}

export async function boxOf(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox()
  if (!b) throw new Error(`no box for ${selector}`)
  return b
}

/** A point inside `selector` that is not a text field or a button (a mouse press there starts a drag). */
export async function grabPoint(page: Page, selector: string): Promise<Pt> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)!
    const r = el.getBoundingClientRect()
    const y = r.top + Math.min(r.height / 2, 20)
    for (const f of [0.97, 0.9, 0.8, 0.03, 0.06, 0.5]) {
      const x = r.left + r.width * f
      const hit = document.elementFromPoint(x, y)
      if (hit && el.contains(hit) && !hit.closest('input, textarea, button')) return { x, y }
    }
    return { x: r.left + r.width / 2, y }
  }, selector)
}

export async function mouseDrag(page: Page, from: Pt, to: Pt, { steps = 12, release = true } = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(60)
  if (release) await page.mouse.up()
}

/** Touch: press, hold (long press starts a drag), move in steps, lift. */
export async function touchDrag(page: Page, from: Pt, to: Pt, { hold = 450, steps = 12 } = {}) {
  const cdp = await page.context().newCDPSession(page)
  const at = (p: Pt) => [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) })
  await page.waitForTimeout(hold)
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }) })
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(60)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}
