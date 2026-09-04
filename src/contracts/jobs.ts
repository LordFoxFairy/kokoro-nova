import { z } from 'zod'

import { GenerationJobSchema, WorkflowDocumentSchema } from './local'
import { JOB_FIXTURE_IDS } from '@/domain/jobs'

const StableIdSchema = z.string().trim().min(1)

/** Local-only deterministic provider outcomes; production adapters ignore this field. */
export const JobFixtureSchema = z.enum(JOB_FIXTURE_IDS)

export const CreateJobRequestSchema = z
  .object({
    canvasId: StableIdSchema,
    nodeId: StableIdSchema,
    fixture: JobFixtureSchema.optional(),
  })
  .strict()

export const TransitionJobRequestSchema = z
  .object({
    action: z.enum(['confirm', 'cancel', 'retry']),
  })
  .strict()

export const ListJobsResponseSchema = z
  .object({
    jobs: z.array(GenerationJobSchema),
  })
  .strict()

export const CreateJobResponseSchema = z
  .object({
    job: GenerationJobSchema,
  })
  .strict()

export const GetJobResponseSchema = z
  .object({
    job: GenerationJobSchema,
    revision: z.number().int().positive().nullable(),
    document: WorkflowDocumentSchema.nullable(),
    balance: z.number().finite(),
  })
  .strict()

export const TransitionJobResponseSchema = z
  .object({
    job: GenerationJobSchema,
    balance: z.number().finite(),
  })
  .strict()

export type JobFixture = z.infer<typeof JobFixtureSchema>
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>
export type TransitionJobRequest = z.infer<typeof TransitionJobRequestSchema>
export type TransitionJobAction = TransitionJobRequest['action']
export type ListJobsResponse = z.infer<typeof ListJobsResponseSchema>
export type CreateJobResponse = z.infer<typeof CreateJobResponseSchema>
export type GetJobResponse = z.infer<typeof GetJobResponseSchema>
export type TransitionJobResponse = z.infer<typeof TransitionJobResponseSchema>
