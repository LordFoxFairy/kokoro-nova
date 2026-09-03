import { describe, expect, it } from 'vitest'

import { HomeDiscoveryResponseSchema } from '@/contracts/home'
import { HOME_DISCOVERY_CATALOG } from '@/mocks/home'

function collectUrls(value: unknown, urls: string[] = []): string[] {
  if (typeof value === 'string' && /(?:url|cover|image)/i.test(value)) urls.push(value)
  if (Array.isArray(value)) value.forEach((item) => collectUrls(item, urls))
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string' && /(?:url|cover|image)/i.test(key)) urls.push(item)
      else collectUrls(item, urls)
    }
  }
  return urls
}

describe('home discovery contract', () => {
  it('accepts the deterministic catalogue and keeps every media dependency local', () => {
    const parsed = HomeDiscoveryResponseSchema.parse({
      ...HOME_DISCOVERY_CATALOG,
      account: { credits: 408, unreadCount: 1, membershipLabel: '开通会员' },
      recentProjects: [],
    })

    expect(parsed.creatorTools).toHaveLength(6)
    expect(parsed.featuredSkills).toHaveLength(3)
    expect(parsed.showcase.length).toBeGreaterThanOrEqual(6)
    expect(collectUrls(parsed).every((url) => url.startsWith('/fixtures/libtv/'))).toBe(true)
  })

  it('has unique stable ids and valid category references', () => {
    const parsed = HomeDiscoveryResponseSchema.parse({
      ...HOME_DISCOVERY_CATALOG,
      account: { credits: 0, unreadCount: 0, membershipLabel: '开通会员' },
      recentProjects: [],
    })
    const ids = [
      parsed.campaign.id,
      ...parsed.creatorTools.map((item) => item.id),
      ...parsed.featuredSkills.map((item) => item.id),
      ...parsed.showcase.map((item) => item.id),
    ]

    expect(new Set(ids).size).toBe(ids.length)
    expect(parsed.showcase.every((item) => parsed.showcaseCategories.includes(item.category))).toBe(true)
  })

  it('rejects remote media URLs at the schema boundary', () => {
    expect(() =>
      HomeDiscoveryResponseSchema.parse({
        ...HOME_DISCOVERY_CATALOG,
        campaign: { ...HOME_DISCOVERY_CATALOG.campaign, imageUrl: 'https://www.liblib.tv/banner.webp' },
        account: { credits: 0, unreadCount: 0, membershipLabel: '开通会员' },
        recentProjects: [],
      }),
    ).toThrow()
  })
})
