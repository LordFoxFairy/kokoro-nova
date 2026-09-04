import {
  CreateScriptV2RunRequestSchema,
  ScriptV2QuoteRequestSchema,
  ScriptV2QuoteResponseSchema,
  ScriptV2RunSchema,
  type CreateScriptV2RunRequest,
  type ScriptV2QuoteRequest,
  type ScriptV2QuoteResponse,
  type ScriptV2Run,
  type TransitionScriptV2RunRequest,
} from '@/contracts/script-v2'
import {
  generateMockScriptV2,
  generateMockScriptV2Asset,
  recognizeMockScriptV2Assets,
  recomputeMockScriptV2Prompts,
} from '@/domain/script-v2-mock'
import { HttpError } from './http'

const FIXTURE_EPOCH = Date.parse('2026-09-04T00:00:00.000Z')
const QUOTE_TTL_MS = 5 * 60 * 1_000
const PRICE_VERSION = 'script-v2-local-1' as const
const RECOMPUTE_BATCH_SIZE = 20

const runs = new Map<string, ScriptV2Run>()
const runIdsByIdempotencyKey = new Map<string, string>()

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`
}

function fingerprint(namespace: string, value: unknown): string {
  return `${namespace}:${fnv1a(stableJson(value))}`
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function timestamp(attempt: number, phase: number): string {
  return new Date(FIXTURE_EPOCH + ((attempt - 1) * 10 + phase) * 1_000).toISOString()
}

export function quoteScriptV2(request: ScriptV2QuoteRequest): ScriptV2QuoteResponse {
  const input = ScriptV2QuoteRequestSchema.parse(request)
  let credits: number
  let label: string
  switch (input.operation) {
    case 'generate-full':
      credits = 6
      label = '脚本生成 × 1'
      break
    case 'recognize-assets-only':
      credits = 6
      label = '脚本资产识别 × 1'
      break
    case 'recompute-prompts': {
      const batches = Math.ceil(input.shotCount / RECOMPUTE_BATCH_SIZE)
      credits = batches * 6
      label = `提示词智能合成 ${input.shotCount} 镜 / ${batches} 批`
      break
    }
    case 'generate-asset':
      credits = input.assetCount * 18
      label = `Lib Image ${input.quality} ${input.resolution} × ${input.assetCount}`
      break
  }
  return ScriptV2QuoteResponseSchema.parse({
    quote: {
      id: `quote_${fnv1a(stableJson(input))}`,
      operation: input.operation,
      credits,
      priceVersion: PRICE_VERSION,
      expiresAt: new Date(FIXTURE_EPOCH + QUOTE_TTL_MS).toISOString(),
      breakdown: [{ label, credits }],
    },
  })
}

function quoteRequestForRun(request: CreateScriptV2RunRequest): ScriptV2QuoteRequest {
  switch (request.operation) {
    case 'generate-full':
      return { operation: request.operation, modelId: request.input.modelId }
    case 'recognize-assets-only':
      return { operation: request.operation, modelId: request.input.state.generator.modelId }
    case 'recompute-prompts':
      return {
        operation: request.operation,
        modelId: request.input.state.promptComposer.modelId,
        shotCount: request.input.rowIds.length,
      }
    case 'generate-asset':
      return {
        operation: request.operation,
        modelId: request.input.settings.modelId,
        assetCount: 1,
        quality: request.input.settings.quality,
        resolution: request.input.settings.resolution,
        aspectRatio: request.input.settings.aspectRatio,
      }
  }
}

function commitRun(candidate: unknown): ScriptV2Run {
  const parsed = ScriptV2RunSchema.parse(candidate)
  const persisted = clone(parsed)
  runs.set(parsed.id, persisted)
  runIdsByIdempotencyKey.set(parsed.idempotencyKey, parsed.id)
  return clone(persisted)
}

function existingRun(runId: string): ScriptV2Run {
  const run = runs.get(runId)
  if (!run) throw new HttpError(404, 'Script V2 任务不存在')
  return run
}

export function createScriptV2Run(request: CreateScriptV2RunRequest): ScriptV2Run {
  const input = CreateScriptV2RunRequestSchema.parse(request)
  const inputFingerprint = fingerprint('script-v2-run-v1', input)
  const knownRunId = runIdsByIdempotencyKey.get(input.idempotencyKey)
  if (knownRunId) {
    const known = existingRun(knownRunId)
    if (known.inputFingerprint !== inputFingerprint) {
      throw new HttpError(409, 'idempotencyKey 已用于不同的 Script V2 请求')
    }
    return clone(known)
  }

  const id = `run_${fnv1a(input.idempotencyKey)}`
  const collision = runs.get(id)
  if (collision && collision.idempotencyKey !== input.idempotencyKey) {
    throw new HttpError(409, 'Script V2 本地任务标识冲突')
  }
  const quote = quoteScriptV2(quoteRequestForRun(input)).quote
  return commitRun({
    id,
    idempotencyKey: input.idempotencyKey,
    canvasId: input.canvasId,
    nodeId: input.nodeId,
    operation: input.operation,
    input: clone(input.input),
    status: 'queued',
    attempt: 1,
    progress: 0,
    quote,
    inputFingerprint,
    result: null,
    error: null,
    createdAt: timestamp(1, 0),
    updatedAt: timestamp(1, 0),
  })
}

function executeRun(run: ScriptV2Run): unknown {
  switch (run.operation) {
    case 'generate-full':
      return generateMockScriptV2({
        ...run.input,
        idempotencySeed: run.idempotencyKey,
      })
    case 'recognize-assets-only':
      return recognizeMockScriptV2Assets({
        storyText: run.input.state.originalStoryText,
        idempotencySeed: run.idempotencyKey,
      })
    case 'recompute-prompts':
      return recomputeMockScriptV2Prompts(run.input)
    case 'generate-asset':
      return generateMockScriptV2Asset(run.input)
  }
}

export function getScriptV2Run(runId: string): ScriptV2Run {
  const run = existingRun(runId)
  if (run.status === 'queued') {
    return commitRun({
      ...run,
      status: 'running',
      progress: 48,
      updatedAt: timestamp(run.attempt, 1),
    })
  }
  if (run.status === 'running') {
    const result = executeRun(run)
    return commitRun({
      ...run,
      status: 'succeeded',
      progress: 100,
      result,
      error: null,
      updatedAt: timestamp(run.attempt, 2),
    })
  }
  return clone(run)
}

export function transitionScriptV2Run(
  runId: string,
  action: TransitionScriptV2RunRequest['action'],
): ScriptV2Run {
  const run = existingRun(runId)
  if (action === 'cancel') {
    if (run.status === 'cancelled') return clone(run)
    if (run.status === 'succeeded' || run.status === 'failed') {
      throw new HttpError(409, `状态为 ${run.status} 的 Script V2 任务不能取消`)
    }
    return commitRun({
      ...run,
      status: 'cancelled',
      progress: run.progress,
      result: null,
      error: null,
      updatedAt: timestamp(run.attempt, 3),
    })
  }

  if (run.status !== 'cancelled' && run.status !== 'failed') {
    throw new HttpError(409, `状态为 ${run.status} 的 Script V2 任务不能重试`)
  }
  const attempt = run.attempt + 1
  return commitRun({
    ...run,
    status: 'queued',
    attempt,
    progress: 0,
    result: null,
    error: null,
    updatedAt: timestamp(attempt, 0),
  })
}

export function __resetScriptV2Runs(): void {
  runs.clear()
  runIdsByIdempotencyKey.clear()
}
