import { expect, test, type Page } from '@playwright/test'

const MODULES = ['日历', '四象限', '番茄专注', '习惯打卡']

/** 伸出视口、又没被视口内的滚动/裁剪容器包住的元素（关闭状态的抽屉/面板用 inert 或 aria-hidden 跳过） */
async function offenders(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const out: string[] = []
    if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`)
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[aria-hidden="true"],[inert]')) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.opacity === '0') continue
      if (r.right <= vw + 1 && r.left >= -1) continue
      let p = el.parentElement
      let clipped = false
      while (p && p !== document.body) {
        if (getComputedStyle(p).overflowX !== 'visible') {
          const pr = p.getBoundingClientRect()
          if (pr.right <= vw + 1 && pr.left >= -1) {
            clipped = true
            break
          }
        }
        p = p.parentElement
      }
      if (!clipped) out.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className)} [${Math.round(r.left)}, ${Math.round(r.right)}]`)
    }
    return out.slice(0, 10)
  })
}

async function openModule(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).first().click()
  await page.waitForTimeout(300)
}

test('任务模块没有元素伸出视口', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.task-row').first()).toBeVisible()
  expect(await offenders(page)).toEqual([])
})

for (const name of MODULES) {
  test(`${name}没有元素伸出视口`, async ({ page }) => {
    await page.goto('/')
    await openModule(page, name)
    expect(await offenders(page)).toEqual([])
  })
}
