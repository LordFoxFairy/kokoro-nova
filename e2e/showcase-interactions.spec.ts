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

test.describe('Showcase 1440×900 状态和可访问性交互基准', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })

  test('公开发现面呈现 loading、error retry 与 empty 状态，而不丢失导航地标', async ({ page }) => {
    let showcaseRequests = 0
    await page.route('**/api/showcase', async (route) => {
      showcaseRequests += 1
      if (showcaseRequests === 1) {
        await new Promise((resolve) => setTimeout(resolve, 350))
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: '公开发现 mock 暂时不可用' }),
        })
        return
      }
      if (showcaseRequests === 2) {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ entries: [] }) })
        return
      }
      await route.continue()
    })

    await page.goto('/showcase')
    await expect(page.getByTestId('showcase-loading')).toBeVisible()
    await expect(page.getByTestId('showcase-loading')).toHaveAttribute('role', 'status')
    await expect(page.getByTestId('showcase-load-error')).toBeVisible()
    await page.getByTestId('showcase-retry').focus()
    await expect(page.getByTestId('showcase-retry')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('showcase-empty-state')).toContainText('暂无公开作品')
    await expect(page.getByRole('main')).toHaveAttribute('aria-describedby', 'showcase-status')
    await expect(page.getByRole('link', { name: '我的项目', exact: true })).toHaveAttribute('href', '/project')
  })
})
