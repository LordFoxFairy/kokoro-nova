import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { POST as createFolder } from '../folders/route'
import { PATCH as updateFolder } from '../folders/[folderId]/route'
import { POST as updateLocalSession } from '../identity/route'
import { POST as restoreProject } from '../recycle-bin/[projectId]/route'
import { DELETE as recycleProject, PATCH, PUT } from './[projectId]/route'
import { GET as listProjects, POST as createProject } from './route'

const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) })
const fixtureCover = '/fixtures/libtv/media/city-night-poster.webp'

describe.sequential('project lifecycle persistence', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('persists a fixture cover through copy, reload, validated move, recycle and restore', async () => {
    const sourceId = 'prj_video_demo'
    const coverResponse = await PATCH(
      new Request(`http://localhost/api/projects/${sourceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ coverUrl: fixtureCover }),
      }),
      params(sourceId),
    )
    expect(coverResponse.status).toBe(200)

    const copyResponse = await PUT(new Request(`http://localhost/api/projects/${sourceId}`, { method: 'PUT' }), params(sourceId))
    expect(copyResponse.status).toBe(200)
    const copy = await copyResponse.json() as { id: string; coverUrl: string | null }
    expect(copy.coverUrl).toBe(fixtureCover)

    const folderResponse = await createFolder()
    const folder = await folderResponse.json() as { id: string }
    const moveResponse = await PATCH(
      new Request(`http://localhost/api/projects/${copy.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ folderId: folder.id }),
      }),
      params(copy.id),
    )
    expect(moveResponse.status).toBe(200)

    const reloaded = await listProjects()
    const reloadedProjects = (await reloaded.json() as { projects: Array<{ id: string; folderId: string | null; coverUrl: string | null }> }).projects
    expect(reloadedProjects).toContainEqual(expect.objectContaining({ id: copy.id, folderId: folder.id, coverUrl: fixtureCover }))

    expect((await recycleProject(new Request(`http://localhost/api/projects/${copy.id}`, { method: 'DELETE' }), params(copy.id))).status).toBe(200)
    const restored = await restoreProject(new Request(`http://localhost/api/recycle-bin/${copy.id}`, { method: 'POST' }), params(copy.id))
    expect(restored.status).toBe(200)

    const afterRestore = await listProjects()
    const restoredProjects = (await afterRestore.json() as { projects: Array<{ id: string; folderId: string | null; coverUrl: string | null }> }).projects
    expect(restoredProjects).toContainEqual(expect.objectContaining({ id: copy.id, folderId: folder.id, coverUrl: fixtureCover }))
  })

  it('rejects project creation and moves to nonexistent folders', async () => {
    const created = await createProject(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        body: JSON.stringify({ folderId: 'fld_missing' }),
      }),
    )
    expect(created.status).toBe(400)
    expect((await created.json())).toEqual({ error: '目标文件夹不存在' })

    const moved = await PATCH(
      new Request('http://localhost/api/projects/prj_video_demo', {
        method: 'PATCH',
        body: JSON.stringify({ folderId: 'fld_missing' }),
      }),
      params('prj_video_demo'),
    )
    expect(moved.status).toBe(400)
    expect((await moved.json())).toEqual({ error: '目标文件夹不存在' })
  })

  it('keeps folder cover updates in the documented PATCH contract', async () => {
    const created = await createFolder()
    const folder = await created.json() as { id: string }
    const updated = await updateFolder(
      new Request(`http://localhost/api/folders/${folder.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ coverUrl: fixtureCover }),
      }),
      { params: Promise.resolve({ folderId: folder.id }) },
    )

    expect(updated.status).toBe(200)
    expect(await updated.json()).toMatchObject({ id: folder.id, coverUrl: fixtureCover })

    const invalid = await updateFolder(
      new Request(`http://localhost/api/folders/${folder.id}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ folderId: folder.id }) },
    )
    expect(invalid.status).toBe(400)
  })

  it('rejects private project reads after the local identity session is signed out', async () => {
    await updateLocalSession(new Request('http://localhost/api/identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signOut', returnTo: '/project' }),
    }))
    const response = await listProjects()
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: '需要登录后访问私有项目' })
  })
})
