import { z } from 'zod'

export const ModelMediaSchema = z.enum(['image', 'video', 'audio', 'text'])
export const VideoGenerationModeSchema = z.enum([
  'text2video',
  'omni-reference',
  'image2video',
  'first-frame',
  'first-last-frame',
  'image-reference',
  'video2video',
  'motion-transfer',
  'digital-human',
])

const ReferenceCountConstraintSchema = z.object({
  min: z.number().int().nonnegative(),
  max: z.number().int().positive().optional(),
})

const VideoReferenceRequirementSchema = z.object({
  images: ReferenceCountConstraintSchema.optional(),
  videos: ReferenceCountConstraintSchema.optional(),
  audios: ReferenceCountConstraintSchema.optional(),
  anyMedia: ReferenceCountConstraintSchema.optional(),
})

export const VideoModelCapabilitiesSchema = z.object({
  aspectRatios: z.array(z.enum(['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'])),
  resolutions: z.array(z.enum(['1K', '2K', '4K', 'adaptive', '480p', '720p', '1080p'])),
  durationsSeconds: z.array(z.number().int().positive()),
  counts: z.array(z.union([z.literal(1), z.literal(2), z.literal(4)])),
  audio: z.enum(['unsupported', 'optional', 'required']),
  modes: z.array(VideoGenerationModeSchema),
  referenceRequirements: z.record(VideoGenerationModeSchema, VideoReferenceRequirementSchema.partial()),
  defaults: z.object({
    aspectRatio: z.enum(['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16']),
    resolution: z.enum(['1K', '2K', '4K', 'adaptive', '480p', '720p', '1080p']),
    durationSeconds: z.number().int().positive(),
    count: z.union([z.literal(1), z.literal(2), z.literal(4)]),
    withAudio: z.boolean(),
    mode: VideoGenerationModeSchema,
  }),
})

export const ModelDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  provider: z.string(),
  media: ModelMediaSchema,
  latencyLabel: z.string(),
  baseCredits: z.number().int().nonnegative(),
  controls: z.array(z.string()),
  capabilities: VideoModelCapabilitiesSchema.optional(),
  membershipTier: z.enum(['standard', 'vip']).optional(),
  availability: z.enum(['available', 'preview', 'coming-soon']).optional(),
  iconKey: z.string().optional(),
  tags: z.array(z.string()).optional(),
  description: z.string(),
})

export const ModelCatalogResponseSchema = z.object({
  version: z.string(),
  media: ModelMediaSchema.nullable(),
  query: z.string(),
  items: z.array(ModelDefinitionSchema),
})

export type ModelCatalogResponse = z.infer<typeof ModelCatalogResponseSchema>
