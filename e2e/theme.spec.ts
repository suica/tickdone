import { expect, test, type Page } from '@playwright/test'

// Theme (light, dark, follow the system) and accent colour: applied at once, kept after a reload, and
// already in place on the launch screen. Runs in English.

const KEY = 'tickdone:data:v1'
const now = Date.now()
const settings = (theme?: string) => ({ pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, showCompleted: true, ...(theme ? { theme } : {}) })
const data = (theme?: string) => ({
  version: 1,
  lists: [{ id: 'work', name: 'Work', color: '#4CA1FF', view: 'list', order: 1, sections: [] }],
  folders: [],
  tags: [],
  habits: [],
  focus: [],
  settings: settings(theme),
  tasks: [{ id: 't1', title: 'Write report', content: '', listId: 'inbox', tags: [], priority: 0, status: 0, createdAt: now, modifiedAt: now, order: 1, subtasks: [] }],
})

/** Opens the app; `theme` null starts as a new user with no saved data. */
async function open(page: Page, theme: string | null) {
  await page.addInitScript(
    ([key, json]) => {
      if (!localStorage.getItem('tickdone-locale')) localStorage.setItem('tickdone-locale', 'en')
      if (json && !localStorage.getItem(key)) localStorage.setItem(key, json)
    },
    [KEY, theme === null ? '' : JSON.stringify(data(theme))] as const,
  )
  await page.goto('/')
  await expect(page.locator('#launch')).toHaveCount(0, { timeout: 5000 })
}

const rootVar = (page: Page, name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)
const themeAttr = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme)
const saved = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').settings, KEY)

async function openSettings(page: Page) {
  await page.locator('[title="Settings"], [aria-label="Settings"]').first().click()
  await expect(page.locator('.dlg-themes')).toBeVisible()
}

test('a new user follows the system theme, and it changes with the system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await open(page, null)
  expect(await themeAttr(page)).toBe('dark')
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#1c1c1c')
  expect(await rootVar(page, '--primary')).toBe('#6388fb')

  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => themeAttr(page)).toBe('light')
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#ffffff')
  expect(await rootVar(page, '--primary')).toBe('#4772fa')

  await openSettings(page)
  await expect(page.getByRole('radio', { name: 'Follow system' })).toHaveAttribute('aria-checked', 'true')
})

test('an existing user keeps the theme they chose, whatever the system says', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await open(page, 'light')
  expect(await themeAttr(page)).toBe('light')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.emulateMedia({ colorScheme: 'dark' })
  expect(await themeAttr(page)).toBe('light')
  expect((await saved(page)).theme).toBe('light')
})

test('switching the theme and the accent applies at once and survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await open(page, 'light')
  await openSettings(page)

  // Accent: violet
  await page.getByRole('radio', { name: 'Violet' }).click()
  await expect(page.getByRole('radio', { name: 'Violet' })).toHaveAttribute('aria-checked', 'true')
  expect(await rootVar(page, '--primary')).toBe('#8250df')
  expect(await rootVar(page, '--primary-soft')).toBe('rgba(130, 80, 223, 0.1)')
  expect(await page.evaluate(() => document.documentElement.dataset.accent)).toBe('violet')
  // The selected theme card is outlined in the new accent
  expect(await page.locator('.dlg-theme.on .dlg-theme-preview').evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgb(130, 80, 223)')
  // The tab icon follows the accent
  expect(await page.locator('link[rel="icon"]').getAttribute('href')).toMatch(/^data:image\/svg\+xml,/)

  // Theme: dark. The dark-theme accent is the lighter derived step.
  await page.getByRole('radio', { name: 'Dark' }).click()
  expect(await themeAttr(page)).toBe('dark')
  expect(await rootVar(page, '--primary')).toBe('#966ce4')
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#1c1c1c')
  await expect.poll(() => saved(page)).toMatchObject({ theme: 'dark', accent: 'violet' })

  await page.reload()
  await expect(page.locator('#launch')).toHaveCount(0, { timeout: 5000 })
  expect(await themeAttr(page)).toBe('dark')
  expect(await rootVar(page, '--primary')).toBe('#966ce4')

  // Back to blue: the tuned dark blue and the static icon return
  await openSettings(page)
  await page.getByRole('radio', { name: 'Blue' }).click()
  expect(await rootVar(page, '--primary')).toBe('#6388fb')
  expect(await page.locator('link[rel="icon"]').getAttribute('href')).toBe('/favicon.svg')
})

test('the launch screen uses the saved accent and follows the system before the app script runs', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await open(page, 'system')
  await openSettings(page)
  await page.getByRole('radio', { name: 'Green' }).click()
  await expect.poll(async () => (await saved(page))?.accent).toBe('green')
  await page.evaluate(() => new Promise((r) => setTimeout(r, 600))) // let the store write

  // Without the app bundle only the inline script in index.html can set the colours.
  await page.route(/\/(assets|src)\/.*\.(js|tsx?)$/, (r) => r.abort())
  await page.reload()
  expect(await themeAttr(page)).toBe('dark')
  const mark = await page.locator('#launch .ring').evaluate((el) => getComputedStyle(el).stroke)
  expect(mark).toBe('rgb(33, 135, 74)') // green #21874a
  expect(await page.locator('#launch').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(28, 28, 28)')
  expect(await page.locator('link[rel="icon"]').getAttribute('href')).toMatch(/^data:image\/svg\+xml,/)

  await page.emulateMedia({ colorScheme: 'light' })
  await page.reload()
  expect(await themeAttr(page)).toBe('light')
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#ffffff')
})

test('pointing at a swatch previews it on the theme cards without saving it', async ({ page }) => {
  await open(page, 'light')
  await openSettings(page)
  const pic = page.locator('.dlg-theme[data-theme-mode="light"] .dlg-theme-pic .pv-btn')
  expect(await pic.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(71, 114, 250)')
  await page.getByRole('radio', { name: 'Pink' }).hover()
  await expect.poll(() => pic.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(201, 61, 138)')
  await expect(page.locator('.dlg-accent-row .dlg-row-desc')).toHaveText('Pink')
  expect(await rootVar(page, '--primary')).toBe('#4772fa')
  await page.mouse.move(5, 5)
  await expect.poll(() => pic.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(71, 114, 250)')
})
