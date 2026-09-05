import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  GetPublishedSnapshotResponseSchema,
  ListPublishedSnapshotsResponseSchema,
  PublishCanvasResponseSchema,
  RevokePublishedSnapshotResponseSchema,
} from '@/contracts/publish'
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { readState, resetStore, withState } from '@/server/store'
import { DELETE as revokeSnapshot, GET as getSnapshot } from './[snapshotId]/route'
import { GET, POST } from './route'

function publishRequest(body: unknown) {
  return new Request('http://localhost/api/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function snapshotParams(snapshotId: string) {
  return { params: Promise.resolve({ snapshotId }) }
}

async function sourceCanvas() {
  const state = await readState()
  const canvas = state.canvases.find((item) => item.document.nodes.length > 0)
  if (!canvas) throw new Error('authenticated-populated fixture must include a publishable canvas')
  return canvas
}

describe.sequential('/api/publish route smoke', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('publishes a typed frozen snapshot, lists its public summary, and keeps later source edits out of the public document', async () => {
    const source = await sourceCanvas()
    const sourceNode = source.document.nodes[0]
    if (!sourceNode) throw new Error('publishable fixture must include a source node')

    const publishedResponse = await POST(publishRequest({
      canvasId: source.id,
      title: 'Route smoke 冻结快照',
      summary: '验证发布后画布仍可独立编辑。',
    }))
    const published = PublishCanvasResponseSchema.parse(await publishedResponse.json())
    const snapshotId = published.snapshot.id

    expect(publishedResponse.status).toBe(200)
    expect(published.snapshot).toMatchObject({
      id: expect.stringMatching(/^pub_/),
      canvasId: source.id,
      title: 'Route smoke 冻结快照',
      state: 'listed',
      nodeCount: source.document.nodes.length,
    })

    const listedResponse = await GET()
    const listed = ListPublishedSnapshotsResponseSchema.parse(await listedResponse.json())
    expect(listedResponse.status).toBe(200)
    expect(listed.snapshots).toContainEqual(expect.objectContaining({ id: snapshotId, state: 'listed' }))
    expect(listed.snapshots.find((snapshot) => snapshot.id === snapshotId)).not.toHaveProperty('document')

    const detailBeforeResponse = await getSnapshot(
      new Request(`http://localhost/api/publish/${snapshotId}`),
      snapshotParams(snapshotId),
    )
    const detailBefore = GetPublishedSnapshotResponseSchema.parse(await detailBeforeResponse.json())
    expect(detailBeforeResponse.status).toBe(200)
    expect(detailBefore.snapshot.document.nodes.find((node) => node.id === sourceNode.id)?.name).toBe(sourceNode.name)

    await withState((state) => {
      const live = state.canvases.find((canvas) => canvas.id === source.id)
      if (!live) throw new Error('source canvas disappeared during publish smoke')
      const node = live.document.nodes.find((item) => item.id === sourceNode.id)
      if (!node) throw new Error('source node disappeared during publish smoke')
      node.name = '发布后源画布编辑'
    })

    const detailAfterResponse = await getSnapshot(
      new Request(`http://localhost/api/publish/${snapshotId}`),
      snapshotParams(snapshotId),
    )
    const detailAfter = GetPublishedSnapshotResponseSchema.parse(await detailAfterResponse.json())
    expect(detailAfterResponse.status).toBe(200)
    expect(detailAfter.snapshot.document.nodes.find((node) => node.id === sourceNode.id)?.name).toBe(sourceNode.name)
  })

  it('revokes a published snapshot and enforces the same hidden boundary for list and public detail', async () => {
    const source = await sourceCanvas()
    const publishedResponse = await POST(publishRequest({ canvasId: source.id }))
    const published = PublishCanvasResponseSchema.parse(await publishedResponse.json())
    const snapshotId = published.snapshot.id

    const revokedResponse = await revokeSnapshot(
      new Request(`http://localhost/api/publish/${snapshotId}`, { method: 'DELETE' }),
      snapshotParams(snapshotId),
    )
    const revoked = RevokePublishedSnapshotResponseSchema.parse(await revokedResponse.json())
    expect(revokedResponse.status).toBe(200)
    expect(revoked.snapshot).toMatchObject({ id: snapshotId, state: 'revoked' })

    const listedResponse = await GET()
    const listed = ListPublishedSnapshotsResponseSchema.parse(await listedResponse.json())
    expect(listedResponse.status).toBe(200)
    expect(listed.snapshots).not.toContainEqual(expect.objectContaining({ id: snapshotId }))

    const hiddenResponse = await getSnapshot(
      new Request(`http://localhost/api/publish/${snapshotId}`),
      snapshotParams(snapshotId),
    )
    const hidden = LocalErrorEnvelopeSchema.parse(await hiddenResponse.json())
    expect(hiddenResponse.status).toBe(404)
    expect(hidden).toMatchObject({
      error: { code: 'NOT_FOUND', message: '作品不存在或已下架' },
      requestId: expect.stringMatching(/^req_local_/),
    })
  })
})
