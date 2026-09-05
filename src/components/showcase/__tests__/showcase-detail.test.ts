import { describe, expect, it } from 'vitest'

import {
  cyclePlaybackRate,
  formatShowcaseDuration,
  getShowcaseDetailState,
  resolveShowcasePlaybackSources,
  type ShowcaseQuality,
} from '../ShowcaseDetailView'
import type { ShowcasePlaybackManifest } from '@/contracts/showcase'

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

  it('uses a deterministic auto quality fallback without overriding an explicit quality choice', () => {
    const manifest: ShowcasePlaybackManifest = {
      snapshotId: 'pub_city_night_01',
      media: { url: '/api/media/fixtures/city-night.mp4', posterUrl: null, durationSeconds: 15, width: 1280, height: 720, originalQualityLabel: '720p 原画质' },
      initialQuality: '720p',
      variants: [
        { quality: '720p', label: '720p 高清', url: '/api/media/fixtures/city-night.mp4?quality=720p' },
        { quality: '480p', label: '480p 流畅', url: '/api/media/fixtures/city-night.mp4?quality=480p' },
        { quality: 'original', label: '720p 原画质', url: '/api/media/fixtures/city-night.mp4?quality=original' },
      ],
      fallbackOrder: ['720p', '480p', 'original'],
    }

    expect(resolveShowcasePlaybackSources(manifest, 'auto').map((variant) => variant.quality)).toEqual(['720p', '480p', 'original'])
    expect(resolveShowcasePlaybackSources(manifest, '480p').map((variant) => variant.quality)).toEqual(['480p'])
  })
})
