// Renders public/apple-touch-icon.png (180×180, opaque) from the logo in public/favicon.svg.
// Run: node scripts/icons.mjs   (PW_CHROMIUM_PATH picks an installed Chromium)
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const path = process.env.PW_CHROMIUM_PATH
const browser = await chromium.launch(path ? { executablePath: path, args: ['--no-sandbox'] } : {})
const page = await browser.newPage({ viewport: { width: 180, height: 180 }, colorScheme: 'light' })
await page.setContent(
  `<body style="margin:0;background:#fff;display:grid;place-items:center;width:180px;height:180px">
     <div style="width:132px;height:132px">${svg.replace('<svg ', '<svg width="132" height="132" ')}</div></body>`,
)
await page.screenshot({ path: new URL('../public/apple-touch-icon.png', import.meta.url).pathname })
await browser.close()
