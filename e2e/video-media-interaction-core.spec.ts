import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

type Artifact = {
  id: string
  kind: 'video'
  url: string
  thumbnailUrl: string | null
  width: number | null
  height: number | null
  durationSeconds: number | null
  createdAt: string
  modelId: string
  jobId: string
  assetId: string | null
}

type CanvasSnapshot = {
  canvas: {
    document: {
      nodes: Array<{
        id: string
        type: string
        data: { artifacts?: Artifact[]; extra?: { composite?: unknown } }
      }>
    }
  }
}

const PROJECT_URL = '/canvas?projectId=prj_video_demo&canvasId=can_video_main'
const CANVAS_PATH = '/api/canvases/can_video_main'

async function prepareEditor(page: Page, request: APIRequestContext) {
  const scenario = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-populated' } })
  expect(scenario.ok()).toBe(true)

  await page.goto(PROJECT_URL)
  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('open-clip-editor').click()
  await expect(page.getByTestId('clip-editor')).toBeVisible()
}

async function canvas(request: APIRequestContext): Promise<CanvasSnapshot> {
  const response = await request.get(CANVAS_PATH)
  expect(response.ok()).toBe(true)
  return response.json() as Promise<CanvasSnapshot>
}

function videoArtifact(snapshot: CanvasSnapshot): Artifact {
  const artifact = snapshot.canvas.document.nodes
    .flatMap((node) => node.data.artifacts ?? [])
    .find((candidate) => candidate.kind === 'video')
  expect(artifact).toBeDefined()
  return artifact!
}

function composite(snapshot: CanvasSnapshot) {
  const node = snapshot.canvas.document.nodes.find((candidate) => candidate.type === 'videoComposite')
  expect(node).toBeDefined()
  return node!
}

async function dragSourceToTimeline(page: Page) {
  const source = page.getByTestId('clip-source-video-art_video_01')
  await expect(source).toHaveAttribute('draggable', 'true')
  await source.dragTo(page.getByTestId('clip-timeline-panel'))
  await expect(page.locator('[data-testid^="timeline-clip-"]')).toHaveCount(1)
  await expect(page.getByTestId('clip-timeline-feedback')).toContainText('已将')
}

test('dragging deterministic video media to the timeline drives preview playback and survives reload', async ({ page, request }) => {
  await prepareEditor(page, request)
  const sourceArtifact = videoArtifact(await canvas(request))

  await dragSourceToTimeline(page)

  const preview = page.getByTestId('clip-preview-frame')
  await expect(preview).toBeVisible()
  const media = preview.locator('video[aria-label="源素材预览"]')
  await expect(media).toHaveAttribute('src', sourceArtifact.url)

  const playhead = page.getByTestId('clip-current-time')
  await expect(playhead).toHaveText('00:00')
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await expect.poll(() => playhead.textContent()).not.toBe('00:00')
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible()

  await expect.poll(async () => {
    const saved = composite(await canvas(request)).data.extra as { composite?: { clips?: Array<{ artifactId: string }> } }
    return saved.composite?.clips?.map((clip) => clip.artifactId)
  }).toEqual([sourceArtifact.id])

  await page.reload()
  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('open-clip-editor').click()
  await expect(page.locator('[data-testid^="timeline-clip-"]')).toHaveCount(1)
  await expect(page.getByTestId('clip-preview-frame').locator('video[aria-label="源素材预览"]'))
    .toHaveAttribute('src', sourceArtifact.url)
})

test('local export reports a terminal download without mutating the persisted timeline', async ({ page, request }) => {
  await prepareEditor(page, request)
  await dragSourceToTimeline(page)
  const beforeExport = await canvas(request)
  const sourceArtifact = videoArtifact(beforeExport)
  const beforeTimeline = composite(beforeExport).data.extra

  const task = {
    id: 'compose_video_media_interaction',
    status: 'succeeded',
    artifact: sourceArtifact,
    assetId: 'asset_video_media_interaction',
    subtitleMode: 'none',
    notes: ['deterministic local export fixture'],
    failure: null,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
  }
  await page.route('**/api/compose', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task }) })
  })

  await page.getByTestId('clip-export-trigger').click()
  await expect(page.getByTestId('export-to-local')).toBeEnabled()
  const download = page.waitForEvent('download')
  await page.getByTestId('export-to-local').click()
  const savedDownload = await download
  expect(savedDownload.suggestedFilename()).toBe(`合成视频-${sourceArtifact.id.slice(-6)}.mp4`)
  await expect(page.getByTestId('compose-success')).toContainText('合成完成，预览和导出结果已准备好')
  await expect(page.getByTestId('toast')).toContainText('已导出到本地')
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('libtv.compose.active-task:prj_video_demo:can_video_main'))).toBeNull()

  const afterExport = await canvas(request)
  expect(composite(afterExport).data.extra).toEqual(beforeTimeline)
  expect(afterExport.canvas.document.nodes.filter((node) => node.type === 'video')).toHaveLength(
    beforeExport.canvas.document.nodes.filter((node) => node.type === 'video').length,
  )

  await page.reload()
  await page.getByTestId('view-storyboard').click()
  await page.getByTestId('open-clip-editor').click()
  await expect(page.locator('[data-testid^="timeline-clip-"]')).toHaveCount(1)
  await expect(page.getByTestId('clip-total-time')).toHaveText('00:15')
})
