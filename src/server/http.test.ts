import { describe, expect, it } from 'vitest'

import { HttpError, handle } from '@/server/http'

describe('handle', () => {
  it('serializes an HttpError as the documented ErrorResponse envelope', async () => {
    const response = await handle(async () => {
      throw new HttpError(404, '本地团队成员不存在')
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: { code: 'NOT_FOUND', message: '本地团队成员不存在' },
      requestId: expect.stringMatching(/^req_local_[a-z0-9_]+$/),
    })
  })
})

  it('uses the documented service-unavailable code for a 503 HttpError', async () => {
    const response = await handle(async () => {
      throw new HttpError(503, '本地素材目录暂时不可用')
    })

    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'SERVICE_UNAVAILABLE', message: '本地素材目录暂时不可用' },
    })
  })
