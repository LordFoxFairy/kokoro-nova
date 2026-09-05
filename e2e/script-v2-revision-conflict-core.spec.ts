import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

type ScriptRow = { id: string; plotDescription: string }
type ScriptState = { rows: ScriptRow[] }
type ScriptNode = {
  id: string
  type: string
  data: {
    extra?: { scriptV2?: ScriptState }
    [key: string]: unknown
  }
}
type CanvasSnapshot = {
  canvas: {
    id: string
    revision: number
    document: { nodes: ScriptNode[] }
  }
}

async function resetFixture(page: Page) {
  const selected = await page.request.post('/api/dev/scenario', {
    data: { scenarioId: 'authenticated-empty' },
  })
  expect(selected.ok()).toBe(true)
  const reset = await page.request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)
}

function waitForCanvasWrite(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'POST' && /^\/api\/canvases\/[^/]+$/.test(url.pathname)
  })
}

async function readCanvas(request: APIRequestContext, canvasId: string): Promise<CanvasSnapshot> {
  const response = await request.get(`/api/canvases/${canvasId}`)
  expect(response.ok()).toBe(true)
  return (await response.json()) as CanvasSnapshot
}

async function openManualScriptWorkspace(page: Page) {
  await page.goto('/project')
  await page.getByTestId('start-create').click()
  await page.waitForURL(/\/canvas\?projectId=/)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '脚本', exact: true }).hover()
  const nodeSaved = waitForCanvasWrite(page)
  await page.getByRole('menuitem', { name: '脚本 V2', exact: true }).click()
  expect((await nodeSaved).ok()).toBe(true)

  const node = page.locator('[data-node-type="script"]').first()
  const entrySaved = waitForCanvasWrite(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  expect((await entrySaved).ok()).toBe(true)

  const workspace = page.getByTestId('script-v2-workspace')
  await expect(workspace).toBeVisible()
  return workspace
}

async function bobUpdatesSameShot(
  request: APIRequestContext,
  canvasId: string,
  scriptNodeId: string,
  plotDescription: string,
) {
  const current = await readCanvas(request, canvasId)
  const script = current.canvas.document.nodes.find((node) => node.id === scriptNodeId)
  if (!script?.data.extra?.scriptV2) throw new Error('Script V2 node is missing')

  const remoteState: ScriptState = structuredClone(script.data.extra.scriptV2)
  remoteState.rows[0] = { ...remoteState.rows[0], plotDescription }
  const response = await request.post(`/api/canvases/${canvasId}`, {
    data: {
      canvasId,
      expectedRevision: current.canvas.revision,
      mutations: [{
        op: 'updateNode',
        nodeId: scriptNodeId,
        patch: {
          data: {
            ...script.data,
            extra: { ...script.data.extra, scriptV2: remoteState },
          },
        },
      }],
      label: 'Bob 更新镜头 1 画面描述',
    },
  })
  expect(response.ok()).toBe(true)
}

test('two browser contexts retain Bob\'s same-field Script V2 revision until Alice explicitly reapplies her stale draft', async ({ browser }) => {
  const aliceContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const bobContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()

  try {
    await resetFixture(alice)
    const workspace = await openManualScriptWorkspace(alice)
    const canvasId = new URL(alice.url()).searchParams.get('canvasId')
    if (!canvasId) throw new Error('canvasId missing from Script V2 route')
    const initial = await readCanvas(alice.request, canvasId)
    const script = initial.canvas.document.nodes.find((node) => node.type === 'script')
    if (!script) throw new Error('Script V2 node missing')

    await bob.goto(alice.url())
    await expect(bob.getByTestId('workflow-canvas')).toBeVisible()
    await expect(bob.getByTestId('presence-lease-blocked')).toBeVisible({ timeout: 20_000 })

    const localDraft = 'Alice 的本地草稿：雨夜站台的旅人缓缓转身。'
    await workspace.getByRole('button', { name: '编辑镜头 1 画面描述', exact: true }).click()
    const editor = workspace.getByRole('dialog', { name: '编辑画面描述', exact: true })
    const input = editor.getByRole('textbox', { name: '画面描述', exact: true })
    await input.fill(localDraft)

    const bobRevision = 'Bob 的远端修订：守灯人举起录音带，镜头推进。'
    await bobUpdatesSameShot(bob.request, canvasId, script.id, bobRevision)

    const staleWrite = waitForCanvasWrite(alice)
    await input.press('Tab')
    expect((await staleWrite).status()).toBe(409)

    const conflict = workspace.getByTestId('script-v2-row-conflict')
    await expect(conflict).toBeVisible({ timeout: 20_000 })
    await expect(conflict).toContainText('镜头 1 的画面描述已被其他协作者更新')
    await expect(conflict).toContainText('保留远端版本')
    await expect(conflict.getByRole('button', { name: '重新应用我的草稿', exact: true })).toBeVisible()

    const afterConflict = await readCanvas(alice.request, canvasId)
    const protectedRow = afterConflict.canvas.document.nodes.find((node) => node.id === script.id)
      ?.data.extra?.scriptV2?.rows[0]
    expect(protectedRow?.plotDescription).toBe(bobRevision)

    const recoveredWrite = waitForCanvasWrite(alice)
    await conflict.getByRole('button', { name: '重新应用我的草稿', exact: true }).click()
    expect((await recoveredWrite).ok()).toBe(true)
    await expect(conflict).toHaveCount(0)

    await alice.reload()
    await expect(alice.getByTestId('workflow-canvas')).toBeVisible()
    const reloaded = await readCanvas(alice.request, canvasId)
    const reloadedRow = reloaded.canvas.document.nodes.find((node) => node.id === script.id)
      ?.data.extra?.scriptV2?.rows[0]
    expect(reloadedRow?.plotDescription).toBe(localDraft)
  } finally {
    await aliceContext.close()
    await bobContext.close()
  }
})
