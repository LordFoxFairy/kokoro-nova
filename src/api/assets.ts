import type { AssetLifecycleAction, AssetListVisibility } from '@/contracts/assets'
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
  return api.get<AssetLifecycleList>(`/api/assets${suffix ? `?${suffix}` : ''}`)
}

export async function changeAssetLifecycle(assetId: string, action: AssetLifecycleAction): Promise<AssetLifecycleView> {
  const result = await api.patch<AssetLifecycleView>(`/api/assets/${encodeURIComponent(assetId)}`, { action })
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kokoro:asset-lifecycle-changed', { detail: result.lifecycle }))
  }
  return result
}
