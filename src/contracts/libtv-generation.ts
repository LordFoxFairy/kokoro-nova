import { z } from 'zod'

import { ContractDecodeError, decodeExternalEnvelope } from './http'

const StableIdSchema = z.string().trim().min(1)

export const LibtvGenerationCreateRequestSchema = z
  .object({
    params: z.record(z.unknown()),
    metadata: z
      .object({
        node_id: StableIdSchema,
        project_id: StableIdSchema,
      })
      .passthrough(),
    provider: StableIdSchema,
    model: StableIdSchema,
    taskType: StableIdSchema,
    requestId: StableIdSchema,
    teamId: z.number().int().optional(),
    bizScene: z.number().int().optional(),
    budgetPower: z.number().nonnegative().optional(),
  })
  .passthrough()

export const LibtvGenerationProgressRequestSchema = z
  .object({
    taskIds: z.array(StableIdSchema).min(1),
    teamId: z.number().int().optional(),
  })
  .strict()

export const LibtvGenerationProgressBatchRequestSchema = z
  .object({
    teamId: z.number().int().optional(),
  })
  .strict()

export const LibtvGenerationStopBatchRequestSchema = z
  .object({
    taskIds: z.array(StableIdSchema).min(1),
  })
  .strict()

export const LibtvGenerationPowerBatchRequestSchema = z
  .object({
    list: z.array(LibtvGenerationCreateRequestSchema).min(1),
    infiniteSwitch: z.boolean().optional(),
  })
  .strict()

export const LibtvGenerationPowerRequestSchema = LibtvGenerationCreateRequestSchema

const LibtvGenerationCreateDataSchema = z
  .object({
    taskId: StableIdSchema.optional(),
    task_id: StableIdSchema.optional(),
  })
  .passthrough()
  .refine((data) => Boolean(data.taskId || data.task_id), {
    message: 'taskId 或 task_id 至少需要一个',
  })

export const LibtvGenerationStatusCodeSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
])

export type LibtvGenerationStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'timed_out'

export function mapLibtvGenerationStatus(status: number): LibtvGenerationStatus {
  switch (status) {
    case 0:
      return 'pending'
    case 1:
      return 'running'
    case 2:
      return 'succeeded'
    case 3:
      return 'failed'
    case 4:
      return 'timed_out'
    default:
      throw new ContractDecodeError('INVALID_DATA', `未知生成任务状态: ${status}`)
  }
}

const LibtvTransitionSchema = z
  .object({
    type: z.string(),
    duration: z.number().nonnegative(),
  })
  .passthrough()

export const LibtvTaskMediaSchema = z
  .object({
    previewPath: z.string().nullish(),
    videoUrl: z.string().nullish(),
    originalPath: z.string().nullish(),
    storagePath: z.string().nullish(),
    width: z.number().nonnegative().nullish(),
    height: z.number().nonnegative().nullish(),
    duration: z.number().nonnegative().nullish(),
    subtitleUrl: z.string().nullish(),
    subtitleHtmlUrl: z.string().nullish(),
    transition: LibtvTransitionSchema.nullish(),
    transitions: z.array(LibtvTransitionSchema).optional(),
    subType: z.union([z.string(), z.number()]).nullish(),
  })
  .passthrough()

export const LibtvTaskResultSchema = z
  .object({
    videos: z.array(LibtvTaskMediaSchema).optional(),
    images: z.array(LibtvTaskMediaSchema).optional(),
    audios: z.array(LibtvTaskMediaSchema).optional(),
    texts: z.array(z.unknown()).optional(),
  })
  .passthrough()

const LibtvGenerationProgressItemSchema = z
  .object({
    taskId: StableIdSchema,
    status: LibtvGenerationStatusCodeSchema,
    progressPercent: z.number().min(0).max(100),
    taskResult: z.string().nullish(),
    failedReason: z.string().nullish(),
    delayInfo: z.unknown().optional(),
    benefitTag: z.unknown().optional(),
    agentProcessing: z.boolean().optional(),
    nodeKeys: z.array(z.string()).optional(),
    yieldStage: z.unknown().optional(),
    startTimeMs: z.number().optional(),
  })
  .passthrough()

const LibtvGenerationProgressDataSchema = z
  .object({
    progresses: z.array(LibtvGenerationProgressItemSchema),
  })
  .passthrough()

const LibtvGenerationProgressBatchDataSchema = z
  .object({
    success: z.boolean(),
  })
  .passthrough()

const LibtvGenerationStopBatchDataSchema = z
  .object({
    results: z.array(
      z
        .object({
          taskId: StableIdSchema,
          success: z.boolean(),
          message: z.string().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough()

export type LibtvTaskResultDecode =
  | { state: 'absent' }
  | { state: 'valid'; value: z.infer<typeof LibtvTaskResultSchema> }
  | { state: 'invalid'; reason: 'INVALID_JSON' | 'INVALID_SHAPE'; issues?: unknown }

function decodeTaskResult(value: string | null | undefined): LibtvTaskResultDecode {
  if (value == null || value.trim() === '') return { state: 'absent' }

  let json: unknown
  try {
    json = JSON.parse(value) as unknown
  } catch {
    return { state: 'invalid', reason: 'INVALID_JSON' }
  }

  const parsed = LibtvTaskResultSchema.safeParse(json)
  return parsed.success
    ? { state: 'valid', value: parsed.data }
    : { state: 'invalid', reason: 'INVALID_SHAPE', issues: parsed.error.issues }
}

export function decodeLibtvGenerationCreate(input: unknown) {
  const data = decodeExternalEnvelope(input, LibtvGenerationCreateDataSchema)
  return { ...data, taskId: data.taskId ?? (data.task_id as string) }
}

export function decodeLibtvGenerationProgress(input: unknown) {
  const data = decodeExternalEnvelope(input, LibtvGenerationProgressDataSchema)
  return {
    ...data,
    progresses: data.progresses.map((progress) => ({
      ...progress,
      statusCode: progress.status,
      status: mapLibtvGenerationStatus(progress.status),
      result: decodeTaskResult(progress.taskResult),
    })),
  }
}

export function decodeLibtvGenerationProgressBatch(input: unknown) {
  return decodeExternalEnvelope(input, LibtvGenerationProgressBatchDataSchema)
}

export function decodeLibtvGenerationStopBatch(input: unknown) {
  return decodeExternalEnvelope(input, LibtvGenerationStopBatchDataSchema)
}
