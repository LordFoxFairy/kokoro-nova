import { describe, expect, it } from 'vitest'

import { STYLE_PRESETS } from '@/domain/libraries'
import { filterMaterialPresets } from '../LibraryPanels'

describe('canvas library filters', () => {
  it('combines source tabs, categories, commercial access and search', () => {
    expect(
      filterMaterialPresets(STYLE_PRESETS, {
        kind: 'style',
        tab: 'favorites',
        category: '摄影写真',
        commercialOnly: true,
        query: '柔光',
      }).map((item) => item.id),
    ).toEqual(['style-soft-portrait'])

    expect(
      filterMaterialPresets(STYLE_PRESETS, {
        kind: 'style',
        tab: 'recent',
        category: '全部',
        commercialOnly: false,
        query: 'NOIR',
      }).map((item) => item.id),
    ).toEqual(['style-noir'])
  })

  it('returns an empty result when a filter combination has no match', () => {
    expect(
      filterMaterialPresets(STYLE_PRESETS, {
        kind: 'style',
        tab: 'market',
        category: '摄影写真',
        commercialOnly: true,
        query: '不存在',
      }),
    ).toEqual([])
  })
})
