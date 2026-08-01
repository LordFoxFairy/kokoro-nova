import { describe, expect, it } from 'vitest'

import { createEdge, createGroup, createNode, emptyDocument } from '@/domain/factory'
import {
  applyMutations,
  canConvertToStoryboardGroup,
  MutationError,
  wouldCreateCycle,
} from '@/domain/mutations'
import type { Artifact, CanvasMutation, WorkflowDocument, WorkflowNode } from '@/domain/types'

function artifact(kind: Artifact['kind'], url: string): Artifact {
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
  }
}

function withArtifact(node: WorkflowNode, kind: Artifact['kind'], url: string): WorkflowNode {
  return { ...node, data: { ...node.data, artifacts: [artifact(kind, url)] } }
}

function build(nodes: WorkflowNode[], rest: CanvasMutation[] = []): WorkflowDocument {
  return applyMutations(emptyDocument(), [
    ...nodes.map((node): CanvasMutation => ({ op: 'addNode', node })),
    ...rest,
  ])
}

function node(type: WorkflowNode['type'], id: string): WorkflowNode {
  return createNode(type, { x: 0, y: 0 }, [], { id, name: `${type}-${id}` })
}

describe('wouldCreateCycle', () => {
  it('detects self edges and transitive back edges only', () => {
    const a = node('text', 'nd_a')
    const b = node('text', 'nd_b')
    const c = node('text', 'nd_c')
    const doc = build([a, b, c], [
      { op: 'addEdge', edge: createEdge(a.id, b.id) },
      { op: 'addEdge', edge: createEdge(b.id, c.id) },
    ])

    expect(wouldCreateCycle(doc, a.id, a.id)).toBe(true)
    expect(wouldCreateCycle(doc, a.id, c.id)).toBe(false)
    expect(wouldCreateCycle(doc, c.id, a.id)).toBe(true)
    expect(wouldCreateCycle(doc, c.id, b.id)).toBe(true)
  })
})

describe('applyMutations / addEdge', () => {
  it('rejects an edge that would close a cycle and leaves the document untouched', () => {
    const a = node('text', 'nd_a')
    const b = node('text', 'nd_b')
    const c = node('text', 'nd_c')
    const doc = build([a, b, c], [
      { op: 'addEdge', edge: createEdge(a.id, b.id) },
      { op: 'addEdge', edge: createEdge(b.id, c.id) },
    ])

    expect(() => applyMutations(doc, [{ op: 'addEdge', edge: createEdge(c.id, a.id) }])).toThrow(
      MutationError,
    )
    expect(() => applyMutations(doc, [{ op: 'addEdge', edge: createEdge(c.id, a.id) }])).toThrow(
      '该连线会形成循环依赖',
    )
    expect(doc.edges).toHaveLength(2)
  })

  it('rejects a self edge', () => {
    const a = node('text', 'nd_a')
    const doc = build([a])

    expect(() => applyMutations(doc, [{ op: 'addEdge', edge: createEdge(a.id, a.id) }])).toThrow(
      '不能连接节点到自身',
    )
  })

  it('rejects an edge whose media type the target does not accept', () => {
    const audio = node('audio', 'nd_audio')
    const image = node('image', 'nd_image')
    const style = node('style', 'nd_style')
    const doc = build([audio, image, style])

    expect(() => applyMutations(doc, [{ op: 'addEdge', edge: createEdge(audio.id, image.id) }])).toThrow(
      '图片节点不接受音频输入',
    )
    // 风格 nodes are sinks: they declare no accepted input media at all.
    expect(() => applyMutations(doc, [{ op: 'addEdge', edge: createEdge(image.id, style.id) }])).toThrow(
      '风格节点不接受输入',
    )
    // The same source is fine for a target that accepts audio.
    const video = node('video', 'nd_video')
    const ok = applyMutations(build([audio, video]), [
      { op: 'addEdge', edge: createEdge(audio.id, video.id) },
    ])
    expect(ok.edges).toHaveLength(1)
  })

  it('suppresses a duplicate edge between the same endpoint pair', () => {
    const a = node('text', 'nd_a')
    const b = node('image', 'nd_b')
    const first = { ...createEdge(a.id, b.id), id: 'edg_first' }
    const second = { ...createEdge(a.id, b.id), id: 'edg_second' }

    const doc = applyMutations(build([a, b]), [
      { op: 'addEdge', edge: first },
      { op: 'addEdge', edge: second },
    ])

    expect(doc.edges).toHaveLength(1)
    expect(doc.edges[0].id).toBe('edg_first')
  })

  it('rejects an edge pointing at a node that does not exist', () => {
    const a = node('text', 'nd_a')

    expect(() => applyMutations(build([a]), [{ op: 'addEdge', edge: createEdge(a.id, 'nd_ghost') }])).toThrow(
      '节点不存在: nd_ghost',
    )
  })
})

describe('applyMutations / removeNode', () => {
  it('removes the node, its edges, and drops it from its group', () => {
    const a = node('text', 'nd_a')
    const b = node('image', 'nd_b')
    const c = node('image', 'nd_c')
    const group = createGroup('normal', [b.id, c.id])
    const doc = build([a, b, c], [
      { op: 'addEdge', edge: createEdge(a.id, b.id) },
      { op: 'addEdge', edge: createEdge(a.id, c.id) },
      { op: 'addGroup', group },
    ])

    const after = applyMutations(doc, [{ op: 'removeNode', nodeId: b.id }])

    expect(after.nodes.map((n) => n.id)).toEqual([a.id, c.id])
    expect(after.edges.map((e) => [e.source, e.target])).toEqual([[a.id, c.id]])
    expect(after.groups[0].nodeIds).toEqual([c.id])
  })

  it('drops a group that lost its last member', () => {
    const a = node('image', 'nd_a')
    const b = node('image', 'nd_b')
    const group = createGroup('normal', [a.id, b.id])
    const doc = build([a, b], [{ op: 'addGroup', group }])

    const afterFirst = applyMutations(doc, [{ op: 'removeNode', nodeId: a.id }])
    expect(afterFirst.groups).toHaveLength(1)

    const afterSecond = applyMutations(afterFirst, [{ op: 'removeNode', nodeId: b.id }])
    expect(afterSecond.groups).toHaveLength(0)
    expect(afterSecond.nodes).toHaveLength(0)
  })

  it('is a no-op for an unknown node id', () => {
    const a = node('text', 'nd_a')
    const doc = build([a])

    expect(applyMutations(doc, [{ op: 'removeNode', nodeId: 'nd_ghost' }]).nodes).toHaveLength(1)
  })
})

describe('applyMutations / groups', () => {
  it('moves a node out of its previous group when it joins a new one', () => {
    const a = node('image', 'nd_a')
    const b = node('image', 'nd_b')
    const c = node('image', 'nd_c')
    const first = createGroup('normal', [a.id, b.id])
    const second = createGroup('normal', [b.id, c.id])

    const doc = build([a, b, c], [{ op: 'addGroup', group: first }, { op: 'addGroup', group: second }])

    expect(doc.groups.map((g) => g.id)).toEqual([first.id, second.id])
    expect(doc.groups[0].nodeIds).toEqual([a.id])
    expect(doc.groups[1].nodeIds).toEqual([b.id, c.id])
    expect(doc.nodes.map((n) => n.groupId)).toEqual([first.id, second.id, second.id])
  })

  it('drops a group emptied by the new group taking all of its members', () => {
    const a = node('image', 'nd_a')
    const b = node('image', 'nd_b')
    const first = createGroup('normal', [a.id])
    const second = createGroup('normal', [a.id, b.id])

    const doc = build([a, b], [{ op: 'addGroup', group: first }, { op: 'addGroup', group: second }])

    expect(doc.groups.map((g) => g.id)).toEqual([second.id])
  })

  it('rejects a group referencing an unknown node', () => {
    const a = node('image', 'nd_a')

    expect(() =>
      applyMutations(build([a]), [{ op: 'addGroup', group: createGroup('normal', [a.id, 'nd_ghost']) }]),
    ).toThrow('节点不存在: nd_ghost')
  })

  it('removeGroup with deleteNodes: false keeps the nodes and clears their membership', () => {
    const a = node('image', 'nd_a')
    const b = node('image', 'nd_b')
    const group = createGroup('normal', [a.id, b.id])
    const doc = build([a, b], [
      { op: 'addEdge', edge: createEdge(a.id, b.id) },
      { op: 'addGroup', group },
    ])

    const after = applyMutations(doc, [{ op: 'removeGroup', groupId: group.id, deleteNodes: false }])

    expect(after.groups).toHaveLength(0)
    expect(after.nodes.map((n) => n.id)).toEqual([a.id, b.id])
    expect(after.nodes.map((n) => n.groupId)).toEqual([null, null])
    expect(after.edges).toHaveLength(1)
  })

  it('removeGroup with deleteNodes: true removes members and every edge touching them', () => {
    const outside = node('text', 'nd_outside')
    const a = node('image', 'nd_a')
    const b = node('image', 'nd_b')
    const group = createGroup('normal', [a.id, b.id])
    const doc = build([outside, a, b], [
      { op: 'addEdge', edge: createEdge(outside.id, a.id) },
      { op: 'addEdge', edge: createEdge(a.id, b.id) },
      { op: 'addGroup', group },
    ])

    const after = applyMutations(doc, [{ op: 'removeGroup', groupId: group.id, deleteNodes: true }])

    expect(after.nodes.map((n) => n.id)).toEqual([outside.id])
    expect(after.edges).toHaveLength(0)
    expect(after.groups).toHaveLength(0)
  })
})

describe('canConvertToStoryboardGroup', () => {
  it('is false while the members have no image artifacts', () => {
    const a = node('image', 'nd_a')
    const b = node('image', 'nd_b')
    const group = createGroup('normal', [a.id, b.id])
    const doc = build([a, b], [{ op: 'addGroup', group }])

    expect(canConvertToStoryboardGroup(doc, group.id)).toEqual({
      ok: false,
      reason: '组内需要至少两个已生成的图片产物',
    })
  })

  it('stays false when only one member owns an image artifact', () => {
    const a = withArtifact(node('image', 'nd_a'), 'image', 'https://cdn.test/a.png')
    const b = node('image', 'nd_b')
    const group = createGroup('normal', [a.id, b.id])
    const doc = build([a, b], [{ op: 'addGroup', group }])

    expect(canConvertToStoryboardGroup(doc, group.id).ok).toBe(false)
  })

  it('ignores non-image artifacts', () => {
    const a = withArtifact(node('video', 'nd_a'), 'video', 'https://cdn.test/a.mp4')
    const b = withArtifact(node('video', 'nd_b'), 'video', 'https://cdn.test/b.mp4')
    const group = createGroup('normal', [a.id, b.id])
    const doc = build([a, b], [{ op: 'addGroup', group }])

    expect(canConvertToStoryboardGroup(doc, group.id).ok).toBe(false)
  })

  it('is true once at least two members own image artifacts', () => {
    const a = withArtifact(node('image', 'nd_a'), 'image', 'https://cdn.test/a.png')
    const b = withArtifact(node('image', 'nd_b'), 'image', 'https://cdn.test/b.png')
    const group = createGroup('normal', [a.id, b.id])
    const doc = build([a, b], [{ op: 'addGroup', group }])

    expect(canConvertToStoryboardGroup(doc, group.id)).toEqual({ ok: true })
  })

  it('rejects unknown groups, single-member groups and existing storyboard groups', () => {
    const a = withArtifact(node('image', 'nd_a'), 'image', 'https://cdn.test/a.png')
    const b = withArtifact(node('image', 'nd_b'), 'image', 'https://cdn.test/b.png')
    const lonely = createGroup('normal', [a.id])
    const storyboard = createGroup('storyboard', [b.id])
    const doc = build([a, b], [
      { op: 'addGroup', group: lonely },
      { op: 'addGroup', group: storyboard },
    ])

    expect(canConvertToStoryboardGroup(doc, 'grp_ghost')).toEqual({ ok: false, reason: '分组不存在' })
    expect(canConvertToStoryboardGroup(doc, lonely.id)).toEqual({ ok: false, reason: '至少需要两个节点' })
    expect(canConvertToStoryboardGroup(doc, storyboard.id)).toEqual({ ok: false, reason: '已经是分镜组' })
  })
})

describe('applyMutations / misc ops', () => {
  it('does not mutate the input document', () => {
    const a = node('text', 'nd_a')
    const before = build([a])
    const snapshot = JSON.stringify(before)

    applyMutations(before, [{ op: 'removeNode', nodeId: a.id }])

    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('updateNode applies the patch but keeps the id', () => {
    const a = node('text', 'nd_a')
    const doc = applyMutations(build([a]), [
      { op: 'updateNode', nodeId: a.id, patch: { name: '改名后', position: { x: 40, y: 80 } } },
    ])

    expect(doc.nodes[0].id).toBe('nd_a')
    expect(doc.nodes[0].name).toBe('改名后')
    expect(doc.nodes[0].position).toEqual({ x: 40, y: 80 })
  })

  it('removeEdge drops the edge by id and setViewport replaces the viewport', () => {
    const a = node('text', 'nd_a')
    const b = node('image', 'nd_b')
    const edge = createEdge(a.id, b.id)
    const doc = applyMutations(build([a, b], [{ op: 'addEdge', edge }]), [
      { op: 'removeEdge', edgeId: edge.id },
      { op: 'setViewport', viewport: { x: 12, y: -8, zoom: 0.75 } },
    ])

    expect(doc.edges).toHaveLength(0)
    expect(doc.viewport).toEqual({ x: 12, y: -8, zoom: 0.75 })
  })
})
