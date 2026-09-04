import { ShowcaseCloneResponseSchema } from '@/contracts/showcase'
import { handle } from '@/server/http'
import { clonePublicSnapshot } from '@/server/publish'
import { findViewableShowcaseSnapshot } from '@/server/showcase'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ snapshotId: string }> }

/** Create a private, independently editable project from an immutable public snapshot. */
export async function POST(_request: Request, { params }: Params) {
  return handle(async () => {
    const { snapshotId } = await params
    const snapshot = await findViewableShowcaseSnapshot(snapshotId)
    return ShowcaseCloneResponseSchema.parse(await clonePublicSnapshot(snapshot))
  })
}
