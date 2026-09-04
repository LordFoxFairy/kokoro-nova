import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { PermanentlyDeleteRecycledProjectResponseSchema, RestoreRecycledProjectResponseSchema } from '@/contracts/recycle-bin'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { findProject, readState, resetStore, withState } from '@/server/store'
import { GET as getCanvas } from '../../canvases/[canvasId]/route'
import { DELETE as deleteProject, GET as getProject } from '../../projects/[projectId]/route'
import { DELETE, POST } from './route'

const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) })

describe.sequential('recycle-bin restore and permanent delete', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('hides a recycled project and its canvases from normal query routes', async () => {
    const before = await readState()
    const canvasId = before.projects.find((item) => item.id === 'prj_video_demo')?.canvasIds[0]
    expect(canvasId).toBeTruthy()
    await deleteProject(new Request('http://localhost/api/projects/prj_video_demo', { method: 'DELETE' }), params('prj_video_demo'))

    const projectResponse = await getProject(new Request('http://localhost/api/projects/prj_video_demo'), params('prj_video_demo'))
    const canvasResponse = await getCanvas(new Request(`http://localhost/api/canvases/${canvasId}`), { params: Promise.resolve({ canvasId: canvasId as string }) })
    expect(projectResponse.status).toBe(404)
    expect(canvasResponse.status).toBe(404)
  })

  it('restores all retained canvases to the original folder', async () => {
    const before = await readState()
    const project = before.projects.find((item) => item.id === 'prj_video_demo')
    const canvasIds = project?.canvasIds
    await deleteProject(new Request('http://localhost/api/projects/prj_video_demo', { method: 'DELETE' }), params('prj_video_demo'))

    const restoredResponse = await POST(new Request('http://localhost/api/recycle-bin/prj_video_demo', { method: 'POST' }), params('prj_video_demo'))
    const restored = RestoreRecycledProjectResponseSchema.parse(await restoredResponse.json())
    expect(restoredResponse.status).toBe(200)
    expect(restored.project).toMatchObject({ id: 'prj_video_demo', folderId: project?.folderId ?? null })
    expect(restored.canvasCount).toBe(canvasIds?.length)

    const after = await readState()
    expect(findProject(after, 'prj_video_demo')?.canvasIds).toEqual(canvasIds)
    expect(after.canvases.filter((canvas) => canvas.projectId === 'prj_video_demo').map((canvas) => canvas.id)).toEqual(canvasIds)
  })

  it('falls back to the root when the original folder was deleted before restore', async () => {
    await withState((state) => {
      const project = state.projects.find((item) => item.id === 'prj_video_demo')
      if (!project) throw new Error('fixture project missing')
      state.folders.push({ id: 'fld_removed', spaceId: project.spaceId, name: '将被删除的文件夹', coverUrl: null, createdAt: project.createdAt, updatedAt: project.updatedAt })
      project.folderId = 'fld_removed'
    })
    await deleteProject(new Request('http://localhost/api/projects/prj_video_demo', { method: 'DELETE' }), params('prj_video_demo'))
    await withState((state) => { state.folders = state.folders.filter((folder) => folder.id !== 'fld_removed') })

    const restoredResponse = await POST(new Request('http://localhost/api/recycle-bin/prj_video_demo', { method: 'POST' }), params('prj_video_demo'))
    const restored = RestoreRecycledProjectResponseSchema.parse(await restoredResponse.json())
    expect(restored).toMatchObject({ restoredToRoot: true, project: { folderId: null } })
  })

  it('permanently deletes only a recycled project and all of its retained descendants', async () => {
    await deleteProject(new Request('http://localhost/api/projects/prj_video_demo', { method: 'DELETE' }), params('prj_video_demo'))
    const deletedResponse = await DELETE(new Request('http://localhost/api/recycle-bin/prj_video_demo', { method: 'DELETE' }), params('prj_video_demo'))
    expect(deletedResponse.status).toBe(200)
    expect(PermanentlyDeleteRecycledProjectResponseSchema.parse(await deletedResponse.json())).toEqual({
      deleted: 'prj_video_demo', permanentlyDeleted: true,
    })

    const state = await readState()
    expect(state.projects.some((project) => project.id === 'prj_video_demo')).toBe(false)
    expect(state.canvases.some((canvas) => canvas.projectId === 'prj_video_demo')).toBe(false)
    expect(state.sessions.some((session) => session.projectId === 'prj_video_demo')).toBe(false)
  })

  it('does not allow permanent deletion of an active project', async () => {
    const response = await DELETE(new Request('http://localhost/api/recycle-bin/prj_video_demo', { method: 'DELETE' }), params('prj_video_demo'))
    expect(response.status).toBe(404)
  })
})
