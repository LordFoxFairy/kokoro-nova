import { expect, test, type Page } from '@playwright/test'

type MaterializedNode = {
  id: string
  type: string
  data: {
    extra?: {
      scriptV2Source?: {
        scriptNodeId: string
        rowId: string
        shotNumber: number
        track: string
      }
    }
  }
}

type CanvasSnapshot = {
  id: string
  revision: number
  document: {
    nodes: MaterializedNode[]
    edges: Array<{ source: string; target: string }>
    groups: Array<{ kind: string; nodeIds: string[] }>
  }
}

/** Every run starts from the local deterministic fixture, not the demo server. */
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

async function createScriptV2Output(page: Page) {
  await page.goto('/project')
  await page.getByTestId('start-create').click()
  await page.waitForURL(/\/canvas\?projectId=/)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '脚本', exact: true }).hover()
  const scriptNodePersisted = waitForCanvasMutation(page)
  await page.getByRole('menuitem', { name: '脚本 V2', exact: true }).click()
  await scriptNodePersisted

  const scriptNode = page.locator('[data-node-type="script"]').first()
  const entryPersisted = waitForCanvasMutation(page)
  await scriptNode.getByRole('button', { name: '剧本生成分镜脚本', exact: true }).click()
  await entryPersisted

  const generator = page.getByTestId('script-v2-generator')
  await generator.getByPlaceholder('描述剧情片段、故事，为你生成分镜脚本').fill('本地确定性短片：雨夜站台上，旅人收到一封旧信。')
  await generator.getByRole('button', { name: '生成分镜脚本', exact: true }).click()

  const resource = scriptNode.getByTestId('script-v2-resource-card')
  await expect(resource).toBeVisible({ timeout: 20_000 })
  await expect(resource).toContainText('4 个镜头')
  return { scriptNode, resource }
}

test('Script V2 materializes one local storyboard image that locates back to its workflow source', async ({ page }) => {
  const { resource } = await createScriptV2Output(page)
  const beforeMaterialize = await activeCanvas(page)

  await resource.getByRole('button', { name: '批量生成分镜', exact: true }).click()
  const dialog = page.getByTestId('script-v2-batch-materialize-dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('checkbox', { name: '全选镜头', exact: true }).uncheck()
  await dialog.getByRole('checkbox', { name: '选择镜头 1', exact: true }).check()

  const materialized = waitForCanvasMutation(page)
  await dialog.getByRole('button', { name: '确认生成', exact: true }).click()
  await materialized
  await expect(dialog).toHaveCount(0)

  const committed = await activeCanvas(page)
  expect(committed.revision).toBeGreaterThan(beforeMaterialize.revision)
  const output = committed.document.nodes.filter((node) => node.type === 'image')
  expect(output).toHaveLength(1)
  const [imageNode] = output
  const source = imageNode.data.extra?.scriptV2Source
  if (!source) throw new Error('materialized image has no Script V2 provenance')
  expect(source).toMatchObject({
    shotNumber: 1,
    track: 'image',
  })
  expect(committed.document.nodes).toContainEqual(expect.objectContaining({ id: source.scriptNodeId, type: 'script' }))
  expect(committed.document.edges).toContainEqual(expect.objectContaining({ source: source.scriptNodeId, target: imageNode.id }))
  expect(committed.document.groups).toContainEqual(expect.objectContaining({ kind: 'storyboard', nodeIds: [imageNode.id] }))

  // Storyboard is a projection: opening it must neither clone nor revise the workflow document.
  await page.getByTestId('view-storyboard').click()
  await expect(page.getByTestId('storyboard-view')).toBeVisible()
  const card = page.getByTestId(`storyboard-card-${imageNode.id}`)
  await expect(card).toBeVisible()
  const afterProjection = await activeCanvas(page)
  expect(afterProjection.revision).toBe(committed.revision)
  expect(afterProjection.document).toEqual(committed.document)

  await card.click()
  const detail = page.getByTestId('media-detail')
  await expect(detail).toBeVisible()
  await detail.getByRole('button', { name: '更多操作', exact: true }).click()
  await page.getByRole('menu').last().getByRole('menuitem', { name: '在工作流中定位', exact: true }).click()

  await expect(page.getByTestId('view-workflow')).toHaveAttribute('aria-pressed', 'true')
  await expect(detail).toHaveCount(0)
  await expect(page.getByTestId(`node-shell-${imageNode.id}`)).toHaveAttribute('data-selected', 'true')
})
