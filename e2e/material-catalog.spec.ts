import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const PROJECT_URL = '/canvas?projectId=prj_video_demo&canvasId=can_video_main'

test.afterEach(async ({ request }) => {
  await request.post('/api/dev/reset')
})

async function selectPopulated(request: APIRequestContext) {
  const response = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-populated' } })
  expect(response.ok()).toBe(true)
}

async function openMaterialDirectory(page: Page, kind: 'style' | 'effect') {
  await page.getByTestId('open-material').click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: kind === 'style' ? /^风格库/ : /^特效库/ }).click()
  const panel = page.getByTestId('material-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByTestId('material-loading')).toHaveCount(0)
  return panel
}

test('style and effect directories expose typed facets, pagination, details and explicit apply', async ({ page, request }) => {
  await selectPopulated(request)
  await page.goto(PROJECT_URL)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  const style = await openMaterialDirectory(page, 'style')
  await expect(style.getByRole('button', { name: '风格广场' })).toHaveAttribute('aria-pressed', 'true')
  await expect(style.locator('[data-testid^="material-style-"][role="group"]')).toHaveCount(6)
  await expect(style.getByTestId('material-model-style-cine-teal')).toContainText('Lib Image')
  await expect(style.getByTestId('material-style-cine-teal')).toContainText('次使用')
  await expect(style.getByTestId('material-load-more')).toBeVisible()

  await style.getByRole('button', { name: '摄影写真', exact: true }).click()
  await expect(style.getByTestId('material-result-count')).toHaveText('4 个结果')
  // The native control is visually represented by the label's custom check
  // indicator; exercise the same clickable label surface a user sees.
  const commercialOnly = style.getByRole('checkbox', { name: '仅看可商用' })
  await style.getByText('仅看可商用', { exact: true }).click()
  await expect(commercialOnly).toBeChecked()
  await expect(style.getByTestId('material-result-count')).toHaveText('3 个结果')
  await style.getByTestId('material-clear-filters').click()
  await expect(style.getByTestId('material-result-count')).toHaveText('24 个结果')

  await style.getByPlaceholder('搜索风格名称、作者').fill('黑色电影')
  await expect(style.getByTestId('material-result-count')).toHaveText('1 个结果')
  await expect(style.getByTestId('material-style-noir')).toBeVisible()
  await style.getByTestId('material-clear-filters').click()

  await style.getByTestId('material-load-more').click()
  await expect(style.locator('[data-testid^="material-style-"][role="group"]')).toHaveCount(12)
  await expect(style.getByTestId('material-result-count')).toHaveText('24 个结果')

  await style.getByRole('button', { name: '电影青橙取消收藏' }).click()
  await style.getByRole('button', { name: '我的收藏' }).click()
  await expect(style.getByTestId('material-style-cine-teal')).toHaveCount(0)
  await expect(style.locator('[data-testid^="material-style-"][role="group"]')).not.toHaveCount(0)

  await style.getByRole('button', { name: '风格广场' }).click()
  await expect(style.getByTestId('material-style-cine-teal')).toBeVisible()
  await style.getByTestId('material-detail-style-cine-teal').click()
  const detail = style.getByRole('dialog').filter({ has: page.getByTestId('material-detail-apply-style-cine-teal') })
  await expect(detail).toBeVisible()
  await expect(detail).toContainText('Lib Image')
  await expect(detail).toContainText('可商用')
  // Close the nested details layer through its visible close affordance; this
  // keeps the enclosing catalog sheet available for the explicit apply path.
  await detail.getByRole('button', { name: '关闭' }).last().click()
  await expect(page.getByTestId('material-detail-apply-style-cine-teal')).toHaveCount(0)

  await style.getByTestId('material-apply-style-cine-teal').click()
  await expect(page.getByTestId('material-panel')).toHaveCount(0)
  await expect(page.locator('[data-node-type="style"]')).toHaveCount(1)

})

test('effect directory has its own scopes and creates a dedicated effect node', async ({ page, request }) => {
  await selectPopulated(request)
  await page.goto(PROJECT_URL)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  const effect = await openMaterialDirectory(page, 'effect')
  await expect(effect.getByRole('button', { name: '特效广场' })).toHaveAttribute('aria-pressed', 'true')
  await expect(effect.getByRole('button', { name: '我的收藏' })).toBeVisible()
  await expect(effect.getByRole('button', { name: '最近使用' })).toBeVisible()
  await expect(effect.getByTestId('material-model-filter')).toBeVisible()
  await expect(effect.getByTestId('material-fx-hair-blow')).toContainText('128,400 次使用')
  await effect.getByTestId('material-apply-fx-hair-blow').click()
  await expect(page.getByTestId('material-panel')).toHaveCount(0)
  await expect(page.locator('[data-node-type="effect"]')).toHaveCount(1)
})
