import { expect, test, type Page } from '@playwright/test'

type ScriptV2State = {
  activeStage: 'shots' | 'assets' | 'prompts'
  rows: Array<{
    id: string
    plotDescription: string
    imageGenerationPrompt: string
    videoMotionPrompt: string
    imagePromptState: string
    videoPromptState: string
  }>
  assets: {
    characters: Array<{ id: string; status: string; thumbnailUrl?: string }>
    scenes: Array<{ id: string }>
    props: Array<{ id: string }>
  }
  promptBatchRuns: Array<{ runId: string }>
}

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

async function readScriptState(page: Page): Promise<{ nodeTypes: string[]; state: ScriptV2State }> {
  const projectId = new URL(page.url()).searchParams.get('projectId')
  if (!projectId) throw new Error('projectId missing from canvas URL')
  const response = await page.request.get(`/api/projects/${projectId}`)
  expect(response.ok()).toBe(true)
  const payload = await response.json() as {
    canvases: Array<{
      document: {
        nodes: Array<{ type: string; data: { extra?: { scriptV2?: ScriptV2State } } }>
      }
    }>
  }
  const nodes = payload.canvases[0]?.document.nodes ?? []
  const state = nodes.find((node) => node.type === 'script')?.data.extra?.scriptV2
  if (!state) throw new Error('Script V2 state missing')
  return { nodeTypes: nodes.map((node) => node.type), state }
}

async function openManualWorkspace(page: Page) {
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
  return { node, workspace }
}

test('script v2 stage state table rebuilds revoked prompt gates and persists every forward projection', async ({ page }) => {
  await resetFixture(page)
  await openManualWorkspace(page)
  let persisted: ReturnType<typeof waitForCanvasMutation>

  // The shot gate is durable before entering the asset phase.
  await page.reload()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  const reloadedNode = page.locator('[data-node-type="script"]').first()
  await reloadedNode.getByRole('button', { name: /打开脚本节点/ }).click()
  const reloadedWorkspace = page.getByTestId('script-v2-workspace')
  await expect(reloadedWorkspace.getByRole('button', { name: '下一步：准备资产', exact: true })).toBeEnabled()

  persisted = waitForCanvasMutation(page)
  await reloadedWorkspace.getByRole('button', { name: '下一步：准备资产', exact: true }).click()
  await persisted
  await reloadedWorkspace.getByRole('button', { name: '新增角色', exact: true }).click()
  const assetDialog = reloadedWorkspace.getByRole('dialog', { name: '新增角色', exact: true })
  await assetDialog.getByRole('button', { name: 'AI生成', exact: true }).click()
  const assetForm = assetDialog.getByTestId('script-v2-asset-ai-form')
  await assetForm.getByPlaceholder('开始你的设计').fill('雨夜车站守灯人，电影感角色设定图')
  await assetForm.getByRole('button', { name: '确认生成', exact: true }).click()
  const assetCard = reloadedWorkspace.getByTestId('script-v2-asset-card')
  await expect(assetCard).toHaveCount(1)
  await expect(assetCard).toHaveAttribute('data-asset-status', 'ready')
  await expect(reloadedWorkspace.getByRole('button', { name: '下一步：合成提示词', exact: true })).toBeEnabled()

  // The asset gate, like the shot gate, projects identically after reload.
  await page.reload()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  const assetReloadNode = page.locator('[data-node-type="script"]').first()
  await assetReloadNode.getByRole('button', { name: /打开脚本节点/ }).click()
  const assetReloadWorkspace = page.getByTestId('script-v2-workspace')
  await expect(assetReloadWorkspace.getByRole('button', { name: '下一步：合成提示词', exact: true })).toBeEnabled()

  persisted = waitForCanvasMutation(page)
  await assetReloadWorkspace.getByRole('button', { name: '下一步：合成提示词', exact: true }).click()
  await persisted
  await expect(assetReloadWorkspace.getByTestId('script-v2-prompt-stage')).toBeVisible()
  await assetReloadWorkspace.getByRole('button', { name: '查看镜头 1 最终提示词', exact: true }).click()
  const promptDialog = page.getByTestId('script-v2-prompt-detail-dialog')
  const imagePrompt = promptDialog.getByRole('textbox', { name: '第 1 镜分镜图提示词', exact: true })
  const videoPrompt = promptDialog.getByRole('textbox', { name: '第 1 镜视频运动提示词', exact: true })
  await imagePrompt.fill('雨夜站台，守灯人与旅人，电影感构图。')
  persisted = waitForCanvasMutation(page)
  await imagePrompt.press('Tab')
  await persisted
  await videoPrompt.fill('镜头平稳推近，列车灯光掠过人物侧脸。')
  persisted = waitForCanvasMutation(page)
  await videoPrompt.press('Tab')
  await persisted
  await promptDialog.getByRole('button', { name: '关闭提示词', exact: true }).click()
  await expect(assetReloadWorkspace.getByRole('button', { name: '合成提示词 1/1 已合成', exact: true })).toBeVisible()

  // Completed phases remain reachable and visibly complete rather than being
  // one-way pages after the final forward action.
  for (const name of [/^确认镜头/, /^准备资产/, /^合成提示词/]) {
    persisted = waitForCanvasMutation(page)
    await assetReloadWorkspace.getByTestId('script-v2-stages').getByRole('button', { name }).click()
    await persisted
  }
  await expect(assetReloadWorkspace.getByTestId('script-v2-prompt-stage')).toBeVisible()

  await page.reload()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  const completeNode = page.locator('[data-node-type="script"]').first()
  await expect(completeNode.getByRole('button', { name: '批量生成分镜', exact: true })).toBeEnabled()
  await expect(completeNode.getByRole('button', { name: '批量生视频', exact: true })).toBeEnabled()
  await completeNode.getByRole('button', { name: /打开脚本节点/ }).click()
  const completeWorkspace = page.getByTestId('script-v2-workspace')
  await expect(completeWorkspace.getByRole('button', { name: '合成提示词 1/1 已合成', exact: true })).toBeVisible()

  persisted = waitForCanvasMutation(page)
  await completeWorkspace.getByTestId('script-v2-stages').getByRole('button', { name: /^确认镜头/ }).click()
  await persisted
  await expect(completeWorkspace.getByRole('button', { name: '下一步：准备资产', exact: true })).toBeEnabled()
  persisted = waitForCanvasMutation(page)
  await completeWorkspace.getByRole('button', { name: '下一步：准备资产', exact: true }).click()
  await persisted
  await expect(completeWorkspace.getByRole('button', { name: '下一步：合成提示词', exact: true })).toBeEnabled()

  // Editing a completed row revokes its image gate until the prompt is rebuilt.
  persisted = waitForCanvasMutation(page)
  await completeWorkspace.getByTestId('script-v2-stages').getByRole('button', { name: /^合成提示词/ }).click()
  await persisted
  await completeWorkspace.getByRole('button', { name: '查看镜头 1 最终提示词', exact: true }).click()
  const invalidatingPrompt = page.getByTestId('script-v2-prompt-detail-dialog')
  const invalidatingImage = invalidatingPrompt.getByRole('textbox', { name: '第 1 镜分镜图提示词', exact: true })
  await invalidatingImage.fill('')
  persisted = waitForCanvasMutation(page)
  await invalidatingImage.press('Tab')
  await persisted
  await invalidatingPrompt.getByRole('button', { name: '关闭提示词', exact: true }).click()
  await expect(completeWorkspace.getByRole('button', { name: '合成提示词 0/1 已合成', exact: true })).toBeVisible()
  await expect(completeNode.getByRole('button', { name: '批量生成分镜', exact: true })).toBeDisabled()
  // Only the edited image track is stale.  A confirmed video-motion track
  // remains independently materializable rather than being over-blocked.
  await expect(completeNode.getByRole('button', { name: '批量生视频', exact: true })).toBeEnabled()

  await page.reload()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  const invalidatedNode = page.locator('[data-node-type="script"]').first()
  await expect(invalidatedNode.getByRole('button', { name: '批量生成分镜', exact: true })).toBeDisabled()
  await expect(invalidatedNode.getByRole('button', { name: '批量生视频', exact: true })).toBeEnabled()
  await invalidatedNode.getByRole('button', { name: /打开脚本节点/ }).click()
  const invalidatedWorkspace = page.getByTestId('script-v2-workspace')
  await expect(invalidatedWorkspace.getByRole('button', { name: '合成提示词 0/1 已合成', exact: true })).toBeVisible()
  await invalidatedWorkspace.getByRole('button', { name: '查看镜头 1 最终提示词', exact: true }).click()
  const rebuiltPrompt = page.getByTestId('script-v2-prompt-detail-dialog')
  const rebuiltImage = rebuiltPrompt.getByRole('textbox', { name: '第 1 镜分镜图提示词', exact: true })
  await rebuiltImage.fill('雨夜站台，守灯人与旅人，列车灯光掠过侧脸。')
  persisted = waitForCanvasMutation(page)
  await rebuiltImage.press('Tab')
  await persisted
  await rebuiltPrompt.getByRole('button', { name: '关闭提示词', exact: true }).click()

  await expect(invalidatedNode.getByRole('button', { name: '批量生成分镜', exact: true })).toBeEnabled()
  await expect(invalidatedNode.getByRole('button', { name: '批量生视频', exact: true })).toBeEnabled()
  const { nodeTypes, state } = await readScriptState(page)
  expect(nodeTypes).toEqual(['script'])
  expect(state.rows).toEqual([
    expect.objectContaining({
      imagePromptState: 'user_edited',
      videoPromptState: 'user_edited',
    }),
  ])
  expect(state.rows[0].imageGenerationPrompt).toBeTruthy()
  expect(state.rows[0].videoMotionPrompt).toBeTruthy()
  expect(state.assets.characters).toHaveLength(1)
  expect(state.assets.characters[0]).toEqual(expect.objectContaining({ status: 'ready' }))
  expect(state.assets.scenes).toEqual([])
  expect(state.assets.props).toEqual([])
  expect(state.promptBatchRuns).toEqual([])
})
