import { expect, test, type Locator, type Page } from '@playwright/test'

const KEY = 'tickdone:data:v1'

/** Open the app on the habit module (set through the persisted UI state, so it works with any navigation). */
async function openHabits(page: Page, data?: unknown) {
  await page.addInitScript(
    ([key, json]) => {
      localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'habit', view: 'today' }))
      if (json && !localStorage.getItem(key)) localStorage.setItem(key, json)
    },
    [KEY, data ? JSON.stringify(data) : ''] as const,
  )
  await page.goto('/')
  await expect(page.locator('.habit-row').first()).toBeVisible()
}

/** Habit names in the order the list shows them. */
const shownOrder = (page: Page) => page.locator('.habit-row .habit-row-name').allTextContents()

/** Habit names in the order the app saved to localStorage (null until something was saved). */
const storedOrder = (page: Page) =>
  page.evaluate((key) => {
    const d = JSON.parse(localStorage.getItem(key) ?? 'null') as { habits: { name: string; order: number }[] } | null
    return d ? [...d.habits].sort((a, b) => a.order - b.order).map((h) => h.name) : null
  }, KEY)

const storedHabit = (page: Page, name: string) =>
  page.evaluate(
    ([key, name]) => (JSON.parse(localStorage.getItem(key) ?? 'null') as { habits: { name: string; section?: string; checkins: Record<string, true> }[] } | null)?.habits.find((h) => h.name === name),
    [KEY, name] as const,
  )

const row = (page: Page, name: string) => page.locator('.habit-row', { has: page.locator('.habit-row-name', { hasText: name }) })

/** A point on the row's text, away from the check-in button. */
async function grip(l: Locator) {
  const b = (await l.boundingBox())!
  return { x: b.x + b.width * 0.35, y: b.y + b.height / 2 }
}

async function below(l: Locator) {
  const b = (await l.boundingBox())!
  return { x: b.x + b.width * 0.35, y: b.y + b.height * 0.8 }
}

async function mouseDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, beforeUp?: () => Promise<void>) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12)
  await beforeUp?.()
  await page.mouse.up()
}

/** A real touch sequence through CDP (Chromium turns it into touch + pointer events). */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, holdMs: number) {
  const cdp = await page.context().newCDPSession(page)
  const at = (x: number, y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from.x, from.y) })
  await page.waitForTimeout(holdMs)
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12) })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

const SECTIONED = {
  version: 1,
  tasks: [],
  lists: [],
  folders: [],
  tags: [],
  focus: [],
  settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
  habits: [
    { id: 'h1', name: '早起', icon: '🌅', color: '#FFAC38', checkins: {}, createdAt: 0, order: 0, section: 'morning' },
    { id: 'h2', name: '喝水', icon: '💧', color: '#4CA1FF', checkins: {}, createdAt: 0, order: 1 },
    { id: 'h3', name: '阅读', icon: '📖', color: '#6E75F4', checkins: {}, createdAt: 0, order: 2, section: 'night' },
  ],
}

test.describe('habit reorder with the mouse', () => {
  test('drags a habit below another, saves the order, and undo restores it', async ({ page }) => {
    await openHabits(page)
    expect(await shownOrder(page)).toEqual(['早起', '喝水', '阅读'])
    await mouseDrag(page, await grip(row(page, '早起')), await below(row(page, '阅读')))
    await expect.poll(() => shownOrder(page)).toEqual(['喝水', '阅读', '早起'])
    await expect.poll(() => storedOrder(page)).toEqual(['喝水', '阅读', '早起'])
    const toast = page.locator('.toast')
    await expect(toast).toContainText('已调整「早起」的顺序')
    await toast.getByRole('button', { name: '撤销' }).click()
    await expect.poll(() => storedOrder(page)).toEqual(['早起', '喝水', '阅读'])
  })

  test('Escape cancels the drag and nothing changes; a plain click still selects', async ({ page }) => {
    await openHabits(page)
    const to = await below(row(page, '阅读'))
    await mouseDrag(page, await grip(row(page, '早起')), to, async () => {
      await expect(page.locator('.habit-drop-line')).toBeVisible()
      await page.keyboard.press('Escape')
    })
    await page.waitForTimeout(400)
    expect(await shownOrder(page)).toEqual(['早起', '喝水', '阅读'])
    expect(await storedOrder(page)).toBeNull()
    await expect(page.locator('.habit-drop-line')).toHaveCount(0)
    await row(page, '喝水').click()
    await expect(row(page, '喝水')).toHaveClass(/selected/)
  })

  test('dropping on another section header moves the habit into that section', async ({ page }) => {
    await openHabits(page, SECTIONED)
    const head = page.locator('.habit-group-head', { hasText: '上午' })
    const hb = (await head.boundingBox())!
    await mouseDrag(page, await grip(row(page, '喝水')), { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 })
    await expect.poll(async () => (await storedHabit(page, '喝水'))?.section).toBe('morning')
    await expect(page.locator('.habit-group').first().locator('.habit-row-name')).toHaveText(['早起', '喝水'])
    await expect(page.locator('.toast')).toContainText('已将「喝水」移到上午')
  })
})

test.describe('habit reorder by touch', () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true })

  test('a long press lifts the row and dragging reorders it', async ({ page }) => {
    await openHabits(page)
    await touchDrag(page, await grip(row(page, '阅读')), await grip(row(page, '早起')).then((p) => ({ ...p, y: p.y - 12 })), 500)
    await expect.poll(() => shownOrder(page)).toEqual(['阅读', '早起', '喝水'])
    await expect.poll(() => storedOrder(page)).toEqual(['阅读', '早起', '喝水'])
  })

  test('moving before the long press is a scroll, not a drag', async ({ page }) => {
    await openHabits(page)
    await touchDrag(page, await grip(row(page, '早起')), await below(row(page, '阅读')), 60)
    await page.waitForTimeout(400)
    expect(await shownOrder(page)).toEqual(['早起', '喝水', '阅读'])
    expect(await storedOrder(page)).toBeNull()
  })
})

test('checking in fills the button and saves today', async ({ page }) => {
  await openHabits(page)
  const btn = row(page, '喝水').locator('.habit-check')
  await btn.click()
  await expect(btn).toHaveClass(/checked/)
  await expect.poll(async () => Object.keys((await storedHabit(page, '喝水'))?.checkins ?? {}).length).toBe(1)
  await btn.click()
  await expect(btn).not.toHaveClass(/checked/)
  await expect.poll(async () => Object.keys((await storedHabit(page, '喝水'))?.checkins ?? {}).length).toBe(0)
})
