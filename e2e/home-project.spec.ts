import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

async function selectPopulatedScenario(request: APIRequestContext) {
  const selected = await request.post('/api/dev/scenario', {
    data: { scenarioId: 'authenticated-populated' },
  })
  expect(selected.ok()).toBe(true)
}

async function clearShellPreference(page: Page) {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem('libtv.shell.test.initialized') !== 'true') {
      window.localStorage.removeItem('libtv.sidebar.collapsed')
      window.sessionStorage.setItem('libtv.shell.test.initialized', 'true')
    }
  })
}

test.beforeEach(async ({ page, request }) => {
  await selectPopulatedScenario(request)
  await clearShellPreference(page)
})

test.afterEach(async ({ request }) => {
  await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-empty' } })
})

test('authenticated shell collapses, reflows and persists with keyboard control', async ({ page }) => {
  await page.goto('/')

  const promo = page.getByTestId('libtv-promo-strip')
  const sidebar = page.getByTestId('libtv-sidebar')
  const content = page.getByTestId('libtv-shell-content')
  await expect(promo).toBeVisible()
  await expect(page.getByRole('link', { name: '首页', exact: true })).toHaveAttribute('aria-current', 'page')

  const expandedSidebar = await sidebar.boundingBox()
  const expandedContent = await content.boundingBox()
  expect(expandedSidebar?.width).toBeGreaterThanOrEqual(228)
  expect(expandedSidebar?.width).toBeLessThanOrEqual(236)

  const collapse = page.getByRole('button', { name: '收起侧边栏' })
  await collapse.focus()
  await expect(collapse).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('button', { name: '展开侧边栏' })).toBeVisible()
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBeLessThanOrEqual(70)
  const collapsedContent = await content.boundingBox()
  expect(collapsedContent?.x).toBeLessThan(expandedContent?.x ?? Number.POSITIVE_INFINITY)

  await page.reload()
  await expect(page.getByRole('button', { name: '展开侧边栏' })).toBeVisible()
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBeLessThanOrEqual(70)
})

test('project route keeps the same shell and highlights 项目', async ({ page }) => {
  await page.goto('/project')

  await expect(page.getByTestId('libtv-account-rail')).toContainText('Blender 插件')
  await expect(page.getByTestId('libtv-account-rail')).toContainText('积分超市')
  await expect(page.getByRole('link', { name: '项目', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: '首页', exact: true })).not.toHaveAttribute('aria-current', 'page')
})
