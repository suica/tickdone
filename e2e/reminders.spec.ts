import { expect, test, type Page } from '@playwright/test'

// Reminder cards at a mocked time (Playwright clock): firing, snooze, complete with undo, open, missed
// reminders and system notifications with the permission granted.

// The headless shell always reports notification permission as denied; the full Chromium build ("new
// headless", installed with `playwright install chromium`) has the real permission model.
test.use({ channel: 'chromium' })

const KEY = 'tickdone:data:v1'
const REMINDERS = 'tickdone:reminders:v1'
// 2026-11-18 08:58 in Asia/Shanghai (the e2e time zone); the task is due at 09:00 with an on-time reminder
const START = new Date('2026-11-18T08:58:00+08:00')
const created = START.getTime() - 86_400_000

const DATA = {
  version: 1,
  lists: [],
  folders: [],
  tags: [],
  habits: [],
  focus: [],
  settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
  tasks: [
    { id: 'r1', title: 'Call the bank', content: '', listId: 'inbox', tags: [], priority: 0, status: 0, createdAt: created, modifiedAt: created, order: 1, subtasks: [], dueDate: '2026-11-18', dueTime: '09:00', reminder: 0 },
    { id: 'r2', title: 'Water the plants', content: '', listId: 'inbox', tags: [], priority: 0, status: 0, createdAt: created, modifiedAt: created, order: 2, subtasks: [] },
  ],
}

async function open(page: Page, opts: { data?: object; reminders?: object; settings?: object } = {}) {
  const data = { ...DATA, ...(opts.data ?? {}), settings: { ...DATA.settings, ...(opts.settings ?? {}) } }
  await page.addInitScript(
    ([key, json, remKey, rem]) => {
      localStorage.setItem('tickdone-locale', 'en')
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, json)
        localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'tasks', view: 'inbox' }))
        if (rem) localStorage.setItem(remKey, rem)
      }
    },
    [KEY, JSON.stringify(data), REMINDERS, opts.reminders ? JSON.stringify(opts.reminders) : ''] as const,
  )
  await page.goto('/')
  await expect(page.locator('.task-row, .row').first()).toBeVisible()
}

const card = (page: Page) => page.locator('.rem-card:not(.rem-hint)')

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: START })
})

test('a reminder card appears at the reminder time and Complete can be undone', async ({ page }) => {
  await open(page)
  await page.clock.runFor('01:00')
  await expect(card(page)).toHaveCount(0)
  await page.clock.runFor('01:05')
  await expect(card(page)).toHaveCount(1)
  await expect(card(page)).toContainText('Call the bank')
  await expect(card(page)).toContainText('Reminder')

  await card(page).getByRole('button', { name: 'Complete' }).click()
  await expect(card(page)).toHaveCount(0)
  await expect(page.locator('.toast')).toBeVisible()
  await page.locator('.toast button').click()
  // the task is open again and its card comes back
  await expect(card(page)).toHaveCount(1)
  // saving is debounced: let the timer run
  await page.clock.runFor(500)
  const status = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).tasks.find((t: { id: string }) => t.id === 'r1').status, KEY)
  expect(status).toBe(0)
})

test('snooze hides the card and brings it back; the snooze can be undone', async ({ page }) => {
  await open(page)
  await page.clock.runFor('02:05')
  await expect(card(page)).toHaveCount(1)

  await card(page).getByRole('button', { name: '5 min', exact: true }).click()
  await expect(card(page)).toHaveCount(0)
  await expect(page.locator('.toast')).toContainText('Snoozed for 5 minutes')
  await page.clock.runFor('04:00')
  await expect(card(page)).toHaveCount(0)
  await page.clock.runFor('01:30')
  await expect(card(page)).toHaveCount(1)

  // snooze until tomorrow, then undo it from the toast
  await card(page).getByRole('button', { name: 'Tomorrow' }).click()
  await expect(card(page)).toHaveCount(0)
  await expect(page.locator('.toast')).toContainText('Snoozed until tomorrow')
  await page.locator('.toast button').click()
  await expect(card(page)).toHaveCount(1)
})

test('Open shows the task and dismisses the card for good', async ({ page }) => {
  await open(page)
  await page.clock.runFor('02:05')
  await card(page).getByRole('button', { name: 'Open' }).click()
  await expect(card(page)).toHaveCount(0)
  await expect(page.locator('.detail .detail-title')).toHaveValue('Call the bank')
  // stays dismissed after a reload
  await page.reload()
  await page.clock.runFor('00:40')
  await expect(page.locator('.task-row, .row').first()).toBeVisible()
  await expect(card(page)).toHaveCount(0)
})

test('reminders missed while the app was closed show as cards when it opens', async ({ page }) => {
  // reminders were tracked since yesterday; the app opens at 08:58, after a 08:30 reminder
  const since = START.getTime() - 86_400_000
  await open(page, {
    reminders: { since, done: {}, snoozed: {}, announced: {} },
    data: { tasks: [{ ...DATA.tasks[0], dueTime: '08:30' }, DATA.tasks[1]] },
  })
  await expect(card(page)).toHaveCount(1)
  await expect(card(page)).toContainText('Missed reminder')
  await expect(card(page)).toContainText('Call the bank')
  await card(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(card(page)).toHaveCount(0)
  await expect(page.locator('.toast')).toContainText('Reminder dismissed')
  await page.locator('.toast button').click()
  await expect(card(page)).toHaveCount(1)
})

test('with notification permission granted, the toggle in Settings turns notifications on and a reminder shows one', async ({ page, context }) => {
  await context.grantPermissions(['notifications'])
  // Record notifications (the real API stays underneath)
  await page.addInitScript(() => {
    const Real = window.Notification
    const shown: { title: string; body?: string; taskId?: string }[] = []
    ;(window as unknown as { __shown: typeof shown }).__shown = shown
    class Recording extends Real {
      constructor(title: string, options?: NotificationOptions) {
        super(title, options)
        shown.push({ title, body: options?.body, taskId: (options?.data as { taskId?: string })?.taskId })
      }
    }
    Object.defineProperty(window, 'Notification', { value: Recording, configurable: true, writable: true })
  })
  await open(page)
  expect(await page.evaluate(() => Notification.permission)).toBe('granted')

  await page.locator('[title="Settings"]').first().click()
  await page.locator('.dlg-set-tab', { hasText: 'Reminders' }).click()
  const toggle = page.getByRole('switch').first()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('.dlg-note')).toContainText('open in a tab, or installed and running')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.dlg-row-desc').first()).toContainText('On:')
  await page.keyboard.press('Escape')

  await page.clock.runFor('02:05')
  await expect(card(page)).toHaveCount(1)
  const shown = await page.evaluate(() => (window as unknown as { __shown: unknown[] }).__shown)
  expect(shown).toEqual([{ title: 'Call the bank', body: expect.stringContaining('Today'), taskId: 'r1' }])
})

test('setting the first reminder offers notifications once, from a button', async ({ page }) => {
  await open(page, { data: { tasks: [DATA.tasks[1]] } })
  await expect(page.locator('.rem-hint')).toHaveCount(0)
  // add a task with a time: quick add sets an on-time reminder
  await page.locator('.quick-add-input').fill('Pay rent tomorrow 3pm')
  await page.locator('.quick-add-input').press('Enter')
  await expect(page.locator('.rem-hint')).toBeVisible()
  await expect(page.locator('.rem-hint')).toContainText('installed and running')
  await page.locator('.rem-hint').getByRole('button', { name: 'Not now' }).click()
  await expect(page.locator('.rem-hint')).toHaveCount(0)
})
