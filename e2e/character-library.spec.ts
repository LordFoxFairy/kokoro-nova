import { expect, test } from '@playwright/test'

const PROJECT_URL = '/canvas?projectId=prj_video_demo&canvasId=can_video_main'

test.afterEach(async ({ request }) => {
  await request.post('/api/dev/reset')
})

test('character library requires an explicit selection before applying its four reference images', async ({ page, request }) => {
  const scenario = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-populated' } })
  expect(scenario.ok()).toBe(true)

  await page.goto(PROJECT_URL)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  const imageNodesBefore = await page.locator('[data-node-type="image"]').count()

  await page.getByTestId('open-character').click()
  const panel = page.getByTestId('character-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByText('请选择角色', { exact: true })).toBeVisible()
  await expect(panel.getByTestId('character-apply')).toBeDisabled()
  await expect(panel.getByText('选择角色后显示角色立绘、脸部近景、表情参考和三视图。')).toBeVisible()

  await panel.getByRole('button', { name: '清新少女', exact: true }).click()
  await expect(panel.getByTestId('character-apply')).toBeEnabled()
  for (const reference of ['角色立绘', '脸部近景', '表情参考', '三视图']) {
    await expect(panel.getByText(reference, { exact: true })).toBeVisible()
  }

  await panel.getByTestId('character-apply').click()
  await expect(panel).toHaveCount(0)
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(imageNodesBefore + 4)
  await expect(page.getByText('清新少女 · 角色立绘', { exact: true })).toBeVisible()
})
