import { describe, expect, it } from 'vitest'

import { ApiError, createApiClient, type JsonTransport } from '@/api/client'
import { HOME_DISCOVERY_CATALOG } from '@/mocks/home'
import { buildVideoWorkspace } from '@/mocks/scenarios/video-project'

function json(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, init)
}

describe('createApiClient', () => {
  it('decodes the typed home discovery response through the injected transport', async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = []
    const payload = {
      ...HOME_DISCOVERY_CATALOG,
      account: { credits: 408, unreadCount: 1, membershipLabel: '开通会员' },
      recentProjects: [],
    }
    const transport: JsonTransport = async (input, init) => {
      seen.push({ url: String(input), init })
      return json(payload)
    }

    const result = await createApiClient(transport).home.get()

    expect(result).toEqual(payload)
    expect(seen).toEqual([{ url: '/api/home', init: undefined }])
  })

  it('decodes the typed project listing through the injected transport', async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = []
    const transport: JsonTransport = async (input, init) => {
      seen.push({ url: String(input), init })
      return json({ projects: [], folders: [], balance: 20 })
    }

    const result = await createApiClient(transport).projects.list()

    expect(result).toEqual({ projects: [], folders: [], balance: 20 })
    expect(seen).toEqual([{ url: '/api/projects', init: undefined }])
  })

  it('rejects malformed successful data at the typed endpoint boundary', async () => {
    const transport: JsonTransport = async () => json({ projects: 'not-an-array', folders: [], balance: 20 })

    await expect(createApiClient(transport).projects.list()).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      code: 'INVALID_DATA',
    })
  })

  it('maps a 409 response to the stable revision-conflict code', async () => {
    const transport: JsonTransport = async () => json({ error: '画布版本冲突：期望 7，当前 8' }, { status: 409 })

    await expect(createApiClient(transport).raw.post('/api/canvases/can_video_main', {})).rejects.toEqual(
      expect.objectContaining({
        status: 409,
        code: 'REVISION_CONFLICT',
        message: '画布版本冲突：期望 7，当前 8',
      }),
    )
  })

  it('maps malformed JSON to a transport error instead of throwing SyntaxError', async () => {
    const transport: JsonTransport = async () => new Response('{broken', { status: 200 })

    await expect(createApiClient(transport).raw.get('/api/projects')).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      code: 'INVALID_JSON',
    })
  })

  it('sends JSON content type and preserves caller headers', async () => {
    let captured: RequestInit | undefined
    const transport: JsonTransport = async (_input, init) => {
      captured = init
      return json({ ok: true })
    }

    await createApiClient(transport).raw.post('/api/example', { value: 1 }, { 'X-Scenario': 'video-running' })

    expect(captured?.method).toBe('POST')
    expect(captured?.body).toBe('{"value":1}')
    expect(new Headers(captured?.headers)).toMatchObject(
      expect.objectContaining({}),
    )
    expect(new Headers(captured?.headers).get('Content-Type')).toBe('application/json')
    expect(new Headers(captured?.headers).get('X-Scenario')).toBe('video-running')
  })

  it('keeps ApiError compatible with existing status/message checks', () => {
    const error = new ApiError(404, '项目不存在')
    expect(error).toMatchObject({ name: 'ApiError', status: 404, code: 'NOT_FOUND', message: '项目不存在' })
  })

  it('exposes exact typed Jobs list/create/get/transition methods', async () => {
    const state = buildVideoWorkspace('running')
    const job = state.jobs.find((item) => item.id === 'job_video_01')
    if (!job) throw new Error('fixture job missing')
    const seen: Array<{ url: string; method?: string; body?: string }> = []
    const transport: JsonTransport = async (input, init) => {
      const url = String(input)
      seen.push({ url, method: init?.method, body: typeof init?.body === 'string' ? init.body : undefined })
      if (url === '/api/jobs' || url.startsWith('/api/jobs?')) {
        return init?.method === 'POST' ? json({ job }) : json({ jobs: state.jobs })
      }
      if (init?.method === 'POST') return json({ job, balance: 408 })
      return json({ job, revision: 7, document: null, balance: 408 })
    }
    const jobs = createApiClient(transport).jobs

    await expect(jobs.list('can video')).resolves.toEqual({ jobs: state.jobs })
    await expect(jobs.create({ canvasId: 'can_video_main', nodeId: 'node_video_01' })).resolves.toEqual({ job })
    await expect(jobs.get('job/video')).resolves.toMatchObject({ job, revision: 7, document: null })
    await expect(jobs.transition('job_video_01', 'cancel')).resolves.toEqual({ job, balance: 408 })

    expect(seen).toEqual([
      { url: '/api/jobs?canvasId=can%20video', method: undefined, body: undefined },
      {
        url: '/api/jobs',
        method: 'POST',
        body: '{"canvasId":"can_video_main","nodeId":"node_video_01"}',
      },
      { url: '/api/jobs/job%2Fvideo', method: undefined, body: undefined },
      { url: '/api/jobs/job_video_01', method: 'POST', body: '{"action":"cancel"}' },
    ])
  })

  it('rejects malformed Jobs responses and unsupported transition actions at the client boundary', async () => {
    const transport: JsonTransport = async () => json({ ok: true })
    const jobs = createApiClient(transport).jobs

    await expect(jobs.list()).rejects.toMatchObject({ status: 502, code: 'INVALID_DATA' })
    expect(() => jobs.transition('job_fixture', 'poll' as 'confirm')).toThrow()
  })
})
