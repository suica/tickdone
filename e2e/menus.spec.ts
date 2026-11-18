import { expect, test, type Page } from '@playwright/test'
import { day, fixture, NOW, open, stored, tasks } from './calHelpers'

// The calendar header and month cells, the list and quick-add menus, the matrix page menu and the
// task context menu. The browser runs in zh-CN (playwright.config.ts) unless a test picks another language.

type Data = ReturnType<typeof fixture>

/** Load the task module on a list with the fixture (changed by `edit`) and a fixed clock. */
async function openList(page: Page, view = 'list:L-work', edit: (d: Data) => void = () => {}) {
  const data = fixture()
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
  await expect(page.locator('.task-row').first()).toBeVisible()
}

const row = (page: Page, id: string) => page.locator(`.list-pane .task-row[data-task-id="${id}"]`)
const storedList = (page: Page, id: string) =>
  page.evaluate((id) => JSON.parse(localStorage.getItem('tickdone:data:v1')!).lists.find((l: { id: string }) => l.id === id) as { view: string }, id)

test.describe('calendar', () => {
  test('month cells show the lunar day or solar term, and week numbers when turned on', async ({ page }) => {
    await open(page, 'calendar', 'month')
    await expect(page.locator(`.cal-cell[data-day="${day(0)}"] .cal-lunar`)).toHaveText('初十')
    await expect(page.locator(`.cal-cell[data-day="${day(4)}"] .cal-lunar`)).toHaveText('小雪')
    await expect(page.locator(`.cal-cell[data-day="${day(4)}"] .cal-lunar`)).toHaveClass(/term/)
    await expect(page.locator('.cal-weeknum')).toHaveCount(0)

    // settings: week numbers on, lunar calendar off
    await page.locator('.rail-btn[title="设置"]').click()
    const weekRow = page.locator('.dlg-row', { hasText: '显示周数' })
    await weekRow.getByRole('switch').click()
    await page.locator('.dlg-row', { hasText: '显示农历' }).getByRole('switch').click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.cal-weeknum')).toHaveCount(6)
    await expect(page.locator(`.cal-cell[data-day="${day(-2)}"] .cal-weeknum`)).toHaveText('第47周')
    await expect(page.locator('.cal-lunar')).toHaveCount(0)
  })

  test('no lunar labels in English unless the setting is on', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tickdone-locale', 'en'))
    await open(page, 'calendar', 'month')
    await expect(page.locator('.cal-cell').first()).toBeVisible()
    await expect(page.locator('.cal-lunar')).toHaveCount(0)
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('tickdone:data:v1')!)
      d.settings.showLunar = true
      d.settings.showWeekNumbers = true
      localStorage.setItem('tickdone:data:v1', JSON.stringify(d))
    })
    await page.reload()
    await expect(page.locator(`.cal-cell[data-day="${day(0)}"] .cal-lunar`)).toHaveText('初十')
    await expect(page.locator(`.cal-cell[data-day="${day(-2)}"] .cal-weeknum`)).toHaveText('W47')
  })

  test('the view menu switches views and "+" adds a task on today', async ({ page }) => {
    await open(page, 'calendar', 'month')
    const viewBtn = page.locator('.cal-view-btn')
    await expect(viewBtn).toHaveText('月')
    await viewBtn.click()
    await expect(page.locator('.cal-view-menu .menu-label')).toHaveText(['月', '周', '日', '日程'])
    await page.locator('.cal-view-menu .menu-item', { hasText: '周' }).click()
    await expect(page.locator('.cal-time-day')).toHaveCount(7)
    await expect(viewBtn).toHaveText('周')

    await page.locator('.cal-add').click()
    await expect(page.locator('.cal-add-head')).toContainText('11月18日')
    await page.keyboard.type('Header task')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await tasks(page)).find((t) => t.title === 'Header task')?.dueDate).toBe(day(0))
  })

  test('a busy day shows at most four bars and "+N more" opens that day', async ({ page }) => {
    await page.clock.setFixedTime(NOW)
    const data = fixture()
    for (let i = 0; i < 7; i++) data.tasks.push({ ...data.tasks[0], id: 'busy' + i, title: 'Busy ' + i, dueDate: day(1), dueTime: undefined, order: 100 + i } as never)
    await page.addInitScript((data) => {
      if (sessionStorage.getItem('e2e-seeded')) return
      sessionStorage.setItem('e2e-seeded', '1')
      localStorage.setItem('tickdone:data:v1', JSON.stringify(data))
      localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'calendar', view: 'today', prefs: {}, collapsed: {}, sidebarHidden: false }))
      localStorage.setItem('tickdone:cal:mode', 'month')
    }, data)
    await page.goto('/')
    const cell = page.locator(`.cal-cell[data-day="${day(1)}"]`)
    // as many bars as fit (never more than four), and a "+N more" for the rest
    await expect(cell.locator('.cal-more')).toBeVisible()
    const shown = await cell.locator('[data-task-id]').count()
    expect(shown).toBeGreaterThanOrEqual(1)
    expect(shown).toBeLessThanOrEqual(4)
    await expect(cell.locator('.cal-more')).toHaveText(`还有 ${7 - shown} 项`)
    await cell.locator('.cal-more').click()
    await expect(page.locator('.cal-view-btn')).toHaveText('日')
    await expect(page.locator('.cal-title')).toContainText('11月19日')
    await expect(page.locator('.cal-time-day')).toHaveCount(1)
  })
})

test.describe('phone calendar', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the header fits: title, +, view menu and ‹ Today › on one row', async ({ page }) => {
    await open(page, 'calendar', 'month')
    const title = page.locator('.cal-title')
    await expect(title).toHaveText('2026年11月')
    const fits = await title.evaluate((el) => el.scrollWidth <= el.clientWidth)
    expect(fits).toBe(true)
    for (const sel of ['.cal-add', '.cal-view-btn', '.cal-today']) {
      const b = (await page.locator(sel).boundingBox())!
      expect(b.height).toBeGreaterThanOrEqual(40)
      expect(b.x + b.width).toBeLessThanOrEqual(390)
    }
    await expect(page.locator(`.cal-cell[data-day="${day(4)}"] .cal-lunar`)).toHaveText('小雪')
  })
})

test.describe('list menu', () => {
  test('the View row switches between list and Kanban', async ({ page }) => {
    await openList(page)
    await page.locator('.list-head .list-head-btn').last().click()
    const kanbanBtn = page.locator('.list-view-row button[data-view="kanban"]')
    await expect(page.locator('.list-view-row button[data-view="list"]')).toHaveAttribute('aria-checked', 'true')
    await kanbanBtn.click()
    await expect(kanbanBtn).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('.kanban')).toBeVisible()
    await expect.poll(async () => (await storedList(page, 'L-work')).view).toBe('kanban')
    await page.locator('.list-view-row button[data-view="list"]').click()
    await expect(page.locator('.kanban')).toHaveCount(0)
    await expect.poll(async () => (await storedList(page, 'L-work')).view).toBe('list')
  })

  test('"Show details" previews the notes under the title', async ({ page }) => {
    await openList(page, 'list:L-work', (d) => {
      ;(d.tasks.find((t) => t.id === 'review') as { content: string }).content = 'Bring the\nmockups'
    })
    await expect(page.locator('.task-notes')).toHaveCount(0)
    await page.locator('.list-head .list-head-btn').last().click()
    await expect(page.locator('.popover .menu-label')).toContainText(['分组', '排序', '显示已完成', '显示详情', '添加分组', '编辑清单'])
    await page.locator('.popover .menu-item', { hasText: '显示详情' }).click()
    await expect(row(page, 'review').locator('.task-notes')).toHaveText('Bring the mockups')
  })
})

test.describe('quick add menu', () => {
  test('inserts priority, list and tag tokens that the parser then reads', async ({ page }) => {
    await openList(page, 'inbox')
    const input = page.locator('.list-add .quick-add-input')
    await input.click()
    await input.fill('Plan launch')
    const more = page.locator('.list-add .qa-more')
    await more.click()
    await page.locator('.qa-prio-row button[data-priority="5"]').click()
    await expect(input).toHaveValue('Plan launch !高 ')
    await expect(input).toBeFocused()

    await more.click()
    await page.locator('.qa-more-pop .menu-item', { hasText: '清单' }).click()
    await page.locator('.popover .menu-item', { hasText: '生活' }).click()
    await expect(input).toHaveValue('Plan launch !高 ~生活 ')

    await more.click()
    await page.locator('.qa-more-pop .menu-item', { hasText: '标签' }).click()
    await page.locator('.popover .menu-item', { hasText: 'focus' }).click()
    await expect(input).toHaveValue('Plan launch !高 ~生活 #focus ')
    await expect(page.locator('.list-add .qa-mirror .qa-hl')).toHaveText(['!高', '~生活', '#focus'])

    await input.press('Enter')
    await expect.poll(async () => (await tasks(page)).find((t) => t.title === 'Plan launch')).toMatchObject({ priority: 5, listId: 'L-life', tags: ['focus'] })
  })
})

test.describe('matrix menu', () => {
  test('shows completed tasks and explains the matrix', async ({ page }) => {
    await page.clock.setFixedTime(NOW)
    const data = fixture()
    data.tasks.push({ ...data.tasks[0], id: 'done1', title: 'Finished thing', status: 2, completedAt: 1763400000000, priority: 5 } as never)
    await page.addInitScript((data) => {
      if (sessionStorage.getItem('e2e-seeded')) return
      sessionStorage.setItem('e2e-seeded', '1')
      localStorage.setItem('tickdone:data:v1', JSON.stringify(data))
      localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'matrix', view: 'today', prefs: {}, collapsed: {}, sidebarHidden: false }))
    }, data)
    await page.goto('/')
    const item = page.locator('.matrix-item[data-id="done1"]')
    await expect(page.locator('.matrix-item').first()).toBeVisible()
    await expect(item).toHaveCount(0)
    await page.locator('.matrix-page-more').click()
    await page.locator('.popover .menu-item', { hasText: '显示已完成' }).click()
    await expect(item).toBeVisible()
    await page.locator('.matrix-page-more').click()
    await page.locator('.popover .menu-item', { hasText: '使用说明' }).click()
    await expect(page.locator('.matrix-help li')).toHaveCount(3)
    await page.keyboard.press('Escape')
    await expect(page.locator('.matrix-help')).toHaveCount(0)
  })
})

test.describe('task context menu', () => {
  test('"Add subtask" adds a checklist row and starts editing it', async ({ page }) => {
    await openList(page)
    await row(page, 'review').click({ button: 'right', position: { x: 200, y: 12 } })
    await page.locator('.ctx .menu-item', { hasText: '添加子任务' }).click()
    const sub = page.locator('.detail [data-sub-id] input')
    await expect(sub).toHaveCount(1)
    await expect(sub).toBeFocused()
    await page.keyboard.type('Collect feedback')
    await expect.poll(async () => ((await stored(page, 'review')) as unknown as { subtasks: { title: string }[] }).subtasks.map((s) => s.title)).toEqual(['Collect feedback'])
  })

  test('"Copy link" copies an address that opens the task', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openList(page, 'today')
    await row(page, 'walk').click({ button: 'right', position: { x: 200, y: 12 } })
    await page.locator('.ctx .menu-item', { hasText: '复制链接' }).click()
    await expect(page.locator('.toast')).toContainText('链接已复制')
    const link = await page.evaluate(() => navigator.clipboard.readText())
    expect(link).toMatch(/#task=walk$/)

    // somewhere else in the app, then follow the link
    await page.locator('.rail-btn').nth(2).click()
    await expect(page.locator('.matrix-module')).toBeVisible()
    await page.goto(link)
    await expect(page.locator('.list-head h1')).toHaveText('生活')
    await expect(row(page, 'walk')).toHaveClass(/selected/)
    await expect(page.locator('.detail .detail-title')).toHaveValue('Walk')
    expect(new URL(page.url()).hash).toBe('')
  })

  test('a link to a task that is gone says so', async ({ page }) => {
    await openList(page)
    await page.evaluate(() => (location.hash = '#task=nope'))
    await expect(page.locator('.toast')).toContainText('该任务已不存在')
  })
})
