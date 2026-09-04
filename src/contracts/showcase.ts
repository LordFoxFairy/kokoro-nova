import { z } from 'zod'

export const ShowcaseCategorySchema = z.enum([
  '全部',
  'AI 漫剧精卫计划',
  '广告导演请就位',
  '精选画布',
  '专业影视',
  '短剧漫剧',
  '商业广告',
  '动漫游戏',
  '教育生活',
  'TV 工具箱',
])

export const ShowcaseQualitySchema = z.enum(['auto', '480p', '720p', 'original'])

export const ShowcaseMediaSchema = z.object({
  url: z.string().nullable(),
  posterUrl: z.string().nullable(),
  durationSeconds: z.number().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  originalQualityLabel: z.string().min(1),
})

export const ShowcaseEntryProjectionSchema = z.object({
  id: z.string().min(1),
  snapshotId: z.string().min(1),
  title: z.string(),
  summary: z.string(),
  coverUrl: z.string().nullable(),
  publishedAt: z.string().datetime(),
  nodeCount: z.number().int().nonnegative(),
  mediaCount: z.number().int().nonnegative(),
  category: ShowcaseCategorySchema.exclude(['全部']),
  author: z.string(),
  authorTier: z.string().nullable(),
  authorAvatarUrl: z.string().nullable(),
  likeCount: z.number().int().nonnegative(),
  viewCount: z.number().int().nonnegative(),
  hasAiContent: z.boolean(),
  processAvailable: z.boolean(),
  media: ShowcaseMediaSchema,
})

export const ShowcaseDetailResponseSchema = z.object({
  entry: ShowcaseEntryProjectionSchema,
  related: z.array(ShowcaseEntryProjectionSchema),
})

export const ShowcaseListResponseSchema = z.object({
  entries: z.array(ShowcaseEntryProjectionSchema),
})

export type ShowcaseCategory = z.infer<typeof ShowcaseCategorySchema>
export type ShowcaseQuality = z.infer<typeof ShowcaseQualitySchema>
export type ShowcaseMedia = z.infer<typeof ShowcaseMediaSchema>
export type ShowcaseEntryProjection = z.infer<typeof ShowcaseEntryProjectionSchema>
export type ShowcaseDetailResponse = z.infer<typeof ShowcaseDetailResponseSchema>
export type ShowcaseListResponse = z.infer<typeof ShowcaseListResponseSchema>
