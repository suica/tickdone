import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // test/ holds tests that read repository files with Node APIs (not part of the app's type check)
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
  },
})
