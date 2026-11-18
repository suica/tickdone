import { devices, expect, test, type Page } from '@playwright/test'

const TASK = '整理本周工作计划'
const ORDER = ['回顾上周进展', '列出本周重点', '第三项']
const MOVED = ['列出本周重点', '第三项', '回顾上周进展']

const subtaskTitles = (page: Page) => page.locator('.subtask input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
const storedSubtasks = (page: Page) =>
  page.evaluate((title) => {
    const d = JSON.parse(localStorage.getItem('tickdone:data:v1') || 'null')
    return d?.tasks.find((t: { title: string }) => t.title === title)?.subtasks.map((s: { title: string }) => s.title)
  }, TASK)

/** Opens the seeded task with subtasks (in the 明天 view) and adds a third subtask. */
async function openTaskWithSubtasks(page: Page, tap = false) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('tickdone:ui:v1')) localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'tasks', view: 'tomorrow' }))
  })
  await page.goto('/')
  const meta = page.locator('.task-row', { has: page.locator(`input[value="${TASK}"]`) }).locator('.task-meta')
  await (tap ? meta.tap() : meta.click())
  await expect(page.locator('.subtask')).toHaveCount(2)
  await (tap ? page.locator('.detail-addsub').tap() : page.locator('.detail-addsub').click())
  await page.keyboard.type('第三项')
  await expect.poll(() => subtaskTitles(page)).toEqual(ORDER)
}

async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  return {
    async drag(from: { x: number; y: number }, to: { x: number; y: number }, hold = 0, steps = 10) {
      await send('touchStart', from.x, from.y)
      if (hold) await page.waitForTimeout(hold)
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
        await page.waitForTimeout(16)
      }
      await send('touchEnd')
    },
  }
}

const centerOf = async (page: Page, selector: string, nth = 0) => {
  const b = (await page.locator(selector).nth(nth).boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

test.describe('desktop', () => {
  test('subtasks reorder by mouse drag; Esc cancels', async ({ page }) => {
    await openTaskWithSubtasks(page)
    await page.locator('.subtask').first().hover()
    const grip = await centerOf(page, '.subtask-grip')
    const last = await centerOf(page, '.subtask', 2)

    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(grip.x, grip.y + ((last.y - grip.y + 12) * i) / 8)
    await expect(page.locator('.subtask-line')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect.poll(() => subtaskTitles(page)).toEqual(ORDER)

    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(grip.x, grip.y + ((last.y - grip.y + 12) * i) / 10)
    await page.mouse.up()
    await expect.poll(() => subtaskTitles(page)).toEqual(MOVED)
    await expect.poll(() => storedSubtasks(page)).toEqual(MOVED)
    await expect(page.locator('.toast')).toContainText('已调整子任务顺序')
  })

  test('the list/detail divider resizes the detail and the width is kept', async ({ page }) => {
    await page.goto('/')
    await page.locator('.task-row .task-meta').first().click()
    const detail = page.locator('aside.detail')
    const w0 = (await detail.boundingBox())!.width
    const d = await centerOf(page, '.detail-divider')
    await page.mouse.move(d.x, d.y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(d.x - 15 * i, d.y)
    await page.mouse.up()
    await expect.poll(async () => Math.round((await detail.boundingBox())!.width)).toBe(Math.round(w0 + 150))
    await page.reload()
    await page.locator('.task-row .task-meta').first().click()
    await expect.poll(async () => Math.round((await detail.boundingBox())!.width)).toBe(Math.round(w0 + 150))
    await page.locator('.detail-divider').dblclick()
    await expect.poll(async () => Math.round((await detail.boundingBox())!.width)).toBe(Math.round(w0))
  })

  test('GitHub link sits in the rail above settings and opens a new tab', async ({ page }) => {
    await page.goto('/')
    const a = page.locator('.rail a[aria-label="GitHub"]')
    await expect(a).toHaveAttribute('href', 'https://github.com/suica/tickdone')
    await expect(a).toHaveAttribute('target', '_blank')
    await expect(a).toHaveAttribute('rel', /noopener/)
    expect(await a.evaluate((e) => e.nextElementSibling?.getAttribute('title'))).toBe('设置')
  })
})

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7']

test.describe('phone', () => {
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })

  test('bottom bar, edge-swipe drawer with search/settings/GitHub, full-screen detail and bottom sheet', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.rail')).toHaveCount(0)
    await expect(page.locator('.tabbar button')).toHaveCount(5)
    await expect(page.locator('.tabbar button[aria-current="page"]')).toHaveAttribute('aria-label', '任务')

    const t = await touch(page)
    const vw = page.viewportSize()!.width
    await t.drag({ x: 6, y: 400 }, { x: vw - 60, y: 405 })
    await expect(page.locator('.drawer-layer.open')).toBeVisible()
    for (const name of ['搜索', '设置', 'GitHub']) await expect(page.locator(`.drawer-head [aria-label="${name}"]`)).toBeVisible()
    await page.locator('.drawer-mask').tap({ position: { x: vw - 20, y: 300 } })
    await expect(page.locator('.drawer-layer[inert]')).toHaveCount(1)

    await page.locator('.task-row .task-meta').first().tap()
    const sheetPage = page.locator('.detail-page')
    await expect(sheetPage).toBeVisible()
    await page.locator('.detail-foot .icon-btn[title="更多"]').tap()
    const sheet = page.locator('.sheet-layer .popover.sheet')
    await expect(sheet).toBeVisible()
    await expect.poll(async () => Math.round((await sheet.boundingBox())!.width)).toBe(vw)
    await page.keyboard.press('Escape')
    await expect(page.locator('.sheet-layer')).toHaveCount(0)
    await page.locator('.detail-back').tap()
    await expect(sheetPage).toHaveCount(0)
  })

  test('subtasks reorder by long-press touch drag', async ({ page }) => {
    await openTaskWithSubtasks(page, true)
    const t = await touch(page)
    const grip = await centerOf(page, '.subtask-grip')
    const last = await centerOf(page, '.subtask', 2)
    await t.drag(grip, { x: grip.x, y: last.y + 14 }, 450, 12)
    await expect.poll(() => subtaskTitles(page)).toEqual(MOVED)
    await expect.poll(() => storedSubtasks(page)).toEqual(MOVED)
  })
})
