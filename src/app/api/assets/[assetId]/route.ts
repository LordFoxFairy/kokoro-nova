import type { AssetTag } from '@/domain/types'
import { HttpError, handle } from '@/server/http'
import { withState, type WorkspaceState } from '@/server/store'
import type { AssetFolder } from '../folders/route'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ assetId: string }> }

/** Mirror of the `AssetTag` union; a union has no runtime form to validate against. */
const ASSET_TAGS: AssetTag[] = ['其它', '人物', '场景', '物品', '风格', '音效']

function isAssetTag(value: unknown): value is AssetTag {
  return typeof value === 'string' && (ASSET_TAGS as string[]).includes(value)
}

/**
 * Asset folders live under a runtime-attached key on the workspace state —
 * see the comment in ../folders/route.ts. Absent on a store that never created
 * a folder, so an empty list is the correct fallback rather than an error.
 */
function readAssetFolders(state: WorkspaceState): AssetFolder[] {
  const stored = (state as WorkspaceState & { assetFolders?: AssetFolder[] }).assetFolders
  return Array.isArray(stored) ? stored : []
}

/** 重命名 / 修改标签 / 移动到文件夹 — each field is applied only when present. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { assetId } = await params
    const body = (await request.json()) as {
      name?: string
      tags?: unknown
      folderId?: string | null
    }
    return withState((state) => {
      const asset = state.assets.find((a) => a.id === assetId)
      if (!asset) throw new HttpError(404, '资产不存在')
      if (asset.state === 'revoked') throw new HttpError(410, '资产已删除')

      if (typeof body.name === 'string') {
        const name = body.name.trim()
        // An empty rename silently keeps the old name rather than erroring.
        if (name) asset.name = name
      }

      if (body.tags !== undefined) {
        if (!Array.isArray(body.tags)) throw new HttpError(400, '标签需要是数组')
        const invalid = body.tags.find((tag) => !isAssetTag(tag))
        if (invalid !== undefined) throw new HttpError(400, `标签不存在：${String(invalid)}`)
        const requested = body.tags as AssetTag[]
        // Rebuild from the canonical order so duplicates collapse and the chip
        // row reads the same no matter what order the client sent.
        asset.tags = ASSET_TAGS.filter((tag) => requested.includes(tag))
      }

      if (body.folderId !== undefined) {
        if (body.folderId !== null && !readAssetFolders(state).some((f) => f.id === body.folderId)) {
          throw new HttpError(404, '文件夹不存在')
        }
        asset.folderId = body.folderId
      }

      return asset
    })
  })
}

/**
 * Soft delete. Artifacts keep the id of the asset they were registered as, and
 * nodes keep asset references, so dropping the row would leave both pointing at
 * nothing; revoking hides it from every listing while the links stay resolvable.
 */
export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { assetId } = await params
    return withState((state) => {
      const asset = state.assets.find((a) => a.id === assetId)
      if (!asset) throw new HttpError(404, '资产不存在')
      asset.state = 'revoked'
      return asset
    })
  })
}
