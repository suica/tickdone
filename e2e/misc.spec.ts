import { devices, expect, test, type Page } from '@playwright/test'

// Settings, focus timer, search and habits in other languages, on the app's own data.

const KEY = 'tickdone:data:v1'
const now = Date.now()
const DATA = {
  version: 1,
  lists: [{ id: 'work', name: 'Work', color: '#4CA1FF', view: 'list', order: 1, sections: [] }],
  folders: [],
  tags: [],
  habits: [{ id: 'h1', name: 'Read', icon: '📖', color: '#6E75F4', checkins: {}, createdAt: 0, order: 0, frequency: { kind: 'weekly', times: 3 } }],
  focus: [],
  settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
  tasks: [
    { id: 't1', title: 'Write report', content: '', listId: 'work', tags: [], priority: 0, status: 0, createdAt: now, modifiedAt: now, order: 1, subtasks: [] },
    { id: 't2', title: 'Plan trip', content: 'book a report hotel', listId: 'inbox', tags: [], priority: 0, status: 0, createdAt: now, modifiedAt: now, order: 2, subtasks: [] },
  ],
}

async function open(page: Page, locale: string, module = 'tasks') {
  await page.addInitScript(
    ([key, json, locale, module]) => {
      if (!localStorage.getItem('tickdone-locale')) localStorage.setItem('tickdone-locale', locale)
      localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module, view: 'inbox' }))
      if (!localStorage.getItem(key)) localStorage.setItem(key, json)
    },
    [KEY, JSON.stringify(DATA), locale, module] as const,
  )
  await page.goto('/')
}

test('the language picker in settings switches the whole UI and is remembered', async ({ page }) => {
  await open(page, 'en', 'pomo')
  await expect(page.locator('.pomo-head h2')).toHaveText('Focus')
  await page.locator('[title="Settings"], [aria-label="Settings"]').first().click()
  const select = page.getByRole('combobox', { name: 'Language' })
  await select.selectOption('de')
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await expect(page.locator('.dlg-set-title')).toHaveText('Einstellungen')
  await expect(page.getByRole('combobox', { name: 'Sprache' })).toHaveValue('de')
  await page.keyboard.press('Escape')
  await expect(page.locator('.pomo-head h2')).toHaveText('Fokus')
  await expect(page.locator('.pomo-btn.primary')).toContainText('Starten')
  await page.reload()
  await expect(page.locator('.pomo-head h2')).toHaveText('Fokus')
})

test('search counts and labels matches in the current language', async ({ page }) => {
  await open(page, 'ru', 'search')
  await page.locator('.search-input').fill('report')
  await expect(page.locator('.search-total')).toHaveText('2 задачи')
  await expect(page.locator('.search-snippet-label')).toHaveText('Описание')
})

test('habit rows use plural forms and localized weekdays', async ({ page }) => {
  await open(page, 'de', 'habit')
  await expect(page.locator('.habit-row-sub')).toContainText('/3 Tage diese Woche')
  await expect(page.locator('.habit-day-wd').first()).toHaveText(/^(Mo|Heute)$/)
})

test('the language picker lists every language by its own name', async ({ page }) => {
  await open(page, 'en')
  await page.locator('[title="Settings"], [aria-label="Settings"]').first().click()
  await expect(page.getByRole('combobox', { name: 'Language' }).locator('option')).toHaveText([
    'English',
    '简体中文',
    '繁體中文',
    '日本語',
    '한국어',
    'Español',
    'Français',
    'Deutsch',
    'Português (Brasil)',
    'Русский',
  ])
})

// Runs in the desktop project with a phone context (412x839, touch, mobile viewport).
const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7']

async function controlsUnder40(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((els) =>
    els
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => {
        const r = e.getBoundingClientRect()
        return { cls: (e as HTMLElement).className, w: Math.round(r.width), h: Math.round(r.height) }
      })
      .filter((r) => r.w < 40 || r.h < 40),
  )
}

test.describe('phone (Pixel 7 emulation)', () => {
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })

  test('the date picker fills the bottom sheet and its controls are at least 40px', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tickdone-locale', 'ru'))
    await page.goto('/')
    await page.locator('.task-row .task-meta').first().tap()
    await page.locator('.detail-date').tap()
    const sheet = page.locator('.sheet-layer .popover.sheet.dp')
    await expect(sheet).toBeVisible()
    const vw = page.viewportSize()!.width
    await expect.poll(async () => Math.round((await sheet.boundingBox())!.width)).toBe(vw)
    expect(await controlsUnder40(page, '.dp .dp-qbtn, .dp .dp-nav, .dp .dp-day span, .dp .dp-row, .dp .dp-foot .btn')).toEqual([])
    // long quick-date names wrap instead of being cut off
    const cut = await page.locator('.dp .dp-tip').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent))
    expect(cut).toEqual([])
  })

  test('search fills the screen, results fade in one after another', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tickdone-locale', 'en'))
    await page.addInitScript(() => localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'search' })))
    await page.goto('/')
    const input = page.locator('.search-input')
    await expect(input).toBeVisible()
    const vw = page.viewportSize()!.width
    const box = (await input.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(40)
    expect(box.width).toBeGreaterThan(vw - 40)
    await input.fill('a')
    const hits = page.locator('.search-hit')
    await expect(hits.first()).toBeVisible()
    expect(await hits.count()).toBeGreaterThan(1)
    // each row starts its fade a little later than the one before
    const delays = await hits.evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).animationDelay)))
    for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThan(delays[i - 1])
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw)
  })

  test('with reduced motion the search results appear without animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => localStorage.setItem('tickdone-locale', 'en'))
    await page.addInitScript(() => localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'search' })))
    await page.goto('/')
    await page.locator('.search-input').fill('a')
    await expect(page.locator('.search-hit').first()).toBeVisible()
    expect(await page.locator('.search-hit').first().evaluate((e) => getComputedStyle(e).animationName)).toBe('none')
  })
})
