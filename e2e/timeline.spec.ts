import { expect, test, type Page } from '@playwright/test'
import { day, openTimeline } from './timelineHelpers'
import { touchDrag } from './calHelpers'

// The timeline view of a list: bars, zoom, dragging bars and their edges, scheduling from the No date
// panel, undo, Esc, lazy columns and the phone fallback. Runs in English on Wednesday 2026-11-18.

interface Stored {
  id: string
  dueDate?: string
  dueTime?: string
  duration?: number
  spanDays?: number
}
const stored = (page: Page, id: string) =>
  page.evaluate((id) => (JSON.parse(localStorage.getItem('tickdone:data:v1') ?? '{"tasks":[]}').tasks as Stored[]).find((t) => t.id === id), id)
const bar = (page: Page, id: string) => page.locator(`[data-bar="${id}"]`)
const span = async (page: Page, id: string) => {
  const b = bar(page, id)
  return { start: await b.getAttribute('data-start'), end: await b.getAttribute('data-end') }
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, { release = true, dy = 0 } = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(from.x + (dx * i) / 12, from.y + (dy * i) / 12)
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(60)
  if (release) await page.mouse.up()
}
async function centre(page: Page, selector: string, at = 0.5) {
  const b = await page.locator(selector).first().boundingBox()
  if (!b) throw new Error('no box for ' + selector)
  return { x: b.x + b.width * at, y: b.y + b.height / 2 }
}

test.describe('timeline view', () => {
  test('shows bars and single-day diamonds in rows grouped by section, with a today line', async ({ page }) => {
    await openTimeline(page)
    await expect(page.locator('.tl')).toBeVisible()
    await expect(page.locator('.tl-group')).toHaveCount(3)
    await expect(page.locator('.tl-group[data-group="s-design"] .tl-title')).toHaveText(['Write the brief', 'Mockups', 'Design review'])
    await expect(page.locator('.tl-group[data-group="none"] .tl-title')).toHaveText(['Release'])
    expect(await span(page, 'brief')).toEqual({ start: day(-2), end: day(1) })
    await expect(bar(page, 'brief')).toHaveClass(/bar/)
    await expect(bar(page, 'review')).toHaveClass(/milestone/)
    // a timed task whose duration runs past midnight spills into the next days
    expect(await span(page, 'qa')).toEqual({ start: day(12), end: day(14) })
    // 4 days at 44 px a day
    expect((await bar(page, 'brief').boundingBox())!.width).toBeCloseTo(4 * 44, 0)
    // the today line sits in today's column
    const todayCell = await page.locator(`.tl-hcell.lower[data-day="${day(0)}"]`).boundingBox()
    const line = await page.locator('.tl-today').boundingBox()
    expect(Math.abs(line!.x + line!.width / 2 - (todayCell!.x + todayCell!.width / 2))).toBeLessThan(2)
    // undated tasks are in the No date panel, not on the timeline
    await expect(page.locator('.tl-nodate-item')).toHaveText(['Write docs', 'Pick a name'])
    await expect(page.locator('.tl-title', { hasText: 'Write docs' })).toHaveCount(0)
  })

  test('the View menu switches a list to the timeline and back', async ({ page }) => {
    await openTimeline(page, { view: 'list' })
    await expect(page.locator('.tl')).toHaveCount(0)
    await page.locator('.list-head .list-head-btn').last().click()
    await page.locator('.list-view-row button[data-view="timeline"]').click()
    await expect(page.locator('.tl')).toBeVisible()
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tickdone:data:v1')!).lists[0].view)).toBe('timeline')
  })

  test('only the columns near the screen are drawn, and more appear as you scroll', async ({ page }) => {
    await openTimeline(page)
    const count = await page.locator('.tl-col').count()
    const total = await page.locator('.tl-head-track').evaluate((el) => el.getBoundingClientRect().width / 44)
    expect(count).toBeGreaterThan(10)
    expect(count).toBeLessThan(total / 2)
    const far = day(60)
    await expect(page.locator(`.tl-hcell.lower[data-day="${far}"]`)).toHaveCount(0)
    await page.locator('.tl-scroll').evaluate((el) => (el.scrollLeft += 60 * 44))
    await expect(page.locator(`.tl-hcell.lower[data-day="${far}"]`)).toHaveCount(1)
    // scrolling to the end adds days
    const before = await page.locator('.tl-head-track').evaluate((el) => el.getBoundingClientRect().width)
    await page.locator('.tl-scroll').evaluate((el) => (el.scrollLeft = el.scrollWidth))
    await expect.poll(() => page.locator('.tl-head-track').evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(before)
  })

  test('dragging a bar moves it by whole days; undo puts it back', async ({ page }) => {
    await openTimeline(page)
    await drag(page, await centre(page, '[data-bar="brief"] .tl-bar-body'), 2 * 44 + 6)
    await expect.poll(async () => (await stored(page, 'brief'))?.dueDate).toBe(day(3))
    expect((await stored(page, 'brief'))?.spanDays).toBe(3)
    expect(await span(page, 'brief')).toEqual({ start: day(0), end: day(3) })
    const toast = page.locator('.toast')
    await expect(toast).toContainText('Moved to Nov 18 – 21, 2026')
    await toast.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(async () => (await stored(page, 'brief'))?.dueDate).toBe(day(1))
    expect(await span(page, 'brief')).toEqual({ start: day(-2), end: day(1) })
  })

  test('dragging the edges changes the start and the end', async ({ page }) => {
    await openTimeline(page)
    // end edge of Mockups (Nov 21–23) to Nov 26
    await drag(page, await centre(page, '[data-bar="mocks"] .tl-handle.end'), 3 * 44)
    await expect.poll(() => stored(page, 'mocks')).toMatchObject({ dueDate: day(8), spanDays: 5 })
    await expect(page.locator('.toast')).toContainText('Now Nov 21 – 26, 2026')
    // start edge of Build the API (Nov 22–28) one day earlier
    await drag(page, await centre(page, '[data-bar="api"] .tl-handle.start'), -44)
    await expect.poll(async () => (await stored(page, 'api'))?.spanDays).toBe(7)
    expect((await stored(page, 'api'))?.dueDate).toBe(day(10))
    // a diamond grows into a bar from its end edge
    await drag(page, await centre(page, '[data-bar="review"] .tl-handle.end'), 2 * 44)
    await expect.poll(() => stored(page, 'review')).toMatchObject({ dueDate: day(8), spanDays: 2 })
    await expect(bar(page, 'review')).toHaveClass(/bar/)
    // undo the last change
    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
    await expect.poll(async () => (await stored(page, 'review'))?.dueDate).toBe(day(6))
    await expect(bar(page, 'review')).toHaveClass(/milestone/)
  })

  test('shows the new dates while dragging, and Esc cancels', async ({ page }) => {
    await openTimeline(page)
    await drag(page, await centre(page, '[data-bar="api"] .tl-bar-body'), 2 * 44, { release: false })
    await expect(bar(page, 'api')).toHaveClass(/lifted/)
    await expect(page.locator('.tl-tip')).toHaveText('Nov 24 – 30, 2026')
    expect(await span(page, 'api')).toEqual({ start: day(6), end: day(12) })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(page.locator('.tl-tip')).toHaveCount(0)
    expect(await span(page, 'api')).toEqual({ start: day(4), end: day(10) })
    expect((await stored(page, 'api'))?.dueDate).toBe(day(10))
    await expect(page.locator('.toast')).toHaveCount(0)
  })

  test('dragging an undated task onto the timeline schedules it; undo takes the date away', async ({ page }) => {
    await openTimeline(page)
    const from = await centre(page, '.tl-nodate-item[data-task-id="docs"]', 0.3)
    const cell = await page.locator(`.tl-hcell.lower[data-day="${day(2)}"]`).boundingBox()
    const row = await page.locator('.tl-row[data-task-id="mocks"]').boundingBox()
    const to = { x: cell!.x + cell!.width / 2, y: row!.y + row!.height / 2 }
    await drag(page, from, to.x - from.x, { release: false, dy: to.y - from.y })
    await expect(page.locator('.tl-ghost')).toContainText('Nov 20')
    await expect(page.locator('.tl-drop-col')).toHaveCount(1)
    await page.mouse.up()
    await expect.poll(async () => (await stored(page, 'docs'))?.dueDate).toBe(day(2))
    await expect(page.locator('.toast')).toContainText('Scheduled for Nov 20')
    await expect(bar(page, 'docs')).toHaveClass(/milestone/)
    await expect(page.locator('.tl-nodate-item')).toHaveText(['Pick a name'])
    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
    await expect.poll(async () => (await stored(page, 'docs'))?.dueDate).toBeUndefined()
    await expect(page.locator('.tl-nodate-item')).toHaveText(['Write docs', 'Pick a name'])
  })

  test('zooms between days, weeks and months, keeps the middle in view, and remembers the zoom', async ({ page }) => {
    await openTimeline(page)
    const width = async () => (await bar(page, 'api').boundingBox())!.width
    expect(await width()).toBeCloseTo(7 * 44, 0)
    await page.getByRole('radio', { name: 'Week' }).click()
    await expect(page.locator('.tl')).toHaveAttribute('data-zoom', 'week')
    expect(await width()).toBeCloseTo(7 * 16, 0)
    await expect(page.locator('.tl-hcell.lower').first()).toBeVisible()
    await expect(bar(page, 'api')).toBeInViewport()
    await page.getByRole('radio', { name: 'Month' }).click()
    await expect(page.locator('.tl')).toHaveAttribute('data-zoom', 'month')
    expect(await width()).toBeCloseTo(7 * 4, 0)
    await expect(page.locator('.tl-hcell.upper', { hasText: '2026' })).toHaveCount(1)
    await expect(bar(page, 'api')).toBeInViewport()
    // moving still snaps to days when zoomed out: 2 weeks at 16 px a day
    await page.getByRole('radio', { name: 'Week' }).click()
    await drag(page, await centre(page, '[data-bar="api"] .tl-bar-body'), 14 * 16)
    await expect.poll(async () => (await stored(page, 'api'))?.dueDate).toBe(day(24))
    await page.reload()
    await expect(page.locator('.tl')).toHaveAttribute('data-zoom', 'week')
  })

  test('"Today" brings today back into view', async ({ page }) => {
    await openTimeline(page)
    await page.locator('.tl-scroll').evaluate((el) => (el.scrollLeft += 3000))
    await expect(page.locator('.tl-today')).not.toBeInViewport()
    await page.locator('.tl-bar').getByRole('button', { name: 'Today' }).click()
    await expect(page.locator('.tl-today')).toBeInViewport()
  })

  test('clicking a bar opens the task, floating over the timeline', async ({ page }) => {
    await openTimeline(page)
    await page.locator('[data-bar="mocks"] .tl-bar-body').click()
    await expect(page.locator('.detail-float')).toBeVisible()
    await expect(page.locator('.detail-float .detail-title')).toHaveValue('Mockups')
  })

  test('the No date panel can be hidden, and that is remembered', async ({ page }) => {
    await openTimeline(page)
    await page.locator('.tl-panel-btn').click()
    await expect(page.locator('.tl-nodate')).toHaveCount(0)
    await page.reload()
    await expect(page.locator('.tl')).toBeVisible()
    await expect(page.locator('.tl-nodate')).toHaveCount(0)
  })
})

test.describe('timeline on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })
  test('shows the list with a note instead of the timeline', async ({ page }) => {
    await openTimeline(page)
    await expect(page.locator('.tl-phone-note')).toBeVisible()
    await expect(page.locator('.tl')).toHaveCount(0)
    await expect(page.locator('.task-row', { hasText: 'Build the API' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('timeline on a touch tablet', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true })
  test('a long press lifts a bar and moving it changes its dates', async ({ page }) => {
    await openTimeline(page)
    const from = await centre(page, '[data-bar="brief"] .tl-bar-body')
    await touchDrag(page, from, { x: from.x + 44, y: from.y })
    await expect.poll(async () => (await stored(page, 'brief'))?.dueDate).toBe(day(2))
  })
})
