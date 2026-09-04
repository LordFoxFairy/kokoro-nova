import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const SHOTS = process.env.VISUAL_ARTIFACTS_DIR ?? "test-results/documentation"

const PROJECT_URL = '/canvas?projectId=prj_video_demo&canvasId=can_video_main'
const CANVAS_API_PATH = '/api/canvases/can_video_main'

async function readCanvas(request: APIRequestContext) {
  const response = await request.get(CANVAS_API_PATH)
  const contentType = response.headers()['content-type'] ?? ''
  const responseUrl = new URL(response.url())

  // Keep polling failures actionable. A transient dev-server or route error
  // must report the request URL, status, and content type before Playwright
  // attempts to decode the body as JSON.
  expect(responseUrl.pathname, `Unexpected canvas response URL: ${response.url()}`).toBe(CANVAS_API_PATH)
  expect(response.status(), `Canvas GET ${response.url()} returned ${response.status()}`).toBe(200)
  expect(contentType, `Canvas GET ${response.url()} returned content type ${contentType}`).toContain('application/json')
  return response.json()
}

async function waitForCanvasMutation(page: Page) {
  const response = await page.waitForResponse((candidate) => {
    const url = new URL(candidate.url())
    return candidate.request().method() === 'POST' && url.pathname === CANVAS_API_PATH
  })
  const contentType = response.headers()['content-type'] ?? ''
  expect(response.status(), `Canvas mutation ${response.url()} returned ${response.status()}`).toBe(200)
  expect(contentType, `Canvas mutation ${response.url()} returned content type ${contentType}`).toContain(
    'application/json',
  )
}

async function selectPopulated(request: APIRequestContext) {
  const response = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-populated' } })
  expect(response.ok()).toBe(true)
}

async function openVideoEditor(page: Page, request: APIRequestContext) {
  await selectPopulated(request)
  await page.goto(PROJECT_URL)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  await page.getByTestId('node-node_video_01').dblclick()
  return page.getByTestId('video-node-editor')
}

async function chooseVideoModel(page: Page, modelId: string, query: string) {
  await page.getByTestId('video-model-selector').click()
  const catalog = page.getByTestId('video-model-catalog')
  await expect(catalog).toBeVisible()
  await catalog.getByRole('searchbox', { name: '搜索视频模型' }).fill(query)
  await catalog.getByTestId(`video-model-option-${modelId}`).click()
  await expect(catalog).toHaveCount(0)
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

test('Video double click opens an inverse-scaled node editor instead of the generic drawer', async ({ page, request }) => {
  const editor = await openVideoEditor(page, request)

  await expect(editor).toBeVisible()
  await expect(page.getByTestId('node-inspector')).toHaveCount(0)
  await expect(editor).toHaveClass(/nodrag/)
  await expect(editor).toHaveClass(/nowheel/)
  await expect(editor).toHaveClass(/nopan/)

  const atFifty = await editor.boundingBox()
  expect(atFifty?.width).toBeGreaterThanOrEqual(658)
  expect(atFifty?.width).toBeLessThanOrEqual(662)
  await expect(page.getByTestId('node-shell-node_video_01')).toHaveAttribute('data-selected', 'false')

  await expectVisualBaseline(page, 'video-node-editor-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/video-node-editor-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })

  // Chromium coalesces the synthetic wheel delta; +620px takes 50% to ≈33%.
  await page.mouse.move(1_260, 700)
  await page.mouse.wheel(0, 620)
  await expect(page.getByTestId('zoom-readout')).toHaveText('33%')
  const atThirtyThree = await editor.boundingBox()
  expect(atThirtyThree?.width).toBeGreaterThanOrEqual(658)
  expect(atThirtyThree?.width).toBeLessThanOrEqual(662)

  await page.getByTestId('zoom-readout').click()
  await expect(page.getByTestId('zoom-readout')).toHaveText('100%')
  const atHundred = await editor.boundingBox()
  expect(atHundred?.width).toBeGreaterThanOrEqual(658)
  expect(atHundred?.width).toBeLessThanOrEqual(662)

  await expect(editor.getByRole('button', { name: /Seedance 2\.0 VIP/ })).toBeVisible()
  await expect(editor.getByRole('button', { name: '全能参考' })).toBeVisible()
  await expect(editor.getByRole('button', { name: /16:9 · 720P · 15s · 1个/ })).toBeVisible()

  await page.mouse.click(20, 700)
  await expect(editor).toHaveCount(0)
})

test('Video model catalogue exposes all 36 observed models and Escape closes one layer at a time', async ({
  page,
  request,
}) => {
  const editor = await openVideoEditor(page, request)

  await page.getByTestId('video-model-selector').click()
  const catalog = page.getByTestId('video-model-catalog')
  await expect(catalog).toBeVisible()
  await expect(catalog.locator('[data-testid^="video-model-option-"]')).toHaveCount(36)
  await expect(catalog).toContainText('36 个结果')

  await expectVisualBaseline(page, 'video-model-catalog-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/video-model-catalog-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })

  await catalog.getByRole('searchbox', { name: '搜索视频模型' }).fill('motion')
  await expect(catalog.locator('[data-testid^="video-model-option-"]')).toHaveCount(1)
  await expect(catalog).toContainText('Kling3.0 动作迁移')

  await page.keyboard.press('Enter')
  await expect(catalog).toHaveCount(0)
  await expect(page.getByTestId('video-model-selector')).toContainText('Kling3.0 动作迁移')

  await page.getByTestId('video-model-selector').click()
  await expect(catalog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(catalog).toHaveCount(0)
  await expect(editor).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(editor).toHaveCount(0)
})

test('switching to Minimax H3 Max clamps output controls and persists AutoLink on the shared node', async ({
  page,
  request,
}) => {
  const editor = await openVideoEditor(page, request)
  await chooseVideoModel(page, 'minimax-h3-max', 'Minimax H3 Max')

  await expect(page.getByTestId('video-model-selector')).toContainText('Minimax H3 Max')
  await expect(page.getByTestId('video-mode-selector')).toContainText('文生视频')
  await expect(page.getByTestId('video-output-selector')).toContainText('16:9 · 720P · 5s · 1个 · 静音')

  await page.getByTestId('video-output-selector').click()
  const output = page.getByTestId('video-output-popover')
  await expect(output).toBeVisible()
  await expect(output.getByText('生成音频')).toHaveCount(0)
  await expect(output.getByRole('button', { name: '21:9' })).toHaveCount(0)
  await expect(output.getByRole('button', { name: '5s' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')

  await editor.getByRole('button', { name: '高级设置' }).click()
  const autoLink = page.getByRole('switch', { name: '智能引用 AutoLink' })
  await expect(autoLink).toHaveAttribute('aria-checked', 'true')
  await autoLink.click()
  await expect(autoLink).toHaveAttribute('aria-checked', 'false')

  await expect
    .poll(async () => {
      const body = await readCanvas(request)
      const node = body.canvas.document.nodes.find((item: { id: string }) => item.id === 'node_video_01')
      return {
        modelId: node.data.modelId,
        mode: node.data.output.mode,
        durationSeconds: node.data.output.durationSeconds,
        withAudio: node.data.output.withAudio,
        autoLink: node.data.extra.advanced.autoLink,
      }
    })
    .toEqual({ modelId: 'minimax-h3-max', mode: 'text2video', durationSeconds: 5, withAudio: false, autoLink: false })
})

test('specialized action-transfer and digital-human models expose exact dependency gates', async ({ page, request }) => {
  const editor = await openVideoEditor(page, request)

  await chooseVideoModel(page, 'kling-3-motion-transfer', '动作迁移')
  await expect(page.getByTestId('video-mode-selector')).toContainText('动作迁移')
  await page.getByTestId('video-mode-selector').click()
  const actionMode = page.getByTestId('video-mode-menu').getByRole('menuitemradio', { name: '动作迁移' })
  await expect(actionMode).toBeDisabled()
  await expect(actionMode).toHaveAttribute('title', '需要 1 张图片和 1 条视频参考')
  await page.keyboard.press('Escape')

  await expect
    .poll(async () => {
      const body = await readCanvas(request)
      return body.canvas.document.nodes.find((item: { id: string }) => item.id === 'node_video_01').data.modelId
    })
    .toBe('kling-3-motion-transfer')
  await page.getByTestId('video-run').click()
  await expect(page.getByTestId('toast')).toContainText('需要 1 张图片和 1 条视频参考')

  await chooseVideoModel(page, 'omnihuman-1-5', 'OmniHuman 1.5')
  await expect(page.getByTestId('video-mode-selector')).toContainText('数字人')
  await expect(page.getByTestId('video-output-selector')).toContainText('有声')
  await page.getByTestId('video-output-selector').click()
  const output = page.getByTestId('video-output-popover')
  await expect(output.getByText('生成音频')).toBeVisible()
  await expect(output.getByRole('button', { name: '开启' })).toHaveAttribute('aria-pressed', 'true')
  await expect(output.getByRole('button', { name: '关闭' })).toBeDisabled()
  await page.keyboard.press('Escape')

  await page.getByTestId('video-mode-selector').click()
  const humanMode = page.getByTestId('video-mode-menu').getByRole('menuitemradio', { name: '数字人' })
  await expect(humanMode).toBeDisabled()
  await expect(humanMode).toHaveAttribute('title', '需要 1 张图片和 1 条音频参考')
  await expect(editor).toBeVisible()
})

test('storyboard regeneration reuses the same model catalogue, capability clamp and canvas node state', async ({
  page,
  request,
}) => {
  await selectPopulated(request)
  await page.goto(PROJECT_URL)
  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('storyboard-card-node_video_01').click()

  const detail = page.getByTestId('media-detail')
  await expect(detail).toBeVisible()
  await detail.getByTestId('detail-model').click()
  const catalog = page.getByTestId('video-model-catalog')
  await expect(catalog).toBeVisible()
  await expect(catalog.locator('[data-testid^="video-model-option-"]')).toHaveCount(36)
  await catalog.getByRole('searchbox', { name: '搜索视频模型' }).fill('Minimax H3 Max')
  await catalog.getByTestId('video-model-option-minimax-h3-max').click()

  await expect(detail.getByTestId('detail-model')).toContainText('Minimax H3 Max')
  await expect(detail.getByTestId('detail-video-output')).toContainText('16:9 · 720P · 5s · 1个 · 静音')
  await expect(detail.getByRole('button', { name: '21:9' })).toHaveCount(0)
  await expect(detail.getByRole('button', { name: '1个' })).toBeVisible()

  await page.getByTestId('view-workflow').click()
  const editor = await page.getByTestId('node-node_video_01').dblclick().then(() => page.getByTestId('video-node-editor'))
  await expect(editor.getByTestId('video-model-selector')).toContainText('Minimax H3 Max')
  await expect(editor.getByTestId('video-output-selector')).toContainText('16:9 · 720P · 5s · 1个 · 静音')
})

test('Video reference mode toggles graph edges and restores the node editor chrome', async ({ page, request }) => {
  const editor = await openVideoEditor(page, request)

  await editor.getByRole('button', { name: '参考', exact: true }).click()
  const banner = page.getByTestId('canvas-selection-banner')
  await expect(banner).toContainText('从画布选择参考')
  await expect(banner).toContainText('在当前画布中添加参考')
  await expect(page.getByTestId('editor-topbar')).toHaveCount(0)
  await expect(page.getByTestId('canvas-primary-rail')).toHaveCount(0)

  const imageCandidate = page.getByTestId('reference-candidate-node_image_01')
  const textCandidate = page.getByTestId('reference-candidate-node_text_01')
  const cyclicCandidate = page.getByTestId('reference-candidate-node_composite_01')
  await expect(imageCandidate).toContainText('取消选择')
  await expect(textCandidate).toContainText('添加参考')
  await expect(cyclicCandidate).toBeDisabled()
  await expect(cyclicCandidate).toHaveAttribute('title', '该连线会形成循环依赖')
  await expectVisualBaseline(page, 'video-reference-picker-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/video-reference-picker-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })

  const imageMutation = waitForCanvasMutation(page)
  await imageCandidate.click()
  await imageMutation
  await expect(imageCandidate).toContainText('添加参考')
  await expect
    .poll(async () => {
      const body = await readCanvas(request)
      return body.canvas.document.edges.some(
        (edge: { source: string; target: string }) => edge.source === 'node_image_01' && edge.target === 'node_video_01',
      )
    })
    .toBe(false)

  const textMutation = waitForCanvasMutation(page)
  await textCandidate.click()
  await textMutation
  await expect(textCandidate).toContainText('取消选择')
  await expect
    .poll(async () => {
      const body = await readCanvas(request)
      return body.canvas.document.edges.some(
        (edge: { source: string; target: string }) => edge.source === 'node_text_01' && edge.target === 'node_video_01',
      )
    })
    .toBe(true)

  await banner.getByRole('button', { name: '返回节点' }).click()
  await expect(banner).toHaveCount(0)
  await expect(page.getByTestId('editor-topbar')).toBeVisible()
  await expect(page.getByTestId('canvas-primary-rail')).toBeVisible()
  await expect(editor).toBeVisible()
})

test('reference cards support rich @ mentions, source preview, locating and deletion cleanup', async ({ page, request }) => {
  const editor = await openVideoEditor(page, request)
  const strip = editor.getByTestId('video-reference-strip')
  await expect(strip.getByTestId('video-reference-card-node_image_01')).toBeVisible()
  await expect(strip).toContainText('图片 1')

  await strip.getByRole('button', { name: '在提示词中引用 图片 1' }).click()
  await expect(editor.getByTestId('video-mention-chip')).toHaveCount(1)
  await expect(editor.getByTestId('video-mention-chip')).toContainText('图片 1')

  const preview = page.getByTestId('video-reference-preview')
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('首帧图片')
  await preview.getByRole('button', { name: '定位首帧图片' }).click()
  await expect(preview).toHaveCount(0)

  await expect
    .poll(async () => {
      const body = await readCanvas(request)
      const video = body.canvas.document.nodes.find((item: { id: string }) => item.id === 'node_video_01')
      return video.data.extra.videoMentions
    })
    .toMatchObject([{ nodeId: 'node_image_01', label: '图片 1', ordinal: 1 }])

  await strip.getByRole('button', { name: '移除参考 图片 1' }).click()
  await expect(strip).toHaveCount(0)
  await expect(editor.getByTestId('video-mention-chip')).toHaveCount(0)
  await expect
    .poll(async () => {
      const body = await readCanvas(request)
      const video = body.canvas.document.nodes.find((item: { id: string }) => item.id === 'node_video_01')
      return {
        linked: body.canvas.document.edges.some(
          (edge: { source: string; target: string }) => edge.source === 'node_image_01' && edge.target === 'node_video_01',
        ),
        mentions: video.data.extra.videoMentions,
      }
    })
    .toEqual({ linked: false, mentions: [] })
})

test('element selection persists a deterministic local image region', async ({ page, request }) => {
  const editor = await openVideoEditor(page, request)

  await editor.getByRole('button', { name: '标记', exact: true }).click()
  const banner = page.getByTestId('canvas-selection-banner')
  await expect(banner).toContainText('元素选择模式')
  await expect(banner).toContainText('点击图片选择局部元素')
  await page.getByTestId('element-candidate-node_image_01').click()

  await expect(banner).toHaveCount(0)
  await expect(editor.getByTestId('video-element-chip')).toContainText('元素 1')
  await expect
    .poll(async () => {
      const body = await readCanvas(request)
      const video = body.canvas.document.nodes.find((item: { id: string }) => item.id === 'node_video_01')
      return video.data.extra.elementMarks
    })
    .toMatchObject([
      { nodeId: 'node_image_01', x: 0.22, y: 0.18, width: 0.44, height: 0.58, label: '元素 1' },
    ])
})

test('camera movement library mirrors the 23-card plaza, favorites and Escape layering', async ({ page, request }) => {
  const editor = await openVideoEditor(page, request)

  await editor.getByRole('button', { name: '运镜', exact: true }).click()
  const library = page.getByTestId('video-camera-library')
  await expect(library).toBeVisible()
  await expect(library.getByRole('tab', { name: '运镜广场' })).toHaveAttribute('aria-selected', 'true')
  await expect(library.getByRole('tab', { name: '我的收藏' })).toBeVisible()
  await expect(library.getByRole('tab', { name: '我的运镜' })).toBeVisible()
  await expect(library.locator('[data-testid^="camera-move-card-"]')).toHaveCount(23)
  await expect(library).toContainText('23 个运镜')

  await expectVisualBaseline(page, 'video-camera-library-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/video-camera-library-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })

  const search = library.getByRole('searchbox', { name: '搜索运镜名称' })
  await search.fill('柯克')
  await expect(library.locator('[data-testid^="camera-move-card-"]')).toHaveCount(1)
  await expect(library).toContainText('柯克变焦')
  await search.clear()

  await library.getByRole('button', { name: '收藏 固定镜头' }).click()
  await library.getByRole('tab', { name: '我的收藏' }).click()
  await expect(library.locator('[data-testid^="camera-move-card-"]')).toHaveCount(1)
  await expect(library).toContainText('固定镜头')

  await library.getByRole('tab', { name: '我的运镜' }).click()
  await expect(library).toContainText('还没有自定义运镜')
  await library.getByRole('tab', { name: '运镜广场' }).click()
  await library.getByTestId('camera-move-card-cam-push').click()
  await expect(library).toHaveCount(0)

  await expect
    .poll(async () => {
      const body = await readCanvas(request)
      const video = body.canvas.document.nodes.find((item: { id: string }) => item.id === 'node_video_01')
      return {
        cameraMove: video.data.extra.cameraMove,
        cameraFavorites: video.data.extra.cameraFavorites,
        prompt: video.data.prompt,
      }
    })
    .toMatchObject({
      cameraMove: 'cam-push',
      cameraFavorites: ['cam-static'],
      prompt: expect.stringContaining('镜头向主体匀速前推'),
    })

  await editor.getByRole('button', { name: '运镜', exact: true }).click()
  await expect(library).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(library).toHaveCount(0)
  await expect(editor).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(editor).toHaveCount(0)
})
