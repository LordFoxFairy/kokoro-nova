import { describe, expect, it } from 'vitest'

import responseExample from '../../../docs/api/examples/canvas-bootstrap.response.json'
import { ContractDecodeError } from '@/contracts/http'
import { decodeCanvasBootstrap } from '@/contracts/canvas'
import { MutationRequestSchema, MutationResultSchema } from '@/contracts/local'

describe('decodeCanvasBootstrap', () => {
  it('parses node data JSON and keeps permission booleans explicit', () => {
    const result = decodeCanvasBootstrap(responseExample)

    expect(result.permissions).toEqual({
      read: true,
      edit: true,
      manage: true,
      publish: true,
      share: true,
      copy: true,
    })
    expect(result.project).toMatchObject({ id: 'project_video_demo', name: '城市夜景短片' })
    expect(result.viewport).toEqual({ x: -120, y: 48, zoom: 0.5 })
    expect(result.nodes[1]).toMatchObject({
      id: 'node_video_01',
      kind: 'video',
      externalType: 3,
      data: { generatorType: 'video' },
    })
    expect(result.connections[0]).toMatchObject({
      id: 'edge_image_video_01',
      source: 'node_image_01',
      target: 'node_video_01',
      deletable: true,
      selectable: true,
    })
  })

  it('rejects invalid node data JSON at the transport boundary', () => {
    const broken = structuredClone(responseExample)
    broken.data.projectDetail.nodeList[0].data = '{not-json'

    expect(() => decodeCanvasBootstrap(broken)).toThrowError(
      expect.objectContaining<Partial<ContractDecodeError>>({ code: 'INVALID_DATA' }),
    )
  })

  it('preserves an unrecognized external node type instead of dropping the node', () => {
    const future = structuredClone(responseExample)
    future.data.projectDetail.nodeList[0].type = 99

    const result = decodeCanvasBootstrap(future)
    expect(result.nodes[0]).toMatchObject({ kind: 'unknown', externalType: 99 })
  })

  it('keeps workflow mutation requests strict and result documents typed', () => {
    const request = MutationRequestSchema.parse({
      canvasId: 'can_fixture',
      expectedRevision: 3,
      mutations: [{ op: 'setViewport', viewport: { x: 10, y: 20, zoom: 0.75 } }],
      label: '调整视口',
    })
    const result = MutationResultSchema.parse({
      revision: 4,
      document: {
        schemaVersion: 1,
        nodes: [],
        edges: [],
        groups: [],
        viewport: { x: 10, y: 20, zoom: 0.75 },
      },
    })

    expect(request.mutations).toHaveLength(1)
    expect(result.document.viewport.zoom).toBe(0.75)
    expect(() => MutationRequestSchema.parse({ ...request, unexpected: true })).toThrow()
  })
})
