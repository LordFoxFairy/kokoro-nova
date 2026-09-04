import type { AssetLifecycle } from '@/domain/assets'

/** Deterministic lifecycle rows used by docs, API tests and isolated browser fixtures. */
export const ASSET_LIFECYCLE_FIXTURES = {
  active: {
    assetId: 'asset_image_seed',
    availability: 'active',
    reason: 'available',
    changedAt: '2026-09-04T00:00:00.000Z',
    recoverableUntil: null,
  },
  missingMedia: {
    assetId: 'asset_image_seed',
    availability: 'missing',
    reason: 'media_url_unavailable',
    changedAt: '2026-09-04T00:00:00.000Z',
    recoverableUntil: null,
  },
  recoverable: {
    assetId: 'asset_image_seed',
    availability: 'recoverable',
    reason: 'deleted_by_user',
    changedAt: '2026-09-04T00:00:00.000Z',
    recoverableUntil: '2026-10-04T00:00:00.000Z',
  },
} as const satisfies Record<string, AssetLifecycle>
