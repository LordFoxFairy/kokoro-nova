import { describe, expect, it } from 'vitest'

import { filterSidebarAssets, sidebarAssetKindLabel } from '../AssetSidebar'
import type { Asset } from '@/domain/types'

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'asset-1',
  spaceId: 'space_fixture',
  namespace: 'personal',
  kind: 'image',
  name: 'Moon reference',
  url: '/uploads/moon.png',
  thumbnailUrl: null,
  width: 1280,
  height: 720,
  durationSeconds: null,
  byteSize: 120,
  tags: ['场景'],
  folderId: null,
  state: 'committed',
  createdAt: '2026-09-04T10:00:00.000Z',
  sourceArtifactId: null,
  ...overrides,
})

describe('asset sidebar helpers', () => {
  it('filters by kind and case-insensitive name while keeping newest first', () => {
    const rows = [
      asset({ id: 'old', name: 'Old moon', createdAt: '2026-09-03T10:00:00.000Z' }),
      asset({ id: 'new', name: 'Moon closeup', createdAt: '2026-09-04T12:00:00.000Z' }),
      asset({ id: 'video', kind: 'video', name: 'Moon motion', createdAt: '2026-09-04T13:00:00.000Z' }),
    ]

    expect(filterSidebarAssets(rows, { query: 'MOON', kind: 'image' }).map((row) => row.id)).toEqual(['new', 'old'])
    expect(filterSidebarAssets(rows, { query: '', kind: 'all' }).map((row) => row.id)).toEqual(['video', 'new', 'old'])
  })

  it('exposes readable media labels for compact rows', () => {
    expect(sidebarAssetKindLabel('image')).toBe('图片')
    expect(sidebarAssetKindLabel('video')).toBe('视频')
    expect(sidebarAssetKindLabel('audio')).toBe('音频')
    expect(sidebarAssetKindLabel('text')).toBe('文本')
  })
})
