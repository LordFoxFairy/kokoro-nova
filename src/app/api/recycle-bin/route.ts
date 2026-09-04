import { handle } from '@/server/http'
import { purgeExpiredRecycledProjects, recycledProjects, withState } from '@/server/store'

export const dynamic = 'force-dynamic'

/** List active recycle-bin entries. Expired entries are atomically purged first. */
export async function GET() {
  return handle(async () =>
    withState((state) => {
      const purgedProjectIds = purgeExpiredRecycledProjects(state)
      return { projects: recycledProjects(state), purgedProjectIds }
    }),
  )
}
