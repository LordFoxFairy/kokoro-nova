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

async function readDocument(page: Page) {
  const projectId = new URL(page.url()).searchParams.get('projectId')
  if (!projectId) throw new Error('projectId missing from canvas URL')
  const response = await page.request.get(`/api/projects/${projectId}`)
  expect(response.ok()).toBe(true)
  const payload = await response.json() as {
    canvases: Array<{
      document: {
        nodes: Array<{
          type: string
          data: { extra?: { scriptV2?: { rows: Array<{ plotDescription: string }> } } }
        }>
      }
    }>
  }
  return payload.canvases[0].document
}

async function openManualWorkspace(page: Page) {
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
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await entrySaved

  const workspace = page.getByTestId('script-v2-workspace')
  await expect(workspace).toBeVisible()
  return { node, workspace }
}

test('script v2 durability preserves edited shots across reload, retains the asset gate, and commits materialization atomically', async ({ page }) => {
  await resetFixture(page)
  const { node, workspace } = await openManualWorkspace(page)

  await expect(node.getByRole('button', { name: '批量生成分镜', exact: true })).toBeDisabled()

  await workspace.getByRole('button', { name: '编辑镜头 1 画面描述', exact: true }).click()
  const editor = workspace.getByRole('dialog', { name: '编辑画面描述', exact: true })
  const description = '雨夜车站中，旅人将旧录音带交给守灯人。'
  const input = editor.getByRole('textbox', { name: '画面描述', exact: true })
  await input.fill(description)
  const editedSaved = waitForCanvasMutation(page)
  await input.press('Tab')
  await editedSaved

  const assetsStageSaved = waitForCanvasMutation(page)
  await workspace.getByTestId('script-v2-stages').getByRole('button', { name: /^准备资产/ }).click()
  await assetsStageSaved
  const assetAdded = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: '新增角色', exact: true }).click()
  await assetAdded
  const assetDialog = workspace.getByRole('dialog', { name: '新增角色', exact: true })
  await expect(assetDialog).toBeVisible()
  await expect(workspace.getByRole('button', { name: '下一步：合成提示词', exact: true })).toBeDisabled()
  await assetDialog.getByRole('button', { name: '关闭', exact: true }).click()

  const promptsStageSaved = waitForCanvasMutation(page)
  await workspace.getByTestId('script-v2-stages').getByRole('button', { name: /^合成提示词/ }).click()
  await promptsStageSaved
  await workspace.getByRole('button', { name: '查看镜头 1 最终提示词', exact: true }).click()
  const promptDialog = page.getByTestId('script-v2-prompt-detail-dialog')
  await promptDialog.getByRole('radio', { name: '自动拼接', exact: true }).check()
  const promptSaved = waitForCanvasMutation(page)
  await promptDialog.getByRole('button', { name: '重新合成提示词', exact: true }).click()
  await promptSaved
  await promptDialog.getByRole('button', { name: '关闭提示词', exact: true }).click()

  const beforeMaterialize = await readDocument(page)
  expect(beforeMaterialize.nodes.filter((candidate) => candidate.type === 'image')).toHaveLength(0)
  await workspace.getByTestId('script-v2-batch-image').click()
  const materialize = page.getByTestId('script-v2-batch-materialize-dialog')
  await expect(materialize.getByRole('button', { name: '确认生成', exact: true })).toBeEnabled()
  await materialize.getByTestId('script-v2-batch-cancel').click()
  await expect(materialize).toHaveCount(0)
  const afterCancel = await readDocument(page)
  expect(afterCancel.nodes.filter((candidate) => candidate.type === 'image')).toHaveLength(0)

  await workspace.getByTestId('script-v2-batch-image').click()
  await expect(materialize).toBeVisible()
  const materialized = waitForCanvasMutation(page)
  await materialize.getByRole('button', { name: '确认生成', exact: true }).click()
  await materialized

  await expect(materialize).toHaveCount(0)
  const committed = await readDocument(page)
  expect(committed.nodes.filter((candidate) => candidate.type === 'image')).toHaveLength(1)
  expect(committed.nodes.find((candidate) => candidate.type === 'script')?.data.extra?.scriptV2?.rows)
    .toEqual([expect.objectContaining({ plotDescription: description })])

  await page.reload()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  const reloaded = await readDocument(page)
  expect(reloaded.nodes.filter((candidate) => candidate.type === 'image')).toHaveLength(1)
  expect(reloaded.nodes.find((candidate) => candidate.type === 'script')?.data.extra?.scriptV2?.rows)
    .toEqual([expect.objectContaining({ plotDescription: description })])
})
