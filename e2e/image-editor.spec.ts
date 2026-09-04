import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const SHOTS = process.env.VISUAL_ARTIFACTS_DIR ?? "test-results/documentation"

const PROJECT_URL = '/canvas?projectId=prj_video_demo&canvasId=can_video_main'

async function selectPopulated(request: APIRequestContext) {
  const response = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-populated' } })
  expect(response.ok()).toBe(true)
}

async function openImageEditor(page: Page, request: APIRequestContext) {
  await selectPopulated(request)
  await page.goto(PROJECT_URL)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  await page.getByTestId('node-node_image_01').dblclick()
  return page.getByTestId('image-node-editor')
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

test('Image double click opens the inverse-scaled node authoring surface', async ({ page, request }) => {
  const editor = await openImageEditor(page, request)

  await expect(editor).toBeVisible()
  await expect(page.getByTestId('node-inspector')).toHaveCount(0)
  await expect(editor).toHaveClass(/nodrag/)
  await expect(editor).toHaveClass(/nowheel/)
  await expect(editor).toHaveClass(/nopan/)

  const atFifty = await editor.boundingBox()
  expect(atFifty?.width).toBeGreaterThanOrEqual(658)
  expect(atFifty?.width).toBeLessThanOrEqual(662)
  await expect(editor.getByRole('button', { name: '参考', exact: true })).toBeVisible()
  await expect(editor.getByRole('button', { name: '标记', exact: true })).toBeVisible()
  await expect(editor.getByRole('button', { name: '风格', exact: true })).toBeVisible()
  await expect(editor.getByPlaceholder(/可直接文字生图/)).toBeVisible()
  await expect(editor.getByTestId('image-output-selector')).toContainText('16:9 · 标准画质 · 2K · 1张')
  await expect(page.getByTestId('node-shell-node_image_01')).toHaveAttribute('data-selected', 'false')

  await expectVisualBaseline(page, 'image-node-editor-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/image-node-editor-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })

  await page.mouse.move(1_260, 700)
  await page.mouse.wheel(0, 620)
  await expect(page.getByTestId('zoom-readout')).toHaveText('33%')
  const atThirtyThree = await editor.boundingBox()
  expect(atThirtyThree?.width).toBeGreaterThanOrEqual(658)
  expect(atThirtyThree?.width).toBeLessThanOrEqual(662)
})

test('Image model catalogue exposes the seven observed models with keyboard layering', async ({ page, request }) => {
  const editor = await openImageEditor(page, request)
  await editor.getByTestId('image-model-selector').click()

  const catalog = page.getByTestId('image-model-catalog')
  await expect(catalog).toBeVisible()
  await expect(catalog.locator('[data-testid^="image-model-option-"]')).toHaveCount(7)
  await expect(catalog).toContainText('7 个结果')
  await expectVisualBaseline(page, 'image-model-catalog-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/image-model-catalog-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })

  await catalog.getByRole('searchbox', { name: '搜索图片模型' }).fill('Niji')
  await expect(catalog.locator('[data-testid^="image-model-option-"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(catalog).toHaveCount(0)
  await expect(editor.getByTestId('image-model-selector')).toContainText('Midjourney Niji 7')

  await editor.getByTestId('image-model-selector').click()
  await expect(catalog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(catalog).toHaveCount(0)
  await expect(editor).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(editor).toHaveCount(0)
})

test('Image output popover exposes and persists the exact option matrix', async ({ page, request }) => {
  const editor = await openImageEditor(page, request)
  await editor.getByTestId('image-output-selector').click()
  const output = page.getByTestId('image-output-popover')

  await expect(output).toBeVisible()
  await expect(output.getByRole('button', { name: /画质/ })).toHaveCount(3)
  await expect(output.getByRole('button', { name: /清晰度/ })).toHaveCount(3)
  await expect(output.locator('[data-image-aspect]')).toHaveCount(13)
  await expect(output.getByRole('button', { name: /生成数量/ })).toHaveCount(3)
  await expectVisualBaseline(page, 'image-output-popover-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/image-output-popover-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })

  await output.getByRole('button', { name: '高画质' }).click()
  await output.getByRole('button', { name: '4K 清晰度' }).click()
  await output.getByRole('button', { name: '9:21 比例' }).click()
  await output.getByRole('button', { name: '4张 生成数量' }).click()
  await page.keyboard.press('Escape')
  await expect(editor.getByTestId('image-output-selector')).toContainText('9:21 · 高画质 · 4K · 4张')

  await expect
    .poll(async () => {
      const body = await request.get('/api/canvases/can_video_main').then((response) => response.json())
      return body.canvas.document.nodes.find((node: { id: string }) => node.id === 'node_image_01').data.output
    })
    .toEqual({ aspectRatio: '9:21', quality: 'high', resolution: '4K', count: 4 })
})

test('Image references and style application persist graph dependencies', async ({ page, request }) => {
  const editor = await openImageEditor(page, request)

  await editor.getByRole('button', { name: '参考', exact: true }).click()
  const banner = page.getByTestId('canvas-selection-banner')
  await expect(banner).toContainText('从画布选择参考')
  const textCandidate = page.getByTestId('reference-candidate-node_text_01')
  await expect(textCandidate).toContainText('取消选择')
  await expectVisualBaseline(page, 'image-reference-selection-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/image-reference-selection-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })
  await textCandidate.click()
  await expect(textCandidate).toContainText('添加参考')
  await banner.getByRole('button', { name: '返回节点' }).click()
  await expect(editor).toBeVisible()

  await editor.getByRole('button', { name: '风格', exact: true }).click()
  const market = page.getByTestId('material-panel')
  await expect(market).toBeVisible()
  await expect(market).toContainText('风格广场')
  await expectVisualBaseline(page, 'image-style-market-dark-1440x900.png')
  await page.screenshot({
    path: `${SHOTS}/image-style-market-dark-1440x900.png`,
    scale: 'css',
    animations: 'disabled',
  })
  await market.getByTestId('material-style-cine-teal').click()

  await expect
    .poll(async () => {
      const body = await request.get('/api/canvases/can_video_main').then((response) => response.json())
      const target = body.canvas.document.nodes.find((node: { id: string }) => node.id === 'node_image_01')
      const style = body.canvas.document.nodes.find((node: { type: string }) => node.type === 'style')
      return {
        textLinked: body.canvas.document.edges.some(
          (edge: { source: string; target: string }) => edge.source === 'node_text_01' && edge.target === 'node_image_01',
        ),
        styleName: style?.name,
        styleLinked: body.canvas.document.edges.some(
          (edge: { source: string; target: string }) => edge.source === style?.id && edge.target === 'node_image_01',
        ),
        selection: target.data.extra.imageStyle,
      }
    })
    .toMatchObject({
      textLinked: false,
      styleName: '电影青橙',
      styleLinked: true,
      selection: { presetId: 'style-cine-teal', name: '电影青橙' },
    })
})

test('Image presets and generated-image tools create replayable pending nodes', async ({ page, request }) => {
  const editor = await openImageEditor(page, request)
  await editor.getByRole('button', { name: '预设', exact: true }).click()
  const presets = page.getByTestId('image-preset-catalog')
  await expect(presets).toBeVisible()
  await expect(presets).toContainText('分镜叙事')
  await expect(presets).toContainText('质感调节')
  await expect(presets).toContainText('空间与机位')
  await expect(presets).toContainText('设定图')
  await presets.getByRole('button', { name: /多机位九宫格/ }).click()

  await expect(editor.getByPlaceholder(/可直接文字生图/)).toHaveValue(/九宫格/)
  await expect(editor.getByTestId('image-output-selector')).toContainText('16:9 · 高画质 · 4K · 1张')

  const toolbar = page.getByTestId('image-artifact-toolbar')
  await expect(toolbar).toBeVisible()

  const downloadEvent = page.waitForEvent('download')
  await toolbar.getByRole('button', { name: '下载图片' }).click()
  await expect((await downloadEvent).suggestedFilename()).toBe('首帧图片.webp')

  await toolbar.getByRole('button', { name: '展开图片' }).click()
  await expect(page.getByTestId('image-lightbox')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('image-lightbox')).toHaveCount(0)
  await expect(editor).toBeVisible()

  await toolbar.getByRole('button', { name: '高清', exact: true }).click()

  await expect
    .poll(async () => {
      const body = await request.get('/api/canvases/can_video_main').then((response) => response.json())
      const derived = body.canvas.document.nodes.find(
        (node: { data: { extra?: { imageTransform?: { tool?: string } } } }) => node.data.extra?.imageTransform?.tool === 'upscale',
      )
      return {
        imageCount: body.canvas.document.nodes.filter((node: { type: string }) => node.type === 'image').length,
        name: derived?.name,
        sourceNodeId: derived?.data.extra.imageTransform.sourceNodeId,
        edge: body.canvas.document.edges.some(
          (edge: { source: string; target: string }) => edge.source === 'node_image_01' && edge.target === derived?.id,
        ),
      }
    })
    .toEqual({ imageCount: 2, name: '高清', sourceNodeId: 'node_image_01', edge: true })
})
