import { ShowcaseDetailResponseSchema } from '@/contracts/showcase'
import { handle } from '@/server/http'
import { findShowcaseDetail } from '@/server/showcase'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ snapshotId: string }> }) {
  return handle(async () => {
    const { snapshotId } = await params
    return ShowcaseDetailResponseSchema.parse(await findShowcaseDetail(snapshotId))
  })
}
