import { describe, expect, it } from 'vitest'

import { createEdge, createNode, emptyDocument } from '@/domain/factory'
import { applyMutations } from '@/domain/mutations'
import {
  freezeSnapshot,
  snapshotCoverUrl,
  snapshotIsViewable,
  summarizeSnapshot,
  withSnapshotState,
  type SnapshotState,
} from '@/domain/publish'
import type { Artifact, CanvasMutation, NodeData, WorkflowDocument, WorkflowNode } from '@/domain/types'

function artifact(kind: Artifact['kind'], url: string, extra: Partial<Artifact> = {}): Artifact {
  return {
    id: `art_${url}`,
    jobId: 'job_secret',
    kind,
    url,
    thumbnailUrl: `${url}#thumb`,
    width: 1920,
    height: 1080,
    durationSeconds: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    modelId: 'lib-image-2',
    assetId: 'ast_private',
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

const meta = {
  id: 'pub_1',
  projectId: 'prj_1',
  canvasId: 'cvs_1',
  title: '公开作品',
  publishedAt: '2026-02-01T00:00:00.000Z',
}

describe('freezeSnapshot / stripping', () => {
  it('nulls jobId on every node, including nodes that never carried one', () => {
    const doc = build([
      node('image', 'nd_running', '2026-01-01T00:00:00.000Z', { jobId: 'job_running' }),
      node('video', 'nd_idle', '2026-01-01T00:00:01.000Z', { jobId: null }),
      node('style', 'nd_style', '2026-01-01T00:00:02.000Z'),
    ])

    const snapshot = freezeSnapshot(doc, meta)

    expect(snapshot.document.nodes).toHaveLength(3)
    expect(snapshot.document.nodes.every((n) => n.data.jobId === null)).toBe(true)
    // The source keeps its in-flight job; only the public copy is stripped.
    expect(doc.nodes[0].data.jobId).toBe('job_running')
  })

  it('keeps the artifact media but drops the job and library handles it carries', () => {
    const doc = build([
      node('image', 'nd_image', '2026-01-01T00:00:00.000Z', {
        artifacts: [artifact('image', 'https://cdn.test/a.png')],
      }),
    ])

    const [published] = freezeSnapshot(doc, meta).document.nodes
    const [copy] = published.data.artifacts ?? []

    expect(copy.url).toBe('https://cdn.test/a.png')
    expect(copy.thumbnailUrl).toBe('https://cdn.test/a.png#thumb')
    expect(copy.width).toBe(1920)
    expect(copy.modelId).toBe('lib-image-2')
    expect(copy.jobId).toBe('')
    expect(copy.assetId).toBeNull()
  })

  it('sweeps private handles out of the untyped extra bag at every depth', () => {
    const doc = build([
      node('script', 'nd_script', '2026-01-01T00:00:00.000Z', {
        extra: {
          phase: 'shots',
          agentSessionId: 'ses_1',
          shots: [{ title: '开场', jobId: 'job_1', invocationId: 'inv_1' }],
          nested: { sessionId: 'ses_2', keep: 'ok' },
        },
      }),
    ])

    const [published] = freezeSnapshot(doc, meta).document.nodes
    const extra = published.data.extra as {
      phase: string
      agentSessionId?: string
      shots: { title: string; jobId?: string; invocationId?: string }[]
      nested: { sessionId?: string; keep: string }
    }

    expect(extra.phase).toBe('shots')
    expect(extra.agentSessionId).toBeUndefined()
    expect(extra.shots).toEqual([{ title: '开场' }])
    expect(extra.nested).toEqual({ keep: 'ok' })
  })

  it('sweeps the library id an 资产库 node binds itself to', () => {
    const doc = build([
      node('assetLibrary', 'nd_asset', '2026-01-01T00:00:00.000Z', {
        extra: { assetId: 'ast_private', assetKind: 'image' },
      }),
    ])

    const [published] = freezeSnapshot(doc, meta).document.nodes

    // The media class stays — it is what the card renders. The row id does not:
    // it addresses the author's library, which no reader can call.
    expect(published.data.extra).toEqual({ assetKind: 'image' })
  })

  it('keeps in-document node references addressable and blanks private library ids', () => {
    const doc = build([
      node('image', 'nd_image', '2026-01-01T00:00:00.000Z', {
        references: [
          { id: 'ref_1', kind: 'image', origin: 'node', refId: 'nd_other', label: '上游节点' },
          { id: 'ref_2', kind: 'style', origin: 'asset', refId: 'ast_private', label: '风格' },
          { id: 'ref_3', kind: 'image', origin: 'upload', refId: 'upl_private', label: '上传图' },
        ],
      }),
    ])

    const [published] = freezeSnapshot(doc, meta).document.nodes

    expect((published.data.references ?? []).map((r) => r.refId)).toEqual(['nd_other', '', ''])
    // Labels survive: they are the provenance a reader is meant to see.
    expect((published.data.references ?? []).map((r) => r.label)).toEqual(['上游节点', '风格', '上传图'])
  })

  it('preserves graph structure, groups and viewport', () => {
    const a = node('text', 'nd_a', '2026-01-01T00:00:00.000Z', { prompt: '开场白' })
    const b = node('image', 'nd_b', '2026-01-01T00:00:01.000Z')
    const doc = build([a, b], [
      { op: 'addEdge', edge: createEdge(a.id, b.id) },
      { op: 'setViewport', viewport: { x: 12, y: 34, zoom: 0.75 } },
    ])

    const snapshot = freezeSnapshot(doc, meta)

    expect(snapshot.document.edges).toHaveLength(1)
    expect(snapshot.document.edges[0].source).toBe('nd_a')
    expect(snapshot.document.viewport).toEqual({ x: 12, y: 34, zoom: 0.75 })
    expect(snapshot.document.nodes[0].data.prompt).toBe('开场白')
  })
})

describe('freezeSnapshot / deep clone', () => {
  it('does not observe later edits to the source document', () => {
    const source = build([
      node('image', 'nd_image', '2026-01-01T00:00:00.000Z', {
        prompt: '原始提示词',
        artifacts: [artifact('image', 'https://cdn.test/a.png')],
        references: [{ id: 'ref_1', kind: 'image', origin: 'asset', refId: 'ast_1', label: '参考' }],
        extra: { nested: { keep: 'before' } },
      }),
    ])

    const snapshot = freezeSnapshot(source, meta)

    const live = source.nodes[0]
    live.name = '改名后的节点'
    live.data.prompt = '改过的提示词'
    live.data.jobId = 'job_new'
    live.data.artifacts?.push(artifact('image', 'https://cdn.test/b.png'))
    live.data.artifacts![0].url = 'https://cdn.test/mutated.png'
    live.data.references![0].label = '改过的参考'
    ;(live.data.extra as { nested: { keep: string } }).nested.keep = 'after'
    source.nodes.push(node('video', 'nd_late', '2026-01-02T00:00:00.000Z'))
    source.edges.push(createEdge('nd_image', 'nd_late'))
    source.viewport.zoom = 3

    const frozen = snapshot.document.nodes[0]
    expect(snapshot.document.nodes).toHaveLength(1)
    expect(snapshot.document.edges).toHaveLength(0)
    expect(snapshot.document.viewport.zoom).toBe(1)
    expect(frozen.name).toBe('image-nd_image')
    expect(frozen.data.prompt).toBe('原始提示词')
    expect(frozen.data.jobId).toBeNull()
    expect(frozen.data.artifacts).toHaveLength(1)
    expect(frozen.data.artifacts?.[0].url).toBe('https://cdn.test/a.png')
    expect(frozen.data.references?.[0].label).toBe('参考')
    expect((frozen.data.extra as { nested: { keep: string } }).nested.keep).toBe('before')
  })

  it('does not let the snapshot write back into the source document', () => {
    const source = build([
      node('image', 'nd_image', '2026-01-01T00:00:00.000Z', {
        artifacts: [artifact('image', 'https://cdn.test/a.png')],
      }),
    ])

    const snapshot = freezeSnapshot(source, meta)
    snapshot.document.nodes[0].data.prompt = '公开侧被改'
    snapshot.document.nodes[0].data.artifacts![0].url = 'https://cdn.test/public.png'

    expect(source.nodes[0].data.prompt).toBe('')
    expect(source.nodes[0].data.artifacts?.[0].url).toBe('https://cdn.test/a.png')
  })
})

describe('freezeSnapshot / metadata', () => {
  it('fills summary, state and cover from the document when they are not supplied', () => {
    const doc = build([
      node('text', 'nd_text', '2026-01-01T00:00:00.000Z'),
      node('image', 'nd_image', '2026-01-01T00:00:01.000Z', {
        artifacts: [artifact('image', 'https://cdn.test/cover.png')],
      }),
    ])

    const snapshot = freezeSnapshot(doc, { ...meta, coverUrl: null })

    expect(snapshot.summary).toBe('')
    expect(snapshot.state).toBe('listed')
    expect(snapshot.coverUrl).toBe('https://cdn.test/cover.png#thumb')
    expect(snapshot.publishedAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('keeps an explicit cover and leaves a text-only document without one', () => {
    const doc = build([node('text', 'nd_text', '2026-01-01T00:00:00.000Z')])

    expect(freezeSnapshot(doc, { ...meta, coverUrl: 'https://cdn.test/manual.png' }).coverUrl).toBe(
      'https://cdn.test/manual.png',
    )
    expect(freezeSnapshot(doc, meta).coverUrl).toBeNull()
    expect(snapshotCoverUrl(doc)).toBeNull()
  })
})

describe('snapshotIsViewable', () => {
  it('admits listed only, and refuses hidden and revoked', () => {
    const doc = build([node('image', 'nd_image', '2026-01-01T00:00:00.000Z')])
    const seen: Record<SnapshotState, boolean> = { listed: false, hidden: false, revoked: false }

    for (const state of ['listed', 'hidden', 'revoked'] as SnapshotState[]) {
      seen[state] = snapshotIsViewable(freezeSnapshot(doc, { ...meta, state }))
    }

    expect(seen).toEqual({ listed: true, hidden: false, revoked: false })
  })
})

describe('withSnapshotState', () => {
  it('returns a new record and leaves the published one untouched', () => {
    const doc = build([node('image', 'nd_image', '2026-01-01T00:00:00.000Z')])
    const published = freezeSnapshot(doc, meta)

    const revoked = withSnapshotState(published, 'revoked')

    expect(revoked).not.toBe(published)
    expect(published.state).toBe('listed')
    expect(revoked.state).toBe('revoked')
    expect(snapshotIsViewable(published)).toBe(true)
    expect(snapshotIsViewable(revoked)).toBe(false)
    // Everything but the lifecycle flag carries over, including the frozen doc.
    expect(revoked.document).toBe(published.document)
    expect(revoked.id).toBe(published.id)
  })
})

describe('summarizeSnapshot', () => {
  it('drops the document and counts nodes and media', () => {
    const doc = build([
      node('text', 'nd_text', '2026-01-01T00:00:00.000Z'),
      node('image', 'nd_image', '2026-01-01T00:00:01.000Z', {
        artifacts: [artifact('image', 'https://cdn.test/a.png')],
      }),
      node('video', 'nd_video', '2026-01-01T00:00:02.000Z', {
        artifacts: [artifact('video', 'https://cdn.test/b.mp4')],
      }),
    ])

    const summary = summarizeSnapshot(freezeSnapshot(doc, meta))

    expect(summary).not.toHaveProperty('document')
    expect(summary.nodeCount).toBe(3)
    expect(summary.mediaCount).toBe(2)
    expect(summary.title).toBe('公开作品')
  })
})
