import type {
  ShowcaseDetailResponse,
  ShowcaseEntryProjection,
  ShowcaseListQuery,
  ShowcaseListResponse,
  ShowcaseMedia,
  ShowcasePlaybackManifest,
} from '@/contracts/showcase'
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

/** Deterministic, cursor-free offset pagination for the local TV Show directory. */
export async function listShowcasePage(input: ShowcaseListQuery): Promise<ShowcaseListResponse> {
  const all = await listShowcaseEntries()
  const inCategory = input.category === '全部' ? all : all.filter((entry) => entry.category === input.category)
  const query = input.query.trim()
  const needle = query.toLocaleLowerCase('zh-CN')
  const exactMatches = needle
    ? inCategory.filter((entry) => `${entry.title} ${entry.summary} ${entry.author}`.toLocaleLowerCase('zh-CN').includes(needle))
    : inCategory
  const searchFallback = Boolean(needle && exactMatches.length === 0 && inCategory.length > 0)
  const resolved = searchFallback ? inCategory : exactMatches
  const entries = resolved.slice(input.offset, input.offset + input.limit)
  const nextOffset = input.offset + entries.length
  return {
    entries,
    page: {
      offset: input.offset,
      limit: input.limit,
      total: resolved.length,
      hasMore: nextOffset < resolved.length,
      nextOffset: nextOffset < resolved.length ? nextOffset : null,
      category: input.category,
      query,
      searchFallback,
    },
  }
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

function variantUrl(url: string, quality: '480p' | '720p' | 'original'): string {
  const parsed = new URL(url, 'http://local.fixture')
  parsed.searchParams.set('quality', quality)
  return `${parsed.pathname}${parsed.search}`
}

/**
 * Local-only playback manifest. It intentionally describes variants rather
 * than issuing a remote stream token: the browser can deterministically move
 * through `fallbackOrder` after a native media delivery/decode error.
 */
export async function findShowcasePlaybackManifest(snapshotId: string): Promise<ShowcasePlaybackManifest> {
  const detail = await findShowcaseDetail(snapshotId)
  const media = detail.entry.media
  if (!media.url || !media.url.startsWith('/api/media/')) {
    throw new HttpError(404, '作品暂时没有可播放的本地媒体')
  }

  return {
    snapshotId: detail.entry.snapshotId,
    media,
    initialQuality: '720p',
    variants: [
      { quality: '720p', label: '720p 高清', url: variantUrl(media.url, '720p') },
      { quality: '480p', label: '480p 流畅', url: variantUrl(media.url, '480p') },
      { quality: 'original', label: media.originalQualityLabel, url: variantUrl(media.url, 'original') },
    ],
    fallbackOrder: ['720p', '480p', 'original'],
  }
}
