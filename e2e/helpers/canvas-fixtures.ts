import { expect, type APIRequestContext, type Page } from '@playwright/test'

export const POPULATED_CANVAS = {
  projectId: 'prj_video_demo',
  canvasId: 'can_video_main',
} as const

type ScenarioId = 'authenticated-empty' | 'authenticated-populated'

type ScenarioResponse = {
  scenario: { id: ScenarioId }
  state: { projects: number; canvases: number; jobs: number; assets: number }
}

type CanvasResponse = {
  canvas: { id: string; projectId: string; document: { nodes: unknown[] } }
  project?: { id: string }
}

type CreatedProjectResponse = {
  project: { id: string }
  canvas: { id: string; projectId: string }
}

function assertJsonResponse(response: { ok(): boolean; url(): string }, pathname: string) {
  expect(response.ok(), `Expected ${pathname} to return OK; received ${response.url()}`).toBe(true)
  expect(new URL(response.url()).pathname).toBe(pathname)
}

async function readCanvas(request: APIRequestContext, canvasId: string): Promise<CanvasResponse> {
  const pathname = `/api/canvases/${encodeURIComponent(canvasId)}`
  const response = await request.get(pathname)
  assertJsonResponse(response, pathname)
  return (await response.json()) as CanvasResponse
}

function canvasIdentity(url: string) {
  const parsed = new URL(url)
  return {
    pathname: parsed.pathname,
    projectId: parsed.searchParams.get('projectId'),
    canvasId: parsed.searchParams.get('canvasId'),
  }
}

/**
 * Scenario selection is a server-side fixture boundary. Validate its returned
 * id and counts before navigating so a previous test's persisted workspace is
 * never mistaken for the requested canvas state.
 */
export async function selectCanvasScenario(request: APIRequestContext, scenarioId: ScenarioId) {
  const response = await request.post('/api/dev/scenario', { data: { scenarioId } })
  assertJsonResponse(response, '/api/dev/scenario')

  const payload = (await response.json()) as ScenarioResponse
  expect(payload.scenario.id).toBe(scenarioId)
  expect(payload.state.projects).toBeGreaterThanOrEqual(0)
  expect(payload.state.canvases).toBeGreaterThanOrEqual(0)
  return payload
}

/**
 * Wait for the POST that creates the project, then derive the exact route from
 * that response. A generic `/canvas?projectId=` URL match is insufficient: it
 * can observe a prior navigation while the new canvas is still loading.
 */
export async function createProjectAndOpenCanvas(page: Page, request: APIRequestContext) {
  await page.goto('/project')
  const trigger = page.getByTestId('start-create')
  await expect(trigger).toBeEnabled()

  const createdResponse = page.waitForResponse((response) => {
    return response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/projects' && response.ok()
  })
  await trigger.click()

  const created = await createdResponse
  assertJsonResponse(created, '/api/projects')
  const payload = (await created.json()) as CreatedProjectResponse
  expect(payload.canvas.projectId).toBe(payload.project.id)

  // Confirm that the mutation is durable before treating the route as ready.
  const persisted = await readCanvas(request, payload.canvas.id)
  expect(persisted.canvas.projectId).toBe(payload.project.id)

  await expect
    .poll(() => canvasIdentity(page.url()))
    .toEqual({ pathname: '/canvas', projectId: payload.project.id, canvasId: payload.canvas.id })
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  return payload
}

/**
 * Seeded canvas opening follows the same two-boundary contract as project
 * creation: fixture persistence is verified over the API first, then visible
 * editor chrome proves the client consumed that exact canvas.
 */
export async function openCanvasFixture(
  page: Page,
  request: APIRequestContext,
  fixture: typeof POPULATED_CANVAS = POPULATED_CANVAS,
) {
  const seeded = await readCanvas(request, fixture.canvasId)
  expect(seeded.canvas.id).toBe(fixture.canvasId)
  expect(seeded.canvas.projectId).toBe(fixture.projectId)
  expect(seeded.project?.id).toBe(fixture.projectId)

  await page.goto(`/canvas?projectId=${fixture.projectId}&canvasId=${fixture.canvasId}`)
  await expect(page.getByTestId('workflow-canvas')).toBeVisible()
  await expect(page.getByTestId('canvas-load-error')).toHaveCount(0)
  return seeded
}
