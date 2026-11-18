import { expect, test, type Page } from '@playwright/test'

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
