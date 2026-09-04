import { newId } from '@/domain/ids'
import {
  freezeSnapshot,
  snapshotIsViewable,
  summarizeSnapshot,
  withSnapshotState,
  type PublishedSnapshot,
  type SnapshotSummary,
} from '@/domain/publish'
import { HttpError } from './http'
import { findCanvas, findProject, readState, withState, type WorkspaceState } from './store'

/*
 * Persistence constraint: `WorkspaceState` is owned by src/server/store.ts and
 * that module is closed to this feature, so published snapshots cannot get a
 * declared field. They live on the very same persisted object under an extra key
 * this module attaches at runtime — `withState` serialises and writes the whole
 * object, so the key survives restarts like any declared field would.
 *
 * The consequence every reader must respect: a workspace.json written before
 * this feature existed (or one reset by `resetStore`) has no such key, so it is
 * optional on read and only materialised on the first publish.
 */
type SnapshotCarrier = WorkspaceState & { publishedSnapshots?: PublishedSnapshot[] }

function readSnapshots(state: WorkspaceState): PublishedSnapshot[] {
  const stored = (state as SnapshotCarrier).publishedSnapshots
  return Array.isArray(stored) ? stored : []
}

function ensureSnapshots(state: WorkspaceState): PublishedSnapshot[] {
  const carrier = state as SnapshotCarrier
  if (!Array.isArray(carrier.publishedSnapshots)) carrier.publishedSnapshots = []
  return carrier.publishedSnapshots
}

/** Public gallery listing, newest first. Non-viewable snapshots never appear. */
export async function listPublishedSnapshots(): Promise<SnapshotSummary[]> {
  const state = await readState()
  return readSnapshots(state)
    .filter(snapshotIsViewable)
    .slice()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map(summarizeSnapshot)
}

/**
 * A revoked or hidden snapshot answers exactly like one that never existed:
 * distinguishing them would turn the public detail route into a probe for
 * works the author took down.
 */
export async function findViewableSnapshot(snapshotId: string): Promise<PublishedSnapshot> {
  const state = await readState()
  const snapshot = readSnapshots(state).find((s) => s.id === snapshotId)
  if (!snapshot || !snapshotIsViewable(snapshot)) throw new HttpError(404, '作品不存在或已下架')
  return snapshot
}

export interface PublishInput {
  canvasId?: string
  title?: string
  summary?: string
}

/** Freeze the canvas's current document into a new, immutable snapshot. */
export async function publishCanvas(input: PublishInput): Promise<PublishedSnapshot> {
  const canvasId = input.canvasId?.trim()
  if (!canvasId) throw new HttpError(400, '需要提供画布 id')

  return withState((state) => {
    const canvas = findCanvas(state, canvasId)
    if (!canvas) throw new HttpError(404, '画布不存在')
    const project = findProject(state, canvas.projectId)
    if (!project) throw new HttpError(404, '项目不存在')
    if (canvas.document.nodes.length === 0) throw new HttpError(400, '空画布不能发布')

    const snapshot = freezeSnapshot(canvas.document, {
      // Own prefix: a snapshot id indexes the public collection and must never
      // be mistaken for the canvas it was frozen from.
      id: newId('pub'),
      projectId: project.id,
      canvasId: canvas.id,
      title: input.title?.trim() || `${project.name} · ${canvas.name}`,
      summary: input.summary?.trim() ?? '',
      coverUrl: project.coverUrl,
      publishedAt: new Date().toISOString(),
    })

    // Append, never replace: an earlier snapshot of the same canvas keeps its
    // own frozen document, so a link handed out yesterday still resolves.
    ensureSnapshots(state).push(snapshot)
    return snapshot
  })
}

/**
 * 下架. Never a hard delete: the record stays as the audit trail of what was
 * once public, it just stops being viewable — which takes effect on the next
 * read because viewability is derived from `state`, not from a cached listing.
 */
export async function revokeSnapshot(snapshotId: string): Promise<PublishedSnapshot> {
  return withState((state) => {
    const snapshots = ensureSnapshots(state)
    const index = snapshots.findIndex((s) => s.id === snapshotId)
    if (index < 0) throw new HttpError(404, '作品不存在')
    const revoked = withSnapshotState(snapshots[index], 'revoked')
    snapshots[index] = revoked
    return revoked
  })
}
