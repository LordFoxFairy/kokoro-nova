import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { ProjectListLocalResponseSchema, CreateProjectResponseSchema } from '@/contracts/local'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET, POST } from './route'

function jsonRequest(body: string | unknown) {
  return new Request('http://localhost/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function expectJson(response: Response) {
  expect(response.headers.get('content-type')).toContain('application/json')
}

describe.sequential('/api/projects collection runtime contract', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('returns a schema-valid complete collection for the authenticated populated fixture', async () => {
    const response = await GET()
    const body = ProjectListLocalResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expectJson(response)
    expect(body.projects.map((project) => project.id)).toEqual([
      'prj_untitled_demo',
      'prj_doro_demo',
      'prj_video_demo',
    ])
    expect(body.projects.every((project) => project.canvasCount >= 1)).toBe(true)
    expect(body.folders).toEqual([])
    expect(body.balance).toBeTypeOf('number')
  })

  it('returns a schema-valid empty collection for the authenticated empty fixture', async () => {
    await resetStore('authenticated-empty')

    const response = await GET()
    const body = ProjectListLocalResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expectJson(response)
    expect(body).toEqual({ projects: [], folders: [], balance: 100 })
  })

  it('treats malformed JSON as the route’s empty create body and returns the created project and canvas', async () => {
    const response = await POST(jsonRequest('{'))
    const body = CreateProjectResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expectJson(response)
    expect(body.project).toMatchObject({
      name: '未命名项目 4',
      spaceId: 'sp_default',
      folderId: null,
      canvasIds: [body.canvas.id],
    })
    expect(body.canvas).toMatchObject({
      id: body.canvas.id,
      projectId: body.project.id,
      name: '画布 1',
    })
  })

  it('returns the documented ErrorResponse for unauthenticated reads and invalid folder input', async () => {
    await resetStore('anonymous')

    const unauthenticated = await GET()
    const unauthenticatedBody = LocalErrorEnvelopeSchema.parse(await unauthenticated.json())
    expect(unauthenticated.status).toBe(401)
    expectJson(unauthenticated)
    expect(unauthenticatedBody.error).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: '需要登录后访问私有项目',
    })
    expect(unauthenticatedBody.requestId).toEqual(expect.stringMatching(/^req_local_/))

    await resetStore('authenticated-empty')
    const invalidFolder = await POST(jsonRequest({ folderId: 'fld_missing' }))
    const invalidFolderBody = LocalErrorEnvelopeSchema.parse(await invalidFolder.json())
    expect(invalidFolder.status).toBe(400)
    expectJson(invalidFolder)
    expect(invalidFolderBody.error).toMatchObject({
      code: 'INVALID_INPUT',
      message: '目标文件夹不存在',
    })
    expect(invalidFolderBody.requestId).toEqual(expect.stringMatching(/^req_local_/))
  })
})
