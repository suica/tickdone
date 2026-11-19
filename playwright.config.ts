import { defineConfig, devices } from '@playwright/test'

// 本地可用 PW_CHROMIUM_PATH 指定已有的 Chromium；CI 上用 `npx playwright install chromium` 装的。
const chromiumPath = process.env.PW_CHROMIUM_PATH
const port = Number(process.env.E2E_PORT ?? 4730)

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The service worker would serve later requests from its cache and hide them from page.route; e2e/pwa.spec.ts turns it on
    serviceWorkers: 'block',
    launchOptions: chromiumPath ? { executablePath: chromiumPath, args: ['--no-sandbox'] } : {},
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 860 } } },
    { name: 'large', testMatch: /layout\.spec\.ts/, use: { browserName: 'chromium', viewport: { width: 2560, height: 1440 } } },
    { name: 'large-1920', testMatch: /layout\.spec\.ts/, use: { browserName: 'chromium', viewport: { width: 1920, height: 1080 } } },
    // touch tablets, portrait and landscape
    { name: 'tablet', testMatch: /layout\.spec\.ts/, use: { browserName: 'chromium', viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true } },
    { name: 'tablet-1024', testMatch: /layout\.spec\.ts/, use: { browserName: 'chromium', viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true } },
    { name: 'phone', testMatch: /layout\.spec\.ts/, use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'phone-390', testMatch: /layout\.spec\.ts/, use: { ...devices['Pixel 7'], browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'phone-360', testMatch: /layout\.spec\.ts/, use: { ...devices['Pixel 7'], browserName: 'chromium', viewport: { width: 360, height: 740 } } },
  ],
  webServer: {
    command: `npx vite preview --port ${port} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
})
