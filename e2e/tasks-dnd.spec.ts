import { expect, test, type Locator, type Page } from '@playwright/test'

// Drag and drop in the task list, the kanban board and the sidebar, each with a mouse and with touch (long press),
// checked against the saved data. The app runs in English on its own data, so the tests don't depend on the seed tasks.

type Pt = { x: number; y: number }
type Saved = {
  tasks: { id: string; order: number; parentId?: string; listId: string; sectionId?: string }[]
  lists: { id: string; order: number; folderId?: string }[]
}

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
  lists: [
    { id: 'work', name: 'Work', color: '#4CA1FF', view: 'kanban', order: 1, sections: [{ id: 'todo', name: 'To do' }, { id: 'doing', name: 'Doing' }] },
    { id: 'life', name: 'Life', color: '#35D870', view: 'list', order: 2, sections: [] },
    { id: 'study', name: 'Study', color: '#B37FEB', view: 'list', order: 3, sections: [], folderId: 'grow' },
  ],
  folders: [{ id: 'grow', name: 'Growth', order: 1 }],
  tags: [],
  habits: [],
  focus: [],
  settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
  tasks: [
    task('a', 'Alpha', 0),
    task('b', 'Bravo', 1),
    task('c', 'Charlie', 2),
    task('w1', 'Write the report', 3, { listId: 'work', sectionId: 'todo' }),
    task('w2', 'Review the code', 4, { listId: 'work', sectionId: 'doing' }),
  ],
}

async function open(page: Page, view: string, ui: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([data, state]) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('tickdone-locale', 'en')
      localStorage.setItem('tickdone:data:v1', JSON.stringify(data))
      localStorage.setItem('tickdone:ui:v1', JSON.stringify(state))
    },
    [DATA, { module: 'tasks', view, prefs: {}, collapsed: {}, sidebarHidden: false, ...ui }] as const,
  )
  await page.goto('/')
  await expect(page.locator('.list-pane')).toBeVisible()
}

const saved = async (page: Page): Promise<Saved> => {
  await page.waitForTimeout(400) // saves are debounced
  return page.evaluate(() => JSON.parse(localStorage.getItem('tickdone:data:v1') || 'null'))
}
const taskIn = (d: Saved, id: string) => d.tasks.find((x) => x.id === id)!
const listIn = (d: Saved, id: string) => d.lists.find((x) => x.id === id)!

async function center(l: Locator, fx = 0.5, fy = 0.5): Promise<Pt> {
  await l.scrollIntoViewIfNeeded()
  const b = (await l.boundingBox())!
  return { x: b.x + b.width * fx, y: b.y + b.height * fy }
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

/** Touch: long press (350ms) then move, through real touch events. */
async function touchDrag(page: Page, from: Pt, to: Pt) {
  const cdp = await page.context().newCDPSession(page)
  const point = (x: number, y: number) => [{ x: Math.round(x), y: Math.round(y), radiusX: 2, radiusY: 2, force: 1, id: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) })
  await page.waitForTimeout(450)
  for (let i = 1; i <= 12; i++) {
    const k = i / 12
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k) })
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(80)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

const row = (page: Page, id: string) => page.locator(`.task-row[data-task-id="${id}"]`)
const sideList = (page: Page, id: string) => page.locator(`.sidebar [data-side-list="${id}"]`)
const toast = (page: Page) => page.locator('.toast')

for (const input of ['mouse', 'touch'] as const) {
  test.describe(`${input} drag`, () => {
    test.use({ hasTouch: input === 'touch' })
    const drag = input === 'mouse' ? mouseDrag : touchDrag

    test('reorder inside the list', async ({ page }) => {
      await open(page, 'inbox')
      const from = await center(row(page, 'b'), 0.8)
      const to = await center(row(page, 'a'), 0.8, 0.15)
      await drag(page, from, to)
      await expect(toast(page)).toContainText('Order updated')
      const d = await saved(page)
      expect(taskIn(d, 'b').order).toBeLessThan(taskIn(d, 'a').order)
    })

    test('drop on a sidebar list moves the task there', async ({ page }) => {
      await open(page, 'inbox')
      await drag(page, await center(row(page, 'a'), 0.8), await center(sideList(page, 'life'), 0.3))
      await expect(toast(page)).toContainText('Moved to “Life”')
      expect(taskIn(await saved(page), 'a').listId).toBe('life')
    })

    test('dragging right nests under the task above', async ({ page }) => {
      await open(page, 'inbox')
      const from = await center(row(page, 'b'), 0.5)
      const a = (await row(page, 'a').boundingBox())!
      await drag(page, from, { x: from.x + 60, y: a.y + a.height + 4 })
      await expect(toast(page)).toContainText('Now a subtask of “Alpha”')
      expect(taskIn(await saved(page), 'b').parentId).toBe('a')
      await expect(row(page, 'b')).toHaveAttribute('data-depth', '1')
    })

    test('kanban: a card moves to another column', async ({ page }) => {
      await open(page, 'list:work', { sidebarHidden: true })
      const from = await center(page.locator('[data-dnd-card="w1"]'), 0.8)
      const to = await center(page.locator('[data-dnd-card="w2"]'), 0.5, 0.9)
      await drag(page, from, to)
      await expect(toast(page)).toContainText('Moved to “Doing”')
      expect(taskIn(await saved(page), 'w1').sectionId).toBe('doing')
    })

    test('sidebar: reorder lists', async ({ page }) => {
      await open(page, 'inbox')
      await drag(page, await center(sideList(page, 'life'), 0.5), await center(sideList(page, 'work'), 0.5, 0.2))
      await expect(toast(page)).toContainText('Lists reordered')
      const d = await saved(page)
      expect(listIn(d, 'life').order).toBeLessThan(listIn(d, 'work').order)
    })

    test('sidebar: a list moves into a folder', async ({ page }) => {
      await open(page, 'inbox')
      await drag(page, await center(sideList(page, 'life'), 0.5), await center(page.locator('.sidebar [data-side-folder="grow"]'), 0.5))
      await expect(toast(page)).toContainText('Moved into “Growth”')
      expect(listIn(await saved(page), 'life').folderId).toBe('grow')
    })

    test('sidebar: a list moves out of its folder', async ({ page }) => {
      await open(page, 'inbox')
      await drag(page, await center(sideList(page, 'study'), 0.5), await center(sideList(page, 'life'), 0.5, 0.85))
      await expect(toast(page)).toContainText('Moved out of the folder')
      expect(listIn(await saved(page), 'study').folderId).toBeUndefined()
    })
  })
}
