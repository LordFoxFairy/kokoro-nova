import { describe, expect, it } from 'vitest'

import {
  decodeLibtvGenerationCreate,
  decodeLibtvGenerationProgress,
  decodeLibtvGenerationProgressBatch,
  decodeLibtvGenerationStopBatch,
  LibtvGenerationCreateRequestSchema,
  LibtvGenerationPowerBatchRequestSchema,
  LibtvGenerationProgressBatchRequestSchema,
  LibtvGenerationProgressRequestSchema,
  LibtvGenerationStopBatchRequestSchema,
  mapLibtvGenerationStatus,
} from '@/contracts/libtv-generation'

const createRequest = {
  params: {
    textList: ['雨夜城市街道'],
    imageList: ['/fixtures/libtv/media/first-frame.webp'],
    duration: 15,
  },
  metadata: { node_id: 'node_video_fixture', project_id: 'project_fixture' },
  provider: 'fixture-provider',
  model: 'seedance-fixture',
  taskType: 'video',
  requestId: 'request_fixture_01',
  teamId: 1,
  bizScene: 3,
  budgetPower: 330,
}

function envelope(progresses: unknown[]) {
  return { code: 0, data: { progresses }, msg: 'ok', trace_id: 'trace_fixture' }
}

describe('LibTV generation request contracts', () => {
  it('accepts the bundle-confirmed generation create shape and preserves provider extensions', () => {
    const parsed = LibtvGenerationCreateRequestSchema.parse({
      ...createRequest,
      metadata: { ...createRequest.metadata, futureMetadata: true },
      futureTopLevel: 'kept',
    })

    expect(parsed.params).toMatchObject({ duration: 15 })
    expect(parsed.metadata).toMatchObject({ futureMetadata: true })
    expect(parsed).toMatchObject({ futureTopLevel: 'kept' })
  })

  it('requires stable node, project, model and request identifiers', () => {
    expect(
      LibtvGenerationCreateRequestSchema.safeParse({
        ...createRequest,
        metadata: { node_id: '', project_id: 'project_fixture' },
      }).success,
    ).toBe(false)
    expect(LibtvGenerationCreateRequestSchema.safeParse({ ...createRequest, requestId: '' }).success).toBe(false)
  })

  it('captures progress, batch progress, stop and batch pricing request boundaries', () => {
    expect(
      LibtvGenerationProgressRequestSchema.parse({ taskIds: ['task_fixture_01'], teamId: 1 }),
    ).toEqual({ taskIds: ['task_fixture_01'], teamId: 1 })
    expect(LibtvGenerationProgressBatchRequestSchema.parse({ teamId: 1 })).toEqual({ teamId: 1 })
    expect(LibtvGenerationProgressBatchRequestSchema.parse({})).toEqual({})
    expect(LibtvGenerationStopBatchRequestSchema.parse({ taskIds: ['task_fixture_01'] })).toEqual({
      taskIds: ['task_fixture_01'],
    })
    expect(
      LibtvGenerationPowerBatchRequestSchema.parse({ list: [createRequest], infiniteSwitch: true }).list,
    ).toHaveLength(1)
    expect(LibtvGenerationProgressRequestSchema.safeParse({ taskIds: [] }).success).toBe(false)
  })
})

describe('decodeLibtvGenerationCreate', () => {
  it.each([
    [{ taskId: 'task_fixture_camel' }, 'task_fixture_camel'],
    [{ task_id: 'task_fixture_snake' }, 'task_fixture_snake'],
  ])('normalizes both observed task ID spellings', (data, taskId) => {
    expect(decodeLibtvGenerationCreate({ code: 0, data: { ...data, futureField: 7 }, msg: 'ok' })).toEqual(
      expect.objectContaining({ taskId, futureField: 7 }),
    )
  })

  it('rejects a success envelope that has neither task ID spelling', () => {
    expect(() => decodeLibtvGenerationCreate({ code: 0, data: {}, msg: 'ok' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_DATA' }),
    )
  })

  it('propagates a non-zero upstream business code through the stable contract error', () => {
    expect(() => decodeLibtvGenerationCreate({ code: 1001, data: null, msg: '提交失败' })).toThrowError(
      expect.objectContaining({ code: 'EXTERNAL_BUSINESS_ERROR', message: '提交失败' }),
    )
  })
})

describe('decodeLibtvGenerationProgress', () => {
  it('maps every observed numeric state without leaking the numeric enum into UI state', () => {
    expect([0, 1, 2, 3, 4].map(mapLibtvGenerationStatus)).toEqual([
      'pending',
      'running',
      'succeeded',
      'failed',
      'timed_out',
    ])
  })

  it('parses a successful media result separately and keeps future progress/media fields', () => {
    const taskResult = JSON.stringify({
      videos: [
        {
          previewPath: '/fixtures/libtv/media/result.mp4',
          width: 1280,
          height: 720,
          subtitleUrl: '/fixtures/libtv/media/result.srt',
          transition: { type: 'fade', duration: 0.6 },
          futureMediaField: 'kept',
        },
      ],
      images: [],
      audios: [],
      texts: ['完成'],
      futureResultField: 9,
    })
    const [progress] = decodeLibtvGenerationProgress(
      envelope([
        {
          taskId: 'task_fixture_01',
          status: 2,
          progressPercent: 100,
          taskResult,
          benefitTag: 'fixture-benefit',
          futureProgressField: true,
        },
      ]),
    ).progresses

    expect(progress).toMatchObject({
      taskId: 'task_fixture_01',
      statusCode: 2,
      status: 'succeeded',
      progressPercent: 100,
      benefitTag: 'fixture-benefit',
      futureProgressField: true,
      result: {
        state: 'valid',
        value: {
          futureResultField: 9,
          videos: [expect.objectContaining({ futureMediaField: 'kept' })],
        },
      },
    })
    expect(progress.taskResult).toBe(taskResult)
  })

  it.each([
    ['{broken', 'INVALID_JSON'],
    [JSON.stringify({ videos: 'not-an-array' }), 'INVALID_SHAPE'],
  ] as const)('returns a deterministic invalid result for %s', (taskResult, reason) => {
    const [progress] = decodeLibtvGenerationProgress(
      envelope([
        {
          taskId: 'task_fixture_bad_result',
          status: 2,
          progressPercent: 100,
          taskResult,
        },
      ]),
    ).progresses

    expect(progress.status).toBe('succeeded')
    expect(progress.result).toEqual(expect.objectContaining({ state: 'invalid', reason }))
  })

  it('represents a missing in-flight result without attempting JSON parsing', () => {
    const [progress] = decodeLibtvGenerationProgress(
      envelope([{ taskId: 'task_fixture_running', status: 1, progressPercent: 58, taskResult: null }]),
    ).progresses

    expect(progress).toMatchObject({ status: 'running', statusCode: 1, result: { state: 'absent' } })
  })

  it('rejects unknown numeric states at the transport boundary', () => {
    expect(() =>
      decodeLibtvGenerationProgress(
        envelope([{ taskId: 'task_fixture_future', status: 8, progressPercent: 0 }]),
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_DATA' }))
  })
})

describe('batch response decoders', () => {
  it('decodes the network-confirmed batch progress acknowledgement', () => {
    expect(
      decodeLibtvGenerationProgressBatch({
        code: 0,
        data: { success: true, futureField: 'kept' },
        msg: 'ok',
      }),
    ).toEqual({ success: true, futureField: 'kept' })
  })

  it('decodes per-task stop results and preserves extension fields', () => {
    expect(
      decodeLibtvGenerationStopBatch({
        code: 0,
        data: {
          results: [{ taskId: 'task_fixture_01', success: true, message: 'stopped', futureField: 1 }],
        },
        msg: 'ok',
      }),
    ).toEqual({
      results: [{ taskId: 'task_fixture_01', success: true, message: 'stopped', futureField: 1 }],
    })
  })
})
