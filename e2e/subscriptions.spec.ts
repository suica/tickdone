import { expect, test, type Page } from '@playwright/test'
import { day, open } from './calHelpers'

// Calendar subscriptions: a feed served by the test, subscribed to in Settings, shown read-only in the
// calendar. The UI runs in zh-CN (playwright.config.ts).

const FEED_URL = 'https://calendar.example.test/team.ics'

// Folded lines, an escaped comma, a time zone, a weekly rule with an exception, an all-day and a
// multi-day event, and an event in UTC.
const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Example//Team//EN',
  'X-WR-CALNAME:Team calendar',
  'BEGIN:VEVENT',
  'UID:standup@example.test',
  'DTSTART;TZID=Asia/Shanghai:20261102T090000',
  'DTEND;TZID=Asia/Shanghai:20261102T091500',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR',
  'EXDATE;TZID=Asia/Shanghai:20261120T090000',
  'SUMMARY:Team standup',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:crit@example.test',
  'DTSTART:20261118T060000Z',
  'DTEND:20261118T073000Z',
  'SUMMARY:Design critique\\, round 2',
  'LOCATION:Room 4',
  'DESCRIPTION:Bring sketches for the new onboard',
  ' ing flow.',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:holiday@example.test',
  'DTSTART;VALUE=DATE:20261119',
  'DTEND;VALUE=DATE:20261120',
  'SUMMARY:Company holiday',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:offsite@example.test',
  'DTSTART;VALUE=DATE:20261124',
  'DTEND;VALUE=DATE:20261127',
  'SUMMARY:Offsite',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n')

/** Serves the feed straight from its address (as on the dev server, where /api/ics does not exist). */
async function serveFeed(page: Page) {
  await page.route(FEED_URL, (route) => route.fulfill({ status: 200, body: FEED, headers: { 'Content-Type': 'text/calendar', 'Access-Control-Allow-Origin': '*' } }))
}

async function subscribe(page: Page, url = FEED_URL) {
  await page.locator('[title="设置"], [aria-label="设置"]').first().click()
  await page.locator('.dlg-set-tab', { hasText: '订阅日历' }).click()
  await page.getByRole('textbox', { name: '日历地址（iCal）' }).fill(url)
  await page.getByRole('button', { name: '订阅', exact: true }).click()
}

/** The stored subscriptions (the app saves shortly after each change). */
const subs = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('tickdone:data:v1') ?? '{}').subscriptions as { url: string }[] | undefined)

const ev = (page: Page, where: string, title: string) => page.locator(`${where} .cal-event`, { hasText: title })

test('subscribe by address: events show in the month and week views, read-only, with details', async ({ page }) => {
  await serveFeed(page)
  await open(page, 'calendar', 'month')
  await subscribe(page, 'webcal://calendar.example.test/team.ics')
  // webcal:// is stored as https://; the feed names itself
  const item = page.locator('.feed-item')
  await expect(item.locator('.feed-name')).toHaveAttribute('placeholder', 'Team calendar')
  await expect(item.locator('.feed-status')).toContainText('更新于')
  await expect.poll(() => subs(page)).toHaveLength(1)
  expect((await subs(page))[0].url).toBe(FEED_URL)
  await page.keyboard.press('Escape')

  // month: the weekly event on Mon/Wed/Fri except the excluded Friday, the all-day and multi-day events
  await expect(ev(page, `.cal-cell[data-day="${day(0)}"]`, 'Team standup')).toBeVisible()
  await expect(ev(page, `.cal-cell[data-day="${day(-2)}"]`, 'Team standup')).toBeVisible()
  await expect(ev(page, `.cal-cell[data-day="${day(2)}"]`, 'Team standup')).toHaveCount(0)
  await expect(ev(page, `.cal-cell[data-day="${day(5)}"]`, 'Team standup')).toBeVisible()
  await expect(ev(page, `.cal-cell[data-day="${day(1)}"]`, 'Company holiday')).toBeVisible()
  for (const d of [6, 7, 8]) await expect(ev(page, `.cal-cell[data-day="${day(d)}"]`, 'Offsite')).toBeVisible()
  await expect(ev(page, `.cal-cell[data-day="${day(9)}"]`, 'Offsite')).toHaveCount(0)
  // read-only: no checkbox
  await expect(page.locator('.cal-event .cal-cb')).toHaveCount(0)

  // clicking an event shows its details and adds no task
  const tasksBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('tickdone:data:v1')!).tasks.length)
  await ev(page, `.cal-cell[data-day="${day(0)}"]`, 'Design critique, round 2').click()
  const pop = page.locator('.cal-ev-pop')
  await expect(pop).toContainText('Design critique, round 2')
  await expect(pop).toContainText('Room 4')
  await expect(pop).toContainText('Bring sketches for the new onboarding flow.')
  await expect(pop).toContainText('Team calendar')
  await expect(pop).toContainText('14:00')
  await page.keyboard.press('Escape')
  await expect(pop).toHaveCount(0)
  await expect(page.locator('.cal-add-pop')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tickdone:data:v1')!).tasks.length)).toBe(tasksBefore)

  // week: timed events are blocks in the grid at their local time, all-day events in the all-day row
  await page.locator('.cal-view-btn').click()
  await page.locator('.cal-view-menu .menu-item', { hasText: '周' }).click()
  const crit = page.locator(`.cal-col[data-day="${day(0)}"] .cal-event`, { hasText: 'Design critique' })
  await expect(crit).toBeVisible()
  await expect(crit).toContainText('14:00')
  await expect(page.locator(`.cal-col[data-day="${day(0)}"] .cal-event`, { hasText: 'Team standup' })).toBeVisible()
  const holiday = page.locator(`.cal-allday-cell[data-day="${day(1)}"] .cal-event`, { hasText: 'Company holiday' })
  await expect(holiday).toBeVisible()
  await expect(page.locator(`.cal-col .cal-event`, { hasText: 'Company holiday' })).toHaveCount(0)

  // events can't be dragged: a drag on a block leaves it where it is and creates nothing
  const b = (await crit.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + 6)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + 120, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('.cal-preview, .cal-draft, .cal-add-pop')).toHaveCount(0)
  expect((await crit.boundingBox())!.y).toBeCloseTo(b.y, 0)
})

test('hide, rename, recolour and unsubscribe (with undo)', async ({ page }) => {
  await serveFeed(page)
  await open(page, 'calendar', 'month')
  await subscribe(page)
  const item = page.locator('.feed-item')
  await expect(item.locator('.feed-status')).toContainText('更新于')

  await item.locator('.feed-name').fill('Work')
  await item.locator('.feed-name').press('Enter')
  await item.locator('.feed-swatch').click()
  await item.locator('.dlg-color[title="#6E75F4"]').click()
  await page.keyboard.press('Escape')
  const standup = ev(page, `.cal-cell[data-day="${day(0)}"]`, 'Team standup')
  await expect(standup).toBeVisible()
  await expect(standup).toHaveAttribute('title', /Work/)
  await expect(standup).toHaveCSS('--c', '#6E75F4')

  // hide
  await page.locator('[title="设置"], [aria-label="设置"]').first().click()
  await page.locator('.dlg-set-tab', { hasText: '订阅日历' }).click()
  await page.getByRole('switch', { name: '在日历中显示' }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.cal-event')).toHaveCount(0)

  // show again: the cached copy comes back at once
  await page.locator('[title="设置"], [aria-label="设置"]').first().click()
  await page.locator('.dlg-set-tab', { hasText: '订阅日历' }).click()
  await page.getByRole('switch', { name: '在日历中显示' }).click()
  await page.keyboard.press('Escape')
  await expect(standup).toBeVisible()

  // the last good copy survives a reload without the network
  await page.unroute(FEED_URL)
  await page.route(FEED_URL, (route) => route.abort())
  await page.reload()
  await expect(standup).toBeVisible()

  // unsubscribe, undo, unsubscribe
  await page.locator('[title="设置"], [aria-label="设置"]').first().click()
  await page.locator('.dlg-set-tab', { hasText: '订阅日历' }).click()
  // read just now, so opening did not read it again; a manual refresh fails and keeps the copy
  await expect(page.locator('.feed-item .feed-status')).toContainText('更新于')
  await page.getByRole('button', { name: '立即刷新' }).click()
  await expect(page.locator('.feed-item .feed-status')).toContainText('无法访问这个地址')
  await page.getByRole('button', { name: '取消订阅' }).click()
  await expect(page.locator('.feed-item')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('.cal-event')).toHaveCount(0)
  await page.locator('.toast').getByRole('button', { name: '撤销' }).click()
  await expect(standup).toBeVisible()
  await page.locator('[title="设置"], [aria-label="设置"]').first().click()
  await page.locator('.dlg-set-tab', { hasText: '订阅日历' }).click()
  await page.getByRole('button', { name: '取消订阅' }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.cal-event')).toHaveCount(0)
  await expect.poll(() => subs(page)).toEqual([])
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tickdone:feeds:v1') ?? '{}'))).toEqual({})
})

test('goes through the same-origin proxy when the site has one, and checks the address first', async ({ page }) => {
  const asked: string[] = []
  await page.route('**/api/ics?**', (route) => {
    asked.push(new URL(route.request().url()).searchParams.get('url')!)
    return route.fulfill({ status: 200, body: FEED, headers: { 'Content-Type': 'text/calendar', 'X-Ics-Proxy': '1' } })
  })
  await open(page, 'calendar', 'month')
  await page.locator('[title="设置"], [aria-label="设置"]').first().click()
  await page.locator('.dlg-set-tab', { hasText: '订阅日历' }).click()
  const input = page.getByRole('textbox', { name: '日历地址（iCal）' })
  await input.fill('ftp://example.test/cal.ics')
  await page.getByRole('button', { name: '订阅', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('https://')
  await expect(page.locator('.feed-item')).toHaveCount(0)
  await input.fill('https://cal.example.test/private.ics?token=abc')
  await page.getByRole('button', { name: '订阅', exact: true }).click()
  await expect(page.locator('.feed-item .feed-status')).toContainText('更新于')
  expect(asked).toEqual(['https://cal.example.test/private.ics?token=abc'])
  await page.keyboard.press('Escape')
  await expect(ev(page, `.cal-cell[data-day="${day(0)}"]`, 'Team standup')).toBeVisible()
})
