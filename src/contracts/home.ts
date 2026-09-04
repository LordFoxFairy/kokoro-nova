import { z } from 'zod'

import { ShowcaseCategorySchema, ShowcaseEntryProjectionBaseSchema } from './showcase'

const IsoTimestampSchema = z.string().datetime()

/**
 * Home discovery media is intentionally served from deterministic fixtures.
 * Keeping this constraint in the runtime contract prevents a future UI change
 * from silently depending on the live LibTV CDN.
 */
export const LocalFixtureUrlSchema = z.string().regex(/^\/fixtures\/libtv\//)

export const HomeCampaignSchema = z.object({
  id: z.string(),
  message: z.string(),
  cta: z.string(),
  imageUrl: LocalFixtureUrlSchema,
})

export const HomeAccountSchema = z.object({
  credits: z.number().finite().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
  membershipLabel: z.string(),
})

export const HomeCreatorToolSchema = z.object({
  id: z.string(),
  title: z.string(),
  badge: z.string().nullable(),
  description: z.string(),
  intent: z.enum(['blank', 'video-model', 'director', 'frame-analysis', 'segment-remake']),
})

export const HomeRecentProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  coverUrl: LocalFixtureUrlSchema.nullable(),
  updatedAt: IsoTimestampSchema,
})

export const HomeFeaturedSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  coverUrl: LocalFixtureUrlSchema,
})

/**
 * Home only renders a compact card, but its identity and discovery metadata
 * must remain the same projection served by /api/showcase.
 */
export const HomeShowcaseItemSchema = ShowcaseEntryProjectionBaseSchema.pick({
  id: true,
  snapshotId: true,
  title: true,
  author: true,
  authorTier: true,
  coverUrl: true,
  likeCount: true,
  processAvailable: true,
  category: true,
})
  .extend({ coverUrl: LocalFixtureUrlSchema })
  .refine((entry) => entry.id === entry.snapshotId, {
    message: '公开发现 id 必须与 snapshotId 一致',
    path: ['snapshotId'],
  })

export const HomeDiscoveryResponseSchema = z.object({
  campaign: HomeCampaignSchema,
  account: HomeAccountSchema,
  creatorTools: z.array(HomeCreatorToolSchema),
  recentProjects: z.array(HomeRecentProjectSchema),
  featuredSkills: z.array(HomeFeaturedSkillSchema),
  showcase: z.array(HomeShowcaseItemSchema),
  showcaseCategories: z.array(ShowcaseCategorySchema),
})

export type HomeDiscoveryResponse = z.infer<typeof HomeDiscoveryResponseSchema>
export type HomeDiscoveryCatalog = Omit<HomeDiscoveryResponse, 'account' | 'recentProjects'>
export type HomeShowcaseItem = z.infer<typeof HomeShowcaseItemSchema>
