import { expect, test } from '@playwright/test'

const SHOTS = 'docs/screenshots'

test.describe('Skill discovery parity', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/dev/reset')
  })

  test('renders the dark marketplace shell and preserves the local composer gate', async ({ page }) => {
    await page.goto('/skills')
    await expect(page.getByTestId('skill-gallery')).toBeVisible()
    await expect(page.getByTestId('skill-card-skill-storyboard-breakdown')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: '一个 Skill，慢慢打磨你的故事' })).toBeVisible()
    const favourite = page.getByTestId('skill-favourite-skill-storyboard-breakdown')
    await favourite.click()
    await expect(favourite).toHaveAttribute('aria-pressed', 'true')
    await page.screenshot({ path: `${SHOTS}/skills-market-dark-1440x900.png`, scale: 'css' })

    await page.getByTestId('skill-composer-input').fill('把这个产品故事变成一条有节奏的短片')
    await page.getByTestId('skill-composer-submit').click()
    await expect(page.getByTestId('skill-composer-login-gate')).toBeVisible()
    await expect(page.getByTestId('skill-composer-login-gate')).toContainText('登录后开始创作')
  })

  test('navigates the detail carousel, lightbox and local action states', async ({ page }) => {
    await page.goto('/skills/skill-storyboard-breakdown')
    await expect(page.getByTestId('skill-detail')).toBeVisible()
    await expect(page.getByTestId('skill-media-carousel')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('skill-media-next')).toBeEnabled()
    await expect(page.getByTestId('skill-media-prev')).toBeDisabled()

    await page.getByTestId('skill-media-next').click()
    await expect(page.getByTestId('skill-media-carousel')).toContainText('2 / 4')
    await page.screenshot({ path: `${SHOTS}/skills-detail-carousel-dark-1440x900.png`, scale: 'css' })
    await page.getByTestId('skill-media-open').click()
    await expect(page.getByTestId('skill-media-lightbox')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/skills-detail-lightbox-dark-1440x900.png`, scale: 'css' })

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('skill-media-lightbox')).toHaveCount(0)
    await page.getByTestId('skill-add-to-composer').click()
    await expect(page.getByTestId('skill-composer-status')).toContainText('已加入创作器')
    await page.getByTestId('skill-add-to-session').click()
    await expect(page.getByTestId('skill-login-gate')).toBeVisible()
  })
})
