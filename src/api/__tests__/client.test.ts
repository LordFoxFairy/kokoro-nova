import { describe, expect, it } from 'vitest'

import { ApiError, createApiClient, type JsonTransport } from '@/api/client'

function json(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, init)
}

describe('createApiClient', () => {
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
})
