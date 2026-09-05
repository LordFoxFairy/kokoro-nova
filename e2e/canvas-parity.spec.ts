import { expect, test, type Locator, type Page } from '@playwright/test'
import { createProjectAndOpenCanvas, openCanvasFixture, selectCanvasScenario } from './helpers/canvas-fixtures'
import { waitForStableVisuals } from './helpers/visual-stability'

type RectExpectation = Partial<Record<'x' | 'y' | 'width' | 'height' | 'right' | 'bottom' | 'centerX', number>>

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
  await waitForStableVisuals(page)
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
  await selectCanvasScenario(request, 'authenticated-empty')
  await createProjectAndOpenCanvas(page, request)

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

test('project identity can be renamed inline without leaving the canvas', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-empty')
  await createProjectAndOpenCanvas(page, request)

  const projectName = page.getByTestId('project-name')
  await expect(projectName).toHaveText('未命名项目 1')
  await projectName.click()

  const input = page.getByTestId('project-rename-input')
  await expect(input).toBeFocused()
  await input.fill('Canvas parity fixture')
  const persisted = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'PATCH' && url.pathname.startsWith('/api/projects/') && response.ok()
  })
  await input.press('Enter')
  await persisted

  await expect(page.getByTestId('project-name')).toHaveText('Canvas parity fixture')
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
})

test('canvas viewport survives a reload as local view state', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-empty')
  await createProjectAndOpenCanvas(page, request)

  const sharedDocumentWrites: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/canvases/')) {
      sharedDocumentWrites.push(request.url())
    }
  })
  await page.mouse.move(100, 120)
  await page.mouse.wheel(0, -420)
  const zoomReadout = page.getByTestId('zoom-readout')
  await expect.poll(async () => zoomReadout.textContent()).not.toBe('100%')
  const zoom = await zoomReadout.textContent()
  await page.waitForTimeout(300)
  expect(sharedDocumentWrites).toEqual([])

  await page.reload()
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  await expect(zoomReadout).toHaveText(zoom ?? '')
})

test('canvas switcher persists create, rename, copy and deletion lifecycle', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-empty')
  const initial = await createProjectAndOpenCanvas(page, request)

  const switcher = page.getByTestId('canvas-switcher')
  await switcher.click()
  const initialMenu = page.getByTestId('menu')
  await expect(initialMenu.getByRole('menuitem', { name: '删除画布' })).toBeDisabled()
  await initialMenu.getByRole('menuitem', { name: '新建画布' }).click()

  const createInput = page.getByTestId('canvas-new-input')
  await expect(createInput).toBeFocused()
  await createInput.fill('分镜制作')
  const createdResponse = page.waitForResponse((response) => {
    return response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/canvases' && response.ok()
  })
  await createInput.press('Enter')
  const created = (await createdResponse).json() as Promise<{ id: string; projectId: string; name: string }>
  const createdCanvas = await created
  expect(createdCanvas).toMatchObject({ projectId: initial.project.id, name: '分镜制作' })
  await expect
    .poll(() => {
      const url = new URL(page.url())
      return { pathname: url.pathname, projectId: url.searchParams.get('projectId'), canvasId: url.searchParams.get('canvasId') }
    })
    .toEqual({ pathname: '/canvas', projectId: initial.project.id, canvasId: createdCanvas.id })
  await expect(switcher).toContainText('分镜制作')

  await page.reload()
  await expect(switcher).toContainText('分镜制作')
  await switcher.click()
  await page.getByTestId('menu').getByRole('menuitem', { name: '重命名' }).click()
  const renameInput = page.getByTestId('canvas-rename-input')
  await renameInput.fill('分镜定稿')
  const renamedResponse = page.waitForResponse((response) => {
    return response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/canvases/${createdCanvas.id}` && response.ok()
  })
  await renameInput.press('Enter')
  await renamedResponse
  await page.reload()
  await expect(switcher).toContainText('分镜定稿')

  await switcher.click()
  const copiedResponse = page.waitForResponse((response) => {
    return response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/canvases' && response.ok()
  })
  await page.getByTestId('menu').getByRole('menuitem', { name: '复制画布' }).click()
  const copiedCanvas = (await copiedResponse).json() as Promise<{ id: string; name: string }>
  const copied = await copiedCanvas
  expect(copied.name).toBe('分镜定稿副本1')
  await expect.poll(() => new URL(page.url()).searchParams.get('canvasId')).toBe(copied.id)
  await expect(switcher).toContainText('分镜定稿副本1')

  await switcher.click()
  const deletedResponse = page.waitForResponse((response) => {
    return response.request().method() === 'DELETE' && new URL(response.url()).pathname === `/api/canvases/${copied.id}` && response.ok()
  })
  await page.getByTestId('menu').getByRole('menuitem', { name: '删除画布' }).click()
  await expect(page.getByTestId('confirm-dialog')).toContainText('分镜定稿副本1')
  await page.getByTestId('confirm-dialog').getByTestId('confirm-submit').click()
  await deletedResponse
  // Deleting the current canvas returns to the project's first remaining canvas.
  await expect.poll(() => new URL(page.url()).searchParams.get('canvasId')).toBe(initial.canvas.id)
  await expect(switcher).toContainText('画布 1')
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
})

test('node context actions and empty-canvas creation provide keyboard-readable feedback', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-empty')
  await createProjectAndOpenCanvas(page, request)

  await page.mouse.dblclick(720, 200)
  await expect(page.locator('[data-node-type="text"]')).toHaveCount(1)
  await expect(page.getByTestId('canvas-live-region')).toHaveText(/已创建文本节点/)

  const node = page.locator('[data-node-type="text"]').first()
  await node.click({ button: 'right' })
  const menu = page.getByRole('menu').last()
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '创建副本', exact: true })).toBeVisible()
  await expectVisualBaseline(page, 'canvas-node-context-menu-dark-1440x900.png')

  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
})

test('Shift-click keeps a readable multi-node selection in the controlled graph', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-populated')
  await openCanvasFixture(page, request)

  const first = page.getByTestId('node-node_text_01')
  const second = page.getByTestId('node-node_image_01')
  await first.click()
  await second.click({ modifiers: ['Shift'] })

  await expect(first).toHaveAttribute('data-selection-state', 'selected')
  await expect(second).toHaveAttribute('data-selection-state', 'selected')
  await expect(page.getByTestId('canvas-live-region')).toHaveText('已选择 2 个节点。')
})

test('add menu exposes the current product taxonomy and dismisses back to its trigger', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-empty')
  await createProjectAndOpenCanvas(page, request)

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

test('primary canvas rail keeps the observed generation-history affordance discoverable', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-empty')
  await createProjectAndOpenCanvas(page, request)

  // The observed editor keeps this as a persistent, named top-level action;
  // local fixture history remains the implementation behind the action.
  await expect(page.getByTestId('open-history')).toHaveAttribute('aria-label', '生成历史')
})

test('首帧图生视频 starter creates a direct image-to-video workflow', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-empty')
  await createProjectAndOpenCanvas(page, request)

  await page.getByTestId('starter-preset-first-frame-video').click({ timeout: 5_000 })
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(1)
  await expect(page.locator('[data-node-type="video"]')).toHaveCount(1)
  await expect(page.locator('[data-node-type]')).toHaveCount(2)
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
})

test('音频生视频 starter creates a direct audio-to-video workflow', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-empty')
  await createProjectAndOpenCanvas(page, request)

  await page.getByTestId('starter-preset-audio-video').click({ timeout: 5_000 })
  await expect(page.locator('[data-node-type="audio"]')).toHaveCount(1)
  await expect(page.locator('[data-node-type="video"]')).toHaveCount(1)
  await expect(page.locator('[data-node-type]')).toHaveCount(2)
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
})

test('populated workflow uses minimal media nodes, bezier edges and hover handles', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-populated')
  await openCanvasFixture(page, request)

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

test('workflow edges support focusable selection and keyboard deletion', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-populated')
  await openCanvasFixture(page, request)

  const edge = page.locator('.react-flow__edge').first()
  await expect(edge).toHaveAttribute('aria-label', /连线/)
  await edge.click()
  await expect(edge).toHaveClass(/selected/)
  await expect(edge).toHaveAttribute('aria-selected', 'true')
  await expect(edge).toHaveAttribute('aria-label', /已选中/)

  const persisted = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'POST' && /^\/api\/canvases\/[^/]+$/.test(url.pathname) && response.ok()
  })
  await page.keyboard.press('Delete')
  await persisted
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  await expect(page.getByTestId('canvas-live-region')).toHaveText('已选择 0 个节点。')
})

test('storyboard preserves the document while matching default, expanded and Agent layouts', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-populated')
  await openCanvasFixture(page, request)

  const before = await request.get('/api/canvases/can_video_main').then((response) => response.json())
  const assetLifecyclesLoaded = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'GET' && url.pathname === '/api/assets' && url.searchParams.get('visibility') === 'all' && response.ok()
  })
  await page.getByTestId('view-storyboard').click()
  await assetLifecyclesLoaded

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

test('storyboard card actions locate the source node and create a workflow copy', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-populated')
  await openCanvasFixture(page, request)

  await page.getByTestId('view-storyboard').click()
  const card = page.getByTestId('storyboard-card-node_image_01').first()
  await card.click()
  const detail = page.getByTestId('media-detail')
  await expect(detail).toBeVisible()

  await detail.getByRole('button', { name: '更多操作', exact: true }).click()
  const menu = page.getByRole('menu').last()
  await expect(menu.getByRole('menuitem', { name: '在工作流中定位', exact: true })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '创建副本', exact: true })).toBeVisible()
  await expectVisualBaseline(page, 'storyboard-card-actions-1440x900.png')

  await menu.getByRole('menuitem', { name: '创建副本', exact: true }).click()
  await expect(page.getByTestId('view-workflow')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('media-detail')).toHaveCount(0)
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(2)
  await expect(page.getByText('副本', { exact: false }).first()).toBeVisible()

  const toast = page.getByTestId('toast').filter({ hasText: '已在工作流中创建副本' })
  await expect(toast).toBeVisible()
})

test('storyboard can return to the source workflow node from the card menu', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-populated')
  await openCanvasFixture(page, request)

  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('storyboard-card-node_video_01').first().click()
  const detail = page.getByTestId('media-detail')
  await detail.getByRole('button', { name: '更多操作', exact: true }).click()
  await page.getByRole('menu').last().getByRole('menuitem', { name: '在工作流中定位', exact: true }).click()

  await expect(page.getByTestId('view-workflow')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('media-detail')).toHaveCount(0)
  await expect(page.getByTestId('node-shell-node_video_01')).toHaveAttribute('data-selected', 'true')
})

test('Agent asset management keeps the dedicated empty surface free of personal browse controls', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-empty')
  await createProjectAndOpenCanvas(page, request)

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
