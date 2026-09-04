import { z } from 'zod'

export const SCENARIO_IDS = [
  'anonymous',
  'authenticated-empty',
  'authenticated-populated',
  'account-switch-required',
  'session-expired',
  'video-awaiting-confirmation',
  'video-awaiting-valid-confirmation',
  'video-queued',
  'video-running',
  'video-succeeded',
  'video-failed',
  'video-cancelled',
  'video-compliance-blocked',
  'revision-conflict',
  'public-showcase',
] as const

export const ScenarioIdSchema = z.enum(SCENARIO_IDS)
export type ScenarioId = z.infer<typeof ScenarioIdSchema>

export const ScenarioMetaSchema = z.object({
  id: ScenarioIdSchema,
  label: z.string().min(1),
  description: z.string().min(1),
  viewer: z.enum(['anonymous', 'authenticated', 'account-selection']),
  editorSession: z.enum(['none', 'active', 'expired']),
  seedVersion: z.number().int().positive(),
  fixedNow: z.string().datetime(),
})

export type ScenarioMeta = z.infer<typeof ScenarioMetaSchema>

export const ScenarioResponseSchema = z.object({
  scenario: ScenarioMetaSchema,
  state: z.object({
    projects: z.number().int().nonnegative(),
    canvases: z.number().int().nonnegative(),
    jobs: z.number().int().nonnegative(),
    assets: z.number().int().nonnegative(),
  }),
})

export type ScenarioResponse = z.infer<typeof ScenarioResponseSchema>
