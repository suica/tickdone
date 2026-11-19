import { expect, test, type Locator, type Page } from '@playwright/test'

// Every screen at every width (playwright.config.ts runs this file at 360, 390, 412, 768, 1024, 1440, 1920 and 2560 px):
// nothing sticks out of the viewport, and on touch screens every control has a hit area of at least 40 x 40 px.
// The app runs in English on its own sample data.

/** Elements outside the viewport that no scrolling or clipping box inside the viewport holds (closed drawers and sheets are inert or aria-hidden). */
async function offenders(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const out: string[] = []
    if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`)
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[aria-hidden="true"],[inert]')) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.opacity === '0') continue
      if (r.right <= vw + 1 && r.left >= -1) continue
      let p = el.parentElement
      let clipped = false
      while (p && p !== document.body) {
        if (getComputedStyle(p).overflowX !== 'visible') {
          const pr = p.getBoundingClientRect()
          if (pr.right <= vw + 1 && pr.left >= -1) {
            clipped = true
            break
          }
        }
        p = p.parentElement
      }
      if (!clipped) out.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className)} [${Math.round(r.left)}, ${Math.round(r.right)}]`)
    }
    return out.slice(0, 10)
  })
}

/**
 * Controls whose hit area is under 40 x 40 px. A control passes when the points 18 px left, right, above and below its
 * centre all land on it (so a neighbour may share a 1 px border). Only controls that are fully on screen and not covered are checked.
 */
async function smallTargets(page: Page) {
  return page.evaluate(() => {
    const sel =
      'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=checkbox], [role=tab], [role=menuitem], [role=option], [role=switch], [role=radio]'
    const out: string[] = []
    const h = 18
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (el.closest('[aria-hidden="true"],[inert]') || (el as HTMLButtonElement).disabled) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.pointerEvents === 'none') continue
      // the visible box around it: the screen, cut by every scrolling or clipping box it is in
      const box = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ps = getComputedStyle(p)
        if (ps.overflowX === 'visible' && ps.overflowY === 'visible') continue
        const pr = p.getBoundingClientRect()
        box.left = Math.max(box.left, pr.left)
        box.top = Math.max(box.top, pr.top)
        box.right = Math.min(box.right, pr.right)
        box.bottom = Math.min(box.bottom, pr.bottom)
      }
      if (r.top < box.top - 1 || r.bottom > box.bottom + 1 || r.left < box.left - 1 || r.right > box.right + 1) continue // partly scrolled away
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const on = (x: number, y: number) => {
        if (x < box.left || y < box.top || x >= box.right || y >= box.bottom) return true // the edge of the screen or of a scrolling box counts
        const t = document.elementFromPoint(x, y)
        return !!t && (t === el || el.contains(t))
      }
      if (!on(cx, cy)) continue // covered by something else right now
      const miss = (
        [
          ['left', cx - h, cy],
          ['right', cx + h, cy],
          ['top', cx, cy - h],
          ['bottom', cx, cy + h],
        ] as const
      )
        .filter(([, x, y]) => !on(x, y))
        .map(([side, x, y]) => `${side}: ${String((document.elementFromPoint(x, y) as HTMLElement | null)?.className ?? 'nothing').slice(0, 30)}`)
      if (miss.length) {
        const name = el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim().slice(0, 24) || (el as HTMLInputElement).placeholder
        out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')} "${name}" ${Math.round(r.width)}x${Math.round(r.height)} (${miss.join(', ')})`)
      }
    }
    return [...new Set(out)]
  })
}

/** Lets slide-ins and fades finish, so controls are where they will stay. */
async function settle(page: Page) {
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, { timeout: 3000 })
    .catch(() => {})
  await page.waitForTimeout(100)
}

async function check(page: Page) {
  await settle(page)
  expect(await offenders(page), 'sticks out of the viewport').toEqual([])
  if (test.info().project.use.hasTouch) expect(await smallTargets(page), 'touch targets under 40 px').toEqual([])
}

const isTouch = () => !!test.info().project.use.hasTouch
const press = (l: Locator) => (isTouch() ? l.tap() : l.click())

async function open(page: Page, ui: Record<string, unknown> = {}, cal = 'month') {
  await page.addInitScript(
    ([ui, cal]) => {
      if (sessionStorage.getItem('layout-seeded')) return
      sessionStorage.setItem('layout-seeded', '1')
      localStorage.setItem('tickdone-locale', 'en')
      localStorage.setItem('tickdone:cal:mode', cal as string)
      localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'tasks', view: 'week', ...(ui as object) }))
    },
    [ui, cal] as const,
  )
  await page.goto('/')
  await expect(page.locator('#root > *').first()).toBeVisible()
  await page.waitForTimeout(600)
}

const MODULES: [string, Record<string, unknown>, string?][] = [
  ['tasks', { module: 'tasks' }],
  ['calendar month', { module: 'calendar' }, 'month'],
  ['calendar week', { module: 'calendar' }, 'week'],
  ['calendar day', { module: 'calendar' }, 'day'],
  ['calendar agenda', { module: 'calendar' }, 'agenda'],
  ['matrix', { module: 'matrix' }],
  ['focus', { module: 'pomo' }],
  ['habits', { module: 'habit' }],
  ['statistics', { module: 'stats' }],
  ['search', { module: 'search' }],
]

for (const [name, ui, cal] of MODULES) {
  test(`${name} fits the screen`, async ({ page }) => {
    await open(page, ui, cal)
    await check(page)
  })
}

async function openDetail(page: Page) {
  await press(page.locator('.task-row .task-title').first())
  await expect(page.locator('.detail-sheet, aside.detail, .detail-float').first()).toBeVisible()
}

test('task detail fits the screen', async ({ page }) => {
  await open(page)
  await openDetail(page)
  await check(page)
})

test('the task menu fits the screen', async ({ page }) => {
  await open(page)
  await openDetail(page)
  await press(page.locator('.detail-sheet-head [title="More"], .detail-top [title="More"], .detail-foot [title="More"]').last())
  await expect(page.locator('.popover').first()).toBeVisible()
  await check(page)
})

test('the date picker fits the screen', async ({ page }) => {
  await open(page)
  await openDetail(page)
  await press(page.locator('.detail-date').first())
  await expect(page.locator('.popover.dp').first()).toBeVisible()
  await check(page)
})

test('quick add fits the screen', async ({ page }) => {
  await open(page, { view: 'inbox' })
  const fab = page.locator('.qa-fab')
  if (await fab.count()) await press(fab)
  else await press(page.locator('.list-pane .quick-add-input'))
  await page.keyboard.type('Plan the trip tomorrow 3pm !high #')
  await check(page)
})

test('the settings dialog fits the screen', async ({ page }) => {
  await open(page)
  const rail = page.locator('.rail button[aria-label="Settings"]')
  if (await rail.count()) await press(rail)
  else {
    await press(page.locator('.list-head-btn[aria-label="Open sidebar"]'))
    await press(page.locator('.drawer-head [aria-label="Settings"]'))
  }
  await expect(page.locator('.modal.dlg').first()).toBeVisible()
  await check(page)
})

test('the kanban board fits the screen', async ({ page }) => {
  const now = Date.now()
  const card = (id: string, sectionId: string) => ({ id, title: 'Card ' + id, content: '', listId: 'board', sectionId, tags: [], priority: 3, status: 0, createdAt: now, modifiedAt: now, order: 0, subtasks: [] })
  await page.addInitScript(
    (data) => {
      if (!sessionStorage.getItem('kanban-seeded')) localStorage.setItem('tickdone:data:v1', JSON.stringify(data))
      sessionStorage.setItem('kanban-seeded', '1')
    },
    {
      version: 1,
      lists: [{ id: 'board', name: 'Board', color: '#4CA1FF', view: 'kanban', order: 1, sections: [{ id: 's1', name: 'To do' }, { id: 's2', name: 'Doing' }, { id: 's3', name: 'Waiting' }] }],
      folders: [],
      tags: [],
      habits: [],
      focus: [],
      settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
      tasks: [card('a', 's1'), card('b', 's2'), card('c', 's3')],
    },
  )
  await open(page, { view: 'list:board' })
  await expect(page.locator('.kanban')).toBeVisible()
  await check(page)
})

test('the drawer fits the screen', async ({ page }) => {
  await open(page)
  const menu = page.locator('.list-head-btn[aria-label="Open sidebar"]')
  test.skip(!(await menu.isVisible()), 'the sidebar is not a drawer at this width')
  await press(menu)
  await expect(page.locator('.drawer-layer.open:not([inert])')).toBeVisible()
  await check(page)
})
