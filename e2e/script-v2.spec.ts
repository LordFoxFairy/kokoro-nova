import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.beforeEach(async ({ request }) => {
  const selected = await request.post('/api/dev/scenario', {
    data: { scenarioId: 'authenticated-empty' },
  })
  expect(selected.ok()).toBe(true)
  const reset = await request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)
})

async function createProject(page: Page) {
  await page.goto('/project')
  await page.getByTestId('start-create').click()
  await page.waitForURL(/\/canvas\?projectId=/)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
}

async function openPopulatedProject(page: Page) {
  const selected = await page.request.post('/api/dev/scenario', {
    data: { scenarioId: 'authenticated-populated' },
  })
  expect(selected.ok()).toBe(true)
  await page.goto('/canvas?projectId=prj_video_demo&canvasId=can_video_main')
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
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

async function addScriptV2Node(page: Page) {
  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '脚本', exact: true }).hover()
  const persisted = waitForCanvasMutation(page)
  await page.getByRole('menuitem', { name: '脚本 V2', exact: true }).click()
  await persisted
  return page.locator('[data-node-type="script"]').first()
}

async function openGeneratedCharacterWorkspace(page: Page) {
  await openPopulatedProject(page)
  const node = await addScriptV2Node(page)
  const selectedEntry = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '角色生成分镜脚本', exact: true }).click()
  await selectedEntry

  const generator = page.getByTestId('script-v2-generator')
  await generator.getByPlaceholder('角色名称').fill('林默')
  await generator.getByPlaceholder('角色描述').fill('黑色风衣，短发')
  await generator.getByPlaceholder('角色前提（选填）').fill('寻找失落的录音带')
  await generator.getByPlaceholder('描述剧情片段、故事，为你生成分镜脚本').fill(
    '@林默 在雨夜车站发现一盘旧录音带，远处列车缓慢驶来。',
  )
  await generator.getByRole('button', { name: '生成分镜脚本', exact: true }).click()

  const resource = node.getByTestId('script-v2-resource-card')
  await expect(resource).toBeVisible({ timeout: 20_000 })
  await expect.poll(async () => {
    const state = await readScriptV2State(page) as {
      rows: unknown[]
      assets: { characters: Array<{ name: string }> }
    }
    return { rows: state.rows.length, names: state.assets.characters.map((asset) => asset.name) }
  }).toEqual({ rows: 4, names: ['林默'] })
  await resource.getByRole('button', { name: /打开脚本节点/ }).click()
  const workspace = page.getByTestId('script-v2-workspace')
  await expect(workspace).toBeVisible()
  const persisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: /准备资产/ }).click()
  await persisted
  return workspace
}

async function persistCanvasZoom(page: Page, zoom: number) {
  const projectId = new URL(page.url()).searchParams.get('projectId')
  if (!projectId) throw new Error('projectId missing from canvas URL')
  const response = await page.request.get(`/api/projects/${projectId}`)
  expect(response.ok()).toBe(true)
  const payload = (await response.json()) as {
    canvases: Array<{
      id: string
      revision: number
      document: {
        viewport: { x: number; y: number; zoom: number }
        nodes: Array<{ type: string; position: { x: number; y: number }; size: { width: number; height: number } }>
      }
    }>
  }
  const canvas = payload.canvases[0]
  const node = canvas.document.nodes.find((candidate) => candidate.type === 'script')
  if (!node) throw new Error('Script V2 node missing')
  const viewport = {
    x: 720 - (node.position.x + node.size.width / 2) * zoom,
    y: 250 - (node.position.y + node.size.height / 2) * zoom,
    zoom,
  }
  const persisted = await page.request.post(`/api/canvases/${canvas.id}`, {
    data: {
      canvasId: canvas.id,
      expectedRevision: canvas.revision,
      mutations: [{ op: 'setViewport', viewport }],
      label: `测试 ${zoom * 100}% 缩放`,
    },
  })
  expect(persisted.ok()).toBe(true)
  await page.reload()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
}

async function readScriptV2State(page: Page) {
  const projectId = new URL(page.url()).searchParams.get('projectId')
  if (!projectId) throw new Error('projectId missing from canvas URL')
  const response = await page.request.get(`/api/projects/${projectId}`)
  expect(response.ok()).toBe(true)
  const payload = (await response.json()) as {
    canvases: Array<{
      document: {
        nodes: Array<{
          type: string
          data: { extra?: { scriptV2?: Record<string, unknown> } }
        }>
      }
    }>
  }
  const script = payload.canvases[0]?.document.nodes.find((node) => node.type === 'script')
  if (!script?.data.extra?.scriptV2) throw new Error('Script V2 state missing')
  return script.data.extra.scriptV2
}

/**
 * Script V2 is a full-screen, high-density authoring surface.  Keep visual
 * regressions separate from the semantic flow assertions below: an interaction
 * can still pass after a panel silently drifts out of its documented geometry.
 */
async function expectVisualBaseline(page: Page, name: string) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.0001,
  })
}

test('script v2 node exposes the three exact entry paths in official order', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)

  await expect(node.getByTestId('script-v2-entry-list').getByRole('button')).toHaveText([
    '剧本生成分镜脚本',
    '角色生成分镜脚本',
    '自己编写分镜脚本',
  ])
})

test('script v2 generator exposes the observed model catalog and layered Escape behavior', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)

  const saved = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '剧本生成分镜脚本', exact: true }).click()
  await saved

  const generator = page.getByTestId('script-v2-generator')
  await expect(generator).toBeVisible()
  await expect(generator).toHaveAttribute('data-zoom-compensation', '1.00000')
  expect(Math.round((await generator.boundingBox())?.width ?? 0)).toBe(660)
  await expect(generator.getByPlaceholder('描述剧情片段、故事，为你生成分镜脚本')).toBeVisible()
  await expect(generator.getByRole('switch', { name: '翻译成英文' })).toBeChecked()
  await expect(generator.getByTestId('script-v2-quote')).toHaveText('6')
  await expect(generator.getByRole('button', { name: '生成分镜脚本', exact: true })).toBeDisabled()

  await generator.getByRole('button', { name: /GVLM 3\.1/ }).click()
  const catalog = page.getByTestId('script-v2-model-catalog')
  await expect(catalog).toBeVisible()
  await expect(catalog.getByTestId('script-v2-model-name')).toHaveText([
    'GVLM 3.1',
    'CVLM 5.5',
    'GVLM 3.1 Flash',
  ])
  await expect(catalog.getByTestId('script-v2-model-latency')).toHaveText(['20s', '10s', '15s'])

  await page.keyboard.press('Escape')
  await expect(catalog).toHaveCount(0)
  await expect(generator).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(generator).toHaveCount(0)
  await expect(node.locator('[data-testid^="node-shell-"]')).toHaveAttribute('data-selected', 'true')

  await page.keyboard.press('Escape')
  await expect(node.locator('[data-testid^="node-shell-"]')).toHaveAttribute('data-selected', 'false')
})

test('script v2 generator remains 660px wide at 25, 50 and 100 percent canvas zoom', async ({ page }) => {
  await createProject(page)
  let node = await addScriptV2Node(page)
  let saved = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '剧本生成分镜脚本', exact: true }).click()
  await saved

  for (const [zoom, compensation] of [
    [1, '1.00000'],
    [0.5, '2.00000'],
    [0.25, '4.00000'],
  ] as const) {
    if (zoom !== 1) {
      await persistCanvasZoom(page, zoom)
      node = page.locator('[data-node-type="script"]').first()
      saved = waitForCanvasMutation(page)
      await node.getByRole('button', { name: '剧本生成分镜脚本', exact: true }).click()
      await saved
    }
    const generator = page.getByTestId('script-v2-generator')
    await expect(generator).toHaveAttribute('data-zoom-compensation', compensation)
    expect(Math.round((await generator.boundingBox())?.width ?? 0)).toBe(660)
  }
})

test('script v2 node character entry persists its role asset and exposes the resource toolbar', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  const selectedEntry = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '角色生成分镜脚本', exact: true }).click()
  await selectedEntry

  const generator = page.getByTestId('script-v2-generator')
  await expect(generator.getByTestId('script-v2-character-section')).toBeVisible()
  const submit = generator.getByRole('button', { name: '生成分镜脚本', exact: true })
  await expect(submit).toBeDisabled()
  await generator.getByPlaceholder('角色名称').fill('林默')
  await generator.getByPlaceholder('角色描述').fill('黑色风衣，短发')
  await generator.getByPlaceholder('角色前提（选填）').fill('寻找失落的录音带')
  await generator.getByPlaceholder('描述剧情片段、故事，为你生成分镜脚本').fill(
    '@林默 在雨夜车站发现一盘旧录音带，远处列车缓慢驶来。',
  )
  await expect(submit).toBeEnabled()
  await submit.click()

  const resource = node.getByTestId('script-v2-resource-card')
  await expect(resource).toBeVisible({ timeout: 20_000 })
  await expect(resource).toContainText('已完成 · 4 个镜头')
  await expect(resource.getByRole('button', { name: /打开脚本节点/ })).toBeVisible()

  const toolbar = resource.getByTestId('script-v2-resource-toolbar')
  await expect(toolbar.getByRole('button')).toHaveText([
    '重新生成',
    '批量生成分镜',
    '批量生视频',
    '下载',
  ])
  await expect(toolbar.getByRole('button', { name: '批量生成分镜', exact: true })).toBeEnabled()
  await expect(toolbar.getByRole('button', { name: '批量生视频', exact: true }))
    .toBeDisabled()
  await expect(toolbar.getByRole('button', { name: '批量生视频', exact: true }))
    .toHaveAttribute('title', '有 1 个资产尚未准备完成')

  const downloadStarted = page.waitForEvent('download')
  await toolbar.getByRole('button', { name: '下载', exact: true }).click()
  const download = await downloadStarted
  expect(download.suggestedFilename()).toMatch(/^script-v2-.*\.csv$/)
  const path = await download.path()
  if (!path) throw new Error('CSV download path missing')
  const csv = await readFile(path)
  expect([...csv.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  expect(csv.toString('utf8')).toContain('"镜头编号","时长（秒）","景别"')

  await toolbar.getByRole('button', { name: '重新生成', exact: true }).click()
  const reopened = page.getByTestId('script-v2-generator')
  await expect(reopened).toBeVisible()
  await expect(reopened.getByPlaceholder('描述剧情片段、故事，为你生成分镜脚本')).toHaveValue(
    '@林默 在雨夜车站发现一盘旧录音带，远处列车缓慢驶来。',
  )

  const state = await readScriptV2State(page)
  expect(state.entry).toBe('character')
  expect((state.assets as { characters: Array<{ name: string; description: string }> }).characters).toEqual([
    expect.objectContaining({ name: '林默', description: '黑色风衣，短发' }),
  ])

  await page.reload()
  await expect(page.getByTestId('script-v2-resource-card')).toContainText('4 个镜头')
})

test('script v2 node manual entry creates one blank medium five-second shot and opens its workspace', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  const persisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await persisted

  const workspace = page.getByTestId('script-v2-workspace')
  await expect(workspace).toBeVisible()
  await expect(workspace).toContainText('镜头 1')
  await expect(workspace).toContainText('5 秒')
  await expect(workspace).toContainText('中景')

  const state = await readScriptV2State(page)
  expect(state.entry).toBe('manual')
  expect(state.rows).toEqual([
    expect.objectContaining({ shotNumber: 1, durationSeconds: 5, shotSize: '中景', plotDescription: '' }),
  ])
})

test('script v2 stage 1 exposes the observed stage metrics, semantic headers and footer actions', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  const persisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await persisted

  const workspace = page.getByTestId('script-v2-workspace')
  const stages = workspace.getByTestId('script-v2-stages').getByRole('button')
  await expect(stages.nth(0)).toHaveAccessibleName('确认镜头 1个镜头已就绪')
  await expect(stages.nth(1)).toHaveAccessibleName('准备资产 0/0 已生成')
  await expect(stages.nth(2)).toHaveAccessibleName('合成提示词 0/1 已合成')
  await expect(workspace.getByText('2/3 完成后可批量生视频', { exact: true })).toBeVisible()
  await expect(workspace.getByRole('button', { name: '关闭 (ESC)', exact: true })).toBeVisible()
  await expect(workspace.getByRole('columnheader')).toHaveText([
    '镜号',
    '时长',
    '画面描述',
    '景别',
    '光影氛围',
    '对白·旁白',
    '音效',
    '运镜',
    '最终提示词',
    '操作',
  ])
  await expect(workspace.getByRole('button', { name: '添加镜头', exact: true })).toBeVisible()
  const next = workspace.getByRole('button', { name: '下一步：准备资产', exact: true })
  await expect(next).toBeEnabled()
  const stageSaved = waitForCanvasMutation(page)
  await next.click()
  await stageSaved
  await expect(workspace.getByTestId('script-v2-assets')).toBeVisible()
})

test('script v2 prompt stage exposes the dual-track single-shot compose surface', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  const persisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await persisted

  const workspace = page.getByTestId('script-v2-workspace')
  const stageSaved = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: /合成提示词 0\/1 已合成/ }).click()
  await stageSaved

  const promptStage = workspace.getByTestId('script-v2-prompt-stage')
  await expect(promptStage).toBeVisible()
  await promptStage.getByRole('button', { name: '查看镜头 1 最终提示词', exact: true }).click()

  const dialog = page.getByTestId('script-v2-prompt-detail-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: '第 1 镜：最终提示词', exact: true })).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: '第 1 镜分镜图提示词', exact: true })).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: '第 1 镜视频运动提示词', exact: true })).toBeVisible()
  await expect(dialog.getByTestId('script-v2-image-prompt-status')).toHaveText('未生成')
  await expect(dialog.getByTestId('script-v2-video-prompt-status')).toHaveText('未生成')
  await expect(dialog.getByRole('radio', { name: '智能合成', exact: true })).toBeChecked()
  await expect(dialog.getByRole('radio', { name: '自动拼接', exact: true })).not.toBeChecked()
  await expect(dialog.getByRole('button', { name: '提示词模型 GVLM 3.1', exact: true })).toBeVisible()
  await expect(dialog.getByTestId('script-v2-prompt-quote')).toHaveText('6')

  await page.getByTestId('script-v2-prompt-detail-dialog-backdrop').click({ position: { x: 8, y: 8 } })
  await expect(dialog).toBeVisible()
})

test('script v2 automatic prompt composition is local, reversible and conflict-aware', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  let persisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await persisted

  const workspace = page.getByTestId('script-v2-workspace')
  await workspace.getByRole('button', { name: '编辑镜头 1 画面描述', exact: true }).click()
  const sourceEditor = workspace.getByRole('dialog', { name: '编辑画面描述', exact: true })
  const sourceInput = sourceEditor.getByRole('textbox', { name: '画面描述', exact: true })
  await sourceInput.fill('雨夜车站里，林夏拾起一盘旧录音带。')
  persisted = waitForCanvasMutation(page)
  await sourceInput.press('Tab')
  await persisted

  persisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: /合成提示词 0\/1 已合成/ }).click()
  await persisted
  const stage = workspace.getByTestId('script-v2-prompt-stage')
  await stage.getByRole('button', { name: '查看镜头 1 最终提示词', exact: true }).click()

  const dialog = page.getByTestId('script-v2-prompt-detail-dialog')
  const auto = dialog.getByRole('radio', { name: '自动拼接', exact: true })
  await auto.check()
  await expect(auto).toBeChecked()
  persisted = waitForCanvasMutation(page)
  await dialog.getByRole('button', { name: '重新合成提示词', exact: true }).click()
  await persisted

  await expect(dialog.getByRole('textbox', { name: '第 1 镜分镜图提示词', exact: true })).toHaveValue(/画面：雨夜车站里，林夏拾起一盘旧录音带。/)
  await expect(dialog.getByRole('textbox', { name: '第 1 镜视频运动提示词', exact: true })).toHaveValue(/镜头/)
  await expect(dialog.getByTestId('script-v2-image-prompt-status')).toHaveText('已生成')
  await expect(dialog.getByTestId('script-v2-video-prompt-status')).toHaveText('已生成')
  await expect(workspace.getByTestId('script-v2-prompt-undo')).toBeVisible()

  await dialog.getByRole('button', { name: '关闭提示词', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  persisted = waitForCanvasMutation(page)
  await workspace.getByTestId('script-v2-prompt-undo').click()
  await persisted
  await expect(workspace.getByTestId('script-v2-prompt-undo')).toHaveCount(0)
  await stage.getByRole('button', { name: '查看镜头 1 最终提示词', exact: true }).click()
  const reopened = page.getByTestId('script-v2-prompt-detail-dialog')
  await expect(reopened.getByRole('textbox', { name: '第 1 镜分镜图提示词', exact: true })).toHaveValue('')
  await expect(reopened.getByRole('textbox', { name: '第 1 镜视频运动提示词', exact: true })).toHaveValue('')
})

test('script v2 batch prompt dialog selects partial/all shots and runs serial 20 plus 1 batches', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  let persisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await persisted

  const workspace = page.getByTestId('script-v2-workspace')
  for (let index = 0; index < 20; index += 1) {
    persisted = waitForCanvasMutation(page)
    await workspace.getByRole('button', { name: '添加镜头', exact: true }).click()
    await persisted
  }

  persisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: /合成提示词 0\/21 已合成/ }).click()
  await persisted
  const stage = workspace.getByTestId('script-v2-prompt-stage')
  await stage.getByRole('button', { name: '一键合成全部提示词', exact: true }).click()

  const dialog = page.getByTestId('script-v2-batch-prompt-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('已选0/21', { exact: true })).toBeVisible()
  const firstCheckbox = dialog.getByRole('checkbox', { name: '选择镜头 1', exact: true })
  await firstCheckbox.check()
  await expect(dialog.getByText('已选1/21', { exact: true })).toBeVisible()
  const firstDetails = dialog.getByRole('button', { name: '镜头 1 详情', exact: true })
  await firstDetails.click()
  await expect(dialog.getByText('分镜图提示词', { exact: true })).toBeVisible()

  const selectAll = dialog.getByRole('checkbox', { name: '全选镜头', exact: true })
  await selectAll.check()
  await expect(selectAll).toBeChecked()
  await expect(dialog.getByText('已选21/21', { exact: true })).toBeVisible()
  await expect(dialog.getByTestId('script-v2-prompt-quote')).toHaveText('12')

  persisted = waitForCanvasMutation(page)
  await dialog.getByRole('radio', { name: '自动拼接', exact: true }).check()
  await persisted
  await expect(dialog.getByRole('button', { name: /GVLM 3\.1/ })).toHaveCount(0)
  persisted = waitForCanvasMutation(page)
  await dialog.getByRole('radio', { name: '智能合成', exact: true }).check()
  await persisted
  await expect(dialog.getByRole('button', { name: /GVLM 3\.1/ })).toBeVisible()

  persisted = waitForCanvasMutation(page)
  await dialog.getByRole('button', { name: '确认合成', exact: true }).click()
  await persisted
  await expect.poll(async () => {
    const state = await readScriptV2State(page) as {
      promptBatchRuns: Array<{ status: string; batches: Array<{ shotIds: string[]; status: string }> }>
    }
    const run = state.promptBatchRuns.at(-1)
    return run ? { status: run.status, sizes: run.batches.map((batch) => [batch.shotIds.length, batch.status]) } : null
  }, { timeout: 20_000 }).toEqual({ status: 'completed', sizes: [[20, 'succeeded'], [1, 'succeeded']] })
  await expect(dialog.getByTestId('script-v2-prompt-batch-progress')).toContainText('1批 20镜 · 完成')
  await expect(dialog.getByTestId('script-v2-prompt-batch-progress')).toContainText('2批 1镜 · 完成')
})

test('script v2 shot table clamps duration and exposes every observed shot size', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  const persisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await persisted

  const workspace = page.getByTestId('script-v2-workspace')
  const duration = workspace.locator('button[aria-label^="镜头 1 时长"]')
  await duration.click()

  const durationEditor = workspace.getByRole('dialog', { name: '设置镜头时长', exact: true })
  await expect(durationEditor.getByText('范围 5–15 秒；失焦自动保存', { exact: true })).toBeVisible()
  const durationInput = durationEditor.getByRole('spinbutton', { name: '镜头时长（秒）', exact: true })
  await durationInput.fill('2')
  expect((await readScriptV2State(page)).rows).toEqual([
    expect.objectContaining({ durationSeconds: 5 }),
  ])
  await durationEditor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(durationEditor).toHaveCount(0)
  await expect(duration).toHaveAccessibleName('镜头 1 时长 5 秒')

  await duration.click()
  await durationEditor.getByRole('spinbutton', { name: '镜头时长（秒）', exact: true }).fill('99')
  let saved = waitForCanvasMutation(page)
  await durationEditor.getByRole('button', { name: '保存', exact: true }).click()
  await saved
  await expect(duration).toHaveAccessibleName('镜头 1 时长 15 秒')

  await workspace.getByRole('button', { name: '镜头 1 景别 中景', exact: true }).click()
  const shotSizes = workspace.getByRole('listbox', { name: '选择景别', exact: true })
  await expect(shotSizes.getByRole('option')).toHaveText([
    '大远景',
    '远景',
    '全景',
    '中远景',
    '中景',
    '中近景',
    '近景',
    '特写',
    '大特写',
    '头肩景',
    '半身景',
    '全身景',
  ])
  saved = waitForCanvasMutation(page)
  await shotSizes.getByRole('option', { name: '特写', exact: true }).click()
  await saved
  await expect(workspace.getByRole('button', { name: '镜头 1 景别 特写', exact: true })).toBeVisible()
})

test('script v2 shot table keeps text drafts local and autosaves them on blur', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  const persisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await persisted

  const workspace = page.getByTestId('script-v2-workspace')
  await workspace.getByRole('button', { name: '编辑镜头 1 画面描述', exact: true }).click()
  const editor = workspace.getByRole('dialog', { name: '编辑画面描述', exact: true })
  const input = editor.getByRole('textbox', { name: '画面描述', exact: true })
  await input.fill('雨夜车站里，林默俯身拾起一盘旧录音带。')

  expect((await readScriptV2State(page)).rows).toEqual([
    expect.objectContaining({ plotDescription: '' }),
  ])

  const saved = waitForCanvasMutation(page)
  await input.press('Tab')
  await saved
  expect((await readScriptV2State(page)).rows).toEqual([
    expect.objectContaining({ plotDescription: '雨夜车站里，林默俯身拾起一盘旧录音带。' }),
  ])
  await expect(workspace.getByRole('button', { name: '编辑镜头 1 画面描述', exact: true }))
    .toContainText('雨夜车站里，林默俯身拾起一盘旧录音带。')
})

test('script v2 shot table reorders once, manages color labels and confirms persisted deletion', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  let persisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await persisted

  const workspace = page.getByTestId('script-v2-workspace')
  persisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: '添加镜头', exact: true }).click()
  await persisted

  const before = await readScriptV2State(page) as {
    rows: Array<{ id: string; shotNumber: number; colorLabel: string | null }>
  }
  const [firstId, secondId] = before.rows.map((row) => row.id)
  const mutationBodies: Array<{ mutations?: unknown[] }> = []
  const captureMutation = (request: import('@playwright/test').Request) => {
    const url = new URL(request.url())
    if (request.method() !== 'POST' || !/^\/api\/canvases\/[^/]+$/.test(url.pathname)) return
    mutationBodies.push(request.postDataJSON() as { mutations?: unknown[] })
  }
  page.on('request', captureMutation)

  persisted = waitForCanvasMutation(page)
  await workspace
    .getByTestId(`script-v2-shot-row-${firstId}`)
    .getByRole('button', { name: '拖动镜头 1', exact: true })
    .dragTo(
      workspace
        .getByTestId(`script-v2-shot-row-${secondId}`)
        .getByRole('button', { name: '拖动镜头 2', exact: true }),
    )
  await persisted
  page.off('request', captureMutation)

  expect(mutationBodies).toHaveLength(1)
  expect(mutationBodies[0].mutations).toHaveLength(1)
  let state = await readScriptV2State(page) as typeof before
  expect(state.rows.map((row) => row.id)).toEqual([secondId, firstId])
  expect(state.rows.map((row) => row.shotNumber)).toEqual([1, 2])

  const firstStableRow = workspace.getByTestId(`script-v2-shot-row-${firstId}`)
  await firstStableRow.getByRole('button', { name: '镜头 2 行操作', exact: true }).click()
  const rowMenu = workspace.getByRole('menu', { name: '镜头行操作', exact: true })
  await expect(rowMenu.getByRole('menuitem')).toHaveText([
    '清除颜色',
    '红色',
    '黄色',
    '绿色',
    '蓝色',
    '灰色',
    '删除镜头',
  ])
  persisted = waitForCanvasMutation(page)
  await rowMenu.getByRole('menuitem', { name: '红色', exact: true }).click()
  await persisted
  await expect(firstStableRow).toHaveAttribute('data-color-label', 'red')

  await firstStableRow.getByRole('button', { name: '镜头 2 行操作', exact: true }).click()
  persisted = waitForCanvasMutation(page)
  await workspace.getByRole('menuitem', { name: '清除颜色', exact: true }).click()
  await persisted
  await expect(firstStableRow).toHaveAttribute('data-color-label', 'none')

  await firstStableRow.getByRole('button', { name: '镜头 2 行操作', exact: true }).click()
  await workspace.getByRole('menuitem', { name: '删除镜头', exact: true }).click()
  const confirm = page.getByTestId('confirm-dialog')
  await expect(confirm).toContainText('删除镜头 2？')
  await expect(confirm).toContainText('删除后其镜头编号会自动顺延，此操作可通过画布历史撤销。')
  persisted = waitForCanvasMutation(page)
  await confirm.getByRole('button', { name: '删除', exact: true }).click()
  await persisted

  state = await readScriptV2State(page) as typeof before
  expect(state.rows.map((row) => row.id)).toEqual([secondId])
  expect(state.rows.map((row) => row.shotNumber)).toEqual([1])

  await page.reload()
  await expect(page.getByTestId('script-v2-resource-card')).toBeVisible()
  await page.getByRole('button', { name: /打开脚本节点/ }).click()
  await expect(page.getByTestId('script-v2-workspace').locator('[data-testid^="script-v2-shot-row-"]')).toHaveCount(1)
  expect(((await readScriptV2State(page)) as typeof before).rows[0].id).toBe(secondId)
})

test('script v2 asset stage groups roles and keeps a pending card when its source dialog closes', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  let persisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await persisted

  const workspace = page.getByTestId('script-v2-workspace')
  persisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: /准备资产/ }).click()
  await persisted

  for (const [section, addLabel] of [
    ['角色', '新增角色'],
    ['场景', '新增场景'],
    ['道具', '新增道具'],
  ] as const) {
    const region = workspace.getByRole('region', { name: section, exact: true })
    await expect(region).toBeVisible()
    await expect(region.getByRole('button', { name: addLabel, exact: true })).toBeVisible()
  }

  persisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: '新增角色', exact: true }).click()
  await persisted

  const sourceDialog = workspace.getByRole('dialog', { name: '新增角色', exact: true })
  await expect(sourceDialog.getByTestId('script-v2-asset-sources').getByRole('button')).toHaveText([
    'AI生成',
    '从当前画布选择',
    '本地上传',
    '个人资产库',
  ])
  await expect(workspace.getByRole('button', { name: '准备资产 0/1 已生成、还差 1 个', exact: true })).toBeVisible()
  const pending = workspace.getByTestId('script-v2-asset-card').first()
  await expect(pending).toContainText('待创建')

  await sourceDialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(sourceDialog).toHaveCount(0)
  await expect(pending).toBeVisible()
  await expect(workspace.getByRole('button', { name: '下一步：合成提示词', exact: true })).toBeDisabled()

  persisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: /合成提示词 0\/1 已合成/ }).click()
  await persisted
  await expect(workspace.getByTestId('script-v2-prompt-stage')).toBeVisible()
  expect((await readScriptV2State(page)).activeStage).toBe('prompts')
})

test('script v2 asset AI form quotes observed defaults and generates a ready local preview', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  let persisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await persisted

  const workspace = page.getByTestId('script-v2-workspace')
  persisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: /准备资产/ }).click()
  await persisted
  persisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: '新增角色', exact: true }).click()
  await persisted

  const quoteResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/script-v2/quotes' &&
    response.ok(),
  )
  const sourceDialog = workspace.getByRole('dialog', { name: '新增角色', exact: true })
  await sourceDialog.getByRole('button', { name: 'AI生成', exact: true }).click()
  await quoteResponse

  const aiForm = sourceDialog.getByTestId('script-v2-asset-ai-form')
  await expect(aiForm.getByRole('button', { name: '图片模型 Lib Image', exact: true })).toBeVisible()
  const quality = aiForm.getByRole('combobox', { name: '画质', exact: true })
  const resolution = aiForm.getByRole('combobox', { name: '分辨率', exact: true })
  const ratio = aiForm.getByRole('combobox', { name: '画幅', exact: true })
  await expect(quality).toHaveValue('standard')
  await expect(quality.locator('option')).toHaveText(['低', '标准', '高'])
  await expect(resolution).toHaveValue('2K')
  await expect(resolution.locator('option')).toHaveText(['1K', '2K', '4K'])
  await expect(ratio).toHaveValue('2:1')
  for (const option of ['1:1', '2:1', '16:9']) {
    await expect(ratio.locator('option', { hasText: option })).toHaveCount(1)
  }
  await expect(aiForm.getByTestId('script-v2-asset-quote')).toHaveText('18')

  const submit = aiForm.getByRole('button', { name: '确认生成', exact: true })
  await expect(submit).toBeDisabled()
  await aiForm.getByPlaceholder('开始你的设计').fill('黑色风衣，短发，雨夜车站，电影级轮廓光')
  await expect(submit).toBeEnabled()
  await submit.click()

  const card = workspace.getByTestId('script-v2-asset-card').first()
  await expect(card).toHaveAttribute('data-asset-status', 'ready', { timeout: 20_000 })
  await expect(card.getByRole('img')).toBeVisible()
  await expect(workspace.getByRole('button', { name: '准备资产 1/1 已生成', exact: true })).toBeVisible()
  await expect(workspace.getByRole('button', { name: '下一步：合成提示词', exact: true })).toBeEnabled()

  const state = await readScriptV2State(page) as {
    assets: { characters: Array<{ description: string; thumbnailUrl: string; generation: Record<string, string> }> }
  }
  expect(state.assets.characters[0]).toEqual(expect.objectContaining({
    description: '黑色风衣，短发，雨夜车站，电影级轮廓光',
    thumbnailUrl: expect.stringMatching(/^data:image\/svg\+xml/),
    generation: expect.objectContaining({
      modelId: 'lib-image-2',
      quality: 'standard',
      resolution: '2K',
      aspectRatio: '2:1',
    }),
  }))
})

test('script v2 asset sources bind canvas, upload and personal-library images locally', async ({ page }) => {
  await openPopulatedProject(page)
  const node = await addScriptV2Node(page)
  let persisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await persisted

  const workspace = page.getByTestId('script-v2-workspace')
  persisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: /准备资产/ }).click()
  await persisted

  persisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: '新增角色', exact: true }).click()
  await persisted
  let sourceDialog = workspace.getByRole('dialog', { name: '新增角色', exact: true })
  await sourceDialog.getByRole('button', { name: '从当前画布选择', exact: true }).click()
  await expect(sourceDialog.getByRole('button', { name: '首帧图片', exact: true })).toBeVisible()
  persisted = waitForCanvasMutation(page)
  await sourceDialog.getByRole('button', { name: '首帧图片', exact: true }).click()
  await persisted

  persisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: '新增场景', exact: true }).click()
  await persisted
  sourceDialog = workspace.getByRole('dialog', { name: '新增场景', exact: true })
  const libraryResponse = page.waitForResponse((response) =>
    response.request().method() === 'GET' &&
    new URL(response.url()).pathname === '/api/assets' &&
    response.ok(),
  )
  await sourceDialog.getByRole('button', { name: '个人资产库', exact: true }).click()
  await libraryResponse
  await expect(sourceDialog.getByRole('button', { name: '雨夜城市首帧', exact: true })).toBeVisible()
  persisted = waitForCanvasMutation(page)
  await sourceDialog.getByRole('button', { name: '雨夜城市首帧', exact: true }).click()
  await persisted

  persisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: '新增道具', exact: true }).click()
  await persisted
  sourceDialog = workspace.getByRole('dialog', { name: '新增道具', exact: true })
  await sourceDialog.getByRole('button', { name: '本地上传', exact: true }).click()
  persisted = waitForCanvasMutation(page)
  await sourceDialog.getByLabel('选择本地图片').setInputFiles({
    name: '雨伞.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await persisted

  const cards = workspace.getByTestId('script-v2-asset-card')
  await expect(cards).toHaveCount(3)
  await expect.poll(() => cards.evaluateAll((items) => items.map((item) => item.getAttribute('data-asset-status'))))
    .toEqual(['ready', 'ready', 'ready'])
  await expect(workspace.getByRole('button', { name: '准备资产 3/3 已生成', exact: true })).toBeVisible()

  const state = await readScriptV2State(page) as {
    assets: {
      characters: Array<{ source: string; linkedNodeId?: string; thumbnailUrl?: string }>
      scenes: Array<{ source: string; sourceImageRef?: string; thumbnailUrl?: string }>
      props: Array<{ source: string; sourceImageRef?: string; thumbnailUrl?: string }>
    }
  }
  expect(state.assets.characters[0]).toEqual(expect.objectContaining({
    source: 'canvas',
    linkedNodeId: 'node_image_01',
    sourceImageRef: 'art_image_seed',
    thumbnailUrl: '/fixtures/libtv/media/first-frame.webp',
  }))
  expect(state.assets.scenes[0]).toEqual(expect.objectContaining({
    source: 'library',
    sourceImageRef: 'asset_image_seed',
    thumbnailUrl: '/fixtures/libtv/media/first-frame.webp',
  }))
  expect(state.assets.props[0]).toEqual(expect.objectContaining({
    source: 'upload',
    sourceImageRef: '雨伞.png',
    thumbnailUrl: expect.stringMatching(/^blob:/),
  }))
})

test('script v2 asset card edits details and exposes source-aware menu actions', async ({ page }) => {
  const workspace = await openGeneratedCharacterWorkspace(page)
  let card = workspace.getByTestId('script-v2-asset-card').first()

  await card.getByRole('button', { name: '林默 详情', exact: true }).click()
  const details = workspace.getByRole('dialog', { name: '编辑角色资产', exact: true })
  await details.getByRole('textbox', { name: '资产名称', exact: true }).fill('林墨')
  await details.getByRole('textbox', { name: '资产描述', exact: true }).fill('深灰色风衣，短发')
  let persisted = waitForCanvasMutation(page)
  await details.getByRole('button', { name: '保存修改', exact: true }).click()
  await persisted
  await expect(card).toContainText('林墨')

  await card.getByRole('button', { name: '林墨 更多操作', exact: true }).click()
  let menu = page.getByRole('menu', { name: '林墨资产操作', exact: true })
  await expect(menu.getByRole('menuitem')).toHaveText([
    '选择图片',
    'AI 生角色',
    '跳转至节点',
    '清除图片',
    '保存到个人资产',
    '删除',
  ])
  await expect(menu.getByRole('menuitem', { name: '跳转至节点', exact: true }))
    .toBeDisabled()
  await expect(menu.getByRole('menuitem', { name: '跳转至节点', exact: true }))
    .toHaveAttribute('title', '资产尚未关联画布节点')
  await expect(menu.getByRole('menuitem', { name: '清除图片', exact: true }))
    .toBeDisabled()
  await expect(menu.getByRole('menuitem', { name: '保存到个人资产', exact: true }))
    .toBeDisabled()

  await menu.getByRole('menuitem', { name: '选择图片', exact: true }).click()
  let sourceDialog = workspace.getByRole('dialog', { name: '新增角色', exact: true })
  await sourceDialog.getByRole('button', { name: '从当前画布选择', exact: true }).click()
  persisted = waitForCanvasMutation(page)
  await sourceDialog.getByRole('button', { name: '首帧图片', exact: true }).click()
  await persisted

  card = workspace.getByTestId('script-v2-asset-card').first()
  await card.getByRole('button', { name: '林墨 更多操作', exact: true }).click()
  menu = page.getByRole('menu', { name: '林墨资产操作', exact: true })
  await expect(menu.getByRole('menuitem', { name: '跳转至节点', exact: true })).toBeEnabled()
  await expect(menu.getByRole('menuitem', { name: '清除图片', exact: true })).toBeEnabled()
  await expect(menu.getByRole('menuitem', { name: '保存到个人资产', exact: true })).toBeEnabled()

  const savedToLibrary = page.waitForResponse((response) =>
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/assets' &&
    response.ok(),
  )
  persisted = waitForCanvasMutation(page)
  await menu.getByRole('menuitem', { name: '保存到个人资产', exact: true }).click()
  await Promise.all([savedToLibrary, persisted])

  await card.getByRole('button', { name: '林墨 更多操作', exact: true }).click()
  menu = page.getByRole('menu', { name: '林墨资产操作', exact: true })
  await expect(menu.getByRole('menuitem', { name: '保存到个人资产', exact: true }))
    .toBeDisabled()
  await expect(menu.getByRole('menuitem', { name: '保存到个人资产', exact: true }))
    .toHaveAttribute('title', '该图片已在个人资产库')

  persisted = waitForCanvasMutation(page)
  await menu.getByRole('menuitem', { name: '清除图片', exact: true }).click()
  await persisted
  await expect(card).toHaveAttribute('data-asset-status', 'pending')

  await card.getByRole('button', { name: '林墨 更多操作', exact: true }).click()
  menu = page.getByRole('menu', { name: '林墨资产操作', exact: true })
  await menu.getByRole('menuitem', { name: 'AI 生角色', exact: true }).click()
  sourceDialog = workspace.getByRole('dialog', { name: '新增角色', exact: true })
  await expect(sourceDialog.getByTestId('script-v2-asset-ai-form')).toBeVisible()
  await sourceDialog.getByRole('button', { name: '关闭', exact: true }).click()

  const state = await readScriptV2State(page) as {
    rows: Array<{
      plotDescription: string
      characters: Array<{ characterName: string }>
      imagePromptState: string
      videoPromptState: string
    }>
    assets: { characters: Array<{ source: string; thumbnailUrl?: string }> }
  }
  expect(state.rows.some((row) => row.plotDescription.includes('林墨'))).toBe(true)
  expect(state.rows.flatMap((row) => row.characters).every((ref) => ref.characterName === '林墨')).toBe(true)
  expect(state.assets.characters[0]).toMatchObject({ source: 'library' })
  expect(state.assets.characters[0]).not.toHaveProperty('thumbnailUrl')
  expect(state.rows.some((row) => ['stale', 'user_edited_stale'].includes(row.imagePromptState))).toBe(true)
})

for (const removal of [
  {
    mode: '仅删除资产，保留分镜中的文字',
    title: 'keep-text',
    keepsMention: true,
  },
  {
    mode: '同时从分镜角色列表中移除',
    title: 'remove-references',
    keepsMention: false,
  },
] as const) {
  test(`script v2 asset delete ${removal.title} reconciles ids and prompt staleness`, async ({ page }) => {
    const workspace = await openGeneratedCharacterWorkspace(page)
    const card = workspace.getByTestId('script-v2-asset-card').first()
    await card.getByRole('button', { name: '林默 更多操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '删除', exact: true }).click()

    const dialog = workspace.getByRole('dialog', { name: '删除「林默」', exact: true })
    await expect(dialog.getByRole('radio')).toHaveText([
      '仅删除资产，保留分镜中的文字仅解除资产引用，镜头中已经写好的文字保持不变。',
      '同时从分镜角色列表中移除同步移除镜头里的 @林默 引用文字和角色关联。',
    ])
    await dialog.getByRole('radio', { name: new RegExp(`^${removal.mode}`) }).click()
    const persisted = waitForCanvasMutation(page)
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click()
    await persisted
    await expect(card).toHaveCount(0)

    await expect.poll(async () => {
      const persistedState = await readScriptV2State(page) as { assets: { characters: unknown[] } }
      return persistedState.assets.characters.length
    }).toBe(0)

    const state = await readScriptV2State(page) as {
      rows: Array<{
        plotDescription: string
        characters: unknown[]
        plotDescriptionEntityRefs?: unknown[]
        imagePromptState: string
        videoPromptState: string
      }>
      assets: { characters: unknown[] }
    }
    expect(state.assets.characters).toEqual([])
    expect(state.rows.flatMap((row) => row.characters)).toEqual([])
    expect(state.rows.flatMap((row) => row.plotDescriptionEntityRefs ?? [])).toEqual([])
    expect(state.rows.some((row) => row.plotDescription.includes('林默'))).toBe(removal.keepsMention)
    expect(state.rows.some((row) => ['stale', 'user_edited_stale'].includes(row.imagePromptState))).toBe(true)
    expect(state.rows.some((row) => ['stale', 'user_edited_stale'].includes(row.videoPromptState))).toBe(true)
  })
}

test('script v2 batch assets groups selections, quotes aggregate credits and continues after one failure', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  let persisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '自己编写分镜脚本', exact: true }).click()
  await persisted
  const workspace = page.getByTestId('script-v2-workspace')
  persisted = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: /准备资产/ }).click()
  await persisted

  for (const label of ['角色', '场景', '道具']) {
    persisted = waitForCanvasMutation(page)
    await workspace.getByRole('button', { name: `新增${label}`, exact: true }).click()
    await persisted
    await workspace.getByRole('dialog', { name: `新增${label}`, exact: true })
      .getByRole('button', { name: '关闭', exact: true })
      .click()
  }

  const quoteResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/script-v2/quotes' &&
    response.ok(),
  )
  await workspace.getByRole('button', { name: '一键生成资产', exact: true }).click()
  await quoteResponse
  const dialog = workspace.getByRole('dialog', { name: '一键生成资产', exact: true })
  await expect(dialog.getByRole('region')).toHaveCount(3)
  await expect(dialog.getByRole('region').evaluateAll((regions) => regions.map((region) => region.getAttribute('aria-label'))))
    .resolves.toEqual(['角色', '场景', '道具'])
  await expect(dialog.getByRole('checkbox', { name: /^选择 / })).toHaveCount(3)
  expect(await dialog.getByRole('checkbox', { name: /^选择 / }).evaluateAll((checkboxes) =>
    checkboxes.map((checkbox) => (checkbox as HTMLInputElement).checked),
  )).toEqual([true, true, true])
  await expect(dialog.getByText('已选择 3 个资产', { exact: true })).toBeVisible()
  await expect(dialog.getByTestId('script-v2-batch-asset-quote')).toHaveText('54')
  await expect(dialog.getByRole('button', { name: '图片模型 Lib Image', exact: true })).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: '画质', exact: true })).toHaveValue('standard')
  await expect(dialog.getByRole('combobox', { name: '分辨率', exact: true })).toHaveValue('2K')
  await expect(dialog.getByRole('combobox', { name: '画幅', exact: true })).toHaveValue('2:1')

  const propSelection = dialog.getByRole('checkbox', { name: '选择 未命名道具', exact: true })
  await propSelection.uncheck()
  await expect(dialog.getByText('已选择 2 个资产', { exact: true })).toBeVisible()
  await expect(dialog.getByTestId('script-v2-batch-asset-quote')).toHaveText('36')
  await propSelection.check()
  await dialog.getByRole('textbox', { name: '未命名角色生成提示词', exact: true })
    .fill('黑色风衣的短发侦探，角色设定图')
  await dialog.getByRole('textbox', { name: '未命名场景生成提示词', exact: true })
    .fill('雨夜老车站，蓝紫霓虹，场景设定图')
  await dialog.getByRole('textbox', { name: '未命名道具生成提示词', exact: true })
    .fill('磨损的旧录音带，道具设定图')

  let generated = 0
  await page.route('**/api/script-v2/runs', async (route) => {
    const request = route.request()
    const body = request.method() === 'POST' ? request.postDataJSON() as { operation?: string } : null
    if (body?.operation !== 'generate-asset') {
      await route.continue()
      return
    }
    generated += 1
    if (generated === 2) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: '本地场景生成失败夹具' }),
      })
      return
    }
    await route.continue()
  })

  await dialog.getByRole('button', { name: '生成 3 个资产', exact: true }).click()
  await expect(dialog.getByText('生成完成：成功 2，失败 1', { exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(dialog.getByTestId('script-v2-batch-asset-result')).toHaveText([
    '未命名角色生成成功',
    '未命名场景生成失败本地场景生成失败夹具',
    '未命名道具生成成功',
  ])
  expect(generated).toBe(3)
  await dialog.getByRole('button', { name: '完成', exact: true }).click()

  await expect.poll(() => workspace.getByTestId('script-v2-asset-card')
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-asset-status'))))
    .toEqual(['ready', 'failed', 'ready'])
  const state = await readScriptV2State(page) as {
    assets: {
      characters: Array<{ description: string; status: string }>
      scenes: Array<{ description: string; status: string; error?: string }>
      props: Array<{ description: string; status: string }>
    }
  }
  expect(state.assets.characters[0]).toMatchObject({
    description: '黑色风衣的短发侦探，角色设定图',
    status: 'ready',
  })
  expect(state.assets.scenes[0]).toMatchObject({ status: 'failed', error: '本地场景生成失败夹具' })
  expect(state.assets.props[0]).toMatchObject({ description: '磨损的旧录音带，道具设定图', status: 'ready' })
})

test('script v2 batch materialization previews a selection and commits one atomic image group', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  const selectedEntry = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '剧本生成分镜脚本', exact: true }).click()
  await selectedEntry

  const generator = page.getByTestId('script-v2-generator')
  await generator.getByPlaceholder('描述剧情片段、故事，为你生成分镜脚本').fill('雨夜车站里，一名旅人收到一封迟到十年的信。')
  await generator.getByRole('button', { name: '生成分镜脚本', exact: true }).click()
  const resource = node.getByTestId('script-v2-resource-card')
  await expect(resource).toBeVisible({ timeout: 20_000 })

  const projectId = new URL(page.url()).searchParams.get('projectId')
  if (!projectId) throw new Error('projectId missing from canvas URL')
  const before = await page.request.get(`/api/projects/${projectId}`)
  expect(before.ok()).toBe(true)
  const beforePayload = await before.json() as { canvases: Array<{ document: { nodes: unknown[]; groups: unknown[] } }> }
  const beforeDocument = beforePayload.canvases[0].document

  await resource.getByRole('button', { name: '批量生成分镜', exact: true }).click()
  const dialog = page.getByTestId('script-v2-batch-materialize-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('script-v2-batch-selection-count')).toHaveText('已选4/4')
  await expect(dialog.getByRole('button', { name: '确认生成', exact: true })).toBeEnabled()

  // Opening and configuring the dialog must not touch the graph.
  const unchanged = await page.request.get(`/api/projects/${projectId}`)
  const unchangedDocument = (await unchanged.json() as { canvases: Array<{ document: { nodes: unknown[]; groups: unknown[] } }> }).canvases[0].document
  expect(unchangedDocument).toEqual(beforeDocument)

  await dialog.getByRole('checkbox', { name: '全选镜头', exact: true }).uncheck()
  await expect(dialog.getByTestId('script-v2-batch-selection-count')).toHaveText('已选0/4')
  await expect(dialog.getByRole('button', { name: '确认生成', exact: true })).toBeDisabled()
  await dialog.getByRole('checkbox', { name: '选择镜头 1', exact: true }).check()
  await expect(dialog.getByTestId('script-v2-batch-selection-count')).toHaveText('已选1/4')

  const persisted = waitForCanvasMutation(page)
  await dialog.getByRole('button', { name: '确认生成', exact: true }).click()
  await persisted
  await expect(dialog).toHaveCount(0)

  const afterResponse = await page.request.get(`/api/projects/${projectId}`)
  expect(afterResponse.ok()).toBe(true)
  const afterDocument = (await afterResponse.json() as {
    canvases: Array<{ document: { nodes: Array<{ type: string; data: { extra?: Record<string, unknown>; prompt?: string } }>; edges: unknown[]; groups: Array<{ kind: string; nodeIds: string[] }> } }>
  }).canvases[0].document
  const imageNodes = afterDocument.nodes.filter((candidate) => candidate.type === 'image')
  expect(imageNodes).toHaveLength(1)
  expect(imageNodes[0].data.prompt).toBeTruthy()
  expect(imageNodes[0].data.extra).toEqual(expect.objectContaining({ scriptV2Source: expect.objectContaining({ track: 'image' }) }))
  expect(afterDocument.groups).toEqual([
    expect.objectContaining({ kind: 'storyboard', nodeIds: [expect.any(String)] }),
  ])
  expect(afterDocument.edges).toHaveLength(1)
})

test('script v2 workspace exposes video batch settings and keeps shot timing through the confirm gate', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  const selectedEntry = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '剧本生成分镜脚本', exact: true }).click()
  await selectedEntry

  const generator = page.getByTestId('script-v2-generator')
  await generator.getByPlaceholder('描述剧情片段、故事，为你生成分镜脚本').fill('黄昏海岸边，旅人沿着潮线走向远处的灯塔。')
  await generator.getByRole('button', { name: '生成分镜脚本', exact: true }).click()
  const resource = node.getByTestId('script-v2-resource-card')
  await expect(resource).toBeVisible({ timeout: 20_000 })
  await resource.getByRole('button', { name: '打开脚本节点 →', exact: true }).click()

  const workspace = page.getByTestId('script-v2-workspace')
  const stageSaved = waitForCanvasMutation(page)
  await workspace.getByRole('button', { name: /合成提示词 4\/4 已合成/ }).click()
  await stageSaved
  const batchButton = workspace.getByTestId('script-v2-batch-video')
  await expect(batchButton).toBeVisible()
  await batchButton.click()

  const dialog = page.getByTestId('script-v2-batch-materialize-dialog')
  await expect(dialog).toHaveAccessibleName('批量生视频')
  await expect(dialog.getByTestId('script-v2-batch-selection-count')).toHaveText('已选4/4')
  await expect(dialog.getByRole('combobox', { name: '生成模式', exact: true })).toHaveValue('text2video')
  await expect(dialog.getByRole('combobox', { name: '分辨率', exact: true })).toHaveValue('720p')
  await expect(dialog.getByRole('checkbox', { name: '生成音频', exact: true })).toBeVisible()
  await expect(dialog.getByText('按每个镜头的时长分别计价，创建后仍需逐个确认生成。', { exact: true })).toBeVisible()

  const projectId = new URL(page.url()).searchParams.get('projectId')
  if (!projectId) throw new Error('projectId missing from canvas URL')
  const before = await page.request.get(`/api/projects/${projectId}`)
  const beforeDocument = (await before.json() as { canvases: Array<{ document: { nodes: unknown[] } }> }).canvases[0].document
  await dialog.getByRole('checkbox', { name: '选择镜头 2', exact: true }).uncheck()
  await expect(dialog.getByTestId('script-v2-batch-selection-count')).toHaveText('已选3/4')

  const persisted = waitForCanvasMutation(page)
  await dialog.getByRole('button', { name: '确认生成', exact: true }).click()
  await persisted
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('script-v2-workspace')).toHaveCount(0)

  const after = await page.request.get(`/api/projects/${projectId}`)
  const afterDocument = (await after.json() as {
    canvases: Array<{
      document: {
        nodes: Array<{ id: string; type: string; data: { output?: Record<string, unknown>; prompt?: string; extra?: Record<string, unknown> } }>
        edges: Array<{ source: string; target: string }>
        groups: Array<{ kind: string; nodeIds: string[] }>
      }
    }>
  }).canvases[0].document
  expect(afterDocument.nodes.filter((candidate) => candidate.type === 'video')).toHaveLength(3)
  const videos = afterDocument.nodes.filter((candidate) => candidate.type === 'video')
  expect(videos.map((video) => video.data.output?.mode)).toEqual(['text2video', 'text2video', 'text2video'])
  expect(videos.map((video) => video.data.extra?.scriptV2Source && (video.data.extra.scriptV2Source as { track: string }).track))
    .toEqual(['video', 'video', 'video'])
  expect(afterDocument.edges).toHaveLength(3)
  expect(afterDocument.groups).toEqual([expect.objectContaining({ kind: 'normal', nodeIds: videos.map((video) => video.id) })])
  expect(beforeDocument.nodes).toHaveLength(1)

  const firstVideo = page.locator('[data-node-type="video"]').first()
  await expect(firstVideo).toBeVisible()
  await firstVideo.getByTestId(/node-run-/).click()
  const gate = page.getByTestId('confirm-gate')
  await expect(gate).toBeVisible()
  await expect(gate).toContainText('Seedance 2.5')
  await expect(gate).toContainText('时长')
  await gate.getByRole('button', { name: '取消', exact: true }).click()
})

test('script v2 materialization is one undo frame and the surviving topology reloads cleanly', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  const selectedEntry = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '剧本生成分镜脚本', exact: true }).click()
  await selectedEntry
  const generator = page.getByTestId('script-v2-generator')
  await generator.getByPlaceholder('描述剧情片段、故事，为你生成分镜脚本').fill('清晨的山谷中，信使把一枚旧徽章交给守灯人。')
  await generator.getByRole('button', { name: '生成分镜脚本', exact: true }).click()
  const resource = node.getByTestId('script-v2-resource-card')
  await expect(resource).toBeVisible({ timeout: 20_000 })

  const projectId = new URL(page.url()).searchParams.get('projectId')
  if (!projectId) throw new Error('projectId missing from canvas URL')
  await resource.getByRole('button', { name: '批量生成分镜', exact: true }).click()
  const dialog = page.getByTestId('script-v2-batch-materialize-dialog')
  await expect(dialog).toBeVisible()
  const committed = waitForCanvasMutation(page)
  await dialog.getByRole('button', { name: '确认生成', exact: true }).click()
  await committed
  await expect(dialog).toHaveCount(0)

  const afterCommit = await page.request.get(`/api/projects/${projectId}`)
  const committedDocument = (await afterCommit.json() as {
    canvases: Array<{ document: { nodes: Array<{ type: string }>; edges: unknown[]; groups: unknown[] } }>
  }).canvases[0].document
  expect(committedDocument.nodes.filter((candidate) => candidate.type === 'image')).toHaveLength(4)
  expect(committedDocument.edges).toHaveLength(4)
  expect(committedDocument.groups).toHaveLength(1)

  const undone = waitForCanvasMutation(page)
  await page.keyboard.press('ControlOrMeta+z')
  await undone
  await expect.poll(async () => {
    const response = await page.request.get(`/api/projects/${projectId}`)
    const document = (await response.json() as { canvases: Array<{ document: { nodes: Array<{ type: string }>; edges: unknown[]; groups: unknown[] } }> }).canvases[0].document
    return {
      images: document.nodes.filter((candidate) => candidate.type === 'image').length,
      edges: document.edges.length,
      groups: document.groups.length,
    }
  }).toEqual({ images: 0, edges: 0, groups: 0 })

  await page.reload()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(0)
  await expect(page.locator('[data-node-type="script"]')).toHaveCount(1)

  const reloadedResource = page.locator('[data-node-type="script"]').first().getByTestId('script-v2-resource-card')
  await reloadedResource.getByRole('button', { name: '批量生成分镜', exact: true }).click()
  const reloadedDialog = page.getByTestId('script-v2-batch-materialize-dialog')
  const recommitted = waitForCanvasMutation(page)
  await reloadedDialog.getByRole('button', { name: '确认生成', exact: true }).click()
  await recommitted
  await page.reload()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(4)
  await expect(page.locator('[data-node-type="script"]')).toHaveCount(1)
})

test('script v2 preserves desktop visual baselines through its three-stage authoring flow', async ({ page }) => {
  await createProject(page)
  const node = await addScriptV2Node(page)
  const nodeShell = node.locator('[data-testid^="node-shell-"]')
  // React Flow may finish its post-insert selection reconciliation after the
  // mutation response. Select the node deliberately so the canvas chrome and
  // node ring are part of a stable, explicit visual state.
  await nodeShell.click({ position: { x: 380, y: 280 } })
  await expect(nodeShell).toHaveAttribute('data-selected', 'true')
  await expectVisualBaseline(page, 'script-v2-node-empty-1440x900.png')

  let persisted = waitForCanvasMutation(page)
  await node.getByRole('button', { name: '剧本生成分镜脚本', exact: true }).click()
  await persisted
  const generator = page.getByTestId('script-v2-generator')
  await expect(generator).toBeVisible()
  await expectVisualBaseline(page, 'script-v2-generator-1440x900.png')

  await generator.getByRole('button', { name: /GVLM 3\.1/ }).click()
  await expect(page.getByTestId('script-v2-model-catalog')).toBeVisible()
  await expectVisualBaseline(page, 'script-v2-model-catalog-1440x900.png')
  await page.keyboard.press('Escape')

  await generator.getByPlaceholder('描述剧情片段、故事，为你生成分镜脚本').fill(
    '雨夜的旧车站里，一名旅人把迟到十年的信交给守灯人。',
  )
  await generator.getByRole('button', { name: '生成分镜脚本', exact: true }).click()
  const resource = node.getByTestId('script-v2-resource-card')
  await expect(resource).toBeVisible({ timeout: 20_000 })
  await resource.getByRole('button', { name: '打开脚本节点 →', exact: true }).click()

  const workspace = page.getByTestId('script-v2-workspace')
  await expect(workspace).toBeVisible()
  await expectVisualBaseline(page, 'script-v2-shots-1440x900.png')

  persisted = waitForCanvasMutation(page)
  await workspace.getByTestId('script-v2-stages').getByRole('button', { name: /^准备资产/ }).click()
  await persisted
  await expect(workspace.getByTestId('script-v2-assets')).toBeVisible()
  await expectVisualBaseline(page, 'script-v2-assets-1440x900.png')

  persisted = waitForCanvasMutation(page)
  await workspace.getByTestId('script-v2-stages').getByRole('button', { name: /^合成提示词/ }).click()
  await persisted
  const prompts = workspace.getByTestId('script-v2-prompt-stage')
  await expect(prompts).toBeVisible()
  await expectVisualBaseline(page, 'script-v2-prompts-1440x900.png')

  await prompts.getByRole('button', { name: '查看镜头 1 最终提示词', exact: true }).click()
  await expect(page.getByTestId('script-v2-prompt-detail-dialog')).toBeVisible()
  await expectVisualBaseline(page, 'script-v2-prompt-detail-1440x900.png')
  await page.getByRole('button', { name: '关闭提示词', exact: true }).click()

  await workspace.getByTestId('script-v2-batch-image').click()
  await expect(page.getByTestId('script-v2-batch-materialize-dialog')).toBeVisible()
  await expectVisualBaseline(page, 'script-v2-batch-image-1440x900.png')
})
