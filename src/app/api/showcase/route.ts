import { ShowcaseListResponseSchema } from '@/contracts/showcase'
import { handle } from '@/server/http'
import { listShowcaseEntries } from '@/server/showcase'

export const dynamic = 'force-dynamic'

/** Discovery projection: rich TV Show metadata without copying it into snapshots. */
export async function GET() {
  return handle(async () => ShowcaseListResponseSchema.parse({ entries: await listShowcaseEntries() }))
}
