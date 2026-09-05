import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

type CanvasResponse = {
  canvas: {
    document: {
      nodes: Array<{
        id: string
        type: string
        data: { extra?: { composite?: unknown } }
      }>
    }
  }
}

async function prepareEditor(page: Page, request: APIRequestContext) {
  const scenario = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-populated' } })
  expect(scenario.ok()).toBe(true)

  await page.goto('/canvas?projectId=prj_video_demo&canvasId=can_video_main')
  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('open-clip-editor').click()
  await expect(page.getByTestId('clip-editor')).toBeVisible()
}

async function canvas(request: APIRequestContext): Promise<CanvasResponse> {
  const response = await request.get('/api/canvases/can_video_main')
  expect(response.ok()).toBe(true)
  return response.json() as Promise<CanvasResponse>
}

function compositeOf(snapshot: CanvasResponse) {
  const composite = snapshot.canvas.document.nodes.find((node) => node.type === 'videoComposite')
  expect(composite).toBeDefined()
  return composite!
}

async function addAudioFixture(request: APIRequestContext) {
  const current = await canvas(request)
  const composite = compositeOf(current)
  const response = await request.post('/api/canvases/can_video_main', {
    data: {
      canvasId: 'can_video_main',
      expectedRevision: (current.canvas as { revision?: number }).revision,
      label: 'Clip editor core audio fixture',
      mutations: [{
        op: 'updateNode',
        nodeId: composite.id,
        patch: {
          data: {
            ...(composite as { data: Record<string, unknown> }).data,
            artifacts: [{
              id: 'art_clip_editor_core_audio',
              jobId: 'fixture',
              kind: 'audio',
              url: '/api/media/fixtures/compositor-bed.wav',
              thumbnailUrl: null,
              width: null,
              height: null,
              durationSeconds: 3,
              createdAt: '2026-09-05T00:00:00.000Z',
              modelId: 'audio-fixture',
              assetId: null,
            }],
          },
        },
      }],
    },
  })
  expect(response.ok()).toBe(true)
}

async function addVideoClip(page: Page) {
  await page
    .getByTestId('clip-source-video-art_video_01')
    .getByRole('button', { name: '添加到时间线' })
    .click()
  await expect(page.locator('[data-testid^="timeline-clip-"]')).toHaveCount(1)
}

test('clip editor persists a representative multi-track edit sequence through reload', async ({ page, request }) => {
  await prepareEditor(page, request)
  await addAudioFixture(request)
  await page.reload()
  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('open-clip-editor').click()

  await addVideoClip(page)
  const clips = page.locator('[data-testid^="timeline-clip-"]')
  const firstClipId = (await clips.first().getAttribute('data-testid'))!.replace('timeline-clip-', '')

  await clips.first().click()
  await page.getByRole('spinbutton', { name: '片段入点' }).fill('0.5')
  await page.getByRole('spinbutton', { name: '片段入点' }).blur()
  await expect(page.getByRole('spinbutton', { name: '片段入点' })).toHaveValue('0.5')

  const playhead = page.getByTestId('clip-playhead-slider')
  await playhead.focus()
  await page.keyboard.press('End')
  await page.keyboard.press('PageDown')
  await page.getByTestId('clip-split').click()
  await expect(clips).toHaveCount(2)

  await clips.nth(1).click()
  await page.getByTestId('clip-speed-2').click()
  await expect(clips.nth(1)).toContainText('2×')

  await clips.first().click()
  await page.getByTestId('clip-tool-transition').click()
  await page.getByRole('button', { name: '淡入淡出', exact: true }).click()
  await expect(page.getByTestId('transition-properties')).toContainText('淡入淡出')

  await page.getByTestId('clip-tool-subtitle').click()
  await page.getByTestId('add-subtitle').click()
  const subtitle = page.getByTestId('subtitle-text-subtitle-1')
  await subtitle.fill('雨夜，故事开始。')
  await subtitle.blur()
  await expect(page.getByTestId('subtitle-track')).toContainText('雨夜，故事开始。')

  await page.getByTestId('clip-source-audio-art_clip_editor_core_audio').getByRole('button', { name: '添加到音轨' }).click()
  const audioTrack = page.getByTestId('timeline-audio-audio-art_clip_editor_core_audio-1')
  await expect(audioTrack).toBeVisible()
  await audioTrack.click()
  await page.getByRole('spinbutton', { name: '音轨出点' }).fill('2.5')
  await page.getByRole('spinbutton', { name: '音轨出点' }).blur()
  await page.getByRole('spinbutton', { name: '音轨时间线起点' }).fill('1')
  await page.getByRole('spinbutton', { name: '音轨时间线起点' }).blur()
  await page.getByRole('slider', { name: '音轨音量' }).evaluate((element) => {
    const input = element as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, '0.5')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.getByRole('button', { name: '静音', exact: true }).click()

  await expect.poll(async () => {
    const extra = compositeOf(await canvas(request)).data.extra as {
      composite?: {
        clips?: Array<{ id: string; inPoint: number; outPoint: number; speed: number; transitionAfter: { type: string } | null }>
        subtitles?: Array<{ text: string }>
        audioTracks?: Array<{ inPoint: number; outPoint: number; start: number; volume: number; muted: boolean }>
      }
    }
    return extra.composite
  }).toMatchObject({
    clips: [
      { id: firstClipId, inPoint: 0.5, transitionAfter: { type: 'fade' } },
      { speed: 2 },
    ],
    subtitles: [{ text: '雨夜，故事开始。' }],
    audioTracks: [{ inPoint: 0, outPoint: 2.5, start: 1, volume: 0.5, muted: true }],
  })

  await page.reload()
  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('open-clip-editor').click()
  await expect(page.locator('[data-testid^="timeline-clip-"]')).toHaveCount(2)
  await expect(page.locator('[data-testid^="timeline-clip-"]').nth(1)).toContainText('2×')
  await page.getByTestId('clip-tool-subtitle').click()
  await expect(page.getByTestId('subtitle-track')).toContainText('雨夜，故事开始。')
  await page.getByTestId('timeline-audio-audio-art_clip_editor_core_audio-1').click()
  await expect(page.getByRole('spinbutton', { name: '音轨出点' })).toHaveValue('2.5')
  await expect(page.getByRole('spinbutton', { name: '音轨时间线起点' })).toHaveValue('1')
  await expect(page.getByRole('slider', { name: '音轨音量' })).toHaveValue('0.5')
  await expect(page.getByRole('button', { name: '开启声音', exact: true })).toBeVisible()
})

test('failed and cancelled exports preserve the timeline without creating a result node', async ({ page, request }) => {
  await prepareEditor(page, request)
  await addVideoClip(page)
  await expect.poll(async () => {
    const saved = compositeOf(await canvas(request))
    return (saved.data.extra as { composite?: { clips?: unknown[] } }).composite?.clips?.length
  }).toBe(1)

  const beforeFailure = await canvas(request)
  const baseTask = {
    id: 'compose_clip_editor_core',
    artifact: null,
    assetId: null,
    subtitleMode: null,
    notes: [],
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
  }
  await page.route('**/api/compose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ task: { ...baseTask, status: 'failed', failure: 'fixture export failure' } }),
    })
  })

  await page.getByTestId('clip-export-trigger').click()
  await page.getByTestId('export-to-canvas').click()
  await expect(page.getByTestId('compose-error')).toContainText('fixture export failure')
  const afterFailure = await canvas(request)
  expect(compositeOf(afterFailure).data.extra).toEqual(compositeOf(beforeFailure).data.extra)
  expect(afterFailure.canvas.document.nodes.filter((node) => node.type === 'video')).toHaveLength(1)

  await page.unroute('**/api/compose')
  let cancelled = false
  await page.route('**/api/compose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ task: { ...baseTask, id: 'compose_clip_editor_cancel', status: 'rendering', failure: null } }),
    })
  })
  await page.route('**/api/compose/compose_clip_editor_cancel**', async (route) => {
    const task = {
      ...baseTask,
      id: 'compose_clip_editor_cancel',
      status: cancelled ? 'cancelled' : 'rendering',
      failure: null,
    }
    if (route.request().method() === 'POST') cancelled = true
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task: { ...task, status: cancelled ? 'cancelled' : 'rendering' } }) })
  })

  await page.getByTestId('clip-export-trigger').click()
  await page.getByTestId('export-to-canvas').click()
  await expect(page.getByTestId('compose-progress')).toBeVisible()
  await page.getByTestId('compose-cancel').click()
  await expect(page.getByTestId('compose-success')).toContainText('已取消合成')
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('libtv.compose.active-task:prj_video_demo:can_video_main'))).toBeNull()

  const afterCancel = await canvas(request)
  expect(compositeOf(afterCancel).data.extra).toEqual(compositeOf(beforeFailure).data.extra)
  expect(afterCancel.canvas.document.nodes.filter((node) => node.type === 'video')).toHaveLength(1)
})
