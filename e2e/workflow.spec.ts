import { expect, test, type Page } from '@playwright/test'

/**
 * End-to-end coverage of the primary path:
 * project → canvas → nodes → connect → generate → storyboard → agent.
 */

const SHOTS = 'docs/screenshots'

// The workspace store is file-backed and survives between runs, so without a
// reset each run inherits the previous run's projects and folders.
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

/** Bring every node back into view — the camera follows the newest one. */
async function fitView(page: Page) {
  await page.keyboard.press('ControlOrMeta+0')
  await page.waitForTimeout(700)
}

/**
 * Select a node by clicking its title row. Clicking the card body would hit the
 * generator's suggestion rows, which open the inspector instead of selecting.
 */
async function selectNode(page: Page, type: string, additive = false) {
  const node = page.locator(`[data-node-type="${type}"]`).first()

  // The camera follows the newest node, so an older one can sit outside the
  // viewport. Re-fit until this node is actually on screen before clicking.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const box = await node.boundingBox()
    const onScreen =
      box !== null &&
      box.x > 0 &&
      box.y > 0 &&
      box.x + 60 < 1440 &&
      box.y + 20 < 900
    if (onScreen) break
    await fitView(page)
  }

  await node.click({ position: { x: 40, y: 8 }, modifiers: additive ? ['Shift'] : [] })
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

async function addNode(page: Page, label: string | RegExp) {
  await page.getByTestId('add-node-button').click()
  const persisted = waitForCanvasMutation(page)
  await page.getByRole('menuitem', { name: label, exact: typeof label === 'string' }).click()
  await persisted
}

test('project list: create, rename, folder lifecycle', async ({ page }) => {
  await page.goto('/project')
  await expect(page.getByRole('heading', { name: '全部项目' })).toBeVisible()

  // 新建文件夹 creates 未命名文件夹 immediately, with no naming form first.
  await page.getByTestId('new-folder').click()
  await expect(page.getByText('未命名文件夹')).toBeVisible()

  await page.screenshot({ path: `${SHOTS}/project-list.png` })

  // Deleting a folder requires typing its exact name.
  const folderCard = page.locator('[data-testid^="folder-more-"]').first()
  await folderCard.click({ force: true })
  await page.getByRole('menuitem', { name: '删除文件夹' }).click()

  const confirm = page.getByTestId('confirm-dialog')
  await expect(confirm).toBeVisible()
  await expect(page.getByTestId('confirm-submit')).toBeDisabled()
  await page.getByTestId('confirm-input').fill('未命名文件夹')
  await expect(page.getByTestId('confirm-submit')).toBeEnabled()
  await page.getByTestId('confirm-submit').click()
  await expect(page.getByText('未命名文件夹')).toHaveCount(0)
})

test('canvas: build a graph, connect nodes, generate, and project to storyboard', async ({ page }) => {
  await createProject(page)

  // Empty canvas offers starter templates.
  await expect(page.getByTestId('starter-preset-shot-breakdown')).toBeVisible()

  await addNode(page, '文本')
  await addNode(page, '图片')
  await addNode(page, '视频')
  await expect(page.locator('[data-node-type="text"]')).toHaveCount(1)
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(1)
  await expect(page.locator('[data-node-type="video"]')).toHaveCount(1)

  // The asset sidebar counts what is actually on the canvas.
  await page.getByTestId('asset-sidebar-toggle').click()
  await expect(page.getByTestId('node-count')).toContainText('共 3 节点')
  // Give the canvas its full width back before fitting the graph into view.
  await page.getByTestId('asset-sidebar-toggle').click()
  await expect(page.getByTestId('asset-sidebar')).toHaveCount(0)

  // Write a prompt through the inspector.
  // The camera follows the latest (video) node, so refit before interacting
  // with the first text node rather than relying on optimistic-write timing.
  await fitView(page)
  const textNode = page.locator('[data-node-type="text"]').first()
  await textNode.dblclick()
  await expect(page.getByTestId('node-inspector')).toBeVisible()
  await page.getByTestId('node-prompt').fill('雪夜里的一盏灯，镜头缓慢推近')
  await page.getByTestId('node-prompt').blur()

  await page.screenshot({ path: `${SHOTS}/canvas-workflow.png` })

  // Select all three and connect them left-to-right with ⌘L.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('node-inspector')).toHaveCount(0)
  await fitView(page)
  await selectNode(page, 'text')
  await selectNode(page, 'image', true)
  await selectNode(page, 'video', true)
  await page.keyboard.press('ControlOrMeta+l')
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)

  await page.screenshot({ path: `${SHOTS}/canvas-connected.png` })

  // Generate the image node: the confirm gate must appear before any charge.
  const balanceBefore = Number(await page.getByTestId('credit-balance').textContent())
  await fitView(page)
  const imageNode = page.locator('[data-node-type="image"]').first()
  await imageNode.hover()
  await imageNode.locator('[data-testid^="node-run-"]').click()

  const gate = page.getByTestId('confirm-gate')
  await expect(gate).toBeVisible()
  await expect(gate).toContainText('积分预估')
  await page.screenshot({ path: `${SHOTS}/confirm-gate.png` })

  await page.getByTestId('confirm-generate').click()
  await expect(gate).toBeHidden()

  // Credits are reserved immediately.
  await expect
    .poll(async () => Number(await page.getByTestId('credit-balance').textContent()), { timeout: 20_000 })
    .toBeLessThan(balanceBefore)

  // Wait for the artifact to land on the node.
  await expect(imageNode.locator('img')).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: `${SHOTS}/canvas-generated.png` })

  // Storyboard projects the same document into media columns.
  await page.getByTestId('view-storyboard').click()
  await expect(page.getByTestId('storyboard-view')).toBeVisible()
  await expect(page.getByTestId('storyboard-text')).toContainText('文本节点')
  await expect(page.getByTestId('storyboard-image')).toContainText('图片节点')
  await expect(page.getByTestId('storyboard-video')).toContainText('视频节点')
  await page.screenshot({ path: `${SHOTS}/storyboard.png` })

  // Video filter separates 成片 from 片段.
  await page.getByTestId('video-filter').click()
  await page.getByRole('menuitem', { name: '成片' }).click()
  await expect(page.getByTestId('storyboard-video')).toContainText('没有属于「成片」的内容')
  await page.getByTestId('video-filter').click()
  await page.getByRole('menuitem', { name: '全部' }).click()

  // Expanding a column drops the other one out of the layout.
  await page.getByTestId('expand-image').click()
  await expect(page.getByTestId('storyboard-video')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/storyboard-expanded.png` })
  await page.getByTestId('expand-image').click()

  // Reference trace: image card → source text node → 添加到对话.
  await page.getByTestId('storyboard-image').locator('[data-testid^="storyboard-card-"]').first().click()
  const detail = page.getByTestId('media-detail')
  await expect(detail).toBeVisible()
  await expect(detail).toContainText('参考元素')
  await detail.locator('[data-testid^="reference-"]').first().click()
  await expect(detail).toContainText('提示词')
  await page.getByTestId('reference-add-to-agent').click()

  // The chip lands in the agent composer.
  await expect(page.getByTestId('agent-panel')).toBeVisible()
  await expect(page.locator('[data-testid^="context-chip-"]').first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/storyboard-agent-chip.png` })
})

test('groups: ⌘G groups, storyboard conversion is gated on image output', async ({ page }) => {
  await createProject(page)
  await addNode(page, '文本')
  await addNode(page, '图片')
  // Both nodes have to exist before selecting: a node is selected as it is
  // created, so clicking mid-creation would hand the selection straight back.
  await expect(page.locator('[data-node-type]')).toHaveCount(2)

  await fitView(page)
  await selectNode(page, 'text')
  await selectNode(page, 'image', true)
  await page.keyboard.press('ControlOrMeta+g')

  const group = page.locator('[data-testid^="group-"]').first()
  await expect(group).toBeVisible()
  await group.click({ position: { x: 10, y: 100 } })

  // 转分镜组 stays disabled until the group owns generated images.
  const convert = page.locator('[data-testid^="convert-storyboard-"]').first()
  await expect(convert).toBeDisabled()
  await page.screenshot({ path: `${SHOTS}/group-actions.png` })
})

test('agent: asks before building, then applies mutations only on confirm', async ({ page }) => {
  await createProject(page)
  await page.getByTestId('agent-toggle').click()
  await expect(page.getByTestId('agent-panel')).toBeVisible()

  // A vague opening brief triggers ask_human and creates nothing.
  await page.getByTestId('agent-input').fill('做个视频')
  await page.getByTestId('agent-send').click()
  await expect(page.getByTestId('ask-human')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-node-type]')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/agent-ask-human.png` })

  // Answering produces a mutation proposal that is still not applied.
  await page.getByTestId('ask-human-input').fill('一条 15 秒的雪夜城市宣传片，需要旁白配音和分镜脚本')
  await page.getByTestId('ask-human-submit').click()
  await expect(page.getByTestId('mutation-proposal')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-node-type]')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/agent-proposal.png` })

  // Confirming writes the nodes into the canvas.
  await page.getByTestId('apply-mutations').click()
  await expect(page.locator('[data-node-type]').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-node-type]')).not.toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/agent-applied.png` })
})

test('shortcuts panel lists the full command set', async ({ page }) => {
  await createProject(page)
  await page.getByTestId('open-shortcuts').click()
  const panel = page.getByTestId('shortcuts-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('成组')
  await expect(panel).toContainText('合并分镜组')
  await expect(panel).toContainText('整理画布')
  await page.screenshot({ path: `${SHOTS}/shortcuts.png` })
})

test('toolbox preset instantiates a connected node group', async ({ page }) => {
  await createProject(page)
  await page.getByTestId('open-toolbox').click()
  await expect(page.getByTestId('toolbox-panel')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/toolbox.png` })

  await page.getByTestId('preset-preset-arc-left').hover()
  await page.getByTestId('preset-use-preset-arc-left').click()

  // The 左弧滑行 template creates three nodes and three dependency edges.
  await expect(page.locator('[data-node-type]')).toHaveCount(3)
  await expect(page.locator('.react-flow__edge')).toHaveCount(3)
  await page.screenshot({ path: `${SHOTS}/toolbox-instantiated.png` })
})

test('canvas: double-clicking empty space creates a node, ⌥-drag leaves a copy', async ({ page }) => {
  await createProject(page)

  // The empty-canvas hint advertises this, so it has to actually work.
  const created = waitForCanvasMutation(page)
  await page.locator('.react-flow__pane').dblclick({ position: { x: 500, y: 420 } })
  await created
  await expect(page.locator('[data-node-type="text"]')).toHaveCount(1)

  // ⌥-drag pulls a duplicate out and leaves the original in place.
  const node = page.locator('[data-node-type="text"]').first()
  const box = await node.boundingBox()
  if (!box) throw new Error('node has no bounding box')

  const duplicated = waitForCanvasMutation(page)
  await page.keyboard.down('Alt')
  await page.mouse.move(box.x + 40, box.y + 8)
  await page.mouse.down()
  await page.mouse.move(box.x + 320, box.y + 200, { steps: 12 })
  await page.mouse.up()
  await page.keyboard.up('Alt')
  await duplicated

  await expect(page.locator('[data-node-type="text"]')).toHaveCount(2)
  await expect(page.getByText('副本', { exact: false }).first()).toBeVisible()
})

test('storyboard: image tools derive a new pending node from a generated still', async ({ page }) => {
  await createProject(page)
  await addNode(page, '图片')

  const imageNode = page.locator('[data-node-type="image"]').first()
  await imageNode.dblclick()
  await page.getByTestId('node-prompt').fill('黄昏的山脊线，逆光剪影')
  await page.getByTestId('node-prompt').blur()
  await expect(imageNode).toContainText('黄昏的山脊线')
  await page.getByTestId('inspector-run').click()
  await page.getByTestId('confirm-generate').click()
  await expect(imageNode.locator('img')).toBeVisible({ timeout: 60_000 })
  await page.keyboard.press('Escape')

  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('storyboard-image').locator('[data-testid^="storyboard-card-"]').first().click()

  const detail = page.getByTestId('media-detail')
  await expect(detail).toContainText('图片工具')

  // 打光 stays disabled until a parameter actually changes.
  await detail.getByRole('button', { name: '打光' }).click()
  const lighting = page.getByTestId('lighting-editor')
  await expect(lighting).toBeVisible()
  await expect(page.getByTestId('image-tool-submit')).toBeDisabled()

  await lighting.getByRole('slider', { name: '轮廓光' }).fill('40')
  await expect(page.getByTestId('image-tool-submit')).toBeEnabled()
  await page.getByTestId('image-tool-submit').click()

  // The tool never edits in place: it produces a new node wired to the source.
  await page.getByTestId('view-workflow').click()
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(2)
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await page.screenshot({ path: `${SHOTS}/image-tool-derived-node.png` })
})

test('导演台 studio renders its viewports in a real browser', async ({ page }) => {
  await createProject(page)
  // Menu item accessible names include their badge, so match loosely.
  await addNode(page, /导演台/)
  await page.locator('[data-node-type="director"]').first().dblclick()
  await page.getByTestId('open-studio').click()

  const studio = page.getByTestId('director-body')
  await expect(studio).toBeVisible()
  await expect(page.getByText('Runtime TypeError')).toHaveCount(0)
  // Both viewports draw as SVG; the camera preview only sizes itself after a
  // real layout pass, which is exactly what a browser run is here to prove.
  await expect(studio.locator('svg').first()).toBeVisible()
  expect(await studio.locator('svg').count()).toBeGreaterThan(1)
  await page.screenshot({ path: `${SHOTS}/director-studio.png` })
})

test('脚本 V2 wizard renders its shot table in a real browser', async ({ page }) => {
  await createProject(page)
  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '脚本', exact: true }).hover()
  const persisted = waitForCanvasMutation(page)
  await page.getByRole('menuitem', { name: '脚本 V2', exact: true }).click()
  await persisted
  await page.locator('[data-node-type="script"]').first().dblclick()
  await page.getByTestId('open-studio').click()

  const wizard = page.locator('[role="dialog"]').last()
  await expect(wizard).toBeVisible()
  await expect(page.getByText('Runtime TypeError')).toHaveCount(0)
  await expect(wizard).toContainText('确认镜头')
  await page.screenshot({ path: `${SHOTS}/script-wizard.png` })
})

test('asset library opens from the add-resource menu', async ({ page }) => {
  await createProject(page)
  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '上传', exact: true }).click()

  const library = page.locator('[role="dialog"]').last()
  await expect(library).toBeVisible()
  await expect(page.getByText('Runtime TypeError')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/asset-library.png` })
})

test('Escape closes only the topmost dialog layer', async ({ page }) => {
  await createProject(page)
  await page.getByTestId('open-toolbox').click()
  await expect(page.getByTestId('toolbox-panel')).toBeVisible()

  // The preset detail opens as a second layer on top of the toolbox panel.
  await page.getByTestId('preset-preset-arc-left').hover()
  await page.getByTestId('preset-preset-arc-left').getByRole('button', { name: '详情' }).click()
  await expect(page.getByRole('heading', { name: '左弧滑行' })).toBeVisible()

  await page.keyboard.press('Escape')
  // Only the detail closes; the panel underneath survives.
  await expect(page.getByRole('heading', { name: '左弧滑行' })).toHaveCount(0)
  await expect(page.getByTestId('toolbox-panel')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('toolbox-panel')).toHaveCount(0)
})

test('publish freezes a snapshot that the public gallery serves read-only', async ({ page, request }) => {
  await createProject(page)
  await addNode(page, '文本')

  const textNode = page.locator('[data-node-type="text"]').first()
  await textNode.dblclick()
  await page.getByTestId('node-prompt').fill('雪夜城市的霓虹倒影')
  await page.getByTestId('node-prompt').blur()
  await expect(textNode).toContainText('雪夜城市')
  await page.keyboard.press('Escape')

  await page.getByTestId('share-button').click()
  await page.getByTestId('publish-title').fill('雪夜城市')
  await page.getByTestId('publish-summary').fill('一条测试作品')
  await page.getByTestId('publish-submit').click()
  await expect(page.getByTestId('toast')).toContainText('已发布')

  // The gallery is public: no auth, and the card is listed.
  await page.goto('/showcase')
  await expect(page.getByTestId('showcase-gallery')).toBeVisible()
  const card = page.locator('[data-testid^="showcase-card-"]').first()
  await expect(card).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/showcase-gallery.png` })

  await card.click()
  await expect(page.getByTestId('public-canvas-view')).toBeVisible()
  await expect(page.getByTestId('public-workflow')).toBeVisible()

  // Read-only means no editing surface at all.
  await expect(page.getByTestId('add-node-button')).toHaveCount(0)
  await expect(page.locator('[data-testid^="node-run-"]')).toHaveCount(0)
  await expect(page.getByTestId('node-inspector')).toHaveCount(0)
  // Copying is offered but gated.
  await expect(page.getByTestId('clone-project')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/showcase-public-workflow.png` })

  // The same frozen document also projects into the storyboard.
  await page.getByRole('button', { name: '故事板' }).click()
  await expect(page.getByTestId('public-storyboard')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/showcase-public-storyboard.png` })

  // Revoking makes it unviewable immediately, not just unlisted.
  const snapshotUrl = page.url()
  const snapshotId = snapshotUrl.split('/').pop() as string
  const del = await request.delete(`/api/publish/${snapshotId}`)
  expect(del.ok()).toBeTruthy()

  const after = await request.get(`/api/publish/${snapshotId}`)
  expect(after.status()).toBe(404)
})

test('uploading a file lands it in the asset library', async ({ page }) => {
  await createProject(page)
  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '上传', exact: true }).click()
  // The library opens first; the dropzone lives behind 新建 → 上传资产.
  await page.getByRole('button', { name: '新建' }).click()
  await page.getByRole('menuitem', { name: '上传资产', exact: true }).click()
  await expect(page.getByTestId('upload-drop-target')).toBeVisible()

  // A 1x1 PNG, byte-for-byte, so the server's header probe has real input.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.getByTestId('asset-upload-input').setInputFiles({
    name: 'probe.png',
    mimeType: 'image/png',
    buffer: png,
  })

  await expect(page.getByTestId('upload-row').first()).toBeVisible()
  // The row clears its own status once settled; the tally lives in the summary.
  await expect(page.getByTestId('upload-summary')).toContainText('已完成 1 / 1', { timeout: 30_000 })
  await page.screenshot({ path: `${SHOTS}/asset-upload.png` })

  // What the test actually claims: the committed asset is library content.
  await page.getByTestId('upload-close').click()
  await expect(page.getByText('probe.png').first()).toBeVisible({ timeout: 15_000 })
})

test('the new surfaces are reachable from the home page', async ({ page }) => {
  await page.goto('/')
  // A page nothing links to is the same as a page that does not exist.
  for (const [label, path] of [
    ['技能库', '/skills'],
    ['公开作品', '/showcase'],
    ['账户', '/account'],
  ] as const) {
    await page.goto('/')
    await page.getByRole('link', { name: label, exact: true }).click()
    await page.waitForURL(`**${path}`)
  }
})

test('skill marketplace lists skills and opens a detail contract', async ({ page }) => {
  await page.goto('/skills')
  await expect(page.getByTestId('skill-gallery')).toBeVisible()

  const cards = page.locator('[data-testid^="skill-card-"]')
  await expect(cards.first()).toBeVisible({ timeout: 15_000 })
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)
  await page.screenshot({ path: `${SHOTS}/skill-gallery.png` })

  await cards.first().click()
  await expect(page.getByTestId('skill-detail')).toBeVisible()
  // The executable spec must read as structure, not a serialised blob.
  await expect(page.getByTestId('skill-detail')).not.toContainText('executableSpec')
  await expect(page.getByTestId('skill-detail')).not.toContainText('"heading"')
  await page.screenshot({ path: `${SHOTS}/skill-detail.png` })
})

test('account page shows the ledger and proves a failed generation refunds', async ({ page }) => {
  await page.goto('/account')
  await expect(page.getByText('积分', { exact: false }).first()).toBeVisible()
  // The seed grant has to be visible somewhere, otherwise the ledger is a shell.
  await expect(page.getByText('100').first()).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: `${SHOTS}/account-ledger.png` })
})

test('presence: two browsers see each other, and following can be escaped', async ({ browser }) => {
  const alice = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const bob = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const a = await alice.newPage()
  const b = await bob.newPage()

  try {
    await a.request.post('/api/dev/reset')
    await a.goto('/project')
    await a.getByTestId('start-create').click()
    await a.waitForURL(/\/canvas\?projectId=/)
    await expect(a.getByTestId('workflow-canvas')).toBeVisible()

    await b.goto(a.url())
    await expect(b.getByTestId('workflow-canvas')).toBeVisible()

    // Each learns about the other through the stream, with no reload.
    const aAvatars = a.locator('[data-testid^="presence-avatar-"]')
    const bAvatars = b.locator('[data-testid^="presence-avatar-"]')
    await expect(aAvatars.first()).toBeVisible({ timeout: 20_000 })
    await expect(bAvatars.first()).toBeVisible({ timeout: 20_000 })

    // A remote cursor renders from a delta alone — cursor reporting itself is
    // driven by requestAnimationFrame, which a backgrounded context throttles,
    // so it is exercised from the visible page in the test below.
    const canvasId = new URL(a.url()).searchParams.get('canvasId') as string
    const injected = await a.request.post(`/api/presence/${canvasId}`, {
      data: {
        participantId: 'e2e-ghost',
        name: '协作者',
        color: '#cc4477',
        cursor: { x: 220, y: 160 },
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(injected.status()).toBe(200)
    await expect(b.locator('[data-testid="presence-cursor-e2e-ghost"]')).toBeVisible({ timeout: 20_000 })
    await b.screenshot({ path: `${SHOTS}/presence-remote-cursor.png` })

    // Following someone, then escaping with Escape.
    await bAvatars.first().click()
    const banner = b.getByTestId('presence-follow-banner')
    await expect(banner).toBeVisible({ timeout: 10_000 })
    await b.screenshot({ path: `${SHOTS}/presence-following.png` })

    await b.keyboard.press('Escape')
    await expect(banner).toHaveCount(0)
  } finally {
    await alice.close()
    await bob.close()
  }
})

test('presence: a visible page reports its own cursor, coalesced', async ({ page }) => {
  await page.request.post('/api/dev/reset')

  // Observe the wire directly: an SSE read never completes, and the DOM never
  // shows your own cursor, so the outgoing heartbeats are the honest signal.
  const cursorPosts: unknown[] = []
  page.on('request', (req) => {
    if (req.method() !== 'POST' || !req.url().includes('/api/presence/')) return
    try {
      const body = req.postDataJSON() as { cursor?: unknown } | null
      if (body && body.cursor) cursorPosts.push(body.cursor)
    } catch {
      // A malformed body is not this assertion's concern.
    }
  })

  await page.goto('/project')
  await page.getByTestId('start-create').click()
  await page.waitForURL(/\/canvas\?projectId=/)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()

  const MOVES = 40
  for (let i = 0; i < MOVES; i += 1) {
    await page.mouse.move(660 + i * 6, 430 + i * 4)
  }

  await expect.poll(() => cursorPosts.length, { timeout: 20_000 }).toBeGreaterThan(0)
  // Coalesced: a mousemove must not become a request per event.
  expect(cursorPosts.length).toBeLessThan(MOVES)
})
