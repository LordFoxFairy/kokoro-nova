import { describe, expect, it } from 'vitest'

import { getShowcaseRequestState } from '../ShowcaseGallery'
import { getPublicSnapshotState } from '../PublicCanvasView'

describe('showcase surface state copy', () => {
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
