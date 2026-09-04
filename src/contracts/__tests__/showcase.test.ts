import { describe, expect, it } from 'vitest'

import { HomeDiscoveryResponseSchema, HomeShowcaseItemSchema } from '@/contracts/home'
import { ShowcaseCategorySchema, ShowcaseListResponseSchema } from '@/contracts/showcase'
import { HOME_DISCOVERY_CATALOG } from '@/mocks/home'
import { SHOWCASE_CATEGORIES, SHOWCASE_DISCOVERY_CATALOG } from '@/mocks/showcase'

describe('showcase discovery contract', () => {
  it('uses one category vocabulary and one stable projection for home and the gallery', () => {
    expect([...SHOWCASE_CATEGORIES]).toEqual([
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
    ])
    expect(SHOWCASE_DISCOVERY_CATALOG.every((entry) => ShowcaseCategorySchema.safeParse(entry.category).success)).toBe(true)

    const home = HomeDiscoveryResponseSchema.parse({
      ...HOME_DISCOVERY_CATALOG,
      account: { credits: 0, unreadCount: 0, membershipLabel: '登录' },
      recentProjects: [],
    })
    const gallery = ShowcaseListResponseSchema.parse({ entries: SHOWCASE_DISCOVERY_CATALOG, page: { offset: 0, limit: SHOWCASE_DISCOVERY_CATALOG.length, total: SHOWCASE_DISCOVERY_CATALOG.length, hasMore: false, nextOffset: null, category: '全部', query: '', searchFallback: false } })

    expect(home.showcase.map((entry) => entry.id)).toEqual(gallery.entries.map((entry) => entry.id))
    expect(home.showcase.map((entry) => entry.category)).toEqual(gallery.entries.map((entry) => entry.category))
    expect(new Set(gallery.entries.map((entry) => entry.snapshotId)).size).toBe(gallery.entries.length)
  })

  it('keeps the public discovery media paths local', () => {
    const response = ShowcaseListResponseSchema.parse({ entries: SHOWCASE_DISCOVERY_CATALOG, page: { offset: 0, limit: SHOWCASE_DISCOVERY_CATALOG.length, total: SHOWCASE_DISCOVERY_CATALOG.length, hasMore: false, nextOffset: null, category: '全部', query: '', searchFallback: false } })
    const urls = response.entries.flatMap((entry) => [entry.coverUrl, entry.media.posterUrl, entry.media.url])

    expect(urls.every((url) => url === null || url.startsWith('/'))).toBe(true)
  })

  it('rejects a home card whose route id drifts from its snapshot id', () => {
    expect(() => HomeShowcaseItemSchema.parse({
      ...SHOWCASE_DISCOVERY_CATALOG[0],
      id: 'drifted-card-id',
    })).toThrow()
  })
})
