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
