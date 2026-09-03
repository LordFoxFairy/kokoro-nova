import { createEdge } from './factory'
import { MutationError, wouldCreateCycle } from './mutations'
import { canConnect, MEDIA_OF_NODE } from './nodes'
import type { CanvasMutation, WorkflowDocument, WorkflowNode } from './types'

export interface VideoReferenceCandidate {
  node: WorkflowNode
  selected: boolean
  selectable: boolean
  reason: string | null
  edgeId: string | null
}

export interface OrderedVideoReference {
  edgeId: string
  node: WorkflowNode
}

export interface VideoReferenceMention {
  id: string
  nodeId: string
  label: string
  ordinal: number
}

export interface VideoElementMark {
  id: string
  nodeId: string
  x: number
  y: number
  width: number
  height: number
  label: string
}

function getNode(document: WorkflowDocument, nodeId: string): WorkflowNode {
  const node = document.nodes.find((item) => item.id === nodeId)
  if (!node) throw new MutationError(`节点不存在: ${nodeId}`)
  return node
}

/**
 * Computes every possible source relative to one target. Existing connections
 * remain selectable even if later registry changes would make a fresh edge
 * invalid, because the user must always be able to remove persisted data.
 */
export function videoReferenceCandidates(
  document: WorkflowDocument,
  targetNodeId: string,
): VideoReferenceCandidate[] {
  const target = getNode(document, targetNodeId)

  return document.nodes
    .filter((node) => node.id !== targetNodeId)
    .map((node) => {
      const existing = document.edges.find(
        (edge) => edge.source === node.id && edge.target === targetNodeId,
      )
      if (existing) {
        return {
          node,
          selected: true,
          selectable: true,
          reason: null,
          edgeId: existing.id,
        }
      }

      const connection = canConnect(
        node.type,
        target.type,
        (node.data.extra?.assetKind as 'image' | 'video' | 'audio' | undefined) ?? null,
      )
      if (!connection.ok) {
        return {
          node,
          selected: false,
          selectable: false,
          reason: connection.reason,
          edgeId: null,
        }
      }

      if (wouldCreateCycle(document, node.id, targetNodeId)) {
        return {
          node,
          selected: false,
          selectable: false,
          reason: '该连线会形成循环依赖',
          edgeId: null,
        }
      }

      return {
        node,
        selected: false,
        selectable: true,
        reason: null,
        edgeId: null,
      }
    })
}

/** Returns a single add/remove mutation. The reducer performs the same checks. */
export function toggleVideoReference(
  document: WorkflowDocument,
  targetNodeId: string,
  sourceNodeId: string,
): CanvasMutation[] {
  if (sourceNodeId === targetNodeId) throw new MutationError('不能连接节点到自身')

  getNode(document, targetNodeId)
  getNode(document, sourceNodeId)
  const candidate = videoReferenceCandidates(document, targetNodeId).find(
    (item) => item.node.id === sourceNodeId,
  )
  if (!candidate) throw new MutationError(`节点不存在: ${sourceNodeId}`)

  if (candidate.selected && candidate.edgeId) {
    return [{ op: 'removeEdge', edgeId: candidate.edgeId }]
  }
  if (!candidate.selectable) throw new MutationError(candidate.reason ?? '该节点不可作为参考')

  return [{ op: 'addEdge', edge: createEdge(sourceNodeId, targetNodeId) }]
}

/** Reference-card order is selection/edge order, matching the visible ordinals. */
export function orderedVideoReferences(
  document: WorkflowDocument,
  targetNodeId: string,
): OrderedVideoReference[] {
  return document.edges
    .filter((edge) => edge.target === targetNodeId)
    .map((edge) => {
      const node = document.nodes.find((item) => item.id === edge.source)
      return node ? { edgeId: edge.id, node } : null
    })
    .filter((item): item is OrderedVideoReference => item !== null)
}

/** Human-readable token used by the rich prompt composer. */
export function videoReferenceLabel(node: WorkflowNode, index: number): string {
  const media =
    node.type === 'assetLibrary'
      ? ((node.data.extra?.assetKind as 'image' | 'video' | 'audio' | undefined) ?? null)
      : MEDIA_OF_NODE[node.type]
  const labels: Record<string, string> = {
    text: '文本',
    image: '图片',
    video: '视频',
    audio: '音频',
    style: '风格',
    effect: '特效',
  }
  const label = labels[media ?? ''] ?? '素材'
  return `${label} ${index + 1}`
}

function belongsToSource(value: unknown, sourceNodeId: string): boolean {
  return Boolean(value && typeof value === 'object' && 'nodeId' in value && value.nodeId === sourceNodeId)
}

/** Removes prompt/segmentation metadata when its graph reference disappears. */
export function pruneVideoReferenceExtras(
  extra: Record<string, unknown> | undefined,
  sourceNodeId: string,
): Record<string, unknown> {
  const next = { ...(extra ?? {}) }
  if (Array.isArray(next.videoMentions)) {
    next.videoMentions = next.videoMentions.filter((item) => !belongsToSource(item, sourceNodeId))
  }
  if (Array.isArray(next.elementMarks)) {
    next.elementMarks = next.elementMarks.filter((item) => !belongsToSource(item, sourceNodeId))
  }
  return next
}

export function readVideoMentions(extra: Record<string, unknown> | undefined): VideoReferenceMention[] {
  if (!Array.isArray(extra?.videoMentions)) return []
  return extra.videoMentions.filter((item): item is VideoReferenceMention => {
    if (!item || typeof item !== 'object') return false
    const mention = item as Partial<VideoReferenceMention>
    return (
      typeof mention.id === 'string' &&
      typeof mention.nodeId === 'string' &&
      typeof mention.label === 'string' &&
      typeof mention.ordinal === 'number'
    )
  })
}

export function readVideoElementMarks(extra: Record<string, unknown> | undefined): VideoElementMark[] {
  if (!Array.isArray(extra?.elementMarks)) return []
  return extra.elementMarks.filter((item): item is VideoElementMark => {
    if (!item || typeof item !== 'object') return false
    const mark = item as Partial<VideoElementMark>
    return (
      typeof mark.id === 'string' &&
      typeof mark.nodeId === 'string' &&
      typeof mark.label === 'string' &&
      typeof mark.x === 'number' &&
      typeof mark.y === 'number' &&
      typeof mark.width === 'number' &&
      typeof mark.height === 'number'
    )
  })
}
