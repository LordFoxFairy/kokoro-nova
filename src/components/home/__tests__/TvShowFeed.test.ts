import { describe, expect, it } from 'vitest'

import { HOME_DISCOVERY_CATALOG } from '@/mocks/home'
import {
  filterTvShowItems,
  getTvShowSearchFeedback,
  nextTvShowEscapeState,
  resolveTvShowSearch,
  tvShowCategoryScrollDelta,
} from '../TvShowFeed'

describe('TV Show discovery helpers', () => {
  it('filters the local catalogue by category and title or author', () => {
    const items = HOME_DISCOVERY_CATALOG.showcase

    expect(filterTvShowItems(items, '专业影视', '')).toHaveLength(3)
    expect(filterTvShowItems(items, '全部', '尘骸').map((item) => item.id)).toEqual(['showcase-dust-skeleton'])
    expect(filterTvShowItems(items, '全部', 'Jcy').map((item) => item.id)).toEqual(['showcase-cloud-palace'])
  })

  it('preserves submitted exact matches and the official recommendation fallback', () => {
    const items = HOME_DISCOVERY_CATALOG.showcase

    expect(resolveTvShowSearch(items, '专业影视', '').items).toHaveLength(3)
    expect(resolveTvShowSearch(items, '专业影视', '尘骸')).toMatchObject({
      items: [{ id: 'showcase-dust-skeleton' }],
      usedFallback: false,
    })
    expect(resolveTvShowSearch(items, '专业影视', '不存在')).toMatchObject({
      items,
      usedFallback: true,
    })
  })

  it('returns a readable result announcement for direct and fallback searches', () => {
    expect(getTvShowSearchFeedback({ category: '全部', query: '', resultCount: 6 })).toBe('共 6 个公开作品')
    expect(getTvShowSearchFeedback({ category: '专业影视', query: '', resultCount: 2 })).toBe('专业影视 · 2 个作品')
    expect(getTvShowSearchFeedback({ category: '全部', query: '尘骸', resultCount: 1 })).toBe('搜索“尘骸” · 1 个作品')
    expect(getTvShowSearchFeedback({ category: '全部', query: '不存在', resultCount: 6, usedFallback: true })).toBe(
      '未找到“不存在”的精确结果，已为你推荐 6 个作品',
    )
  })

  it('uses a proportionate, directional scroll distance for the official category rail', () => {
    expect(tvShowCategoryScrollDelta('right', 500)).toBe(360)
    expect(tvShowCategoryScrollDelta('left', 500)).toBe(-360)
    expect(tvShowCategoryScrollDelta('right', 0)).toBe(1)
  })

  it('uses Escape to clear the search first and then return to all categories', () => {
    expect(nextTvShowEscapeState({ category: '专业影视', query: '尘骸' })).toEqual({
      category: '专业影视',
      query: '',
      handled: true,
    })
    expect(nextTvShowEscapeState({ category: '专业影视', query: '' })).toEqual({
      category: '全部',
      query: '',
      handled: true,
    })
    expect(nextTvShowEscapeState({ category: '全部', query: '' })).toEqual({
      category: '全部',
      query: '',
      handled: false,
    })
  })
})
