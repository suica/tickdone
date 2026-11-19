import { expect, test, type Page } from '@playwright/test'

// Colour rules for the task list and sidebar, in both themes. Runs in English.
test.use({ locale: 'en-US' })

const day = (k: number) => {
  const d = new Date()
  d.setDate(d.getDate() + k)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function open(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(
    ([theme, today, late]) => {
      if (localStorage.getItem('tickdone:data:v1')) return
      const base = { content: '', listId: 'inbox', tags: [], status: 0, createdAt: 0, modifiedAt: 0, subtasks: [] }
      const tasks = [
        { ...base, id: 'a', title: 'high', priority: 5, order: 0, dueDate: late },
        { ...base, id: 'b', title: 'medium', priority: 3, order: 1, dueDate: today },
        { ...base, id: 'c', title: 'low', priority: 1, order: 2, dueDate: today },
        { ...base, id: 'd', title: 'none', priority: 0, order: 3, dueDate: today, tags: ['plain'] },
      ]
      const settings = { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme, showCompleted: true }
      localStorage.setItem('tickdone:data:v1', JSON.stringify({ version: 1, tasks, lists: [], folders: [], tags: [{ name: 'plain' }], habits: [], focus: [], filters: [], settings }))
      localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'tasks', view: 'week' }))
    },
    [theme, day(0), day(-2)] as const,
  )
  await page.goto('/')
  await expect(page.locator('.task-row').first()).toBeVisible()
}

const row = (page: Page, title: string) => page.locator('.task-row', { has: page.locator(`input.task-title[value="${title}"]`) }).first()

const tokenColor = (page: Page, token: string) =>
  page.evaluate((token) => {
    const el = document.createElement('span')
    el.style.color = `var(${token})`
    document.body.append(el)
    const c = getComputedStyle(el).color
    el.remove()
    return c
  }, token)

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test('priority shows on the checkbox border only, with a label naming it', async ({ page }) => {
      await open(page, theme)
      for (const [title, label, token] of [
        ['high', 'Priority: High', '--p-high'],
        ['medium', 'Priority: Medium', '--p-med'],
        ['low', 'Priority: Low', '--p-low'],
        ['none', 'Priority: None', '--p-none'],
      ]) {
        const cb = row(page, title).locator('.checkbox')
        // a checkbox named by its task, with the priority as its description (and tooltip)
        await expect(cb).toHaveAttribute('aria-label', title)
        await expect(cb).toHaveAttribute('aria-description', label)
        await expect(cb).toHaveAttribute('title', label)
        const style = await cb.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopColor }))
        expect(style.bg).toBe('rgba(0, 0, 0, 0)')
        expect(style.border).toBe(await tokenColor(page, token))
      }
      // low priority is not the accent blue that dates and links use
      expect(await tokenColor(page, '--p-low')).not.toBe(await tokenColor(page, '--primary'))
    })

    test('group headings and plain tags stay neutral', async ({ page }) => {
      await open(page, theme)
      const text = await tokenColor(page, '--text')
      const heading = page.locator('.group-head .overdue').first()
      await expect(heading).toBeVisible()
      expect(await heading.evaluate((el) => getComputedStyle(el).color)).toBe(text)
      // the late date itself is still red
      expect(await row(page, 'high').locator('.task-date').evaluate((el) => getComputedStyle(el).color)).toBe(await tokenColor(page, '--overdue'))
      expect(await row(page, 'none').locator('.tag-pill').evaluate((el) => getComputedStyle(el).color)).toBe(await tokenColor(page, '--text-2'))
    })

    test('empty sidebar sections explain themselves in a soft rounded box', async ({ page }) => {
      await open(page, theme)
      const hint = page.locator('.side-hint').first()
      await expect(hint).toBeVisible()
      const s = await hint.evaluate((el) => ({ radius: getComputedStyle(el).borderTopLeftRadius, bg: getComputedStyle(el).backgroundColor }))
      expect(s.radius).toBe('8px')
      expect(s.bg).not.toBe('rgba(0, 0, 0, 0)')
    })

    test('sidebar counts use tabular figures in the muted text colour', async ({ page }) => {
      await open(page, theme)
      const count = page.locator('.side-item:not(.active) .side-count').first()
      await expect(count).toBeVisible()
      const s = await count.evaluate((el) => ({ num: getComputedStyle(el).fontVariantNumeric, weight: getComputedStyle(el).fontWeight, color: getComputedStyle(el).color }))
      expect(s.num).toContain('tabular-nums')
      expect(Number(s.weight)).toBeGreaterThanOrEqual(500)
      expect(s.color).toBe(await tokenColor(page, '--text-3'))
    })
  })
}
