import { HOME_DISCOVERY_CATALOG } from '@/mocks/home'
import { SCENARIO_CATALOG } from '@/mocks/scenarios/catalog'
import { handle } from '@/server/http'
import { listShowcaseEntries } from '@/server/showcase'
import { activeScenarioId, DEFAULT_SPACE_ID, isProjectRecycled, readState } from '@/server/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(async () => {
    const [state, scenarioId] = await Promise.all([readState(), activeScenarioId()])
    const viewer = SCENARIO_CATALOG[scenarioId].viewer
    const authenticated = viewer !== 'anonymous'
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
