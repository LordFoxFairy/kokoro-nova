import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const PROJECT_URL = '/canvas?projectId=prj_video_demo&canvasId=can_video_main'
const VIDEO_SOURCE_ID = 'art_video_01'

const VISUAL_COMPOSE_ARTIFACT = {
  id: 'art_visual_compose_success',
  jobId: 'compose_task_visual_success',
  kind: 'video' as const,
  url: '/api/media/composites/visual/composite.mp4',
  thumbnailUrl: '/fixtures/libtv/media/city-night-poster.webp',
  width: 1280,
  height: 720,
  durationSeconds: 15,
  createdAt: '2026-09-05T00:00:00.000Z',
  modelId: 'local-compose',
  assetId: 'asset_visual_compose_success',
}

async function openDeterministicClipEditor(page: Page, request: APIRequestContext) {
  const scenario = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-populated' } })
  expect(scenario.ok()).toBe(true)

  await page.goto(PROJECT_URL)
  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('open-clip-editor').click()
  await expect(page.getByTestId('clip-editor')).toBeVisible()
}

async function addDeterministicVideo(page: Page) {
  await page
    .getByTestId(`clip-source-video-${VIDEO_SOURCE_ID}`)
    .getByRole('button', { name: '添加到时间线' })
    .click()
  await expect(page.locator('[data-testid^="timeline-clip-"]')).toHaveCount(1)
}

async function expectVisualBaseline(page: Page, name: string) {
  // Suppress the Next development indicator; it is not product chrome and
  // otherwise makes the visual baseline depend on the runner environment.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
  // A decoded MP4 frame is otherwise captured at a browser-dependent instant,
  // even when the editor is paused. Seek every visible local preview to its
  // deterministic first frame before taking the approved desktop baseline.
  await page.locator('video').evaluateAll(async (videos) => {
    await Promise.all(videos.map(async (video) => {
      video.pause()
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise<void>((resolve) => video.addEventListener('loadedmetadata', () => resolve(), { once: true }))
      }
      if (video.currentTime !== 0) {
        await new Promise<void>((resolve) => video.addEventListener('seeked', () => resolve(), { once: true }))
        video.currentTime = 0
      }
    }))
  })
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.0001,
  })
}

test('loaded deterministic media renders a complete exportable clip-editor timeline at desktop baseline', async ({ page, request }) => {
  await openDeterministicClipEditor(page, request)
  await addDeterministicVideo(page)

  const source = page.getByTestId(`clip-source-video-${VIDEO_SOURCE_ID}`)
  const sourceMedia = source.locator('video, img').first()
  await expect(source).toContainText('视频生成')
  await expect(sourceMedia).toBeVisible()

  const preview = page.getByTestId('clip-preview-frame')
  await expect(preview).toBeVisible()
  await expect(preview.locator('video[aria-label="源素材预览"]')).toHaveAttribute('src', '/api/media/fixtures/city-night.mp4')
  await expect(page.getByTestId('clip-current-time')).toHaveText('00:00')
  await expect(page.getByTestId('clip-total-time')).toHaveText('00:15')
  await expect(page.getByTestId('clip-split')).toBeEnabled()
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled()

  await page.getByTestId('clip-export-trigger').click()
  await expect(page.getByTestId('clip-export-menu')).toBeVisible()
  await expect(page.getByTestId('export-to-local')).toBeEnabled()
  await expect(page.getByTestId('export-to-canvas')).toBeEnabled()
  await expectVisualBaseline(page, 'video-clip-editor-loaded-1440x900.png')
})

test('selected clip exposes stable trim and speed edit controls at desktop baseline', async ({ page, request }) => {
  await openDeterministicClipEditor(page, request)
  await addDeterministicVideo(page)

  const clip = page.locator('[data-testid^="timeline-clip-"]').first()
  await clip.click()
  await expect(clip).toContainText('1×')
  await expect(page.getByRole('spinbutton', { name: '片段入点' })).toHaveValue('0')
  await expect(page.getByRole('spinbutton', { name: '片段出点' })).toHaveValue('15')
  await expect(page.getByTestId('clip-speed-0.5')).toBeVisible()
  await expect(page.getByTestId('clip-speed-1')).toBeVisible()
  await expect(page.getByTestId('clip-speed-2')).toBeVisible()

  await page.getByTestId('clip-speed-2').click()
  await expect(clip).toContainText('2×')
  await expect(page.getByTestId('clip-move-left')).toBeDisabled()
  await expect(page.getByTestId('clip-move-right')).toBeDisabled()
  await expect(page.getByTestId('trim-handle-in-' + (await clip.getAttribute('data-testid'))!.replace('timeline-clip-', ''))).toHaveAttribute('aria-valuenow', '0')
  await expectVisualBaseline(page, 'video-clip-editor-selected-clip-1440x900.png')
})

test('succeeded video fixture reopens a seeded mixed-media composite timeline', async ({ page, request }) => {
  const scenario = await request.post('/api/dev/scenario', { data: { scenarioId: 'video-succeeded' } })
  expect(scenario.ok()).toBe(true)

  await page.goto(PROJECT_URL)
  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('open-clip-editor').click()
  await expect(page.locator('[data-testid^="timeline-clip-"]')).toHaveCount(2)
  await expect(page.locator('[data-testid^="timeline-audio-"]')).toHaveCount(1)
  await expect(page.locator('[data-testid^="audio-preview-"]')).toHaveCount(1)
  await expect(page.locator('[data-testid^="audio-preview-"]')).toHaveAttribute('src', '/api/media/fixtures/compositor-bed.wav')
  await page.getByTestId('clip-tool-subtitle').click()
  await expect(page.getByTestId('subtitle-track')).toContainText('雨夜城市')
  await expectVisualBaseline(page, 'video-clip-editor-seeded-mixed-media-1440x900.png')

  await page.reload()
  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('open-clip-editor').click()
  await expect(page.locator('[data-testid^="timeline-clip-"]')).toHaveCount(2)
  await expect(page.locator('[data-testid^="timeline-audio-"]')).toHaveCount(1)
})

test('local export success keeps the editor open with terminal feedback at desktop baseline', async ({ page, request }) => {
  await openDeterministicClipEditor(page, request)
  await addDeterministicVideo(page)

  const task = {
    id: 'compose_task_visual_success',
    status: 'succeeded',
    artifact: VISUAL_COMPOSE_ARTIFACT,
    assetId: 'asset_visual_compose_success',
    subtitleMode: 'none',
    notes: ['deterministic visual export fixture'],
    failure: null,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:01.000Z',
  }
  await page.route('**/api/compose', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task }) })
  })

  await page.getByTestId('clip-export-trigger').click()
  const download = page.waitForEvent('download')
  await page.getByTestId('export-to-local').click()
  await download
  await expect(page.getByTestId('compose-success')).toContainText('合成完成')
  await expect(page.getByTestId('toast')).toContainText('已导出到本地')
  await expectVisualBaseline(page, 'video-clip-editor-export-success-1440x900.png')
})

test('failed export keeps an actionable error state at desktop baseline', async ({ page, request }) => {
  await openDeterministicClipEditor(page, request)
  await addDeterministicVideo(page)

  const queuedTask = {
    id: 'compose_task_visual_failed',
    status: 'queued',
    artifact: null,
    assetId: null,
    subtitleMode: null,
    notes: [],
    failure: null,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
  }
  await page.route('**/api/compose', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task: queuedTask }) })
  })
  await page.route('**/api/compose/compose_task_visual_failed**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ task: { ...queuedTask, status: 'failed', failure: '本地视觉 fixture 渲染失败' } }),
    })
  })

  await page.getByTestId('clip-export-trigger').click()
  await page.getByTestId('export-to-local').click()
  await expect(page.getByTestId('compose-error')).toContainText('本地视觉 fixture 渲染失败')
  await expectVisualBaseline(page, 'video-clip-editor-export-failed-1440x900.png')
})
