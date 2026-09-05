import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import requestExample from '../../../docs/api/examples/compose.request.json'
import responseExample from '../../../docs/api/examples/compose.response.json'
import { ComposeRequestSchema, ComposeResponseSchema } from '@/contracts/compose'

describe('video compose contract', () => {
  it('accepts the documented multitrack request and exact success response', () => {
    const request = ComposeRequestSchema.parse(requestExample)
    const response = ComposeResponseSchema.parse(responseExample)

    expect(request.clips).toHaveLength(2)
    expect(request.clips[0]).toMatchObject({
      transitionAfter: 'fade',
      transitionDurationSeconds: 0.6,
      muted: false,
    })
    expect(request.audioTracks[0]).toMatchObject({ start: 0, volume: 0.65, muted: false })
    expect(request.subtitles[0]).toEqual({ text: '雨夜，故事开始。', start: 0.5, end: 2.8 })
    expect(response).toMatchObject({
      artifact: { kind: 'video', modelId: 'local-compose' },
      subtitleMode: 'burned',
    })
  })

  it('accepts only local media-route URLs at the request boundary', () => {
    const request = {
      clips: [{
        url: 'https://cdn.example.com/remote.mp4',
        inPoint: 0,
        outPoint: 1,
        speed: 1,
        transitionAfter: null,
      }],
    }

    expect(ComposeRequestSchema.safeParse(request).success).toBe(false)
    expect(ComposeRequestSchema.safeParse({
      ...request,
      clips: [{ ...request.clips[0], url: '/api/media/fixtures/city-night.mp4' }],
    }).success).toBe(true)
  })

  it('keeps optional arrays backwards compatible', () => {
    expect(
      ComposeRequestSchema.parse({
        clips: [
          {
            url: '/api/media/job-a/shot.mp4',
            inPoint: 0,
            outPoint: 5,
            speed: 1,
            transitionAfter: null,
          },
        ],
      }),
    ).toMatchObject({ audioTracks: [], subtitles: [] })
  })

  it('keeps the OpenAPI compositor examples and required fields aligned with runtime schemas', () => {
    const openapi = JSON.parse(
      readFileSync(path.join(process.cwd(), 'docs/api/openapi.yaml'), 'utf8'),
    ) as {
      components: {
        schemas: { ComposeRequest: { required: string[]; properties: Record<string, unknown> } }
        examples: Record<string, { value: unknown }>
      }
    }

    expect(openapi.components.schemas.ComposeRequest.required).toEqual(['clips'])
    expect(Object.keys(openapi.components.schemas.ComposeRequest.properties)).toEqual([
      'clips',
      'audioTracks',
      'subtitles',
    ])
    expect(ComposeRequestSchema.parse(openapi.components.examples.ComposeRequestExample.value)).toEqual(
      ComposeRequestSchema.parse(requestExample),
    )
    expect(ComposeResponseSchema.parse(openapi.components.examples.ComposeResponseExample.value)).toEqual(
      ComposeResponseSchema.parse(responseExample),
    )
  })

  it.each([
    [{ clips: [] }, 'empty clips'],
    [
      {
        clips: [
          {
            url: '/api/media/a/shot.mp4',
            inPoint: 4,
            outPoint: 2,
            speed: 1,
            transitionAfter: null,
          },
        ],
      },
      'reverse trim',
    ],
    [
      {
        clips: [
          {
            url: '/api/media/a/shot.mp4',
            inPoint: 0,
            outPoint: 2,
            speed: 8,
            transitionAfter: null,
          },
        ],
      },
      'unsupported speed',
    ],
    [
      {
        clips: [
          {
            url: '/api/media/a/shot.mp4',
            inPoint: 0,
            outPoint: 2,
            speed: 1,
            transitionAfter: 'spin',
          },
        ],
      },
      'unsupported transition',
    ],
  ])('rejects %s (%s)', (value, _label) => {
    expect(ComposeRequestSchema.safeParse(value).success).toBe(false)
  })
})

describe('video compose lifecycle contract', () => {
  it('models queued work and terminal outcomes without exposing an artifact before success', async () => {
    const { ComposeTaskResponseSchema } = await import('@/contracts/compose')

    expect(ComposeTaskResponseSchema.parse({
      task: {
        id: 'compose_task_fixture',
        status: 'queued',
        artifact: null,
        assetId: null,
        subtitleMode: null,
        notes: [],
        failure: null,
        createdAt: '2026-09-04T00:00:00.000Z',
        updatedAt: '2026-09-04T00:00:00.000Z',
      },
    }).task.status).toBe('queued')

    expect(() => ComposeTaskResponseSchema.parse({
      task: {
        id: 'compose_task_fixture',
        status: 'cancelled',
        artifact: { id: 'art_should_not_exist' },
        assetId: 'asset_should_not_exist',
        subtitleMode: 'none',
        notes: [],
        failure: null,
        createdAt: '2026-09-04T00:00:00.000Z',
        updatedAt: '2026-09-04T00:00:00.000Z',
      },
    })).toThrow()
  })
})
