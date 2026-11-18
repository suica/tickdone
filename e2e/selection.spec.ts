import { devices, expect, test, type Locator, type Page } from '@playwright/test'

// Multi-select, batch edits and keyboard navigation in the task list, checked against the saved data.
// The app runs in English on its own data.

type Pt = { x: number; y: number }
type Saved = { tasks: { id: string; order: number; listId: string; priority: number; status: number; deleted?: boolean; dueDate?: string }[] }

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
  settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
  tasks: [task('a', 'Alpha', 0), task('b', 'Bravo', 1), task('c', 'Charlie', 2), task('d', 'Delta', 3), task('e', 'Echo', 4)],
}

async function open(page: Page, view = 'inbox') {
  await page.addInitScript(
    ([data, state]) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('tickdone-locale', 'en')
      localStorage.setItem('tickdone:data:v1', JSON.stringify(data))
      localStorage.setItem('tickdone:ui:v1', JSON.stringify(state))
    },
    [DATA, { module: 'tasks', view, prefs: { [view]: { groupBy: 'none', sortBy: 'custom' } }, collapsed: {}, sidebarHidden: false }] as const,
  )
  await page.goto('/')
  await expect(page.locator('.task-row').first()).toBeVisible()
  await page.waitForSelector('#launch', { state: 'detached' })
}

const saved = async (page: Page): Promise<Saved> => {
  await page.waitForTimeout(400) // saves are debounced
  return page.evaluate(() => JSON.parse(localStorage.getItem('tickdone:data:v1') || 'null'))
}
const taskIn = (d: Saved, id: string) => d.tasks.find((x) => x.id === id)!
const row = (page: Page, id: string) => page.locator(`.list-pane .task-row[data-task-id="${id}"]`)
const selected = (page: Page) => page.locator('.list-pane .task-row.multi')
const selectedIds = (page: Page) => selected(page).evaluateAll((els) => els.map((el) => el.getAttribute('data-task-id')))
const toast = (page: Page) => page.locator('.toast')
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

/** A point on the row away from the title field (where its date and tags would be). */
async function rowPoint(l: Locator): Promise<Pt> {
  const b = (await l.boundingBox())!
  return { x: b.x + b.width - 12, y: b.y + b.height / 2 }
}
async function clickRow(page: Page, id: string, modifiers: ('Shift' | 'Control' | 'Meta')[] = []) {
  const p = await rowPoint(row(page, id))
  for (const m of modifiers) await page.keyboard.down(m)
  await page.mouse.click(p.x, p.y)
  for (const m of modifiers) await page.keyboard.up(m)
}

/** Mouse: press, move past the 4px threshold, then glide to the target. */
async function mouseDrag(page: Page, from: Pt, to: Pt) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, from.y + 8, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.waitForTimeout(80)
  await page.mouse.up()
}

test.describe('mouse selection', () => {
  test('Ctrl/⌘-click toggles, Shift-click selects a range, Ctrl/⌘+A selects all, Esc clears', async ({ page }) => {
    await open(page)
    await clickRow(page, 'a')
    await expect(page.locator('.detail .detail-title')).toHaveValue('Alpha')
    await clickRow(page, 'c', [MOD])
    expect(await selectedIds(page)).toEqual(['a', 'c'])
    await expect(page.locator('.batch-count')).toHaveText('2 tasks selected')
    // Shift-click: from the last clicked row to this one
    await clickRow(page, 'e', ['Shift'])
    expect(await selectedIds(page)).toEqual(['c', 'd', 'e'])
    // Ctrl/⌘-click on a selected task takes it out
    await clickRow(page, 'd', [MOD])
    expect(await selectedIds(page)).toEqual(['c', 'e'])
    await page.locator('.list-head h1').click()
    await page.keyboard.press(`${MOD}+a`)
    expect(await selectedIds(page)).toEqual(['a', 'b', 'c', 'd', 'e'])
    await expect(page.locator('.batch-count')).toHaveText('5 tasks selected')
    await page.keyboard.press('Escape')
    await expect(selected(page)).toHaveCount(0)
    await expect(page.locator('.batch')).toHaveCount(0)
    // a plain click selects one task again
    await clickRow(page, 'b')
    await expect(page.locator('.detail .detail-title')).toHaveValue('Bravo')
  })

  test('batch priority applies to every selected task and one undo restores them all', async ({ page }) => {
    await open(page)
    await clickRow(page, 'b')
    await clickRow(page, 'd', ['Shift'])
    await expect(page.locator('.batch-count')).toHaveText('3 tasks selected')
    await page.locator('.batch [data-act="priority"] [data-priority="5"]').click()
    await expect(toast(page)).toContainText('Priority: High')
    let d = await saved(page)
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => taskIn(d, id).priority)).toEqual([0, 5, 5, 5, 0])
    await toast(page).getByRole('button', { name: 'Undo' }).click()
    d = await saved(page)
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => taskIn(d, id).priority)).toEqual([0, 0, 0, 0, 0])
    // the selection is still there for the next change
    expect(await selectedIds(page)).toEqual(['b', 'c', 'd'])
  })

  test('batch complete, move and delete each make one undo step', async ({ page }) => {
    await open(page)
    await clickRow(page, 'a')
    await clickRow(page, 'b', [MOD])
    await page.locator('.batch [data-act="list"]').click()
    await page.locator('.popover .menu-item', { hasText: 'Life' }).click()
    await expect(toast(page)).toContainText('Moved to “Life”')
    let d = await saved(page)
    expect([taskIn(d, 'a').listId, taskIn(d, 'b').listId]).toEqual(['life', 'life'])
    await page.keyboard.press(`${MOD}+z`)
    d = await saved(page)
    expect([taskIn(d, 'a').listId, taskIn(d, 'b').listId]).toEqual(['inbox', 'inbox'])

    await clickRow(page, 'c')
    await clickRow(page, 'e', ['Shift'])
    await page.locator('.batch [data-act="delete"]').click()
    await expect(toast(page)).toContainText('Moved 3 tasks to the Trash')
    await expect(row(page, 'd')).toHaveCount(0)
    await toast(page).getByRole('button', { name: 'Undo' }).click()
    await expect(row(page, 'd')).toHaveCount(1)
    d = await saved(page)
    expect(['c', 'd', 'e'].map((id) => !!taskIn(d, id).deleted)).toEqual([false, false, false])
  })

  test('dragging one selected task moves the whole selection, to a sidebar list or within the list', async ({ page }) => {
    await open(page)
    await clickRow(page, 'b')
    await clickRow(page, 'd', [MOD])
    // inside the list: the selection lands as one block below "Echo"
    const e = (await row(page, 'e').boundingBox())!
    await mouseDrag(page, await rowPoint(row(page, 'b')), { x: e.x + e.width - 12, y: e.y + e.height * 0.9 })
    await expect(toast(page)).toContainText('Order updated')
    let d = await saved(page)
    expect([...d.tasks].sort((x, y) => x.order - y.order).map((x) => x.id)).toEqual(['a', 'c', 'e', 'b', 'd'])
    await toast(page).getByRole('button', { name: 'Undo' }).click()
    d = await saved(page)
    expect([...d.tasks].sort((x, y) => x.order - y.order).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e'])

    // on a sidebar list: every selected task moves there
    await clickRow(page, 'b')
    await clickRow(page, 'd', [MOD])
    const side = (await page.locator('.sidebar [data-side-list="life"]').boundingBox())!
    await mouseDrag(page, await rowPoint(row(page, 'd')), { x: side.x + side.width * 0.3, y: side.y + side.height / 2 })
    await expect(toast(page)).toContainText('Moved to “Life”')
    d = await saved(page)
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => taskIn(d, id).listId)).toEqual(['inbox', 'life', 'inbox', 'life', 'inbox'])
    await page.keyboard.press(`${MOD}+z`)
    d = await saved(page)
    expect(['b', 'd'].map((id) => taskIn(d, id).listId)).toEqual(['inbox', 'inbox'])
  })
})

test.describe('keyboard', () => {
  test('arrows move a visible focus ring, Shift extends, Space completes, Delete trashes with undo', async ({ page }) => {
    await open(page)
    await page.locator('.list-head h1').click()
    await page.keyboard.press('ArrowDown')
    await expect(row(page, 'a')).toBeFocused()
    await page.keyboard.press('j')
    await expect(row(page, 'b')).toBeFocused()
    await expect(page.locator('.detail .detail-title')).toHaveValue('Bravo')
    // the ring is drawn on the focused row
    expect(await row(page, 'b').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
    // only the cursor row is in the tab order
    expect(await page.locator('.list-pane .task-row[tabindex="0"]').count()).toBe(1)
    await page.keyboard.press('k')
    await expect(row(page, 'a')).toBeFocused()
    await page.keyboard.press('ArrowDown')

    // Space completes the task under the cursor
    await page.keyboard.press(' ')
    await expect(toast(page)).toContainText('Completed “Bravo”')
    await expect.poll(async () => taskIn(await saved(page), 'b').status).toBe(2)
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(async () => taskIn(await saved(page), 'b').status).toBe(0)

    // 1–4 set the priority; t sets today (the cursor stays on Bravo)
    await page.keyboard.press('1')
    await expect(toast(page)).toContainText('Priority: High')
    await page.keyboard.press('t')
    await expect(toast(page)).toContainText('Date updated')
    const d = await saved(page)
    expect(taskIn(d, 'b').priority).toBe(5)
    expect(taskIn(d, 'b').dueDate).toBeTruthy()

    // Shift+↓ extends the selection; Delete moves both to the Trash and one undo brings them back
    await page.keyboard.press('Shift+ArrowDown')
    await expect(page.locator('.batch-count')).toHaveText('2 tasks selected')
    expect(await selectedIds(page)).toEqual(['b', 'c'])
    await page.keyboard.press('Delete')
    await expect(toast(page)).toContainText('Moved 2 tasks to the Trash')
    await expect(row(page, 'b')).toHaveCount(0)
    await expect(row(page, 'c')).toHaveCount(0)
    await expect(row(page, 'd')).toBeFocused()
    await page.keyboard.press(`${MOD}+z`)
    await expect(row(page, 'b')).toHaveCount(1)
    await expect(row(page, 'c')).toHaveCount(1)
  })

  test('Enter edits the title and Esc goes back to the row; keys typed into fields are text', async ({ page }) => {
    await open(page)
    await page.locator('.list-head h1').click()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    const title = row(page, 'a').locator('input.task-title')
    await expect(title).toBeFocused()
    await page.keyboard.type(' jk1')
    await expect(title).toHaveValue('Alpha jk1')
    await page.keyboard.press('Escape')
    await expect(row(page, 'a')).toBeFocused()
    expect(taskIn(await saved(page), 'a').priority).toBe(0)
    await page.keyboard.press('ArrowDown')
    await expect(row(page, 'b')).toBeFocused()
  })

  test('the shortcuts dialog lists the list keys', async ({ page }) => {
    await open(page)
    await page.locator('.list-head h1').click()
    await page.keyboard.press('?')
    const dlg = page.locator('.dlg-keys')
    for (const label of ['Previous / next task', 'Extend the selection', 'Edit the title', 'Priority: high / medium / low / none', 'Date: tomorrow', 'Select a range', 'Clear the selection'])
      await expect(dlg).toContainText(label)
  })
})

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7']

test.describe('phone selection (Pixel 7 emulation)', () => {
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })

  async function longPress(page: Page, l: Locator) {
    const b = (await l.boundingBox())!
    const cdp = await page.context().newCDPSession(page)
    const pt = [{ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), radiusX: 2, radiusY: 2, force: 1, id: 1 }]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt })
    await page.waitForTimeout(500)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  test('a long press starts selection mode; taps add tasks; the action bar acts on all of them', async ({ page }) => {
    await open(page)
    await longPress(page, row(page, 'b'))
    const bar = page.locator('.batch-bar')
    await expect(bar).toBeVisible()
    await expect(bar.locator('.batch-bar-count')).toHaveText('1 task selected')
    await expect(row(page, 'b').locator('.sel-check.on')).toHaveCount(1)
    // the bar replaces the add button and no detail sheet opens
    await expect(page.locator('.qa-fab')).toHaveCount(0)
    await expect(page.locator('[data-detail-layer]')).toHaveCount(0)
    await row(page, 'd').tap()
    await row(page, 'e').tap()
    await expect(bar.locator('.batch-bar-count')).toHaveText('3 tasks selected')
    await row(page, 'e').tap()
    await expect(bar.locator('.batch-bar-count')).toHaveText('2 tasks selected')
    // touch targets
    for (const b of await bar.locator('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(40)
    // the bar stays inside the screen
    const bb = (await bar.boundingBox())!
    expect(bb.x).toBeGreaterThanOrEqual(0)
    expect(bb.x + bb.width).toBeLessThanOrEqual(viewport.width)

    await bar.locator('[data-act="complete"]').tap()
    await expect(toast(page)).toContainText('Completed 2 tasks')
    const d = await saved(page)
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => taskIn(d, id).status)).toEqual([0, 2, 0, 2, 0])
    await toast(page).getByRole('button', { name: 'Undo' }).tap()
    await expect.poll(async () => taskIn(await saved(page), 'd').status).toBe(0)

    await bar.locator('[data-act="clear"]').tap()
    await expect(bar).toHaveCount(0)
    await expect(page.locator('.sel-check')).toHaveCount(0)
    await expect(page.locator('.qa-fab')).toBeVisible()
  })

  test('"Select tasks" in the list menu turns selection mode on', async ({ page }) => {
    await open(page)
    await page.locator('.list-head-btn[title="More"]').tap()
    await page.locator('.menu-item', { hasText: 'Select tasks' }).tap()
    await expect(page.locator('.batch-bar .batch-bar-count')).toHaveText('0 tasks selected')
    await page.locator('.batch-bar [data-act="all"]').tap()
    await expect(page.locator('.batch-bar .batch-bar-count')).toHaveText('5 tasks selected')
  })
})
