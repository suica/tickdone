import { expect, test, type Page } from '@playwright/test'
import { NOW, statsFixture } from './statsFixture'

// The statistics view in English on its own data, with a fixed clock (Wednesday 2026-11-18).
async function open(page: Page, ui: Record<string, unknown> = { module: 'stats', view: 'today' }, locale = 'en') {
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(
    ([data, ui, locale]) => {
      localStorage.setItem('tickdone-locale', locale)
      localStorage.setItem('tickdone:data:v1', JSON.stringify(data))
      localStorage.setItem('tickdone:ui:v1', JSON.stringify(ui))
    },
    [statsFixture(), ui, locale] as const,
  )
  await page.goto('/')
}

const tile = (page: Page, label: string) => page.locator('.stats-tile', { has: page.locator('.stats-tile-label', { hasText: new RegExp(`^${label}$`) }) }).locator('.stats-tile-value')
const card = (page: Page, title: string) => page.locator('.stats-card', { has: page.locator('.stats-card-title', { hasText: new RegExp(`^${title}$`) }) })

test('opens from the rail and sums up this week', async ({ page }) => {
  await open(page, { module: 'tasks', view: 'today' })
  await page.locator('.rail-btn[title="Statistics"]').click()
  await expect(page.locator('.stats-module')).toBeVisible()
  await expect(page.locator('.stats-seg button[aria-pressed="true"]')).toHaveText('Week')
  await expect(page.locator('.stats-period-label')).toHaveText('Nov 16 – 22, 2026')
  await expect(tile(page, 'Completed')).toHaveText('6')
  // due Mon–Wed: 6 completed, "Pay fees" (Sunday) is before the week, "Send invoice" is open → 6 of 7
  await expect(tile(page, 'Completion rate')).toHaveText('86%')
  await expect(tile(page, 'Overdue')).toHaveText('2')
  await expect(tile(page, 'Streak')).toHaveText('3days')
  await expect(tile(page, 'Focus time')).toHaveText('2h 55m')
  await expect(tile(page, 'Sessions')).toHaveText('5')
  await expect(tile(page, 'Best time of day')).toHaveText('9 AM')
  await expect(tile(page, 'Check-in rate')).toHaveText('83%')
  await expect(page.locator('.stats-tasks').locator(card(page, 'By list')).locator('.stats-legend li')).toHaveText(['Work3', 'Personal2', 'Inbox1'])
  await expect(page.locator('.stats-focus').locator(card(page, 'By list')).locator('.stats-legend li')).toHaveText(['Work1h 40m', 'Personal50m'])
  await expect(card(page, 'Streaks').locator('tbody tr').first()).toContainText('Read7 days7 days100%')
})

test('shows a tooltip for the bar under the pointer', async ({ page }) => {
  await open(page)
  const chart = card(page, 'Completed tasks')
  // Tuesday is the second column
  await chart.locator('.stats-hit').nth(1).hover()
  await expect(chart.locator('.stats-tip')).toHaveText('Tue, Nov 173 tasks completed')
  await expect(chart.locator('.stats-bar.active')).toHaveCount(1)
  await page.mouse.move(5, 5)
  await expect(chart.locator('.stats-tip')).toHaveCount(0)
})

test('switches between week, month, year and custom ranges', async ({ page }) => {
  await open(page)
  const chart = card(page, 'Completed tasks')
  await expect(chart.locator('.stats-hit')).toHaveCount(7)
  await page.locator('.stats-seg button', { hasText: 'Month' }).click()
  await expect(page.locator('.stats-period-label')).toHaveText('November 2026')
  await expect(chart.locator('.stats-hit')).toHaveCount(30)
  await expect(tile(page, 'Completed')).toHaveText('7')
  await page.locator('.stats-seg button', { hasText: 'Year' }).click()
  await expect(chart.locator('.stats-hit')).toHaveCount(12)
  // the current period can't go forward; going back shows last year and a way back
  await expect(page.getByRole('button', { name: 'Next period' })).toBeDisabled()
  await page.getByRole('button', { name: 'Previous period' }).click()
  await expect(page.locator('.stats-period-label')).toHaveText('2025')
  await expect(tile(page, 'Completed')).toHaveText('0')
  await page.locator('.stats-now').click()
  await expect(page.locator('.stats-period-label')).toHaveText('2026')
  await page.locator('.stats-seg button', { hasText: 'Custom' }).click()
  await page.getByLabel('From').fill('2026-11-17')
  await page.getByLabel('To').fill('2026-11-17')
  await expect(tile(page, 'Completed')).toHaveText('3')
  // the choice is kept
  await page.reload()
  await expect(page.locator('.stats-seg button[aria-pressed="true"]')).toHaveText('Custom')
})

test('formats numbers and dates for the language', async ({ page }) => {
  await open(page, undefined, 'de')
  await expect(page.locator('.stats-head h2')).toHaveText('Statistik')
  await expect(page.locator('.stats-period-label')).toHaveText('16.–22. Nov. 2026')
  await expect(tile(page, 'Erledigungsquote')).toHaveText('86 %')
})

test('bars grow in, and stand still with reduced motion', async ({ page }) => {
  await open(page)
  const bar = page.locator('.stats-bar').first()
  await expect(bar).toBeVisible()
  expect(await bar.evaluate((el) => getComputedStyle(el).animationName)).toBe('stats-grow')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(bar).toBeVisible()
  const style = await page.locator('.stats-bar').nth(2).evaluate((el) => ({ delay: getComputedStyle(el).animationDelay, duration: parseFloat(getComputedStyle(el).animationDuration) }))
  expect(style.delay).toBe('0s')
  expect(style.duration).toBeLessThan(0.001)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('opens from the tab bar and shows a tooltip on tap', async ({ page }) => {
    await open(page, { module: 'tasks', view: 'today' })
    await page.locator('.tabbar-btn[aria-label="Statistics"]').tap()
    await expect(page.locator('.stats-module')).toBeVisible()
    await expect(page.locator('.tabbar-btn[aria-label="Statistics"]')).toHaveAttribute('aria-current', 'page')
    const chart = card(page, 'Completed tasks')
    await chart.locator('.stats-hit').nth(2).tap()
    await expect(chart.locator('.stats-tip')).toHaveText('Wed, Nov 181 task completed')
    // a tap elsewhere closes it
    await page.locator('.stats-head h2').tap()
    await expect(chart.locator('.stats-tip')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
