import { expect, test, type Page } from '@playwright/test'
import { boxOf, grabPoint, mouseDrag, open, stored, touchDrag } from './calHelpers'

// Drag in the matrix with a mouse (desktop) and with touch (phone): to another quadrant changes the
// priority, inside a quadrant changes the order. Every test checks the stored data.

const rows = (page: Page, p: number) => page.locator(`.matrix-quad[data-p="${p}"] .matrix-item`).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id))
const center = async (page: Page, sel: string) => {
  const b = await boxOf(page, sel)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

test.describe('mouse', () => {
  test('dragging a task into another quadrant gives it that priority, undo restores it', async ({ page }) => {
    await open(page, 'matrix')
    const from = await grabPoint(page, '.matrix-item[data-id="mail"]')
    const to = await center(page, '.matrix-quad[data-p="3"] .matrix-body')
    await mouseDrag(page, from, to, { release: false })
    await expect(page.locator('.matrix-quad[data-p="3"]')).toHaveClass(/drag-over/)
    await page.mouse.up()
    await expect.poll(async () => (await stored(page, 'mail'))?.priority).toBe(3)
    await expect(page.locator('.matrix-quad[data-p="3"] .matrix-item[data-id="mail"]')).toBeVisible()
    const toast = page.locator('.toast')
    await expect(toast).toContainText('已移到「重要不紧急」')
    await toast.getByRole('button', { name: '撤销' }).click()
    await expect.poll(async () => (await stored(page, 'mail'))?.priority).toBe(5)
  })

  test('dragging inside a quadrant reorders it and keeps that order', async ({ page }) => {
    await open(page, 'matrix')
    expect(await rows(page, 0)).toEqual(['walk', 'groceries', 'tidy'])
    const from = await grabPoint(page, '.matrix-item[data-id="tidy"]')
    const first = await boxOf(page, '.matrix-item[data-id="walk"]')
    await mouseDrag(page, from, { x: from.x, y: first.y + 6 }, { release: false })
    await expect(page.locator('.matrix-quad[data-p="0"] .matrix-drop-line')).toBeVisible()
    await page.mouse.up()
    await expect.poll(() => rows(page, 0)).toEqual(['tidy', 'walk', 'groceries'])
    const order = async (id: string) => (await stored(page, id))!.order
    await expect.poll(async () => (await order('tidy')) < (await order('walk'))).toBe(true)
    expect(await order('walk')).toBeLessThan(await order('groceries'))
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('tickdone:matrix-sort'))) ?? '{}')['0']).toBe('custom')
    await page.reload()
    await expect.poll(() => rows(page, 0)).toEqual(['tidy', 'walk', 'groceries'])
  })

  test('Esc cancels a drag', async ({ page }) => {
    await open(page, 'matrix')
    const from = await grabPoint(page, '.matrix-item[data-id="mail"]')
    const to = await center(page, '.matrix-quad[data-p="0"] .matrix-body')
    await mouseDrag(page, from, to, { release: false })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await page.waitForTimeout(300)
    expect((await stored(page, 'mail'))?.priority).toBe(5)
    await expect(page.locator('.matrix-quad.drag-over')).toHaveCount(0)
  })
})

test('quadrant names, menu and toast follow the chosen language', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tickdone-locale', 'ru'))
  await open(page, 'matrix')
  await expect(page.locator('.matrix-name')).toHaveText(['Срочно и важно', 'Важно, не срочно', 'Срочно, не важно', 'Не срочно и не важно'])
  const from = await grabPoint(page, '.matrix-item[data-id="mail"]')
  const to = await center(page, '.matrix-quad[data-p="3"] .matrix-body')
  await mouseDrag(page, from, to)
  await expect(page.locator('.toast')).toContainText('Перенесено в «Важно, не срочно»')
  await page.locator('.matrix-quad[data-p="3"] .matrix-more').click()
  await expect(page.locator('.menu')).toContainText('Сортировка')
})

test.describe('touch on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the four quadrants stay 2 x 2; a quadrant title opens it to fill the grid and closes it again', async ({ page }) => {
    await open(page, 'matrix')
    const q1 = await boxOf(page, '.matrix-quad[data-p="5"]')
    const q2 = await boxOf(page, '.matrix-quad[data-p="3"]')
    expect(Math.abs(q1.y - q2.y)).toBeLessThan(2)
    expect(q2.x).toBeGreaterThan(q1.x + q1.width - 2)
    await page.locator('.matrix-quad[data-p="3"] .matrix-quad-head').tap()
    await expect(page.locator('.matrix-quad[data-p="3"]')).toHaveClass(/expanded/)
    await expect(page.locator('.matrix-quad[data-p="5"]')).toBeHidden()
    await page.locator('.matrix-quad[data-p="3"] .matrix-quad-head').tap()
    await expect(page.locator('.matrix-quad[data-p="5"]')).toBeVisible()
    await expect(page.locator('.matrix-quad.expanded')).toHaveCount(0)
  })

  test('long-press a task and drop it in another quadrant', async ({ page }) => {
    await open(page, 'matrix')
    const from = await center(page, '.matrix-item[data-id="gym"]')
    const to = await center(page, '.matrix-quad[data-p="5"] .matrix-body')
    await touchDrag(page, from, to)
    await expect.poll(async () => (await stored(page, 'gym'))?.priority).toBe(5)
  })

  test('long-press a task and move it up inside its quadrant', async ({ page }) => {
    await open(page, 'matrix')
    expect(await rows(page, 5)).toEqual(['fees', 'review', 'mail'])
    const from = await center(page, '.matrix-item[data-id="mail"]')
    const first = await boxOf(page, '.matrix-item[data-id="fees"]')
    await touchDrag(page, from, { x: from.x, y: first.y + 5 })
    await expect.poll(() => rows(page, 5)).toEqual(['mail', 'fees', 'review'])
  })
})
