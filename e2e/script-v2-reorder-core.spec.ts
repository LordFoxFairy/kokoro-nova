import { expect, test, type Page, type Request } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const selected = await request.post('/api/dev/scenario', {
    data: { scenarioId: 'authenticated-empty' },
  })
  expect(selected.ok()).toBe(true)
  const reset = await request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)
})

type ScriptRow = {
  id: string
  shotNumber: number
}

type ScriptState = {
  rows: ScriptRow[]
}

function waitForCanvasMutation(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      response.request().method() === 'POST' &&
      /^\/api\/canvases\/[^/]+$/.test(url.pathname) &&
      response.ok()
    )
  })
}

async function readScriptState(page: Page): Promise<ScriptState> {
  const projectId = new URL(page.url()).searchParams.get('projectId')
  if (!projectId) throw new Error('projectId missing from canvas URL')

  const response = await page.request.get(`/api/projects/${projectId}`)
  expect(response.ok()).toBe(true)
  const payload = (await response.json()) as {
    canvases: Array<{
      document: {
        nodes: Array<{
          type: string
          data: { extra?: { scriptV2?: ScriptState } }
        }>
      }
    }>
  }
  const script = payload.canvases[0]?.document.nodes.find((node) => node.type === 'script')
  if (!script?.data.extra?.scriptV2) throw new Error('Script V2 state missing')
  return script.data.extra.scriptV2
}

async function openManualScriptWorkspace(page: Page) {
  await page.goto('/project')
  await page.getByTestId('start-create').click()
  await page.waitForURL(/\/canvas\?projectId=/)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '脚本', exact: true }).hover()
  let persisted = waitForCanvasMutation(page)
  await page.getByRole('menuitem', { name: '脚本 V2', exact: true }).click()
  await persisted

  const node = page.locator('[data-node-type="script"]').first()
  persisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await persisted

  const workspace = page.getByTestId('script-v2-workspace')
  await expect(workspace).toBeVisible()
  return workspace
}

test('script v2 reorders added shots atomically and preserves stable identities after reload', async ({ page }) => {
  const workspace = await openManualScriptWorkspace(page)

  // Create a three-row sequence through the user-facing control, then record
  // the persisted identifiers before any order mutation.
  for (let index = 0; index < 2; index += 1) {
    const persisted = waitForCanvasMutation(page)
    await workspace.getByRole('button', { name: '添加镜头', exact: true }).click()
    await persisted
  }

  const before = await readScriptState(page)
  expect(before.rows).toHaveLength(3)
  expect(before.rows.map((row) => row.shotNumber)).toEqual([1, 2, 3])
  const [firstId, secondId, thirdId] = before.rows.map((row) => row.id)
  expect(new Set(before.rows.map((row) => row.id)).size).toBe(3)

  const requests: Array<{ mutations?: unknown[] }> = []
  const captureCanvasPost = (request: Request) => {
    const url = new URL(request.url())
    if (request.method() !== 'POST' || !/^\/api\/canvases\/[^/]+$/.test(url.pathname)) return
    requests.push(request.postDataJSON() as { mutations?: unknown[] })
  }
  page.on('request', captureCanvasPost)

  const persisted = waitForCanvasMutation(page)
  await workspace
    .getByTestId(`script-v2-shot-row-${firstId}`)
    .getByRole('button', { name: '拖动镜头 1', exact: true })
    .dragTo(
      workspace
        .getByTestId(`script-v2-shot-row-${thirdId}`)
        .getByRole('button', { name: '拖动镜头 3', exact: true }),
    )
  await persisted
  page.off('request', captureCanvasPost)

  // A drag must be one document write containing one reducer mutation, rather
  // than an intermediate, externally visible partial order.
  expect(requests).toHaveLength(1)
  expect(requests[0].mutations).toHaveLength(1)

  const reordered = await readScriptState(page)
  expect(reordered.rows.map((row) => row.id)).toEqual([secondId, thirdId, firstId])
  expect(reordered.rows.map((row) => row.shotNumber)).toEqual([1, 2, 3])
  expect(new Set(reordered.rows.map((row) => row.id))).toEqual(new Set([firstId, secondId, thirdId]))

  await page.reload()
  await expect(page.getByTestId('script-v2-resource-card')).toBeVisible()
  await page.getByRole('button', { name: /打开脚本节点/ }).click()
  await expect(page.getByTestId('script-v2-workspace')).toBeVisible()

  const afterReload = await readScriptState(page)
  expect(afterReload.rows).toEqual(reordered.rows)
  const renderedRows = page.locator('[data-testid^="script-v2-shot-row-"]')
  await expect(renderedRows).toHaveCount(3)
  expect(await renderedRows.evaluateAll(
    (rows) => rows.map((row) => row.getAttribute('data-shot-id')),
  )).toEqual([secondId, thirdId, firstId])
})
