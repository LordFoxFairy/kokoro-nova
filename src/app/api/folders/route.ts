import { ids } from '@/domain/ids'
import type { Folder } from '@/domain/types'
import { handle } from '@/server/http'
import { DEFAULT_SPACE_ID, withState } from '@/server/store'
import { requireLocalAuthentication } from '@/server/identity'

export const dynamic = 'force-dynamic'

/**
 * 新建文件夹 creates "未命名文件夹" immediately — there is no naming form
 * before creation, so this endpoint takes no required body.
 */
export async function POST() {
  return handle(async () => {
    await requireLocalAuthentication()
    return withState((state) => {
      const now = new Date().toISOString()
      const folder: Folder = {
        id: ids.folder(),
        spaceId: DEFAULT_SPACE_ID,
        name: '未命名文件夹',
        coverUrl: null,
        createdAt: now,
        updatedAt: now,
      }
      state.folders.push(folder)
      return folder
    })
  })
}
