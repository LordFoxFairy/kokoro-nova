import { HOME_DISCOVERY_CATALOG } from '@/mocks/home'
import { handle } from '@/server/http'
import { listShowcaseEntries } from '@/server/showcase'
import { readLocalIdentity } from '@/server/identity'
import { DEFAULT_SPACE_ID, isProjectRecycled, readState } from '@/server/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(async () => {
    const [state, identity] = await Promise.all([readState(), readLocalIdentity()])
    // The scenario seeds public discovery, while the identity store remains the
    // sole authority for a local session transition. This lets an anonymous
    // fixture sign in without changing its deterministic catalogue.
    const authenticated = identity.session.status === 'authenticated'
    const recentProjects = state.projects
      .filter((project) => project.spaceId === DEFAULT_SPACE_ID && !isProjectRecycled(project))
      .slice()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 3)
      .map(({ id, name, coverUrl, updatedAt }) => ({ id, name, coverUrl, updatedAt }))

    const showcaseEntries = await listShowcaseEntries()

    return {
      ...HOME_DISCOVERY_CATALOG,
      showcase: showcaseEntries.map(({ id, snapshotId, title, author, authorTier, coverUrl, likeCount, processAvailable, category }) => ({
        id,
        snapshotId,
        title,
        author,
        authorTier,
        coverUrl,
        likeCount,
        processAvailable,
        category,
      })),
      account: {
        credits: authenticated ? (state.balances[DEFAULT_SPACE_ID] ?? 0) : 0,
        unreadCount: authenticated ? 1 : 0,
        membershipLabel: authenticated ? '开通会员' : '登录',
      },
      recentProjects: authenticated ? recentProjects : [],
    }
  })
}
