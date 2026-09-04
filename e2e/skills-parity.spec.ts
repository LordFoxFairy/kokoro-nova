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

  test('makes every marketplace composer control actionable with recoverable local context', async ({ page }) => {
    await page.goto('/skills')
    await expect(page.getByTestId('skill-card-skill-storyboard-breakdown')).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('skill-composer-attachment').click()
    await expect(page.getByTestId('skill-composer-attachment-menu').getByRole('menu')).toBeVisible()
    await page.getByRole('menuitem', { name: '从素材库选择' }).click()
    const attachments = page.getByTestId('skill-composer-attachments-drawer')
    await expect(attachments).toBeVisible()
    await expect(page.getByTestId('skill-composer-asset-option-attachment-night-city-board')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/skills-composer-attachments-drawer-dark-1440x900.png`, scale: 'css' })
    await page.getByTestId('skill-composer-asset-option-attachment-night-city-board').click()
    await expect(page.getByTestId('skill-composer-selected-attachment-attachment-night-city-board')).toBeVisible()

    await page.getByTestId('skill-composer-skill').click()
    const skills = page.getByTestId('skill-composer-skills-drawer')
    await expect(skills).toBeVisible()
    await expect(page.getByTestId('skill-composer-skill-option-skill-storyboard-breakdown')).toBeVisible()
    await page.getByTestId('skill-composer-skill-option-skill-storyboard-breakdown').getByRole('button').click()
    await expect(page.getByTestId('skill-composer-selected-skill')).toContainText('分镜拆解')

    await page.getByTestId('skill-composer-reference').click()
    await expect(page.getByTestId('skill-composer-references-drawer')).toBeVisible()
    await expect(page.getByTestId('skill-composer-asset-option-reference-main-character')).toBeVisible()
    await page.getByTestId('skill-composer-asset-option-reference-main-character').click()
    await expect(page.getByTestId('skill-composer-selected-reference-reference-main-character')).toBeVisible()

    await page.getByTestId('skill-composer-mode').click()
    const modeMenu = page.getByTestId('skill-composer-mode-menu')
    await expect(modeMenu.getByRole('menu')).toBeVisible()
    await modeMenu.getByRole('menuitem', { name: /自动生成/ }).click()
    await expect(page.getByTestId('skill-composer-mode-chip')).toContainText('自动生成')

    await page.getByTestId('skill-composer-input').fill('把参考素材整理成一条夜景短片')
    await page.getByTestId('skill-composer-submit').click()
    await expect(page.getByTestId('skill-composer-login-gate')).toBeVisible()
    await expect(page.getByTestId('skill-composer-session-intent')).toContainText('分镜拆解')
    await expect(page.getByTestId('skill-composer-session-intent')).toContainText('夜雨城市参考板')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('skill-composer-login-gate')).toHaveCount(0)
  })

  test('exposes anonymous, empty and retry states for composer drawers', async ({ page }) => {
    await page.goto('/skills')
    await expect(page.getByTestId('skill-card-skill-storyboard-breakdown')).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('skill-composer-skill').click()
    await page.getByTestId('skill-composer-collection-收藏').click()
    await expect(page.getByTestId('skill-composer-login-gate')).toContainText('登录后开始创作')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('skill-composer-login-gate')).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.route('**/api/skills?composer=references*', async (route) => {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'fixture error' }) })
    })
    await page.getByTestId('skill-composer-reference').click()
    await expect(page.getByTestId('skill-composer-drawer-error')).toBeVisible()
    await page.unroute('**/api/skills?composer=references*')
    await page.getByTestId('skill-composer-drawer-retry').click()
    await expect(page.getByTestId('skill-composer-asset-option-reference-main-character')).toBeVisible()
    await page.getByTestId('skill-composer-asset-option-reference-main-character').click()

    await page.route('**/api/skills?composer=attachments*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'attachments', items: [] }) })
    })
    await page.getByTestId('skill-composer-attachment').click()
    await page.getByRole('menuitem', { name: '从素材库选择' }).click()
    await expect(page.getByTestId('skill-composer-drawer-empty')).toBeVisible()
    await page.unroute('**/api/skills?composer=attachments*')
  })
})
