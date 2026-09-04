import type { Asset } from './types'

/**
 * Availability is deliberately separate from the ingestion state on `Asset`.
 *
 * `Asset.state` answers whether bytes were admitted to the library
 * (staging/committed/revoked). This projection answers whether an already known
 * asset can still be used by a canvas or storyboard. Keeping the dimensions
 * separate lets a soft-deleted item remain attributable and recoverable.
 */
export const ASSET_AVAILABILITIES = ['active', 'missing', 'deleted', 'recoverable'] as const
export type AssetAvailability = (typeof ASSET_AVAILABILITIES)[number]

export type AssetLifecycleReason =
  | 'available'
  | 'media_url_unavailable'
  | 'deleted_by_user'
  | 'source_artifact_removed'
  | 'source_node_deleted'

export interface AssetLifecycle {
  assetId: string
  availability: AssetAvailability
  reason: AssetLifecycleReason
  changedAt: string
  /** A recoverable removal is retained locally until an actual backend replaces this policy. */
  recoverableUntil: string | null
}

export interface AssetLifecycleView extends Asset {
  lifecycle: AssetLifecycle
}

export function defaultAssetLifecycle(asset: Pick<Asset, 'id' | 'state' | 'createdAt'>): AssetLifecycle {
  if (asset.state === 'revoked') {
    return {
      assetId: asset.id,
      availability: 'recoverable',
      reason: 'deleted_by_user',
      changedAt: asset.createdAt,
      recoverableUntil: null,
    }
  }
  if (asset.state === 'staging') {
    return {
      assetId: asset.id,
      availability: 'missing',
      reason: 'media_url_unavailable',
      changedAt: asset.createdAt,
      recoverableUntil: null,
    }
  }
  return {
    assetId: asset.id,
    availability: 'active',
    reason: 'available',
    changedAt: asset.createdAt,
    recoverableUntil: null,
  }
}

export function assetIsUsable(asset: Pick<Asset, 'state'>, lifecycle?: AssetLifecycle | null): boolean {
  return asset.state === 'committed' && (lifecycle?.availability ?? 'active') === 'active'
}

export const ASSET_AVAILABILITY_LABELS: Record<AssetAvailability, string> = {
  active: '可用',
  missing: '媒体不可用',
  deleted: '已删除',
  recoverable: '可恢复',
}

export const ASSET_LIFECYCLE_REASON_LABELS: Record<AssetLifecycleReason, string> = {
  available: '资产可正常使用',
  media_url_unavailable: '媒体地址暂时不可用',
  deleted_by_user: '资产已从资产库移除',
  source_artifact_removed: '源产物已从工作流移除',
  source_node_deleted: '源节点已从工作流删除',
}
