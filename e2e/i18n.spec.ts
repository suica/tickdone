import { devices, expect, test, type Page } from '@playwright/test'
import { catalogs } from '../src/i18n/catalogs'
import { LOCALES } from '../src/i18n/locales'
import type { Msg } from '../src/i18n/types'

// Every module in every language, on a desktop and on a phone: nothing sticks out of the screen and no English
// interface text is left over. Then the language is switched at runtime through all ten, and the interface follows.

type Cat = Record<string, Msg>
const texts = (cat: Cat) => Object.values(cat).flatMap((m) => (typeof m === 'string' ? [m] : Object.values(m).filter((x): x is string => !!x)))
/** English interface texts (without placeholders) that a translation does not use as well, e.g. "Kanban" is the same in many languages. */
function englishOnly(code: string) {
  const own = new Set(texts(catalogs[code as keyof typeof catalogs] as Cat))
  return texts(catalogs.en as Cat).filter((s) => !s.includes('{') && /\p{L}{4}/u.test(s) && !own.has(s))
}

const MODULES: [string, string][] = [
  ['tasks', 'common.module.tasks'],
  ['calendar', 'common.module.calendar'],
  ['matrix', 'common.module.matrix'],
  ['pomo', 'common.module.focus'],
  ['habit', 'common.module.habits'],
  ['stats', 'common.module.stats'],
]

async function offenders(page: Page) {
  return page.evaluate(() => {
    const vw = innerWidth
    const out: string[] = []
    if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrollWidth ${document.documentElement.scrollWidth}`)
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[aria-hidden="true"],[inert]')) continue
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || (r.right <= vw + 1 && r.left >= -1)) continue
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.opacity === '0') continue
      let held = false
      for (let p = el.parentElement; p && p !== document.body && !held; p = p.parentElement) {
        if (getComputedStyle(p).overflowX === 'visible') continue
        const pr = p.getBoundingClientRect()
        held = pr.right <= vw + 1 && pr.left >= -1
      }
      if (!held) out.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 40)} [${Math.round(r.left)}, ${Math.round(r.right)}]`)
    }
    return out.slice(0, 5)
  })
}

/** English interface texts shown on screen, as text or as a label, title or placeholder. */
async function leftovers(page: Page, english: string[], ignore: string[] = []) {
  return page.evaluate(
    ([english, ignore]) => {
      const set = new Set(english)
      ignore.forEach((x) => set.delete(x))
      const hits = new Set<string>()
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      while (walk.nextNode()) {
        const text = (walk.currentNode.textContent ?? '').trim()
        if (set.has(text) && !walk.currentNode.parentElement?.closest('[inert],[aria-hidden="true"]')) hits.add(text)
      }
      for (const el of document.querySelectorAll('[aria-label],[title],[placeholder]')) {
        if (el.closest('[inert]')) continue
        for (const a of ['aria-label', 'title', 'placeholder']) {
          const v = el.getAttribute(a)
          if (v && set.has(v)) hits.add(`${a}="${v}"`)
        }
      }
      return [...hits]
    },
    [english, ignore] as const,
  )
}

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7']

for (const size of ['desktop', 'phone'] as const) {
  test.describe(size, () => {
    if (size === 'phone') test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })
    for (const { code } of LOCALES) {
      test(`every module in ${code}`, async ({ page }) => {
        const cat = catalogs[code] as Cat
        const english = englishOnly(code)
        await page.addInitScript((code) => {
          if (sessionStorage.getItem('i18n-seeded')) return
          sessionStorage.setItem('i18n-seeded', '1')
          localStorage.setItem('tickdone-locale', code)
          localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'tasks', view: 'week' }))
        }, code)
        await page.goto('/')
        await expect(page.locator('html')).toHaveAttribute('lang', code)
        await expect(page.locator('.task-row').first()).toBeVisible()
        for (const [module, key] of MODULES) {
          const button = page.locator(size === 'phone' ? `.tabbar button[aria-label="${cat[key]}"]` : `.rail button[aria-label="${cat[key]}"]`)
          await (size === 'phone' ? button.tap() : button.click())
          await page.waitForTimeout(400)
          expect(await offenders(page), `${code} ${module}: sticks out`).toEqual([])
          if (code !== 'en') expect(await leftovers(page, english), `${code} ${module}: English text`).toEqual([])
        }
      })
    }
  })
}

test('switching the language at runtime updates the whole interface, through all ten', async ({ page }) => {
  const now = Date.now()
  const task = (id: string, title: string, p: Record<string, unknown> = {}) => ({ id, title, content: '', listId: 'inbox', tags: [], priority: 0, status: 0, createdAt: now, modifiedAt: now, order: 0, subtasks: [], dueDate: new Date(now).toISOString().slice(0, 10), ...p })
  const data = {
    version: 1,
    lists: [{ id: 'work', name: 'Work', color: '#4CA1FF', view: 'list', order: 1, sections: [] }],
    folders: [],
    tags: [{ name: 'Reading' }],
    habits: [],
    focus: [],
    settings: { pomoMinutes: 25, shortBreak: 5, longBreak: 15, weekStartsOn: 1, theme: 'light', showCompleted: true },
    tasks: [task('a', 'Write the report', { listId: 'work' }), task('b', 'Read a chapter', { tags: ['Reading'] })],
  }
  // the user's own lists, tags and tasks keep their names: only interface texts must change
  const userTexts = [...data.lists.map((l) => l.name), ...data.tags.map((t) => t.name), ...data.tasks.map((t) => t.title)]
  await page.addInitScript((data) => {
    if (sessionStorage.getItem('i18n-seeded')) return
    sessionStorage.setItem('i18n-seeded', '1')
    localStorage.setItem('tickdone-locale', 'en')
    localStorage.setItem('tickdone:data:v1', JSON.stringify(data))
    localStorage.setItem('tickdone:ui:v1', JSON.stringify({ module: 'tasks', view: 'week' }))
  }, data)
  await page.goto('/')
  await expect(page.locator('.task-row').first()).toBeVisible()
  let current = 'en'
  for (const { code } of [...LOCALES.slice(1), LOCALES[0]]) {
    const from = catalogs[current as keyof typeof catalogs] as Cat
    const to = catalogs[code] as Cat
    await page.locator(`.rail button[aria-label="${from['common.settings']}"]`).click()
    await page.getByRole('combobox', { name: from['misc.settings.language'] as string }).selectOption(code)
    await expect(page.locator('html')).toHaveAttribute('lang', code)
    await page.keyboard.press('Escape')
    current = code
    // the rail, the list header and the quick-add field are in the new language, without a reload
    for (const [, key] of MODULES) await expect(page.locator(`.rail button[aria-label="${to[key]}"]`)).toHaveCount(1)
    await expect(page.locator('#list-title')).toHaveText(to['common.list.next7Days'] as string)
    if (code !== 'en') expect(await leftovers(page, englishOnly(code), userTexts), `${code}: English text after switching`).toEqual([])
  }
})
