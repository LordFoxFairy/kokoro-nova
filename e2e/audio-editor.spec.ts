import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const SHOTS = 'docs/screenshots'

async function selectEmpty(request: APIRequestContext) {
  const response = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-empty' } })
  expect(response.ok()).toBe(true)
}

async function startEmptyProject(page: Page) {
  // App-router navigation can finish in the same task as the mutation when
  // the canvas route is already warm. Register the URL waiter first; waiting
  // after click misses that completed transition and leaves the test waiting
  // for a second navigation that will never happen.
  const canvasNavigation = page.waitForURL(/\/canvas\?projectId=/, { waitUntil: 'commit' })
  await page.getByTestId('start-create').click()
  await canvasNavigation
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
}

async function createAudioNode(page: Page, request: APIRequestContext) {
  await selectEmpty(request)
  await page.goto('/project')
  await startEmptyProject(page)

  await page.getByTestId('add-node-button').click()
  const persisted = waitForCanvasMutation(page)
  await page.getByRole('menu').first().getByRole('menuitem', { name: '音频', exact: true }).click()
  await persisted
  const audioNode = page.locator('[data-node-type="audio"]').first()
  await expect(audioNode).toBeVisible()

  const canvasId = new URL(page.url()).searchParams.get('canvasId')
  expect(canvasId).toBeTruthy()
  const nodeId = await audioNode.evaluate((element) => element.closest('.react-flow__node')?.getAttribute('data-id') ?? null)
  return { audioNode, canvasId: canvasId!, nodeId }
}

async function openAudioEditor(page: Page, request: APIRequestContext) {
  const created = await createAudioNode(page, request)
  await created.audioNode.dblclick()
  return { ...created, editor: page.getByTestId('audio-node-editor') }
}

async function chooseAudioModel(page: Page, modelId: string, query: string) {
  await page.getByTestId('audio-model-selector').click()
  const catalog = page.getByTestId('audio-model-catalog')
  await catalog.getByRole('searchbox', { name: '搜索音频模型' }).fill(query)
  const persisted = waitForCanvasMutation(page)
  await catalog.getByTestId(`audio-model-option-${modelId}`).click()
  await persisted
  await expect(catalog).toHaveCount(0)
}

async function readCanvas(request: APIRequestContext, canvasId: string) {
  const response = await request.get(`/api/canvases/${canvasId}`)
  const expectedPath = `/api/canvases/${encodeURIComponent(canvasId)}`
  const contentType = response.headers()['content-type'] ?? ''
  expect(new URL(response.url()).pathname, `Unexpected canvas response URL: ${response.url()}`).toBe(expectedPath)
  expect(response.status(), `Canvas GET ${response.url()} returned ${response.status()}`).toBe(200)
  expect(contentType, `Canvas GET ${response.url()} returned content type ${contentType}`).toContain('application/json')
  const body = await response.json()
  expect(body, `Canvas GET ${response.url()} returned an invalid envelope`).toMatchObject({
    canvas: { document: { nodes: expect.any(Array) } },
  })
  return body
}

async function readAudioNode(request: APIRequestContext, canvasId: string, nodeId: string) {
  const body = await readCanvas(request, canvasId)
  const node = body.canvas.document.nodes.find((candidate: { id: string }) => candidate.id === nodeId)
  expect(node, `Canvas GET /api/canvases/${canvasId} did not contain node ${nodeId}`).toBeDefined()
  return node
}

async function setCanvasZoom(request: APIRequestContext, canvasId: string, zoom: number) {
  const current = await request.get(`/api/canvases/${canvasId}`)
  expect(current.ok()).toBe(true)
  const { canvas } = await current.json()
  const response = await request.post(`/api/canvases/${canvasId}`, {
    data: {
      canvasId,
      expectedRevision: canvas.revision,
      label: '设置 Audio 几何测试缩放',
      mutations: [{
        op: 'setViewport',
        viewport: { ...canvas.document.viewport, zoom },
      }],
    },
  })
  expect(response.ok()).toBe(true)
}

function waitForCanvasMutation(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'POST' && /^\/api\/canvases\/[^/]+$/.test(url.pathname)
  }).then((response) => {
    const contentType = response.headers()['content-type'] ?? ''
    expect(response.status(), `Canvas mutation ${response.url()} returned ${response.status()}`).toBe(200)
    expect(contentType, `Canvas mutation ${response.url()} returned content type ${contentType}`).toContain(
      'application/json',
    )
  })
}

async function addCanvasNode(page: Page, label: string) {
  await page.getByTestId('add-node-button').click()
  const persisted = waitForCanvasMutation(page)
  await page.getByRole('menuitem', { name: label, exact: true }).click()
  await persisted
}

async function flowNodeId(locator: ReturnType<Page['locator']>) {
  return locator.evaluate((element) => element.closest('.react-flow__node')?.getAttribute('data-id') ?? null)
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

test('Audio double click opens the inverse-scaled node authoring surface', async ({ page, request }) => {
  const { editor, canvasId, nodeId } = await openAudioEditor(page, request)
  expect(nodeId).toBeTruthy()

  await expect(editor).toBeVisible()
  await expect(page.getByTestId('node-inspector')).toHaveCount(0)
  await expect(editor).toHaveClass(/nodrag/)
  await expect(editor).toHaveClass(/nowheel/)
  await expect(editor).toHaveClass(/nopan/)

  const atHundred = await editor.boundingBox()
  expect(atHundred?.width).toBeGreaterThanOrEqual(658)
  expect(atHundred?.width).toBeLessThanOrEqual(662)
  await expect(editor.getByRole('button', { name: '参考', exact: true })).toBeVisible()
  await expect(editor.getByPlaceholder('描述你想要的音频效果，可用 @ 引用音频')).toBeVisible()
  await expect(editor.getByTestId('audio-model-selector')).toContainText('Seed Audio 1.0')
  await expect(editor.getByTestId('audio-output-selector')).toContainText('中文 · 24k · wav')
  await expect(page.getByTestId(`node-shell-${nodeId}`)).toHaveAttribute('data-selected', 'false')
  await expectVisualBaseline(page, 'audio-seed-editor-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/audio-seed-editor-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })

  for (const [zoom, label] of [[0.5, '50%'], [0.33, '33%']] as const) {
    await setCanvasZoom(request, canvasId, zoom)
    await page.reload()
    await expect(page.getByTestId('workflow-canvas')).toBeVisible()
    await page.getByTestId(`node-${nodeId}`).dblclick()
    await expect(page.getByTestId('zoom-readout')).toHaveText(label)
    const atSavedZoom = await page.getByTestId('audio-node-editor').boundingBox()
    expect(atSavedZoom?.width).toBeGreaterThanOrEqual(658)
    expect(atSavedZoom?.width).toBeLessThanOrEqual(662)
  }
})

test('Audio model catalogue exposes the six observed models with keyboard layering', async ({ page, request }) => {
  const { editor } = await openAudioEditor(page, request)
  await editor.getByTestId('audio-model-selector').click()

  const catalog = page.getByTestId('audio-model-catalog')
  await expect(catalog).toBeVisible()
  const options = catalog.locator('[data-testid^="audio-model-option-"]')
  await expect(options).toHaveCount(6)
  await expect(options).toHaveText([
    /Seed Audio 1\.0/,
    /Minimax-speech-2\.8-hd/,
    /Minimax-speech-2\.8-turbo/,
    /Eleven V3/,
    /Eleven Music V3/,
    /Mureka V8/,
  ])
  await expect(catalog).toContainText('6 个结果')
  await expectVisualBaseline(page, 'audio-model-catalog-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/audio-model-catalog-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })

  await catalog.getByRole('searchbox', { name: '搜索音频模型' }).fill('Mureka')
  await expect(options).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(catalog).toHaveCount(0)
  await expect(editor.getByTestId('audio-model-selector')).toContainText('Mureka V8')

  await editor.getByTestId('audio-model-selector').click()
  await expect(catalog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(catalog).toHaveCount(0)
  await expect(editor).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(editor).toHaveCount(0)
})

test('Seed Audio exposes and persists the exact language sample-rate and format matrix', async ({ page, request }) => {
  const { editor, canvasId, nodeId } = await openAudioEditor(page, request)
  expect(nodeId).toBeTruthy()

  await editor.getByTestId('audio-output-selector').click()
  const output = page.getByTestId('audio-output-popover')
  await expect(output).toBeVisible()
  await expect(output.locator('[data-audio-language]')).toHaveCount(2)
  await expect(output.locator('[data-audio-sample-rate]')).toHaveCount(4)
  await expect(output.locator('[data-audio-format]')).toHaveCount(4)
  await expect(output.getByRole('button', { name: '中文' })).toHaveAttribute('aria-pressed', 'true')
  await expect(output.getByRole('button', { name: '24k' })).toHaveAttribute('aria-pressed', 'true')
  await expect(output.getByRole('button', { name: 'wav' })).toHaveAttribute('aria-pressed', 'true')

  await output.getByRole('button', { name: '英文' }).click()
  await output.getByRole('button', { name: '48k' }).click()
  await output.getByRole('button', { name: 'mp3' }).click()
  await page.keyboard.press('Escape')
  await expect(editor.getByTestId('audio-output-selector')).toContainText('英文 · 48k · mp3')

  await expect
    .poll(async () => (await readAudioNode(request, canvasId, nodeId!)).data.extra.audioAuthoring.settings)
    .toMatchObject({ language: 'en', sampleRate: '48k', format: 'mp3' })
})

test('Minimax TTS exposes marker actions, voice and resettable two-stage controls', async ({ page, request }) => {
  const { editor, canvasId, nodeId } = await openAudioEditor(page, request)
  expect(nodeId).toBeTruthy()
  await chooseAudioModel(page, 'minimax-speech-2.8-hd', 'Minimax-speech-2.8-hd')

  const prompt = editor.getByTestId('audio-prompt')
  await expect(prompt).toHaveAttribute('maxlength', '50000')
  await expect(editor.getByRole('button', { name: '<#> 停顿' })).toBeVisible()
  await expect(editor.getByRole('button', { name: '() 语气词' })).toBeVisible()
  await expect(editor.getByTestId('audio-voice-selector')).toContainText('少女音色')

  await editor.getByRole('button', { name: '高级设置' }).click()
  const advanced = page.getByTestId('audio-advanced-settings')
  await expect(advanced).toContainText('基础调节')
  await expect(advanced).toContainText('音色效果调节')
  await expect(advanced.getByRole('slider')).toHaveCount(6)
  await expect(advanced.getByRole('radio')).toHaveCount(5)
  await expectVisualBaseline(page, 'audio-minimax-advanced-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/audio-minimax-advanced-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })

  await advanced.getByRole('textbox', { name: '语速数值' }).fill('1.6')
  await advanced.getByRole('textbox', { name: '语速数值' }).blur()
  await advanced.getByRole('radio', { name: '电话失真' }).click()
  await expect
    .poll(async () => (await readAudioNode(request, canvasId, nodeId!)).data.extra.audioAuthoring.settings)
    .toMatchObject({ speed: 1.6, soundEffect: 'telephone' })

  await advanced.getByRole('button', { name: '一键重置' }).click()
  await expect(advanced.getByRole('textbox', { name: '语速数值' })).toHaveValue('1.00')
  await expect(advanced.getByRole('radio', { name: '无' })).toBeChecked()
})

test('Eleven speech and both music families expose only their own authoring controls', async ({ page, request }) => {
  const { editor, canvasId, nodeId } = await openAudioEditor(page, request)
  expect(nodeId).toBeTruthy()

  await chooseAudioModel(page, 'eleven-v3', 'Eleven V3')
  await expect(editor.getByTestId('audio-prompt')).toHaveAttribute('maxlength', '5000')
  await expect(editor.getByTestId('audio-voice-selector')).toContainText('Jin - 清晰、温暖、随性')
  await expect(editor.getByRole('button', { name: '<#> 停顿' })).toHaveCount(0)
  await editor.getByRole('button', { name: '高级设置' }).click()
  let advanced = page.getByTestId('audio-advanced-settings')
  await expect(advanced.getByRole('radio')).toHaveCount(3)
  await expect(advanced.getByRole('radio', { name: '自然的' })).toBeChecked()
  await page.keyboard.press('Escape')

  await chooseAudioModel(page, 'eleven-music-v3', 'Eleven Music V3')
  await expect(editor.getByTestId('audio-voice-selector')).toHaveCount(0)
  await editor.getByRole('button', { name: '高级设置' }).click()
  advanced = page.getByTestId('audio-advanced-settings')
  await expect(advanced).toContainText('音乐时长')
  await expect(advanced.getByRole('button', { name: '30秒' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')

  await chooseAudioModel(page, 'mureka-v8', 'Mureka V8')
  await expect(editor.getByRole('button', { name: '描述生音乐' })).toHaveAttribute('aria-pressed', 'true')
  await expect(editor.getByRole('button', { name: '歌词生音乐' })).toHaveAttribute('aria-pressed', 'false')
  await expect(editor.getByTestId('audio-prompt')).toHaveAttribute('maxlength', '1024')
  await editor.getByRole('button', { name: '高级设置' }).click()
  advanced = page.getByTestId('audio-advanced-settings')
  await expect(advanced.getByRole('switch', { name: '纯乐器' })).toHaveAttribute('aria-checked', 'true')
  await expectVisualBaseline(page, 'audio-mureka-editor-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/audio-mureka-editor-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })
  await page.keyboard.press('Escape')

  await editor.getByRole('button', { name: '歌词生音乐' }).click()
  await expect(editor.getByTestId('audio-prompt')).toHaveAttribute('maxlength', '3000')
  await expect(editor.getByTestId('audio-prompt')).toHaveAttribute('placeholder', '输入歌词')
  await editor.getByRole('button', { name: '高级设置' }).click()
  await expect(page.getByTestId('audio-advanced-settings').getByRole('switch', { name: '纯乐器' })).toHaveCount(0)
  await expect
    .poll(async () => (await readAudioNode(request, canvasId, nodeId!)).data.extra.audioAuthoring.settings.murekaMode)
    .toBe('lyrics')
})

test('Minimax inserts exact pause and paralinguistic tokens at the current caret', async ({ page, request }) => {
  const { editor, canvasId, nodeId } = await openAudioEditor(page, request)
  expect(nodeId).toBeTruthy()
  await chooseAudioModel(page, 'minimax-speech-2.8-hd', 'Minimax-speech-2.8-hd')

  const prompt = editor.getByTestId('audio-prompt')
  await prompt.fill('开场这里结束')
  await prompt.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(2, 4))
  await editor.getByRole('button', { name: '<#> 停顿' }).click()
  const pauseMenu = page.getByTestId('audio-pause-menu')
  await expect(pauseMenu.getByRole('button')).toHaveCount(5)
  await pauseMenu.getByRole('button', { name: '0.25s' }).click()
  await expect(prompt).toHaveValue('开场<#0.25#>结束')

  await prompt.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(element.value.length, element.value.length))
  await editor.getByRole('button', { name: '() 语气词' }).click()
  const cueMenu = page.getByTestId('audio-cue-menu')
  await expect(cueMenu.getByRole('button')).toHaveCount(21)
  await cueMenu.getByRole('button', { name: '喘气', exact: true }).click()
  await expect(prompt).toHaveValue('开场<#0.25#>结束(喘气)')
  await expect(editor.getByTestId('audio-token-chip')).toHaveCount(2)

  await editor.getByRole('button', { name: '<#> 停顿' }).click()
  await pauseMenu.getByRole('button', { name: '自定义' }).click()
  const seconds = pauseMenu.getByRole('textbox', { name: '秒数' })
  const insert = pauseMenu.getByRole('button', { name: '插入停顿' })
  await seconds.fill('0')
  await expect(insert).toBeDisabled()
  await seconds.fill('11')
  await expect(insert).toBeDisabled()
  await seconds.fill('2.25')
  await expect(insert).toBeEnabled()
  await insert.click()
  await expect(prompt).toHaveValue('开场<#0.25#>结束(喘气)<#2.25#>')

  await expect
    .poll(async () => (await readAudioNode(request, canvasId, nodeId!)).data.prompt)
    .toBe('开场<#0.25#>结束(喘气)<#2.25#>')
})

test('Minimax keeps a selected prompt range when the token popover takes focus', async ({ page, request }) => {
  const { editor, canvasId, nodeId } = await openAudioEditor(page, request)
  expect(nodeId).toBeTruthy()
  await chooseAudioModel(page, 'minimax-speech-2.8-hd', 'Minimax-speech-2.8-hd')

  const prompt = editor.getByTestId('audio-prompt')
  await prompt.fill('甲乙丙丁')
  await prompt.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(1, 3))

  await editor.getByRole('button', { name: '() 语气词' }).click()
  const cueMenu = page.getByTestId('audio-cue-menu')
  await expect(cueMenu).toBeVisible()
  await cueMenu.getByRole('button', { name: '喘气', exact: true }).click()

  await expect(prompt).toHaveValue('甲(喘气)丁')
  await expect
    .poll(async () => (await readAudioNode(request, canvasId, nodeId!)).data.prompt)
    .toBe('甲(喘气)丁')
})

test('voice library mirrors tabs, first-page rows, pagination, search, filters and favorites', async ({ page, request }) => {
  const { editor, canvasId, nodeId } = await openAudioEditor(page, request)
  expect(nodeId).toBeTruthy()
  await chooseAudioModel(page, 'minimax-speech-2.8-hd', 'Minimax-speech-2.8-hd')
  await editor.getByTestId('audio-voice-selector').click()

  const library = page.getByTestId('voice-library-dialog')
  await expect(library).toBeVisible()
  await expect(library.getByRole('tab', { name: '音色库' })).toHaveAttribute('aria-selected', 'true')
  await expect(library.getByRole('tab', { name: '我的音色' })).toBeVisible()
  await expect(library.getByRole('tab', { name: '收藏音色' })).toBeVisible()
  await expect(library.locator('[data-testid^="voice-row-"]')).toHaveCount(20)
  await expect(library).toContainText('20条/页')
  await expect(library).toContainText('共 327 条')
  await expect(library.getByRole('button', { name: '17' })).toBeVisible()
  await expectVisualBaseline(page, 'audio-voice-library-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/audio-voice-library-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })

  const search = library.getByRole('searchbox', { name: '搜索音色库' })
  await search.fill('少女音色')
  await expect(library.locator('[data-testid^="voice-row-"]')).toHaveCount(2)
  await search.clear()

  for (const voiceName of ['青涩青年音色', '精英青年音色']) {
    const persisted = waitForCanvasMutation(page)
    await library.getByRole('button', { name: `收藏 ${voiceName}`, exact: true }).click()
    await persisted
  }
  await expect
    .poll(async () => (await readAudioNode(request, canvasId, nodeId!)).data.extra.audioAuthoring.favoriteVoiceIds)
    .toEqual(['voice-young-green', 'voice-young-elite'])
  await library.getByRole('tab', { name: '收藏音色' }).click()
  await expect(library.locator('[data-testid^="voice-row-"]')).toHaveCount(2)
  const voiceSelection = waitForCanvasMutation(page)
  await library.getByTestId('voice-row-voice-young-green').getByRole('button', { name: '选择 青涩青年音色', exact: true }).click()
  await voiceSelection
  await expect(library).toHaveCount(0)
  await expect(editor.getByTestId('audio-voice-selector')).toContainText('青涩青年音色')
  await expect
    .poll(async () => (await readAudioNode(request, canvasId, nodeId!)).data.extra.audioAuthoring)
    .toMatchObject({
      settings: { voiceId: 'voice-young-green' },
      favoriteVoiceIds: ['voice-young-green', 'voice-young-elite'],
    })

  await editor.getByTestId('audio-voice-selector').click()
  await library.getByRole('button', { name: '筛选' }).click()
  const filter = page.getByTestId('voice-filter-dialog')
  const accent = filter.getByRole('combobox', { name: '口音' })
  await expect(accent).toBeDisabled()
  await filter.getByRole('combobox', { name: '语言' }).selectOption('中文')
  await expect(accent).toBeEnabled()
  await accent.selectOption('普通话')
  await filter.getByRole('combobox', { name: '性别' }).selectOption('女')
  await filter.getByRole('button', { name: '青年' }).click()
  await filter.getByRole('button', { name: '筛选', exact: true }).click()
  await expect(filter).toHaveCount(0)
  await expect(library.locator('[data-testid^="voice-row-"]')).not.toHaveCount(0)
  await expect(library.locator('[data-testid^="voice-row-"]').first()).toContainText('中文(普通话)')
  await expect(library.locator('[data-testid^="voice-row-"]').first()).toContainText('女')
})

test('voice preview stays local and clone flow persists a reusable custom voice without microphone access', async ({ page, request }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices ?? {}, 'getUserMedia', {
      configurable: true,
      value: () => Promise.reject(new Error('getUserMedia must not be called by the fixture')),
    })
  })
  const { editor, canvasId, nodeId } = await openAudioEditor(page, request)
  expect(nodeId).toBeTruthy()
  await chooseAudioModel(page, 'minimax-speech-2.8-hd', 'Minimax-speech-2.8-hd')
  await editor.getByTestId('audio-voice-selector').click()

  const library = page.getByTestId('voice-library-dialog')
  const preview = library.getByTestId('voice-row-voice-young-green').getByRole('button', { name: '试听 青涩青年音色', exact: true })
  await preview.click()
  await expect(library.getByTestId('voice-row-voice-young-green').getByRole('button', { name: '停止试听 青涩青年音色', exact: true })).toBeVisible()
  await expect(library.locator('audio')).toHaveAttribute('src', '/fixtures/libtv/media/compositor-bed.wav')

  await library.getByRole('button', { name: '克隆新音色' }).click()
  const clone = page.getByTestId('voice-clone-dialog')
  await expect(clone).toBeVisible()
  await expectVisualBaseline(page, 'audio-voice-clone-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/audio-voice-clone-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })
  const generate = clone.getByRole('button', { name: '生成音色' })
  await expect(generate).toBeDisabled()
  await clone.getByRole('button', { name: '开始录音' }).click()
  await expect(clone.getByRole('button', { name: '停止录音' })).toBeVisible()
  await clone.getByRole('button', { name: '停止录音' }).click()
  await expect(clone).toContainText('录音已完成')
  await clone.getByRole('checkbox', { name: /我已阅读并同意/ }).check()
  await expect(generate).toBeEnabled()
  const cloneMutation = waitForCanvasMutation(page)
  await generate.click()
  await cloneMutation

  await expect(clone).toHaveCount(0)
  await expect(library.getByRole('tab', { name: '我的音色' })).toHaveAttribute('aria-selected', 'true')
  await expect(library.getByTestId('voice-row-voice-custom-1')).toContainText('我的音色 1')
  const customVoiceSelection = waitForCanvasMutation(page)
  await library.getByRole('button', { name: '选择 我的音色 1' }).click()
  await customVoiceSelection
  await expect(editor.getByTestId('audio-voice-selector')).toContainText('我的音色 1')
  await expect
    .poll(async () => (await readAudioNode(request, canvasId, nodeId!)).data.extra.audioAuthoring)
    .toMatchObject({
      settings: { voiceId: 'voice-custom-1' },
      customVoices: [{ id: 'voice-custom-1', name: '我的音色 1', source: 'custom' }],
    })
})

test('Audio reference mode accepts text and audio nodes, rejects images and restores reference cards', async ({ page, request }) => {
  await selectEmpty(request)
  await page.goto('/project')
  await startEmptyProject(page)

  await addCanvasNode(page, '文本')
  await addCanvasNode(page, '图片')
  await addCanvasNode(page, '音频')
  await addCanvasNode(page, '音频')
  await page.keyboard.press('ControlOrMeta+0')
  await page.waitForTimeout(700)

  const text = page.locator('[data-node-type="text"]').first()
  const image = page.locator('[data-node-type="image"]').first()
  const audios = page.locator('[data-node-type="audio"]')
  const sourceAudio = audios.nth(0)
  const targetAudio = audios.nth(1)
  const [textId, imageId, sourceAudioId, targetAudioId] = await Promise.all([
    flowNodeId(text),
    flowNodeId(image),
    flowNodeId(sourceAudio),
    flowNodeId(targetAudio),
  ])
  expect(textId).toBeTruthy()
  expect(imageId).toBeTruthy()
  expect(sourceAudioId).toBeTruthy()
  expect(targetAudioId).toBeTruthy()

  await targetAudio.dblclick()
  const editor = page.getByTestId('audio-node-editor')
  await editor.getByRole('button', { name: '参考', exact: true }).click()
  const banner = page.getByTestId('canvas-selection-banner')
  await expect(banner).toContainText('从画布选择参考')

  const textCandidate = page.getByTestId(`reference-candidate-${textId}`)
  const audioCandidate = page.getByTestId(`reference-candidate-${sourceAudioId}`)
  const imageCandidate = page.getByTestId(`reference-candidate-${imageId}`)
  await expect(textCandidate).toContainText('添加参考')
  await expect(audioCandidate).toContainText('添加参考')
  await expect(imageCandidate).toBeDisabled()
  await expect(imageCandidate).toHaveAttribute('title', '音频节点不接受图片输入')

  const textMutation = waitForCanvasMutation(page)
  await textCandidate.click()
  await textMutation
  const audioMutation = waitForCanvasMutation(page)
  await audioCandidate.click()
  await audioMutation
  await banner.getByRole('button', { name: '返回节点' }).click()
  await expect(editor).toBeVisible()
  const strip = editor.getByTestId('audio-reference-strip')
  await expect(strip.getByTestId(`audio-reference-card-${textId}`)).toContainText('文本 1')
  await expect(strip.getByTestId(`audio-reference-card-${sourceAudioId}`)).toContainText('音频 2')

  const canvasId = new URL(page.url()).searchParams.get('canvasId')
  expect(canvasId).toBeTruthy()
  await expect
    .poll(async () => {
      const body = await readCanvas(request, canvasId!)
      return body.canvas.document.edges
        .filter((edge: { target: string }) => edge.target === targetAudioId)
        .map((edge: { source: string }) => edge.source)
    })
    .toEqual([textId, sourceAudioId])

  await strip.getByRole('button', { name: '移除参考 文本节点' }).click()
  await expect(strip.getByTestId(`audio-reference-card-${textId}`)).toHaveCount(0)
})

test('Audio generation passes the confirm gate, produces a local WAV and projects into Storyboard', async ({ page, request }) => {
  const { audioNode, editor, nodeId } = await openAudioEditor(page, request)
  expect(nodeId).toBeTruthy()
  const prompt = editor.getByTestId('audio-prompt')
  await prompt.fill('雨夜的城市电台片头，温暖的人声与轻柔环境音。')
  const promptPersisted = waitForCanvasMutation(page)
  await prompt.blur()
  await promptPersisted
  await editor.getByTestId('audio-run').click()

  const gate = page.getByTestId('confirm-gate')
  await expect(gate).toBeVisible()
  await expect(gate).toContainText('Seed Audio 1.0')
  await expect(gate).toContainText('积分预估')
  await page.getByTestId('confirm-generate').click()
  await expect(gate).toHaveCount(0)

  const generatedAudio = audioNode.locator('audio')
  await expect(generatedAudio).toBeVisible({ timeout: 30_000 })
  await expect(generatedAudio).toHaveAttribute('src', /\/api\/media\/[^/]+\/[^/]+\.wav$/)

  await page.getByTestId('view-storyboard').click()
  const audioColumn = page.getByTestId('storyboard-audio')
  await expect(audioColumn).toBeVisible()
  await expect(audioColumn.getByTestId(`storyboard-card-${nodeId}`)).toContainText('音频节点')
  await audioColumn.getByTestId(`storyboard-card-${nodeId}`).click()
  const detail = page.getByTestId('media-detail')
  await expect(detail.locator('audio')).toHaveAttribute('src', /\/api\/media\/[^/]+\/[^/]+\.wav$/)
  await detail.getByRole('button', { name: '更多操作' }).click()
  await expect(page.getByRole('menuitem', { name: '下载' })).toBeEnabled()
})
