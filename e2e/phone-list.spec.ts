import { devices, expect, test, type Page } from '@playwright/test'

// Phone task list (Pixel 7 emulation, real touch events through CDP): grouped cards, row swipe actions
// and the bottom-sheet task detail. The app runs in English on its own data.

type Pt = { x: number; y: number }
const now = Date.now()
const task = (id: string, title: string, order: number, p: Record<string, unknown> = {}) => ({
  id,
  title,
  content: '',
  listId: 'inbox',
  tags: [],
  priority: 0,
  status: 0,
  createdAt: now,
  modifiedAt: now,
  order,
  subtasks: [],
  ...p,
})
const DATA = {
  version: 1,
  lists: [{ id: 'life', name: 'Life', color: '#35D870', view: 'list', order: 1, sections: [] }],
  folders: [],
  tags: [],
  habits: [],
  focus: [],
  settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: false },
  tasks: Array.from({ length: 24 }, (_, i) => task('t' + i, 'Task number ' + i, i, i % 2 ? { listId: 'life' } : {})),
}

async function open(page: Page) {
  await page.addInitScript(
    ([data, state]) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('tickdone-locale', 'en')
      localStorage.setItem('tickdone:data:v1', JSON.stringify(data))
      localStorage.setItem('tickdone:ui:v1', JSON.stringify(state))
    },
    [DATA, { module: 'tasks', view: 'all', prefs: { all: { groupBy: 'list', sortBy: 'custom' } }, collapsed: {}, sidebarHidden: false }] as const,
  )
  await page.goto('/')
  await expect(page.locator('.task-row').first()).toBeVisible()
  await page.waitForSelector('#launch', { state: 'detached' })
}

async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: Pt) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), radiusX: 2, radiusY: 2, force: 1, id: 1 }] : [] })
  return {
    async drag(from: Pt, to: Pt, steps = 10) {
      await send('touchStart', from)
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps })
        await page.waitForTimeout(16)
      }
      await send('touchEnd')
    },
  }
}

const row = (page: Page, id: string) => page.locator(`.task-row[data-task-id="${id}"]`)
const box = async (page: Page, id: string) => (await row(page, id).boundingBox())!
const offsetX = (page: Page, id: string) => row(page, id).evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)
const saved = async (page: Page) => {
  await page.waitForTimeout(400) // saves are debounced
  return page.evaluate(() => JSON.parse(localStorage.getItem('tickdone:data:v1') || 'null')) as Promise<{ tasks: { id: string; status: number; pinned?: boolean }[] }>
}

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7']

test.describe('phone task list (Pixel 7 emulation)', () => {
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })

  test('groups are rounded cards on a grey page, with a floating bottom bar', async ({ page }) => {
    await open(page)
    const card = page.locator('.list-content > .group').first()
    expect(await card.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('12px')
    expect(await page.locator('.list-pane').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(242, 242, 246)')
    expect(await page.locator('.list-head-btn').first().evaluate((el) => getComputedStyle(el).borderRadius)).toBe('50%')
    const bar = (await page.locator('.tabbar').boundingBox())!
    const fab = (await page.locator('.qa-fab').boundingBox())!
    expect(bar.x).toBeGreaterThan(0)
    expect(bar.y + bar.height).toBeLessThan(viewport.height)
    expect(fab.y + fab.height).toBeLessThanOrEqual(bar.y)
  })

  test('swiping left reveals date, move and delete; tapping elsewhere closes it', async ({ page }) => {
    await open(page)
    const b = await box(page, 't2')
    const t = await touch(page)
    await t.drag({ x: b.x + b.width - 30, y: b.y + b.height / 2 }, { x: b.x + b.width - 190, y: b.y + b.height / 2 })
    for (const name of ['Date', 'Move', 'Delete']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    await expect.poll(() => offsetX(page, 't2')).toBe(-3 * 68)
    // only one row is open at a time
    const c = await box(page, 't4')
    await t.drag({ x: c.x + 60, y: c.y + c.height / 2 }, { x: c.x + 200, y: c.y + c.height / 2 })
    await expect(page.getByRole('button', { name: 'Complete', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pin', exact: true })).toBeVisible()
    await expect.poll(() => offsetX(page, 't2')).toBe(0)
    await expect.poll(() => offsetX(page, 't4')).toBe(2 * 68)
    // a tap elsewhere closes it without opening a task
    await page.locator('.list-head h1').tap()
    await expect.poll(() => offsetX(page, 't4')).toBe(0)
    await expect(page.locator('[data-detail-layer]')).toHaveCount(0)
  })

  test('swipe actions change data with undo', async ({ page }) => {
    await open(page)
    const t = await touch(page)
    const b = await box(page, 't2')
    await t.drag({ x: b.x + 60, y: b.y + b.height / 2 }, { x: b.x + 200, y: b.y + b.height / 2 })
    // headless Chromium can drop a tap that comes right after a swipe; let the swipe settle first
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Pin', exact: true }).tap()
    await expect(page.locator('.toast')).toContainText('Pinned')
    expect((await saved(page)).tasks.find((x) => x.id === 't2')?.pinned).toBe(true)
    await page.locator('.toast button').tap()
    await expect.poll(async () => (await saved(page)).tasks.find((x) => x.id === 't2')?.pinned).toBeFalsy()
  })

  test('a full swipe right completes the task', async ({ page }) => {
    await open(page)
    const b = await box(page, 't0')
    const t = await touch(page)
    await t.drag({ x: b.x + 40, y: b.y + b.height / 2 }, { x: b.x + b.width - 10, y: b.y + b.height / 2 }, 14)
    await expect(page.locator('.toast')).toContainText('Task number 0')
    await expect.poll(async () => (await saved(page)).tasks.find((x) => x.id === 't0')?.status).toBe(2)
  })

  test('a short vertical move scrolls the list instead of swiping', async ({ page }) => {
    await open(page)
    const body = page.locator('.list-body')
    const b = await box(page, 't6')
    const t = await touch(page)
    await t.drag({ x: b.x + 150, y: b.y + b.height / 2 }, { x: b.x + 162, y: b.y + b.height / 2 - 120 })
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(40)
    expect(await offsetX(page, 't6')).toBe(0)
    await expect(page.locator('.swipe-acts')).toHaveCount(0)
  })

  test('the detail is a bottom sheet: dim tap, Esc and drag down close it; drag up goes full height', async ({ page }) => {
    await open(page)
    const vh = viewport.height
    await row(page, 't1').locator('.task-title').tap()
    const sheet = page.locator('.detail-sheet')
    await expect(sheet).toBeVisible()
    await expect.poll(() => sheet.evaluate((el) => el.getAnimations().length)).toBe(0)
    const h = (await sheet.boundingBox())!.height
    expect(h / vh).toBeGreaterThan(0.5)
    expect(h / vh).toBeLessThan(0.7)
    await expect(page.locator('.detail-sheet-head .detail-chip')).toContainText('Life')
    await expect(page.locator('.detail-sheet-head .detail-round')).toHaveCount(2)

    // a tap on the dimmed list closes it
    await page.locator('.detail-sheet-mask').tap({ position: { x: 100, y: 60 } })
    await expect(page.locator('[data-detail-layer]')).toHaveCount(0)

    // Esc closes it
    await row(page, 't1').locator('.task-title').tap()
    await expect(sheet).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-detail-layer]')).toHaveCount(0)

    // drag the header up: full height
    await row(page, 't1').locator('.task-title').tap()
    await expect.poll(() => sheet.evaluate((el) => el.getAnimations().length)).toBe(0)
    const t = await touch(page)
    let grip = (await page.locator('.detail-sheet-grip').boundingBox())!
    await t.drag({ x: grip.x + grip.width / 2, y: grip.y + 8 }, { x: grip.x + grip.width / 2, y: 80 })
    await expect(sheet).toHaveClass(/full/)
    await expect.poll(async () => Math.round((await sheet.boundingBox())!.y)).toBeLessThan(40)

    // and down to close
    grip = (await page.locator('.detail-sheet-grip').boundingBox())!
    await t.drag({ x: grip.x + grip.width / 2, y: grip.y + 8 }, { x: grip.x + grip.width / 2, y: vh - 20 })
    await expect(page.locator('[data-detail-layer]')).toHaveCount(0)
    await expect(row(page, 't1')).toBeVisible()
  })
})
