import { writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { bigData } from '../src/dev/seed'

// Performance with 5,000 tasks in 30 lists. Clicks and keys are real input events, timed with the Event Timing API
// (from the input to the next painted frame, as browsers measure responsiveness; 16 ms means "16 ms or less").
// Scrolling records frame times, and long tasks are counted. The budgets are generous (CI machines are slow and
// shared); they catch a return to rendering every task, not small regressions.
// PERF_OUT=<file> writes the numbers as JSON; PERF_NO_BUDGET=1 only measures (for a baseline).

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

const DATA = bigData()
const results: Record<string, number> = {}
const budget = !process.env.PERF_NO_BUDGET

/**
 * Budgets: input-to-paint times in ms, and how many task rows may be in the document. Measured with this data on a
 * shared CI-like machine the times were 2 to 5 times lower (and rendering every row put 1,118 rows in the
 * document, 720 ms on a view switch and 1.9 s on a search keystroke), so only a real regression trips them.
 */
const BUDGET = {
  load: 4000,
  rowsInDom: 300,
  switchView: 450,
  scrollP95: 100,
  quickAddKey: 200,
  complete: 400,
  openDetail: 400,
  searchKey: 700,
  calendar: 1000,
  stats: 1500,
}

async function open(page: Page, view = 'today') {
  await page.addInitScript(
    ([data, state]) => {
      // long tasks, input-to-paint times and the moment the first task row appears
      const w = window as unknown as { __lt: number[]; __ev: number[]; __firstRow?: number }
      w.__lt = []
      w.__ev = []
      new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__lt.push(e.duration))).observe({ type: 'longtask', buffered: true })
      new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__ev.push(e.duration))).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit)
      new MutationObserver((_, obs) => {
        if (document.querySelector('.task-row')) {
          w.__firstRow = performance.now()
          obs.disconnect()
        }
      }).observe(document, { childList: true, subtree: true })
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('tickdone-locale', 'en')
      localStorage.setItem('tickdone:data:v1', data)
      localStorage.setItem('tickdone:ui:v1', JSON.stringify(state))
    },
    [JSON.stringify(DATA), { module: 'tasks', view, prefs: {}, collapsed: {}, sidebarHidden: false }] as const,
  )
  await page.goto('/')
  await expect(page.locator('.list-pane .task-row').first()).toBeVisible({ timeout: 30_000 })
  await page.waitForSelector('#launch', { state: 'detached' })
  await settle(page)
}

/** Waits until nothing has run for a moment (animations and saves done). */
const settle = (page: Page) => page.waitForTimeout(600)

/** Runs `action` (real input) and returns the slowest input-to-paint time it caused, in ms. */
async function inputToPaint(page: Page, action: () => Promise<unknown>): Promise<number> {
  await page.evaluate(() => ((window as unknown as { __ev: number[] }).__ev.length = 0))
  await action()
  await page.waitForTimeout(400)
  return page.evaluate(() => Math.max(16, ...(window as unknown as { __ev: number[] }).__ev))
}

/** Types one character at a time; returns the slowest keystroke and the mean. */
async function typeInto(page: Page, text: string) {
  const times: number[] = []
  for (const ch of text) times.push(await inputToPaint(page, () => page.keyboard.type(ch)))
  return { max: Math.max(...times), mean: times.reduce((a, b) => a + b, 0) / times.length }
}

const longTasks = (page: Page) => page.evaluate(() => (window as unknown as { __lt: number[] }).__lt.splice(0).reduce((a, b) => a + b, 0))

function record(name: string, value: number, limit?: number) {
  results[name] = Math.round(value * 10) / 10
  console.log(`perf ${name}: ${results[name]}`)
  if (budget && limit !== undefined) expect(value, name).toBeLessThan(limit)
}

test.afterAll(() => {
  if (process.env.PERF_OUT) writeFileSync(process.env.PERF_OUT, JSON.stringify(results, null, 2))
})

test('initial load with 5,000 tasks', async ({ page }) => {
  await open(page)
  const t = await page.evaluate(() => (window as unknown as { __firstRow: number }).__firstRow)
  record('load.firstRow', t, BUDGET.load)
  record('load.longTasks', await longTasks(page))
  record('load.rowsInDom', await page.locator('.list-pane .task-row').count(), BUDGET.rowsInDom)
})

test('switching views', async ({ page }) => {
  await open(page)
  await longTasks(page)
  const views = ['list:l3', 'inbox', 'week', 'tag:tag1', 'list:l0', 'today']
  const times: number[] = []
  for (const v of views) {
    times.push(await inputToPaint(page, () => page.locator(`.side-item[data-dnd-view="${v}"]`).click()))
    record('switchView.' + v, times[times.length - 1])
    await settle(page)
  }
  record('switchView.max', Math.max(...times), BUDGET.switchView)
  record('switchView.mean', times.reduce((a, b) => a + b, 0) / times.length)
  record('switchView.longTasks', await longTasks(page))
})

test('scrolling the list', async ({ page }) => {
  await open(page)
  const frames = await page.evaluate(async () => {
    const body = document.querySelector<HTMLElement>('.list-body')!
    const out: number[] = []
    let last = performance.now()
    for (let i = 0; i < 180; i++) {
      body.scrollTop += 60
      await new Promise((r) => requestAnimationFrame(r))
      const now = performance.now()
      out.push(now - last)
      last = now
    }
    return out
  })
  frames.sort((a, b) => a - b)
  const mean = frames.reduce((a, b) => a + b, 0) / frames.length
  record('scroll.fps', 1000 / mean)
  record('scroll.p95', frames[Math.floor(frames.length * 0.95)], BUDGET.scrollP95)
  record('scroll.over50ms', frames.filter((f) => f > 50).length)
})

test('typing in quick add', async ({ page }) => {
  await open(page)
  await page.locator('.quick-add-input').first().focus()
  const r = await typeInto(page, 'Buy milk tomorrow')
  record('quickAdd.keyMax', r.max, BUDGET.quickAddKey)
  record('quickAdd.keyMean', r.mean)
})

test('completing a task', async ({ page }) => {
  await open(page, 'list:l3')
  await longTasks(page)
  const box = page.locator('.list-pane .group:not([data-done]) .task-row .checkbox')
  // the tick plays, then the row moves into the completed group (the first one also sets up the sound)
  const first = await inputToPaint(page, () => box.first().click())
  await page.waitForTimeout(1500)
  const second = await inputToPaint(page, () => box.first().click())
  await page.waitForTimeout(1500)
  record('complete.first', first)
  record('complete.click', second, BUDGET.complete)
  record('complete.longTasks', await longTasks(page))
})

test('opening the detail', async ({ page }) => {
  await open(page, 'list:l3')
  const times: number[] = []
  for (let i = 0; i < 4; i++) {
    times.push(await inputToPaint(page, () => page.locator('.list-pane .task-row .task-meta').nth(i * 3).click()))
    await settle(page)
  }
  record('detail.max', Math.max(...times), BUDGET.openDetail)
})

test('search', async ({ page }) => {
  await open(page)
  await page.keyboard.press('Control+f')
  await expect(page.locator('.search-input')).toBeVisible()
  await longTasks(page)
  const r = await typeInto(page, 'review')
  record('search.keyMax', r.max, BUDGET.searchKey)
  record('search.keyMean', r.mean)
  record('search.longTasks', await longTasks(page))
})

test('calendar month and statistics', async ({ page }) => {
  await open(page)
  await longTasks(page)
  record('calendar.open', await inputToPaint(page, () => page.locator('.rail-btn').nth(1).click()), BUDGET.calendar)
  await expect(page.locator('.cal-month')).toBeVisible()
  await settle(page)
  record('stats.open', await inputToPaint(page, () => page.locator('.rail-btn').nth(5).click()), BUDGET.stats)
  await settle(page)
})
