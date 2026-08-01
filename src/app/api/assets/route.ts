import { ids } from '@/domain/ids'
import type { Asset, AssetNamespace, AssetTag } from '@/domain/types'
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

    const state = await readState()
    // Only committed rows are library content. A `staging` row has not cleared
    // content validation, and a `revoked` one has been withdrawn.
    let assets = state.assets.filter((a) => a.spaceId === DEFAULT_SPACE_ID && a.state === 'committed')
    if (namespace) assets = assets.filter((a) => a.namespace === namespace)
    if (kind) assets = assets.filter((a) => a.kind === kind)
    if (tag) assets = assets.filter((a) => a.tags.includes(tag as AssetTag))
    if (query) assets = assets.filter((a) => a.name.toLowerCase().includes(query))

    return { assets: assets.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
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
      if (existing) return existing

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
        // Generated artifacts skip quarantine: they never left the platform.
        state: 'committed',
        createdAt: new Date().toISOString(),
        sourceArtifactId: artifact.id,
      }
      state.assets.push(asset)
      artifact.assetId = asset.id
      return asset
    })
  })
}
