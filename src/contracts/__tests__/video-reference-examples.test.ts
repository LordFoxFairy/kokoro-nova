import { describe, expect, it } from 'vitest'

import addReference from '../../../docs/api/examples/canvas-video-reference-add.request.json'
import addMention from '../../../docs/api/examples/canvas-video-mention.request.json'
import removeReference from '../../../docs/api/examples/canvas-video-reference-remove.request.json'
import { applyMutations } from '@/domain/mutations'
import type { CanvasMutation } from '@/domain/types'
import { buildVideoWorkspace } from '@/mocks/scenarios/video-project'

function fixtureDocument() {
  return buildVideoWorkspace('succeeded').canvases.find((canvas) => canvas.id === 'can_video_main')!.document
}

describe('Video reference API examples', () => {
  it('adds a second graph reference with the documented mutation request', () => {
    const after = applyMutations(fixtureDocument(), addReference.mutations as CanvasMutation[])

    expect(after.edges).toContainEqual(
      expect.objectContaining({ source: 'node_text_01', target: 'node_video_01' }),
    )
  })

  it('persists the documented @ token shape on the shared Video node', () => {
    const after = applyMutations(fixtureDocument(), addMention.mutations as CanvasMutation[])
    const video = after.nodes.find((node) => node.id === 'node_video_01')

    expect(video?.data.extra?.videoMentions).toEqual([
      { id: 'vmn_fixture_01', nodeId: 'node_image_01', label: '图片 1', ordinal: 1 },
    ])
  })

  it('removes an edge and its dependent metadata in one documented transaction', () => {
    const after = applyMutations(fixtureDocument(), removeReference.mutations as CanvasMutation[])
    const video = after.nodes.find((node) => node.id === 'node_video_01')

    expect(after.edges.some((edge) => edge.id === 'edge_image_video')).toBe(false)
    expect(video?.data.extra?.videoMentions).toEqual([])
    expect(video?.data.extra?.elementMarks).toEqual([])
  })
})
