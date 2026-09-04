import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Desktop visual contracts for the authenticated discovery and project surfaces.
 *
 * These tests require a caller-supplied disposable server because scenario
 * switching persists fixture state. This prevents a baseline run from changing
 * the developer preview on :3200 or its local .data directory.
 */
const REGRESSION_BASE_URL = process.env.REGRESSION_BASE_URL

test.skip(!REGRESSION_BASE_URL, '需要 REGRESSION_BASE_URL 指向隔离本地服务')

test.use({
  baseURL: REGRESSION_BASE_URL ?? 'http://127.0.0.1:PORT',
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  deviceScaleFactor: 1,
})

async function selectScenario(request: APIRequestContext, scenarioId: 'authenticated-empty' | 'authenticated-populated') {
  const response = await request.post('/api/dev/scenario', { data: { scenarioId } })
  expect(response.ok()).toBe(true)
}

async function clearShellPreference(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.removeItem('libtv.sidebar.collapsed')
  })
}

async function waitForStableVisuals(page: Page) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      Array.from(document.images).map((image) =>
        image.complete ? Promise.resolve() : new Promise<void>((resolve) => image.addEventListener('load', () => resolve(), { once: true })),
      ),
    )
  })
}

async function expectVisualBaseline(page: Page, name: string) {
  await waitForStableVisuals(page)
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.0001,
  })
}

test.describe('首页与项目页桌面视觉基线（隔离本地服务）', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page, request }) => {
    expect(REGRESSION_BASE_URL, '请使用 REGRESSION_BASE_URL 指向临时端口').toBeTruthy()
    await selectScenario(request, 'authenticated-populated')
    await clearShellPreference(page)
  })

  test.afterEach(async ({ request }) => {
    await selectScenario(request, 'authenticated-empty')
  })

  test('首页保持已登录创作发现层级的 1440×900 基线', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('libtv-promo-strip')).toBeVisible()
    await expect(page.getByTestId('home-campaign-image')).toBeVisible()
    await expect(page.getByTestId('creator-tool')).toHaveCount(6)
    await expect(page.getByTestId('home-recent-project')).toHaveCount(3)
    await expect(page.getByTestId('home-composer')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'TV Show' })).toBeVisible()
    await expectVisualBaseline(page, 'home-authenticated-dark-1440x900.png')
  })

  test('项目页保持四卡管理视图的 1440×900 基线', async ({ page }) => {
    await page.goto('/project')
    await expect(page.getByTestId('project-toolbar')).toBeVisible()
    await expect(page.getByTestId('project-grid-item')).toHaveCount(4)
    await expect(page.getByTestId('project-grid-item').first()).toBeVisible()
    await expect(page.getByRole('button', { name: '新建文件夹', exact: true })).toBeEnabled()
    await expectVisualBaseline(page, 'project-authenticated-dark-1440x900.png')
  })
})
