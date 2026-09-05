import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const CANVAS_URL = '/canvas?projectId=prj_video_demo&canvasId=can_video_main'
const CANVAS_ID = 'can_video_main'
const IMAGE_NODE_ID = 'node_image_01'

type JobResponse = {
  job: {
    id: string
    status: string
  }
}

async function resetFixture(request: APIRequestContext) {
  const selected = await request.post('/api/dev/scenario', { data: { scenarioId: 'authenticated-populated' } })
  expect(selected.ok()).toBe(true)
  const reset = await request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)
}

async function createJob(request: APIRequestContext, fixture: 'failed' | 'pending') {
  const response = await request.post('/api/jobs', {
    data: { canvasId: CANVAS_ID, nodeId: IMAGE_NODE_ID, fixture },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()) as JobResponse
}

async function transition(request: APIRequestContext, jobId: string, action: 'confirm' | 'retry' | 'cancel') {
  const response = await request.post(`/api/jobs/${jobId}`, { data: { action } })
  expect(response.ok()).toBe(true)
  return (await response.json()) as JobResponse
}

async function pollUntil(request: APIRequestContext, jobId: string, expected: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await request.get(`/api/jobs/${jobId}`)
    expect(response.ok()).toBe(true)
    const payload = (await response.json()) as JobResponse
    if (payload.job.status === expected) return payload
    await new Promise((resolve) => setTimeout(resolve, 350))
  }
  throw new Error(`job ${jobId} did not reach ${expected}`)
}

function lifecycleResponse(page: Page, jobId: string, action: 'confirm' | 'retry' | 'cancel') {
  return page.waitForResponse(async (response) => {
    if (response.request().method() !== 'POST' || !response.url().endsWith(`/api/jobs/${jobId}`)) return false
    const data = response.request().postDataJSON() as { action?: string } | null
    return data?.action === action
  })
}

test('canvas job lifecycle keeps retry, user cancellation and ledger chains durable after reload', async ({ page, request }) => {
  await resetFixture(request)

  // Drive a deterministic failed run through the typed HTTP contract first.
  // The canvas then proves it can recover the server-owned terminal state,
  // rather than relying on component-local timers or test-only DOM injection.
  const failed = await createJob(request, 'failed')
  await transition(request, failed.job.id, 'confirm')
  await pollUntil(request, failed.job.id, 'failed')

  await page.goto(CANVAS_URL)
  const imageNode = page.getByTestId(`node-${IMAGE_NODE_ID}`)
  await expect(imageNode.getByTestId(`job-status-${failed.job.id}`)).toHaveText('生成失败')

  // The retry is initiated from the recovered node UI. It creates a fresh
  // quote, which is confirmed in the normal gate and settles once on success.
  const retryRequest = lifecycleResponse(page, failed.job.id, 'retry')
  await imageNode.getByRole('button', { name: '重试' }).click()
  const retryResponse = await retryRequest
  expect(retryResponse.ok()).toBe(true)
  const retry = (await retryResponse.json()) as JobResponse
  await expect(page.getByTestId('confirm-gate')).toBeVisible()
  await page.getByTestId('confirm-generate').click()
  await expect(imageNode.getByTestId(`job-status-${retry.job.id}`)).toHaveText('生成完成', { timeout: 30_000 })

  await page.reload()
  await expect(page.getByTestId(`node-${IMAGE_NODE_ID}`).getByTestId(`job-status-${retry.job.id}`)).toHaveText('生成完成')

  // A second local fixture stays in queued/running state just long enough for
  // the user to cancel it from the canvas. Refresh must retain the terminal
  // status, and its reserve/release chain must be separate from the retry.
  const pending = await createJob(request, 'pending')
  await transition(request, pending.job.id, 'confirm')
  await page.reload()
  const pendingNode = page.getByTestId(`node-${IMAGE_NODE_ID}`)
  const cancelRequest = lifecycleResponse(page, pending.job.id, 'cancel')
  await pendingNode.getByRole('button', { name: '取消生成' }).click()
  expect((await cancelRequest).ok()).toBe(true)
  await expect(pendingNode.getByTestId(`job-status-${pending.job.id}`)).toHaveText('已取消')

  await page.reload()
  await expect(page.getByTestId(`node-${IMAGE_NODE_ID}`).getByTestId(`job-status-${pending.job.id}`)).toHaveText('已取消')

  const ledger = await request.get('/api/ledger?limit=200')
  expect(ledger.ok()).toBe(true)
  const payload = (await ledger.json()) as { spent: Array<{ jobId: string; type: string }>; returned: Array<{ jobId: string; type: string }> }
  const entriesFor = (jobId: string) => [...payload.spent, ...payload.returned].filter((entry) => entry.jobId === jobId)

  expect(entriesFor(failed.job.id).map((entry) => entry.type).sort()).toEqual(['release', 'reserve'])
  expect(entriesFor(retry.job.id).map((entry) => entry.type).sort()).toEqual(['reserve', 'settle'])
  expect(entriesFor(pending.job.id).map((entry) => entry.type).sort()).toEqual(['release', 'reserve'])
})
