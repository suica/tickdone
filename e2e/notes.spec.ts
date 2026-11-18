import { expect, test, type Page } from '@playwright/test'
import { fixture, NOW } from './calHelpers'

// Task notes are stored as Markdown and edited with their formatting shown in place: typing "**bold**",
// "# " or "- [ ] " formats right away, without leaving the field first. The browser runs in zh-CN
// (playwright.config.ts).

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
  await expect(page.locator('.note-editor')).toBeVisible()
}

const setNote = (id: string, content: string) => (d: Data) => {
  d.tasks.find((t) => t.id === id)!.content = content
}

const storedContent = (page: Page, id: string) =>
  page.evaluate((id) => (JSON.parse(localStorage.getItem('tickdone:data:v1')!).tasks as { id: string; content: string }[]).find((t) => t.id === id)!.content, id)

const editor = (page: Page) => page.locator('.note-editor')

/** Reloads the page and opens the task again (the open task is not kept across reloads). */
async function reloadAndOpen(page: Page, id: string) {
  await page.reload()
  await page.locator(`.list-pane .task-row[data-task-id="${id}"] .task-title`).click()
  await expect(editor(page)).toBeVisible()
}

test('typing **bold**, "# " and "- [ ] " formats them right away, and the note is saved as Markdown', async ({ page }) => {
  await openTask(page, 'review')
  const ed = editor(page)
  await ed.click()
  // the case from the bug report: no Esc, no click elsewhere, the formatting shows while typing
  await page.keyboard.type('**akjshdkah**')
  await expect(ed.locator('strong')).toHaveText('akjshdkah')
  await expect(ed).not.toContainText('**')
  await page.keyboard.press('Enter')
  await page.keyboard.type('# Heading')
  await expect(ed.locator('h1')).toHaveText('Heading')
  await page.keyboard.press('Enter')
  await page.keyboard.type('- [ ] write notes')
  await expect(ed.locator('ul[data-type="taskList"] li > div')).toHaveText('write notes')
  await expect(ed.locator('input[type="checkbox"]')).not.toBeChecked()
  await expect(ed.locator('input[type="checkbox"]')).toHaveAttribute('aria-label', '清单项：write notes')
  // Enter makes the next checklist item; typing its mark as well ticks it instead of showing the mark
  await page.keyboard.press('Enter')
  await page.keyboard.type('- [x] run tests')
  await expect(ed.locator('ul[data-type="taskList"] li > div')).toHaveText(['write notes', 'run tests'])
  await expect(ed.locator('input[type="checkbox"]').nth(1)).toBeChecked()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Some *italic* and `code` and ~~gone~~')
  await expect(ed.locator('em')).toHaveText('italic')
  await expect(ed.locator('code')).toHaveText('code')
  await expect(ed.locator('s')).toHaveText('gone')
  // also inside Chinese text, where there is no space before the marks
  await page.keyboard.press('Enter')
  await page.keyboard.type('现在**加粗**了，*斜体*也行')
  await expect(ed.locator('strong').nth(1)).toHaveText('加粗')
  await expect(ed.locator('em').nth(1)).toHaveText('斜体')
  // the editor is still focused: nothing had to be left for the formatting to show
  await expect(ed).toBeFocused()
  await expect.poll(() => storedContent(page, 'review')).toBe('**akjshdkah**\n\n# Heading\n\n- [ ] write notes\n- [x] run tests\n\nSome *italic* and `code` and ~~gone~~\n\n现在**加粗**了，*斜体*也行')

  // Esc leaves the editor; the task stays open and the note stays formatted
  await page.keyboard.press('Escape')
  await expect(ed).not.toBeFocused()
  await expect(page.locator('.detail-title')).toBeVisible()
  await expect(ed.locator('strong').first()).toHaveText('akjshdkah')

  // after a reload it is still formatted
  await reloadAndOpen(page, 'review')
  await expect(editor(page).locator('h1')).toHaveText('Heading')
  await expect(editor(page).locator('strong').first()).toHaveText('akjshdkah')
})

test('"- " then "[x] " makes a ticked checklist item; bullets around it stay bullets', async ({ page }) => {
  await openTask(page, 'review')
  await editor(page).click()
  await page.keyboard.type('- one')
  await page.keyboard.press('Enter')
  await page.keyboard.type('[x] two')
  await expect(editor(page).locator('ul:not([data-type]) > li')).toHaveText('one')
  await expect(editor(page).locator('ul[data-type="taskList"] input')).toBeChecked()
  await expect.poll(() => storedContent(page, 'review')).toBe('- one\n\n- [x] two')
})

// Notes written before the editor: single line breaks, "*" bullets, numbered lists, quotes, code and boxes
const OLD_NOTE = [
  '# Plan',
  'Ship **the release** and *celebrate*',
  'second line of the paragraph',
  '',
  '- [ ] write notes',
  '- [x] run tests',
  '',
  '* apples',
  '* pears',
  '',
  '1) first',
  '2) second',
  '',
  '> quoted',
  '',
  '```',
  'const a = 1 // **not bold**',
  '```',
  '',
  'See [the docs](https://example.com/docs)',
].join('\n')

test('a note saved by an earlier version opens formatted and is not rewritten by opening it', async ({ page }) => {
  await openTask(page, 'mail', setNote('mail', OLD_NOTE))
  const ed = editor(page)
  await expect(ed.locator('h1')).toHaveText('Plan')
  await expect(ed.locator('strong')).toHaveText('the release')
  await expect(ed.locator('em')).toHaveText('celebrate')
  // a single line break stays a line break
  await expect(ed.locator('p').first().locator('br')).toHaveCount(1)
  await expect(ed.locator('ul[data-type="taskList"] input')).toHaveCount(2)
  await expect(ed.locator('ul[data-type="taskList"] input').nth(1)).toBeChecked()
  await expect(ed.locator('ul:not([data-type]) li')).toHaveText(['apples', 'pears'])
  await expect(ed.locator('ol li')).toHaveText(['first', 'second'])
  await expect(ed.locator('blockquote')).toHaveText('quoted')
  await expect(ed.locator('pre code')).toHaveText('const a = 1 // **not bold**')
  const link = ed.getByRole('link', { name: 'the docs' })
  await expect(link).toHaveAttribute('href', 'https://example.com/docs')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/)
  // opening, switching to another task and back, and reloading leave the stored text alone
  await page.locator('.list-pane .task-row[data-task-id="plan"] .task-title').click()
  await page.locator('.list-pane .task-row[data-task-id="mail"] .task-title').click()
  await expect(editor(page).locator('h1')).toHaveText('Plan')
  await reloadAndOpen(page, 'mail')
  await expect(editor(page).locator('h1')).toHaveText('Plan')
  expect(await storedContent(page, 'mail')).toBe(OLD_NOTE)
})

test('checklist boxes tick in place and change only their line', async ({ page }) => {
  await openTask(page, 'mail', setNote('mail', 'Before\n\n- [ ] milk\n- [x] bread'))
  const boxes = editor(page).locator('ul[data-type="taskList"] input')
  await boxes.nth(0).click()
  await expect(boxes.nth(0)).toBeChecked()
  await expect.poll(() => storedContent(page, 'mail')).toBe('Before\n\n- [x] milk\n- [x] bread')
  await boxes.nth(1).click()
  await expect.poll(() => storedContent(page, 'mail')).toBe('Before\n\n- [x] milk\n- [ ] bread')
})

test('pasted Markdown turns into formatting', async ({ page }) => {
  await openTask(page, 'review')
  await editor(page).click()
  await editor(page).evaluate((el) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', '## Pasted\n\n**strong** text\n\n- [ ] box')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(editor(page).locator('h2')).toHaveText('Pasted')
  await expect(editor(page).locator('strong')).toHaveText('strong')
  await expect(editor(page).locator('ul[data-type="taskList"] input')).toHaveCount(1)
})

test('a link opens in a new tab', async ({ page, context }) => {
  await context.route('https://example.com/**', (r) => r.fulfill({ body: 'ok', contentType: 'text/plain' }))
  await openTask(page, 'mail', setNote('mail', 'Read [the docs](https://example.com/docs)'))
  const popup = context.waitForEvent('page')
  await editor(page).getByRole('link', { name: 'the docs' }).click()
  expect((await popup).url()).toBe('https://example.com/docs')
  // the task is still open in the app
  await expect(page.locator('.detail-title')).toHaveValue('Answer mail')
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

const EVIL = [
  '<script>window.__pwned=1</script>',
  '<img src=x onerror="window.__pwned=2">',
  '<a href="javascript:window.__pwned=3">x</a>',
  '[click me](javascript:window.__pwned=4)',
  '[click](JAVASCRIPT:window.__pwned=5)',
  '[data](data:text/html,<script>window.__pwned=6</script>)',
  '[vb](vbscript:msgbox)',
  '<javascript:window.__pwned=7>',
  '[x](https://ok.example "title" onmouseover="window.__pwned=8")',
  '# <svg onload="window.__pwned=9">',
  '- [ ] <iframe src="javascript:window.__pwned=10">',
  '> <style>body{display:none}</style>',
  '```\n</code></pre><script>window.__pwned=11</script>\n```',
  '`<b onclick="window.__pwned=12">`',
  '**<img src=x onerror="window.__pwned=13">**',
  'https://ok.example/"><script>window.__pwned=14</script>',
  '[a](https://ok.example/"onmouseover="window.__pwned=15)',
]

test('HTML and script links in a note show as text and never run', async ({ page }) => {
  await openTask(page, 'tidy', setNote('tidy', EVIL.join('\n\n')))
  const ed = editor(page)
  await expect(ed).toContainText('<script>window.__pwned=1</script>')
  await expect(ed).toContainText('<img src=x onerror="window.__pwned=2">')
  const bad = await ed.evaluate((root) => {
    const out: string[] = []
    for (const el of root.querySelectorAll('*')) {
      if (['SCRIPT', 'IMG', 'IFRAME', 'SVG', 'STYLE', 'OBJECT', 'EMBED'].includes(el.tagName.toUpperCase())) out.push('tag ' + el.tagName)
      for (const a of el.attributes) {
        if (/^on/i.test(a.name)) out.push('handler ' + a.name)
        if ((a.name === 'href' || a.name === 'src') && !/^(https?:|mailto:)/i.test(a.value)) out.push(a.name + ' ' + a.value)
      }
    }
    return out
  })
  expect(bad).toEqual([])
  // the words of a link that is not allowed stay, without a link
  await ed.getByText('click me', { exact: false }).click()
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
  // the note is not rewritten by showing it
  expect(await storedContent(page, 'tidy')).toBe(EVIL.join('\n\n'))
})

test('subtasks and the note stay separate', async ({ page }) => {
  await openTask(page, 'mail', (d) => {
    const t = d.tasks.find((t) => t.id === 'mail')! as unknown as { subtasks: { id: string; title: string; done: boolean }[] }
    t.subtasks = [{ id: 's1', title: '**not markdown**', done: false }]
  })
  await editor(page).click()
  await page.keyboard.type('**bold**')
  await expect(editor(page).locator('strong')).toHaveText('bold')
  // a subtask title is plain text
  await expect(page.locator('.subtask[data-sub-id="s1"] input')).toHaveValue('**not markdown**')
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('the bottom sheet note formats as you type; Esc leaves the note, then closes the sheet', async ({ page }) => {
    await openTask(page, 'review')
    await expect(page.locator('.detail-sheet')).toBeVisible()
    await editor(page).tap()
    await page.keyboard.type('**akjshdkah**')
    await expect(editor(page).locator('strong')).toHaveText('akjshdkah')
    await page.keyboard.press('Enter')
    await page.keyboard.type('# Heading')
    await expect(editor(page).locator('h1')).toHaveText('Heading')
    await page.keyboard.press('Escape')
    await expect(page.locator('.detail-sheet')).toBeVisible()
    await expect(editor(page)).not.toBeFocused()
    await expect.poll(() => storedContent(page, 'review')).toBe('**akjshdkah**\n\n# Heading')
  })

  test('a checklist box is a 40 px target and ticks in place', async ({ page }) => {
    await openTask(page, 'mail', setNote('mail', '- [ ] milk'))
    const item = editor(page).locator('ul[data-type="taskList"] > li')
    expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(40)
    await editor(page).locator('ul[data-type="taskList"] label').tap()
    await expect.poll(() => storedContent(page, 'mail')).toBe('- [x] milk')
  })
})
