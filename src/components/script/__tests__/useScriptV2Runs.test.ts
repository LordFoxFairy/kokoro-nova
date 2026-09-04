import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  CreateScriptV2RunRequest,
  ScriptV2Run,
  ScriptV2RunResponse,
} from '@/contracts/script-v2'
import {
  appendScriptV2Row,
  defaultScriptV2State,
  updateScriptV2Row,
  type ScriptV2State,
} from '@/domain/script-v2'
import { recomputeMockScriptV2Prompts } from '@/domain/script-v2-mock'
import {
  createScriptV2RunController,
  type ScriptV2RunApi,
} from '@/components/script/useScriptV2Runs'

const FIXTURE_TIME = '2026-09-04T00:00:00.000Z'

function stateWithRows(count: number): ScriptV2State {
  let state: ScriptV2State = {
    ...defaultScriptV2State('controller-fixture'),
    entry: 'screenplay',
    title: '批量提示词测试',
    originalStoryText: '@林夏 在车站等待。',
    styleDescription: '电影化写实风格',
  }
  for (let index = 0; index < count; index += 1) {
    state = appendScriptV2Row(state, {
      plotDescription: `林夏在车站完成镜头 ${index + 1} 的动作。`,
      shotSize: index % 2 ? '近景' : '中景',
      imageGenerationPrompt: `旧图片提示词 ${index + 1}`,
      videoMotionPrompt: `旧视频提示词 ${index + 1}`,
      imagePromptState: 'synced',
      videoPromptState: 'synced',
    })
  }
  return state
}

function quote(operation: ScriptV2Run['operation']) {
  return {
    id: `quote_${operation}`,
    operation,
    credits: 6,
    priceVersion: 'script-v2-local-1' as const,
    expiresAt: '2026-09-04T00:05:00.000Z',
    breakdown: [{ label: operation, credits: 6 }],
  }
}

function fakeApi(events: string[]): ScriptV2RunApi {
  const runs = new Map<string, { run: ScriptV2Run; polls: number }>()
  return {
    quote: vi.fn(async () => ({ quote: quote('recompute-prompts') })),
    createRun: vi.fn(async (request: CreateScriptV2RunRequest): Promise<ScriptV2RunResponse> => {
      if (request.operation !== 'recompute-prompts') throw new Error('unexpected operation')
      const id = `run_batch_${runs.size + 1}`
      events.push(`create:${request.input.rowIds.length}`)
      const run = {
        id,
        idempotencyKey: request.idempotencyKey,
        canvasId: request.canvasId,
        nodeId: request.nodeId,
        operation: request.operation,
        input: request.input,
        status: 'queued' as const,
        attempt: 1,
        progress: 0,
        quote: quote(request.operation),
        inputFingerprint: `fingerprint:${id}`,
        result: null,
        error: null,
        createdAt: FIXTURE_TIME,
        updatedAt: FIXTURE_TIME,
      }
      runs.set(id, { run, polls: 0 })
      return { run }
    }),
    getRun: vi.fn(async (runId: string): Promise<ScriptV2RunResponse> => {
      const record = runs.get(runId)
      if (!record || record.run.operation !== 'recompute-prompts') throw new Error('run missing')
      record.polls += 1
      if (record.polls === 1) {
        events.push(`running:${record.run.input.rowIds.length}`)
        record.run = { ...record.run, status: 'running', progress: 48 }
      } else {
        events.push(`succeeded:${record.run.input.rowIds.length}`)
        record.run = {
          ...record.run,
          status: 'succeeded',
          progress: 100,
          result: recomputeMockScriptV2Prompts(record.run.input),
        }
      }
      return { run: structuredClone(record.run) }
    }),
    transitionRun: vi.fn(async () => {
      throw new Error('not expected')
    }),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createScriptV2RunController', () => {
  it('runs 21 prompt rows as serial 20+1 batches and preserves a manual edit', async () => {
    let state = stateWithRows(21)
    const target = state.rows[0]
    const events: string[] = []
    let flushes = 0
    const controller = createScriptV2RunController({
      canvasId: 'canvas_fixture',
      nodeId: 'node_script_fixture',
      getState: () => state,
      onStateChange: (next) => {
        state = next
      },
      api: fakeApi(events),
      flushPendingPromptEdits: () => {
        flushes += 1
      },
    })

    const promise = controller.recomputePrompts(state.rows.map((row) => row.id))
    await vi.advanceTimersByTimeAsync(0)
    expect(events).toEqual(['create:20'])
    expect(flushes).toBe(1)

    state = updateScriptV2Row(state, target.id, {
      imageGenerationPrompt: '这是用户在请求期间保存的图片提示词',
      imagePromptState: 'user_edited',
    })

    await vi.advanceTimersByTimeAsync(400)
    expect(events).toEqual(['create:20', 'running:20'])
    await vi.advanceTimersByTimeAsync(400)
    expect(events).toEqual(['create:20', 'running:20', 'succeeded:20', 'create:1'])
    await vi.advanceTimersByTimeAsync(800)
    await promise

    expect(events).toEqual([
      'create:20',
      'running:20',
      'succeeded:20',
      'create:1',
      'running:1',
      'succeeded:1',
    ])
    expect(state.rows[0].imageGenerationPrompt).toBe('这是用户在请求期间保存的图片提示词')
    expect(state.rows[0].videoMotionPrompt).not.toBe('旧视频提示词 1')
    expect(state.rows[20].imageGenerationPrompt).not.toBe('旧图片提示词 21')
    expect(controller.getProgressByRowId()).toEqual(
      Object.fromEntries(state.rows.map((row) => [row.id, 100])),
    )
    expect(state.promptBatchRuns.at(-1)).toMatchObject({
      status: 'completed',
      batchSize: 20,
      targetShotIds: state.rows.map((row) => row.id),
      batches: [
        expect.objectContaining({ status: 'succeeded', shotIds: expect.arrayContaining([target.id]) }),
        expect.objectContaining({ status: 'succeeded', shotIds: [state.rows[20].id] }),
      ],
    })
  })

  it('aborts pending polling and leaves no timer behind when disposed', async () => {
    let state = stateWithRows(1)
    const controller = createScriptV2RunController({
      canvasId: 'canvas_fixture',
      nodeId: 'node_script_fixture',
      getState: () => state,
      onStateChange: (next) => {
        state = next
      },
      api: fakeApi([]),
    })

    const promise = controller.recomputePrompts([state.rows[0].id])
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)

    controller.dispose()

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
  })
})
