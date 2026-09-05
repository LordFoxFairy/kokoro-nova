import { UpdateFolderRequestSchema } from '@/contracts/local'
import { HttpError, handle, parseJsonBody } from '@/server/http'
import { deleteProjects, isProjectRecycled, withState } from '@/server/store'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ folderId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { folderId } = await params
    const body = await parseJsonBody(request, UpdateFolderRequestSchema)
    return withState((state) => {
      const folder = state.folders.find((f) => f.id === folderId)
      if (!folder) throw new HttpError(404, '文件夹不存在')
      if (typeof body.name === 'string') {
        const name = body.name.trim()
        if (name) folder.name = name
      }
      if (body.coverUrl !== undefined) folder.coverUrl = body.coverUrl
      folder.updatedAt = new Date().toISOString()
      return folder
    })
  })
}

/**
 * Deleting a folder permanently deletes the projects inside it, so the client
 * requires the exact folder name to be typed. The server re-checks it — a
 * client-side-only guard would be bypassable.
 */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const { folderId } = await params
    const url = new URL(request.url)
    const confirmName = url.searchParams.get('confirmName') ?? ''
    return withState((state) => {
      const folder = state.folders.find((f) => f.id === folderId)
      if (!folder) throw new HttpError(404, '文件夹不存在')
      if (confirmName !== folder.name) {
        throw new HttpError(400, '需要输入完整文件夹名才能删除')
      }
      const removed = deleteProjects(
        state,
        state.projects.filter((p) => p.folderId === folderId && !isProjectRecycled(p)).map((p) => p.id),
      )
      state.folders = state.folders.filter((f) => f.id !== folderId)
      return { deleted: folderId, deletedProjects: removed.length }
    })
  })
}
