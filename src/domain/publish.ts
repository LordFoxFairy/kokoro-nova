import type { Artifact, NodeData, NodeReference, WorkflowDocument, WorkflowNode } from './types'

/**
 * Publishing model.
 *
 * A published snapshot is a frozen *copy* of a workflow document, never a view
 * onto the live canvas: the author keeps editing after publishing, and a public
 * page that changed under the reader would make the two surfaces disagree about
 * what was published.
 *
 * That is why every field is `readonly`. A snapshot is never edited in place:
 * publishing again mints a new one, and a lifecycle change (下架) goes through
 * `withSnapshotState`, which returns a new record and leaves the old one intact
 * so the audit trail survives.
 */

export type SnapshotState = 'listed' | 'hidden' | 'revoked'

export interface PublishedSnapshot {
  readonly id: string
  readonly projectId: string
  readonly canvasId: string
  readonly title: string
  readonly summary: string
  readonly coverUrl: string | null
  readonly publishedAt: string
  readonly state: SnapshotState
  /** The document as it stood at publish time, stripped of private handles. */
  readonly document: WorkflowDocument
}

/** Listing row: the same record minus the document, which no gallery card reads. */
export type SnapshotSummary = Omit<PublishedSnapshot, 'document'> & {
  readonly nodeCount: number
  /** Nodes that carry at least one artifact — what a reader actually gets to see. */
  readonly mediaCount: number
}

export interface SnapshotMeta {
  id: string
  projectId: string
  canvasId: string
  title: string
  summary?: string
  /** Absent or null derives a cover from the first visible artifact instead. */
  coverUrl?: string | null
  publishedAt?: string
  state?: SnapshotState
}

/**
 * `NodeData.extra` is an untyped bag that every node type fills with its own
 * shape, so a publish step cannot enumerate it per type. Sweeping by key name at
 * every depth instead keeps a future writer from leaking a private handle into
 * the public copy just by stashing it in `extra`.
 */
const PRIVATE_HANDLE_KEYS = new Set([
  'jobId',
  'pendingJobId',
  'runningJobId',
  'invocationId',
  'agentSessionId',
  'agentMessageId',
  'sessionId',
  'messageId',
  // An 资产库 node stores the library row it is bound to as `extra.assetId`, the
  // same private handle that is nulled on artifacts and blanked on references.
  'assetId',
])

function stripPrivateHandles(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPrivateHandles)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (PRIVATE_HANDLE_KEYS.has(key)) continue
      out[key] = stripPrivateHandles(inner)
    }
    return out
  }
  return value
}

/**
 * Artifacts are the visible result, so the media itself crosses the boundary —
 * but the job that produced it and the library row it was registered as are
 * private objects a reader has no endpoint for.
 */
function publicArtifact(artifact: Artifact): Artifact {
  return { ...artifact, jobId: '', assetId: null }
}

function publicReference(reference: NodeReference): NodeReference {
  // A node reference resolves inside the published document itself, so it stays
  // addressable. An asset or upload id points at a row in the author's private
  // library; only its label and thumbnail are meaningful in public.
  return reference.origin === 'node' ? reference : { ...reference, refId: '' }
}

function publicNode(node: WorkflowNode): WorkflowNode {
  // `jobId` is set unconditionally, not merely cleared when present: a reader
  // must never see a node that looks like it still has work in flight.
  const data: NodeData = { ...node.data, jobId: null }
  if (node.data.artifacts) data.artifacts = node.data.artifacts.map(publicArtifact)
  if (node.data.references) data.references = node.data.references.map(publicReference)
  if (node.data.extra) data.extra = stripPrivateHandles(node.data.extra) as Record<string, unknown>
  return { ...node, data }
}

/** Nodes in the order the storyboard shows them, so the cover matches card one. */
function orderedNodes(document: WorkflowDocument): WorkflowNode[] {
  return [...document.nodes].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
}

/** First artifact that can stand in as a poster; null for a text-only document. */
export function snapshotCoverUrl(document: WorkflowDocument): string | null {
  for (const node of orderedNodes(document)) {
    for (const artifact of node.data.artifacts ?? []) {
      if (artifact.kind !== 'image' && artifact.kind !== 'video') continue
      const url = artifact.thumbnailUrl ?? (artifact.kind === 'image' ? artifact.url : null)
      if (url) return url
    }
  }
  return null
}

/**
 * Deep-clone the document and strip everything that must not become public.
 *
 * The clone is what actually decouples the snapshot from the canvas: later edits
 * to the source document reach nothing inside the returned record.
 */
export function freezeSnapshot(document: WorkflowDocument, meta: SnapshotMeta): PublishedSnapshot {
  const clone = JSON.parse(JSON.stringify(document)) as WorkflowDocument
  const frozen: WorkflowDocument = { ...clone, nodes: clone.nodes.map(publicNode) }

  return {
    id: meta.id,
    projectId: meta.projectId,
    canvasId: meta.canvasId,
    title: meta.title,
    summary: meta.summary ?? '',
    coverUrl: meta.coverUrl ?? snapshotCoverUrl(frozen),
    publishedAt: meta.publishedAt ?? new Date().toISOString(),
    state: meta.state ?? 'listed',
    document: frozen,
  }
}

/**
 * Only a listed snapshot is viewable. `hidden` is not "unlisted but reachable":
 * there is no capability token that would tell a reader who was given the link
 * apart from one who guessed the id, so hiding has to mean hiding.
 */
export function snapshotIsViewable(snapshot: Pick<PublishedSnapshot, 'state'>): boolean {
  return snapshot.state === 'listed'
}

/** Lifecycle transition. Returns a new record — snapshots are never mutated. */
export function withSnapshotState(
  snapshot: PublishedSnapshot,
  state: SnapshotState,
): PublishedSnapshot {
  return { ...snapshot, state }
}

export function summarizeSnapshot(snapshot: PublishedSnapshot): SnapshotSummary {
  const { document, ...rest } = snapshot
  return {
    ...rest,
    nodeCount: document.nodes.length,
    mediaCount: document.nodes.filter((n) => (n.data.artifacts ?? []).length > 0).length,
  }
}
