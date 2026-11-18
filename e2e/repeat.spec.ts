import { devices, expect, test, type Page } from '@playwright/test'

// Repeat rules: the custom repeat editor in the date picker, completing and skipping a repeating task,
// rules saved by older versions, quick-add phrases and the summary in another language.

const KEY = 'tickdone:data:v1'
// 2026-11-18 is a Wednesday; 10:00 in Asia/Shanghai (the e2e time zone)
const NOW = new Date('2026-11-18T10:00:00+08:00')
const created = NOW.getTime() - 86_400_000
const task = (p: Record<string, unknown>) => ({ content: '', listId: 'inbox', tags: [], priority: 0, status: 0, createdAt: created, modifiedAt: created, order: 1, subtasks: [], ...p })
const DATA = (tasks: object[]) => ({
  version: 1,
  lists: [],
  folders: [],
  tags: [],
  habits: [],
  focus: [],
  settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
  tasks,
})

async function open(page: Page, tasks: object[], locale = 'en') {
  await page.clock.install({ time: NOW })
  await page.addInitScript(
    ([key, json, locale]) => {
      if (localStorage.getItem(key)) return
      localStorage.setItem('tickdone-locale', locale)
      localStorage.setItem(key, json)
      localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'tasks', view: 'inbox' }))
    },
    [KEY, JSON.stringify(DATA(tasks)), locale] as const,
  )
  await page.goto('/')
  await expect(page.locator('.task-row').first()).toBeVisible()
}

/** The saved task, once the debounced save has written it. */
const stored = (page: Page, id: string) => page.evaluate(([key, id]) => JSON.parse(localStorage.getItem(key)!).tasks.find((t: { id: string }) => t.id === id), [KEY, id] as const)
/** Waits until a row's completion animation has finished, so the next click starts fresh. */
const settled = (page: Page, id: string) => expect(row(page, id)).not.toHaveClass(/is-(un)?checking/)
const storedAll = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).tasks as { id: string; status: number; dueDate?: string; repeat?: unknown; title: string }[], KEY)

/** A task's row; on desktop the title is an input, so rows are found by id. */
const row = (page: Page, id: string) => page.locator(`.task-row[data-task-id="${id}"]`)

async function openRepeatEditor(page: Page, id: string) {
  await row(page, id).locator('.task-main').click()
  await page.locator('.detail-date').click()
  await page.locator('.dp .dp-row', { hasText: 'Repeat' }).click()
  await page.locator('.dp-sub .dp-rep-custom').click()
  await expect(page.locator('.dp-rep')).toBeVisible()
}

test('the custom editor builds "monthly on the last Friday, after completion, 3 times" and completing follows it', async ({ page }) => {
  await open(page, [task({ id: 'r', title: 'Send the invoice', dueDate: '2026-11-18' })])
  await openRepeatEditor(page, 'r')
  const ed = page.locator('.dp-rep')
  const preview = ed.locator('.dp-custom-preview')

  await ed.locator('.dp-custom-u').selectOption('monthly')
  await expect(preview).toHaveText('Monthly on day 18')
  await ed.locator('.dp-rep-mday').selectOption('-1')
  await expect(preview).toHaveText('Monthly on the last day')
  await ed.locator('.dp-rep-nth').selectOption('-1')
  await ed.locator('.dp-rep-nthwd').selectOption('5')
  await expect(preview).toHaveText('Monthly on the last Friday')
  await ed.locator('.dp-custom-n').first().fill('2')
  await expect(preview).toHaveText('Every 2 months on the last Friday')
  await ed.locator('.dp-custom-n').first().fill('1')
  await ed.locator('.dp-rep-end').selectOption('count')
  await ed.locator('.dp-rep-count').fill('3')
  await ed.locator('.dp-rep-from').selectOption('completion')
  await expect(preview).toHaveText('Monthly on the last Friday, after completion, 3 times')

  await ed.getByRole('button', { name: 'OK' }).click()
  await expect(page.locator('.dp .dp-row', { hasText: 'Repeat' }).locator('.dp-row-val')).toHaveText('Monthly on the last Friday, after completion, 3 times')
  await page.locator('.dp .dp-foot').getByRole('button', { name: 'OK' }).click()
  await expect(page.locator('.detail-extra')).toContainText('Monthly on the last Friday, after completion, 3 times')
  await expect.poll(async () => (await stored(page, 'r')).repeat).toEqual({ kind: 'monthly', interval: 1, nth: -1, weekday: 5, from: 'completion', count: 3 })

  // completing moves it to the last Friday of November and counts one occurrence
  await row(page, 'r').locator('.cb').click()
  await expect(page.locator('.toast')).toContainText('Completed. Next:')
  await expect.poll(async () => (await stored(page, 'r')).dueDate).toBe('2026-11-27')
  expect((await stored(page, 'r')).repeat).toMatchObject({ done: 1, count: 3 })
  const all = await storedAll(page)
  expect(all.filter((t) => t.status === 2 && t.title === 'Send the invoice')).toHaveLength(1)
})

test('weekly on chosen days, ending on a date; the last occurrence completes the task for good', async ({ page }) => {
  await open(page, [task({ id: 'w', title: 'Swim', dueDate: '2026-11-18' })])
  await openRepeatEditor(page, 'w')
  const ed = page.locator('.dp-rep')
  // weekly is the default unit; Wednesday is on, add Friday
  await ed.getByRole('button', { name: 'Friday' }).click()
  await expect(ed.getByRole('button', { name: 'Wednesday' })).toHaveAttribute('aria-pressed', 'true')
  await ed.locator('.dp-rep-end').selectOption('until')
  await ed.locator('.dp-rep-until').fill('2026-11-20')
  await expect(ed.locator('.dp-custom-preview')).toHaveText('Weekly on Wed, Fri, until Nov 20')
  await ed.getByRole('button', { name: 'OK' }).click()
  await page.locator('.dp .dp-foot').getByRole('button', { name: 'OK' }).click()

  const cb = row(page, 'w').locator('.cb')
  await cb.click()
  await expect.poll(async () => (await stored(page, 'w')).dueDate).toBe('2026-11-20')
  await expect(page.locator('.toast')).toContainText('Completed. Next:')
  await settled(page, 'w')
  // Friday is the last one before the end date
  await row(page, 'w').locator('.cb').click()
  await expect.poll(async () => (await stored(page, 'w')).status).toBe(2)
  await expect(page.locator('.toast')).toContainText('Completed “Swim”')
})

test('skip this occurrence moves the task on without a completed copy, and undo brings it back', async ({ page }) => {
  await open(page, [task({ id: 's', title: 'Team sync', dueDate: '2026-11-18', repeat: { kind: 'weekly', interval: 1, days: [3] } })])
  await row(page, 's').click({ button: 'right' })
  await page.getByText('Skip this occurrence').click()
  await expect(page.locator('.toast')).toContainText('Skipped. Next:')
  await expect.poll(async () => (await stored(page, 's')).dueDate).toBe('2026-11-25')
  expect((await storedAll(page)).filter((t) => t.status === 2)).toHaveLength(0)
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect.poll(async () => (await stored(page, 's')).dueDate).toBe('2026-11-18')
})

test('a series that ends today has nothing to skip', async ({ page }) => {
  await open(page, [task({ id: 'e', title: 'Last lesson', dueDate: '2026-11-18', repeat: { kind: 'weekly', interval: 1, days: [3], count: 4, done: 3 } })])
  await row(page, 'e').click({ button: 'right' })
  await expect(page.locator('.menu-item', { hasText: "Won't do" })).toBeVisible()
  await expect(page.getByText('Skip this occurrence')).toHaveCount(0)
})

test('a rule saved by an older version keeps its day of the month', async ({ page }) => {
  // older versions saved only the kind and the interval, and took the day from the due date
  await open(page, [task({ id: 'o', title: 'Pay rent', dueDate: '2026-01-31', repeat: { kind: 'monthly', interval: 1 } })])
  await row(page, 'o').locator('.task-main').click()
  await expect(page.locator('.detail-extra')).toContainText('Monthly on day 31')
  await row(page, 'o').locator('.cb').click()
  await expect.poll(async () => (await stored(page, 'o')).dueDate).toBe('2026-02-28')
  await settled(page, 'o')
  await row(page, 'o').locator('.cb').click()
  // back on the 31st, not stuck on the 28th
  await expect.poll(async () => (await stored(page, 'o')).dueDate).toBe('2026-03-31')
  expect((await stored(page, 'o')).repeat).toEqual({ kind: 'monthly', interval: 1, day: 31 })
})

test('quick add understands repeat phrases', async ({ page }) => {
  await open(page, [task({ id: 'x', title: 'Existing' })])
  const input = page.locator('.quick-add-input').first()
  await input.click()
  await input.fill('Book club every 2nd Tuesday')
  await input.press('Enter')
  await expect.poll(async () => (await storedAll(page)).find((t) => t.title === 'Book club')).toBeTruthy()
  const added = (await storedAll(page)).find((t) => t.title === 'Book club')!
  expect(added).toMatchObject({ dueDate: '2026-12-08', repeat: { kind: 'monthly', interval: 1, nth: 2, weekday: 2 } })
})

test('the summary is written in the UI language', async ({ page }) => {
  await open(page, [task({ id: 'z', title: '交周报', dueDate: '2026-11-27', repeat: { kind: 'monthly', interval: 1, nth: -1, weekday: 5, count: 6 } })], 'zh-CN')
  await row(page, 'z').locator('.task-main').click()
  await expect(page.locator('.detail-extra')).toContainText('每月最后一个星期五，共 6 次')
  await row(page, 'z').click({ button: 'right' })
  await expect(page.getByText('跳过本次')).toBeVisible()
})

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7']
test.describe('phone', () => {
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })

  test('the repeat editor fills the bottom sheet and its controls are at least 40px tall', async ({ page }) => {
    await open(page, [task({ id: 'p', title: 'Stretch', dueDate: '2026-11-18' })])
    await page.locator('.task-row .task-title').first().tap()
    await page.locator('.detail-date').tap()
    await page.locator('.dp .dp-row', { hasText: 'Repeat' }).tap()
    await page.locator('.dp-rep-custom').tap()
    const ed = page.locator('.dp-rep')
    await expect(ed).toBeVisible()
    await ed.locator('.dp-custom-u').selectOption('monthly')
    await ed.locator('.dp-rep-end').selectOption('count')
    const small = await page
      .locator('.dp-rep select, .dp-rep input:not([type=radio]), .dp-rep .dp-sub-foot .btn')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height < 40).length)
    expect(small).toBe(0)
    const vw = page.viewportSize()!.width
    const box = (await ed.boundingBox())!
    expect(Math.round(box.x)).toBeGreaterThanOrEqual(0)
    expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(vw)
    await ed.getByRole('button', { name: 'OK' }).tap()
    await expect(page.locator('.dp .dp-row', { hasText: 'Repeat' }).locator('.dp-row-val')).toHaveText('Monthly on day 18, 5 times')
  })
})
