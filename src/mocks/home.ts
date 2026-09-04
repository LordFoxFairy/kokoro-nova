import type { HomeDiscoveryCatalog } from '@/contracts/home'
import { SHOWCASE_CATEGORIES, SHOWCASE_DISCOVERY_CATALOG } from './showcase'

/** Frozen, public-facing discovery content captured from the authenticated home. */
export const HOME_DISCOVERY_CATALOG: HomeDiscoveryCatalog = {
  campaign: {
    id: 'campaign-theatre-2026',
    message: 'Seedance 2.5 720P 年会员生成限时 5 折起，低至 0.39 元/秒',
    cta: '限时抢购',
    imageUrl: '/fixtures/libtv/home/theatre-banner.webp',
  },
  creatorTools: [
    {
      id: 'tool-seedance-25',
      title: 'Seedance 2.5',
      badge: '多参创作',
      description: '音视频直出 30s',
      intent: 'video-model',
    },
    {
      id: 'tool-wan-30',
      title: 'Wan 3.0',
      badge: '全新上线',
      description: '改写视频画面、剧情、环境',
      intent: 'video-model',
    },
    {
      id: 'tool-minimax-h3',
      title: 'Minimax H3 Max',
      badge: '极速生成',
      description: '后训练极速视频生成',
      intent: 'video-model',
    },
    {
      id: 'tool-director',
      title: '导演台',
      badge: '独家',
      description: '3D 虚拟场景，精准控制空间',
      intent: 'director',
    },
    {
      id: 'tool-frame-analysis',
      title: '逐帧拉片',
      badge: '独家',
      description: '传视频，逐帧拉片快捷参考',
      intent: 'frame-analysis',
    },
    {
      id: 'tool-segment-remake',
      title: '片段重拍',
      badge: null,
      description: '精准修改视频片段',
      intent: 'segment-remake',
    },
  ],
  featuredSkills: [
    {
      id: 'skill-pop-mv',
      name: 'POP MV',
      summary: '流行音乐短片的镜头与节奏模板',
      coverUrl: '/fixtures/libtv/showcase/dust-skeleton.webp',
    },
    {
      id: 'skill-koreeda',
      name: '是枝裕和电影美学',
      summary: '生活流叙事、自然光与克制镜头语言',
      coverUrl: '/fixtures/libtv/showcase/childhood-memoir.webp',
    },
    {
      id: 'skill-beauty-ugc',
      name: '真人感美妆UGC产品测评',
      summary: '真实口播质感的美妆产品测评模板',
      coverUrl: '/fixtures/libtv/showcase/wash-white.webp',
    },
  ],
  showcaseCategories: [...SHOWCASE_CATEGORIES],
  showcase: SHOWCASE_DISCOVERY_CATALOG.map(({ id, snapshotId, title, author, authorTier, coverUrl, likeCount, processAvailable, category }) => ({
    id,
    snapshotId,
    title,
    author,
    authorTier,
    coverUrl: coverUrl as string,
    likeCount,
    processAvailable,
    category,
  })),
}
