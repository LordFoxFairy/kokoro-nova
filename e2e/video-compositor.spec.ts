import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { ComposeResponseSchema } from '@/contracts/compose'

type RectExpectation = Partial<Record<'x' | 'y' | 'width' | 'height' | 'right' | 'bottom', number>>

async function selectScenario(request: APIRequestContext) {
  const response = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-populated' } })
  expect(response.ok()).toBe(true)
}

async function openCompositor(page: Page, request: APIRequestContext) {
  await selectScenario(request)
  await page.goto('/canvas?projectId=prj_video_demo&canvasId=can_video_main')
  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('open-clip-editor').click()
  await expect(page.getByTestId('clip-editor')).toBeVisible()
}

async function addFixtureAudioSource(request: APIRequestContext) {
  const current = await request.get('/api/canvases/can_video_main').then((response) => response.json())
  const composite = current.canvas.document.nodes.find((node: { type: string }) => node.type === 'videoComposite')
  const response = await request.post('/api/canvases/can_video_main', {
    data: {
      canvasId: 'can_video_main',
      expectedRevision: current.canvas.revision,
      label: 'E2E 添加独立音轨素材',
      mutations: [
        {
          op: 'updateNode',
          nodeId: composite.id,
          patch: {
            data: {
              ...composite.data,
              artifacts: [
                {
                  id: 'art_audio_fixture',
                  jobId: 'fixture',
                  kind: 'audio',
                  url: '/api/media/fixtures/compositor-bed.wav',
                  thumbnailUrl: null,
                  width: null,
                  height: null,
                  durationSeconds: 3,
                  createdAt: '2026-09-03T12:00:00.000Z',
                  modelId: 'audio-fixture',
                  assetId: null,
                },
              ],
            },
          },
        },
      ],
    },
  })
  expect(response.ok()).toBe(true)
}

async function expectRect(locator: Locator, expected: RectExpectation, tolerance = 3) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return
  const actual = {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    right: box.x + box.width,
    bottom: box.y + box.height,
  }
  for (const [key, value] of Object.entries(expected) as Array<[keyof typeof actual, number]>) {
    expect(actual[key]).toBeGreaterThanOrEqual(value - tolerance)
    expect(actual[key]).toBeLessThanOrEqual(value + tolerance)
  }
}

async function visualBaseline(page: Page, name: string) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.0001,
  })
}

test('video compositor is embedded beside the source rail with the official empty timeline and export gate', async ({
  page,
  request,
}) => {
  await openCompositor(page, request)

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expectRect(page.getByTestId('clip-editor-source-rail'), { x: 16, y: 72, width: 470, bottom: 884 })
  await expectRect(page.getByTestId('clip-editor-workspace'), { x: 498, y: 72, right: 1424, bottom: 884 })
  await expect(page.getByTestId('clip-editor-workspace')).toContainText('视频合成')

  const timeline = page.getByTestId('clip-timeline-panel')
  await expectRect(timeline, { x: 506, height: 255, right: 1416, bottom: 876 }, 5)
  await expect(timeline).toContainText('00:00')
  await expect(page.getByTestId('clip-current-time')).toHaveText('00:00')
  await expect(page.getByTestId('clip-total-time')).toHaveText('00:00')
  await expect(page.getByTestId('clip-split')).toBeDisabled()
  await expect(page.getByTestId('clip-track-empty')).toBeVisible()

  await page.getByTestId('clip-export-trigger').click()
  const menu = page.getByTestId('clip-export-menu')
  await expect(menu).toBeVisible()
  await expect(menu).toContainText('导出位置')
  await expect(page.getByTestId('export-to-local')).toBeDisabled()
  await expect(page.getByTestId('export-to-canvas')).toBeDisabled()
  await visualBaseline(page, 'video-compositor-empty-1440x900.png')

  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(page.getByTestId('clip-editor')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('clip-editor')).toHaveCount(0)
  await expect(page.getByTestId('open-clip-editor')).toBeFocused()
})

test('transition and subtitle tools reproduce their paired panels and timeline tracks', async ({ page, request }) => {
  await openCompositor(page, request)

  await page.getByTestId('clip-tool-transition').click()
  await expect(page.getByTestId('transition-library')).toBeVisible()
  await expect(page.getByTestId('transition-properties')).toBeVisible()
  for (const label of ['淡入淡出', '黑场过渡', '白场过渡']) {
    await expect(page.getByTestId('transition-library').getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  await expect(page.getByTestId('transition-properties')).toContainText('未选择转场')
  await expect(page.getByTestId('delete-transition')).toBeDisabled()
  await visualBaseline(page, 'video-compositor-transition-1440x900.png')

  await page.getByTestId('clip-tool-subtitle').click()
  const subtitles = page.getByTestId('subtitle-panel')
  await expect(subtitles).toBeVisible()
  await expect(subtitles.getByRole('tab', { name: '字幕' })).toHaveAttribute('aria-selected', 'true')
  await expect(subtitles.getByRole('tab', { name: '文本' })).toHaveAttribute('aria-selected', 'false')
  await expect(subtitles.getByPlaceholder('搜索字幕文本')).toBeVisible()
  await expect(page.getByTestId('add-subtitle')).toBeDisabled()
  await expect(subtitles).toContainText('暂无字幕')
  await expect(page.getByTestId('subtitle-track')).toBeVisible()
  await visualBaseline(page, 'video-compositor-subtitle-1440x900.png')
})

test('clip edits persist on the videoComposite node across close and reload', async ({ page, request }) => {
  await openCompositor(page, request)

  const source = page.getByTestId('clip-source-video-art_video_01')
  await expect(source).toBeVisible()
  await source.getByRole('button', { name: '添加到时间线' }).click()
  await expect(page.locator('[data-testid^="timeline-clip-"]')).toHaveCount(1)
  await expect(page.getByTestId('clip-total-time')).toHaveText('00:15')
  await page.getByTestId('clip-export-trigger').click()
  await expect(page.getByTestId('export-to-canvas')).toBeEnabled()
  await page.keyboard.press('Escape')

  const firstClip = page.locator('[data-testid^="timeline-clip-"]').first()
  await firstClip.click()
  await page.getByTestId('clip-track-viewport').click({ position: { x: 240, y: 12 } })
  await page.getByTestId('clip-split').click()
  await expect(page.locator('[data-testid^="timeline-clip-"]')).toHaveCount(2)

  await page.getByTestId('clip-speed-2').click()
  const clips = page.locator('[data-testid^="timeline-clip-"]')
  await expect(clips.first()).toContainText('2×')
  const spedClipId = (await clips.first().getAttribute('data-testid'))!.replace('timeline-clip-', '')
  const otherClipId = (await clips.nth(1).getAttribute('data-testid'))!.replace('timeline-clip-', '')
  await clips.first().dragTo(clips.nth(1))
  await expect.poll(async () => {
    const saved = await request.get('/api/canvases/can_video_main').then((response) => response.json())
    const node = saved.canvas.document.nodes.find((item: { type: string }) => item.type === 'videoComposite')
    return node.data.extra.composite.clips.map((clip: { id: string }) => clip.id)
  }).toEqual([otherClipId, spedClipId])
  await expect(page.locator('[data-testid^="timeline-clip-"]').nth(1)).toContainText('2×')
  await page.locator('[data-testid^="timeline-clip-"]').first().click()
  await page.getByTestId('clip-tool-transition').click()
  await page.getByRole('button', { name: '淡入淡出', exact: true }).click()
  await expect(page.getByTestId('transition-properties')).toContainText('淡入淡出')

  await page.getByTestId('clip-tool-subtitle').click()
  await page.getByTestId('add-subtitle').click()
  const subtitleInput = page.getByTestId('subtitle-text-subtitle-1')
  await subtitleInput.fill('雨夜，故事开始。')
  await subtitleInput.blur()
  await expect(page.getByTestId('subtitle-track')).toContainText('雨夜，故事开始。')
  await visualBaseline(page, 'video-compositor-timeline-1440x900.png')

  const saved = await request.get('/api/canvases/can_video_main').then((response) => response.json())
  const composite = saved.canvas.document.nodes.find((node: { type: string }) => node.type === 'videoComposite')
  expect(composite.data.extra.composite).toMatchObject({
    version: 1,
    clips: [
      expect.objectContaining({ transitionAfter: expect.objectContaining({ type: 'fade' }) }),
      expect.objectContaining({ speed: 2 }),
    ],
    subtitles: [expect.objectContaining({ text: '雨夜，故事开始。' })],
  })

  await page.getByTestId('close-clip-editor').click()
  await page.getByTestId('open-clip-editor').click()
  await expect(page.locator('[data-testid^="timeline-clip-"]')).toHaveCount(2)
  await page.getByTestId('clip-tool-subtitle').click()
  await expect(page.getByTestId('subtitle-track')).toContainText('雨夜，故事开始。')

  await page.reload()
  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('open-clip-editor').click()
  await expect(page.locator('[data-testid^="timeline-clip-"]')).toHaveCount(2)
})

test('selected clips expose draggable, keyboard-accessible trim handles', async ({ page, request }) => {
  await openCompositor(page, request)
  await page
    .getByTestId('clip-source-video-art_video_01')
    .getByRole('button', { name: '添加到时间线' })
    .click()

  const clip = page.locator('[data-testid^="timeline-clip-"]').first()
  await clip.click()
  const clipId = (await clip.getAttribute('data-testid'))!.replace('timeline-clip-', '')
  const inHandle = page.getByTestId(`trim-handle-in-${clipId}`)
  const outHandle = page.getByTestId(`trim-handle-out-${clipId}`)
  await expect(inHandle).toHaveAttribute('role', 'slider')
  await expect(outHandle).toHaveAttribute('aria-valuenow', '15')

  const inBox = await inHandle.boundingBox()
  expect(inBox).not.toBeNull()
  if (!inBox) return
  await page.mouse.move(inBox.x + inBox.width / 2, inBox.y + inBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(inBox.x + inBox.width / 2 + 80, inBox.y + inBox.height / 2)
  await page.mouse.up()

  await expect(inHandle).toHaveAttribute('aria-valuenow', '2')
  await expect(page.getByRole('spinbutton', { name: '片段入点' })).toHaveValue('2')

  await inHandle.focus()
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => inHandle.getAttribute('aria-valuenow')).toBe('1.9')

  await visualBaseline(page, 'video-compositor-trim-1440x900.png')
})

test('compositor stacks the source rail above the workspace on compact viewports', async ({ page, request }) => {
  await page.setViewportSize({ width: 800, height: 900 })
  await openCompositor(page, request)

  const editor = page.getByTestId('clip-editor')
  await expect(editor).toHaveCSS('grid-template-columns', '768px')
  const sourceRail = page.getByTestId('clip-editor-source-rail')
  const workspace = page.getByTestId('clip-editor-workspace')
  const sourceBox = await sourceRail.boundingBox()
  const workspaceBox = await workspace.boundingBox()
  expect(sourceBox).not.toBeNull()
  expect(workspaceBox).not.toBeNull()
  if (!sourceBox || !workspaceBox) return
  expect(workspaceBox.y).toBeGreaterThan(sourceBox.y + sourceBox.height - 1)
  expect(workspaceBox.x).toBeCloseTo(sourceBox.x, 0)
})

test('independent audio supports trim, placement, gain, mute-ready persistence and reload', async ({ page, request }) => {
  await selectScenario(request)
  await addFixtureAudioSource(request)
  await page.goto('/canvas?projectId=prj_video_demo&canvasId=can_video_main')
  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('open-clip-editor').click()

  await page
    .getByTestId('clip-source-video-art_video_01')
    .getByRole('button', { name: '添加到时间线' })
    .click()
  const source = page.getByTestId('clip-source-audio-art_audio_fixture')
  await expect(source).toBeVisible()
  await source.getByRole('button', { name: '添加到音轨' }).click()

  const track = page.getByTestId('timeline-audio-audio-art_audio_fixture-1')
  await expect(track).toBeVisible()
  await track.click()
  await page.getByRole('spinbutton', { name: '音轨出点' }).fill('2.5')
  await page.getByRole('spinbutton', { name: '音轨出点' }).blur()
  await page.getByRole('spinbutton', { name: '音轨时间线起点' }).fill('2')
  await page.getByRole('spinbutton', { name: '音轨时间线起点' }).blur()
  await page.getByRole('slider', { name: '音轨音量' }).evaluate((element) => {
    const input = element as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, '0.5')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })

  await expect.poll(async () => {
    const saved = await request.get('/api/canvases/can_video_main').then((response) => response.json())
    const node = saved.canvas.document.nodes.find((item: { type: string }) => item.type === 'videoComposite')
    return node.data.extra.composite.audioTracks[0]
  }).toMatchObject({ inPoint: 0, outPoint: 2.5, start: 2, volume: 0.5, muted: false })

  await page.getByTestId('close-clip-editor').click()
  await page.getByTestId('open-clip-editor').click()
  await page.getByTestId('timeline-audio-audio-art_audio_fixture-1').click()
  await expect(page.getByRole('spinbutton', { name: '音轨出点' })).toHaveValue('2.5')
  await expect(page.getByRole('spinbutton', { name: '音轨时间线起点' })).toHaveValue('2')
  await expect(page.getByRole('slider', { name: '音轨音量' })).toHaveValue('0.5')
})

test('export sends the normalized persisted timeline contract and adds the result to canvas', async ({ page, request }) => {
  await openCompositor(page, request)
  await page
    .getByTestId('clip-source-video-art_video_01')
    .getByRole('button', { name: '添加到时间线' })
    .click()

  let body: unknown = null
  await page.route('**/api/compose', async (route) => {
    body = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        artifact: {
          id: 'art_composite_e2e',
          jobId: 'compose',
          kind: 'video',
          url: '/api/media/composites/e2e/composite.mp4',
          thumbnailUrl: '/fixtures/libtv/media/city-night-poster.webp',
          width: 1280,
          height: 720,
          durationSeconds: 15,
          createdAt: '2026-09-03T12:00:00.000Z',
          modelId: 'local-compose',
          assetId: 'asset_composite_e2e',
        },
        assetId: 'asset_composite_e2e',
        subtitleMode: 'none',
        notes: [],
      }),
    })
  })

  await page.getByTestId('clip-export-trigger').click()
  await page.getByTestId('export-to-canvas').click()
  await expect(page.getByTestId('clip-editor')).toHaveCount(0)
  expect(body).toEqual({
    clips: [
      {
        url: '/api/media/fixtures/city-night.mp4',
        inPoint: 0,
        outPoint: 15,
        speed: 1,
        muted: false,
        transitionAfter: null,
        transitionDurationSeconds: null,
      },
    ],
    audioTracks: [],
    subtitles: [],
  })

  await page.getByTestId('view-workflow').click()
  await expect(page.locator('[data-node-type="video"]')).toHaveCount(2)
})

test('compose route renders the seeded local fixture into a readable MP4 artifact', async ({ request }) => {
  await selectScenario(request)

  const response = await request.post('/api/compose', {
    data: {
      clips: [
        {
          url: '/api/media/fixtures/city-night.mp4',
          inPoint: 0,
          outPoint: 1.2,
          speed: 2,
          muted: false,
          transitionAfter: null,
          transitionDurationSeconds: null,
        },
      ],
      audioTracks: [
        {
          url: '/api/media/fixtures/compositor-bed.wav',
          inPoint: 0,
          outPoint: 1.5,
          start: 0,
          volume: 0.35,
          muted: false,
        },
      ],
      subtitles: [{ text: '本地合成验证', start: 0.1, end: 0.5 }],
    },
  })

  if (!response.ok()) throw new Error(await response.text())
  const result = ComposeResponseSchema.parse(await response.json())
  expect(result.artifact.durationSeconds).toBeGreaterThan(0.45)
  expect(result.artifact.durationSeconds).toBeLessThan(0.8)
  expect(['burned', 'muxed']).toContain(result.subtitleMode)

  const media = await request.get(result.artifact.url)
  expect(media.ok()).toBe(true)
  expect(media.headers()['content-type']).toBe('video/mp4')
  expect((await media.body()).byteLength).toBeGreaterThan(1_000)
})
