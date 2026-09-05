import { expect, test, type Page } from '@playwright/test'

type ScriptV2Source = {
  scriptNodeId: string
  rowId: string
  shotNumber: number
  track: 'image' | 'video'
}

type GraphNode = {
  id: string
  type: string
  data: { extra?: { scriptV2Source?: ScriptV2Source } }
}

type CanvasSnapshot = {
  id: string
  revision: number
  document: {
    nodes: GraphNode[]
    edges: Array<{ id: string; source: string; target: string }>
    groups: Array<{ id: string; kind: string; nodeIds: string[] }>
  }
}

/** Every run uses the isolated local mock state owned by the Playwright server. */
test.beforeEach(async ({ request }) => {
  const selected = await request.post('/api/dev/scenario', {
    data: { scenarioId: 'authenticated-empty' },
  })
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
  const url = new URL(page.url())
  const projectId = url.searchParams.get('projectId')
  const canvasId = url.searchParams.get('canvasId')
  if (!projectId || !canvasId) throw new Error('projectId or canvasId missing from canvas URL')

  const response = await page.request.get(`/api/projects/${projectId}`)
  expect(response.ok()).toBe(true)
  const payload = await response.json() as { canvases: CanvasSnapshot[] }
  const canvas = payload.canvases.find((candidate) => candidate.id === canvasId)
  if (!canvas) throw new Error(`active canvas ${canvasId} missing from project fixture`)
  return canvas
}

async function waitForScriptStage(page: Page, stage: string) {
  await expect.poll(async () => {
    const canvas = await activeCanvas(page)
    const script = canvas.document.nodes.find((node) => node.type === 'script') as GraphNode & {
      data: { extra?: { scriptV2?: { activeStage?: string } } }
    } | undefined
    return script?.data.extra?.scriptV2?.activeStage
  }).toBe(stage)
}

async function createVideoReadyScript(page: Page) {
  await page.goto('/project')
  await page.getByTestId('start-create').click()
  await page.waitForURL(/\/canvas\?projectId=/)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '脚本', exact: true }).hover()
  const nodeSaved = waitForCanvasMutation(page)
  await page.getByRole('menuitem', { name: '脚本 V2', exact: true }).click()
  await nodeSaved

  const scriptNode = page.locator('[data-node-type="script"]').first()
  const entrySaved = waitForCanvasMutation(page)
  await scriptNode.getByRole('button', { name: '剧本生成分镜脚本', exact: true }).click()
  await entrySaved

  const generator = page.getByTestId('script-v2-generator')
  await generator.getByPlaceholder('描述剧情片段、故事，为你生成分镜脚本').fill(
    '本地视频原子性夹具：雨夜车站的旅人收到一封旧信。',
  )
  await generator.getByRole('button', { name: '生成分镜脚本', exact: true }).click()

  const resource = scriptNode.getByTestId('script-v2-resource-card')
  await expect(resource).toBeVisible({ timeout: 20_000 })
  await resource.getByRole('button', { name: '打开脚本节点 →', exact: true }).click()

  const workspace = page.getByTestId('script-v2-workspace')
  const promptStageSaved = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: /合成提示词 4\/4 已合成/ }).click()
  await promptStageSaved
  await waitForScriptStage(page, 'prompts')
  return { scriptNode, workspace }
}

async function selectTwoVideoShots(page: Page) {
  const dialog = page.getByTestId('script-v2-batch-materialize-dialog')
  await expect(dialog).toHaveAccessibleName('批量生视频')
  await dialog.getByRole('checkbox', { name: '全选镜头', exact: true }).uncheck()
  await dialog.getByRole('checkbox', { name: '选择镜头 1', exact: true }).check()
  await dialog.getByRole('checkbox', { name: '选择镜头 3', exact: true }).check()
  await expect(dialog.getByTestId('script-v2-batch-selection-count')).toHaveText('已选2/4')
  return dialog
}

test('Script V2 video materialize coalesces duplicate submit and refresh replay into one selected group, node and edge topology', async ({ page }) => {
  const { workspace } = await createVideoReadyScript(page)
  const before = await activeCanvas(page)
  const sourceId = before.document.nodes.find((node) => node.type === 'script')?.id
  if (!sourceId) throw new Error('Script V2 source node missing before video materialization')

  await workspace.getByTestId('script-v2-batch-video').click()
  const dialog = await selectTwoVideoShots(page)
  const confirm = dialog.getByRole('button', { name: '确认生成', exact: true })

  let writes = 0
  const countCanvasWrites = (request: { method(): string; url(): string }) => {
    const url = new URL(request.url())
    if (request.method() === 'POST' && /^\/api\/canvases\/[^/]+$/.test(url.pathname)) writes += 1
  }
  page.on('request', countCanvasWrites)
  const persisted = waitForCanvasMutation(page)
  await confirm.dblclick()
  await persisted
  await expect(dialog).toHaveCount(0)
  expect(writes).toBe(1)
  page.off('request', countCanvasWrites)

  const committed = await activeCanvas(page)
  const videos = committed.document.nodes.filter((node) => node.type === 'video')
  expect(committed.revision).toBe(before.revision + 1)
  expect(videos).toHaveLength(2)
  expect(videos.map((node) => node.data.extra?.scriptV2Source)).toEqual([
    expect.objectContaining({ track: 'video', shotNumber: 1 }),
    expect.objectContaining({ track: 'video', shotNumber: 3 }),
  ])
  expect(new Set(videos.map((node) => node.id)).size).toBe(2)
  expect(committed.document.edges).toHaveLength(2)
  expect(new Set(committed.document.edges.map((edge) => edge.id)).size).toBe(2)
  expect(committed.document.edges).toEqual(videos.map((node) => expect.objectContaining({
    source: sourceId,
    target: node.id,
  })))
  expect(committed.document.groups).toEqual([expect.objectContaining({
    kind: 'normal',
    nodeIds: videos.map((node) => node.id),
  })])

  await page.reload()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  // Materialization focuses its output nodes. Re-fit the persisted graph so
  // the source card is reached through the normal canvas keyboard control.
  await page.keyboard.press('ControlOrMeta+0')
  await page.locator('[data-node-type="script"]').first().getByRole('button', { name: '打开脚本节点 →', exact: true }).click()
  await page.getByTestId('script-v2-workspace').getByTestId('script-v2-batch-video').click()
  const replay = await selectTwoVideoShots(page)

  let replayWrites = 0
  const countReplayWrites = (request: { method(): string; url(): string }) => {
    const url = new URL(request.url())
    if (request.method() === 'POST' && /^\/api\/canvases\/[^/]+$/.test(url.pathname)) replayWrites += 1
  }
  page.on('request', countReplayWrites)
  await replay.getByRole('button', { name: '确认生成', exact: true }).click()
  await expect(replay).toHaveCount(0)
  expect(replayWrites).toBe(0)
  page.off('request', countReplayWrites)

  expect(await activeCanvas(page)).toEqual(committed)
})

test('Script V2 video materialize cancellation and a failed local write leave no partial graph topology', async ({ page }) => {
  const { workspace } = await createVideoReadyScript(page)
  const before = await activeCanvas(page)

  await workspace.getByTestId('script-v2-batch-video').click()
  const cancelled = await selectTwoVideoShots(page)
  await cancelled.getByTestId('script-v2-batch-cancel').click()
  await expect(cancelled).toHaveCount(0)
  expect(await activeCanvas(page)).toEqual(before)

  await workspace.getByTestId('script-v2-batch-video').click()
  const failed = await selectTwoVideoShots(page)
  let abortedWrites = 0
  await page.route('**/api/canvases/*', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    abortedWrites += 1
    await route.abort('failed')
  })
  await failed.getByRole('button', { name: '确认生成', exact: true }).click()
  await expect(failed.getByRole('alert')).toContainText('批量生成没有创建节点')
  expect(abortedWrites).toBe(1)
  await page.unroute('**/api/canvases/*')

  expect(await activeCanvas(page)).toEqual(before)
})
