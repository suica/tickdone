import { expect, test, type Page } from '@playwright/test'
import { boxOf, day, mouseDrag, open, stored, tasks, touchDrag, type Pt } from './calHelpers'

// Drag in the calendar with a mouse (desktop) and with touch (phone, tablet). Every test checks the
// stored data, not only what is on screen.

/** Point at `minutes` after midnight in the time grid column of `date`, `dx` px from its left edge. */
async function timeAt(page: Page, date: string, minutes: number, hourH: number, dx = 40): Promise<Pt> {
  const col = await boxOf(page, `.cal-col[data-day="${date}"]`)
  return { x: col.x + dx, y: col.y + (minutes / 60) * hourH }
}
const field = async (page: Page, id: string, key: 'dueDate' | 'dueTime' | 'duration' | 'priority') => (await stored(page, id))?.[key]

test.describe('mouse', () => {
  test('month: dropping a task on another day moves it there and keeps its time, undo restores it', async ({ page }) => {
    await open(page, 'calendar', 'month')
    const bar = await boxOf(page, '.cal-cell [data-task-id="fees"]')
    const cell = await boxOf(page, `.cal-cell[data-day="${day(-12)}"]`)
    await mouseDrag(page, { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 }, { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 })
    const toast = page.locator('.toast')
    await expect(toast).toContainText('已移到 11月6日')
    await expect.poll(() => field(page, 'fees', 'dueDate')).toBe(day(-12))
    expect(await field(page, 'fees', 'dueTime')).toBe('09:00')
    await expect(page.locator(`.cal-cell[data-day="${day(-12)}"] [data-task-id="fees"]`)).toBeVisible()
    await toast.getByRole('button', { name: '撤销' }).click()
    await expect.poll(() => field(page, 'fees', 'dueDate')).toBe(day(-13))
  })

  test('week: dragging a block moves it in 15-minute steps, also to another day', async ({ page }) => {
    await open(page, 'calendar', 'week')
    const b = await boxOf(page, '[data-block-id="review"]')
    const from = { x: b.x + b.width / 2, y: b.y + 10 }
    // 2h17.5m down: lands on the 15-minute grid at 12:15
    await mouseDrag(page, from, { x: from.x, y: from.y + 110 })
    await expect.poll(() => field(page, 'review', 'dueTime')).toBe('12:15')
    expect(await field(page, 'review', 'duration')).toBe(60)
    // one day to the right, one hour up
    const b2 = await boxOf(page, '[data-block-id="review"]')
    const next = await boxOf(page, `.cal-col[data-day="${day(1)}"]`)
    await mouseDrag(page, { x: b2.x + b2.width / 2, y: b2.y + 10 }, { x: next.x + next.width / 2, y: b2.y + 10 - 48 })
    await expect(page.locator('.toast')).toContainText('已改为 11月19日 11:15')
    await expect.poll(() => field(page, 'review', 'dueDate')).toBe(day(1))
    expect(await field(page, 'review', 'dueTime')).toBe('11:15')
  })

  test('week: dragging the bottom edge of a block changes its length', async ({ page }) => {
    await open(page, 'calendar', 'week')
    const b = await boxOf(page, '[data-block-id="gym"] .cal-resize')
    const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    await mouseDrag(page, from, { x: from.x, y: from.y + 30 })
    await expect(page.locator('.toast')).toContainText('时长已改为 1小时30分钟')
    await expect.poll(() => field(page, 'gym', 'duration')).toBe(90)
    expect(await field(page, 'gym', 'dueTime')).toBe('19:00')
    // a block without a stored length starts from 30 minutes
    const w = await boxOf(page, '[data-block-id="walk"] .cal-resize')
    await mouseDrag(page, { x: w.x + w.width / 2, y: w.y + w.height / 2 }, { x: w.x + w.width / 2, y: w.y + w.height / 2 + 24 })
    await expect.poll(() => field(page, 'walk', 'duration')).toBe(60)
  })

  test('week: drawing on empty time opens quick add for that range and creates the task', async ({ page }) => {
    await open(page, 'calendar', 'week')
    const from = await timeAt(page, day(2), 13 * 60 + 6, 48)
    await mouseDrag(page, from, { x: from.x, y: from.y + 70 })
    await expect(page.locator('.cal-draft')).toContainText('13:00 - 14:45')
    await expect(page.locator('.cal-add-head')).toContainText('13:00 - 14:45')
    await expect(page.locator('.cal-add-pop input').first()).toBeFocused()
    await page.keyboard.type('Drawn task')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await tasks(page)).find((t) => t.title === 'Drawn task')).toMatchObject({ dueDate: day(2), dueTime: '13:00', duration: 105 })
    await expect(page.locator('.cal-col [data-task-id]', { hasText: 'Drawn task' })).toBeVisible()
  })

  test('week: all-day to time sets a time, time to all-day clears it', async ({ page }) => {
    await open(page, 'calendar', 'week')
    const chip = await boxOf(page, '.cal-allday [data-task-id="groceries"]')
    const to = await timeAt(page, day(2), 16 * 60 + 15, 48)
    await mouseDrag(page, { x: chip.x + chip.width / 2, y: chip.y + chip.height / 2 }, to)
    await expect.poll(() => field(page, 'groceries', 'dueTime')).toBe('16:00')
    expect(await field(page, 'groceries', 'dueDate')).toBe(day(2))

    const b = await boxOf(page, '[data-block-id="weekly"]')
    const cell = await boxOf(page, `.cal-allday-cell[data-day="${day(3)}"]`)
    await mouseDrag(page, { x: b.x + b.width / 2, y: b.y + 8 }, { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 })
    await expect.poll(() => field(page, 'weekly', 'dueDate')).toBe(day(3))
    expect(await field(page, 'weekly', 'dueTime')).toBeUndefined()
    await expect(page.locator(`.cal-allday-cell[data-day="${day(3)}"] [data-task-id="weekly"]`)).toBeVisible()
  })

  test('Esc cancels a drag and leaves the task where it was', async ({ page }) => {
    await open(page, 'calendar', 'week')
    const b = await boxOf(page, '[data-block-id="review"]')
    await mouseDrag(page, { x: b.x + b.width / 2, y: b.y + 10 }, { x: b.x + b.width / 2, y: b.y + 150 }, { release: false })
    await expect(page.locator('.cal-preview')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.cal-preview')).toHaveCount(0)
    await page.mouse.up()
    await page.waitForTimeout(300)
    expect(await field(page, 'review', 'dueTime')).toBe('10:00')
    await expect(page.locator('.cal-add-pop')).toHaveCount(0)
  })
})

test('calendar and matrix follow the chosen language', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tickdone-locale', 'de'))
  await open(page, 'calendar', 'month')
  await expect(page.locator('.cal-title')).toHaveText('November 2026')
  await expect(page.locator('.cal-seg button')).toHaveText(['Monat', 'Woche', 'Tag', 'Liste'])
  await expect(page.locator('.cal-weekhead > div').first()).toHaveText('Mo')
  const bar = await boxOf(page, '.cal-cell [data-task-id="fees"]')
  const cell = await boxOf(page, `.cal-cell[data-day="${day(-12)}"]`)
  await mouseDrag(page, { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 }, { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 })
  await expect(page.locator('.toast')).toContainText('Auf 6. Nov. verschoben')
  await page.locator('.cal-seg button', { hasText: 'Woche' }).click()
  await expect(page.locator('.cal-allday-label')).toHaveText('Ganztägig')
})

test.describe('touch on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('month: long-press a task of the picked day and drop it on another day', async ({ page }) => {
    await open(page, 'calendar', 'month')
    const row = await boxOf(page, '.cal-dl-item[data-id="walk"]')
    const cell = await boxOf(page, `.cal-cell[data-day="${day(7)}"]`)
    await touchDrag(page, { x: row.x + row.width / 2, y: row.y + row.height / 2 }, { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 })
    await expect.poll(() => field(page, 'walk', 'dueDate')).toBe(day(7))
    await expect(page.locator('.cal-dl-item[data-id="walk"]')).toHaveCount(0)
  })

  test('a short touch move scrolls instead of dragging', async ({ page }) => {
    await open(page, 'calendar', 'month')
    const row = await boxOf(page, '.cal-dl-item[data-id="walk"]')
    const cell = await boxOf(page, `.cal-cell[data-day="${day(7)}"]`)
    await touchDrag(page, { x: row.x + row.width / 2, y: row.y + row.height / 2 }, { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 }, { hold: 60 })
    await page.waitForTimeout(300)
    expect(await field(page, 'walk', 'dueDate')).toBe(day(0))
  })

  test('three-day view: long-press moves a block, its bottom edge changes the length', async ({ page }) => {
    await open(page, 'calendar', 'week')
    await expect(page.locator('.cal-time-day')).toHaveCount(3)
    const b = await boxOf(page, '[data-block-id="review"]')
    await touchDrag(page, { x: b.x + b.width / 2, y: b.y + 8 }, { x: b.x + b.width / 2, y: b.y + 8 + 52 })
    await expect.poll(() => field(page, 'review', 'dueTime')).toBe('11:00')

    // keep the block clear of the undo toast at the bottom of the screen
    await page.locator('.cal-time-body').evaluate((el) => (el.scrollTop = 19 * 52 - 200))
    const h = await boxOf(page, '[data-block-id="gym"] .cal-resize')
    const from = { x: h.x + h.width / 2, y: h.y + h.height / 2 }
    await touchDrag(page, from, { x: from.x, y: from.y + 35 })
    await expect.poll(() => field(page, 'gym', 'duration')).toBe(90)
  })

  test('three-day view: long-press on empty time draws a new task', async ({ page }) => {
    await open(page, 'calendar', 'week')
    const from = await timeAt(page, day(1), 14 * 60 + 5, 52)
    await touchDrag(page, from, { x: from.x, y: from.y + 52 })
    await expect(page.locator('.cal-add-head')).toContainText('14:00 - 15:15')
    await page.keyboard.type('Touch task')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await tasks(page)).find((t) => t.title === 'Touch task')).toMatchObject({ dueDate: day(1), dueTime: '14:00', duration: 75 })
  })

  test('three-day view: dragging an all-day task into the grid gives it a time', async ({ page }) => {
    await open(page, 'calendar', 'week')
    const chip = await boxOf(page, '.cal-allday [data-task-id="groceries"]')
    const to = await timeAt(page, day(2), 12 * 60 + 15, 52)
    await touchDrag(page, { x: chip.x + chip.width / 2, y: chip.y + chip.height / 2 }, to)
    await expect.poll(() => field(page, 'groceries', 'dueTime')).toBe('12:00')
  })

  test('three-day view: dragging a timed task to the all-day row clears its time', async ({ page }) => {
    await open(page, 'calendar', 'week')
    // a long press on the upper part of a short block moves it, even though the finger also covers its bottom edge
    const b = await boxOf(page, '[data-block-id="walk"]')
    const cell = await boxOf(page, `.cal-allday-cell[data-day="${day(1)}"]`)
    await touchDrag(page, { x: b.x + b.width / 2, y: b.y + 6 }, { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 })
    await expect.poll(() => field(page, 'walk', 'dueDate')).toBe(day(1))
    expect(await field(page, 'walk', 'dueTime')).toBeUndefined()
    expect(await field(page, 'walk', 'duration')).toBeUndefined()
    await expect(page.locator(`.cal-allday-cell[data-day="${day(1)}"] [data-task-id="walk"]`)).toBeVisible()
  })

  test('a quick swipe pages to the next month', async ({ page }) => {
    await open(page, 'calendar', 'month')
    const g = await boxOf(page, '.cal-grid')
    await touchDrag(page, { x: g.x + g.width - 30, y: g.y + 60 }, { x: g.x + 30, y: g.y + 66 }, { hold: 0, steps: 6 })
    await expect(page.locator('.cal-title')).toHaveText('2026年12月')
  })
})

test.describe('touch on a tablet', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true })

  test('month: long-press a bar and drop it on another day', async ({ page }) => {
    await open(page, 'calendar', 'month')
    const bar = await boxOf(page, '.cal-cell [data-task-id="fees"]')
    const cell = await boxOf(page, `.cal-cell[data-day="${day(-11)}"]`)
    await touchDrag(page, { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 }, { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 })
    await expect.poll(() => field(page, 'fees', 'dueDate')).toBe(day(-11))
  })
})
