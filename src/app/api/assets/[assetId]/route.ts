import { AssetLifecycleActionRequestSchema } from '@/contracts/assets'
import { setAssetLifecycle, assetLifecycleView } from '@/server/assets'
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

function readAssetFolders(state: WorkspaceState): AssetFolder[] {
  const stored = (state as WorkspaceState & { assetFolders?: AssetFolder[] }).assetFolders
  return Array.isArray(stored) ? stored : []
}

/** Rename/tags/folder and lifecycle are one PATCH contract so the UI can restore a soft-deleted row. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { assetId } = await params
    const raw = (await request.json()) as unknown
    const lifecycleAction = AssetLifecycleActionRequestSchema.safeParse(raw)
    return withState((state) => {
      const asset = state.assets.find((item) => item.id === assetId)
      if (!asset) throw new HttpError(404, '资产不存在')

      if (lifecycleAction.success) {
        if (lifecycleAction.data.action === 'restore') {
          const view = assetLifecycleView(state, asset)
          if (view.lifecycle.availability !== 'recoverable') throw new HttpError(409, '该资产当前不可恢复')
          asset.state = 'committed'
          return setAssetLifecycle(state, asset, 'active', 'available')
        }
        // Fixture-only failure state: bytes and URL stay untouched so a later
        // restore to active has no hidden data mutation.
        if (asset.state !== 'committed') throw new HttpError(409, '该资产当前不可标记为媒体失效')
        return setAssetLifecycle(state, asset, 'missing', 'media_url_unavailable')
      }

      const body = raw as { name?: string; tags?: unknown; folderId?: string | null }
      if (asset.state === 'revoked') throw new HttpError(410, '资产已删除')
      if (assetLifecycleView(state, asset).lifecycle.availability !== 'active') {
        throw new HttpError(409, '资产媒体不可用')
      }

      if (typeof body.name === 'string') {
        const name = body.name.trim()
        if (name) asset.name = name
      }
      if (body.tags !== undefined) {
        if (!Array.isArray(body.tags)) throw new HttpError(400, '标签需要是数组')
        const invalid = body.tags.find((tag) => !isAssetTag(tag))
        if (invalid !== undefined) throw new HttpError(400, `标签不存在：${String(invalid)}`)
        const requested = body.tags as AssetTag[]
        asset.tags = ASSET_TAGS.filter((tag) => requested.includes(tag))
      }
      if (body.folderId !== undefined) {
        if (body.folderId !== null && !readAssetFolders(state).some((folder) => folder.id === body.folderId)) {
          throw new HttpError(404, '文件夹不存在')
        }
        asset.folderId = body.folderId
      }
      return assetLifecycleView(state, asset)
    })
  })
}

/** Soft deletion retains the row and source IDs, exposing a recoverable lifecycle. */
export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { assetId } = await params
    return withState((state) => {
      const asset = state.assets.find((item) => item.id === assetId)
      if (!asset) throw new HttpError(404, '资产不存在')
      asset.state = 'revoked'
      return setAssetLifecycle(state, asset, 'recoverable', 'deleted_by_user')
    })
  })
}
