import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'

type RectExpectation = Partial<Record<'x' | 'y' | 'width' | 'height' | 'right' | 'bottom' | 'centerX', number>>

async function selectScenario(request: APIRequestContext, scenarioId: 'authenticated-empty' | 'authenticated-populated') {
  const response = await request.post('/api/dev/scenario', { data: { scenarioId } })
  expect(response.ok()).toBe(true)
}

async function createEmptyProject(page: Page) {
  await page.goto('/project')
  await page.getByTestId('start-create').click()
  await page.waitForURL(/\/canvas\?projectId=/)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
}

async function expectRect(locator: Locator, expected: RectExpectation, tolerance = 2) {
  await expect(locator).toBeVisible({ timeout: 5_000 })
  const box = await locator.boundingBox()
  expect(box, `expected ${await locator.getAttribute('data-testid')} to have a bounding box`).not.toBeNull()
  if (!box) return

  const actual = {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    right: box.x + box.width,
    bottom: box.y + box.height,
    centerX: box.x + box.width / 2,
  }

  for (const [key, value] of Object.entries(expected) as Array<[keyof typeof actual, number]>) {
    expect(actual[key], `${key} of ${await locator.getAttribute('data-testid')}`).toBeGreaterThanOrEqual(value - tolerance)
    expect(actual[key], `${key} of ${await locator.getAttribute('data-testid')}`).toBeLessThanOrEqual(value + tolerance)
  }
}

async function directMenuRows(menu: Locator) {
  return menu.locator(':scope > div > button[role="menuitem"]').evaluateAll((rows) =>
    rows.map((row) =>
      Array.from(row.children)
        .map((part) => part.textContent?.trim() ?? '')
        .filter(Boolean),
    ),
  )
}

async function expectVisualBaseline(page: Page, name: string) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    // 1440×900 gives a 129-pixel budget. The former 0.1% threshold let
    // changed metadata and a resized action control slip through together.
    maxDiffPixelRatio: 0.0001,
  })
}

test('empty workflow uses the current dark 1440×900 editor shell', async ({ page, request }) => {
  await selectScenario(request, 'authenticated-empty')
  await createEmptyProject(page)

  const editor = page.locator('[data-app-shell="editor"]')
  await expect(editor).toBeVisible()
  expect(await editor.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(20, 20, 20)')

  await expectRect(page.getByTestId('project-canvas-control'), { x: 16, y: 16, height: 32 })
  await expectRect(page.getByTestId('view-mode-switch'), { y: 16, height: 32 })
  await expectRect(page.getByTestId('editor-account-actions'), { y: 16, height: 32, right: 1424 })
  expect(await page.getByTestId('agent-toggle').evaluate((element) => getComputedStyle(element).color)).toBe(
    'rgba(255, 255, 255, 0.86)',
  )
  await expectRect(page.getByTestId('canvas-primary-rail'), { y: 840, height: 48, bottom: 888, centerX: 720 })
  await expectRect(page.getByTestId('canvas-status-rail'), { x: 22, bottom: 882, height: 28 }, 3)

  await expect(page.locator('.react-flow__minimap')).toHaveCount(0)

  const starters = page.getByTestId('empty-canvas-starters')
  await expect(starters).toBeVisible()
  await expect(starters).toContainText('双击画布 自由生成节点')
  await expect(starters.getByRole('button').allTextContents()).resolves.toEqual([
    '故事脚本生成',
    '角色三视图',
    '首帧图生视频',
    '音频生视频',
  ])

  const unnamedButtons = await editor.locator('button:visible').evaluateAll((buttons) =>
    buttons
      .map((button, index) => ({
        index,
        name:
          button.getAttribute('aria-label')?.trim() ||
          button.textContent?.trim() ||
          button.getAttribute('title')?.trim() ||
          '',
        testId: button.getAttribute('data-testid'),
      }))
      .filter((button) => !button.name),
  )
  expect(unnamedButtons).toEqual([])
  await expectVisualBaseline(page, 'canvas-empty-dark-1440x900.png')
})

test('add menu exposes the current product taxonomy and dismisses back to its trigger', async ({ page, request }) => {
  await selectScenario(request, 'authenticated-empty')
  await createEmptyProject(page)

  const trigger = page.getByTestId('add-node-button')
  await trigger.click()
  const menu = page.getByRole('menu').first()
  await expect(menu).toBeVisible()

  expect(await directMenuRows(menu)).toEqual([
    ['文本'],
    ['图片'],
    ['视频'],
    ['智能剪辑', 'Beta'],
    ['导演台', 'NEW'],
    ['逐帧拉片', 'SD 2.5'],
    ['音频'],
    ['脚本'],
    ['素材库'],
    ['上传'],
    ['从生成历史选择'],
  ])
  await expectVisualBaseline(page, 'canvas-add-menu-dark-1440x900.png')

  await menu.getByRole('menuitem', { name: '脚本', exact: true }).hover()
  await expect(page.getByRole('menu')).toHaveCount(2)
  await expect(page.getByRole('menu').last().getByRole('menuitem', { name: '脚本 V2', exact: true })).toBeVisible()

  await menu.getByRole('menuitem', { name: '素材库', exact: true }).hover()
  const materialMenu = page.getByRole('menu').last()
  await expect(materialMenu.getByRole('menuitem', { name: '风格库', exact: true })).toBeVisible()
  await expect(materialMenu.getByRole('menuitem', { name: '特效库', exact: true })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('首帧图生视频 starter creates a direct image-to-video workflow', async ({ page, request }) => {
  await selectScenario(request, 'authenticated-empty')
  await createEmptyProject(page)

  await page.getByTestId('starter-preset-first-frame-video').click({ timeout: 5_000 })
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(1)
  await expect(page.locator('[data-node-type="video"]')).toHaveCount(1)
  await expect(page.locator('[data-node-type]')).toHaveCount(2)
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
})

test('音频生视频 starter creates a direct audio-to-video workflow', async ({ page, request }) => {
  await selectScenario(request, 'authenticated-empty')
  await createEmptyProject(page)

  await page.getByTestId('starter-preset-audio-video').click({ timeout: 5_000 })
  await expect(page.locator('[data-node-type="audio"]')).toHaveCount(1)
  await expect(page.locator('[data-node-type="video"]')).toHaveCount(1)
  await expect(page.locator('[data-node-type]')).toHaveCount(2)
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
})

test('populated workflow uses minimal media nodes, bezier edges and hover handles', async ({ page, request }) => {
  await selectScenario(request, 'authenticated-populated')
  await page.goto('/canvas?projectId=prj_video_demo&canvasId=can_video_main')
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  await expect(page.locator('[data-node-type]')).toHaveCount(4)
  await expect(page.locator('.react-flow__edge')).toHaveCount(3)
  expect(await page.locator('.react-flow__viewport').getAttribute('style')).toContain('scale(0.5)')
  await expect(page.getByTestId('zoom-readout')).toHaveText('50%')
  await expectRect(page.getByTestId('node-node_text_01'), { x: 160, y: 154 }, 3)
  await expectRect(page.getByTestId('node-node_composite_01'), { x: 850, right: 1060 }, 3)

  const imageNode = page.getByTestId('node-node_image_01')
  const imageHeader = page.getByTestId('node-header-node_image_01')
  const imageShell = page.getByTestId('node-shell-node_image_01')
  await expect(imageHeader).toContainText('首帧图片')
  await expect(page.getByTestId('node-dimensions-node_image_01')).toHaveText('1280 × 720')
  await expect(imageShell).toHaveAttribute('data-visual-kind', 'media')
  expect(await imageShell.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')

  const preview = imageNode.locator('img')
  await expect(preview).toBeVisible()
  expect(await preview.evaluate((element) => getComputedStyle(element).borderRadius)).toBe('12px')
  await expectVisualBaseline(page, 'canvas-populated-dark-1440x900.png')

  const handle = imageNode.locator('.react-flow__handle-right')
  expect(await handle.evaluate((element) => getComputedStyle(element).width)).toBe('20px')
  expect(await handle.evaluate((element) => getComputedStyle(element).opacity)).toBe('0')
  await imageNode.hover()
  await expect.poll(() => handle.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')

  const edge = page.locator('.react-flow__edge').first()
  await expect(edge).toHaveClass(/react-flow__edge-default/)
  expect(await edge.locator('.react-flow__edge-path').evaluate((element) => getComputedStyle(element).strokeWidth)).toBe(
    '1.25px',
  )

  await imageHeader.click()
  await expect(imageShell).toHaveAttribute('data-selected', 'true')
})

test('storyboard preserves the document while matching default, expanded and Agent layouts', async ({ page, request }) => {
  await selectScenario(request, 'authenticated-populated')
  await page.goto('/canvas?projectId=prj_video_demo&canvasId=can_video_main')
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  const before = await request.get('/api/canvases/can_video_main').then((response) => response.json())
  await page.getByTestId('view-storyboard').click()

  const storyboard = page.getByTestId('storyboard-view')
  const leftRail = page.getByTestId('storyboard-left-rail')
  const imageColumn = page.getByTestId('storyboard-image')
  const videoColumn = page.getByTestId('storyboard-video')

  await expect(storyboard).toBeVisible()
  await expectRect(leftRail, { x: 16, y: 72, width: 470 })
  await expectRect(imageColumn, { x: 498, y: 72, width: 456 }, 3)
  await expectRect(videoColumn, { x: 967, y: 72, right: 1424 }, 3)
  expect(await imageColumn.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(36, 36, 36)')
  await expect(imageColumn).toContainText('1280 × 720')

  const afterSwitch = await request.get('/api/canvases/can_video_main').then((response) => response.json())
  expect(afterSwitch.canvas.revision).toBe(before.canvas.revision)
  expect(afterSwitch.canvas.document).toEqual(before.canvas.document)

  const clipEntry = page.getByTestId('open-clip-editor')
  await expectRect(clipEntry, { width: 56, height: 56, right: 1420, bottom: 880 })
  expect(
    await clipEntry.evaluate((element) => Number.parseFloat(getComputedStyle(element).borderRadius)),
  ).toBeGreaterThanOrEqual(28)
  await clipEntry.click()
  await expect(page.getByTestId('clip-editor')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('clip-editor')).toHaveCount(0)
  await expectVisualBaseline(page, 'storyboard-dark-1440x900.png')

  await page.getByTestId('expand-image').click()
  await expect(leftRail).toBeVisible()
  await expect(videoColumn).toHaveCount(0)
  await expectRect(leftRail, { x: 16, width: 470 })
  await expectRect(imageColumn, { x: 498, right: 1424 })

  await page.getByTestId('expand-image').click()
  await page.getByTestId('agent-toggle').click()
  const agent = page.getByTestId('agent-panel')
  await expectRect(agent, { x: 1100, width: 340, right: 1440 }, 1)
  await expectRect(storyboard, { x: 0, width: 1100, right: 1100 }, 1)
  await expectRect(clipEntry, { width: 56, height: 56, right: 1080, bottom: 880 })
  const agentImage = page.getByTestId('storyboard-image')
  const agentVideo = page.getByTestId('storyboard-video')
  const leftBox = await leftRail.boundingBox()
  const imageBox = await agentImage.boundingBox()
  const videoBox = await agentVideo.boundingBox()
  expect(leftBox?.width).toBeGreaterThanOrEqual(340)
  expect(leftBox?.width).toBeLessThanOrEqual(365)
  expect(imageBox?.width).toBeGreaterThanOrEqual(330)
  expect(imageBox?.width).toBeLessThanOrEqual(355)
  expect(videoBox?.width).toBeGreaterThanOrEqual(330)
  expect(videoBox?.width).toBeLessThanOrEqual(355)
  await expectVisualBaseline(page, 'storyboard-agent-dark-1440x900.png')
})

test('Agent asset management keeps the dedicated empty surface free of personal browse controls', async ({ page, request }) => {
  await selectScenario(request, 'authenticated-empty')
  await createEmptyProject(page)

  await page.getByTestId('asset-sidebar-toggle').click()
  const sidebar = page.getByTestId('asset-sidebar')
  await expect(sidebar).toBeVisible()
  await sidebar.getByRole('button', { name: '资产', exact: true }).click()
  await sidebar.getByTestId('sidebar-assets-agent').click()

  await expect(sidebar.getByText('暂无素材')).toBeVisible()
  await expect(sidebar.getByTestId('sidebar-asset-search')).toHaveCount(0)
  await expect(sidebar.locator('[data-testid^="sidebar-asset-kind-"]')).toHaveCount(0)
  await expect(sidebar.getByTestId('sidebar-upload')).toHaveCount(0)
  await expect(sidebar.getByTestId('sidebar-open-library')).toHaveCount(0)
  await expect(sidebar.getByTestId('sidebar-empty-upload')).toHaveCount(0)
})
