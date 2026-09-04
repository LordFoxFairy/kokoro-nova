import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { ListRecycleBinResponseSchema } from '@/contracts/recycle-bin'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { readState, resetStore } from '@/server/store'
import { DELETE as deleteProject } from '../projects/[projectId]/route'
import { GET } from './route'

const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) })

describe.sequential('GET /api/recycle-bin', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('lists a soft-deleted project with 30-day retention while preserving its canvases', async () => {
    const before = await readState()
    const source = before.projects.find((project) => project.id === 'prj_video_demo')
    expect(source).toBeDefined()
    const sourceCanvases = before.canvases.filter((canvas) => canvas.projectId === source?.id)

    const removed = await deleteProject(new Request('http://localhost/api/projects/prj_video_demo', { method: 'DELETE' }), params('prj_video_demo'))
    expect(removed.status).toBe(200)
    expect(await removed.json()).toEqual({ deleted: 'prj_video_demo', recycled: true })

    const response = await GET()
    const body = ListRecycleBinResponseSchema.parse(await response.json())
    expect(response.status).toBe(200)
    expect(body.purgedProjectIds).toEqual([])
    expect(body.projects).toHaveLength(1)
    expect(body.projects[0]).toMatchObject({
      id: 'prj_video_demo',
      canvasCount: sourceCanvases.length,
      daysRemaining: 30,
      recycleOriginalFolderId: source?.folderId ?? null,
    })

    const retained = await readState()
    expect(retained.canvases.filter((canvas) => canvas.projectId === 'prj_video_demo')).toEqual(sourceCanvases)
  })
})
