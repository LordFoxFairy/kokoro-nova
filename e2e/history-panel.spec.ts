import { expect, test } from '@playwright/test'

import { openCanvasFixture, selectCanvasScenario } from './helpers/canvas-fixtures'

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

  await page.getByRole('button', { name: '图片', exact: true }).click()
  await expect(page.getByTestId('history-artifact-art_image_seed')).toBeVisible()
  await expect(page.getByTestId('history-artifact-art_video_01')).toHaveCount(0)
})
