import { HttpError, handle } from '@/server/http'
import { deleteProjects, findStoredProject, restoreProject, withState } from '@/server/store'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ projectId: string }> }

/** Restore a recycled project. Its retained canvases are immediately readable again. */
export async function POST(_request: Request, { params }: Params) {
  return handle(async () => {
    const { projectId } = await params
    return withState((state) => {
      const restored = restoreProject(state, projectId)
      if (!restored) throw new HttpError(404, '回收站中不存在该项目')
      return {
        project: restored,
        restoredToRoot: restored.folderId === null,
        canvasCount: restored.canvasIds.filter((canvasId) => state.canvases.some((canvas) => canvas.id === canvasId)).length,
      }
    })
  })
}

/** Irreversibly remove a project and its retained canvases/session history. */
export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { projectId } = await params
    return withState((state) => {
      const project = findStoredProject(state, projectId)
      if (!project || !project.recycledAt) throw new HttpError(404, '回收站中不存在该项目')
      deleteProjects(state, [projectId])
      return { deleted: projectId, permanentlyDeleted: true }
    })
  })
}
