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
/** The media kinds exposed by the observed local Skill author form. */
export const SkillOutputTypeSchema = z.enum(['image', 'video', 'audio', 'text'])
export const SkillCoverSchema = z.string().trim().max(512).refine((value) => value.startsWith('/') || /^https?:\/\//.test(value), '封面必须是站内路径或 HTTP(S) 地址')

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
    /** Personal authoring rows carry their reviewed author-form fields into 我的. */
    usageScenarios: z.string().max(1_000).optional(),
    howToUse: z.string().max(1_000).optional(),
    outputContent: z.string().max(1_000).optional(),
    outputTypes: z.array(SkillOutputTypeSchema).min(1).max(4).optional(),
    cover: SkillCoverSchema.nullable().optional(),
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

/* -------------------------------------------------------------------------- */
/* Local Skill authoring lifecycle                                             */
/* -------------------------------------------------------------------------- */

export const SkillAuthorStatusSchema = z.enum(['draft', 'in_review', 'published', 'unpublished'])
export const SkillReviewStatusSchema = z.enum(['not_requested', 'approved', 'changes_requested'])
export const SemanticVersionSchema = z.string().regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/, '必须是语义版本号，例如 0.1.0')

export const SkillAuthorFileSchema = z.object({
  path: z.string().regex(/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/, '文件路径不合法'),
  language: z.enum(['markdown', 'json', 'text']),
  content: z.string().max(20_000),
}).strict()

export const SkillAuthorReviewSchema = z.object({
  status: SkillReviewStatusSchema,
  checkedAt: z.string().datetime().nullable(),
  checks: z.array(z.object({
    id: z.enum(['name', 'summary', 'category', 'usage-scenarios', 'how-to-use', 'output-content', 'output-types', 'skill-file', 'semantic-version']),
    label: z.string(),
    passed: z.boolean(),
    message: z.string(),
  }).strict()),
}).strict()

export const AuthoredSkillSchema = z.object({
  id: StableIdSchema,
  name: z.string().max(80),
  summary: z.string().max(280),
  category: SkillCategorySchema.exclude(['全部']),
  usageScenarios: z.string().max(1_000),
  howToUse: z.string().max(1_000),
  outputContent: z.string().max(1_000),
  /** Drafts may be empty; review enforces at least one before publishing. */
  outputTypes: z.array(SkillOutputTypeSchema).max(4),
  cover: SkillCoverSchema.nullable(),
  version: SemanticVersionSchema,
  status: SkillAuthorStatusSchema,
  review: SkillAuthorReviewSchema,
  files: z.array(SkillAuthorFileSchema).min(1),
  tags: z.array(z.string().min(1).max(24)).max(8),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
  author: z.string(),
  hue: z.number().int().min(0).max(359),
}).strict()

export const AuthorSkillListResponseSchema = z.object({ skills: z.array(AuthoredSkillSchema) }).strict()
export const CreateAuthoredSkillRequestSchema = z.object({
  name: z.string().max(80).optional(),
}).strict()
export const CreateAuthoredSkillResponseSchema = z.object({ skill: AuthoredSkillSchema }).strict()
export const GetAuthoredSkillResponseSchema = z.object({ skill: AuthoredSkillSchema }).strict()
export const UpdateAuthoredSkillRequestSchema = z.object({
  name: z.string().max(80).optional(),
  summary: z.string().max(280).optional(),
  category: SkillCategorySchema.exclude(['全部']).optional(),
  usageScenarios: z.string().max(1_000).optional(),
  howToUse: z.string().max(1_000).optional(),
  outputContent: z.string().max(1_000).optional(),
  outputTypes: z.array(SkillOutputTypeSchema).max(4).optional(),
  cover: SkillCoverSchema.nullable().optional(),
  version: SemanticVersionSchema.optional(),
  files: z.array(SkillAuthorFileSchema).min(1).optional(),
  tags: z.array(z.string().min(1).max(24)).max(8).optional(),
}).strict()
export const UpdateAuthoredSkillResponseSchema = GetAuthoredSkillResponseSchema
export const AuthorSkillActionRequestSchema = z.object({ action: z.enum(['submit_review', 'publish', 'unpublish']) }).strict()
export const AuthorSkillActionResponseSchema = GetAuthoredSkillResponseSchema

export type SkillAuthorStatus = z.infer<typeof SkillAuthorStatusSchema>
export type SkillAuthorFile = z.infer<typeof SkillAuthorFileSchema>
export type SkillAuthorReview = z.infer<typeof SkillAuthorReviewSchema>
export type AuthoredSkill = z.infer<typeof AuthoredSkillSchema>
export type AuthorSkillListResponse = z.infer<typeof AuthorSkillListResponseSchema>
export type CreateAuthoredSkillRequest = z.infer<typeof CreateAuthoredSkillRequestSchema>
export type UpdateAuthoredSkillRequest = z.infer<typeof UpdateAuthoredSkillRequestSchema>
export type AuthorSkillActionRequest = z.infer<typeof AuthorSkillActionRequestSchema>
