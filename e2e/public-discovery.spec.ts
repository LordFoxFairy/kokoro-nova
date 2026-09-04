import { expect, test } from '@playwright/test'

const SHOTS = 'docs/screenshots'

test.beforeEach(async ({ request }) => {
  const selected = await request.post('/api/dev/scenario', {
    data: { scenarioId: 'public-showcase' },
  })
  expect(selected.ok()).toBe(true)
  const reset = await request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)
})

test('TV Show catalog keeps category and search discovery states visible', async ({ page }) => {
  await page.goto('/showcase')

  await expect(page.getByTestId('showcase-gallery')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'TV Show' })).toBeVisible()
  await expect(page.getByTestId('showcase-card-pub_city_night_01')).toBeVisible()
  await expect(page.getByTestId('showcase-category-全部')).toHaveAttribute('data-selected', 'true')
  await page.screenshot({ path: `${SHOTS}/showcase-gallery-catalog.png` })
  await page.getByTestId('showcase-category-专业影视').click()
  await expect(page.getByTestId('showcase-category-专业影视')).toHaveAttribute('data-selected', 'true')

  // Search is an explicit submit, matching the observed public catalogue. An
  // unmatched query retains the public collection instead of showing a dead end.
  await page.getByTestId('showcase-search').fill('不存在的验证词')
  await page.getByTestId('showcase-search-submit').click()
  await expect(page.getByTestId('showcase-category-全部')).toHaveCount(0)
  await expect(page.getByTestId('showcase-card-pub_city_night_01')).toBeVisible()
  await expect(page.getByTestId('showcase-search-feedback')).toContainText('未找到')
  await page.screenshot({ path: `${SHOTS}/showcase-gallery-filters.png` })

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
  await page.screenshot({ path: `${SHOTS}/showcase-detail.png` })

  await page.getByTestId('showcase-watch').click()
  await expect(page.getByTestId('showcase-player')).toBeVisible()
  await expect(page.getByTestId('showcase-player-video')).toBeVisible()
  await expect(page.getByTestId('showcase-player-speed')).toContainText('1x')
  await page.getByTestId('showcase-player-speed').click()
  await expect(page.getByTestId('showcase-player-speed')).toContainText('1.5x')
  await page.getByTestId('showcase-player-quality').click()
  await expect(page.getByTestId('showcase-player-quality-menu')).toBeVisible()
  await expect(page.getByTestId('showcase-quality-auto')).toContainText('自动')
  await expect(page.getByTestId('showcase-quality-original')).toContainText('720p 原画质')
  await page.getByTestId('showcase-quality-720p').click()
  await expect(page.getByTestId('showcase-player-quality')).toContainText('720p 高清')

  await page.screenshot({ path: `${SHOTS}/showcase-detail-player.png` })

  await page.getByTestId('showcase-player-back').click()
  await page.getByTestId('showcase-process').click()
  await expect(page.getByTestId('showcase-process-overlay')).toBeVisible()
  await expect(page.getByTestId('public-workflow')).toBeVisible()
  await expect(page.getByTestId('clone-project')).toBeVisible()
  await page.getByTestId('clone-project').click()
  await expect(page.getByTestId('clone-gate')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('clone-gate')).toHaveCount(0)
  await page.getByTestId('public-process-close').click()
  await expect(page.getByTestId('showcase-detail')).toBeVisible()

  await page.getByTestId('showcase-like').click()
  await expect(page.getByTestId('showcase-like-gate')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('showcase-like-gate')).toHaveCount(0)
})
