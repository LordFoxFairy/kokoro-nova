import type { ShowcaseDetailResponse, ShowcaseEntryProjection, ShowcaseMedia } from '@/contracts/showcase'
import type { Artifact } from '@/domain/types'
import { HttpError } from './http'
import { findViewableSnapshot as findSnapshotRecord, listPublishedSnapshots } from './publish'
import { SHOWCASE_DISCOVERY_CATALOG, findShowcaseFixtureSnapshot } from '@/mocks/showcase'
import type { PublishedSnapshot, SnapshotSummary } from '@/domain/publish'
import { readState, type WorkspaceState } from './store'

type SnapshotCarrier = WorkspaceState & { publishedSnapshots?: PublishedSnapshot[] }

function firstVideo(snapshot: PublishedSnapshot | SnapshotSummary): Artifact | null {
  if (!('document' in snapshot)) return null
  for (const node of snapshot.document.nodes) {
    const artifact = (node.data.artifacts ?? []).find((item) => item.kind === 'video')
    if (artifact) return artifact
  }
  return null
}

function mediaFor(snapshot: PublishedSnapshot | SnapshotSummary): ShowcaseMedia {
  const artifact = firstVideo(snapshot)
  return {
    url: artifact?.url ?? null,
    posterUrl: artifact?.thumbnailUrl ?? snapshot.coverUrl,
    durationSeconds: artifact?.durationSeconds ?? 0,
    width: artifact?.width ?? 16,
    height: artifact?.height ?? 9,
    originalQualityLabel: artifact ? `${artifact.height}p 原画质` : '原画质',
  }
}

function entryFor(snapshot: PublishedSnapshot | SnapshotSummary): ShowcaseEntryProjection {
  const fixture = SHOWCASE_DISCOVERY_CATALOG.find((entry) => entry.snapshotId === snapshot.id)
  const media = mediaFor(snapshot)
  const mediaCount = 'mediaCount' in snapshot ? snapshot.mediaCount : snapshot.document.nodes.filter((node) => (node.data.artifacts ?? []).length > 0).length
  if (fixture) {
    return {
      ...fixture,
      title: snapshot.title,
      summary: snapshot.summary,
      coverUrl: snapshot.coverUrl ?? fixture.coverUrl,
      publishedAt: snapshot.publishedAt,
      nodeCount: 'nodeCount' in snapshot ? snapshot.nodeCount : snapshot.document.nodes.length,
      mediaCount,
      media: media.url ? media : fixture.media,
    }
  }
  return {
    id: snapshot.id,
    snapshotId: snapshot.id,
    title: snapshot.title,
    summary: snapshot.summary,
    coverUrl: snapshot.coverUrl ?? '/fixtures/libtv/media/city-night-poster.webp',
    publishedAt: snapshot.publishedAt,
    nodeCount: 'nodeCount' in snapshot ? snapshot.nodeCount : snapshot.document.nodes.length,
    mediaCount,
    category: mediaCount > 0 ? '专业影视' : '精选画布',
    author: '公开创作者',
    authorTier: '先锋',
    authorAvatarUrl: null,
    likeCount: 0,
    viewCount: 12846,
    hasAiContent: true,
    processAvailable: true,
    media,
  }
}

export async function listShowcaseEntries(): Promise<ShowcaseEntryProjection[]> {
  const snapshots = await listPublishedSnapshots()
  const publishedIds = new Set(snapshots.map((summary) => summary.id))
  const publishedEntries = await Promise.all(snapshots.map(async (summary) => entryFor(await findSnapshotRecord(summary.id))))
  const fixtureEntries = SHOWCASE_DISCOVERY_CATALOG.filter((entry) => !publishedIds.has(entry.snapshotId))
  return [...publishedEntries, ...fixtureEntries].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
}

/**
 * Discovery fixtures fill the local catalogue when a scenario has no stored
 * publication. A stored hidden or revoked snapshot always wins, so takedown
 * remains a real public boundary rather than being masked by a fixture.
 */
export async function findViewableShowcaseSnapshot(snapshotId: string): Promise<PublishedSnapshot> {
  try {
    return await findSnapshotRecord(snapshotId)
  } catch (error) {
    const state = (await readState()) as SnapshotCarrier
    if (state.publishedSnapshots?.some((snapshot) => snapshot.id === snapshotId)) throw error
    const fixture = findShowcaseFixtureSnapshot(snapshotId)
    if (fixture) return fixture
    throw error
  }
}

export async function findShowcaseDetail(snapshotId: string): Promise<ShowcaseDetailResponse> {
  const snapshot = await findViewableShowcaseSnapshot(snapshotId).catch((error: unknown) => {
    if (error instanceof HttpError) throw error
    throw new HttpError(404, '作品不存在或已下架')
  })
  const entry = entryFor(snapshot)
  const related = await listShowcaseEntries()
  return {
    entry,
    related: [entry, ...related.filter((fixture) => fixture.id !== entry.id)],
  }
}
