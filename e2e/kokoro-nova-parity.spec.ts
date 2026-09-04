import { expect, test, type Page, type TestInfo } from '@playwright/test'

/**
 * Product-level smoke coverage for the local Kokoro Nova mock.
 *
 * This lane intentionally uses the normal local UI/API routes instead of the
 * dev scenario/reset endpoints. A run creates one local project and keeps all
 * writes serialized behind the UI's canvas mutation response.
 */

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

async function addNode(page: Page, type: 'video' | 'script') {
  await page.getByTestId('add-node-button').click()
  const rootMenu = page.getByRole('menu').first()

  if (type === 'video') {
    const persisted = waitForCanvasMutation(page)
    await rootMenu.getByRole('menuitem', { name: '视频', exact: true }).click()
    await persisted
  } else {
    await rootMenu.getByRole('menuitem', { name: '脚本', exact: true }).hover()
    const submenu = page.getByRole('menu').last()
    await expect(submenu).toBeVisible()
    const persisted = waitForCanvasMutation(page)
    await submenu.getByRole('menuitem', { name: '脚本 V2', exact: true }).click()
    await persisted
  }

  const node = page.locator(`[data-node-type="${type}"]`).last()
  await expect(node).toBeVisible()
  return node
}

async function capture1440x900(page: Page, testInfo: TestInfo, filename: string) {
  // Keep the artifact useful for visual inspection without turning this lane
  // into a pixel snapshot contract. The viewport dimensions are the contract.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
  await page.evaluate(() => document.fonts.ready)
  const png = await page.screenshot({
    path: testInfo.outputPath(filename),
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
  })
  expect(png.readUInt32BE(16)).toBe(1440)
  expect(png.readUInt32BE(20)).toBe(900)
}

test.describe('Kokoro Nova product parity', () => {
  test('project → canvas → video/script/storyboard supports refresh and return', async ({ page }, testInfo) => {
    expect(page.viewportSize()).toEqual({ width: 1440, height: 900 })

    await test.step('open the local project entry point', async () => {
      await page.goto('/project')
      await expect(page.getByTestId('project-toolbar')).toBeVisible()
      await expect(page.getByTestId('start-create')).toBeVisible()
    })

    const projectCreated = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return response.request().method() === 'POST' && url.pathname === '/api/projects' && response.ok()
    })
    await page.getByTestId('start-create').click()
    await projectCreated
    await page.waitForURL(/\/canvas\?projectId=[^&]+&canvasId=[^&]+$/)
    const canvasUrl = page.url()

    await test.step('verify the empty workflow and storyboard states', async () => {
      await expect(page.getByTestId('workflow-canvas')).toBeVisible()
      await expect(page.getByTestId('empty-canvas-starters')).toBeVisible()

      await page.getByTestId('view-storyboard').click()
      await expect(page.getByTestId('storyboard-view')).toBeVisible()
      await expect(page.getByTestId('storyboard-empty')).toBeVisible()

      await page.getByTestId('view-workflow').click()
      await expect(page.getByTestId('empty-canvas-starters')).toBeVisible()
    })

    await test.step('open the video entry and its editor controls', async () => {
      const videoNode = await addNode(page, 'video')
      await videoNode.dblclick()
      const editor = page.getByTestId('video-node-editor')
      await expect(editor).toBeVisible()
      await expect(editor.getByTestId('video-prompt')).toBeVisible()
      await expect(editor.getByTestId('video-model-selector')).toBeVisible()
      await expect(editor.getByTestId('video-output-selector')).toBeVisible()
      await expect(editor.getByTestId('video-run').first()).toBeVisible()
      await page.getByRole('button', { name: '关闭视频编辑器', exact: true }).click()
      await expect(editor).toHaveCount(0)
    })

    await test.step('open the script entry, write one shot, and inspect the workspace', async () => {
      const scriptNode = await addNode(page, 'script')
      const entries = scriptNode.getByTestId('script-v2-entry-list')
      await expect(entries).toBeVisible()
      await expect(entries.getByRole('button')).toHaveCount(3)

      const persisted = waitForCanvasMutation(page)
      await entries.getByRole('button', { name: /自己编写/ }).click()
      await persisted

      const workspace = page.getByTestId('script-v2-workspace')
      await expect(workspace).toBeVisible()
      await expect(workspace.locator('[data-testid^="script-v2-shot-row-"]')).toHaveCount(1)
      await expect(workspace.getByTestId('script-v2-stages').getByRole('button')).toHaveCount(3)
      await expect(workspace.getByRole('button', { name: '关闭 (ESC)', exact: true })).toBeVisible()
      await capture1440x900(page, testInfo, 'script-workspace-1440x900.png')

      await workspace.getByRole('button', { name: '关闭 (ESC)', exact: true }).click()
      await expect(workspace).toHaveCount(0)
    })

    await test.step('reload the saved document and project it into storyboard', async () => {
      await page.reload()
      await expect(page.getByTestId('workflow-canvas')).toBeVisible()
      await expect(page.locator('[data-node-type="video"]')).toHaveCount(1)
      await expect(page.locator('[data-node-type="script"]')).toHaveCount(1)
      await expect(page.getByTestId('script-v2-resource-card')).toBeVisible()

      await page.getByTestId('view-storyboard').click()
      await expect(page.getByTestId('storyboard-view')).toBeVisible()
      await expect(page.getByTestId('storyboard-text')).toBeVisible()
      await expect(page.getByTestId('storyboard-video')).toBeVisible()
      await expect(page.getByTestId('storyboard-text').locator('[data-testid^="storyboard-card-"]')).toHaveCount(1)
      const videoCard = page.getByTestId('storyboard-video').locator('[data-testid^="storyboard-card-"]')
      await expect(videoCard).toHaveCount(1)
      await capture1440x900(page, testInfo, 'storyboard-1440x900.png')

      await videoCard.click()
      const detail = page.getByTestId('media-detail')
      await expect(detail).toBeVisible()
      await expect(detail.getByTestId('detail-model')).toBeVisible()
      await expect(detail.getByTestId('detail-video-output')).toBeVisible()
      await detail.getByRole('button', { name: '关闭', exact: true }).click()
      await expect(detail).toHaveCount(0)
    })

    await test.step('return to projects and use browser history back', async () => {
      await page.getByTestId('view-workflow').click()
      await expect(page.getByTestId('view-workflow')).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('link', { name: '返回全部项目', exact: true }).click()
      await expect(page).toHaveURL(/\/project$/)
      await expect(page.getByTestId('project-toolbar')).toBeVisible()

      // Next dev navigation can keep the old document around after the URL
      // commits; assert the committed URL and the loaded editor separately.
      await page.goBack({ waitUntil: 'commit', timeout: 15_000 })
      await expect(page).toHaveURL(new RegExp(canvasUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      await expect(page.getByTestId('workflow-canvas')).toBeVisible()
    })
  })

  test('missing project gives visible local error feedback', async ({ page }) => {
    expect(page.viewportSize()).toEqual({ width: 1440, height: 900 })
    await page.goto('/canvas?projectId=missing-kokoro-nova-project&canvasId=missing-kokoro-nova-canvas')

    // A bootstrap failure is intentionally rendered as a full-page recovery
    // state; it is not a partially mounted canvas with a toast behind it.
    await expect(page.getByTestId('canvas-load-error')).toBeVisible()
    await expect(page.getByTestId('canvas-load-error')).toContainText('画布加载失败')
    await expect(page.getByTestId('canvas-load-error').getByRole('button', { name: '重试' })).toBeVisible()
  })
})
