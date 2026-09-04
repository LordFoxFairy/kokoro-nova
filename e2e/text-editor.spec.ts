import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const SHOTS = process.env.VISUAL_ARTIFACTS_DIR ?? "test-results/documentation"

async function selectEmpty(request: APIRequestContext) {
  const response = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-empty' } })
  expect(response.ok()).toBe(true)
}

function waitForCanvasMutation(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'POST' && /^\/api\/canvases\/[^/]+$/.test(url.pathname) && response.ok()
  })
}

async function createTextNode(page: Page, request: APIRequestContext) {
  await selectEmpty(request)
  await page.goto('/project')
  await page.getByTestId('start-create').click()
  await page.waitForURL(/\/canvas\?projectId=/)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  await page.getByTestId('add-node-button').click()
  const persisted = waitForCanvasMutation(page)
  await page.getByRole('menu').first().getByRole('menuitem', { name: '文本', exact: true }).click()
  await persisted

  const textNode = page.locator('[data-node-type="text"]').first()
  await expect(textNode).toBeVisible()
  const canvasId = new URL(page.url()).searchParams.get('canvasId')
  const nodeId = await textNode.evaluate(
    (element) => element.closest('.react-flow__node')?.getAttribute('data-id') ?? null,
  )
  expect(canvasId).toBeTruthy()
  expect(nodeId).toBeTruthy()
  return { textNode, canvasId: canvasId!, nodeId: nodeId! }
}

async function openTextEditor(page: Page, request: APIRequestContext) {
  const created = await createTextNode(page, request)
  await created.textNode.dblclick()
  return { ...created, editor: page.getByTestId('text-node-editor') }
}

async function readCanvas(request: APIRequestContext, canvasId: string) {
  const response = await request.get(`/api/canvases/${canvasId}`)
  expect(response.ok()).toBe(true)
  return (await response.json()).canvas
}

async function setCanvasZoom(request: APIRequestContext, canvasId: string, zoom: number) {
  const canvas = await readCanvas(request, canvasId)
  const response = await request.post(`/api/canvases/${canvasId}`, {
    data: {
      canvasId,
      expectedRevision: canvas.revision,
      label: '设置 Text 几何测试缩放',
      mutations: [{
        op: 'setViewport',
        viewport: { ...canvas.document.viewport, zoom },
      }],
    },
  })
  expect(response.ok()).toBe(true)
}

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

test('Text double click opens the inverse-scaled 660 px generator with the observed defaults', async ({ page, request }) => {
  const { editor, canvasId, nodeId } = await openTextEditor(page, request)

  await expect(editor).toBeVisible()
  await expect(page.getByTestId('node-inspector')).toHaveCount(0)
  await expect(editor).toHaveClass(/nodrag/)
  await expect(editor).toHaveClass(/nowheel/)
  await expect(editor).toHaveClass(/nopan/)
  const box = await editor.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(658)
  expect(box?.width).toBeLessThanOrEqual(662)
  await expect(editor.getByTestId('text-prompt')).toHaveAttribute(
    'placeholder',
    '写下你想讲的故事、场景或角色设定。例如：一个来自未来的机器人，在城市屋顶看星星。',
  )
  await expect(editor.getByTestId('text-model-selector')).toContainText('GVLM 3.1')
  await expect(editor.getByTestId('text-credit')).toHaveText('6')
  await expect(editor.getByTestId('text-run')).toBeDisabled()
  await expect(page.getByTestId(`node-shell-${nodeId}`)).toHaveAttribute('data-selected', 'false')
  await expectVisualBaseline(page, 'text-node-editor-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/text-node-editor-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })

  for (const [zoom, label] of [[0.5, '50%'], [0.33, '33%']] as const) {
    await setCanvasZoom(request, canvasId, zoom)
    await page.reload()
    await expect(page.getByTestId('workflow-canvas')).toBeVisible()
    await page.getByTestId(`node-${nodeId}`).dblclick()
    await expect(page.getByTestId('zoom-readout')).toHaveText(label)
    const atSavedZoom = await page.getByTestId('text-node-editor').boundingBox()
    expect(atSavedZoom?.width).toBeGreaterThanOrEqual(658)
    expect(atSavedZoom?.width).toBeLessThanOrEqual(662)
  }
})

test('Text model catalogue freezes all four rows and Escape closes one layer at a time', async ({ page, request }) => {
  const { editor } = await openTextEditor(page, request)
  await editor.getByTestId('text-model-selector').click()
  const catalog = page.getByTestId('text-model-catalog')
  await expect(catalog).toBeVisible()
  const rows = catalog.locator('[data-testid^="text-model-option-"]')
  await expect(rows).toHaveCount(4)
  await expect(rows).toHaveText([
    /GVLM 3\.1.*20s.*多模态文本模型Pro/,
    /CVLM 5\.5.*10s.*超智能大语言模型/,
    /GVLM 3\.1 Flash.*15s.*多模态文本模型lite/,
    /Qwen 3 VL Flash.*10s.*Qwen 3 VL Flash/,
  ])
  await expectVisualBaseline(page, 'text-model-catalog-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/text-model-catalog-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })

  await catalog.getByTestId('text-model-option-cvlm-5.5').click()
  await expect(editor.getByTestId('text-model-selector')).toContainText('CVLM 5.5')
  await editor.getByTestId('text-model-selector').click()
  await page.keyboard.press('Escape')
  await expect(catalog).toHaveCount(0)
  await expect(editor).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(editor).toHaveCount(0)
})

test('Text prompt, model and translation preference persist across a reload', async ({ page, request }) => {
  const { editor, canvasId, nodeId } = await openTextEditor(page, request)
  const prompt = editor.getByTestId('text-prompt')
  await prompt.fill('未来机器人站在城市天台仰望星空。')
  const promptSaved = waitForCanvasMutation(page)
  await prompt.blur()
  await promptSaved
  await expect(editor.getByTestId('text-run')).toBeEnabled()

  const translated = waitForCanvasMutation(page)
  await editor.getByTestId('text-translate').click()
  await translated
  await expect(editor.getByTestId('text-translate')).toHaveAttribute('aria-pressed', 'true')

  await page.reload()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  await page.getByTestId(`node-${nodeId}`).dblclick()
  const reopened = page.getByTestId('text-node-editor')
  await expect(reopened.getByTestId('text-prompt')).toHaveValue('未来机器人站在城市天台仰望星空。')
  await expect(reopened.getByTestId('text-translate')).toHaveAttribute('aria-pressed', 'true')

  const stored = (await readCanvas(request, canvasId)).document.nodes.find(
    (node: { id: string }) => node.id === nodeId,
  )
  expect(stored.data.extra.textAuthoring).toMatchObject({
    schemaVersion: 1,
    mode: 'generator',
    translationEnabled: true,
  })
})

test('manual Text mode exposes the complete rich toolbar, safe blocks, background, copy and expanded editor', async ({ page, request }) => {
  const { textNode, canvasId, nodeId } = await createTextNode(page, request)
  const switched = waitForCanvasMutation(page)
  await textNode.getByRole('button', { name: '自己编写内容' }).click()
  await switched

  const surface = page.getByTestId('text-document-editor')
  const toolbar = page.getByTestId('text-document-toolbar')
  await expect(surface).toBeVisible()
  await expect(toolbar).toBeVisible()
  await expect(toolbar.getByRole('button').allTextContents()).resolves.toEqual([
    '背景色',
    '标题 1',
    '标题 2',
    '标题 3',
    '正文',
    '粗体',
    '斜体',
    '无序列表',
    '有序列表',
    '分割线',
    '复制内容',
    '展开编辑',
  ])
  await expectVisualBaseline(page, 'text-document-toolbar-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/text-document-toolbar-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })

  const firstBlock = surface.locator('[contenteditable="true"]').first()
  await firstBlock.fill('雨夜天台')
  const textSaved = waitForCanvasMutation(page)
  await firstBlock.blur()
  await textSaved
  const applyToolbar = async (name: string) => {
    const saved = waitForCanvasMutation(page)
    await toolbar.getByRole('button', { name, exact: true }).click()
    await saved
  }
  await firstBlock.focus()
  for (const name of ['标题 2', '标题 3', '正文', '无序列表', '有序列表', '标题 1', '粗体', '斜体', '分割线']) {
    await applyToolbar(name)
  }

  await toolbar.getByRole('button', { name: '背景色' }).click()
  const palette = page.getByTestId('text-background-popover')
  const backgroundSaved = waitForCanvasMutation(page)
  await palette.getByRole('button', { name: '纸张' }).click()
  await backgroundSaved
  await expect(surface).toHaveAttribute('data-background', 'paper')

  await toolbar.getByRole('button', { name: '复制内容' }).click()
  await expect(page.getByText('文本内容已复制')).toBeVisible()

  const expandedSaved = waitForCanvasMutation(page)
  await toolbar.getByRole('button', { name: '展开编辑' }).click()
  await expandedSaved
  const expanded = page.getByTestId('text-expanded-editor')
  await expect(expanded).toBeVisible()
  await expectVisualBaseline(page, 'text-expanded-editor-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/text-expanded-editor-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })
  const closeSaved = waitForCanvasMutation(page)
  await page.keyboard.press('Escape')
  await closeSaved
  await expect(expanded).toHaveCount(0)

  const stored = (await readCanvas(request, canvasId)).document.nodes.find(
    (node: { id: string }) => node.id === nodeId,
  )
  expect(stored.size).toEqual({ width: 350, height: 200 })
  expect(stored.data.extra.textAuthoring).toMatchObject({
    mode: 'document',
    intent: 'free',
    expanded: false,
    document: {
      background: 'paper',
      blocks: [
        { kind: 'heading-1', text: '雨夜天台', marks: ['bold', 'italic'] },
        { kind: 'divider', text: '', marks: [] },
      ],
    },
  })

  await page.reload()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  await page.getByTestId(`node-${nodeId}`).dblclick()
  const reopened = page.getByTestId('text-document-editor')
  await expect(reopened).toHaveAttribute('data-background', 'paper')
  await expect(reopened.locator('[contenteditable="true"]').first()).toHaveText('雨夜天台')
})

for (const preset of [
  {
    action: '文生视频',
    group: '预设 - 文生视频',
    types: ['text', 'video'],
    edge: ['text', 'video'],
  },
  {
    action: '图片反推提示词',
    group: '预设 - 图片反推提示词',
    types: ['text', 'image'],
    edge: ['image', 'text'],
  },
  {
    action: '文字生音乐',
    group: '预设 - 文字生音乐',
    types: ['text', 'audio'],
    edge: ['text', 'audio'],
  },
] as const) {
  test(`${preset.action} creates one atomic observed starter graph and one undo removes it`, async ({ page, request }) => {
    const { textNode, canvasId } = await createTextNode(page, request)
    const persisted = waitForCanvasMutation(page)
    await textNode.getByRole('button', { name: preset.action }).click()
    await persisted

    const canvas = await readCanvas(request, canvasId)
    expect(canvas.document.nodes.map((node: { type: string }) => node.type).sort()).toEqual(
      [...preset.types].sort(),
    )
    expect(canvas.document.groups).toHaveLength(1)
    expect(canvas.document.groups[0].name).toBe(preset.group)
    const source = canvas.document.nodes.find((node: { type: string }) => node.type === preset.edge[0])
    const target = canvas.document.nodes.find((node: { type: string }) => node.type === preset.edge[1])
    expect(canvas.document.edges).toMatchObject([{ source: source.id, target: target.id }])

    const undone = waitForCanvasMutation(page)
    await page.keyboard.press('ControlOrMeta+z')
    await undone
    await expect.poll(async () => (await readCanvas(request, canvasId)).document.nodes.length).toBe(1)
    expect((await readCanvas(request, canvasId)).document.groups).toHaveLength(0)
  })
}

test('Text generation confirms, returns inline deterministic content and projects it to Storyboard', async ({ page, request }) => {
  const { editor, canvasId, nodeId } = await openTextEditor(page, request)
  const prompt = editor.getByTestId('text-prompt')
  await prompt.fill('雨夜城市品牌短片脚本')
  const promptSaved = waitForCanvasMutation(page)
  await editor.getByTestId('text-run').click()
  await promptSaved

  const gate = page.getByTestId('confirm-gate')
  await expect(gate).toContainText('GVLM 3.1')
  await page.getByTestId('confirm-generate').click()
  await expect(gate).toHaveCount(0)
  await expect(editor.getByTestId('text-result')).toContainText('雨夜城市品牌短片脚本', { timeout: 20_000 })

  await expect
    .poll(async () => {
      const canvas = await readCanvas(request, canvasId)
      return canvas.document.nodes.find((node: { id: string }) => node.id === nodeId)?.data.artifacts?.[0]
    })
    .toMatchObject({
      kind: 'text',
      modelId: 'gvlm-3.1',
      textContent: expect.stringContaining('雨夜城市品牌短片脚本'),
    })

  await page.getByTestId('view-storyboard').click()
  const card = page.getByTestId(`storyboard-card-${nodeId}`)
  await expect(card).toContainText('雨夜城市品牌短片脚本')
})
