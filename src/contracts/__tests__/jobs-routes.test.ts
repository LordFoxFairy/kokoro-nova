import { describe, expect, it } from 'vitest'

import { POST as createJob } from '@/app/api/jobs/route'
import { POST as transitionJob } from '@/app/api/jobs/[jobId]/route'

function request(url: string, body: string): Request {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
}

describe('Jobs route validation', () => {
  it('returns 400 for malformed JSON before invoking the job compiler', async () => {
    const response = await createJob(request('http://localhost/api/jobs', '{broken'))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_INPUT', message: expect.stringContaining('JSON') }, requestId: expect.any(String) })
  })

  it('returns 400 for missing create identifiers', async () => {
    const response = await createJob(request('http://localhost/api/jobs', JSON.stringify({ canvasId: '' })))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_INPUT', message: expect.stringContaining('canvasId') }, requestId: expect.any(String) })
  })

  it.each([{}, { action: 'poll' }, { action: 'future' }])(
    'rejects an unsupported POST transition instead of implicitly confirming it: %j',
    async (body) => {
      const response = await transitionJob(
        request('http://localhost/api/jobs/job_video_01', JSON.stringify(body)),
        { params: Promise.resolve({ jobId: 'job_video_01' }) },
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: { code: 'INVALID_INPUT', message: expect.stringContaining('action') }, requestId: expect.any(String) })
    },
  )
})
