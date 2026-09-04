import { z } from 'zod'

import { WorkflowDocumentSchema } from './local'

const StableIdSchema = z.string().trim().min(1).max(200)
const IsoTimestampSchema = z.string().datetime()

export const SnapshotStateSchema = z.enum(['listed', 'hidden', 'revoked'])

const SnapshotMetadataSchema = z
  .object({
    id: StableIdSchema,
    projectId: StableIdSchema,
    canvasId: StableIdSchema,
    title: z.string(),
    summary: z.string(),
    coverUrl: z.string().nullable(),
    publishedAt: IsoTimestampSchema,
    state: SnapshotStateSchema,
  })
  .strict()

export const SnapshotSummarySchema = SnapshotMetadataSchema.extend({
  nodeCount: z.number().int().nonnegative(),
  mediaCount: z.number().int().nonnegative(),
}).strict()

export const PublishedSnapshotSchema = SnapshotMetadataSchema.extend({
  document: WorkflowDocumentSchema,
}).strict()

export const PublishRequestSchema = z
  .object({
    canvasId: StableIdSchema,
    title: z.string().optional(),
    summary: z.string().optional(),
  })
  .strict()

export const ListPublishedSnapshotsResponseSchema = z
  .object({ snapshots: z.array(SnapshotSummarySchema) })
  .strict()

export const GetPublishedSnapshotResponseSchema = z
  .object({ snapshot: PublishedSnapshotSchema })
  .strict()

export const PublishCanvasResponseSchema = z
  .object({ snapshot: SnapshotSummarySchema })
  .strict()

export const RevokePublishedSnapshotResponseSchema = PublishCanvasResponseSchema

export type SnapshotState = z.infer<typeof SnapshotStateSchema>
export type SnapshotSummaryContract = z.infer<typeof SnapshotSummarySchema>
export type PublishedSnapshotContract = z.infer<typeof PublishedSnapshotSchema>
export type PublishRequest = z.infer<typeof PublishRequestSchema>
export type ListPublishedSnapshotsResponse = z.infer<typeof ListPublishedSnapshotsResponseSchema>
export type GetPublishedSnapshotResponse = z.infer<typeof GetPublishedSnapshotResponseSchema>
export type PublishCanvasResponse = z.infer<typeof PublishCanvasResponseSchema>
export type RevokePublishedSnapshotResponse = z.infer<typeof RevokePublishedSnapshotResponseSchema>
