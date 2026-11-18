import { expect, test, type Locator, type Page } from '@playwright/test'
import { bigData } from '../src/dev/seed'

// A windowed list (5,000 tasks; the inbox alone shows hundreds): only the rows near the visible part are in the
// document, and the keyboard, Select all, scrolling, completing and dragging still work across the whole list.

const DATA = bigData()
type Saved = { tasks: { id: string; order: number; status: number }[] }

async function open(page: Page) {
  await page.addInitScript(
    ([data, state]) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('tickdone-locale', 'en')
      localStorage.setItem('tickdone:data:v1', data)
      localStorage.setItem('tickdone:ui:v1', JSON.stringify(state))
    },
    [JSON.stringify(DATA), { module: 'tasks', view: 'inbox', prefs: { inbox: { groupBy: 'none', sortBy: 'custom' } }, collapsed: {}, sidebarHidden: false }] as const,
  )
  await page.goto('/')
  await expect(page.locator('.list-pane .task-row').first()).toBeVisible()
  await page.waitForSelector('#launch', { state: 'detached' })
}

const rows = (page: Page) => page.locator('.list-pane .task-row[data-task-id]')
// the long group (pinned tasks have a short group of their own above it)
const mainRows = (page: Page) => page.locator('.list-pane .group[data-group="all"] .task-row[data-task-id]')
const focusedId = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.taskId ?? null)
/** Clicks a row away from its title field (where its date and tags are). */
async function clickRow(l: Locator) {
  const b = (await l.boundingBox())!
  await l.page().mouse.click(b.x + b.width - 12, b.y + b.height / 2)
}
const saved = async (page: Page): Promise<Saved> => {
  await page.waitForTimeout(600) // saves are throttled
  return page.evaluate(() => JSON.parse(localStorage.getItem('tickdone:data:v1') || 'null'))
}
const openInbox = DATA.tasks.filter((t) => t.listId === 'inbox' && t.status === 0 && !t.deleted).length

test('renders only a window of a long list and the rest as it scrolls', async ({ page }) => {
  await open(page)
  expect(openInbox).toBeGreaterThan(300)
  const n = await rows(page).count()
  expect(n).toBeGreaterThan(10)
  expect(n).toBeLessThan(120)
  const first = await mainRows(page).first().getAttribute('data-task-id')
  // scroll to the end: the completed group is reached and the first rows have left the document
  await page.locator('.list-body').evaluate((el) => (el.scrollTop = el.scrollHeight))
  await expect(page.locator('.list-pane .group-done')).toBeInViewport()
  await expect(page.locator(`.list-pane .task-row[data-task-id="${first}"]`)).toHaveCount(0)
  expect(await rows(page).count()).toBeLessThan(120)
  // and back to the top
  await page.locator('.list-body').evaluate((el) => (el.scrollTop = 0))
  await expect(page.locator(`.list-pane .task-row[data-task-id="${first}"]`)).toBeInViewport()
})

test('the keyboard moves through rows that were not rendered', async ({ page }) => {
  await open(page)
  const first = await mainRows(page).first().getAttribute('data-task-id')
  await clickRow(mainRows(page).first())
  expect(await focusedId(page)).toBe(first)
  // End goes to the last row (the last completed task), far outside the first window
  await page.keyboard.press('End')
  const last = await focusedId(page)
  expect(last).not.toBe(first)
  await expect(page.locator(`.list-pane .task-row[data-task-id="${last}"]`)).toBeInViewport()
  await expect(page.locator(`.list-pane .task-row[data-task-id="${first}"]`)).toHaveCount(0)
  // up one, then Home
  await page.keyboard.press('ArrowUp')
  const above = await focusedId(page)
  expect(above).not.toBe(last)
  // Home goes to the very first row (a pinned task), then down into the long group
  await page.keyboard.press('Home')
  const top = await rows(page).first().getAttribute('data-task-id')
  expect(await focusedId(page)).toBe(top)
  await expect(page.locator(`.list-pane .task-row[data-task-id="${top}"]`)).toBeInViewport()
})

test('Select all takes every row, not just the rendered ones', async ({ page }) => {
  await open(page)
  await clickRow(mainRows(page).first())
  await page.keyboard.press('Control+a')
  const text = await page.locator('.batch-count').textContent()
  const count = Number(text?.match(/\d+/)?.[0])
  expect(count).toBeGreaterThan(openInbox)
  expect(count).toBeGreaterThan(await rows(page).count())
})

test('completing a task in a windowed list plays the motion and saves', async ({ page }) => {
  await open(page)
  const row = mainRows(page).first()
  const id = (await row.getAttribute('data-task-id'))!
  await row.locator('.checkbox').click()
  // the row holds in place while the tick plays
  await expect(page.locator(`.list-pane .task-row[data-task-id="${id}"]`)).toHaveClass(/is-checking/)
  await expect(page.locator('.toast')).toBeVisible()
  const d = await saved(page)
  expect(d.tasks.find((t) => t.id === id)!.status).toBe(2)
  await expect(page.locator(`.list-pane .group:not([data-done]) .task-row[data-task-id="${id}"]`)).toHaveCount(0)
})

test('dragging a row in a windowed list reorders it', async ({ page }) => {
  await open(page)
  const plain = page.locator('.list-pane .group[data-group="all"] > .group-body > .group-inner > .task-node:not(:has(.task-children)) > .task-row')
  const a = plain.nth(1)
  const b = plain.nth(5)
  const idA = (await a.getAttribute('data-task-id'))!
  const idB = (await b.getAttribute('data-task-id'))!
  const from = (await a.boundingBox())!
  const to = (await b.boundingBox())!
  await page.mouse.move(from.x + 200, from.y + from.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + 200, from.y + from.height / 2 + ((to.y + to.height * 0.8 - from.y - from.height / 2) * i) / 12)
  await page.mouse.up()
  await expect(page.locator('.toast')).toBeVisible()
  const d = await saved(page)
  const order = (id: string) => d.tasks.find((t) => t.id === id)!.order
  expect(order(idA)).toBeGreaterThan(order(idB))
})
