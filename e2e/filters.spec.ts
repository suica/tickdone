import { expect, test, type Page } from '@playwright/test'
import { fixture, mouseDrag, NOW } from './calHelpers'

// Saved filters: create one from the sidebar and check the tasks it shows, edit it, delete it with
// undo, reorder by drag, and find it in the phone drawer. The browser runs in zh-CN (playwright.config.ts).

type Data = ReturnType<typeof fixture> & { filters?: unknown[] }

async function openApp(page: Page, edit: (d: Data) => void = () => {}, view = 'today') {
  const data: Data = fixture()
  data.tags = [{ name: 'focus' }] as never
  edit(data)
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(
    ([data, view]) => {
      if (sessionStorage.getItem('e2e-seeded')) return
      sessionStorage.setItem('e2e-seeded', '1')
      localStorage.setItem('tickdone:data:v1', JSON.stringify(data))
      localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'tasks', view, prefs: {}, collapsed: {}, sidebarHidden: false }))
    },
    [data, view] as const,
  )
  await page.goto('/')
  await expect(page.locator('.list-pane h1')).toBeVisible()
}

/** The ids of the task rows in the list, in order. */
const rowIds = (page: Page) => page.locator('.list-pane .task-row[data-task-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.taskId))
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('tickdone:data:v1')!) as Data & { tasks: { title: string; listId: string; priority: number }[] })
const chip = (page: Page, group: string, text: string) => page.locator(`.dlg [data-filter-${group}] .dlg-chip`, { hasText: text })
const sideFilters = (page: Page) => page.locator('.sidebar [data-side-filter] .side-name')

const SAVED = { id: 'F1', name: 'Urgent', order: 1, match: 'all', priorities: [5] }

test('create a filter from the sidebar; it shows the matching tasks and quick add fills in its conditions', async ({ page }) => {
  await openApp(page)
  await expect(page.locator('.sidebar .side-section', { hasText: '过滤器' })).toBeVisible()
  await page.getByRole('button', { name: '添加过滤器' }).click()

  const dlg = page.locator('.dlg-filter')
  await expect(dlg).toBeVisible()
  await dlg.getByPlaceholder('过滤器名称').fill('Work, high')
  await chip(page, 'lists', '工作').click()
  await chip(page, 'priority', '高').click()
  await expect(chip(page, 'lists', '工作')).toHaveAttribute('aria-pressed', 'true')
  // the live count: Design review and Answer mail are high-priority work tasks
  await expect(dlg.locator('[data-filter-preview]')).toContainText('2')
  await dlg.locator('[data-icon="flag"]').click()
  await dlg.locator('.dlg-color').nth(1).click()
  await dlg.getByRole('button', { name: '添加', exact: true }).click()
  await expect(dlg).toHaveCount(0)

  // the new filter is open, in the sidebar with its count
  await expect(page.locator('.list-pane h1')).toHaveText('Work, high')
  const item = page.locator('.sidebar [data-side-filter]', { hasText: 'Work, high' })
  await expect(item).toHaveClass(/active/)
  await expect(item.locator('.side-count')).toHaveText('2')
  await expect.poll(() => rowIds(page)).toEqual(['review', 'mail'])

  // grouping and sorting work as in other lists
  await page.locator('.list-head .icon-btn[title="更多"]').click()
  await page.locator('.popover').getByText('分组').click()
  await page.locator('.popover').getByText('优先级', { exact: true }).last().click()
  await expect(page.locator('.list-pane .group-head').first()).toContainText('高优先级')

  // a task added here gets the list and the priority, so it shows up in the filter
  const input = page.locator('.quick-add-input')
  await input.click()
  await input.fill('Ship the release')
  await input.press('Enter')
  await expect.poll(async () => (await rowIds(page)).length).toBe(3)
  await expect.poll(async () => (await stored(page)).tasks.find((x) => x.title === 'Ship the release')).toMatchObject({ listId: 'L-work', priority: 5 })

  // saved with the data
  const f = (await stored(page)).filters as { name: string; lists: string[]; priorities: number[]; icon: string; color: string }[]
  expect(f).toHaveLength(1)
  expect(f[0]).toMatchObject({ name: 'Work, high', lists: ['L-work'], priorities: [5], icon: 'flag' })
  expect(f[0].color).toBeTruthy()
})

test('edit a filter: rename it, change its conditions and the tasks it shows', async ({ page }) => {
  await openApp(page, (d) => (d.filters = [SAVED]), 'filter:F1')
  // grouped by date: overdue, today, no date
  await expect.poll(() => rowIds(page)).toEqual(['fees', 'review', 'mail'])

  await page.locator('.sidebar [data-side-filter="F1"]').click({ button: 'right' })
  await page.locator('.popover').getByText('编辑', { exact: true }).click()
  const dlg = page.locator('.dlg-filter')
  await dlg.getByPlaceholder('过滤器名称').fill('Urgent today')
  await chip(page, 'dates', '今天').click()
  await chip(page, 'dates', '已过期').click()
  await expect(dlg.locator('[data-filter-preview]')).toContainText('2')
  await dlg.getByRole('button', { name: '保存' }).click()

  await expect(page.locator('.list-pane h1')).toHaveText('Urgent today')
  await expect(sideFilters(page)).toHaveText(['Urgent today'])
  await expect.poll(() => rowIds(page)).toEqual(['fees', 'review'])

  // "any condition": high priority or due today
  await page.locator('.list-head .icon-btn[title="更多"]').click()
  await page.locator('.popover').getByText('编辑过滤器').click()
  await page.locator('.dlg [data-filter-match] button').nth(1).click()
  await page.locator('.dlg').getByRole('button', { name: '保存' }).click()
  await expect.poll(async () => (await rowIds(page)).sort()).toEqual(['fees', 'gym', 'mail', 'review', 'walk'])

  // a keyword narrows it down again
  await page.locator('.list-head .icon-btn[title="更多"]').click()
  await page.locator('.popover').getByText('编辑过滤器').click()
  await page.locator('.dlg [data-filter-match] button').first().click()
  await page.locator('.dlg [data-filter-keyword]').fill('REVIEW')
  await page.locator('.dlg').getByRole('button', { name: '保存' }).click()
  await expect.poll(() => rowIds(page)).toEqual(['review'])
})

test('delete a filter, then undo from the toast', async ({ page }) => {
  await openApp(page, (d) => (d.filters = [SAVED]), 'filter:F1')
  await page.locator('.sidebar [data-side-filter="F1"]').click({ button: 'right' })
  await page.locator('.popover').getByText('删除', { exact: true }).click()
  await expect(sideFilters(page)).toHaveCount(0)
  await expect(page.locator('.sidebar .side-hint', { hasText: '过滤器' })).toBeVisible()
  await expect(page.locator('.list-pane h1')).toHaveText('今天')

  const toast = page.locator('.toast')
  await expect(toast).toContainText('过滤器已删除')
  await toast.getByRole('button', { name: '撤销' }).click()
  await expect(sideFilters(page)).toHaveText(['Urgent'])
  await expect(page.locator('.list-pane h1')).toHaveText('Urgent')

  // deleting from the editor works too
  await page.locator('.list-head .icon-btn[title="更多"]').click()
  await page.locator('.popover').getByText('编辑过滤器').click()
  await page.locator('.dlg').getByRole('button', { name: '删除过滤器' }).click()
  await expect(sideFilters(page)).toHaveCount(0)
  await expect.poll(async () => (await stored(page)).filters).toEqual([])
})

test('drag a filter to reorder the filters; undo puts it back', async ({ page }) => {
  await openApp(page, (d) => {
    d.filters = [SAVED, { id: 'F2', name: 'Inbox only', order: 2, match: 'all', lists: ['inbox'] }, { id: 'F3', name: 'No date', order: 3, match: 'all', dates: ['noDate'] }]
  })
  await expect(sideFilters(page)).toHaveText(['Urgent', 'Inbox only', 'No date'])
  const from = await page.locator('[data-side-filter="F3"]').boundingBox()
  const to = await page.locator('[data-side-filter="F1"]').boundingBox()
  await mouseDrag(page, { x: from!.x + 40, y: from!.y + from!.height / 2 }, { x: to!.x + 40, y: to!.y + 4 })
  await expect(sideFilters(page)).toHaveText(['No date', 'Urgent', 'Inbox only'])
  await expect(page.locator('.toast')).toContainText('已调整过滤器顺序')
  await page.locator('.toast').getByRole('button', { name: '撤销' }).click()
  await expect(sideFilters(page)).toHaveText(['Urgent', 'Inbox only', 'No date'])
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('filters are in the drawer and open in the list', async ({ page }) => {
    await openApp(page, (d) => (d.filters = [SAVED]))
    await page.getByRole('button', { name: '打开侧栏' }).click()
    const drawer = page.locator('.drawer')
    await expect(drawer.locator('[data-side-filter="F1"]')).toBeVisible()
    await drawer.locator('[data-side-filter="F1"]').click()
    await expect(page.locator('.drawer-layer')).not.toHaveClass(/open/)
    await expect(page.locator('.list-pane h1')).toHaveText('Urgent')
    await expect.poll(async () => (await rowIds(page)).sort()).toEqual(['fees', 'mail', 'review'])
    // the editor fits the screen
    await page.getByRole('button', { name: '打开侧栏' }).click()
    await drawer.getByRole('button', { name: '添加过滤器' }).click()
    await expect(page.locator('.dlg-filter')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
