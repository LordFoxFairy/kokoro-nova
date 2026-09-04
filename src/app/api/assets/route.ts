import { AssetListFixtureSchema, AssetListVisibilitySchema } from '@/contracts/assets'
import { ids } from '@/domain/ids'
import type { Asset, AssetNamespace, AssetTag } from '@/domain/types'
import { assetLifecycleView, assetMatchesLifecycle, setAssetLifecycle } from '@/server/assets'
import { handle } from '@/server/http'
import { DEFAULT_SPACE_ID, readState, withState } from '@/server/store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url)
    const namespace = url.searchParams.get('namespace') as AssetNamespace | null
    const kind = url.searchParams.get('kind')
    const query = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const tag = url.searchParams.get('tag')
    const visibility = AssetListVisibilitySchema.catch('active').parse(url.searchParams.get('visibility') ?? 'active')
    const fixture = AssetListFixtureSchema.catch('none').parse(url.searchParams.get('fixture') ?? 'none')

    const state = await readState()
    // Fixture is response-local: it exercises the unavailable-media card with
    // stable bytes and never poisons a user's persisted normal listing.
    const fixtureOverrides = new Map<string, ReturnType<typeof assetLifecycleView>['lifecycle']>()
    if (fixture === 'media-missing') {
      const first = state.assets.find((asset) => asset.spaceId === DEFAULT_SPACE_ID && asset.state === 'committed')
      if (first) {
        fixtureOverrides.set(first.id, {
          ...assetLifecycleView(state, first).lifecycle,
          availability: 'missing',
          reason: 'media_url_unavailable',
        })
      }
    }

    let assets = state.assets.filter((asset) => asset.spaceId === DEFAULT_SPACE_ID)
    if (namespace) assets = assets.filter((asset) => asset.namespace === namespace)
    if (kind) assets = assets.filter((asset) => asset.kind === kind)
    if (tag) assets = assets.filter((asset) => asset.tags.includes(tag as AssetTag))
    if (query) assets = assets.filter((asset) => asset.name.toLowerCase().includes(query))

    return {
      assets: assets
        .map((asset) => {
          const view = assetLifecycleView(state, asset)
          const lifecycle = fixtureOverrides.get(asset.id) ?? view.lifecycle
          return { ...view, lifecycle }
        })
        .filter((asset) => assetMatchesLifecycle(asset, asset.lifecycle, visibility))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }
  })
}

/**
 * Register a generated artifact into the asset library (保存资产).
 * Artifacts and assets are separate objects: an artifact belongs to a job,
 * an asset is the reusable library entry created from it.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json()) as {
      artifactId?: string
      name?: string
      namespace?: AssetNamespace
      tags?: AssetTag[]
    }
    return withState((state) => {
      const job = state.jobs.find((j) => j.artifacts.some((a) => a.id === body.artifactId))
      const artifact = job?.artifacts.find((a) => a.id === body.artifactId)
      if (!artifact) throw new Error('产物不存在')

      const existing = state.assets.find((a) => a.sourceArtifactId === artifact.id)
      if (existing) return assetLifecycleView(state, existing)

      const asset: Asset = {
        id: ids.asset(),
        spaceId: DEFAULT_SPACE_ID,
        namespace: body.namespace ?? 'personal',
        kind: artifact.kind,
        name: body.name?.trim() || `${artifact.kind}-${artifact.id.slice(-6)}`,
        url: artifact.url,
        thumbnailUrl: artifact.thumbnailUrl,
        width: artifact.width,
        height: artifact.height,
        durationSeconds: artifact.durationSeconds,
        byteSize: 0,
        tags: body.tags ?? [],
        folderId: null,
        state: 'committed',
        createdAt: new Date().toISOString(),
        sourceArtifactId: artifact.id,
      }
      state.assets.push(asset)
      artifact.assetId = asset.id
      return setAssetLifecycle(state, asset, 'active', 'available')
    })
  })
}
