import { expect, test, type Page } from '@playwright/test'

async function resetFixture(page: Page) {
  const selected = await page.request.post('/api/dev/scenario', {
    data: { scenarioId: 'authenticated-empty' },
  })
  expect(selected.ok()).toBe(true)
  const reset = await page.request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)
}

function waitForCanvasMutation(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'POST' && /^\/api\/canvases\/[^/]+$/.test(url.pathname) && response.ok()
  })
}

type ScriptV2Document = {
  nodes: Array<{
    id: string
    type: string
    data: {
      extra?: {
        scriptV2?: {
          assets: {
            characters: Array<{
              id: string
              status: string
              error?: string
              thumbnailUrl?: string
              linkedNodeId?: string
            }>
          }
        }
      }
    }
  }>
}

async function readDocument(page: Page): Promise<ScriptV2Document> {
  const projectId = new URL(page.url()).searchParams.get('projectId')
  if (!projectId) throw new Error('projectId missing from canvas URL')
  const response = await page.request.get(`/api/projects/${projectId}`)
  expect(response.ok()).toBe(true)
  const payload = await response.json() as { canvases: Array<{ document: ScriptV2Document }> }
  return payload.canvases[0].document
}

async function openManualAssetWorkspace(page: Page) {
  await page.goto('/project')
  await page.getByTestId('start-create').click()
  await page.waitForURL(/\/canvas\?projectId=/)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '脚本', exact: true }).hover()
  const nodePersisted = waitForCanvasMutation(page)
  await page.getByRole('menuitem', { name: '脚本 V2', exact: true }).click()
  await nodePersisted

  const node = page.locator('[data-node-type="script"]').first()
  const entryPersisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await entryPersisted

  const workspace = page.getByTestId('script-v2-workspace')
  await expect(workspace).toBeVisible()
  const assetsPersisted = waitForCanvasMutation(page)
  await workspace.getByTestId('script-v2-stages').getByRole('button', { name: /^准备资产/ }).click()
  await assetsPersisted
  return workspace
}

test('script v2 retries a failed asset without duplicate cards, canvas nodes, or persisted partial media', async ({ page }) => {
  await resetFixture(page)
  const workspace = await openManualAssetWorkspace(page)

  const assetCreated = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: '新增角色', exact: true }).click()
  await assetCreated
  const sourceDialog = workspace.getByRole('dialog', { name: '新增角色', exact: true })

  let runRequests = 0
  await page.route('**/api/script-v2/runs', async (route) => {
    const request = route.request()
    const body = request.method() === 'POST'
      ? request.postDataJSON() as { operation?: string }
      : null
    if (body?.operation !== 'generate-asset') {
      await route.continue()
      return
    }
    runRequests += 1
    if (runRequests === 1) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: '本地资产失败夹具' }),
      })
      return
    }
    await route.continue()
  })

  await sourceDialog.getByRole('button', { name: 'AI生成', exact: true }).click()
  const firstForm = sourceDialog.getByTestId('script-v2-asset-ai-form')
  await firstForm.getByPlaceholder('开始你的设计').fill('雨夜车站的守灯人，电影感角色设定图')
  await expect(firstForm.getByRole('button', { name: '确认生成', exact: true })).toBeEnabled()
  await firstForm.getByRole('button', { name: '确认生成', exact: true }).click()

  const card = workspace.getByTestId('script-v2-asset-card')
  await expect(card).toHaveCount(1)
  await expect(card).toHaveAttribute('data-asset-status', 'failed')
  await expect(firstForm.getByRole('alert')).toContainText('本地资产失败夹具')

  const failedDocument = await readDocument(page)
  expect(failedDocument.nodes.map((node) => node.type)).toEqual(['script'])
  const failedAsset = failedDocument.nodes[0].data.extra?.scriptV2?.assets.characters[0]
  expect(failedAsset).toEqual(expect.objectContaining({
    status: 'failed',
    error: expect.stringContaining('本地资产失败夹具'),
  }))
  expect(failedAsset?.thumbnailUrl).toBeUndefined()
  expect(failedAsset?.linkedNodeId).toBeUndefined()
  const stableAssetId = failedAsset?.id
  expect(stableAssetId).toBeTruthy()
  await expect(workspace.getByRole('button', { name: '准备资产 0/1 已生成、还差 1 个', exact: true })).toBeVisible()

  await sourceDialog.getByRole('button', { name: '关闭', exact: true }).click()
  await card.getByRole('button', { name: '未命名角色 更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: 'AI 生角色', exact: true }).click()

  const retryDialog = workspace.getByRole('dialog', { name: '新增角色', exact: true })
  await retryDialog.getByRole('button', { name: 'AI生成', exact: true }).click()
  const retryForm = retryDialog.getByTestId('script-v2-asset-ai-form')
  await retryForm.getByPlaceholder('开始你的设计').fill('雨夜车站的守灯人，电影感角色设定图')
  await expect(retryForm.getByRole('button', { name: '确认生成', exact: true })).toBeEnabled()
  await retryForm.getByRole('button', { name: '确认生成', exact: true }).click()

  await expect(card).toHaveCount(1)
  await expect(card).toHaveAttribute('data-asset-status', 'ready')
  await expect(card.getByRole('img')).toBeVisible()
  await expect(workspace.getByRole('button', { name: '准备资产 1/1 已生成', exact: true })).toBeVisible()
  expect(runRequests).toBe(2)

  const recoveredDocument = await readDocument(page)
  expect(recoveredDocument.nodes.map((node) => node.type)).toEqual(['script'])
  const recoveredAssets = recoveredDocument.nodes[0].data.extra?.scriptV2?.assets.characters
  expect(recoveredAssets).toHaveLength(1)
  expect(recoveredAssets?.[0]).toEqual(expect.objectContaining({
    id: stableAssetId,
    status: 'ready',
    thumbnailUrl: expect.stringMatching(/^data:image\/svg\+xml/),
  }))
  expect(recoveredAssets?.[0].error).toBeUndefined()
  expect(recoveredAssets?.[0].linkedNodeId).toBeUndefined()

  await page.reload()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  const reloadedDocument = await readDocument(page)
  expect(reloadedDocument.nodes.map((node) => node.type)).toEqual(['script'])
  expect(reloadedDocument.nodes[0].data.extra?.scriptV2?.assets.characters).toEqual([
    expect.objectContaining({ id: stableAssetId, status: 'ready' }),
  ])
})
