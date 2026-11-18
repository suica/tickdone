import { expect, test, type Page } from '@playwright/test'

// Drag and drop in the task list with a mouse and with touch (long press), checked against the saved data.

type Box = { x: number; y: number; width: number; height: number }
type Saved = { tasks: { id: string; title: string; dueDate?: string; order: number; parentId?: string; listId: string }[]; lists: { id: string; name: string }[] }

const saved = async (page: Page): Promise<Saved> => {
  await page.waitForTimeout(400) // saves are debounced
  return page.evaluate(() => JSON.parse(localStorage.getItem('tickdone:data:v1') || 'null'))
}
const byTitle = (d: Saved, title: string) => d.tasks.find((t) => t.title.startsWith(title))!
/** The row whose title starts with `title` (the title is an input with a mouse, plain text on touch screens). */
async function rowOf(page: Page, title: string) {
  const find = () => page.locator('.task-row .task-title').evaluateAll((els, t) => els.findIndex((e) => ((e as HTMLInputElement).value ?? e.textContent ?? '').trim().startsWith(t)), title)
  await expect.poll(find).toBeGreaterThanOrEqual(0)
  return page.locator('.task-row').nth(await find())
}

async function box(page: Page, sel: ReturnType<Page['locator']> | Promise<ReturnType<Page['locator']>>): Promise<Box> {
  sel = await sel
  await sel.scrollIntoViewIfNeeded()
  return (await sel.boundingBox())!
}

/** Mouse: press, move past the 4px threshold, then glide to the target. */
async function mouseDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, from.y + 8, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.waitForTimeout(80)
  await page.mouse.up()
}

/** Touch: long press (350ms) then move, through real touch events. */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page)
  const point = (x: number, y: number) => [{ x: Math.round(x), y: Math.round(y), radiusX: 2, radiusY: 2, force: 1, id: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) })
  await page.waitForTimeout(450)
  for (let i = 1; i <= 12; i++) {
    const t = i / 12
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t) })
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(80)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

for (const input of ['mouse', 'touch'] as const) {
  test.describe(`${input} drag`, () => {
    test.use({ hasTouch: input === 'touch' })
    const drag = input === 'mouse' ? mouseDrag : touchDrag

    test.beforeEach(async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('.task-row').first()).toBeVisible()
      // the inbox is sorted by hand (custom order): 欢迎使用 first, then 试试快速添加
      await page.locator('.sidebar .side-item', { hasText: /收[件集]箱/ }).first().click()
      await expect(await rowOf(page, '试试快速添加')).toBeVisible()
    })

    test('reorder inside the list', async ({ page }) => {
      const first = await box(page, rowOf(page, '欢迎使用'))
      const second = await box(page, rowOf(page, '试试快速添加'))
      expect(second.y).toBeGreaterThan(first.y)
      // the second row goes above the first one
      await drag(page, { x: second.x + second.width - 60, y: second.y + second.height / 2 }, { x: first.x + first.width - 60, y: first.y + 6 })
      await expect(page.locator('.toast')).toContainText('已调整顺序')
      const d = await saved(page)
      expect(byTitle(d, '试试快速添加').order).toBeLessThan(byTitle(d, '欢迎使用').order)
      expect((await box(page, rowOf(page, '试试快速添加'))).y).toBeLessThan((await box(page, rowOf(page, '欢迎使用'))).y)
    })

    test('drop on a sidebar list moves the task there', async ({ page }) => {
      const row = await box(page, rowOf(page, '欢迎使用'))
      const target = await box(page, page.locator('.sidebar .side-item', { hasText: '生活' }))
      await drag(page, { x: row.x + row.width - 60, y: row.y + row.height / 2 }, { x: target.x + 40, y: target.y + target.height / 2 })
      await expect(page.locator('.toast')).toContainText('已移动到「生活」')
      const d = await saved(page)
      expect(byTitle(d, '欢迎使用').listId).toBe(d.lists.find((l) => l.name === '生活')!.id)
    })

    test('dragging right nests under the task above', async ({ page }) => {
      const first = await box(page, rowOf(page, '欢迎使用'))
      const second = await box(page, rowOf(page, '试试快速添加'))
      const from = { x: second.x + second.width / 2, y: second.y + second.height / 2 }
      await drag(page, from, { x: from.x + 60, y: first.y + first.height + 4 })
      await expect(page.locator('.toast')).toContainText('的子任务')
      const d = await saved(page)
      expect(byTitle(d, '试试快速添加').parentId).toBe(byTitle(d, '欢迎使用').id)
      await expect(await rowOf(page, '试试快速添加')).toHaveAttribute('data-depth', '1')
    })
  })
}
