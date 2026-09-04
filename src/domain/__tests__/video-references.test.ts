import { describe, expect, it } from 'vitest'

import { createEdge, createNode, emptyDocument } from '@/domain/factory'
import { CAMERA_MOVES } from '@/domain/libraries'
import { applyMutations, MutationError } from '@/domain/mutations'
import type { CanvasMutation, WorkflowDocument, WorkflowNode } from '@/domain/types'
import {
  incomingVideoReferenceEdges,
  orderedVideoReferences,
  pruneVideoReferenceExtras,
  referenceKindForNode,
  toggleVideoReference,
  videoReferenceCandidates,
  videoReferenceLabel,
} from '@/domain/video-references'

function node(type: WorkflowNode['type'], id: string): WorkflowNode {
  return createNode(type, { x: 0, y: 0 }, [], { id, name: `${type}-${id}` })
}

function build(nodes: WorkflowNode[], mutations: CanvasMutation[] = []): WorkflowDocument {
  return applyMutations(emptyDocument(), [
    ...nodes.map((item): CanvasMutation => ({ op: 'addNode', node: item })),
    ...mutations,
  ])
}

describe('videoReferenceCandidates', () => {
  it('uses the persisted kind for polymorphic asset-library candidates and keeps dangling edges inspectable', () => {
    const library = node('assetLibrary', 'nd_library')
    library.data.extra = { assetKind: 'image' }
    const target = node('video', 'nd_video')
    const doc = build([library, target], [{ op: 'addEdge', edge: createEdge(library.id, target.id) }])
    const malformed = {
      ...doc,
      edges: [...doc.edges, { ...createEdge('nd_missing', target.id), id: 'edg_dangling' }],
    }

    expect(referenceKindForNode(library)).toBe('image')
    expect(videoReferenceCandidates(doc, target.id).find((item) => item.node.id === library.id)).toMatchObject({
      selected: true,
      selectable: true,
    })
    expect(incomingVideoReferenceEdges(malformed, target.id).map(({ edge, node: source }) => ({
      id: edge.id,
      source: source?.id ?? null,
    }))).toEqual([
      { id: doc.edges[0].id, source: library.id },
      { id: 'edg_dangling', source: null },
    ])
  })

  it('preserves document order and distinguishes selected, valid and cyclic candidates', () => {
    const text = node('text', 'nd_text')
    const image = node('image', 'nd_image')
    const target = node('video', 'nd_video')
    const downstream = node('videoComposite', 'nd_composite')
    const doc = build([text, image, target, downstream], [
      { op: 'addEdge', edge: { ...createEdge(image.id, target.id), id: 'edg_image_video' } },
      { op: 'addEdge', edge: { ...createEdge(target.id, downstream.id), id: 'edg_video_composite' } },
    ])

    expect(
      videoReferenceCandidates(doc, target.id).map(({ node: item, selected, selectable, reason, edgeId }) => ({
        id: item.id,
        selected,
        selectable,
        reason,
        edgeId,
      })),
    ).toEqual([
      { id: text.id, selected: false, selectable: true, reason: null, edgeId: null },
      { id: image.id, selected: true, selectable: true, reason: null, edgeId: 'edg_image_video' },
      {
        id: downstream.id,
        selected: false,
        selectable: false,
        reason: '该连线会形成循环依赖',
        edgeId: null,
      },
    ])
  })

  it('reports incompatible media without exposing the target as its own candidate', () => {
    const image = node('image', 'nd_image')
    const audio = node('audio', 'nd_audio')
    const target = node('image', 'nd_target')
    const doc = build([image, audio, target])

    const candidates = videoReferenceCandidates(doc, target.id)
    expect(candidates.map((item) => item.node.id)).toEqual([image.id, audio.id])
    expect(candidates[0]).toMatchObject({ selectable: true, reason: null })
    expect(candidates[1]).toMatchObject({ selectable: false, reason: '图片节点不接受音频输入' })
  })
})

describe('toggleVideoReference', () => {
  it('removes the exact existing edge and adds a new valid edge', () => {
    const image = node('image', 'nd_image')
    const text = node('text', 'nd_text')
    const target = node('video', 'nd_video')
    const doc = build([image, text, target], [
      { op: 'addEdge', edge: { ...createEdge(image.id, target.id), id: 'edg_selected' } },
    ])

    expect(toggleVideoReference(doc, target.id, image.id)).toEqual([{ op: 'removeEdge', edgeId: 'edg_selected' }])
    expect(toggleVideoReference(doc, target.id, text.id)).toMatchObject([
      { op: 'addEdge', edge: { source: text.id, target: target.id } },
    ])
  })

  it('rejects self, incompatible and cyclic references with reducer-compatible errors', () => {
    const audio = node('audio', 'nd_audio')
    const imageTarget = node('image', 'nd_image_target')
    const incompatible = build([audio, imageTarget])

    const target = node('video', 'nd_target')
    const downstream = node('video', 'nd_downstream')
    const doc = build([target, downstream], [
      { op: 'addEdge', edge: createEdge(target.id, downstream.id) },
    ])

    expect(() => toggleVideoReference(doc, target.id, target.id)).toThrow('不能连接节点到自身')
    expect(() => toggleVideoReference(incompatible, imageTarget.id, audio.id)).toThrow('图片节点不接受音频输入')
    expect(() => toggleVideoReference(doc, target.id, downstream.id)).toThrow('该连线会形成循环依赖')
    expect(() => toggleVideoReference(doc, target.id, 'nd_missing')).toThrow(MutationError)
  })
})

describe('orderedVideoReferences and prompt metadata', () => {
  it('numbers references by edge insertion order and assigns media-specific labels', () => {
    const text = node('text', 'nd_text')
    const image = node('image', 'nd_image')
    const audio = node('audio', 'nd_audio')
    const effect = node('effect', 'nd_effect')
    const target = node('video', 'nd_video')
    const doc = build([text, image, audio, effect, target], [
      { op: 'addEdge', edge: createEdge(audio.id, target.id) },
      { op: 'addEdge', edge: createEdge(image.id, target.id) },
      { op: 'addEdge', edge: createEdge(text.id, target.id) },
      { op: 'addEdge', edge: createEdge(effect.id, target.id) },
    ])

    const ordered = orderedVideoReferences(doc, target.id)
    expect(ordered.map((item) => item.node.id)).toEqual([audio.id, image.id, text.id, effect.id])
    expect(ordered.map((item, index) => videoReferenceLabel(item.node, index))).toEqual([
      '音频 1',
      '图片 2',
      '文本 3',
      '特效 4',
    ])
  })

  it('prunes mentions and element marks belonging to a removed source only', () => {
    const extra = {
      untouched: true,
      videoMentions: [
        { id: 'mention-1', nodeId: 'nd_a', label: '图片 1', ordinal: 1 },
        { id: 'mention-2', nodeId: 'nd_b', label: '图片 2', ordinal: 2 },
      ],
      elementMarks: [
        { id: 'mark-1', nodeId: 'nd_a', x: 0.2, y: 0.2, width: 0.3, height: 0.4, label: '元素 1' },
        { id: 'mark-2', nodeId: 'nd_b', x: 0.1, y: 0.1, width: 0.2, height: 0.2, label: '元素 2' },
      ],
    }

    expect(pruneVideoReferenceExtras(extra, 'nd_a')).toEqual({
      untouched: true,
      videoMentions: [{ id: 'mention-2', nodeId: 'nd_b', label: '图片 2', ordinal: 2 }],
      elementMarks: [
        { id: 'mark-2', nodeId: 'nd_b', x: 0.1, y: 0.1, width: 0.2, height: 0.2, label: '元素 2' },
      ],
    })
  })
})

describe('official camera move fixture', () => {
  it('contains the 23 observed moves in stable order with unique local preview metadata', () => {
    expect(CAMERA_MOVES.map((move) => move.name)).toEqual([
      '固定镜头',
      '跟随拍摄',
      '盘旋抬升',
      '盘旋下降',
      '镜头上摇',
      '镜头下摇',
      '镜头左摇',
      '镜头右摇',
      '镜头上升',
      '镜头下降',
      '镜头左移',
      '镜头右移',
      '镜头前推',
      '镜头后移',
      '变焦推进',
      '变焦拉远',
      '柯克变焦',
      '环绕拍摄',
      '滚筒旋转',
      '第一视角',
      '无人机',
      '高空航拍',
      '手持拍摄',
    ])
    expect(new Set(CAMERA_MOVES.map((move) => move.id)).size).toBe(23)
    expect(CAMERA_MOVES.every((move) => Number.isFinite(move.hue) && move.previewVariant.length > 0)).toBe(true)
  })
})
