import { createNode, emptyDocument } from '@/domain/factory'
import type { PublishedSnapshot } from '@/domain/publish'
import type { ShowcaseCategory, ShowcaseEntryProjection } from '@/contracts/showcase'

const MEDIA_URL = '/api/media/fixtures/city-night.mp4'

const sharedMedia = {
  url: MEDIA_URL,
  posterUrl: '/fixtures/libtv/media/city-night-poster.webp',
  durationSeconds: 15,
  width: 1280,
  height: 720,
  originalQualityLabel: '720p 原画质',
} as const

/** The single category vocabulary consumed by both home and /showcase. */
export const SHOWCASE_CATEGORIES = [
  '全部',
  'AI 漫剧精卫计划',
  '广告导演请就位',
  '精选画布',
  '专业影视',
  '短剧漫剧',
  '商业广告',
  '动漫游戏',
  '教育生活',
  'TV 工具箱',
] as const satisfies readonly ShowcaseCategory[]

/**
 * Deterministic discovery projection. The public id is also the published
 * snapshot id, so a card rendered on home can be traced to the same detail and
 * read-only process route in the gallery.
 */
export const SHOWCASE_DISCOVERY_CATALOG: ShowcaseEntryProjection[] = [
  {
    id: 'pub_city_night_01',
    snapshotId: 'pub_city_night_01',
    title: '雨夜霓虹城市',
    summary: '从故事梗概、首帧到视频成片的公开制作过程。',
    coverUrl: '/fixtures/libtv/media/city-night-poster.webp',
    publishedAt: '2026-09-03T11:30:00.000Z',
    nodeCount: 4,
    mediaCount: 2,
    category: '专业影视',
    author: '公开创作者',
    authorTier: '先锋',
    authorAvatarUrl: null,
    likeCount: 12,
    viewCount: 12846,
    hasAiContent: true,
    processAvailable: true,
    media: sharedMedia,
  },
  {
    id: 'showcase-dust-skeleton',
    snapshotId: 'showcase-dust-skeleton',
    title: '尘骸丨东方蒸汽朋克 EP.01',
    summary: '东方蒸汽朋克世界观的镜头实验。',
    coverUrl: '/fixtures/libtv/showcase/dust-skeleton.webp',
    publishedAt: '2026-08-31T10:00:00.000Z',
    nodeCount: 8,
    mediaCount: 5,
    category: '专业影视',
    author: 'Beichen_',
    authorTier: '先锋',
    authorAvatarUrl: null,
    likeCount: 7,
    viewCount: 682,
    hasAiContent: true,
    processAvailable: true,
    media: sharedMedia,
  },
  {
    id: 'showcase-wash-white',
    snapshotId: 'showcase-wash-white',
    title: '洗白',
    summary: '一组关于记忆和光的短片。',
    coverUrl: '/fixtures/libtv/showcase/wash-white.webp',
    publishedAt: '2026-08-29T10:00:00.000Z',
    nodeCount: 4,
    mediaCount: 2,
    category: '精选画布',
    author: '拟态',
    authorTier: null,
    authorAvatarUrl: null,
    likeCount: 5,
    viewCount: 413,
    hasAiContent: true,
    processAvailable: false,
    media: sharedMedia,
  },
  {
    id: 'showcase-cloud-palace',
    snapshotId: 'showcase-cloud-palace',
    title: '《云阙天宫》中式美学',
    summary: '以山水和建筑构成的幻想片段。',
    coverUrl: '/fixtures/libtv/showcase/cloud-palace.webp',
    publishedAt: '2026-08-26T10:00:00.000Z',
    nodeCount: 12,
    mediaCount: 8,
    category: '专业影视',
    author: 'Jcy樂多',
    authorTier: '专业',
    authorAvatarUrl: null,
    likeCount: 58,
    viewCount: 2390,
    hasAiContent: true,
    processAvailable: true,
    media: sharedMedia,
  },
  {
    id: 'showcase-childhood-memoir',
    snapshotId: 'showcase-childhood-memoir',
    title: '童年纪事 EP1',
    summary: '夏日午后的童年片段。',
    coverUrl: '/fixtures/libtv/showcase/childhood-memoir.webp',
    publishedAt: '2026-08-23T10:00:00.000Z',
    nodeCount: 6,
    mediaCount: 4,
    category: '短剧漫剧',
    author: '昼夜旅客',
    authorTier: '先锋',
    authorAvatarUrl: null,
    likeCount: 19,
    viewCount: 1098,
    hasAiContent: true,
    processAvailable: true,
    media: sharedMedia,
  },
  {
    id: 'showcase-work-diary',
    snapshotId: 'showcase-work-diary',
    title: '《班尼打工日记》',
    summary: '像素角色的一天工作记录。',
    coverUrl: '/fixtures/libtv/showcase/work-diary.webp',
    publishedAt: '2026-08-20T10:00:00.000Z',
    nodeCount: 9,
    mediaCount: 6,
    category: '动漫游戏',
    author: '炖捣像素',
    authorTier: '先锋',
    authorAvatarUrl: null,
    likeCount: 21,
    viewCount: 870,
    hasAiContent: true,
    processAvailable: true,
    media: sharedMedia,
  },
  {
    id: 'showcase-shanghai-chronicle',
    snapshotId: 'showcase-shanghai-chronicle',
    title: '《上海坊事录》',
    summary: '城市日常与旧街巷的生活切片。',
    coverUrl: '/fixtures/libtv/showcase/shanghai-chronicle.webp',
    publishedAt: '2026-08-17T10:00:00.000Z',
    nodeCount: 7,
    mediaCount: 3,
    category: '教育生活',
    author: '光影造梦',
    authorTier: null,
    authorAvatarUrl: null,
    likeCount: 31,
    viewCount: 744,
    hasAiContent: true,
    processAvailable: true,
    media: sharedMedia,
  },
]

/** Backward-compatible name for the non-primary related fixtures. */
export const SHOWCASE_RELATED_FIXTURES = SHOWCASE_DISCOVERY_CATALOG.filter(
  (entry) => entry.id !== 'pub_city_night_01',
)

function fixtureSnapshot(entry: ShowcaseEntryProjection): PublishedSnapshot {
  const node = createNode('text', { x: 80, y: 80 }, [], {
    id: `${entry.id}-node`,
    name: '公开文本节点',
    createdAt: entry.publishedAt,
    updatedAt: entry.publishedAt,
    data: {
      prompt: entry.summary,
      references: [],
      artifacts: [],
      jobId: null,
      extra: {},
    },
  })

  return {
    id: entry.snapshotId,
    projectId: `fixture-project-${entry.id}`,
    canvasId: `fixture-canvas-${entry.id}`,
    title: entry.title,
    summary: entry.summary,
    coverUrl: entry.coverUrl,
    publishedAt: entry.publishedAt,
    state: 'listed',
    document: { ...emptyDocument(), nodes: [node] },
  }
}

/** Synthetic local snapshots let every deterministic card open a read-only process. */
export const SHOWCASE_FIXTURE_SNAPSHOTS: Readonly<Record<string, PublishedSnapshot>> = Object.fromEntries(
  SHOWCASE_DISCOVERY_CATALOG.map((entry) => [entry.snapshotId, fixtureSnapshot(entry)]),
)

export function findShowcaseFixtureSnapshot(snapshotId: string): PublishedSnapshot | null {
  return SHOWCASE_FIXTURE_SNAPSHOTS[snapshotId] ?? null
}
