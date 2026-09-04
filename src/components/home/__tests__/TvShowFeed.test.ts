import { describe, expect, it } from 'vitest'

import { HOME_DISCOVERY_CATALOG } from '@/mocks/home'
import {
  filterTvShowItems,
  getTvShowSearchFeedback,
  nextTvShowEscapeState,
} from '../TvShowFeed'

describe('TV Show discovery helpers', () => {
  it('filters the local catalogue by category and title or author', () => {
    const items = HOME_DISCOVERY_CATALOG.showcase

    expect(filterTvShowItems(items, '专业影视', '')).toHaveLength(2)
    expect(filterTvShowItems(items, '全部', '尘骸').map((item) => item.id)).toEqual(['showcase-dust-skeleton'])
    expect(filterTvShowItems(items, '全部', 'Jcy').map((item) => item.id)).toEqual(['showcase-cloud-palace'])
  })

  it('returns a readable result announcement for every search state', () => {
    expect(getTvShowSearchFeedback({ category: '全部', query: '', resultCount: 6 })).toBe('共 6 个公开作品')
    expect(getTvShowSearchFeedback({ category: '专业影视', query: '', resultCount: 2 })).toBe('专业影视 · 2 个作品')
    expect(getTvShowSearchFeedback({ category: '全部', query: '不存在', resultCount: 0 })).toBe(
      '没有匹配“不存在”的作品',
    )
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
