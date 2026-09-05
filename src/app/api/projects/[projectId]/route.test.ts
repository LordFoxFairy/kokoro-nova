import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { CanvasSchema, ProjectSchema } from '@/contracts/local'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { POST as updateSession } from '../../identity/route'
import { GET } from './route'

const ProjectDetailResponseSchema = z.object({
  project: ProjectSchema,
  canvases: z.array(CanvasSchema),
  balance: z.number().finite(),
}).strict()

const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) })

function sessionRequest(action: 'signIn' | 'signOut') {
  return new Request('http://localhost/api/identity', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, returnTo: '/project' }),
  })
}

describe.sequential('GET /api/projects/[projectId]', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
    await updateSession(sessionRequest('signIn'))
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
    await updateSession(sessionRequest('signIn'))
  })

  it('returns the typed project, canvas, and wallet projection for a private project', async () => {
    const response = await GET(new Request('http://localhost/api/projects/prj_video_demo'), params('prj_video_demo'))
    const body = ProjectDetailResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(body.project).toMatchObject({ id: 'prj_video_demo', spaceId: 'sp_default' })
    expect(body.canvases.map((canvas) => canvas.id)).toEqual(body.project.canvasIds)
    expect(body.balance).toBeGreaterThanOrEqual(0)
  })

  it('enforces authenticated access and distinguishes the session-expired and not-found projections', async () => {
    await updateSession(sessionRequest('signOut'))
    const anonymous = await GET(new Request('http://localhost/api/projects/prj_video_demo'), params('prj_video_demo'))
    expect(anonymous.status).toBe(401)
    expect(LocalErrorEnvelopeSchema.parse(await anonymous.json()).error).toMatchObject({
      code: 'UNAUTHENTICATED', message: '需要登录后访问私有项目',
    })

    await updateSession(sessionRequest('signIn'))
    const missing = await GET(new Request('http://localhost/api/projects/prj_missing'), params('prj_missing'))
    expect(missing.status).toBe(404)
    expect(LocalErrorEnvelopeSchema.parse(await missing.json()).error).toMatchObject({ code: 'NOT_FOUND', message: '项目不存在' })

    await resetStore('session-expired')
    const expired = await GET(new Request('http://localhost/api/projects/prj_video_demo'), params('prj_video_demo'))
    expect(expired.status).toBe(401)
    expect(LocalErrorEnvelopeSchema.parse(await expired.json()).error).toMatchObject({
      code: 'UNAUTHENTICATED', message: '会话已过期，请刷新页面',
    })
  })
})
