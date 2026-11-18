import { expect, test, type Page } from '@playwright/test'
import { boxOf, day, fixture, mouseDrag, NOW, open, stored, touchDrag, type Pt } from './calHelpers'

// Planning in the calendar: the unscheduled panel next to the week and day views (a bottom sheet on
// phones), dragging undated tasks onto days and times and back, and the agenda. The UI runs in zh-CN
// (playwright.config.ts); every drop is checked in the stored data.

const HOUR_H = 48
const panel = (page: Page) => page.locator('.cal-unsched')
const panelIds = (page: Page) => panel(page).locator('.cal-task').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.taskId))
const field = async (page: Page, id: string, key: 'dueDate' | 'dueTime') => (await stored(page, id))?.[key]

/** Point at `minutes` after midnight in the time-grid column of `date`. */
async function timeAt(page: Page, date: string, minutes: number, hourH = HOUR_H): Promise<Pt> {
  const col = await boxOf(page, `.cal-col[data-day="${date}"]`)
  return { x: col.x + col.width / 2, y: col.y + (minutes / 60) * hourH }
}
const chip = (id: string) => `.cal-unsched [data-task-id="${id}"]`

/** Waits until the panel (or sheet) has finished sliding in, so its rows stay where they were measured. */
async function settled(page: Page) {
  await expect(panel(page)).toBeVisible()
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
}

/** The middle of a panel row's title (away from its checkbox). */
async function grab(page: Page, id: string): Promise<Pt> {
  await settled(page)
  const b = await boxOf(page, `${chip(id)} .cal-task-title`)
  return { x: b.x + Math.min(b.width / 2, 40), y: b.y + b.height / 2 }
}

test.describe('unscheduled panel', () => {
  test('lists the open tasks without a date, by list, and filters them', async ({ page }) => {
    await open(page, 'calendar', 'week')
    await expect(panel(page)).toBeVisible()
    await expect(panel(page).locator('.cal-unsched-count')).toHaveText('3')
    // inbox first, then the lists in sidebar order, highest priority first
    expect(await panelIds(page)).toEqual(['tidy', 'mail', 'plan'])
    await panel(page).getByRole('combobox').selectOption({ label: '工作' })
    await expect.poll(() => panelIds(page)).toEqual(['mail', 'plan'])
    // the filter is kept
    await page.reload()
    await expect.poll(() => panelIds(page)).toEqual(['mail', 'plan'])
  })

  test('closes and opens from the toolbar, stays closed, and belongs to the week and day views', async ({ page }) => {
    await open(page, 'calendar', 'week')
    const btn = page.locator('.cal-unsched-btn')
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
    await panel(page).getByRole('button', { name: '关闭' }).click()
    await expect(panel(page)).toHaveCount(0)
    await page.reload()
    await expect(panel(page)).toHaveCount(0)
    await btn.click()
    await expect(panel(page)).toBeVisible()
    await page.locator('.cal-view-btn').click()
    await page.locator('.cal-view-menu .menu-item', { hasText: /^月$/ }).click()
    await expect(panel(page)).toHaveCount(0)
    await expect(btn).toHaveCount(0)
  })

  test('dragging a task onto a time schedules it there; undo takes the date away again', async ({ page }) => {
    await open(page, 'calendar', 'week')
    const from = await grab(page, 'mail')
    // the task is held 15 minutes below its top: aiming at 14:20 lands it at 14:00
    await mouseDrag(page, from, await timeAt(page, day(1), 14 * 60 + 20))
    const toast = page.locator('.toast')
    await expect(toast).toContainText('已安排在 11月19日 14:00')
    await expect.poll(() => field(page, 'mail', 'dueDate')).toBe(day(1))
    expect(await field(page, 'mail', 'dueTime')).toBe('14:00')
    await expect(page.locator('[data-block-id="mail"]')).toBeVisible()
    expect(await panelIds(page)).toEqual(['tidy', 'plan'])
    await toast.getByRole('button', { name: '撤销' }).click()
    await expect.poll(() => field(page, 'mail', 'dueDate')).toBeUndefined()
    await expect.poll(() => panelIds(page)).toEqual(['tidy', 'mail', 'plan'])
  })

  test('dragging a task onto the all-day row gives it a date without a time', async ({ page }) => {
    await open(page, 'calendar', 'week')
    const cell = await boxOf(page, `.cal-allday-cell[data-day="${day(2)}"]`)
    await mouseDrag(page, await grab(page, 'tidy'), { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 })
    await expect(page.locator('.toast')).toContainText('已安排在 11月20日')
    await expect.poll(() => field(page, 'tidy', 'dueDate')).toBe(day(2))
    expect(await field(page, 'tidy', 'dueTime')).toBeUndefined()
    await expect(page.locator(`.cal-allday-cell[data-day="${day(2)}"] [data-task-id="tidy"]`)).toBeVisible()
  })

  test('shows where the task will land while dragging, and Esc cancels', async ({ page }) => {
    await open(page, 'calendar', 'week')
    await mouseDrag(page, await grab(page, 'plan'), await timeAt(page, day(0), 16 * 60 + 20), { release: false })
    await expect(page.locator('.cal-preview')).toContainText('Plan sprint')
    await expect(page.locator(chip('plan')).locator('..')).toHaveClass(/cal-src/)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(page.locator('.cal-preview')).toHaveCount(0)
    expect(await field(page, 'plan', 'dueDate')).toBeUndefined()
    await expect(page.locator('.toast')).toHaveCount(0)
  })

  test('dropping a task from the calendar on the panel removes its date; undo puts it back', async ({ page }) => {
    await open(page, 'calendar', 'week')
    await settled(page)
    const b = await boxOf(page, '[data-block-id="review"]')
    const p = await boxOf(page, '.cal-unsched-body')
    await mouseDrag(page, { x: b.x + b.width / 2, y: b.y + 10 }, { x: p.x + p.width / 2, y: p.y + p.height / 2 }, { release: false })
    await expect(panel(page)).toHaveClass(/drop-over/)
    await expect(page.locator('.cal-unsched-drop')).toHaveText('拖到这里移除日期')
    await page.mouse.up()
    await expect(page.locator('.toast')).toContainText('已移除日期')
    await expect.poll(() => field(page, 'review', 'dueDate')).toBeUndefined()
    expect(await field(page, 'review', 'dueTime')).toBeUndefined()
    await expect.poll(() => panelIds(page)).toContain('review')
    await page.locator('.toast').getByRole('button', { name: '撤销' }).click()
    await expect.poll(() => field(page, 'review', 'dueTime')).toBe('10:00')
    expect(await field(page, 'review', 'dueDate')).toBe(day(0))
  })

  test('works in the day view too', async ({ page }) => {
    await open(page, 'calendar', 'day')
    await mouseDrag(page, await grab(page, 'mail'), await timeAt(page, day(0), 15 * 60 + 50))
    await expect.poll(() => field(page, 'mail', 'dueTime')).toBe('15:30')
    expect(await field(page, 'mail', 'dueDate')).toBe(day(0))
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('the panel is a bottom sheet; a long press drags a task out of it onto a time', async ({ page }) => {
    await open(page, 'calendar', 'week')
    await expect(panel(page)).toHaveCount(0)
    await expect(page.locator('.cal-unsched-btn')).toHaveCount(0)
    await page.locator('.cal-view-btn').tap()
    await page.locator('.cal-view-menu .menu-item', { hasText: '未安排的任务' }).tap()
    await expect(panel(page)).toHaveClass(/sheet/)
    await settled(page)
    const sheet = await boxOf(page, '.cal-unsched')
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(844)
    // 9:20 is above the sheet; the grid's hours are 52px tall on phones
    await touchDrag(page, await grab(page, 'tidy'), await timeAt(page, day(1), 9 * 60 + 20, 52))
    await expect.poll(() => field(page, 'tidy', 'dueDate')).toBe(day(1))
    expect(await field(page, 'tidy', 'dueTime')).toBe('09:00')
    await expect(page.locator('.toast')).toContainText('已安排在')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})

// ---------------- agenda ----------------

const FEED_URL = 'https://calendar.example.test/team.ics'
const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'X-WR-CALNAME:Team',
  'BEGIN:VEVENT',
  'UID:crit@example.test',
  'DTSTART;TZID=Asia/Shanghai:20261119T140000',
  'DTEND;TZID=Asia/Shanghai:20261119T150000',
  'SUMMARY:Design critique',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:offsite@example.test',
  'DTSTART;VALUE=DATE:20261224',
  'DTEND;VALUE=DATE:20261225',
  'SUMMARY:Year-end offsite',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n')

async function openAgenda(page: Page) {
  const serve = { status: 200, body: FEED, headers: { 'Content-Type': 'text/calendar', 'Access-Control-Allow-Origin': '*', 'X-Ics-Proxy': '1' } }
  await page.route('**/api/ics?**', (r) => r.fulfill(serve))
  await page.route(FEED_URL, (r) => r.fulfill(serve))
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(
    ([data, url]) => {
      if (sessionStorage.getItem('e2e-seeded')) return
      sessionStorage.setItem('e2e-seeded', '1')
      localStorage.setItem('tickdone:data:v1', JSON.stringify({ ...data, subscriptions: [{ id: 'team', name: 'Team', url, color: '#B37FEB' }] }))
      localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'calendar', view: 'today', prefs: {}, collapsed: {}, sidebarHidden: false }))
      localStorage.setItem('tickdone:cal:mode', 'agenda')
    },
    [fixture(), FEED_URL] as const,
  )
  await page.goto('/')
}

const agendaDays = (page: Page) => page.locator('.cal-agenda-day').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.day))

test.describe('agenda', () => {
  test('lists the coming days with tasks and calendar events in one scrolling list', async ({ page }) => {
    await openAgenda(page)
    await expect(page.locator('.cal-view-btn')).toContainText('日程')
    await expect(page.locator(`.cal-agenda-day[data-day="${day(1)}"] .cal-ev-row`)).toContainText('Design critique')
    // from today on: overdue and undated tasks stay out, days without anything are skipped
    expect((await agendaDays(page)).slice(0, 3)).toEqual([day(0), day(1), day(2)])
    const today = page.locator(`.cal-agenda-day[data-day="${day(0)}"]`)
    await expect(today.locator('.task-row')).toHaveCount(3)
    expect(await agendaDays(page)).not.toContain(day(-13))
    await expect(page.locator('.cal-agenda-month').first()).toHaveText('2026年11月')
    // a month at first; more days on request: the offsite five weeks ahead shows up
    expect(await agendaDays(page)).not.toContain('2026-12-24')
    await page.getByRole('button', { name: '显示更多天' }).click()
    await expect(page.locator(`.cal-agenda-day[data-day="2026-12-24"] .cal-ev-row`)).toContainText('Year-end offsite')
    await expect(page.locator('.cal-agenda-month').last()).toHaveText('2026年12月')
  })

  test('pages through the days and back to today', async ({ page }) => {
    await openAgenda(page)
    await page.getByRole('button', { name: '更晚' }).click()
    await expect.poll(async () => (await agendaDays(page))[0]).toBe('2026-12-24')
    await page.locator('.cal-today').click()
    await expect.poll(async () => (await agendaDays(page))[0]).toBe(day(0))
  })
})
