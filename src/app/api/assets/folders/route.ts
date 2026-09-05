import { AssetFolderListResponseSchema } from '@/contracts/assets'
import { newId } from '@/domain/ids'
import { handle } from '@/server/http'
import { DEFAULT_SPACE_ID, readState, withState, type WorkspaceState } from '@/server/store'

export const dynamic = 'force-dynamic'

/**
 * Grouping container for library assets. Distinct from `state.folders`, which
 * groups projects: the two live in different navigation trees and an asset may
 * sit in an asset folder while its project sits in a project folder.
 */
export interface AssetFolder {
  id: string
  spaceId: string
  name: string
  createdAt: string
  updatedAt: string
}

/*
 * Persistence constraint: `WorkspaceState` is owned by src/server/store.ts and
 * that module is closed to this feature, so asset folders cannot get a declared
 * field. They are instead stored on the very same persisted object under an
 * extra key that this route attaches at runtime — `withState` serialises and
 * writes the whole object, so the key survives restarts like any other field.
 *
 * The consequence every reader must respect: a workspace.json written before
 * this route existed (or one reset by `resetStore`) has no such key, so it is
 * optional on read and only materialised on the first write.
 */
type FolderCarrier = WorkspaceState & { assetFolders?: AssetFolder[] }

function readAssetFolders(state: WorkspaceState): AssetFolder[] {
  const stored = (state as FolderCarrier).assetFolders
  return Array.isArray(stored) ? stored : []
}

function ensureAssetFolders(state: WorkspaceState): AssetFolder[] {
  const carrier = state as FolderCarrier
  if (!Array.isArray(carrier.assetFolders)) carrier.assetFolders = []
  return carrier.assetFolders
}

export async function GET() {
  return handle(async () => {
    const state = await readState()
    const folders = readAssetFolders(state)
      .filter((f) => f.spaceId === DEFAULT_SPACE_ID)
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    // Counts travel with the listing so the panel can label a folder without
    // fetching its contents; revoked assets are already invisible to the client.
    const counts: Record<string, number> = {}
    for (const folder of folders) counts[folder.id] = 0
    for (const asset of state.assets) {
      if (asset.state === 'revoked' || !asset.folderId) continue
      if (counts[asset.folderId] !== undefined) counts[asset.folderId] += 1
    }

    return AssetFolderListResponseSchema.parse({ folders, counts })
  })
}

/**
 * 新建文件夹 creates "未命名文件夹" immediately: the panel offers no naming form
 * before creation, so this endpoint takes no body.
 */
export async function POST() {
  return handle(async () =>
    withState((state) => {
      const now = new Date().toISOString()
      const folder: AssetFolder = {
        // Own prefix: an asset folder id must never be mistaken for a project
        // folder id, since they index different collections.
        id: newId('afld'),
        spaceId: DEFAULT_SPACE_ID,
        name: '未命名文件夹',
        createdAt: now,
        updatedAt: now,
      }
      ensureAssetFolders(state).push(folder)
      return folder
    }),
  )
}
