import { z } from 'zod'

import { ProjectSchema } from './local'

const IsoTimestampSchema = z.string().datetime()

/** A project retained in the workspace recycle bin for 30 days. */
export const RecycledProjectSchema = ProjectSchema.extend({
  recycledAt: IsoTimestampSchema,
  recycleExpiresAt: IsoTimestampSchema,
  recycleOriginalFolderId: z.string().nullable(),
  originalFolderName: z.string().nullable(),
  canvasCount: z.number().int().nonnegative(),
  daysRemaining: z.number().int().nonnegative().max(30),
})

export const ListRecycleBinResponseSchema = z.object({
  projects: z.array(RecycledProjectSchema),
  /** Entries whose retention elapsed during this read. */
  purgedProjectIds: z.array(z.string()),
})

export const RestoreRecycledProjectResponseSchema = z.object({
  project: ProjectSchema,
  restoredToRoot: z.boolean(),
  canvasCount: z.number().int().nonnegative(),
})

export const PermanentlyDeleteRecycledProjectResponseSchema = z.object({
  deleted: z.string(),
  permanentlyDeleted: z.literal(true),
})

export type RecycledProject = z.infer<typeof RecycledProjectSchema>
export type ListRecycleBinResponse = z.infer<typeof ListRecycleBinResponseSchema>
