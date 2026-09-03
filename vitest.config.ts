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
    // Route/store integration tests share the one file-backed `.data` state.
    // Running files in parallel lets one file reset the active scenario while
    // another is asserting it, which is not a valid application concurrency
    // model (route writes are serialized inside one server process).
    fileParallelism: false,
    // `e2e/` belongs to Playwright; picking those specs up here would start a
    // browser runner inside the unit test process.
    include: ['src/**/*.test.ts'],
  },
})
