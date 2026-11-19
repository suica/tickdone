#!/usr/bin/env node
// Renders the README banner, docs/hero/hero.<locale>.png, and the screenshot gallery,
// docs/screenshots/<locale>/{desktop,phone}-<screen>.png, from the production build.
//
//   npm run build
//   node scripts/promo/render.mjs                                   all locales, screenshot mode
//   node scripts/promo/render.mjs --locale zh-CN                    one locale
//   node scripts/promo/render.mjs --locale en,de --mode illustration
//
// --locale <code,...|all>  locales to render (default: all, the keys of hero.json)
// --mode screenshot        the device frames show the app captured in that locale; the gallery is written too (default)
// --mode illustration      the frames show a text-free drawing of the layout instead; no gallery
// --url <url>              capture a build that is already running (default: serve dist/ with `vite preview` on
//                          port 4741 while the script runs)
// --no-gallery             the banner only
// --force                  write screenshots even where the interface does not look translated into the locale yet
//
// The app starts with its own demo data. PW_CHROMIUM_PATH uses an installed Chromium, as for `npm run e2e`.
// --mode illustration is kept for locales whose interface is not translated yet.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import { shrinkPng } from './png.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const strings = JSON.parse(readFileSync(join(here, 'hero.json'), 'utf8'))
const LOCALES = Object.keys(strings)
const PORT = 4741

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

// Gallery screens: the UI state the app restores on load (localStorage 'tickdone:ui:v1') and what to do before the shot.
const SCREENS = [
  { name: 'tasks', ui: { module: 'tasks', view: 'week' }, prepare: openRichestTask },
  { name: 'calendar', ui: { module: 'calendar' } },
  { name: 'matrix', ui: { module: 'matrix' } },
  { name: 'focus', ui: { module: 'pomo' } },
  { name: 'habits', ui: { module: 'habit' }, prepare: checkInHabits },
  { name: 'stats', ui: { module: 'stats' }, prepare: fillStats },
]
// Screens shown in the banner's browser and phone frames.
const HERO = { desktop: 'tasks', phone: 'calendar' }

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const mode = option('mode', 'screenshot')
const localeArg = option('locale', 'all')
const locales = localeArg === 'all' ? LOCALES : localeArg.split(',')
const gallery = mode === 'screenshot' && !args.includes('--no-gallery')
const force = args.includes('--force')
if (!['screenshot', 'illustration'].includes(mode)) fail(`--mode must be screenshot or illustration, not "${mode}"`)
for (const l of locales) if (!LOCALES.includes(l)) fail(`unknown locale "${l}"; hero.json has ${LOCALES.join(', ')}`)

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] })
const server = mode === 'screenshot' ? await serve(option('url')) : undefined
const skipped = []
try {
  for (const locale of locales) {
    let shots
    if (mode === 'screenshot') {
      const captured = await captureAll(locale)
      if (looksUntranslated(locale, captured.text) && !force) {
        console.error(`${locale}: skipped, the interface is not translated into ${locale} yet (#14); use --mode illustration, or --force`)
        skipped.push(locale)
        continue
      }
      for (const [file, png] of captured.files) write(file, png)
      if (gallery) console.log(`docs/screenshots/${locale}/  ${captured.files.length} screenshots`)
      shots = captured.hero
    }
    const png = await compose(locale, shots)
    const file = join(root, 'docs/hero', `hero.${locale}.png`)
    write(file, png)
    console.log(`${relative(root, file)}  ${mode}  ${(png.length / 1024).toFixed(0)} KB${png.length > 1024 * 1024 ? '  (over 1 MB)' : ''}`)
  }
} finally {
  await browser.close()
  server?.stop()
}
if (skipped.length) process.exitCode = 1

/** Captures every gallery screen at desktop and phone size, with the banner's two shots and the text on screen. */
async function captureAll(locale) {
  const files = []
  const hero = {}
  let text = ''
  for (const [device, size] of [
    ['desktop', DESKTOP],
    ['phone', PHONE],
  ]) {
    for (const screen of SCREENS) {
      if (!gallery && HERO[device] !== screen.name) continue
      const shot = await capture(locale, size, screen, device === 'phone')
      text += shot.text
      if (HERO[device] === screen.name) hero[device] = shot.png
      if (gallery) files.push([join(root, 'docs/screenshots', locale, `${device}-${screen.name}.png`), shot.png])
    }
  }
  return { files, hero, text }
}

/** Whether the captured text is still the Simplified Chinese interface rather than `locale`. */
function looksUntranslated(locale, text) {
  if (locale === 'zh-CN') return false
  if (locale === 'zh-TW') return /[们务设这时开关选项历览]/u.test(text) // characters only Simplified Chinese uses
  const han = text.match(/\p{Script=Han}/gu)?.length ?? 0
  if (locale === 'ja') return han > 0 && !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)
  return han > 10
}

async function capture(locale, size, screen, phone) {
  // Reduced motion: no screen is caught halfway through an animation.
  const context = await browser.newContext({ ...size, locale, colorScheme: 'light', reducedMotion: 'reduce' })
  await context.addInitScript(
    ([loc, ui]) => {
      if (sessionStorage.getItem('promo')) return
      sessionStorage.setItem('promo', '1')
      localStorage.clear()
      localStorage.setItem('tickdone-locale', loc)
      localStorage.setItem('tickdone:ui:v1', JSON.stringify(ui))
    },
    [locale, screen.ui],
  )
  const page = await context.newPage()
  page.on('pageerror', (e) => console.warn(`[${locale} ${screen.name}] ${e.message}`))
  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  if (screen.prepare) {
    await screen.prepare(page, phone)
    await page.mouse.move(0, 0) // no hover highlight left behind
  }
  await page.waitForTimeout(400)
  const png = await page.screenshot()
  const text = await page.evaluate(() => document.body.innerText)
  await context.close()
  return { png, text }
}

/** Opens the task with the most details (subtasks, then a description) so the detail pane has something to show. */
async function openRichestTask(page, phone) {
  if (phone) return
  const rows = page.locator('.task-row')
  const n = await rows.count()
  if (!n) return
  let pick = 0
  for (const sel of ['.meta-sub', '.meta-ic']) {
    const i = await rows.evaluateAll((els, s) => els.findIndex((el) => el.querySelector(s)), sel)
    if (i >= 0) {
      pick = i
      break
    }
  }
  const box = await rows.nth(pick).boundingBox()
  // Click the row's empty right part: the title itself is an input.
  if (box) await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2)
}

/** Checks in the first two habits for today, so the list shows both states; on desktop, opens the first one's stats. */
async function checkInHabits(page, phone) {
  const checks = page.locator('.habit-check')
  const n = Math.min(2, await checks.count())
  for (let i = 0; i < n; i++) await checks.nth(i).click()
  if (!phone && n) await page.locator('.habit-row-name').first().click()
}

/** Gives the statistics a week of history: completed copies of the demo tasks and focus sessions over the past days. */
async function fillStats(page) {
  // The demo data is written on its first change: check in a habit, which the statistics show too.
  await page.evaluate(() => {
    const ui = JSON.parse(localStorage.getItem('tickdone:ui:v1'))
    localStorage.setItem('tickdone:ui:v1', JSON.stringify({ ...ui, module: 'habit' }))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.habit-check').first().click()
  await page.waitForFunction(() => localStorage.getItem('tickdone:data:v1'))
  await page.evaluate(() => {
    const key = 'tickdone:data:v1'
    const d = JSON.parse(localStorage.getItem(key))
    const day = 86400000
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const dow = (start.getDay() + 6) % 7 // days since Monday
    const open = d.tasks.filter((t) => t.status === 0 && !t.parentId)
    const perDay = [3, 5, 2, 4, 6, 3, 4]
    let n = 0
    for (let i = 0; i <= dow; i++) {
      const base = start.getTime() - (dow - i) * day
      for (let k = 0; k < perDay[i]; k++) {
        const src = open[n++ % open.length]
        d.tasks.push({ ...src, id: `promo-${i}-${k}`, status: 2, completedAt: base + (9 + k * 2) * 3600000 })
      }
      for (let k = 0; k < 2 + (i % 3); k++) {
        const s0 = base + (9 + k * 3) * 3600000
        d.focus.push({ id: `promo-f-${i}-${k}`, start: s0, end: s0 + 25 * 60000, mode: 'pomo', taskId: open[k % open.length]?.id })
      }
    }
    localStorage.setItem(key, JSON.stringify(d))
    const ui = JSON.parse(localStorage.getItem('tickdone:ui:v1'))
    localStorage.setItem('tickdone:ui:v1', JSON.stringify({ ...ui, module: 'stats' }))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
}

/** Fills the banner template and renders it at 2x. */
async function compose(locale, shots) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 2 })
  await page.goto(pathToFileURL(join(here, 'hero.html')).href)
  const dataUrl = (png) => png && `data:image/png;base64,${png.toString('base64')}`
  await page.evaluate((cfg) => window.renderHero(cfg), {
    locale,
    mode,
    strings: strings[locale],
    shots: shots && { desktop: dataUrl(shots.desktop), phone: dataUrl(shots.phone) },
  })
  const png = await page.locator('#hero').screenshot()
  await page.close()
  return shrinkPng(png, { lsb: true })
}

/** Serves dist/ with vite preview unless a URL is given; checks that a server already on the port serves this build. */
async function serve(url) {
  if (url) return { url, stop() {} }
  url = `http://127.0.0.1:${PORT}/`
  const index = join(root, 'dist/index.html')
  if (!existsSync(index)) fail('dist/ is missing: run `npm run build` first')
  const built = readFileSync(index, 'utf8')
  const served = async () => {
    try {
      const res = await fetch(url)
      return res.ok ? await res.text() : undefined
    } catch {
      return undefined
    }
  }
  const already = await served()
  if (already !== undefined) {
    if (already !== built) fail(`port ${PORT} serves a different build: stop that server or pass --url`)
    return { url, stop() {} }
  }
  const vite = join(root, 'node_modules/vite/bin/vite.js')
  const child = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' })
  for (let i = 0; i < 100 && (await served()) === undefined; i++) await new Promise((r) => setTimeout(r, 100))
  if ((await served()) !== built) {
    child.kill()
    fail(`vite preview did not come up on port ${PORT}`)
  }
  return { url, stop: () => child.kill() }
}

function write(file, data) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, data)
}

function fail(message) {
  console.error(`render.mjs: ${message}`)
  process.exit(1)
}
