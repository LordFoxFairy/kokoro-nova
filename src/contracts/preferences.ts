import { z } from 'zod'

export const LocalPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark']),
  aiWatermark: z.boolean(),
}).strict()

export const PreferencesResponseSchema = z.object({
  preferences: LocalPreferencesSchema,
}).strict()

export const UpdatePreferencesRequestSchema = LocalPreferencesSchema.partial().strict().refine(
  (value) => value.theme !== undefined || value.aiWatermark !== undefined,
  '至少提供一个偏好字段',
)

export type LocalPreferences = z.infer<typeof LocalPreferencesSchema>
export type PreferencesResponse = z.infer<typeof PreferencesResponseSchema>
export type UpdatePreferencesRequest = z.infer<typeof UpdatePreferencesRequestSchema>
