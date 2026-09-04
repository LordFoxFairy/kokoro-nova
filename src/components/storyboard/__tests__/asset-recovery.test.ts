import { describe, expect, it } from 'vitest'

import { assetRecoveryMessage, canRecoverStoryboardAsset } from '../MediaDetailDrawer'

describe('storyboard asset recovery helpers', () => {
  it('only exposes a restore action for a recoverable card with a saved asset id', () => {
    expect(canRecoverStoryboardAsset({ availability: 'recoverable', assetId: 'asset_image_seed' })).toBe(true)
    expect(canRecoverStoryboardAsset({ availability: 'recoverable', assetId: null })).toBe(false)
    expect(canRecoverStoryboardAsset({ availability: 'missing', assetId: 'asset_image_seed' })).toBe(false)
    expect(canRecoverStoryboardAsset(undefined)).toBe(false)
  })

  it('keeps a failed restore actionable and makes the successful projection update explicit', () => {
    expect(assetRecoveryMessage('idle')).toBeNull()
    expect(assetRecoveryMessage('restoring')).toBe('正在恢复资产…')
    expect(assetRecoveryMessage('succeeded')).toBe('资产已恢复，故事板已更新。')
    expect(assetRecoveryMessage('failed', '本地资产暂不可恢复')).toBe('本地资产暂不可恢复，可再次尝试。')
    expect(assetRecoveryMessage('failed')).toBe('恢复资产失败，可再次尝试。')
  })
})
