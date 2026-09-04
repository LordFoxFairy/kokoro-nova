import { NODE_META } from './nodes'
import type { WorkflowDocument, WorkflowNode, Artifact, NodeReference } from './types'

/**
 * Storyboard is a *projection* of the same workflow document, not a separate
 * persisted file. Switching views must never lose graph structure, so this
 * module is pure and derives everything from the document.
 */

export type StoryboardColumnId = 'audio' | 'text' | 'image' | 'video'

export type VideoFilter = 'all' | 'final' | 'clip'

export interface StoryboardCard {
  nodeId: string
  nodeName: string
  nodeType: WorkflowNode['type']
  column: StoryboardColumnId
  /** null while the node has no artifact — rendered as 待确认后生成. */
  artifact: Artifact | null
  /** Every artifact, used by the expanded thumbnail grid. */
  artifacts: Artifact[]
  modelLabel: string | null
  /** Nodes and dropped assets that fed this card. */
  references: StoryboardReference[]
  /** Video only: 成片 vs 片段. */
  videoKind: 'final' | 'clip' | null
  pending: boolean
  /** Requested output ratio, retained even while the node is still pending. */
  aspectRatio: string | null
  /** Ratio measured from the resource metadata, not from the storyboard cell. */
  resourceAspectRatio: string | null
  /** Original provider-reported dimensions; never replaced by display sizing. */
  originalDimensions: { width: number; height: number } | null
  dimensions: string | null
  durationLabel: string | null
  /** Inline Text artifact copy, when the provider returned one. */
  textContent?: string | null
}

export interface StoryboardReference {
  id: string
  label: string
  kind: NodeReference['kind']
  origin: NodeReference['origin']
  refId: string
  thumbnailUrl: string | null
}

export interface StoryboardProjection {
  audio: StoryboardCard[]
  text: StoryboardCard[]
  image: StoryboardCard[]
  video: StoryboardCard[]
  /** True when no valid node projects into a storyboard column. */
  isEmpty: boolean
}

function dimensionsLabel(artifact: Artifact | null): string | null {
  if (artifact?.width == null || artifact.height == null) return null
  return `${artifact.width} × ${artifact.height}`
}

function originalDimensions(artifact: Artifact | null): { width: number; height: number } | null {
  if (artifact?.width == null || artifact.height == null) return null
  return { width: artifact.width, height: artifact.height }
}

function resourceAspectRatio(artifact: Artifact | null): string | null {
  const width = artifact?.width
  const height = artifact?.height
  if (width == null || height == null || width <= 0 || height <= 0) return null

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
}

function durationLabel(artifact: Artifact | null): string | null {
  if (!artifact?.durationSeconds) return null
  return `${artifact.durationSeconds} 秒`
}

function referencesOf(doc: WorkflowDocument, node: WorkflowNode): StoryboardReference[] {
  const refs: StoryboardReference[] = []

  // Graph edges are the primary provenance: 参考元素 traces back to the source node.
  for (const edge of doc.edges.filter((e) => e.target === node.id)) {
    const source = doc.nodes.find((n) => n.id === edge.source)
    const sourceMeta = source ? NODE_META[source.type] : undefined
    if (!source || !sourceMeta) continue
    const artifact = (source.data.artifacts ?? [])[0] ?? null
    refs.push({
      id: `edge:${edge.id}`,
      label: source.name,
      kind: (sourceMeta.produces ?? 'text') as NodeReference['kind'],
      origin: 'node',
      refId: source.id,
      thumbnailUrl: artifact?.thumbnailUrl ?? null,
    })
  }

  for (const ref of node.data.references ?? []) {
    if (ref.origin === 'node') continue
    refs.push({
      id: `ref:${ref.id}`,
      label: ref.label,
      kind: ref.kind,
      origin: ref.origin,
      refId: ref.refId,
      thumbnailUrl: ref.thumbnailUrl ?? null,
    })
  }

  return refs
}

/**
 * A video is 成片 when it comes from a composite node (or from a video node
 * whose upstream already contains video), otherwise it is a 片段. This keeps
 * "filter type" and "job status" as two independent dimensions, matching the
 * observed behaviour where both generated and pending videos land in 片段.
 */
function videoKindOf(doc: WorkflowDocument, node: WorkflowNode): 'final' | 'clip' {
  if (node.type === 'videoComposite') return 'final'
  const upstreamVideo = doc.edges
    .filter((e) => e.target === node.id)
    .some((e) => {
      const source = doc.nodes.find((n) => n.id === e.source)
      return source ? source.type === 'video' || source.type === 'videoComposite' : false
    })
  return upstreamVideo ? 'final' : 'clip'
}

export function projectStoryboard(
  doc: WorkflowDocument,
  modelLabelOf: (modelId: string | undefined) => string | null,
): StoryboardProjection {
  const projection: StoryboardProjection = { audio: [], text: [], image: [], video: [], isEmpty: true }

  // Stable ordering: creation order, so cards do not jump between renders.
  const ordered = [...doc.nodes].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))

  for (const node of ordered) {
    // Persisted documents can outlive a node type/schema revision. Invalid
    // nodes are not projectable and must not make the projection throw.
    const meta = NODE_META[node.type]
    const column = meta?.storyboardColumn
    if (!column) continue

    const artifacts = node.data.artifacts ?? []
    const artifact = artifacts[0] ?? null

    projection[column].push({
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      column,
      artifact,
      artifacts,
      modelLabel: modelLabelOf(node.data.modelId),
      references: referencesOf(doc, node),
      videoKind: column === 'video' ? videoKindOf(doc, node) : null,
      pending: artifacts.length === 0,
      aspectRatio: node.data.output?.aspectRatio ?? null,
      resourceAspectRatio: resourceAspectRatio(artifact),
      originalDimensions: originalDimensions(artifact),
      dimensions: dimensionsLabel(artifact),
      durationLabel: durationLabel(artifact),
      textContent: artifact?.kind === 'text' ? (artifact.textContent ?? null) : null,
    })
    projection.isEmpty = false
  }

  return projection
}

export type StoryboardExpandedColumn = 'image' | 'video' | null

/**
 * Reconcile view-only expansion against the current projection. A node can be
 * deleted or become invalid while the view state still says it is expanded;
 * returning null makes that stale state explicit without persisting UI state
 * in the workflow document.
 */
export function reconcileStoryboardExpandedColumn(
  expanded: unknown,
  projection: Pick<StoryboardProjection, 'image' | 'video'>,
): StoryboardExpandedColumn {
  if (expanded !== 'image' && expanded !== 'video') return null
  return projection[expanded].length > 0 ? expanded : null
}

export function filterVideoCards(cards: StoryboardCard[], filter: VideoFilter): StoryboardCard[] {
  if (filter === 'all') return cards
  return cards.filter((c) => c.videoKind === filter)
}

export const VIDEO_FILTER_LABELS: Record<VideoFilter, string> = {
  all: '全部',
  final: '成片',
  clip: '片段',
}
