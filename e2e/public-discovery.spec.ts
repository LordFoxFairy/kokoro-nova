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
