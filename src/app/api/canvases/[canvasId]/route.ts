import { applyMutations } from '@/domain/mutations'
import type { MutationRequest } from '@/domain/types'
import { HttpError, handle } from '@/server/http'
import { findCanvas, readState, withState } from '@/server/store'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ canvasId: string }> }

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { canvasId } = await params
    const state = await readState()
    const canvas = findCanvas(state, canvasId)
    if (!canvas) throw new HttpError(404, '画布不存在')
    const project = state.projects.find((p) => p.id === canvas.projectId)
    const jobs = state.jobs.filter((j) => j.canvasId === canvasId)
    return {
      canvas,
      project,
      jobs,
      balance: project ? state.balances[project.spaceId] ?? 0 : 0,
    }
  })
}

/**
 * The single write path into a workflow document.
 *
 * `expectedRevision` is an optimistic lock: a client that fell behind gets a
 * 409 with the current document so it can rebase instead of clobbering.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { canvasId } = await params
    const body = (await request.json()) as MutationRequest
    return withState((state) => {
      const canvas = findCanvas(state, canvasId)
      if (!canvas) throw new HttpError(404, '画布不存在')

      if (typeof body.expectedRevision === 'number' && body.expectedRevision !== canvas.revision) {
        throw new HttpError(409, `画布版本冲突：期望 ${body.expectedRevision}，当前 ${canvas.revision}`)
      }

      // applyMutations validates and throws before anything is committed.
      canvas.document = applyMutations(canvas.document, body.mutations ?? [])
      canvas.revision += 1
      canvas.updatedAt = new Date().toISOString()

      const project = state.projects.find((p) => p.id === canvas.projectId)
      if (project) project.updatedAt = canvas.updatedAt

      return { revision: canvas.revision, document: canvas.document }
    })
  })
}

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { canvasId } = await params
    const body = (await request.json()) as { name?: string }
    return withState((state) => {
      const canvas = findCanvas(state, canvasId)
      if (!canvas) throw new HttpError(404, '画布不存在')
      if (typeof body.name === 'string' && body.name.trim()) {
        canvas.name = body.name.trim()
        canvas.updatedAt = new Date().toISOString()
      }
      return canvas
    })
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { canvasId } = await params
    return withState((state) => {
      const canvas = findCanvas(state, canvasId)
      if (!canvas) throw new HttpError(404, '画布不存在')
      const project = state.projects.find((p) => p.id === canvas.projectId)
      if (!project) throw new HttpError(404, '项目不存在')
      // The last canvas of a project cannot be deleted — the delete action is
      // disabled in the switcher for exactly this reason.
      if (project.canvasIds.length <= 1) {
        throw new HttpError(400, '项目至少需要保留一个画布')
      }
      project.canvasIds = project.canvasIds.filter((id) => id !== canvasId)
      state.canvases = state.canvases.filter((c) => c.id !== canvasId)
      return { deleted: canvasId, canvasIds: project.canvasIds }
    })
  })
}
