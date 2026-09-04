import { summarizeSnapshot } from '@/domain/publish'
import {
  GetPublishedSnapshotResponseSchema,
  RevokePublishedSnapshotResponseSchema,
} from '@/contracts/publish'
import { handle } from '@/server/http'
import { revokeSnapshot } from '@/server/publish'
import { findViewableShowcaseSnapshot } from '@/server/showcase'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ snapshotId: string }> }

/** 404 covers missing, hidden and revoked alike — see `findViewableSnapshot`. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { snapshotId } = await params
    const snapshot = await findViewableShowcaseSnapshot(snapshotId)
    return GetPublishedSnapshotResponseSchema.parse({ snapshot })
  })
}

/** 下架: a soft revoke, so the id keeps resolving while the work stops showing. */
export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { snapshotId } = await params
    const snapshot = await revokeSnapshot(snapshotId)
    return RevokePublishedSnapshotResponseSchema.parse({ snapshot: summarizeSnapshot(snapshot) })
  })
}
