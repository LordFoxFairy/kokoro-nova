import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const PROJECT_URL = '/canvas?projectId=prj_video_demo&canvasId=can_video_main'

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

  await expectVisualBaseline(page, 'video-node-editor-dark-1440x900.png')
  await page.screenshot({
    path: 'docs/screenshots/video-node-editor-dark-1440x900.png',
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
    path: 'docs/screenshots/video-model-catalog-dark-1440x900.png',
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
      const response = await request.get('/api/canvases/can_video_main')
      const body = await response.json()
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
      const body = await request.get('/api/canvases/can_video_main').then((response) => response.json())
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
