import { describe, expect, it } from 'vitest'

import { AssetLifecycleListResponseSchema, AssetLifecycleViewSchema } from '../assets'

const asset = {
  id: 'asset_fixture_01',
  spaceId: 'sp_default',
  namespace: 'personal',
  kind: 'image',
  name: '电影青橙首帧',
  url: '/fixtures/libtv/media/image-fixture.webp',
  thumbnailUrl: null,
  width: 1920,
  height: 1080,
  durationSeconds: null,
  byteSize: 128,
  tags: ['场景'],
  folderId: null,
  state: 'committed',
  createdAt: '2026-09-04T00:00:00.000Z',
  sourceArtifactId: 'art_fixture_01',
  lifecycle: {
    assetId: 'asset_fixture_01',
    availability: 'active',
    reason: 'available',
    changedAt: '2026-09-04T00:00:00.000Z',
    recoverableUntil: null,
  },
}

describe('asset lifecycle API boundary', () => {
  it('accepts the lifecycle view returned by the local asset routes', () => {
    expect(AssetLifecycleViewSchema.parse(asset)).toEqual(asset)
    expect(AssetLifecycleListResponseSchema.parse({ assets: [asset] })).toEqual({ assets: [asset] })
  })

  it('rejects a legacy Asset response that omits its availability projection', () => {
    const { lifecycle: _lifecycle, ...legacyAsset } = asset
    expect(() => AssetLifecycleViewSchema.parse(legacyAsset)).toThrow(/lifecycle/i)
  })
})
