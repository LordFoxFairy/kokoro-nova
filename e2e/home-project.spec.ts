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
  expect(expandedSidebar?.x).toBeGreaterThanOrEqual(7)
  expect(expandedSidebar?.x).toBeLessThanOrEqual(9)
  expect(expandedSidebar?.width).toBeGreaterThanOrEqual(230)
  expect(expandedSidebar?.width).toBeLessThanOrEqual(234)
  expect(expandedContent?.x).toBeGreaterThanOrEqual(238)
  expect(expandedContent?.x).toBeLessThanOrEqual(242)

  const collapse = page.getByRole('button', { name: '收起侧边栏' })
  await collapse.focus()
  await expect(collapse).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('button', { name: '展开侧边栏' })).toBeVisible()
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBeLessThanOrEqual(70)
  const collapsedContent = await content.boundingBox()
  expect(collapsedContent?.x).toBeGreaterThanOrEqual(66)
  expect(collapsedContent?.x).toBeLessThanOrEqual(70)

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

test('project manager matches the four-card desktop layout and local interactions', async ({ page }) => {
  await page.goto('/project')

  const toolbar = page.getByTestId('project-toolbar')
  await expect(toolbar).toBeVisible()
  expect(await toolbar.locator('[data-toolbar-item]').evaluateAll((items) => items.map((item) => item.getAttribute('data-toolbar-item')))).toEqual([
    'back',
    'title',
    'search',
    'recycle-bin',
    'new-folder',
  ])

  await expect(page.getByTestId('project-grid-item')).toHaveCount(4)
  await expect(page.locator('[data-testid^="project-card-"]')).toHaveCount(3)
  const firstCard = await page.getByTestId('project-grid-item').first().boundingBox()
  expect(firstCard?.x).toBeGreaterThanOrEqual(276)
  expect(firstCard?.x).toBeLessThanOrEqual(284)
  expect(firstCard?.width).toBeGreaterThanOrEqual(210)
  expect(firstCard?.width).toBeLessThanOrEqual(214)
  expect(firstCard?.y).toBeGreaterThanOrEqual(178)
  expect(firstCard?.y).toBeLessThanOrEqual(194)
  await page.screenshot({ path: 'docs/screenshots/libtv-project-local-1440x900.png', scale: 'css' })

  await page.getByRole('button', { name: '收起侧边栏' }).click()
  await expect.poll(async () => (await page.getByTestId('project-grid-item').first().boundingBox())?.x).toBeLessThanOrEqual(110)
  const collapsedFirstCard = await page.getByTestId('project-grid-item').first().boundingBox()
  expect(collapsedFirstCard?.x).toBeGreaterThanOrEqual(106)
  expect(collapsedFirstCard?.x).toBeLessThanOrEqual(110)
  expect(collapsedFirstCard?.width).toBeGreaterThanOrEqual(244)
  expect(collapsedFirstCard?.width).toBeLessThanOrEqual(252)
  await page.screenshot({ path: 'docs/screenshots/libtv-project-collapsed-local-1440x900.png', scale: 'css' })
  await page.getByRole('button', { name: '展开侧边栏' }).click()
  await expect.poll(async () => (await page.getByTestId('project-grid-item').first().boundingBox())?.x).toBeGreaterThanOrEqual(276)

  const search = page.getByRole('searchbox', { name: '搜索项目' })
  await search.fill('Doro')
  await expect(page.locator('[data-testid^="project-card-"]')).toHaveCount(1)
  await expect(page.getByText('咕嘎Doro', { exact: true })).toBeVisible()
  await search.fill('')

  await page.getByRole('button', { name: '回收站' }).click()
  const recycleBin = page.getByTestId('recycle-bin-dialog')
  await expect(recycleBin).toContainText('回收站为空')
  await recycleBin.getByRole('button', { name: '关闭' }).last().click()

  await page.getByTestId('new-folder').click()
  await expect(page.getByText('未命名文件夹', { exact: true })).toBeVisible()
  await page.locator('[data-testid^="folder-more-"]').first().click()
  await expect(page.getByRole('menuitem', { name: '删除文件夹' })).toBeVisible()
  await page.keyboard.press('Escape')

  const projectMore = page.locator('[data-testid^="project-more-"]').first()
  await projectMore.click()
  await expect(page.getByRole('menuitem', { name: '重命名' })).toBeVisible()
  await page.getByRole('menuitem', { name: '重命名' }).click()
  const rename = page.getByTestId('project-rename-input')
  await rename.fill('项目重命名验证')
  await rename.press('Enter')
  await expect(page.getByText('项目重命名验证', { exact: true })).toBeVisible()

  await page.locator('[data-testid^="project-more-"]').first().click()
  await page.getByRole('menuitem', { name: '删除项目' }).click()
  await expect(page.getByTestId('confirm-dialog')).toContainText('项目重命名验证')
  await page.getByTestId('confirm-dialog').getByRole('button', { name: '取消' }).click()
})

test('home reproduces the campaign, creation, recent, Agent and TV Show hierarchy', async ({ page }) => {
  await page.goto('/')

  const campaign = page.getByTestId('home-campaign-image')
  await expect(campaign).toBeVisible()
  await expect(campaign).toHaveAttribute('src', '/fixtures/libtv/home/theatre-banner.webp')
  const campaignBox = await campaign.boundingBox()
  expect(campaignBox?.x).toBeGreaterThanOrEqual(276)
  expect(campaignBox?.x).toBeLessThanOrEqual(284)
  expect(campaignBox?.y).toBeGreaterThanOrEqual(110)
  expect(campaignBox?.y).toBeLessThanOrEqual(118)
  expect(campaignBox?.width).toBeGreaterThanOrEqual(1116)
  expect(campaignBox?.width).toBeLessThanOrEqual(1124)
  expect(campaignBox?.height).toBeGreaterThanOrEqual(136)
  expect(campaignBox?.height).toBeLessThanOrEqual(144)
  await expect(page.getByTestId('home-blank-canvas')).toBeVisible()
  await expect(page.getByTestId('creator-tool')).toHaveCount(6)
  const creatorGridBox = await page.getByTestId('creator-tool-grid').boundingBox()
  expect(creatorGridBox?.y).toBeGreaterThanOrEqual(270)
  expect(creatorGridBox?.y).toBeLessThanOrEqual(286)
  expect(creatorGridBox?.height).toBeGreaterThanOrEqual(198)
  expect(creatorGridBox?.height).toBeLessThanOrEqual(202)
  await expect(page.getByTestId('home-recent-project')).toHaveCount(3)

  await expect(page.getByTestId('home-composer')).toHaveAttribute('placeholder', /说出你的创意/)
  await expect(page.getByTestId('home-agent-send')).toBeDisabled()
  await expect(page.getByTestId('home-skill-chip')).toHaveCount(3)

  await expect(page.getByRole('heading', { name: 'TV Show' })).toBeVisible()
  await expect(page.getByRole('button', { name: '全部', exact: true })).toBeVisible()
  await expect(page.getByTestId('home-showcase-card')).toHaveCount(7)
  const coverUrls = await page
    .getByTestId('home-showcase-card')
    .locator('img')
    .evaluateAll((images) => images.map((image) => image.getAttribute('src')))
  expect(coverUrls.every((url) => url?.startsWith('/fixtures/libtv/'))).toBe(true)

  await page.screenshot({ path: 'docs/screenshots/libtv-home-local-1440x900.png', scale: 'css' })

  await page.getByRole('button', { name: '专业影视', exact: true }).click()
  await expect(page.getByTestId('home-showcase-card')).toHaveCount(3)
  await page.getByRole('textbox', { name: '搜索 TV Show' }).fill('尘骸')
  await expect(page.getByTestId('home-showcase-card')).toHaveCount(3)
  await page.getByTestId('tv-show-submit-search').click()
  await expect(page.getByTestId('home-showcase-card')).toHaveCount(1)
  await expect(page.getByTestId('tv-show-category-rail')).toHaveCount(0)
  await page.getByRole('textbox', { name: '搜索 TV Show' }).fill('不存在')
  await page.getByTestId('tv-show-submit-search').click()
  await expect(page.getByTestId('home-showcase-card')).toHaveCount(7)
  await expect(page.getByTestId('tv-show-search-feedback')).toContainText('已为你推荐')
  await page.getByTestId('tv-show-clear-search').click()
  await expect(page.getByTestId('tv-show-category-rail')).toBeVisible()
  await page.getByRole('button', { name: '全部', exact: true }).click()
  await expect(page.getByRole('button', { name: '查看创作过程' })).toHaveCount(7)
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

test('home Agent composer keeps context controls local, accessible and keyboard dismissible', async ({ page }) => {
  await page.goto('/')

  const composer = page.getByTestId('home-composer')
  await composer.focus()
  await expect(page.getByTestId('home-agent-composer')).toHaveAttribute('data-state', 'expanded')
  await expect(page.getByTestId('home-agent-send')).toBeDisabled()
  await page.screenshot({ path: 'docs/screenshots/libtv-home-composer-expanded-1440x900.png', scale: 'css' })

  await page.getByTestId('home-attachment-trigger').click()
  await expect(page.getByTestId('home-attachment-menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('home-attachment-menu')).toHaveCount(0)

  await page.getByTestId('home-attachment-trigger').click()
  await page.getByTestId('home-asset-library').click()
  await expect(page.getByTestId('home-asset-library-dialog')).toBeVisible()
  await expect(page.getByTestId('home-asset-empty').or(page.getByTestId('home-asset-list'))).toBeVisible()
  await page.getByTestId('home-asset-library-dialog').getByRole('button', { name: '关闭' }).last().click()

  await page.getByTestId('home-model-trigger').click()
  await expect(page.getByTestId('home-model-menu')).toBeVisible()
  await expect(page.getByTestId('home-model-list')).toBeVisible()
  await page.getByTestId('home-model-tab-video').click()
  await expect(page.getByTestId('home-model-option').first()).toBeVisible()
  await page.getByTestId('home-model-option').first().click()
  await expect(page.getByTestId('home-model-trigger')).toContainText('Seedance')

  await page.getByTestId('home-skill-trigger').click()
  await expect(page.getByTestId('home-skill-menu')).toBeVisible()
  await expect(page.getByTestId('home-skill-list')).toBeVisible()
  await page.getByTestId('home-skill-collection-收藏').click()
  await expect(page.getByTestId('home-skill-empty')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByTestId('home-mode-trigger').click()
  await expect(page.getByTestId('home-mode-menu')).toBeVisible()
  await page.getByTestId('home-mode-option-auto').click()
  await expect(page.getByTestId('home-composer-state')).toContainText('自动模式')

  await composer.fill('一支雨夜城市的电影感短片')
  await expect(page.getByTestId('home-agent-send')).toBeEnabled()
  await composer.press('Enter')
  await page.waitForURL(/\/canvas\?.*brief=/)
  const brief = new URL(page.url()).searchParams.get('brief') ?? ''
  expect(brief).toContain('模型：')
  expect(brief).toContain('生成模式：自动')
})

test('anonymous home keeps discovery visible and gates private Agent context actions', async ({ page, request }) => {
  const selected = await request.post('/api/dev/scenario', { data: { scenarioId: 'anonymous' } })
  expect(selected.ok()).toBe(true)
  await page.goto('/')

  await expect(page.getByTestId('home-login-entry')).toBeVisible()
  await page.getByTestId('home-composer').fill('匿名用户的创意草稿')
  await page.getByTestId('home-agent-send').click()
  await expect(page.getByTestId('home-login-dialog')).toBeVisible()
  await expect(page.getByTestId('home-login-dialog')).toContainText('登录后即可创建项目')
})
