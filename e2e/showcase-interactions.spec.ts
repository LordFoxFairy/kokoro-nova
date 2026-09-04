import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const selected = await request.post('/api/dev/scenario', {
    data: { scenarioId: 'authenticated-populated' },
  })
  expect(selected.ok()).toBe(true)
  const reset = await request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)
})

test('authenticated viewer can favourite a public work and copy its frozen process into a new project', async ({ page }) => {
  await page.goto('/showcase/pub_city_night_01')
  await expect(page.getByTestId('showcase-detail')).toBeVisible()

  const favourite = page.getByTestId('showcase-like')
  await favourite.click()
  await expect(favourite).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('showcase-favourite-feedback')).toContainText('已收藏')

  await page.getByTestId('showcase-process').click()
  await expect(page.getByTestId('public-workflow')).toBeVisible()
  await page.getByTestId('clone-project').click()
  await expect(page.getByTestId('showcase-clone-confirm')).toBeVisible()
  await page.getByTestId('showcase-clone-confirm').click()
  await expect(page.getByTestId('showcase-clone-success')).toBeVisible()
  await expect(page.getByTestId('showcase-clone-open-project')).toHaveAttribute('href', /\/canvas\?projectId=/)
})
