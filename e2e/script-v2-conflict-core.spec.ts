import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

type CanvasSnapshot = {
  canvas: {
    id: string
    revision: number
    document: {
      nodes: Array<{
        id: string
        type: string
        name: string
        data: { extra?: { scriptV2?: { rows: Array<{ plotDescription: string }> } } }
      }>
    }
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
  return { node, workspace }
}

async function readCanvas(request: APIRequestContext, canvasId: string): Promise<CanvasSnapshot> {
  const response = await request.get(`/api/canvases/${canvasId}`)
  expect(response.ok()).toBe(true)
  return (await response.json()) as CanvasSnapshot
}

async function remoteRenameScript(
  request: APIRequestContext,
  canvasId: string,
  scriptNodeId: string,
  name: string,
) {
  const current = await readCanvas(request, canvasId)
  const response = await request.post(`/api/canvases/${canvasId}`, {
    data: {
      canvasId,
      expectedRevision: current.canvas.revision,
      mutations: [{ op: 'updateNode', nodeId: scriptNodeId, patch: { name } }],
      label: '远端协作写入',
    },
  })
  expect(response.ok()).toBe(true)
}

test('script v2 conflict recovery retains a stale shot draft through two remote revisions without overwriting either client', async ({ browser }) => {
  const aliceContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const bobContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()

  try {
    await resetFixture(alice)
    const { node, workspace } = await openManualScriptWorkspace(alice)
    const canvasId = new URL(alice.url()).searchParams.get('canvasId')
    if (!canvasId) throw new Error('canvasId missing from Script V2 route')

    const before = await readCanvas(alice.request, canvasId)
    const scriptNode = before.canvas.document.nodes.find((candidate) => candidate.type === 'script')
    if (!scriptNode) throw new Error('Script V2 node missing')

    // The second browser is a genuine competing canvas session. Presence keeps
    // it as a follower, so its deterministic route write models the remote
    // revision that can otherwise arrive between this tab's save and replay.
    await bob.goto(alice.url())
    await expect(bob.getByTestId('presence-lease-blocked')).toBeVisible({ timeout: 20_000 })

    const remoteNames = ['远端第一次脚本更新', '远端第二次脚本更新']
    let interceptedLocalWrites = 0
    await alice.route(`**/api/canvases/${canvasId}`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      const name = remoteNames[interceptedLocalWrites]
      interceptedLocalWrites += 1
      if (name) await remoteRenameScript(bob.request, canvasId, scriptNode.id, name)
      await route.continue()
    })

    const localDraft = '本地镜头草稿在两次远端写入后仍可恢复。'
    await workspace.getByRole('button', { name: '编辑镜头 1 画面描述', exact: true }).click()
    const editor = workspace.getByRole('dialog', { name: '编辑画面描述', exact: true })
    const input = editor.getByRole('textbox', { name: '画面描述', exact: true })
    await input.fill(localDraft)
    await input.press('Tab')

    const recoveryToast = alice.getByTestId('toast').filter({ hasText: '已保留本次操作' })
    await expect(recoveryToast).toBeVisible({ timeout: 20_000 })
    await expect(recoveryToast).toContainText('画布再次更新')
    await expect(recoveryToast.getByRole('button', { name: '重试保存', exact: true })).toBeVisible()
    expect(interceptedLocalWrites).toBe(2)

    const protectedRemote = await readCanvas(alice.request, canvasId)
    const remoteScript = protectedRemote.canvas.document.nodes.find((candidate) => candidate.id === scriptNode.id)
    expect(remoteScript?.name).toBe(remoteNames[1])
    expect(remoteScript?.data.extra?.scriptV2?.rows).toEqual([
      expect.objectContaining({ plotDescription: '' }),
    ])

    // The recovery action regenerates the Script V2 mutation against the
    // newest authoritative document. It must retain the remote rename while
    // committing the local row draft exactly once.
    await recoveryToast.getByRole('button', { name: '重试保存', exact: true }).dispatchEvent('click')
    await expect.poll(async () => {
      const recovered = await readCanvas(alice.request, canvasId)
      const recoveredScript = recovered.canvas.document.nodes.find((candidate) => candidate.id === scriptNode.id)
      return {
        name: recoveredScript?.name,
        plotDescription: recoveredScript?.data.extra?.scriptV2?.rows[0]?.plotDescription,
      }
    }, { timeout: 20_000 }).toEqual({ name: remoteNames[1], plotDescription: localDraft })

    await alice.reload()
    await expect(alice.getByTestId('workflow-canvas')).toBeVisible()
    const reloaded = await readCanvas(alice.request, canvasId)
    const reloadedScript = reloaded.canvas.document.nodes.find((candidate) => candidate.id === scriptNode.id)
    expect(reloadedScript?.name).toBe(remoteNames[1])
    expect(reloadedScript?.data.extra?.scriptV2?.rows).toEqual([
      expect.objectContaining({ plotDescription: localDraft }),
    ])
    await expect(node).toContainText(remoteNames[1])
  } finally {
    await aliceContext.close()
    await bobContext.close()
  }
})
