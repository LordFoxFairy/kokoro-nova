import { expect, test } from '@playwright/test'

import { openCanvasFixture, selectCanvasScenario } from './helpers/canvas-fixtures'
import { waitForStableVisuals } from './helpers/visual-stability'

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })

test('generation history starts with the current canvas and filters deterministic media artifacts', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-populated')
  await openCanvasFixture(page, request)

  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '从生成历史选择', exact: true }).click()

  const panel = page.getByTestId('history-panel')
  await expect(panel).toBeVisible()
  await expect(page.getByTestId('history-scope-canvas')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('history-artifact-art_image_seed')).toBeVisible()
  await expect(page.getByTestId('history-artifact-art_video_01')).toBeVisible()
  await waitForStableVisuals(page)
  await expect(page).toHaveScreenshot('history-panel-current-canvas-1440x900.png', {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.0001,
  })

  await page.getByRole('button', { name: '图片', exact: true }).click()
  await expect(page.getByTestId('history-artifact-art_image_seed')).toBeVisible()
  await expect(page.getByTestId('history-artifact-art_video_01')).toHaveCount(0)
})

test('generation history adds selected media as one ordered batch without changing the source document', async ({ page, request }) => {
  await selectCanvasScenario(request, 'authenticated-populated')
  await openCanvasFixture(page, request)

  await page.getByTestId('add-node-button').click()
  await page.getByRole('menuitem', { name: '从生成历史选择', exact: true }).click()

  await page.getByTestId('history-batch-mode').click()
  await page.getByTestId('history-artifact-art_image_seed').click()
  await page.getByTestId('history-artifact-art_video_01').click()
  await expect(page.getByRole('button', { name: '添加所选 (2)', exact: true })).toBeEnabled()

  await page.getByRole('button', { name: '添加所选 (2)', exact: true }).click()
  await expect(page.getByTestId('history-panel')).toHaveCount(0)
  await expect(page.locator('[data-node-type]')).toHaveCount(6)
})
