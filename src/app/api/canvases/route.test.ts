import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { CanvasSchema } from '@/contracts/local'
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { readState, resetStore } from '@/server/store'
import { POST } from './route'

const url = 'http://localhost/api/canvases'

function createRequest(body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function firstCanvas() {
  const state = await readState()
  const canvas = state.canvases[0]
  if (!canvas) throw new Error('authenticated-populated fixture must include a canvas')
  return canvas
}

describe.sequential('POST /api/canvases', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('creates schema-valid named canvases and persists their project membership', async () => {
    const source = await firstCanvas()
    const response = await POST(createRequest({ projectId: source.projectId, name: '路由 smoke 画布' }))
    const created = CanvasSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(created).toMatchObject({ projectId: source.projectId, name: '路由 smoke 画布', revision: 1 })
    expect(created.document).toEqual({
      schemaVersion: 1,
      nodes: [],
      edges: [],
      groups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })

    const state = await readState()
    expect(state.projects.find((project) => project.id === source.projectId)?.canvasIds).toContain(created.id)
  })

  it('copies the complete source document into an independently-addressable canvas', async () => {
    const source = await firstCanvas()
    const response = await POST(createRequest({ projectId: source.projectId, copyOf: source.id }))
    const copied = CanvasSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(copied).toMatchObject({ projectId: source.projectId, name: `${source.name}副本1`, revision: 1 })
    expect(copied.document).toEqual(source.document)
    expect(copied.id).not.toBe(source.id)
  })

  it('returns the standard not-found envelope for an unknown project or copy source', async () => {
    const missingProject = await POST(createRequest({ projectId: 'project_missing', name: '不会创建' }))
    const projectError = LocalErrorEnvelopeSchema.parse(await missingProject.json())

    expect(missingProject.status).toBe(404)
    expect(projectError.error).toMatchObject({ code: 'NOT_FOUND', message: '项目不存在' })

    const source = await firstCanvas()
    const missingSource = await POST(createRequest({ projectId: source.projectId, copyOf: 'canvas_missing' }))
    const sourceError = LocalErrorEnvelopeSchema.parse(await missingSource.json())

    expect(missingSource.status).toBe(404)
    expect(sourceError.error).toMatchObject({ code: 'NOT_FOUND', message: '源画布不存在' })
  })
})
