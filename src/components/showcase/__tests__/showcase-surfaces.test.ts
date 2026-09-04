import { describe, expect, it } from 'vitest'

import {
  filterShowcaseEntries,
  getShowcaseRequestState,
  getShowcaseSearchFeedback,
  type ShowcaseEntry,
} from '../ShowcaseGallery'
import { getPublicSnapshotState } from '../PublicCanvasView'

const entries: ShowcaseEntry[] = [
  {
    id: 'video-1',
    title: '雨夜霓虹城市',
    summary: '从首帧到视频成片的公开制作过程。',
    coverUrl: null,
    publishedAt: '2026-09-01T00:00:00.000Z',
    nodeCount: 4,
    mediaCount: 2,
    category: '专业影视',
    author: '公开创作者',
    authorTier: '先锋',
    likeCount: 0,
  },
  {
    id: 'canvas-1',
    title: '文字分镜练习',
    summary: '一个只读画布样例。',
    coverUrl: null,
    publishedAt: '2026-08-31T00:00:00.000Z',
    nodeCount: 1,
    mediaCount: 0,
    category: '精选画布',
    author: '公开创作者',
    authorTier: null,
    likeCount: 0,
  },
]

describe('showcase surface state copy', () => {
  it('filters the TV Show catalogue by category and committed query', () => {
    expect(filterShowcaseEntries(entries, '专业影视', '霓虹').entries.map((entry) => entry.id)).toEqual(['video-1'])
    expect(filterShowcaseEntries(entries, '精选画布', '').entries.map((entry) => entry.id)).toEqual(['canvas-1'])
  })

  it('keeps the catalogue visible when a submitted query has no exact match', () => {
    const result = filterShowcaseEntries(entries, '专业影视', '不存在')
    expect(result.fallback).toBe(true)
    expect(result.entries.map((entry) => entry.id)).toEqual(['video-1'])
    expect(getShowcaseSearchFeedback({ category: '专业影视', query: '不存在', resultCount: 1, fallback: true })).toBe(
      '未找到“不存在”的完全匹配，展示专业影视作品',
    )
  })

  it('keeps a stale gallery visible while a refresh fails', () => {
    expect(getShowcaseRequestState({ loading: true, hasData: true, error: null })).toBe('refreshing')
    expect(getShowcaseRequestState({ loading: false, hasData: true, error: '暂时不可用' })).toBe('stale-error')
    expect(getShowcaseRequestState({ loading: false, hasData: false, error: '暂时不可用' })).toBe('error')
    expect(getShowcaseRequestState({ loading: false, hasData: false, error: null })).toBe('empty')
  })

  it('makes the published snapshot boundary explicit', () => {
    expect(getPublicSnapshotState({ loading: true, hasSnapshot: false, error: null })).toBe('loading')
    expect(getPublicSnapshotState({ loading: false, hasSnapshot: true, error: null })).toBe('readonly')
    expect(getPublicSnapshotState({ loading: false, hasSnapshot: true, error: '暂时不可用' })).toBe('stale-error')
    expect(getPublicSnapshotState({ loading: false, hasSnapshot: false, error: '作品已下架' })).toBe('unavailable')
  })
})
