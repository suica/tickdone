import { devices, expect, test, type Page } from '@playwright/test'

// Archived lists: archive and unarchive from the list menu with undo, the collapsed "Archived lists"
// section, the read-only list with its banner, and archived tasks staying out of smart lists, the
// calendar, the matrix and search (unless asked for).

const KEY = 'tickdone:data:v1'
// 2026-11-18 10:00 in Asia/Shanghai (the e2e time zone)
const NOW = new Date('2026-11-18T10:00:00+08:00')
const created = NOW.getTime() - 86_400_000
const task = (p: Record<string, unknown>) => ({ content: '', tags: [], priority: 0, status: 0, createdAt: created, modifiedAt: created, order: 1, subtasks: [], ...p })
const DATA = {
  version: 1,
  lists: [
    { id: 'work', name: 'Work', color: '#4CA1FF', sections: [], view: 'list', order: 1 },
    { id: 'trip', name: 'Lisbon trip', color: '#FFAC38', sections: [], view: 'list', order: 2 },
  ],
  folders: [],
  tags: [],
  habits: [],
  focus: [],
  settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
  tasks: [
    task({ id: 'w1', title: 'Quarterly report', listId: 'work', dueDate: '2026-11-18', priority: 5 }),
    task({ id: 't1', title: 'Book the hotel', listId: 'trip', dueDate: '2026-11-18', priority: 5 }),
    task({ id: 't2', title: 'Pack the camera', listId: 'trip' }),
  ],
}

async function open(page: Page, view = 'today', module = 'tasks') {
  await page.clock.install({ time: NOW })
  await page.addInitScript(
    ([key, json, view, module]) => {
      if (localStorage.getItem(key)) return
      localStorage.setItem('tickdone-locale', 'en')
      localStorage.setItem(key, json)
      localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module, view }))
    },
    [KEY, JSON.stringify(DATA), view, module] as const,
  )
  await page.goto('/')
}

const side = (page: Page) => page.locator('.sidebar')
const listItem = (page: Page, name: string) => side(page).locator('.side-item', { hasText: name })
const row = (page: Page, id: string) => page.locator(`.task-row[data-task-id="${id}"]`)
const stored = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY)
const rail = (page: Page, name: string) => page.locator(`.rail-btn[title="${name}"]`)

async function archive(page: Page, name: string) {
  await listItem(page, name).click({ button: 'right' })
  await page.locator('.menu-item', { hasText: /^Archive$/ }).click()
}

test('archive from the list menu: it moves to a collapsed "Archived lists" section and its tasks leave Today; undo puts it back', async ({ page }) => {
  await open(page)
  await expect(row(page, 't1')).toBeVisible()
  await expect(side(page).locator('.side-item[data-dnd-view="today"] .side-count')).toHaveText('2')

  await archive(page, 'Lisbon trip')
  await expect(page.locator('.toast')).toContainText('Archived “Lisbon trip”')
  await expect(row(page, 't1')).toHaveCount(0)
  await expect(row(page, 'w1')).toBeVisible()
  await expect(side(page).locator('.side-item[data-dnd-view="today"] .side-count')).toHaveText('1')
  // gone from Lists, listed (collapsed) under Archived lists at the bottom
  await expect(side(page).locator('[data-side-lists] .side-item', { hasText: 'Lisbon trip' })).toHaveCount(0)
  const section = side(page).locator('[data-side-archived]')
  await expect(section.locator('.side-section')).toHaveText('Archived lists')
  await expect(section.locator('.side-section')).toHaveClass(/is-collapsed/)
  await expect.poll(async () => (await stored(page)).lists.find((l: { id: string }) => l.id === 'trip').archived).toBe(true)

  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect(row(page, 't1')).toBeVisible()
  await expect(section).toHaveCount(0)
  await expect(side(page).locator('[data-side-lists] .side-item', { hasText: 'Lisbon trip' })).toBeVisible()
})

test('an archived list opens read-only with a banner, and Unarchive brings it back', async ({ page }) => {
  await open(page)
  await archive(page, 'Lisbon trip')
  await side(page).locator('[data-side-archived] .side-section').click()
  await side(page).locator('[data-side-archived] .side-item', { hasText: 'Lisbon trip' }).click()

  await expect(page.locator('.list-head h1')).toHaveText('Lisbon trip')
  const banner = page.locator('.archived-banner')
  await expect(banner).toContainText('This list is archived')
  await expect(row(page, 't1')).toBeVisible()
  await expect(page.locator('.list-pane .quick-add-input')).toHaveCount(0)
  // the checkbox does nothing, the title cannot be edited and the detail is read-only
  await row(page, 't1').locator('.cb').click()
  await expect(row(page, 't1').locator('input.task-title')).toHaveAttribute('readonly', '')
  await row(page, 't1').locator('.task-main').click()
  await expect(page.locator('.detail-date')).toBeDisabled()
  expect((await stored(page)).tasks.find((t: { id: string }) => t.id === 't1').status).toBe(0)
  // the task menu only offers to copy a link or unarchive
  await row(page, 't1').click({ button: 'right' })
  await expect(page.locator('.ctx .menu-item')).toHaveText(['Copy link', 'Unarchive'])
  await page.keyboard.press('Escape')

  await banner.getByRole('button', { name: 'Unarchive' }).click()
  await expect(page.locator('.toast')).toContainText('“Lisbon trip” is back in your lists')
  await expect(banner).toHaveCount(0)
  await expect(page.locator('.list-pane .quick-add-input')).toBeVisible()
  await expect(side(page).locator('[data-side-archived]')).toHaveCount(0)
})

test('archived tasks stay out of the calendar and the matrix', async ({ page }) => {
  await open(page)
  await archive(page, 'Lisbon trip')
  await rail(page, 'Calendar').click()
  await expect(page.locator('[data-task-id="w1"]').first()).toBeVisible()
  await expect(page.locator('[data-task-id="t1"]')).toHaveCount(0)
  await rail(page, 'Matrix').click()
  await expect(page.locator('.matrix-item[data-id="w1"]')).toBeVisible()
  await expect(page.locator('.matrix-item[data-id="t1"]')).toHaveCount(0)
})

test('search leaves archived lists out unless "Include archived lists" is ticked', async ({ page }) => {
  await open(page)
  await archive(page, 'Lisbon trip')
  await rail(page, 'Search').click()
  await page.locator('.search-input').fill('the')
  await expect(page.locator('.search-hit')).toHaveCount(0)
  await page.getByLabel('Include archived lists').check()
  await expect(page.locator('.search-hit')).toHaveCount(2)
  await expect(page.locator('.search-group-head', { hasText: 'Lisbon trip' }).locator('.search-archived-badge')).toHaveText('Archived')
})

test('archived lists are not offered as places to move a task', async ({ page }) => {
  await open(page)
  await archive(page, 'Lisbon trip')
  await row(page, 'w1').click({ button: 'right' })
  await page.locator('.menu-item', { hasText: 'Move to' }).hover()
  await expect(page.locator('.menu-item', { hasText: 'Work' }).first()).toBeVisible()
  await expect(page.locator('.menu-item', { hasText: 'Lisbon trip' })).toHaveCount(0)
})

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7']
test.describe('phone', () => {
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })

  test('the drawer lists archived lists at the bottom and opens them read-only', async ({ page }) => {
    await page.clock.install({ time: NOW })
    const data = { ...DATA, lists: DATA.lists.map((l) => (l.id === 'trip' ? { ...l, archived: true } : l)) }
    await page.addInitScript(
      ([key, json]) => {
        if (localStorage.getItem(key)) return
        localStorage.setItem('tickdone-locale', 'en')
        localStorage.setItem(key, json)
        localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'tasks', view: 'today' }))
      },
      [KEY, JSON.stringify(data)] as const,
    )
    await page.goto('/')
    await page.locator('.list-head-btn').first().tap()
    const section = page.locator('[data-side-archived]')
    await expect(section).toBeVisible()
    await section.locator('.side-section').tap()
    const item = section.locator('.side-item', { hasText: 'Lisbon trip' })
    await expect(item).toBeVisible()
    expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(40)
    await item.tap()
    const banner = page.locator('.archived-banner')
    await expect(banner).toBeVisible()
    const vw = page.viewportSize()!.width
    const box = (await banner.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(vw)
    expect((await banner.getByRole('button', { name: 'Unarchive' }).boundingBox())!.height).toBeGreaterThanOrEqual(40)
    // nothing to add in a read-only list
    await expect(page.locator('.qa-fab, .phone-add')).toHaveCount(0)
  })
})
