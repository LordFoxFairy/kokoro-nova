import { createCanvas } from '@/domain/factory'
import { ids } from '@/domain/ids'
import { isProjectFixtureCoverUrl } from '@/contracts/project'
import { HttpError, handle } from '@/server/http'
import { activeScenarioId, canvasesOfProject, findProject, findProjectFolder, readState, recycleProjects, withState } from '@/server/store'
import { requireLocalAuthentication } from '@/server/identity'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ projectId: string }> }

function validFolderId(
  state: Parameters<typeof findProjectFolder>[0],
  folderId: unknown,
  spaceId: string,
): string | null {
  if (folderId === null) return null
  if (typeof folderId !== 'string' || !folderId || !findProjectFolder(state, folderId, spaceId)) {
    throw new HttpError(400, '目标文件夹不存在')
  }
  return folderId
}

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireLocalAuthentication()
    if ((await activeScenarioId()) === 'session-expired') {
      throw new HttpError(401, '会话已过期，请刷新页面')
    }
    const { projectId } = await params
    const state = await readState()
    const project = findProject(state, projectId)
    if (!project) throw new HttpError(404, '项目不存在')
    return {
      project,
      canvases: canvasesOfProject(state, projectId),
      balance: state.balances[project.spaceId] ?? 0,
    }
  })
}

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireLocalAuthentication()
    const { projectId } = await params
    const body = (await request.json()) as { name?: string; folderId?: string | null; coverUrl?: string | null }
    return withState((state) => {
      const project = findProject(state, projectId)
      if (!project) throw new HttpError(404, '项目不存在')
      if (typeof body.name === 'string') {
        const name = body.name.trim()
        // An empty rename silently keeps the old name rather than erroring.
        if (name) project.name = name
      }
      if (body.folderId !== undefined) project.folderId = validFolderId(state, body.folderId, project.spaceId)
      if (body.coverUrl !== undefined) {
        if (body.coverUrl !== null && (typeof body.coverUrl !== 'string' || !isProjectFixtureCoverUrl(body.coverUrl))) {
          throw new HttpError(400, 'coverUrl 必须是本地示例封面')
        }
        project.coverUrl = body.coverUrl
      }
      project.updatedAt = new Date().toISOString()
      return project
    })
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireLocalAuthentication()
    const { projectId } = await params
    return withState((state) => {
      const project = findProject(state, projectId)
      if (!project) throw new HttpError(404, '项目不存在')
      recycleProjects(state, [projectId])
      return { deleted: projectId, recycled: true }
    })
  })
}

/** 创建副本 — copies the project and every canvas document inside it. */
export async function PUT(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireLocalAuthentication()
    const { projectId } = await params
    return withState((state) => {
      const project = findProject(state, projectId)
      if (!project) throw new HttpError(404, '项目不存在')
      const now = new Date().toISOString()
      const {
        recycledAt: _recycledAt,
        recycleExpiresAt: _recycleExpiresAt,
        recycleOriginalFolderId: _recycleOriginalFolderId,
        ...activeProject
      } = project
      const copy = {
        ...activeProject,
        id: ids.project(),
        name: `${project.name}副本`,
        createdAt: now,
        updatedAt: now,
        canvasIds: [] as string[],
      }
      for (const canvas of canvasesOfProject(state, projectId)) {
        const duplicate = createCanvas(copy.id, canvas.name)
        // Deep copy so the two projects never share node objects.
        duplicate.document = JSON.parse(JSON.stringify(canvas.document))
        state.canvases.push(duplicate)
        copy.canvasIds.push(duplicate.id)
      }
      state.projects.push(copy)
      return copy
    })
  })
}
