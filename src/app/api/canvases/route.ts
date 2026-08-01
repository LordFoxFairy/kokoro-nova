import { createCanvas } from '@/domain/factory'
import { HttpError, handle } from '@/server/http'
import { canvasesOfProject, findCanvas, findProject, withState } from '@/server/store'

export const dynamic = 'force-dynamic'

/**
 * Create a canvas inside a project, optionally as a copy of an existing one.
 * A copy is auto-named "<源画布名>副本N" and keeps the full document.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json()) as { projectId: string; name?: string; copyOf?: string }
    return withState((state) => {
      const project = findProject(state, body.projectId)
      if (!project) throw new HttpError(404, '项目不存在')

      const siblings = canvasesOfProject(state, project.id)
      let name = body.name?.trim()

      if (body.copyOf) {
        const source = findCanvas(state, body.copyOf)
        if (!source) throw new HttpError(404, '源画布不存在')
        let n = 1
        const taken = new Set(siblings.map((c) => c.name))
        while (taken.has(`${source.name}副本${n}`)) n += 1
        const canvas = createCanvas(project.id, name || `${source.name}副本${n}`)
        canvas.document = JSON.parse(JSON.stringify(source.document))
        state.canvases.push(canvas)
        project.canvasIds.push(canvas.id)
        return canvas
      }

      if (!name) {
        let n = siblings.length + 1
        const taken = new Set(siblings.map((c) => c.name))
        while (taken.has(`画布 ${n}`)) n += 1
        name = `画布 ${n}`
      }
      const canvas = createCanvas(project.id, name)
      state.canvases.push(canvas)
      project.canvasIds.push(canvas.id)
      return canvas
    })
  })
}
