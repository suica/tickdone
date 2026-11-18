import { expect, test, type Page } from '@playwright/test'

// The completion motion: the row stays in place while the tick plays, then moves into the Completed group
// (or slides out when completed tasks are hidden); undo brings it back; reduced motion makes it instant.

const now = Date.now()
const task = (id: string, title: string, order: number, p: Record<string, unknown> = {}) => ({
  id,
  title,
  content: '',
  listId: 'work',
  tags: [],
  priority: 0,
  status: 0,
  createdAt: now,
  modifiedAt: now,
  order,
  subtasks: [],
  ...p,
})

const data = (showCompleted: boolean) => ({
  version: 1,
  lists: [{ id: 'work', name: 'Work', color: '#4C8BD9', view: 'list', order: 0, sections: [] }],
  folders: [],
  tags: [],
  habits: [],
  focus: [],
  settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted },
  tasks: [
    task('a', 'Alpha', 0, { priority: 5 }),
    task('b', 'Bravo', 1),
    task('c', 'Charlie', 2, { priority: 3 }),
    task('d', 'Delta', 3),
    task('z', 'Zulu', 4, { status: 2, completedAt: now - 60_000 }),
  ],
})

async function open(page: Page, showCompleted = true) {
  await page.addInitScript(
    ([d, ui]) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('tickdone-locale', 'en')
      localStorage.setItem('tickdone:data:v1', JSON.stringify(d))
      localStorage.setItem('tickdone:ui:v1', JSON.stringify(ui))
    },
    [data(showCompleted), { module: 'tasks', view: 'list:work', prefs: { 'list:work': { groupBy: 'none', sortBy: 'custom' } }, collapsed: {}, sidebarHidden: false }] as const,
  )
  await page.goto('/')
  await page.waitForSelector('#launch', { state: 'detached' })
  await expect(page.locator('.task-row').first()).toBeVisible()
}

const row = (page: Page, id: string) => page.locator(`.list-pane .task-row[data-task-id="${id}"]`)
const openIds = (page: Page) => page.locator('.list-pane [data-group]:not([data-done]) .task-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-task-id')))
const doneIds = (page: Page) => page.locator('.list-pane [data-group="__done"] .task-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-task-id')))
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

test.describe('completion motion', () => {
  test.use({ locale: 'en-US' })

  test('the row holds while the tick plays, then lands in the Completed group; undo brings it back', async ({ page }) => {
    await open(page)
    await row(page, 'a').locator('.checkbox').click()
    // held in place: ticked in its priority colour, with the burst, title struck through
    await expect(row(page, 'a')).toHaveClass(/is-checking/)
    await expect(row(page, 'a').locator('.checkbox')).toHaveClass(/cb-checking/)
    await expect(row(page, 'a').locator('.cb-burst i')).toHaveCount(6)
    expect(await openIds(page)).toEqual(['a', 'b', 'c', 'd'])
    // then it moves into the Completed group, at the top
    await expect.poll(() => doneIds(page)).toEqual(['a', 'z'])
    expect(await openIds(page)).toEqual(['b', 'c', 'd'])
    await expect(row(page, 'a')).toHaveClass(/\bdone\b/)
    await expect(page.locator('.list-pane .motion-ghost')).toHaveCount(0)

    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
    // the tick comes off where the row is, then it moves back to its place
    await expect(row(page, 'a')).toHaveClass(/is-unchecking/)
    await expect.poll(() => openIds(page)).toEqual(['a', 'b', 'c', 'd'])
    expect(await doneIds(page)).toEqual(['z'])
    await expect(row(page, 'a')).not.toHaveClass(/\bdone\b|is-unchecking/)
  })

  test('unchecking a completed task moves it back up', async ({ page }) => {
    await open(page)
    await row(page, 'z').locator('.checkbox').click()
    await expect(row(page, 'z')).toHaveClass(/is-unchecking/)
    await expect.poll(() => openIds(page)).toEqual(['a', 'b', 'c', 'd', 'z'])
    await expect(page.locator('.list-pane [data-group="__done"]')).toHaveCount(0)
  })

  test('with completed tasks hidden the row slides out and leaves no gap', async ({ page }) => {
    await open(page, false)
    const top = await row(page, 'c').evaluate((el) => el.getBoundingClientRect().top)
    await row(page, 'b').locator('.checkbox').click()
    await expect(row(page, 'b')).toHaveCount(0)
    expect(await openIds(page)).toEqual(['a', 'c', 'd'])
    // the copy that slid out is gone and Charlie took Bravo's place
    await expect(page.locator('.list-pane .motion-ghost')).toHaveCount(0)
    const aBottom = await row(page, 'a').evaluate((el) => el.getBoundingClientRect().bottom)
    await expect.poll(() => row(page, 'c').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(top)
    expect(Math.abs((await row(page, 'c').evaluate((el) => el.getBoundingClientRect().top)) - aBottom)).toBeLessThan(2)

    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(() => openIds(page)).toEqual(['a', 'b', 'c', 'd'])
  })

  test('batch complete ticks every row, moves them together, and one undo restores them', async ({ page }) => {
    await open(page)
    for (const id of ['b', 'd']) {
      const b = (await row(page, id).boundingBox())!
      await page.keyboard.down(MOD)
      await page.mouse.click(b.x + b.width - 12, b.y + b.height / 2)
      await page.keyboard.up(MOD)
    }
    await page.keyboard.press(' ')
    await expect(page.locator('.toast')).toContainText('Completed 2 tasks')
    // a lighter tick: no burst
    await expect(row(page, 'b').locator('.checkbox')).toHaveClass(/cb-checking.*cb-light/)
    await expect(page.locator('.list-pane .cb-burst')).toHaveCount(0)
    await expect.poll(() => doneIds(page)).toEqual(expect.arrayContaining(['b', 'd', 'z']))
    expect(await openIds(page)).toEqual(['a', 'c'])
    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => openIds(page)).toEqual(['a', 'b', 'c', 'd'])
  })

  test('with reduced motion the change is instant: no hold, no burst, no move', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page)
    await row(page, 'a').locator('.checkbox').click()
    // already in its new place right after the click
    const state = await page.evaluate(() => ({
      done: [...document.querySelectorAll('.list-pane [data-group="__done"] .task-row')].map((e) => e.getAttribute('data-task-id')),
      checking: document.querySelectorAll('.list-pane .is-checking, .list-pane .cb-burst, .list-pane .motion-ghost').length,
      // script-driven moves (FLIP, the copy that slides out); CSS animations all have a duration of 0 here
      anims: document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length,
    }))
    expect(state.done).toEqual(['a', 'z'])
    expect(state.checking).toBe(0)
    expect(state.anims).toBe(0)
    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
    expect(await openIds(page)).toEqual(['a', 'b', 'c', 'd'])
  })
})
