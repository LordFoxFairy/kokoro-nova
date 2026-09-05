import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  CanvasDetailLocalResponseSchema,
  CanvasSchema,
  MutationResultSchema,
} from '@/contracts/local'
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { readState, resetStore } from '@/server/store'
import { POST as createCanvas } from '../route'
import { DELETE, GET, PATCH, POST } from './route'

function params(canvasId: string) {
  return { params: Promise.resolve({ canvasId }) }
}

function mutationRequest(canvasId: string, body: unknown) {
  return new Request(`http://localhost/api/canvases/${canvasId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function renameRequest(canvasId: string, body: unknown) {
  return new Request(`http://localhost/api/canvases/${canvasId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function createRequest(body: unknown) {
  return new Request('http://localhost/api/canvases', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function firstCanvasId() {
  const state = await readState()
  const canvas = state.canvases[0]
  if (!canvas) throw new Error('authenticated-populated fixture must include a canvas')
  return canvas.id
}

async function canvasDetail(canvasId: string) {
  const response = await GET(new Request(`http://localhost/api/canvases/${canvasId}`), params(canvasId))
  return {
    response,
    body: CanvasDetailLocalResponseSchema.parse(await response.json()),
  }
}

describe.sequential('/api/canvases/[canvasId] workflow route', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('returns the typed canvas/project/jobs projection and persists a typed rename', async () => {
    const canvasId = await firstCanvasId()
    const initial = await canvasDetail(canvasId)

    expect(initial.response.status).toBe(200)
    expect(initial.response.headers.get('content-type')).toContain('application/json')
    expect(initial.body.canvas.id).toBe(canvasId)
    expect(initial.body.project?.canvasIds).toContain(canvasId)

    const renamedResponse = await PATCH(renameRequest(canvasId, { name: '重命名的本地画布' }), params(canvasId))
    const renamed = CanvasSchema.parse(await renamedResponse.json())
    const reloaded = await canvasDetail(canvasId)

    expect(renamedResponse.status).toBe(200)
    expect(renamed.name).toBe('重命名的本地画布')
    expect(reloaded.body.canvas.name).toBe('重命名的本地画布')
  })

  it('commits a schema-valid mutation as one revisioned document projection and rejects stale revisions', async () => {
    const canvasId = await firstCanvasId()
    const initial = await canvasDetail(canvasId)
    const mutation = await POST(
      mutationRequest(canvasId, {
        canvasId,
        expectedRevision: initial.body.canvas.revision,
        label: '路由 smoke 调整视口',
        mutations: [{ op: 'setViewport', viewport: { x: 120, y: -36, zoom: 0.8 } }],
      }),
      params(canvasId),
    )
    const result = MutationResultSchema.parse(await mutation.json())
    const reloaded = await canvasDetail(canvasId)

    expect(mutation.status).toBe(200)
    expect(result).toEqual({
      revision: initial.body.canvas.revision + 1,
      document: expect.objectContaining({ viewport: { x: 120, y: -36, zoom: 0.8 } }),
    })
    expect(reloaded.body.canvas.revision).toBe(result.revision)
    expect(reloaded.body.canvas.document).toEqual(result.document)

    const stale = await POST(
      mutationRequest(canvasId, {
        canvasId,
        expectedRevision: initial.body.canvas.revision,
        label: '过期写入',
        mutations: [],
      }),
      params(canvasId),
    )
    const staleError = LocalErrorEnvelopeSchema.parse(await stale.json())

    expect(stale.status).toBe(409)
    expect(staleError.error).toMatchObject({ code: 'REVISION_CONFLICT' })
    expect(staleError.error.message).toContain(`期望 ${initial.body.canvas.revision}`)
  })

  it('keeps the persisted document and revision unchanged when one mutation in an atomic batch is invalid', async () => {
    const canvasId = await firstCanvasId()
    const initial = await canvasDetail(canvasId)
    const invalid = await POST(
      mutationRequest(canvasId, {
        canvasId,
        expectedRevision: initial.body.canvas.revision,
        label: '不能部分提交',
        mutations: [
          { op: 'setViewport', viewport: { x: 999, y: 999, zoom: 1.5 } },
          {
            op: 'addEdge',
            edge: {
              id: 'edge_atomic_failure',
              source: 'node_missing_source',
              target: 'node_missing_target',
              createdAt: '2026-09-05T00:00:00.000Z',
            },
          },
        ],
      }),
      params(canvasId),
    )
    const error = LocalErrorEnvelopeSchema.parse(await invalid.json())
    const reloaded = await canvasDetail(canvasId)

    expect(invalid.status).toBe(400)
    expect(error.error).toMatchObject({ code: 'INVALID_INPUT', message: '节点不存在: node_missing_source' })
    expect(reloaded.body.canvas.revision).toBe(initial.body.canvas.revision)
    expect(reloaded.body.canvas.document).toEqual(initial.body.canvas.document)
  })

  it('validates mutation bodies and returns the standard not-found envelope without mutating a canvas', async () => {
    const canvasId = await firstCanvasId()
    const malformed = await POST(
      mutationRequest(canvasId, { canvasId, expectedRevision: 1, mutations: [] }),
      params(canvasId),
    )
    const malformedError = LocalErrorEnvelopeSchema.parse(await malformed.json())

    expect(malformed.status).toBe(400)
    expect(malformedError.error).toMatchObject({ code: 'INVALID_INPUT' })
    expect(malformedError.error.message).toContain('label')

    const missing = await GET(new Request('http://localhost/api/canvases/canvas_missing'), params('canvas_missing'))
    const missingError = LocalErrorEnvelopeSchema.parse(await missing.json())
    expect(missing.status).toBe(404)
    expect(missingError.error).toMatchObject({ code: 'NOT_FOUND', message: '画布不存在' })
  })

  it('deletes a non-last canvas and leaves its project projection without the removed id', async () => {
    const sourceId = await firstCanvasId()
    const source = await canvasDetail(sourceId)
    const createdResponse = await createCanvas(createRequest({ projectId: source.body.canvas.projectId, name: '待删除画布' }))
    const created = CanvasSchema.parse(await createdResponse.json())
    const deleted = await DELETE(new Request(`http://localhost/api/canvases/${created.id}`, { method: 'DELETE' }), params(created.id))
    const deletedBody = await deleted.json() as { deleted: string; canvasIds: string[] }
    const projectAfter = await canvasDetail(sourceId)

    expect(deleted.status).toBe(200)
    expect(deletedBody).toMatchObject({ deleted: created.id })
    expect(deletedBody.canvasIds).not.toContain(created.id)
    expect(projectAfter.body.project?.canvasIds).not.toContain(created.id)

    const missing = await GET(new Request(`http://localhost/api/canvases/${created.id}`), params(created.id))
    expect(missing.status).toBe(404)
    expect(LocalErrorEnvelopeSchema.parse(await missing.json()).error.code).toBe('NOT_FOUND')
  })
})
