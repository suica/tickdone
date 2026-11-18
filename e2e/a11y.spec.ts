import AxeBuilder from '@axe-core/playwright'
import { devices, expect, test, type Page } from '@playwright/test'
import { NOW, statsFixture, day } from './statsFixture'

// Automated accessibility check (axe-core, WCAG 2.1 A and AA) of every module, dialog, menu and sheet, in the
// light and the dark theme, on a desktop and a phone. Colours people pick themselves (list, tag and habit
// colours) are left out of the contrast check: TickDone cannot choose them for you.

type Theme = 'light' | 'dark'

function data(theme: Theme) {
  const d = statsFixture() as ReturnType<typeof statsFixture> & Record<string, unknown>
  const base = { content: '', tags: [] as string[], priority: 0, status: 0, createdAt: NOW.getTime(), modifiedAt: NOW.getTime(), subtasks: [] as unknown[] }
  d.tasks.push(
    { ...base, id: 'o1', title: 'Prepare slides', listId: 'L-work', dueDate: day(0), dueTime: '15:00', priority: 5, tags: ['deep'], order: 100, content: 'Outline **first**' } as never,
    { ...base, id: 'o2', title: 'Buy flowers', listId: 'L-life', dueDate: day(1), priority: 3, order: 101, subtasks: [{ id: 's1', title: 'Pick colours', done: false }] } as never,
    { ...base, id: 'o3', title: 'Sort photos', listId: 'inbox', order: 102 } as never,
    { ...base, id: 'o4', title: 'Overdue call', listId: 'L-work', dueDate: day(-2), priority: 1, order: 103 } as never,
  )
  d.lists[0] = { ...d.lists[0], sections: [{ id: 'sec1', name: 'Doing' }] } as never
  d.filters = [{ id: 'f1', name: 'Urgent', order: 1, match: 'all', priorities: [5] }]
  d.settings = { ...d.settings, theme }
  return d
}

async function open(page: Page, theme: Theme, ui: Record<string, unknown> = {}) {
  await page.clock.install({ time: NOW })
  await page.addInitScript(
    ([d, u]) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('tickdone-locale', 'en')
      localStorage.setItem('tickdone:data:v1', JSON.stringify(d))
      localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'tasks', view: 'today', prefs: {}, collapsed: {}, ...u }))
    },
    [data(theme), ui] as const,
  )
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme })
  await page.goto('/')
  await page.waitForSelector('#launch', { state: 'detached' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
}

/** Elements drawn in a colour the user picked. */
const USER_COLOURS = ['.tag-pill', '.task-list-name', '.side-item .dot', '.habit-icon', '.cal-event', '.cal-sub-dot', '.tl-bar']

async function audit(page: Page, what: string) {
  // let entry animations finish (reduced motion makes most of them instant)
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const violations = r.violations
    .map((v) => ({
      ...v,
      nodes: v.id === 'color-contrast' ? v.nodes.filter((n) => !USER_COLOURS.some((s) => n.html.includes(s.slice(1)))) : v.nodes,
    }))
    .filter((v) => v.nodes.length)
  const report = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => '    ' + n.target.join(' ') + '  ' + (n.failureSummary ?? '').split('\n').slice(1).join(' ')).join('\n')}`)
  expect.soft(report, `${what}:\n${report.join('\n')}`).toEqual([])
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test('tasks: list, detail, menus, date picker and quick add', async ({ page }) => {
      await open(page, theme, { view: 'list:L-work' })
      await audit(page, 'task list')
      const row = page.locator('.task-row[data-task-id="o1"]')
      const b = (await row.boundingBox())!
      await page.mouse.click(b.x + b.width - 12, b.y + b.height / 2)
      await expect(page.locator('.detail-title')).toBeVisible()
      await audit(page, 'task detail')
      await row.click({ button: 'right', position: { x: b.width - 12, y: b.height / 2 } })
      await expect(page.locator('.ctx-menu, [role="menu"]').first()).toBeVisible()
      await audit(page, 'task context menu')
      await page.keyboard.press('Escape')
      await page.locator('.list-head-btn').last().click()
      await expect(page.locator('.popover')).toBeVisible()
      await audit(page, 'list menu')
      await page.keyboard.press('Escape')
      await page.locator('.detail [data-date-btn], .detail-date, .detail .dp-trigger').first().click()
      await expect(page.locator('.popover')).toBeVisible()
      await audit(page, 'date picker')
      await page.keyboard.press('Escape')
      await page.locator('.quick-add-input').click()
      await page.keyboard.type('Call mom tomorrow #deep')
      await audit(page, 'quick add')
    })

    test('smart lists, filters, completed and trash', async ({ page }) => {
      await open(page, theme)
      await audit(page, 'today')
      for (const v of ['week', 'filter:f1', 'completed', 'trash']) {
        await page.locator(`.side-item[data-dnd-view="${v}"], .side-item:has-text("${v === 'filter:f1' ? 'Urgent' : v}")`).first().click()
        await audit(page, v)
      }
    })

    test('calendar, matrix, focus, habits, statistics and search', async ({ page }) => {
      await open(page, theme)
      const rail = page.locator('.rail-btn')
      await rail.nth(1).click()
      await expect(page.locator('.cal-month')).toBeVisible()
      await audit(page, 'calendar month')
      for (const mode of ['week', 'day', 'agenda']) {
        await page.locator('.cal-view-btn, [data-cal-mode]').first().click().catch(() => {})
        await page.locator(`[data-mode="${mode}"], .menu-item:has-text("${mode[0].toUpperCase() + mode.slice(1)}")`).first().click().catch(() => {})
        await audit(page, 'calendar ' + mode)
      }
      await rail.nth(2).click()
      await audit(page, 'matrix')
      await rail.nth(3).click()
      await audit(page, 'focus')
      await rail.nth(4).click()
      await audit(page, 'habits')
      await rail.nth(5).click()
      await audit(page, 'statistics')
      await rail.nth(6).click()
      await page.keyboard.type('task')
      await audit(page, 'search')
    })

    test('dialogs', async ({ page }) => {
      await open(page, theme)
      await page.locator('.rail-btn[title="Settings"]').click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await audit(page, 'settings')
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await page.keyboard.press('?')
      await expect(page.getByRole('dialog')).toBeVisible()
      await audit(page, 'shortcuts')
      await page.keyboard.press('Escape')
      await page.locator('.side-item', { hasText: 'Work' }).click({ button: 'right' })
      await page.locator('.popover .menu-item, [role="menuitem"]', { hasText: 'Edit' }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await audit(page, 'list dialog')
      await page.keyboard.press('Escape')
      await page.locator('.side-item', { hasText: 'Urgent' }).click({ button: 'right' })
      await page.locator('.popover .menu-item, [role="menuitem"]', { hasText: 'Edit' }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await audit(page, 'filter dialog')
      await page.keyboard.press('Escape')
      await page.locator('.side-item', { hasText: '#deep' }).or(page.locator('.side-item', { hasText: 'deep' })).first().click({ button: 'right' })
      await page.locator('.popover .menu-item, [role="menuitem"]', { hasText: 'Edit' }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await audit(page, 'tag dialog')
      await page.keyboard.press('Escape')
      await page.locator('.rail-btn').nth(4).click()
      await page.locator('button[title="Add habit"]').first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await audit(page, 'habit dialog')
    })
  })
}

test.describe('phone', () => {
  const { defaultBrowserType: _, ...pixel } = devices['Pixel 7']
  test.use(pixel)
  for (const theme of ['light', 'dark'] as const)
    test(`${theme}: list, drawer, sheet and tab bar`, async ({ page }) => {
      await open(page, theme, { view: 'list:L-work' })
      await audit(page, 'phone list')
      await page.locator('.list-head-btn').first().click()
      await expect(page.locator('.drawer')).toBeVisible()
      await audit(page, 'drawer')
      await page.keyboard.press('Escape')
      await page.locator('.list-head-btn').last().click()
      await audit(page, 'menu sheet')
    })
})

// ---------------- the keyboard ----------------
test.describe('keyboard', () => {
  test('the skip link jumps to the content', async ({ page }) => {
    await open(page, 'light', { view: 'list:L-work' })
    await page.keyboard.press('Tab')
    const skip = page.locator('.skip-link')
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect(page.locator('.list-pane .task-row').first()).toBeFocused()
  })

  test('a dialog keeps Tab inside, closes on Esc and gives focus back', async ({ page }) => {
    await open(page, 'light')
    const opener = page.locator('.rail-btn[aria-label="Settings"]')
    await opener.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await expect(dialog).toBeVisible()
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Shift+Tab')
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
  })

  test('menus work with the arrow keys and give focus back', async ({ page }) => {
    await open(page, 'light', { view: 'list:L-work' })
    const more = page.locator('.list-head-btn[title="More"]')
    await more.focus()
    await page.keyboard.press('Enter')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    const focused = () => page.evaluate(() => document.activeElement?.getAttribute('role'))
    expect(await focused()).toMatch(/^menuitem/)
    const name = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent)
    const first = await name()
    await page.keyboard.press('ArrowDown')
    expect(await name()).not.toBe(first)
    await page.keyboard.press('End')
    await page.keyboard.press('Home')
    expect(await name()).toBe(first)
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(more).toBeFocused()
  })

  test('sidebar entries open with the keyboard', async ({ page }) => {
    await open(page, 'light')
    const entry = page.locator('.side-item', { hasText: 'Personal' })
    await entry.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.list-head h1')).toHaveText('Personal')
    await expect(entry).toHaveAttribute('aria-current', 'page')
  })

  test('a task moves up and down from the keyboard and from its menu, announced in the live region', async ({ page }) => {
    await open(page, 'light', { view: 'list:L-work', prefs: { 'list:L-work': { groupBy: 'none', sortBy: 'custom' } } })
    const ids = () => page.locator('.list-pane .task-row').evaluateAll((els) => els.map((el) => el.getAttribute('data-task-id')))
    const before = await ids()
    const second = page.locator(`.list-pane .task-row[data-task-id="${before[1]}"]`)
    const b = (await second.boundingBox())!
    await page.mouse.click(b.x + b.width - 12, b.y + b.height / 2)
    await page.keyboard.press('Alt+ArrowUp')
    expect((await ids()).slice(0, 2)).toEqual([before[1], before[0]])
    await expect(page.locator('.toast-region[role="status"]')).toContainText('Moved up')
    // the menu offers the same moves (the menu key, or Shift+F10)
    await second.focus()
    await page.keyboard.press('Shift+F10')
    await page.getByRole('menuitem', { name: 'Move down' }).click()
    expect((await ids()).slice(0, 2)).toEqual([before[0], before[1]])
    await expect(page.locator('.toast-region[role="status"]')).toContainText('Moved down')
  })

  test('the task checkbox is a named checkbox', async ({ page }) => {
    await open(page, 'light', { view: 'list:L-work' })
    const box = page.getByRole('checkbox', { name: 'Prepare slides' })
    await expect(box).toHaveAttribute('aria-checked', 'false')
  })
})

test('forced colours keep the selection and focus visible, and pass the audit', async ({ page }) => {
  await open(page, 'light', { view: 'list:L-work' })
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
  const row = page.locator('.task-row[data-task-id="o1"]')
  const b = (await row.boundingBox())!
  await page.mouse.click(b.x + b.width - 12, b.y + b.height / 2)
  expect(await row.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
  await audit(page, 'forced colours')
})
