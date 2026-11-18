import { expect, test, type Page } from '@playwright/test'

// Task detail layout by width, the pinned group and date colours. Runs in English.
test.use({ locale: 'en-US' })

const TASK = 'Plan this week’s work'

/** Titles of the task rows (a title is an editable input, so read its value) */
const titles = (page: Page) =>
  page.locator('.group:not([data-done]) .task-row .task-title').evaluateAll((els) => els.map((e) => ((e as HTMLInputElement).value ?? e.textContent ?? '').trim()))

const row = (page: Page, title: string) => page.locator('.group:not([data-done]) .task-row', { has: page.locator(`input.task-title[value="${title}"]`) }).first()

async function openView(page: Page, view: string) {
  await page.addInitScript((view) => {
    if (!localStorage.getItem('tickdone:ui:v1')) localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'tasks', view }))
  }, view)
  await page.goto('/')
  await expect(page.locator('.task-row').first()).toBeVisible()
}

/** The computed colour of a CSS custom property, as the browser resolves it for `color`. */
const tokenColor = (page: Page, token: string) =>
  page.evaluate((token) => {
    const el = document.createElement('span')
    el.style.color = `var(${token})`
    document.body.append(el)
    const c = getComputedStyle(el).color
    el.remove()
    return c
  }, token)

for (const width of [1024, 1100]) {
  test.describe(`${width} px wide`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('the detail is a column next to the list, with an empty state until a task is picked', async ({ page }) => {
      await openView(page, 'tomorrow')
      const detail = page.locator('aside.detail')
      await expect(detail.locator('.empty')).toContainText('Click a task title to see its details')
      const list = page.locator('.list-pane')
      // the list stops where the detail column starts
      const lb = (await list.boundingBox())!
      const db = (await detail.boundingBox())!
      expect(lb.x + lb.width).toBeLessThanOrEqual(db.x + 1)
      expect(db.x + db.width).toBeLessThanOrEqual(width + 1)

      await row(page, TASK).locator('.task-meta').click()
      await expect(detail.locator('textarea.detail-title')).toHaveValue(TASK)
      await expect(page.locator('[data-detail-layer]')).toHaveCount(0)
      // the selected row stays visible beside the detail
      const rb = (await row(page, TASK).boundingBox())!
      expect(rb.x + rb.width).toBeLessThanOrEqual(db.x + 1)
    })

    test('date picker, tag picker and context menu open from the inline detail and keep it', async ({ page }) => {
      await openView(page, 'tomorrow')
      await row(page, TASK).locator('.task-meta').click()
      const detail = page.locator('aside.detail')
      await expect(detail.locator('textarea.detail-title')).toHaveValue(TASK)

      await detail.locator('.detail-date').click()
      await expect(page.locator('.popover.dp')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('.popover.dp')).toHaveCount(0)

      await detail.locator('.detail-foot .icon-btn[title="Tags"]').click()
      await expect(page.locator('.tag-picker')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('.tag-picker')).toHaveCount(0)

      // the task's context menu opens next to the pointer and the detail stays open beside it
      await row(page, TASK).locator('.task-meta').click({ button: 'right' })
      await expect(page.locator('.popover .ctx-head')).toBeVisible()
      await expect(detail.locator('textarea.detail-title')).toHaveValue(TASK)
      await page.keyboard.press('Escape')
      await expect(page.locator('.popover')).toHaveCount(0)
      await expect(detail.locator('textarea.detail-title')).toHaveValue(TASK)
    })
  })
}

test.describe('narrow tablet', () => {
  test.use({ viewport: { width: 900, height: 800 } })

  test('below 1024 px the detail slides over the list and nothing is shown until a task is picked', async ({ page }) => {
    await openView(page, 'tomorrow')
    await expect(page.locator('aside.detail')).toHaveCount(0)
    await row(page, TASK).locator('.task-meta').click()
    await expect(page.locator('[data-detail-layer="overlay"] textarea.detail-title')).toHaveValue(TASK)
  })
})

test.describe('desktop', () => {
  test('pinned tasks move to a Pinned group at the top, with a pin in its heading', async ({ page }) => {
    await openView(page, 'week')
    const last = (await titles(page)).at(-1)!
    await row(page, last).locator('.task-meta').click({ button: 'right' })
    await page.locator('.popover').getByText('Pin', { exact: true }).click()
    const first = page.locator('.list-content .group').first()
    await expect(first).toHaveAttribute('data-group', 'pinned')
    await expect(first.locator('.group-head')).toContainText('Pinned')
    await expect(first.locator('.group-head .group-pin')).toBeVisible()
    await expect(first.locator('input.task-title')).toHaveValue(last)

    // unpinning puts it back in its date group
    await row(page, last).locator('.task-meta').click({ button: 'right' })
    await page.locator('.popover').getByText('Unpin', { exact: true }).click()
    await expect(page.locator('.group[data-group="pinned"]')).toHaveCount(0)
  })

  test('every open date is blue, overdue dates are red', async ({ page }) => {
    await page.addInitScript(() => {
      if (localStorage.getItem('tickdone:data:v1')) return
      const day = (k: number) => {
        const d = new Date()
        d.setDate(d.getDate() + k)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }
      const base = { content: '', listId: 'inbox', tags: [], priority: 0, status: 0, createdAt: 0, modifiedAt: 0, subtasks: [] }
      const tasks = [
        ['late', -2],
        ['today', 0],
        ['in three days', 3],
        ['next month', 30],
      ].map(([title, k], i) => ({ ...base, id: 't' + i, title, order: i, dueDate: day(k as number) }))
      localStorage.setItem('tickdone:data:v1', JSON.stringify({ version: 1, tasks, lists: [], folders: [], tags: [], habits: [], focus: [], settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true } }))
    })
    await openView(page, 'inbox')
    const blue = await tokenColor(page, '--primary')
    const red = await tokenColor(page, '--overdue')
    const color = (title: string) => row(page, title).locator('.task-date').evaluate((el) => getComputedStyle(el).color)
    expect(await color('late')).toBe(red)
    for (const title of ['today', 'in three days', 'next month']) expect(await color(title)).toBe(blue)
  })

  test('selection is neutral grey, not tinted with the accent colour', async ({ page }) => {
    await openView(page, 'tomorrow')
    await row(page, TASK).locator('.task-meta').click()
    const bg = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor)
    const isGrey = (c: string) => {
      const [r, g, b] = c.match(/\d+/g)!.map(Number)
      return r === g && g === b
    }
    expect(isGrey(await bg('.task-row.selected'))).toBe(true)
    expect(isGrey(await bg('.side-item.active'))).toBe(true)
  })
})
