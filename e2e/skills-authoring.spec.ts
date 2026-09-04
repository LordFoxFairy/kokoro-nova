import { expect, test } from '@playwright/test'

test.describe('Skill authoring lifecycle', () => {
  test.beforeEach(async ({ request }) => { await request.post('/api/dev/reset') })

  test('aligns 我的 entry copy and publishes a reviewed local Skill into 我的 before unpublishing it', async ({ page }) => {
    await page.goto('/skills')
    await expect(page.getByRole('heading', { name: '新的一天，新的 Skill' })).toBeVisible()
    await page.getByTestId('skill-collection-我的').click()
    await expect(page.getByTestId('skill-author-entry')).toContainText('我的 Skill')
    await expect(page.getByTestId('skill-author-open')).toHaveText('创建Skill')
    await page.getByTestId('skill-author-open').click()
    const studio = page.getByTestId('skill-author-studio')
    await expect(studio).toContainText('还没有自建 Skill')
    await studio.getByTestId('skill-author-create').click()
    await studio.getByTestId('skill-author-name').fill('镜头节奏助手')
    await studio.getByTestId('skill-author-summary').fill('将镜头表整理为节奏明确、可执行的短片创作任务。')
    await studio.getByTestId('skill-author-usage-scenarios').fill('适用于脚本定稿后需要明确镜头节奏的短片创作。')
    await studio.getByTestId('skill-author-how-to-use').fill('输入镜头表与目标时长，调用后确认镜头节奏。')
    await studio.getByTestId('skill-author-output-content').fill('返回镜头节奏表、转场建议与可执行镜头清单。')
    await studio.getByTestId('skill-author-output-type-image').check()
    await studio.getByTestId('skill-author-output-type-video').check()
    await studio.getByTestId('skill-author-cover').fill('/fixtures/libtv/skills/example-01.svg')
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
