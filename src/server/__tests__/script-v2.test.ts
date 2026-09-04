import { beforeEach, describe, expect, it, vi } from 'vitest'

import persistedState from '../../../docs/api/examples/script-v2-state.json'
import type { CreateScriptV2RunRequest, ScriptV2QuoteRequest } from '@/contracts/script-v2'
import { ScriptV2RunSchema, ScriptV2StateSchema } from '@/contracts/script-v2'
import { POST as quoteRoute } from '@/app/api/script-v2/quotes/route'
import { POST as createRunRoute } from '@/app/api/script-v2/runs/route'
import {
  GET as getRunRoute,
  POST as transitionRunRoute,
} from '@/app/api/script-v2/runs/[runId]/route'
import {
  __resetScriptV2Runs,
  createScriptV2Run,
  getScriptV2Run,
  quoteScriptV2,
  transitionScriptV2Run,
} from '@/server/script-v2'
import { readState, resetStore } from '@/server/store'

const state = ScriptV2StateSchema.parse(persistedState)
type GenerateRunRequest = Extract<CreateScriptV2RunRequest, { operation: 'generate-full' }>

function generateRequest(key = 'script_generate_test'): GenerateRunRequest {
  return {
    idempotencyKey: key,
    canvasId: 'canvas_fixture',
    nodeId: 'node_script_fixture',
    operation: 'generate-full',
    input: {
      storyText: '@林夏 在雨夜车站收到一封迟到十年的信。',
      entry: 'screenplay',
      modelId: 'gvlm-3.1',
    },
  }
}

function request(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  __resetScriptV2Runs()
})

describe('Script V2 deterministic quotes', () => {
  it('locks the observed generation, recompute and Lib Image costs', () => {
    const cases: Array<[ScriptV2QuoteRequest, number]> = [
      [{ operation: 'generate-full', modelId: 'gvlm-3.1' }, 6],
      [{ operation: 'recompute-prompts', modelId: 'gvlm-3.1', shotCount: 1 }, 6],
      [{ operation: 'recompute-prompts', modelId: 'gvlm-3.1', shotCount: 20 }, 6],
      [{ operation: 'recompute-prompts', modelId: 'gvlm-3.1', shotCount: 21 }, 12],
      [
        {
          operation: 'generate-asset',
          modelId: 'lib-image-2',
          assetCount: 3,
          quality: 'standard',
          resolution: '2K',
          aspectRatio: '2:1',
        },
        54,
      ],
    ]

    for (const [input, credits] of cases) {
      const first = quoteScriptV2(input)
      expect(first.quote).toMatchObject({
        operation: input.operation,
        credits,
        priceVersion: 'script-v2-local-1',
        expiresAt: '2026-09-04T00:05:00.000Z',
      })
      expect(quoteScriptV2(structuredClone(input))).toEqual(first)
    }
  })

  it('does not reserve, settle or otherwise mutate the workspace ledger', async () => {
    await resetStore('authenticated-populated')
    const before = await readState()
    const snapshot = JSON.stringify({ ledger: before.ledger, balances: before.balances })

    quoteScriptV2({ operation: 'generate-full', modelId: 'gvlm-3.1' })
    quoteScriptV2({
      operation: 'generate-asset',
      modelId: 'lib-image-2',
      assetCount: 2,
      quality: 'standard',
      resolution: '2K',
      aspectRatio: '2:1',
    })

    const after = await readState()
    expect(JSON.stringify({ ledger: after.ledger, balances: after.balances })).toBe(snapshot)
  })
})

describe('Script V2 run repository', () => {
  it('keeps active runs across a development module-graph reload', async () => {
    vi.resetModules()
    const firstModule = await import('@/server/script-v2')
    firstModule.__resetScriptV2Runs()
    const created = firstModule.createScriptV2Run(generateRequest('script_hmr_survival'))

    vi.resetModules()
    const reloadedModule = await import('@/server/script-v2')
    expect(reloadedModule.getScriptV2Run(created.id)).toMatchObject({
      id: created.id,
      status: 'running',
      progress: 48,
    })
  })

  it('progresses queued → running → succeeded on deterministic polls', () => {
    const created = createScriptV2Run(generateRequest())
    const replay = createScriptV2Run(generateRequest())

    expect(created).toMatchObject({ status: 'queued', progress: 0, attempt: 1, result: null })
    expect(replay).toEqual(created)

    const running = getScriptV2Run(created.id)
    expect(running).toMatchObject({ id: created.id, status: 'running', progress: 48, result: null })

    const succeeded = getScriptV2Run(created.id)
    expect(succeeded).toMatchObject({
      id: created.id,
      status: 'succeeded',
      progress: 100,
      result: { operation: 'generate-full' },
    })
    expect(ScriptV2RunSchema.parse(succeeded)).toEqual(succeeded)
    expect(getScriptV2Run(created.id)).toEqual(succeeded)
  })

  it('keeps cancel terminal until an explicit retry reuses the logical id at attempt 2', () => {
    const created = createScriptV2Run(generateRequest('script_cancel_retry'))
    const cancelled = transitionScriptV2Run(created.id, 'cancel')

    expect(cancelled).toMatchObject({ id: created.id, status: 'cancelled', attempt: 1, result: null })
    expect(getScriptV2Run(created.id)).toEqual(cancelled)

    const retry = transitionScriptV2Run(created.id, 'retry')
    expect(retry).toMatchObject({ id: created.id, status: 'queued', progress: 0, attempt: 2 })
    expect(getScriptV2Run(created.id)).toMatchObject({ status: 'running', progress: 48, attempt: 2 })
  })

  it('rejects incompatible terminal transitions and idempotency-key payload drift', () => {
    const created = createScriptV2Run(generateRequest('script_conflict'))
    getScriptV2Run(created.id)
    getScriptV2Run(created.id)

    expect(() => transitionScriptV2Run(created.id, 'cancel')).toThrow(
      expect.objectContaining({ status: 409 }),
    )
    expect(() => transitionScriptV2Run(created.id, 'retry')).toThrow(
      expect.objectContaining({ status: 409 }),
    )
    expect(() =>
      createScriptV2Run({
        ...generateRequest('script_conflict'),
        input: { ...generateRequest().input, storyText: '另一个故事' },
      }),
    ).toThrow(expect.objectContaining({ status: 409 }))
  })

  it('clones validated runs so external malformed results cannot enter storage', () => {
    const created = createScriptV2Run({
      idempotencyKey: 'script_recompute_clone_guard',
      canvasId: 'canvas_fixture',
      nodeId: 'node_script_fixture',
      operation: 'recompute-prompts',
      input: { state, rowIds: [state.rows[0].id] },
    })
    ;(created as unknown as { result: unknown }).result = {
      operation: 'generate-asset',
      asset: { id: 'malformed' },
    }

    const stored = getScriptV2Run(created.id)
    expect(stored).toMatchObject({ operation: 'recompute-prompts', status: 'running', result: null })
    expect(ScriptV2RunSchema.safeParse(stored).success).toBe(true)
  })
})

describe('Script V2 Route Handlers', () => {
  it('returns strict quote and run responses for valid requests', async () => {
    const quote = await quoteRoute(
      request('http://localhost/api/script-v2/quotes', {
        operation: 'generate-full',
        modelId: 'gvlm-3.1',
      }),
    )
    expect(quote.status).toBe(200)
    expect(await quote.json()).toEqual(quoteScriptV2({ operation: 'generate-full', modelId: 'gvlm-3.1' }))

    const runResponse = await createRunRoute(
      request('http://localhost/api/script-v2/runs', generateRequest('script_route_create')),
    )
    expect(runResponse.status).toBe(200)
    expect(await runResponse.json()).toMatchObject({ run: { status: 'queued', progress: 0 } })
  })

  it('uses 400 for malformed JSON and 422 for a well-formed contract failure', async () => {
    const malformed = await quoteRoute(
      new Request('http://localhost/api/script-v2/quotes', { method: 'POST', body: '{broken' }),
    )
    const invalid = await quoteRoute(
      request('http://localhost/api/script-v2/quotes', {
        operation: 'recompute-prompts',
        modelId: 'gvlm-3.1',
        shotCount: 0,
      }),
    )

    expect(malformed.status).toBe(400)
    expect(invalid.status).toBe(422)
  })

  it('returns 404 for unknown runs and 409 for incompatible transitions', async () => {
    const unknown = await getRunRoute(new Request('http://localhost/api/script-v2/runs/missing'), {
      params: Promise.resolve({ runId: 'missing' }),
    })
    expect(unknown.status).toBe(404)

    const created = createScriptV2Run(generateRequest('script_route_conflict'))
    getScriptV2Run(created.id)
    getScriptV2Run(created.id)
    const conflict = await transitionRunRoute(
      request(`http://localhost/api/script-v2/runs/${created.id}`, { action: 'cancel' }),
      { params: Promise.resolve({ runId: created.id }) },
    )
    expect(conflict.status).toBe(409)
  })
})
