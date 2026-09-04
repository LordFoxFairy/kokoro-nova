import {
  AssetLifecycleListResponseSchema,
  AssetLifecycleViewSchema,
  type AssetLifecycleAction,
  type AssetListVisibility,
} from '@/contracts/assets'
import type { AssetLifecycleView } from '@/domain/assets'
import { api } from '@/lib/api'

export type AssetLifecycleList = { assets: AssetLifecycleView[] }

export async function listLifecycleAssets(options: {
  namespace?: 'personal' | 'agent'
  visibility?: AssetListVisibility
  fixture?: 'media-missing'
} = {}): Promise<AssetLifecycleList> {
  const params = new URLSearchParams()
  if (options.namespace) params.set('namespace', options.namespace)
  if (options.visibility) params.set('visibility', options.visibility)
  if (options.fixture) params.set('fixture', options.fixture)
  const suffix = params.toString()
  return AssetLifecycleListResponseSchema.parse(
    await api.get<unknown>(`/api/assets${suffix ? `?${suffix}` : ''}`),
  )
}

export async function changeAssetLifecycle(assetId: string, action: AssetLifecycleAction): Promise<AssetLifecycleView> {
  const result = AssetLifecycleViewSchema.parse(
    await api.patch<unknown>(`/api/assets/${encodeURIComponent(assetId)}`, { action }),
  )
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kokoro:asset-lifecycle-changed', { detail: result.lifecycle }))
  }
  return result
}
