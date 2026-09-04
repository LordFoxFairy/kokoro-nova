import { ids } from '@/domain/ids'
import { createCanvas } from '@/domain/factory'
import type { Project } from '@/domain/types'
import { handle } from '@/server/http'
import { DEFAULT_SPACE_ID, canvasesOfProject, isProjectRecycled, readState, withState } from '@/server/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(async () => {
    const state = await readState()
    const projects = state.projects
      .filter((p) => p.spaceId === DEFAULT_SPACE_ID && !isProjectRecycled(p))
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((p) => ({
        ...p,
        canvasCount: canvasesOfProject(state, p.id).length,
      }))
    const folders = state.folders
      .filter((f) => f.spaceId === DEFAULT_SPACE_ID)
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((f) => ({
        ...f,
        projectCount: state.projects.filter((p) => p.folderId === f.id && !isProjectRecycled(p)).length,
      }))
    return { projects, folders, balance: state.balances[DEFAULT_SPACE_ID] ?? 0 }
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json().catch(() => ({}))) as { name?: string; folderId?: string | null }
    return withState((state) => {
      const now = new Date().toISOString()
      const existing = state.projects.filter((p) => p.spaceId === DEFAULT_SPACE_ID && !isProjectRecycled(p)).length
      const project: Project = {
        id: ids.project(),
        spaceId: DEFAULT_SPACE_ID,
        folderId: body.folderId ?? null,
        name: body.name?.trim() || `未命名项目 ${existing + 1}`,
        coverUrl: null,
        createdAt: now,
        updatedAt: now,
        canvasIds: [],
      }
      // Every new project starts with 画布 1, matching the observed default.
      const canvas = createCanvas(project.id, '画布 1')
      project.canvasIds = [canvas.id]
      state.projects.push(project)
      state.canvases.push(canvas)
      return { project, canvas }
    })
  })
}
