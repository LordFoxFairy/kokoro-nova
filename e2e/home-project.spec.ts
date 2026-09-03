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

test('home reproduces the campaign, creation, recent, Agent and TV Show hierarchy', async ({ page }) => {
  await page.goto('/')

  const campaign = page.getByTestId('home-campaign-image')
  await expect(campaign).toBeVisible()
  await expect(campaign).toHaveAttribute('src', '/fixtures/libtv/home/theatre-banner.webp')
  await expect(page.getByTestId('home-blank-canvas')).toBeVisible()
  await expect(page.getByTestId('creator-tool')).toHaveCount(6)
  await expect(page.getByTestId('home-recent-project')).toHaveCount(3)

  await expect(page.getByTestId('home-composer')).toHaveAttribute('placeholder', /说出你的创意/)
  await expect(page.getByTestId('home-agent-send')).toBeDisabled()
  await expect(page.getByTestId('home-skill-chip')).toHaveCount(3)

  await expect(page.getByRole('heading', { name: 'TV Show' })).toBeVisible()
  await expect(page.getByRole('button', { name: '全部', exact: true })).toBeVisible()
  await expect(page.getByTestId('home-showcase-card')).toHaveCount(6)
  const coverUrls = await page
    .getByTestId('home-showcase-card')
    .locator('img')
    .evaluateAll((images) => images.map((image) => image.getAttribute('src')))
  expect(coverUrls.every((url) => url?.startsWith('/fixtures/libtv/showcase/'))).toBe(true)

  await page.screenshot({ path: 'docs/screenshots/libtv-home-local-1440x900.png', scale: 'css' })

  await page.getByRole('button', { name: '专业影视', exact: true }).click()
  await expect(page.getByTestId('home-showcase-card')).toHaveCount(2)
  await page.getByRole('textbox', { name: '搜索 TV Show' }).fill('尘骸')
  await expect(page.getByTestId('home-showcase-card')).toHaveCount(1)
  await page.getByRole('textbox', { name: '搜索 TV Show' }).fill('')
  await page.getByRole('button', { name: '全部', exact: true }).click()
  await expect(page.getByRole('button', { name: '查看创作过程' })).toHaveCount(6)
})

test('home Agent composer selects context and creates only from a valid draft', async ({ page }) => {
  await page.goto('/')

  const skill = page.getByTestId('home-skill-chip').first()
  await skill.click()
  await expect(skill).toHaveAttribute('data-selected', 'true')
  await expect(page).toHaveURL('/')

  await page.getByTestId('home-composer').fill('一支雨夜城市的电影感短片')
  await expect(page.getByTestId('home-agent-send')).toBeEnabled()
  await page.getByTestId('home-agent-send').click()
  await page.waitForURL(/\/canvas\?.*brief=/)
  expect(new URL(page.url()).searchParams.get('brief')).toContain('一支雨夜城市的电影感短片')
})

test('home creator tool carries deterministic intent into the new canvas brief', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('creator-tool').filter({ hasText: 'Seedance 2.5' }).click()
  await page.waitForURL(/\/canvas\?.*brief=/)

  expect(new URL(page.url()).searchParams.get('brief')).toContain('[video-model] Seedance 2.5')
})
