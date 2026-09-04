import { describe, expect, it } from 'vitest'

import { filterLibraryAssets, assetLibraryStateLabel, formatAssetBytes, formatAssetDate } from '../AssetLibraryPanel'
import type { Asset } from '@/domain/types'

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'asset-1',
  spaceId: 'space_fixture',
  namespace: 'personal',
  kind: 'image',
  name: 'Rain window',
  url: '/uploads/rain.png',
  thumbnailUrl: null,
  width: 1280,
  height: 720,
  durationSeconds: null,
  byteSize: 120,
  tags: ['场景', '风格'],
  folderId: null,
  state: 'committed',
  createdAt: '2026-09-04T10:00:00.000Z',
  sourceArtifactId: null,
  ...overrides,
})

describe('asset library helpers', () => {
  it('applies folder, category, query and any-tag filters together', () => {
    const rows = [
      asset({ id: 'root', name: 'Rain window' }),
      asset({ id: 'folder', name: 'Rain video', kind: 'video', folderId: 'folder-1', tags: ['人物'] }),
      asset({ id: 'other', name: 'City', folderId: 'folder-2', tags: ['人物'] }),
    ]

    expect(
      filterLibraryAssets(rows, {
        folderId: 'folder-1',
        category: 'video',
        query: 'VIDEO',
        tags: ['场景', '人物'],
      }).map((row) => row.id),
    ).toEqual(['folder'])
    expect(filterLibraryAssets(rows, { folderId: null, category: 'all', query: '', tags: [] }).map((row) => row.id)).toEqual(['root'])
  })

  it('keeps request state labels actionable for loading and retry UI', () => {
    expect(assetLibraryStateLabel('loading')).toBe('加载中')
    expect(assetLibraryStateLabel('ready')).toBe('已加载')
    expect(assetLibraryStateLabel('error')).toBe('加载失败')
  })

  it('formats detail metadata into compact, human-readable values', () => {
    expect(formatAssetBytes(900)).toBe('900 B')
    expect(formatAssetBytes(2048)).toBe('2.0 KB')
    expect(formatAssetBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatAssetBytes(0)).toBe('—')
    expect(formatAssetDate('not-a-date')).toBe('—')
    expect(formatAssetDate('2026-09-04T10:05:00.000Z')).toContain('2026')
  })
})
