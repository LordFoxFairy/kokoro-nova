import type { ShowcaseDetailResponse, ShowcaseEntryProjection, ShowcaseMedia } from '@/contracts/showcase'
import type { Artifact } from '@/domain/types'
import { findViewableSnapshot as findSnapshotRecord, listPublishedSnapshots } from './publish'
import { SHOWCASE_RELATED_FIXTURES } from '@/mocks/showcase'
import type { PublishedSnapshot, SnapshotSummary } from '@/domain/publish'

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
  const media = mediaFor(snapshot)
  const mediaCount = 'mediaCount' in snapshot ? snapshot.mediaCount : snapshot.document.nodes.filter((node) => (node.data.artifacts ?? []).length > 0).length
  return {
    id: snapshot.id,
    snapshotId: snapshot.id,
    title: snapshot.title,
    summary: snapshot.summary,
    coverUrl: snapshot.coverUrl,
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
  return Promise.all(snapshots.map(async (summary) => entryFor(await findSnapshotRecord(summary.id))))
}

export async function findShowcaseDetail(snapshotId: string): Promise<ShowcaseDetailResponse> {
  const snapshot = await findSnapshotRecord(snapshotId)
  const entry = entryFor(snapshot)
  return {
    entry,
    related: [entry, ...SHOWCASE_RELATED_FIXTURES.filter((fixture) => fixture.id !== entry.id)],
  }
}
