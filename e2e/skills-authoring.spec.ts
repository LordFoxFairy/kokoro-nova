import { expect, test } from '@playwright/test'

test.describe('Skill authoring lifecycle', () => {
  test.beforeEach(async ({ request }) => { await request.post('/api/dev/reset') })

  test('aligns 我的 entry copy and publishes a reviewed local Skill into 我的 before unpublishing it', async ({ page }) => {
    await page.goto('/skills')
    await expect(page.getByRole('heading', { name: '用 Skill，开启今天的故事' })).toBeVisible()
    await page.getByTestId('skill-collection-我的').click()
    await expect(page.getByTestId('skill-author-entry')).toContainText('我的 Skill')
    await expect(page.getByTestId('skill-author-open')).toHaveText('创建Skill')
    await page.getByTestId('skill-author-open').click()
    const studio = page.getByTestId('skill-author-studio')
    await expect(studio).toContainText('还没有自建 Skill')
    await studio.getByTestId('skill-author-create').click()
    await studio.getByTestId('skill-author-name').fill('镜头节奏助手')
    await studio.getByTestId('skill-author-summary').fill('将镜头表整理为节奏明确、可执行的短片创作任务。')
    await studio.getByTestId('skill-author-version').fill('1.2.0')
    await studio.getByTestId('skill-author-save').click()
    await studio.getByTestId('skill-author-submit-review').click()
    await expect(studio.getByTestId('skill-author-status')).toContainText('审核通过，待发布')
    await studio.getByTestId('skill-author-publish').click()
    await expect(studio.getByTestId('skill-author-status')).toContainText('已发布')
    // Dialog has both a backdrop and titlebar close affordance. Escape matches
    // the documented product shortcut and avoids coupling this journey to their
    // DOM order.
    await page.keyboard.press('Escape')
    await expect(studio).toBeHidden()
    await expect(page.getByTestId('skill-card-skill-local-001')).toContainText('镜头节奏助手')

    await page.getByTestId('skill-author-open').click()
    await studio.getByTestId('skill-author-unpublish').click()
    await expect(studio.getByTestId('skill-author-status')).toContainText('已下架')
  })
})
