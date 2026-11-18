// Renders the app icons in public/ from the logo in public/favicon.svg:
//   apple-touch-icon.png   180×180, opaque white, for iOS home screens
//   icon-192.png, icon-512.png   the logo on a transparent background (manifest, purpose "any")
//   icon-maskable-512.png  the logo inside the maskable safe zone on a full white square (purpose "maskable")
// Run: node scripts/icons.mjs   (PW_CHROMIUM_PATH picks an installed Chromium)
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const ICONS = [
  // size: canvas; logo: size of the logo on it; bg: background (null = transparent)
  { file: 'apple-touch-icon.png', size: 180, logo: 132, bg: '#fff' },
  { file: 'icon-192.png', size: 192, logo: 192, bg: null },
  { file: 'icon-512.png', size: 512, logo: 512, bg: null },
  // Maskable icons may be cropped to a circle of 80% of their size; the logo's ring stays inside it
  { file: 'icon-maskable-512.png', size: 512, logo: 340, bg: '#fff' },
]

const path = process.env.PW_CHROMIUM_PATH
const browser = await chromium.launch(path ? { executablePath: path, args: ['--no-sandbox'] } : {})
for (const { file, size, logo, bg } of ICONS) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, colorScheme: 'light' })
  await page.setContent(
    `<body style="margin:0;background:${bg ?? 'transparent'};display:grid;place-items:center;width:${size}px;height:${size}px">
       <div style="width:${logo}px;height:${logo}px">${svg.replace('<svg ', `<svg width="${logo}" height="${logo}" `)}</div></body>`,
  )
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: !bg })
  await page.close()
  console.log(file)
}
await browser.close()
