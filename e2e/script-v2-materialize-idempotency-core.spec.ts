import { expect, test, type Page } from '@playwright/test'

type GraphNode = {
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
    nodes: GraphNode[]
    edges: Array<{ id: string; source: string; target: string }>
    groups: Array<{ id: string; kind: string; nodeIds: string[] }>
  }
}

type LedgerSnapshot = {
  balance: number
  counts: Record<string, number>
  totals: Record<string, number>
  earned: unknown[]
  spent: unknown[]
  returned: unknown[]
  jobs: Record<string, unknown>
}

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

async function ledger(page: Page): Promise<LedgerSnapshot> {
  const response = await page.request.get('/api/ledger?limit=200')
  expect(response.ok()).toBe(true)
  return response.json() as Promise<LedgerSnapshot>
}

async function createGeneratedScript(page: Page) {
  await page.goto('/project')
  await page.getByTestId('start-create').click()
  await page.waitForURL(/\/canvas\?projectId=/)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '脚本', exact: true }).hover()
  const nodeSaved = waitForCanvasMutation(page)
  await page.getByRole('menuitem', { name: '脚本 V2', exact: true }).click()
  await nodeSaved

  const node = page.locator('[data-node-type="script"]').first()
  const entrySaved = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '剧本生成分镜脚本', exact: true }).click()
  await entrySaved

  const generator = page.getByTestId('script-v2-generator')
  await generator.getByPlaceholder('描述剧情片段、故事，为你生成分镜脚本').fill('本地幂等夹具：雨夜车站的旅人收到一封旧信。')
  await generator.getByRole('button', { name: '生成分镜脚本', exact: true }).click()

  const resource = node.getByTestId('script-v2-resource-card')
  await expect(resource).toBeVisible({ timeout: 20_000 })
  await expect(resource).toContainText('4 个镜头')
  return resource
}

test('Script V2 immediate duplicate materialize submit issues one graph write, no ledger side effect, and survives refresh as one group', async ({ page }) => {
  const resource = await createGeneratedScript(page)
  const before = await activeCanvas(page)
  const ledgerBefore = await ledger(page)

  await resource.getByRole('button', { name: '批量生成分镜', exact: true }).click()
  const dialog = page.getByTestId('script-v2-batch-materialize-dialog')
  const confirm = dialog.getByRole('button', { name: '确认生成', exact: true })
  await expect(confirm).toBeEnabled()

  let materializeRequests = 0
  const countMaterializeRequest = (request: { method(): string; url(): string }) => {
    const url = new URL(request.url())
    if (request.method() === 'POST' && /^\/api\/canvases\/[^/]+$/.test(url.pathname)) {
      materializeRequests += 1
    }
  }
  page.on('request', countMaterializeRequest)

  const persisted = waitForCanvasMutation(page)
  await confirm.dblclick()
  await persisted
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => materializeRequests).toBe(1)
  page.off('request', countMaterializeRequest)

  const committed = await activeCanvas(page)
  const outputNodes = committed.document.nodes.filter((node) => node.type === 'image')
  expect(committed.revision).toBe(before.revision + 1)
  expect(outputNodes).toHaveLength(4)
  expect(new Set(outputNodes.map((node) => node.id)).size).toBe(4)
  expect(committed.document.edges).toHaveLength(4)
  expect(new Set(committed.document.edges.map((edge) => edge.id)).size).toBe(4)
  expect(committed.document.groups).toHaveLength(1)

  const [group] = committed.document.groups
  expect(group).toMatchObject({ kind: 'storyboard' })
  expect(group.nodeIds).toEqual(outputNodes.map((node) => node.id))
  expect(outputNodes.map((node) => node.data.extra?.scriptV2Source)).toEqual([
    expect.objectContaining({ track: 'image', shotNumber: 1 }),
    expect.objectContaining({ track: 'image', shotNumber: 2 }),
    expect.objectContaining({ track: 'image', shotNumber: 3 }),
    expect.objectContaining({ track: 'image', shotNumber: 4 }),
  ])
  expect(committed.document.edges).toEqual(outputNodes.map((node) => expect.objectContaining({
    source: before.document.nodes.find((candidate) => candidate.type === 'script')?.id,
    target: node.id,
  })))

  // Materialization only authors local graph topology; it never creates jobs or ledger entries.
  expect(await ledger(page)).toEqual(ledgerBefore)

  await page.reload()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  expect(await activeCanvas(page)).toEqual(committed)
  expect(await ledger(page)).toEqual(ledgerBefore)
})
