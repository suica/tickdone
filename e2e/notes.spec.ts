import { expect, test, type Page } from '@playwright/test'
import { fixture, NOW } from './calHelpers'

// Markdown in task notes: the notes show rendered, switch to their source on click or focus, Esc goes
// back, checklist boxes tick in place, and the list's "Show details" preview is plain text.
// The browser runs in zh-CN (playwright.config.ts).

type Data = ReturnType<typeof fixture>

async function openTask(page: Page, id: string, edit: (d: Data) => void = () => {}) {
  const data = fixture()
  edit(data)
  await page.clock.setFixedTime(NOW)
  await page.addInitScript((data) => {
    if (sessionStorage.getItem('e2e-seeded')) return
    sessionStorage.setItem('e2e-seeded', '1')
    localStorage.setItem('tickdone:data:v1', JSON.stringify(data))
    localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'tasks', view: 'list:L-work', prefs: {}, collapsed: {}, sidebarHidden: false }))
  }, data)
  await page.goto('/#task=' + id)
  await expect(page.locator('.detail-title')).toBeVisible()
}

const storedContent = (page: Page, id: string) =>
  page.evaluate((id) => (JSON.parse(localStorage.getItem('tickdone:data:v1')!).tasks as { id: string; content: string }[]).find((t) => t.id === id)!.content, id)

const NOTE = ['# Plan', 'Ship **the release** and *celebrate*', '', '- [ ] write notes', '- [x] run tests', '', 'See [the docs](https://example.com/docs)'].join('\n')

test('write a note, see it rendered, tick a box in place, edit it again', async ({ page }) => {
  await openTask(page, 'review')
  const view = page.locator('.detail-md')
  const editor = page.locator('textarea.detail-content')

  // an empty note is a text field straight away
  await expect(view).toHaveCount(0)
  await editor.click()
  await editor.fill(NOTE)
  // Esc leaves the editor; the task stays open
  await editor.press('Escape')
  await expect(editor).toHaveCount(0)
  await expect(page.locator('.detail-title')).toBeVisible()

  await expect(view.locator('h1')).toHaveText('Plan')
  await expect(view.locator('strong')).toHaveText('the release')
  await expect(view.locator('em')).toHaveText('celebrate')
  const link = view.getByRole('link', { name: 'the docs' })
  await expect(link).toHaveAttribute('href', 'https://example.com/docs')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/)
  const boxes = view.locator('input.md-check')
  await expect(boxes).toHaveCount(2)
  await expect(boxes.nth(0)).not.toBeChecked()
  await expect(boxes.nth(1)).toBeChecked()
  // the focus is back on the rendered note, not in a field
  await expect(view).toBeFocused()

  // ticking a box changes that line of the note and stays in the rendered view
  await boxes.nth(0).click()
  await expect(boxes.nth(0)).toBeChecked()
  await expect(editor).toHaveCount(0)
  await expect.poll(() => storedContent(page, 'review')).toContain('- [x] write notes')
  await boxes.nth(1).click()
  await expect(boxes.nth(1)).not.toBeChecked()
  await expect.poll(() => storedContent(page, 'review')).toContain('- [ ] run tests')

  // a click on the text opens the source, with the change from the boxes in it
  await view.locator('h1').click()
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue(NOTE.replace('- [ ] write notes', '- [x] write notes').replace('- [x] run tests', '- [ ] run tests'))
  await editor.fill(NOTE + '\n\n> quoted')
  // leaving the field shows it rendered
  await page.locator('.detail-title').click()
  await expect(view.locator('blockquote')).toHaveText('quoted')

  // keyboard: Tab onto the note opens it for editing, Esc closes it again
  await page.locator('.detail-title').focus()
  await page.keyboard.press('Tab')
  await expect(editor).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(view).toBeVisible()
  await expect(page.locator('.detail-title')).toBeVisible()
})

test('the "Show details" preview in the list is plain text', async ({ page }) => {
  await openTask(page, 'mail', (d) => {
    ;(d.settings as Record<string, unknown>).showDetails = true
    d.tasks.find((t) => t.id === 'mail')!.content = '## Inbox zero\n**Reply** to [Ann](https://example.com)\n- [ ] invoices\n`code`'
  })
  const preview = page.locator('.list-pane .task-row[data-task-id="mail"] .task-notes')
  await expect(preview).toHaveText('Inbox zero Reply to Ann ☐ invoices code')
  await expect(preview.locator('a, strong, h2, input')).toHaveCount(0)
})

test('pasted HTML and script links show as text and never run', async ({ page }) => {
  const evil = ['<img src=x onerror="window.__pwned=1">', '[click me](javascript:window.__pwned=2)', '<script>window.__pwned=3</script>', '[data](data:text/html,<script>window.__pwned=4</script>)'].join('\n\n')
  await openTask(page, 'tidy', (d) => (d.tasks.find((t) => t.id === 'tidy')!.content = evil))
  const view = page.locator('.detail-md')
  await expect(view).toContainText('<img src=x onerror="window.__pwned=1">')
  await expect(view).toContainText('<script>window.__pwned=3</script>')
  await expect(view.locator('img, script, iframe')).toHaveCount(0)
  // the links whose address is not http(s) or mailto are text
  await expect(view.locator('a')).toHaveCount(0)
  await expect(view).toContainText('click me')
  await view.getByText('click me').click()
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
})
