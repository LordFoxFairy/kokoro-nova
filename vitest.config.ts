import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // `e2e/` belongs to Playwright; picking those specs up here would start a
    // browser runner inside the unit test process.
    include: ['src/**/*.test.ts'],
  },
})
