import { expect, test } from '@playwright/test'

/**
 * Smoke the *built* app, not the dev server.
 *
 * Production differs in ways the dev suite cannot see: Strict Mode's double
 * invocation is gone, bundling and server-component boundaries are real, and
 * `NODE_ENV` gates behave differently. A build that compiles is not the same as
 * a build that runs.
 *
 * Run with:  pnpm build && pnpm e2e:prod
 *
 * `pnpm e2e:prod` sets PROD_URL, which makes playwright.config.ts serve the
 * `.next-prod` build with `next start` instead of spinning up a dev server.
 *
 * Skipped unless PROD_URL is set, so the default suite stays pointed at dev.
 */

const PROD = process.env.PROD_URL

test.skip(!PROD, 'PROD_URL not set — production smoke is opt-in')
test.use({ baseURL: PROD })

test('production: the core creation path works end to end', async ({ page }) => {
  // No /api/dev/reset here on purpose: it is refused in production, and a test
  // must not be the reason a destructive dev endpoint stays reachable.
  await page.goto('/project')
  await expect(page.getByRole('heading', { name: '全部项目' })).toBeVisible()

  await page.getByTestId('start-create').click()
  await page.waitForURL(/\/canvas\?projectId=/)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '图片', exact: true }).click()
  const node = page.locator('[data-node-type="image"]').first()
  await expect(node).toBeVisible()

  // A real generation against the built server: compile, quote, confirm gate,
  // reserve, run, artifact written back.
  await node.dblclick()
  await page.getByTestId('node-prompt').fill('生产构建冒烟：黄昏的海岸线')
  await page.getByTestId('node-prompt').blur()
  await expect(node).toContainText('黄昏的海岸线')

  await page.getByTestId('inspector-run').click()
  await expect(page.getByTestId('confirm-gate')).toBeVisible()
  await page.getByTestId('confirm-generate').click()
  await expect(node.locator('img')).toBeVisible({ timeout: 90_000 })

  // Storyboard projects the same document.
  await page.keyboard.press('Escape')
  await page.getByTestId('view-storyboard').click()
  await expect(page.getByTestId('storyboard-image')).toContainText('图片节点')
})

test('production: the dev reset endpoint stays refused', async ({ request }) => {
  const res = await request.post('/api/dev/reset')
  expect(res.status()).toBe(403)
})
