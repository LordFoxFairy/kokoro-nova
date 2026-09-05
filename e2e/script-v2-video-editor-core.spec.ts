import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

type ScriptV2Source = {
  scriptNodeId: string
  rowId: string
  shotNumber: number
  track: 'image' | 'video'
}

type WorkflowNode = {
  id: string
  type: string
  name: string
  data: {
    artifacts?: Array<{ id: string; kind: string; url: string; durationSeconds: number | null }>
    extra?: { scriptV2?: unknown; scriptV2Source?: ScriptV2Source; [key: string]: unknown }
    [key: string]: unknown
  }
}

type CanvasSnapshot = {
  id: string
  revision: number
  document: { nodes: WorkflowNode[] }
}

const FIXTURE_ARTIFACT = {
  id: 'art_script_v2_video_editor',
  jobId: 'fixture-script-v2-video-editor',
  kind: 'video',
  url: '/api/media/fixtures/city-night.mp4',
  thumbnailUrl: '/fixtures/libtv/media/city-night-poster.webp',
  width: 1280,
  height: 720,
  durationSeconds: 5,
  createdAt: '2026-09-05T00:00:00.000Z',
  modelId: 'seedance-2',
  assetId: null,
} as const

/** Every run starts from deterministic local state, never a demo server or remote model. */
test.beforeEach(async ({ request }) => {
  const selected = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-empty' } })
  expect(selected.ok()).toBe(true)
  const reset = await request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)
})

function waitForCanvasMutation(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'POST' && /^\/api\/canvases\/[^/]+$/.test(url.pathname) && response.ok()
  })
}

async function activeCanvas(page: Page): Promise<CanvasSnapshot> {
  const projectId = new URL(page.url()).searchParams.get('projectId')
  const canvasId = new URL(page.url()).searchParams.get('canvasId')
  if (!projectId || !canvasId) throw new Error('projectId or canvasId missing from canvas URL')

  const response = await page.request.get(`/api/projects/${projectId}`)
  expect(response.ok()).toBe(true)
  const payload = await response.json() as { canvases: CanvasSnapshot[] }
  const canvas = payload.canvases.find((candidate) => candidate.id === canvasId)
  if (!canvas) throw new Error(`active canvas ${canvasId} missing from project fixture`)
  return canvas
}

/**
 * Materialization is deliberately exercised through the Script V2 UI.  A local
 * fixture artifact is then attached through the documented canvas mutation
 * boundary so this core journey can reach the compositor without invoking a
 * real generation provider.
 */
async function createMaterializedVideoSource(page: Page, request: APIRequestContext) {
  await page.goto('/project')
  await page.getByTestId('start-create').click()
  await page.waitForURL(/\/canvas\?projectId=/)

  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '脚本', exact: true }).hover()
  const scriptPersisted = waitForCanvasMutation(page)
  await page.getByRole('menuitem', { name: '脚本 V2', exact: true }).click()
  await scriptPersisted

  const scriptNode = page.locator('[data-node-type="script"]').first()
  const entryPersisted = waitForCanvasMutation(page)
  await scriptNode.getByRole('button', { name: '剧本生成分镜脚本', exact: true }).click()
  await entryPersisted

  const generator = page.getByTestId('script-v2-generator')
  await generator.getByPlaceholder('描述剧情片段、故事，为你生成分镜脚本').fill(
    '本地确定性短片：雨夜站台上，旅人收到一封旧信。',
  )
  await generator.getByRole('button', { name: '生成分镜脚本', exact: true }).click()

  const resource = scriptNode.getByTestId('script-v2-resource-card')
  await expect(resource).toBeVisible({ timeout: 20_000 })
  await resource.getByRole('button', { name: '打开脚本节点 →', exact: true }).click()

  const workspace = page.getByTestId('script-v2-workspace')
  const promptStagePersisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: /合成提示词 4\/4 已合成/ }).click()
  await promptStagePersisted

  await workspace.getByTestId('script-v2-batch-video').click()
  const dialog = page.getByTestId('script-v2-batch-materialize-dialog')
  await expect(dialog).toHaveAccessibleName('批量生视频')
  await dialog.getByRole('checkbox', { name: '全选镜头', exact: true }).uncheck()
  await dialog.getByRole('checkbox', { name: '选择镜头 1', exact: true }).check()

  const materialized = waitForCanvasMutation(page)
  await dialog.getByRole('button', { name: '确认生成', exact: true }).click()
  await materialized
  await expect(dialog).toHaveCount(0)

  const committed = await activeCanvas(page)
  const video = committed.document.nodes.find((node) => node.type === 'video')
  if (!video) throw new Error('Script V2 materialization did not create a video node')
  const source = video.data.extra?.scriptV2Source
  if (!source) throw new Error('materialized video has no Script V2 provenance')
  expect(source).toMatchObject({
    shotNumber: 1,
    track: 'video',
  })

  const hydrated = await request.post(`/api/canvases/${committed.id}`, {
    data: {
      canvasId: committed.id,
      expectedRevision: committed.revision,
      label: 'E2E 注入 Script V2 本地视频产物',
      mutations: [{
        op: 'updateNode',
        nodeId: video.id,
        patch: {
          data: {
            ...video.data,
            artifacts: [FIXTURE_ARTIFACT],
          },
        },
      }],
    },
  })
  expect(hydrated.ok()).toBe(true)

  const withArtifact = await activeCanvas(page)
  const origin = withArtifact.document.nodes.find((node) => node.id === video.id)
  if (!origin) throw new Error('materialized video disappeared after fixture hydration')
  return { canvas: withArtifact, origin, source }
}

test('Script V2 video source reaches storyboard detail and compositor; compose failure and cancellation preserve origin', async ({
  page,
  request,
}) => {
  const { canvas, origin, source } = await createMaterializedVideoSource(page, request)
  const originData = structuredClone(origin.data)
  const scriptBefore = canvas.document.nodes.find((node) => node.id === source.scriptNodeId)
  if (!scriptBefore) throw new Error('Script V2 source node missing after materialization')
  const scriptStateBefore = structuredClone(scriptBefore.data.extra?.scriptV2)

  expect(origin.data.extra?.scriptV2Source).toEqual({
    scriptNodeId: source.scriptNodeId,
    rowId: source.rowId,
    shotNumber: 1,
    track: 'video',
  })
  expect(origin.data.artifacts).toEqual([expect.objectContaining(FIXTURE_ARTIFACT)])

  await page.reload()
  await page.getByTestId('view-storyboard').click()
  const card = page.getByTestId(`storyboard-card-${origin.id}`)
  await expect(card).toBeVisible()
  await card.click()
  const detail = page.getByTestId('media-detail')
  await expect(detail).toBeVisible()
  await expect(detail.getByTestId('detail-clip')).toBeVisible()
  await detail.getByTestId('detail-clip').click()

  const editor = page.getByTestId('clip-editor')
  await expect(editor).toBeVisible()
  const sourceCard = page.getByTestId(`clip-source-video-${FIXTURE_ARTIFACT.id}`)
  await expect(sourceCard).toBeVisible()
  await expect(sourceCard).toContainText('分镜视频 1')
  await sourceCard.getByRole('button', { name: '添加到时间线' }).click()
  await expect(page.locator('[data-testid^="timeline-clip-"]')).toHaveCount(1)

  const failedTask = {
    id: 'compose_task_script_v2_failed',
    status: 'queued',
    artifact: null,
    assetId: null,
    subtitleMode: null,
    notes: [],
    failure: null,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
  }
  const cancelledTask = {
    id: 'compose_task_script_v2_cancelled',
    status: 'rendering',
    artifact: null,
    assetId: null,
    subtitleMode: null,
    notes: [],
    failure: null,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
  }
  let composeAttempts = 0
  let cancelled = false

  await page.route('**/api/compose', async (route) => {
    composeAttempts += 1
    const task = composeAttempts === 1 ? failedTask : cancelledTask
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task }) })
  })
  await page.route(`**/api/compose/${failedTask.id}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ task: { ...failedTask, status: 'failed', failure: '本地 Script V2 合成失败夹具' } }),
    })
  })
  await page.route(`**/api/compose/${cancelledTask.id}`, async (route) => {
    if (route.request().method() === 'POST') cancelled = true
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ task: cancelled ? { ...cancelledTask, status: 'cancelled' } : cancelledTask }),
    })
  })

  await page.getByTestId('clip-export-trigger').click()
  await page.getByTestId('export-to-canvas').click()
  await expect(page.getByTestId('compose-error')).toContainText('本地 Script V2 合成失败夹具')
  await expect(page.locator('[data-testid^="timeline-clip-"]')).toHaveCount(1)

  await page.getByTestId('clip-export-trigger').click()
  await page.getByTestId('export-to-canvas').click()
  await expect(page.getByTestId('compose-progress')).toBeVisible()
  await page.getByTestId('compose-cancel').click()
  await expect(page.getByTestId('compose-success')).toContainText('已取消合成，时间线保持不变。')

  const after = await activeCanvas(page)
  const originAfter = after.document.nodes.find((node) => node.id === origin.id)
  const scriptAfter = after.document.nodes.find((node) => node.id === source.scriptNodeId)
  expect(originAfter?.data).toEqual(originData)
  expect(scriptAfter?.data.extra?.scriptV2).toEqual(scriptStateBefore)
  expect(after.document.nodes.filter((node) => node.type === 'video')).toHaveLength(1)

  const composite = after.document.nodes.find((node) => node.type === 'videoComposite')
  expect(composite?.data.extra?.composite).toMatchObject({
    clips: [expect.objectContaining({ artifactId: FIXTURE_ARTIFACT.id, nodeId: origin.id })],
  })
})
