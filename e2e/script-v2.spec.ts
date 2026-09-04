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
  await expect(workspace.getByText('1/3 完成后可批量生视频', { exact: true })).toBeVisible()
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
  await expect(workspace.getByRole('button', { name: '一键合成全部提示词', exact: true })).toBeDisabled()
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
