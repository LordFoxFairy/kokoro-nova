import type { AccountProfileResponse } from '@/contracts/account'
import {
  ShowcaseCloneResponseSchema,
  ShowcaseListResponseSchema,
  type ShowcaseListQuery,
} from '@/contracts/showcase'
import type { CanvasMutation } from '@/domain/types'
import type { PublishedSnapshot } from '@/domain/publish'
import { client } from '@/lib/api'

export const SHOWCASE_FAVOURITES_STORAGE_KEY = 'kokoro-nova/showcase-favourites'

/**
 * Retained as a pure workflow utility for future adapters. The live local clone
 * now goes through one atomic publish command instead of two browser requests.
 */
export function buildShowcaseCloneMutations(snapshot: PublishedSnapshot['document']): CanvasMutation[] {
  return [
    ...snapshot.nodes.map((node) => ({ op: 'addNode' as const, node: structuredClone(node) })),
    ...snapshot.edges.map((edge) => ({ op: 'addEdge' as const, edge: structuredClone(edge) })),
    ...snapshot.groups.map((group) => ({ op: 'addGroup' as const, group: structuredClone(group) })),
    { op: 'setViewport', viewport: structuredClone(snapshot.viewport) },
  ]
}

export function isShowcaseAuthenticated(profile: AccountProfileResponse): boolean {
  return profile.identity.maskedAccount !== '未登录'
}

/**
 * The public surfaces use the Account endpoint as their one local session
 * projection. Mutations consult this settled projection synchronously so an
 * anonymous click opens its gate instead of first attempting a write.
 */
export type ShowcaseSessionMode = 'loading' | 'anonymous' | 'authenticated' | 'unavailable'

export function getShowcaseSessionMode({
  loading,
  profile,
  error,
}: {
  loading: boolean
  profile: AccountProfileResponse | null
  error: string | null
}): ShowcaseSessionMode {
  if (loading) return 'loading'
  if (error || !profile) return 'unavailable'
  return isShowcaseAuthenticated(profile) ? 'authenticated' : 'anonymous'
}

export function toggleShowcaseFavourite(ids: readonly string[], snapshotId: string): string[] {
  return ids.includes(snapshotId) ? ids.filter((id) => id !== snapshotId) : [...ids, snapshotId]
}

export async function listShowcasePage(input: Partial<ShowcaseListQuery> = {}) {
  const params = new URLSearchParams()
  if (input.category && input.category !== '全部') params.set('category', input.category)
  if (input.query?.trim()) params.set('q', input.query.trim())
  if (input.offset !== undefined) params.set('offset', String(input.offset))
  if (input.limit !== undefined) params.set('limit', String(input.limit))
  const suffix = params.toString()
  return ShowcaseListResponseSchema.parse(await client.raw.get(`/api/showcase${suffix ? `?${suffix}` : ''}`))
}

/** The only mutation boundary for cloning a public work into a private project. */
export async function cloneShowcaseSnapshot(snapshotId: string) {
  return ShowcaseCloneResponseSchema.parse(
    await client.raw.post(`/api/publish/${encodeURIComponent(snapshotId)}/clone`),
  )
}
