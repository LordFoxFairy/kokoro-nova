import { z } from 'zod'

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

export const HomeShowcaseItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  authorTier: z.string().nullable(),
  coverUrl: LocalFixtureUrlSchema,
  likeCount: z.number().int().nonnegative(),
  processAvailable: z.boolean(),
  category: z.string(),
})

export const HomeDiscoveryResponseSchema = z.object({
  campaign: HomeCampaignSchema,
  account: HomeAccountSchema,
  creatorTools: z.array(HomeCreatorToolSchema),
  recentProjects: z.array(HomeRecentProjectSchema),
  featuredSkills: z.array(HomeFeaturedSkillSchema),
  showcase: z.array(HomeShowcaseItemSchema),
  showcaseCategories: z.array(z.string()),
})

export type HomeDiscoveryResponse = z.infer<typeof HomeDiscoveryResponseSchema>
export type HomeDiscoveryCatalog = Omit<HomeDiscoveryResponse, 'account' | 'recentProjects'>
