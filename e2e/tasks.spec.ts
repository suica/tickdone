import { expect, test, type Page } from '@playwright/test'

// The browser runs in zh-CN (playwright.config.ts) unless a test picks another language. Chinese strings
// below are what the app shows, or what a Chinese user types, in that language.
const inbox = /收[件集]箱|Inbox/

/** Titles of the task rows (a title is an editable input, so read its value) */
const titles = (page: Page) =>
  page.locator('.task-row .task-title').evaluateAll((els) => els.map((e) => ((e as HTMLInputElement).value ?? e.textContent ?? '').trim()))

async function rowOf(page: Page, title: string) {
  await expect.poll(() => titles(page)).toContain(title)
  return page.locator('.task-row').nth((await titles(page)).indexOf(title))
}

async function addInInbox(page: Page, text: string) {
  await page.locator('.sidebar').getByText(inbox).first().click()
  const input = page.locator('.quick-add-input')
  await input.click()
  await input.fill(text)
  return input
}

/** Types into quick add and saves (the first Enter may only pick a tag suggestion). */
async function save(input: ReturnType<Page['locator']>) {
  await input.press('Enter')
  if (await input.inputValue()) await input.press('Enter')
  await expect(input).toHaveValue('')
}

test.describe('Chinese', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.task-row').first()).toBeVisible()
  })

  test('quick add finds the date, priority and tag, highlights them and adds the task', async ({ page }) => {
    const input = await addInInbox(page, '明天下午3点 开周会 !高 #重要')
    const hl = page.locator('.qa-mirror .qa-hl')
    await expect(hl).toHaveText(['明天', '下午3点', '!高', '#重要'])
    await save(input)
    const row = await rowOf(page, '开周会')
    await expect(row.locator('.task-date')).toContainText('明天')
    await expect(row.locator('.tag-pill')).toHaveText('重要')
  })

  test('completing a task shows an undo toast; undo makes it open again', async ({ page }) => {
    const [title] = await titles(page)
    const row = await rowOf(page, title)
    await row.locator('.checkbox').click()
    const toast = page.locator('.toast')
    await expect(toast).toContainText(`已完成「${title}」`)
    await toast.getByRole('button', { name: '撤销' }).click()
    await expect(await rowOf(page, title)).not.toHaveClass(/\bdone\b/)
  })

  test('data is kept in the browser across a reload', async ({ page }) => {
    const input = await addInInbox(page, '刷新后还在的任务')
    await input.press('Enter')
    await rowOf(page, '刷新后还在的任务')
    await page.reload()
    await page.locator('.sidebar').getByText(inbox).first().click()
    await rowOf(page, '刷新后还在的任务')
  })
})

test.describe('English', () => {
  test.use({ locale: 'en-US' })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.task-row').first()).toBeVisible()
  })

  test('first run: the sample data is in English', async ({ page }) => {
    await expect.poll(() => titles(page)).toContain('Welcome to TickDone 👋')
    const sidebar = page.locator('.sidebar')
    for (const name of ['Work', 'Personal', 'Important', 'Reading']) await expect(sidebar.getByText(name, { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Habits', exact: true }).first().click()
    await expect(page.locator('.habit-row-name')).toHaveText(['Wake up early', 'Drink water', 'Read'])
  })

  test('the quick-add example from the sample task works as written', async ({ page }) => {
    const hint = (await titles(page)).find((x) => x.startsWith('Try quick add'))!
    const example = hint.match(/“(.+)”/)![1]
    const input = await addInInbox(page, example)
    await expect(page.locator('.qa-mirror .qa-hl')).toHaveText(['tomorrow', '3pm', '!high', '#Important'])
    await save(input)
    const row = await rowOf(page, 'Team meeting')
    await expect(row.locator('.task-date')).toHaveText('Tomorrow, 3:00 PM')
    await expect(row.locator('.tag-pill')).toHaveText('Important')
  })

  test('completing a task shows an undo toast in English', async ({ page }) => {
    const [title] = await titles(page)
    await (await rowOf(page, title)).locator('.checkbox').click()
    const toast = page.locator('.toast')
    await expect(toast).toContainText(`Completed “${title}”`)
    await toast.getByRole('button', { name: 'Undo' }).click()
    await expect(await rowOf(page, title)).not.toHaveClass(/\bdone\b/)
  })
})
