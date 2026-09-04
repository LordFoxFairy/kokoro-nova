import { z } from 'zod'

export const SkillCategorySchema = z.enum([
  '全部',
  '叙事分镜',
  '角色一致性',
  '广告文案',
  '提示词工程',
  '声音与配乐',
  '交付规范',
])

export const SkillCollectionSchema = z.enum(['全部', '收藏', '我的'])

const SkillOriginSchema = z.enum(['official', 'community', 'personal'])
const StableIdSchema = z.string().trim().min(1).max(200)

export const SkillSpecSectionSchema = z
  .object({
    heading: z.string(),
    body: z.string(),
  })
  .strict()

export const SkillCardSchema = z
  .object({
    id: StableIdSchema,
    name: z.string(),
    summary: z.string(),
    category: SkillCategorySchema.exclude(['全部']),
    author: z.string(),
    origin: SkillOriginSchema,
    version: z.string(),
    updatedAt: z.string().date(),
    hue: z.number().int().min(0).max(359),
    usageCount: z.number().int().nonnegative(),
    tags: z.array(z.string()),
    examples: z.array(z.string()),
    executableSpec: z.array(SkillSpecSectionSchema),
    favourite: z.boolean(),
  })
  .strict()

export const SkillCountsSchema = z
  .object({
    all: z.number().int().nonnegative(),
    favourite: z.number().int().nonnegative(),
    mine: z.number().int().nonnegative(),
  })
  .strict()

export const SkillListResponseSchema = z
  .object({
    skills: z.array(SkillCardSchema),
    category: SkillCategorySchema,
    collection: SkillCollectionSchema,
    counts: SkillCountsSchema,
  })
  .strict()

export const GetSkillResponseSchema = z
  .object({ skill: SkillCardSchema })
  .strict()

export const ToggleSkillFavouriteRequestSchema = z
  .object({ action: z.enum(['favourite', 'unfavourite']) })
  .strict()

export const ToggleSkillFavouriteResponseSchema = GetSkillResponseSchema

/** Context data used by the Skill-market composer drawers. */
export const SkillComposerContextKindSchema = z.enum(['attachments', 'references', 'skills', 'modes'])

export const SkillComposerAssetSchema = z
  .object({
    id: StableIdSchema,
    label: z.string().min(1),
    description: z.string().min(1),
    type: z.enum(['image', 'video', 'audio', 'document', 'character', 'style']),
    meta: z.string().min(1),
    thumbnail: z.string().url().or(z.string().startsWith('/')),
  })
  .strict()

export const SkillComposerSkillSchema = z
  .object({
    id: StableIdSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    category: SkillCategorySchema.exclude(['全部']),
    version: z.string().min(1),
    favourite: z.boolean(),
  })
  .strict()

export const SkillComposerModeSchema = z
  .object({
    id: z.enum(['manual', 'auto', 'draft']),
    label: z.string().min(1),
    description: z.string().min(1),
    hint: z.string().min(1),
  })
  .strict()

export const SkillComposerContextResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('attachments'),
    items: z.array(SkillComposerAssetSchema),
  }),
  z.object({
    kind: z.literal('references'),
    items: z.array(SkillComposerAssetSchema),
  }),
  z.object({
    kind: z.literal('skills'),
    items: z.array(SkillComposerSkillSchema),
    counts: SkillCountsSchema,
  }),
])

export const SkillComposerModesResponseSchema = z
  .object({
    kind: z.literal('modes'),
    items: z.array(SkillComposerModeSchema),
  })
  .strict()

export type SkillCardContract = z.infer<typeof SkillCardSchema>
export type SkillListResponse = z.infer<typeof SkillListResponseSchema>
export type GetSkillResponse = z.infer<typeof GetSkillResponseSchema>
export type ToggleSkillFavouriteRequest = z.infer<typeof ToggleSkillFavouriteRequestSchema>
export type ToggleSkillFavouriteResponse = z.infer<typeof ToggleSkillFavouriteResponseSchema>
export type SkillComposerAsset = z.infer<typeof SkillComposerAssetSchema>
export type SkillComposerSkill = z.infer<typeof SkillComposerSkillSchema>
export type SkillComposerMode = z.infer<typeof SkillComposerModeSchema>
export type SkillComposerContextResponse = z.infer<typeof SkillComposerContextResponseSchema>
export type SkillComposerModesResponse = z.infer<typeof SkillComposerModesResponseSchema>
