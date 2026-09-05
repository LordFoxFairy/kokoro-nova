import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

async function prepareCompositor(page: Page, request: APIRequestContext) {
  const scenario = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-populated' } })
  expect(scenario.ok()).toBe(true)

  await page.goto('/canvas?projectId=prj_video_demo&canvasId=can_video_main')
  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('open-clip-editor').click()
  await expect(page.getByTestId('clip-editor')).toBeVisible()
}

test('compositor preserves selected split and trim history through keyboard undo/redo and reload', async ({ page, request }) => {
  await prepareCompositor(page, request)

  await page
    .getByTestId('clip-source-video-art_video_01')
    .getByRole('button', { name: '添加到时间线' })
    .click()

  const clips = page.locator('[data-testid^="timeline-clip-"]')
  await expect(clips).toHaveCount(1)
  await clips.first().click()
  await expect(page.getByRole('spinbutton', { name: '片段入点' })).toBeVisible()

  const playhead = page.getByTestId('clip-playhead-slider')
  await playhead.focus()
  await page.keyboard.press('End')
  await page.keyboard.press('PageDown')
  await expect(playhead).toHaveValue('14')

  await page.getByTestId('clip-split').click()
  await expect(clips).toHaveCount(2)
  await expect(page.getByTestId('clip-timeline-feedback')).toContainText('已在 00:14 分割')
  await expect(page.getByTestId('clip-undo')).toBeEnabled()

  await page.getByTestId('clip-undo').click()
  await expect(clips).toHaveCount(1)
  await expect(page.getByTestId('clip-timeline-feedback')).toContainText('已撤销：分割视频片段')
  await expect(page.getByTestId('clip-redo')).toBeEnabled()

  await page.keyboard.press('Control+Shift+Z')
  await expect(clips).toHaveCount(2)
  await expect(page.getByTestId('clip-timeline-feedback')).toContainText('已重做：分割视频片段')

  const firstClip = clips.first()
  const firstClipId = (await firstClip.getAttribute('data-testid'))!.replace('timeline-clip-', '')
  const inHandle = page.getByTestId(`trim-handle-in-${firstClipId}`)
  await inHandle.focus()
  await page.keyboard.press('ArrowRight')
  await expect(inHandle).toHaveAttribute('aria-valuenow', '0.1')

  await page.keyboard.press('Control+Z')
  await expect(inHandle).toHaveAttribute('aria-valuenow', '0')
  await page.keyboard.press('Control+Shift+Z')
  await expect(inHandle).toHaveAttribute('aria-valuenow', '0.1')

  await expect.poll(async () => {
    const saved = await request.get('/api/canvases/can_video_main').then((response) => response.json())
    const composite = saved.canvas.document.nodes.find((node: { type: string }) => node.type === 'videoComposite')
    return composite.data.extra.composite.clips.map((clip: { inPoint: number; outPoint: number }) => ({
      inPoint: clip.inPoint,
      outPoint: clip.outPoint,
    }))
  }).toEqual([
    { inPoint: 0.1, outPoint: 14 },
    { inPoint: 14, outPoint: 15 },
  ])

  await page.reload()
  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('open-clip-editor').click()
  await expect(clips).toHaveCount(2)
  await clips.first().click()
  await expect(page.getByRole('spinbutton', { name: '片段入点' })).toHaveValue('0.1')
})


test('export cancellation preserves the persisted timeline and clears only its resumable task', async ({ page, request }) => {
  await prepareCompositor(page, request)
  await page
    .getByTestId('clip-source-video-art_video_01')
    .getByRole('button', { name: '添加到时间线' })
    .click()
  await expect(page.locator('[data-testid^="timeline-clip-"]')).toHaveCount(1)

  await expect.poll(async () => {
    const saved = await request.get('/api/canvases/can_video_main').then((response) => response.json())
    const node = saved.canvas.document.nodes.find((item: { type: string }) => item.type === 'videoComposite')
    return node.data.extra.composite.clips.length
  }).toBe(1)
  const current = await request.get('/api/canvases/can_video_main').then((response) => response.json())
  const composite = current.canvas.document.nodes.find((node: { type: string }) => node.type === 'videoComposite')

  const baseTask = {
    id: 'compose_task_cancel_e2e',
    status: 'rendering',
    artifact: null,
    assetId: null,
    subtitleMode: null,
    notes: [],
    failure: null,
    createdAt: '2026-09-04T00:00:00.000Z',
    updatedAt: '2026-09-04T00:00:00.000Z',
  }
  let cancelled = false
  await page.route('**/api/compose', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task: baseTask }) })
  })
  await page.route('**/api/compose/compose_task_cancel_e2e', async (route) => {
    if (route.request().method() === 'POST') {
      cancelled = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ task: { ...baseTask, status: 'cancelled', updatedAt: '2026-09-04T00:00:01.000Z' } }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ task: cancelled ? { ...baseTask, status: 'cancelled' } : baseTask }),
    })
  })

  await page.getByTestId('clip-export-trigger').click()
  await page.getByTestId('export-to-canvas').click()
  await expect(page.getByTestId('compose-progress')).toBeVisible()
  await page.getByTestId('compose-cancel').click()
  await expect(page.getByTestId('compose-success')).toContainText('已取消合成')
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('libtv.compose.active-task:prj_video_demo:can_video_main'))).toBeNull()

  const after = await request.get('/api/canvases/can_video_main').then((response) => response.json())
  const persisted = after.canvas.document.nodes.find((node: { type: string }) => node.type === 'videoComposite')
  expect(persisted.data.extra.composite.clips).toEqual(composite.data.extra.composite.clips)
  expect(after.canvas.document.nodes.filter((node: { type: string }) => node.type === 'video')).toHaveLength(1)
})
