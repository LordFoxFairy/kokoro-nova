import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { POST as updateSession } from '../../identity/route'
import { POST as createProject, GET as listProjects } from '../../projects/route'
import { POST as createFolder } from '../route'
import { DELETE } from './route'

const FolderDeleteResponseSchema = z.object({
  deleted: z.string().min(1),
  deletedProjects: z.number().int().nonnegative(),
}).strict()

const params = (folderId: string) => ({ params: Promise.resolve({ folderId }) })

function deleteRequest(folderId: string, confirmName: string) {
  return new Request(`http://localhost/api/folders/${folderId}?confirmName=${encodeURIComponent(confirmName)}`, {
    method: 'DELETE',
  })
}

function sessionRequest(action: 'signIn' | 'signOut') {
  return new Request('http://localhost/api/identity', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, returnTo: '/project' }),
  })
}

describe.sequential('DELETE /api/folders/[folderId]', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
    await updateSession(sessionRequest('signIn'))
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
    await updateSession(sessionRequest('signIn'))
  })

  it('permanently removes an active folder and projects its active children out of the project list', async () => {
    const folderResponse = await createFolder()
    const folder = await folderResponse.json() as { id: string; name: string }
    const projectResponse = await createProject(new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '待随文件夹删除的项目', folderId: folder.id }),
    }))
    const project = await projectResponse.json() as { project: { id: string } }

    const response = await DELETE(deleteRequest(folder.id, folder.name), params(folder.id))
    const body = FolderDeleteResponseSchema.parse(await response.json())
    const listed = await listProjects()
    const projects = await listed.json() as { projects: Array<{ id: string }>; folders: Array<{ id: string }> }

    expect(response.status).toBe(200)
    expect(body).toEqual({ deleted: folder.id, deletedProjects: 1 })
    expect(projects.folders).not.toContainEqual(expect.objectContaining({ id: folder.id }))
    expect(projects.projects).not.toContainEqual(expect.objectContaining({ id: project.project.id }))
  })

  it('enforces confirmation, authentication, and the standard not-found envelope', async () => {
    const folderResponse = await createFolder()
    const folder = await folderResponse.json() as { id: string; name: string }

    const mismatch = await DELETE(deleteRequest(folder.id, '错误名称'), params(folder.id))
    expect(mismatch.status).toBe(400)
    expect(LocalErrorEnvelopeSchema.parse(await mismatch.json()).error).toMatchObject({
      code: 'INVALID_INPUT', message: '需要输入完整文件夹名才能删除',
    })

    await updateSession(sessionRequest('signOut'))
    const anonymous = await DELETE(deleteRequest(folder.id, folder.name), params(folder.id))
    expect(anonymous.status).toBe(401)
    expect(LocalErrorEnvelopeSchema.parse(await anonymous.json()).error.code).toBe('UNAUTHENTICATED')

    await updateSession(sessionRequest('signIn'))
    const missing = await DELETE(deleteRequest('fld_missing', '不存在'), params('fld_missing'))
    expect(missing.status).toBe(404)
    expect(LocalErrorEnvelopeSchema.parse(await missing.json()).error).toMatchObject({ code: 'NOT_FOUND', message: '文件夹不存在' })
  })
})
