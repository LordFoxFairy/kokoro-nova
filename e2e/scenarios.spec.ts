import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const PROJECT_URL = '/canvas?projectId=prj_video_demo&canvasId=can_video_main'

async function selectScenario(request: APIRequestContext, scenarioId: string) {
  const selected = await request.post('/api/dev/scenario', { data: { scenarioId } })
  expect(selected.ok()).toBe(true)

  // Reset deliberately has no scenario body: this proves the selected fixture
  // survives the same reset contract used by the rest of the E2E suite.
  const reset = await request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)
}

test.afterEach(async ({ request }) => {
  await selectScenario(request, 'authenticated-empty')
})

async function openVideoScenario(page: Page, request: APIRequestContext, scenarioId: string) {
  await selectScenario(request, scenarioId)
  await page.goto(PROJECT_URL)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  return page.getByTestId('node-node_video_01')
}

test('video running is stable across refresh', async ({ page, request }) => {
  const node = await openVideoScenario(page, request, 'video-running')
  await expect(node.getByText('生成中', { exact: true })).toBeVisible()
  await expect(node.getByText('58%', { exact: true })).toBeVisible()

  await page.reload()

  const refreshed = page.getByTestId('node-node_video_01')
  await expect(refreshed.getByText('生成中', { exact: true })).toBeVisible()
  await expect(refreshed.getByText('58%', { exact: true })).toBeVisible()
})

for (const fixture of [
  ['video-awaiting-confirmation', '等待确认'],
  ['video-queued', '排队中'],
  ['video-succeeded', '生成完成'],
  ['video-failed', '生成失败'],
  ['video-cancelled', '已取消'],
  ['video-compliance-blocked', '素材合规校验未通过'],
] as const) {
  test(`${fixture[0]} exposes its exact visible status`, async ({ page, request }) => {
    const node = await openVideoScenario(page, request, fixture[0])
    await expect(node.getByText(fixture[1], { exact: true })).toBeVisible()
  })
}

test('expired editor session asks for a refresh', async ({ page, request }) => {
  await selectScenario(request, 'session-expired')
  await page.goto(PROJECT_URL)
  await expect(page.getByRole('status')).toContainText('会话已过期，请刷新页面')
})

test('compliance blocking remains a distinct storyboard recovery state', async ({ page, request }) => {
  await openVideoScenario(page, request, 'video-compliance-blocked')
  await page.getByTestId('view-storyboard').click()
  await expect(page.getByTestId('storyboard-status-node_video_01')).toContainText('合规阻断')

  await page.getByTestId('storyboard-card-node_video_01').click()
  const detail = page.getByTestId('media-detail')
  await expect(detail.getByTestId('detail-regeneration-compliance')).toContainText('未通过合规检查')
  await expect(detail.getByTestId('detail-regenerate')).toContainText('修改后重试')
})

async function openRecoverableStoryboardAsset(page: Page, request: APIRequestContext) {
  await selectScenario(request, 'authenticated-populated')
  const removed = await request.delete('/api/assets/asset_image_seed')
  expect(removed.ok()).toBe(true)

  await page.goto(PROJECT_URL)
  await page.getByTestId('view-storyboard').click()
  await expect(page.getByTestId('storyboard-degradation-node_image_01')).toContainText('可恢复')
  await page.getByTestId('storyboard-card-node_image_01').click()
  return page.getByTestId('media-detail')
}

test('storyboard restores a recoverable media asset through the local lifecycle contract', async ({ page, request }) => {
  const detail = await openRecoverableStoryboardAsset(page, request)
  const restore = detail.getByRole('button', { name: '恢复资产' })
  await expect(restore).toHaveAttribute('data-testid', 'detail-restore-asset')

  const restored = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'PATCH' && url.pathname === '/api/assets/asset_image_seed'
  })
  await restore.click()
  expect((await restored).ok()).toBe(true)

  await expect(page.getByTestId('storyboard-degradation-node_image_01')).toHaveCount(0)
  await expect(detail.locator('img')).toBeVisible()
})

test('storyboard leaves a failed asset restore visible and retryable', async ({ page, request }) => {
  await page.route('**/api/assets/asset_image_seed', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: '本地恢复暂时失败' }),
    })
  })

  const detail = await openRecoverableStoryboardAsset(page, request)
  await detail.getByTestId('detail-restore-asset').click()

  await expect(detail.getByTestId('detail-asset-recovery-status')).toContainText('本地恢复暂时失败，可再次尝试')
  await expect(detail.getByRole('button', { name: '再次尝试恢复' })).toBeEnabled()
  await expect(page.getByTestId('storyboard-degradation-node_image_01')).toBeVisible()
})
