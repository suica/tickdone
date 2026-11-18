import { expect, test, type Page } from '@playwright/test'

const inbox = /收[件集]箱/

/** 任务行的标题（标题是可直接编辑的输入框，所以读 value） */
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

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.task-row').first()).toBeVisible()
})

test('快速添加：识别日期、优先级、标签并高亮，回车后出现在列表里', async ({ page }) => {
  const input = await addInInbox(page, '明天下午3点 开周会 !高 #重要')
  const hl = page.locator('.qa-mirror .qa-hl')
  await expect(hl).toHaveText(['明天', '下午3点', '!高', '#重要'])
  // 第一次回车选中标签补全，第二次回车保存
  await input.press('Enter')
  if (await input.inputValue()) await input.press('Enter')
  await expect(input).toHaveValue('')
  const row = await rowOf(page, '开周会')
  await expect(row.locator('.task-date')).toContainText('明天')
  await expect(row.locator('.tag-pill')).toHaveText('重要')
})

test('完成任务后出现撤销提示，撤销后任务回到未完成', async ({ page }) => {
  const [title] = await titles(page)
  const row = await rowOf(page, title)
  await row.locator('.checkbox').click()
  const toast = page.locator('.toast')
  await expect(toast).toContainText(`已完成「${title}」`)
  await toast.getByRole('button', { name: '撤销' }).click()
  await expect(await rowOf(page, title)).not.toHaveClass(/\bdone\b/)
})

test('数据存在本地，刷新后还在', async ({ page }) => {
  const input = await addInInbox(page, '刷新后还在的任务')
  await input.press('Enter')
  await rowOf(page, '刷新后还在的任务')
  await page.reload()
  await page.locator('.sidebar').getByText(inbox).first().click()
  await rowOf(page, '刷新后还在的任务')
})
