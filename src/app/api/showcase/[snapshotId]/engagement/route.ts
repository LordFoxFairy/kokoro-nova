import { ShowcaseEngagementRequestSchema, ShowcaseEngagementResponseSchema } from '@/contracts/showcase'
import { handle, parseJsonBody } from '@/server/http'
import { getShowcaseEngagement, updateShowcaseEngagement } from '@/server/showcase'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ snapshotId: string }> }

/** Local viewer engagement lives beside, never inside, the immutable TV Show snapshot. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { snapshotId } = await params
    return ShowcaseEngagementResponseSchema.parse(await getShowcaseEngagement(snapshotId))
  })
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { snapshotId } = await params
    const input = await parseJsonBody(request, ShowcaseEngagementRequestSchema)
    return ShowcaseEngagementResponseSchema.parse(await updateShowcaseEngagement(snapshotId, input))
  })
}
