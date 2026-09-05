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

type PromptState = {
  activeStage: string
  rows: Array<{
    id: string
    imageGenerationPrompt: string
    videoMotionPrompt: string
    imagePromptState: string
    videoPromptState: string
  }>
  promptBatchRuns: Array<{
    status: string
    batches: Array<{ status: string; error?: string }>
  }>
}

async function readPromptState(page: Page): Promise<PromptState> {
  const projectId = new URL(page.url()).searchParams.get('projectId')
  if (!projectId) throw new Error('projectId missing from canvas URL')
  const response = await page.request.get(`/api/projects/${projectId}`)
  expect(response.ok()).toBe(true)
  const payload = await response.json() as {
    canvases: Array<{
      document: {
        nodes: Array<{ type: string; data: { extra?: { scriptV2?: PromptState } } }>
      }
    }>
  }
  const script = payload.canvases[0]?.document.nodes.find((node) => node.type === 'script')
  const state = script?.data.extra?.scriptV2
  if (!state) throw new Error('Script V2 prompt state missing')
  return state
}

async function openManualPromptWorkspace(page: Page) {
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
  const promptStagePersisted = waitForCanvasMutation(page)
  await workspace.getByTestId('script-v2-stages').getByRole('button', { name: /^合成提示词 0\/1 已合成/ }).click()
  await promptStagePersisted
  await expect(workspace.getByTestId('script-v2-prompt-stage')).toBeVisible()
  return { node, workspace }
}

test('script v2 prompt tracks retain failure, retry, gates, and completion through reload', async ({ page }) => {
  await resetFixture(page)
  const { node, workspace } = await openManualPromptWorkspace(page)

  const imageAction = node.getByRole('button', { name: '批量生成分镜', exact: true })
  const videoAction = node.getByRole('button', { name: '批量生视频', exact: true })
  await expect(imageAction).toBeDisabled()
  await expect(imageAction).toHaveAttribute('title', '有 1 个镜头缺少分镜图提示词')
  await expect(videoAction).toBeDisabled()
  await expect(videoAction).toHaveAttribute('title', '有 1 个镜头缺少视频运动提示词')

  await workspace.getByRole('button', { name: '查看镜头 1 最终提示词', exact: true }).click()
  const dialog = page.getByTestId('script-v2-prompt-detail-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('script-v2-image-prompt-status')).toHaveText('未生成')
  await expect(dialog.getByTestId('script-v2-video-prompt-status')).toHaveText('未生成')

  let promptRequests = 0
  await page.route('**/api/script-v2/runs', async (route) => {
    const request = route.request()
    const operation = request.method() === 'POST'
      ? (request.postDataJSON() as { operation?: string }).operation
      : null
    if (operation !== 'recompute-prompts') {
      await route.continue()
      return
    }
    promptRequests += 1
    if (promptRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'SERVICE_UNAVAILABLE', message: '本地提示词失败夹具' },
          requestId: 'req_local_prompt_fixture',
        }),
      })
      return
    }
    await route.continue()
  })

  await dialog.getByRole('button', { name: '重新合成提示词', exact: true }).click()
  const failure = dialog.getByRole('alert')
  await expect(failure).toContainText('本地提示词失败夹具')
  await expect(failure.getByRole('button', { name: '重试', exact: true })).toBeEnabled()
  await expect(workspace.getByRole('button', { name: '合成提示词 0/1 已合成', exact: true })).toBeVisible()

  await expect.poll(async () => {
    const state = await readPromptState(page)
    const row = state.rows[0]
    const run = state.promptBatchRuns.at(-1)
    return {
      activeStage: state.activeStage,
      image: row?.imagePromptState,
      video: row?.videoPromptState,
      run: run?.status,
      batch: run?.batches[0]?.status,
      error: run?.batches[0]?.error,
    }
  }).toEqual({
    activeStage: 'prompts',
    image: 'none',
    video: 'none',
    run: 'failed',
    batch: 'pending',
    error: undefined,
  })
  await expect(imageAction).toBeDisabled()
  await expect(imageAction).toHaveAttribute('title', '有 1 个镜头缺少分镜图提示词')
  await expect(videoAction).toBeDisabled()
  await expect(videoAction).toHaveAttribute('title', '有 1 个镜头缺少视频运动提示词')

  await failure.getByRole('button', { name: '重试', exact: true }).click()
  await expect.poll(async () => {
    const state = await readPromptState(page)
    const row = state.rows[0]
    const run = state.promptBatchRuns.at(-1)
    return {
      image: row?.imagePromptState,
      video: row?.videoPromptState,
      imagePrompt: Boolean(row?.imageGenerationPrompt),
      videoPrompt: Boolean(row?.videoMotionPrompt),
      run: run?.status,
      batch: run?.batches[0]?.status,
    }
  }).toEqual({
    image: 'synced',
    video: 'synced',
    imagePrompt: true,
    videoPrompt: true,
    run: 'completed',
    batch: 'succeeded',
  })
  expect(promptRequests).toBe(2)
  await expect(workspace.getByRole('button', { name: '合成提示词 1/1 已合成', exact: true })).toBeVisible()
  await expect(dialog.getByTestId('script-v2-image-prompt-status')).toHaveText('已生成')
  await expect(dialog.getByTestId('script-v2-video-prompt-status')).toHaveText('已生成')
  await expect(imageAction).toBeEnabled()
  await expect(videoAction).toBeEnabled()

  await page.reload()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  const reloadedNode = page.locator('[data-node-type="script"]').first()
  await expect(reloadedNode.getByRole('button', { name: '批量生成分镜', exact: true })).toBeEnabled()
  await expect(reloadedNode.getByRole('button', { name: '批量生视频', exact: true })).toBeEnabled()
  await reloadedNode.getByRole('button', { name: /打开脚本节点/ }).click()
  const reloadedWorkspace = page.getByTestId('script-v2-workspace')
  await expect(reloadedWorkspace.getByRole('button', { name: '合成提示词 1/1 已合成', exact: true })).toBeVisible()
  const reloaded = await readPromptState(page)
  expect(reloaded.rows).toEqual([
    expect.objectContaining({ imagePromptState: 'synced', videoPromptState: 'synced' }),
  ])
  expect(reloaded.promptBatchRuns.at(-1)).toEqual(expect.objectContaining({ status: 'completed' }))
})
