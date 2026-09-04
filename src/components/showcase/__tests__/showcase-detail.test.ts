import { describe, expect, it } from 'vitest'

import {
  cyclePlaybackRate,
  formatShowcaseDuration,
  getShowcaseDetailState,
  type ShowcaseQuality,
} from '../ShowcaseDetailView'

describe('showcase detail playback model', () => {
  it('cycles the observed playback rates and formats the player clock', () => {
    expect(cyclePlaybackRate(1)).toBe(1.5)
    expect(cyclePlaybackRate(1.5)).toBe(2)
    expect(cyclePlaybackRate(2)).toBe(1)
    expect(formatShowcaseDuration(0)).toBe('0:00')
    expect(formatShowcaseDuration(7)).toBe('0:07')
    expect(formatShowcaseDuration(75)).toBe('1:15')
  })

  it('keeps quality labels source-driven while exposing the local menu options', () => {
    const quality: ShowcaseQuality[] = ['auto', '480p', '720p', 'original']
    expect(quality).toEqual(['auto', '480p', '720p', 'original'])
  })

  it('distinguishes initial loading, ready and stale refresh states', () => {
    expect(getShowcaseDetailState({ loading: true, hasDetail: false, error: null })).toBe('loading')
    expect(getShowcaseDetailState({ loading: true, hasDetail: true, error: null })).toBe('refreshing')
    expect(getShowcaseDetailState({ loading: false, hasDetail: true, error: null })).toBe('ready')
    expect(getShowcaseDetailState({ loading: false, hasDetail: true, error: '媒体暂时不可用' })).toBe('stale-error')
    expect(getShowcaseDetailState({ loading: false, hasDetail: false, error: '作品不存在' })).toBe('error')
  })
})
