import { defineConfig, devices } from '@playwright/test'

const PROD_URL = process.env.PROD_URL

/**
 * The production suite must be served by `next start`, not by a dev server.
 *
 * Starting `pnpm dev` for a PROD_URL run is worse than merely wasteful: dev and
 * the build used to share `.next`, so the dev server would rewrite the very
 * artifacts the server under test was serving from. `next.config.ts` now keeps
 * the production build in `.next-prod`, and this branch keeps the dev server
 * from being started at all.
 */
const webServer = PROD_URL
  ? {
      command: `NEXT_DIST_DIR=.next-prod pnpm exec next start -p ${new URL(PROD_URL).port || '3000'}`,
      url: PROD_URL,
      reuseExistingServer: true,
      timeout: 120_000,
    }
  : {
      command: 'pnpm dev',
      url: 'http://localhost:3200',
      reuseExistingServer: true,
      timeout: 120_000,
    }

/**
 * The desktop baseline is 1440x900 — the same viewport the research
 * screenshots were captured at, so layout comparisons stay meaningful.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    // Spread first: the device preset carries its own viewport/scale factor.
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:3200',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    trace: 'retain-on-failure',
  },
  webServer,
})
