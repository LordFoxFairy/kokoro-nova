import { describe, expect, it } from 'vitest'

import { createEdge, createNode, emptyDocument } from '@/domain/factory'
import { applyMutations } from '@/domain/mutations'
import { filterVideoCards, projectStoryboard, VIDEO_FILTER_LABELS } from '@/domain/storyboard'
import type { StoryboardCard } from '@/domain/storyboard'
import type { Artifact, CanvasMutation, NodeData, WorkflowDocument, WorkflowNode } from '@/domain/types'

function artifact(kind: Artifact['kind'], url: string, extra: Partial<Artifact> = {}): Artifact {
  return {
    id: `art_${url}`,
    jobId: 'job_1',
    kind,
    url,
    thumbnailUrl: `${url}#thumb`,
    width: 1920,
    height: 1080,
    durationSeconds: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    modelId: 'lib-image-2',
    assetId: null,
    ...extra,
  }
}

function node(
  type: WorkflowNode['type'],
  id: string,
  createdAt: string,
  data: Partial<NodeData> = {},
): WorkflowNode {
  const base = createNode(type, { x: 0, y: 0 }, [], { id, name: `${type}-${id}`, createdAt })
  return { ...base, data: { ...base.data, ...data } }
}

function build(nodes: WorkflowNode[], rest: CanvasMutation[] = []): WorkflowDocument {
  return applyMutations(emptyDocument(), [
    ...nodes.map((n): CanvasMutation => ({ op: 'addNode', node: n })),
    ...rest,
  ])
}

const labelOf = (modelId: string | undefined) => (modelId ? `模型:${modelId}` : null)

describe('projectStoryboard / columns', () => {
  it('routes each node into the column its type declares and skips column-less types', () => {
    const doc = build([
      node('text', 'nd_text', '2026-01-01T00:00:00.000Z'),
      node('script', 'nd_script', '2026-01-01T00:00:01.000Z'),
      node('image', 'nd_image', '2026-01-01T00:00:02.000Z'),
      node('director', 'nd_director', '2026-01-01T00:00:03.000Z'),
      node('audio', 'nd_audio', '2026-01-01T00:00:04.000Z'),
      node('video', 'nd_video', '2026-01-01T00:00:05.000Z'),
      node('videoComposite', 'nd_composite', '2026-01-01T00:00:06.000Z'),
      node('style', 'nd_style', '2026-01-01T00:00:07.000Z'),
      node('assetLibrary', 'nd_asset', '2026-01-01T00:00:08.000Z'),
    ])

    const projection = projectStoryboard(doc, labelOf)

    expect(projection.text.map((c) => c.nodeId)).toEqual(['nd_text', 'nd_script'])
    expect(projection.image.map((c) => c.nodeId)).toEqual(['nd_image', 'nd_director'])
    expect(projection.audio.map((c) => c.nodeId)).toEqual(['nd_audio'])
    expect(projection.video.map((c) => c.nodeId)).toEqual(['nd_video', 'nd_composite'])
    expect(projection.text.every((c) => c.column === 'text')).toBe(true)
  })

  it('orders by creation time, falling back to node id', () => {
    const doc = build([
      node('image', 'nd_b', '2026-01-01T00:00:00.000Z'),
      node('image', 'nd_a', '2026-01-01T00:00:00.000Z'),
      node('image', 'nd_c', '2025-12-31T00:00:00.000Z'),
    ])

    expect(projectStoryboard(doc, labelOf).image.map((c) => c.nodeId)).toEqual(['nd_c', 'nd_a', 'nd_b'])
  })
})

describe('projectStoryboard / card contents', () => {
  it('marks a node without artifacts as pending and leaves the derived labels null', () => {
    const doc = build([node('image', 'nd_image', '2026-01-01T00:00:00.000Z')])

    const [card] = projectStoryboard(doc, labelOf).image

    expect(card.pending).toBe(true)
    expect(card.artifact).toBeNull()
    expect(card.artifacts).toEqual([])
    expect(card.dimensions).toBeNull()
    expect(card.durationLabel).toBeNull()
    expect(card.modelLabel).toBe('模型:lib-image-2')
    expect(card.nodeName).toBe('image-nd_image')
  })

  it('exposes the newest artifact plus the dimension and duration labels', () => {
    const doc = build([
      node('video', 'nd_video', '2026-01-01T00:00:00.000Z', {
        artifacts: [
          artifact('video', 'https://cdn.test/a.mp4', { width: 1280, height: 720, durationSeconds: 10 }),
          artifact('video', 'https://cdn.test/b.mp4'),
        ],
      }),
    ])

    const [card] = projectStoryboard(doc, labelOf).video

    expect(card.pending).toBe(false)
    expect(card.artifact?.url).toBe('https://cdn.test/a.mp4')
    expect(card.artifacts).toHaveLength(2)
    expect(card.dimensions).toBe('1280 × 720')
    expect(card.durationLabel).toBe('10 秒')
  })

  it('keeps a column-less node out of every column', () => {
    const doc = build([node('style', 'nd_style', '2026-01-01T00:00:00.000Z')])

    expect(projectStoryboard(doc, labelOf)).toEqual({ audio: [], text: [], image: [], video: [] })
  })

  it('passes the node model id to the label resolver', () => {
    const seen: (string | undefined)[] = []
    const doc = build([
      node('image', 'nd_image', '2026-01-01T00:00:00.000Z'),
      node('style', 'nd_style', '2026-01-01T00:00:01.000Z'),
    ])

    const [card] = projectStoryboard(doc, (modelId) => {
      seen.push(modelId)
      return null
    }).image

    expect(seen).toEqual(['lib-image-2'])
    expect(card.modelLabel).toBeNull()
  })
})

describe('projectStoryboard / references', () => {
  it('traces each incoming edge back to its source node', () => {
    const src = node('image', 'nd_src', '2026-01-01T00:00:00.000Z', {
      artifacts: [artifact('image', 'https://cdn.test/src.png')],
    })
    const target = node('video', 'nd_target', '2026-01-01T00:00:01.000Z')
    const edge = createEdge(src.id, target.id)
    const doc = build([src, target], [{ op: 'addEdge', edge }])

    const [card] = projectStoryboard(doc, labelOf).video

    expect(card.references).toEqual([
      {
        id: `edge:${edge.id}`,
        label: 'image-nd_src',
        kind: 'image',
        origin: 'node',
        refId: src.id,
        thumbnailUrl: 'https://cdn.test/src.png#thumb',
      },
    ])
  })

  it('adds dropped assets and skips references already covered by an edge', () => {
    const target = node('image', 'nd_target', '2026-01-01T00:00:00.000Z', {
      references: [
        {
          id: 'ref_1',
          kind: 'image',
          origin: 'asset',
          refId: 'ast_logo',
          label: 'Logo',
          thumbnailUrl: 'https://cdn.test/logo.png',
        },
        { id: 'ref_2', kind: 'video', origin: 'node', refId: 'nd_other', label: '上游节点' },
      ],
    })

    const [card] = projectStoryboard(build([target]), labelOf).image

    expect(card.references).toEqual([
      {
        id: 'ref:ref_1',
        label: 'Logo',
        kind: 'image',
        origin: 'asset',
        refId: 'ast_logo',
        thumbnailUrl: 'https://cdn.test/logo.png',
      },
    ])
  })
})

describe('projectStoryboard / videoKind', () => {
  it('classifies a video fed by another video as final and a leaf video as clip', () => {
    const t = node('text', 'nd_text', '2026-01-01T00:00:00.000Z', { prompt: '开场' })
    const clip = node('video', 'nd_clip', '2026-01-01T00:00:01.000Z')
    const final = node('video', 'nd_final', '2026-01-01T00:00:02.000Z')
    const composite = node('videoComposite', 'nd_composite', '2026-01-01T00:00:03.000Z')
    const doc = build([t, clip, final, composite], [
      { op: 'addEdge', edge: createEdge(t.id, clip.id) },
      { op: 'addEdge', edge: createEdge(clip.id, final.id) },
    ])

    const projection = projectStoryboard(doc, labelOf)
    const kinds = Object.fromEntries(projection.video.map((c) => [c.nodeId, c.videoKind]))

    expect(kinds).toEqual({ nd_clip: 'clip', nd_final: 'final', nd_composite: 'final' })
    // videoKind is a video-column concept only.
    expect(projection.text[0].videoKind).toBeNull()
  })

  it('keeps videoKind independent of whether the node has produced anything', () => {
    const clip = node('video', 'nd_clip', '2026-01-01T00:00:00.000Z', {
      artifacts: [artifact('video', 'https://cdn.test/clip.mp4')],
    })
    const doc = build([clip])

    const [card] = projectStoryboard(doc, labelOf).video

    expect(card.pending).toBe(false)
    expect(card.videoKind).toBe('clip')
  })
})

describe('filterVideoCards', () => {
  function videoCards(): StoryboardCard[] {
    const clip = node('video', 'nd_clip', '2026-01-01T00:00:00.000Z')
    const final = node('video', 'nd_final', '2026-01-01T00:00:01.000Z')
    const composite = node('videoComposite', 'nd_composite', '2026-01-01T00:00:02.000Z')
    const doc = build([clip, final, composite], [
      { op: 'addEdge', edge: createEdge(clip.id, final.id) },
    ])
    return projectStoryboard(doc, labelOf).video
  }

  it('returns everything for "all" and narrows by videoKind otherwise', () => {
    const cards = videoCards()

    expect(filterVideoCards(cards, 'all')).toHaveLength(3)
    expect(filterVideoCards(cards, 'final').map((c) => c.nodeId)).toEqual(['nd_final', 'nd_composite'])
    expect(filterVideoCards(cards, 'clip').map((c) => c.nodeId)).toEqual(['nd_clip'])
  })

  it('drops cards from other columns because their videoKind is null', () => {
    const doc = build([node('text', 'nd_text', '2026-01-01T00:00:00.000Z')])
    const textCards = projectStoryboard(doc, labelOf).text

    expect(filterVideoCards(textCards, 'all')).toHaveLength(1)
    expect(filterVideoCards(textCards, 'clip')).toEqual([])
    expect(filterVideoCards(textCards, 'final')).toEqual([])
  })

  it('labels every filter', () => {
    expect(VIDEO_FILTER_LABELS).toEqual({ all: '全部', final: '成片', clip: '片段' })
  })
})
