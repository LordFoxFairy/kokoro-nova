import { expect, test, type Page } from '@playwright/test'

const SHOTS = process.env.VISUAL_ARTIFACTS_DIR ?? "test-results/documentation"

test.use({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
})

async function expectVisualBaseline(page: Page, name: string) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.0001,
  })
}

test.beforeEach(async ({ request }) => {
  const selected = await request.post('/api/dev/scenario', {
    data: { scenarioId: 'public-showcase' },
  })
  expect(selected.ok()).toBe(true)
  const reset = await request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)
})

test('home TV Show cards trace to the same ids and gate anonymous creation', async ({ page, request }) => {
  const projection = await request.get('/api/showcase?limit=24')
  expect(projection.ok()).toBe(true)
  const ids = (await projection.json()).entries.map((entry: { id: string }) => entry.id)

  await page.goto('/')
  await expect(page.getByTestId('home-public-entry')).toBeVisible()
  await expect(page.getByTestId('home-showcase-card')).toHaveCount(ids.length)
  expect(await page.getByTestId('tv-show-card-link').evaluateAll((links) => links.map((link) => new URL(link.href).pathname))).toEqual(
    ids.map((id: string) => `/showcase/${id}`),
  )

  await page.getByTestId('home-blank-canvas').click()
  await expect(page.getByTestId('home-login-dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('home-login-dialog')).toHaveCount(0)

  await page.getByTestId('home-composer').fill('匿名浏览不应直接创建项目')
  await page.getByTestId('home-agent-send').click()
  await expect(page.getByTestId('home-login-dialog')).toBeVisible()
})

test('TV Show catalog keeps category and search discovery states visible', async ({ page }) => {
  await page.goto('/showcase')

  await expect(page.getByTestId('showcase-gallery')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'TV Show' })).toBeVisible()
  await expect(page.getByTestId('showcase-card-pub_city_night_01')).toBeVisible()
  await expect(page.getByTestId('showcase-category-全部')).toHaveAttribute('data-selected', 'true')
  await expectVisualBaseline(page, 'tv-show-directory-dark-1440x900.png')
  await page.screenshot({ path: `${SHOTS}/showcase-gallery-catalog.png`, scale: 'css' })
  await page.getByTestId('showcase-category-专业影视').click()
  await expect(page.getByTestId('showcase-category-专业影视')).toHaveAttribute('data-selected', 'true')

  // Search is an explicit submit, matching the observed public catalogue. An
  // unmatched query retains the public collection instead of showing a dead end.
  await page.getByTestId('showcase-search').fill('不存在的验证词')
  await page.getByTestId('showcase-search-submit').click()
  await expect(page.getByTestId('showcase-category-全部')).toHaveCount(0)
  await expect(page.getByTestId('showcase-card-pub_city_night_01')).toBeVisible()
  await expect(page.getByTestId('showcase-search-feedback')).toContainText('未找到')
  await page.screenshot({ path: `${SHOTS}/showcase-gallery-filters.png`, scale: 'css' })

  await page.getByTestId('showcase-clear-search').click()
  await expect(page.getByTestId('showcase-category-全部')).toBeVisible()
  await expect(page.getByTestId('showcase-search-feedback')).toContainText('专业影视')
})

test('TV Show detail, player and read-only process preserve the public work context', async ({ page, request }) => {
  const projection = await request.get('/api/showcase')
  expect(projection.ok()).toBe(true)
  const body = await projection.json()
  expect(body.entries[0]).toMatchObject({
    snapshotId: 'pub_city_night_01',
    author: '公开创作者',
    media: { url: '/api/media/fixtures/city-night.mp4' },
  })

  const detail = await request.get('/api/showcase/pub_city_night_01')
  expect(detail.ok()).toBe(true)
  await page.goto('/showcase/pub_city_night_01')

  await expect(page.getByTestId('showcase-detail')).toBeVisible()
  await expect(page.getByTestId('showcase-detail-hero')).toBeVisible()
  await expect(page.getByRole('heading', { name: '雨夜霓虹城市' })).toBeVisible()
  await expect(page.getByTestId('showcase-watch')).toBeVisible()
  await expect(page.getByTestId('showcase-process')).toBeVisible()
  await expect(page.getByTestId('showcase-related')).toBeVisible()
  await expectVisualBaseline(page, 'tv-show-detail-dark-1440x900.png')
  await page.screenshot({ path: `${SHOTS}/showcase-detail.png`, scale: 'css' })

  await page.getByTestId('showcase-watch').click()
  await expect(page.getByTestId('showcase-player')).toBeVisible()
  await expect(page.getByTestId('showcase-player-video')).toBeVisible()
  // Next dev tools own a top-level portal, so verify the documented keyboard
  // transport rather than relying on a synthetic pointer click through it.
  const playerToggle = page.getByTestId('showcase-player-toggle')
  await expect(playerToggle).toHaveAttribute('aria-label', '暂停')
  await playerToggle.focus()
  await page.keyboard.press('Enter')
  await expect(playerToggle).toHaveAttribute('aria-label', '播放')
  await expect(page.getByTestId('showcase-player-speed')).toContainText('1x')
  await page.getByTestId('showcase-player-speed').click()
  await expect(page.getByTestId('showcase-player-speed')).toContainText('1.5x')
  await page.getByTestId('showcase-player-quality').click()
  await expect(page.getByTestId('showcase-player-quality-menu')).toBeVisible()
  await expect(page.getByTestId('showcase-quality-auto')).toContainText('自动')
  await expect(page.getByTestId('showcase-quality-original')).toContainText('720p 原画质')
  await page.getByTestId('showcase-quality-720p').click()
  await expect(page.getByTestId('showcase-player-quality')).toContainText('720p 高清')

  await page.screenshot({ path: `${SHOTS}/showcase-detail-player.png`, scale: 'css' })

  await page.getByTestId('showcase-player-back').click()
  await page.getByTestId('showcase-process').click()
  await expect(page.getByTestId('showcase-process-overlay')).toBeVisible()
  await expect(page.getByTestId('public-workflow')).toBeVisible()
  await expect(page.getByTestId('clone-project')).toBeVisible()
  await page.getByTestId('clone-project').click()
  await expect(page.getByTestId('clone-gate')).toBeVisible()
  await expectVisualBaseline(page, 'tv-show-clone-login-gate-dark-1440x900.png')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('clone-gate')).toHaveCount(0)
  await page.getByTestId('public-process-close').click()
  await expect(page.getByTestId('showcase-detail')).toBeVisible()

  await page.getByTestId('showcase-like').click()
  await expect(page.getByTestId('showcase-like-gate')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('showcase-like-gate')).toHaveCount(0)
})

test('TV Show catalogue exposes empty, error and retry states', async ({ page }) => {
  let attempts = 0
  await page.route('**/api/showcase**', async (route) => {
    attempts += 1
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'fixture discovery unavailable' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        entries: [],
        page: {
          offset: 0,
          limit: 4,
          total: 0,
          hasMore: false,
          nextOffset: null,
          category: '全部',
          query: '',
          searchFallback: false,
        },
      }),
    })
  })

  await page.goto('/showcase')
  await expect(page.getByText('公开作品暂时加载失败')).toBeVisible()
  await expect(page.getByTestId('showcase-retry')).toBeEnabled()
  await page.getByTestId('showcase-retry').click()
  await expect(page.getByText('暂无公开作品')).toBeVisible()
  expect(attempts).toBe(2)
})

test('authenticated viewer clones a frozen TV Show into an independent editable project', async ({ page, request }) => {
  const selected = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-empty' } })
  expect(selected.ok()).toBe(true)
  const reset = await request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)

  await page.goto('/showcase/pub_city_night_01')
  await page.getByTestId('showcase-process').click()
  await expect(page.getByTestId('public-workflow')).toBeVisible()

  await page.getByTestId('clone-project').click()
  const confirm = page.getByTestId('showcase-clone-dialog')
  await expect(confirm).toBeVisible()
  const cloned = page.waitForResponse((response) =>
    response.request().method() === 'POST'
    && /\/api\/publish\/pub_city_night_01\/clone$/.test(new URL(response.url()).pathname)
    && response.ok(),
  )
  await confirm.getByTestId('showcase-clone-confirm').click()
  await cloned

  const success = page.getByTestId('showcase-clone-success')
  await expect(success).toBeVisible()
  const openCopy = success.getByTestId('showcase-clone-open-project')
  const href = await openCopy.getAttribute('href')
  expect(href).toMatch(/^\/canvas\?projectId=prj_/)
  await openCopy.click()
  await page.waitForURL(/\/canvas\?projectId=prj_.*&canvasId=cvs_/)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  // The private copy retains the frozen document but has new workspace IDs.
  await expect(page.locator('[data-node-type]')).not.toHaveCount(0)
  const projects = await request.get('/api/projects')
  expect(projects.ok()).toBe(true)
  await expect(projects.json()).resolves.toMatchObject({
    projects: expect.arrayContaining([expect.objectContaining({ name: '雨夜霓虹城市 · 副本' })]),
  })
})
