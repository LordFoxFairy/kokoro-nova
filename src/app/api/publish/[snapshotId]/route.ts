import { summarizeSnapshot } from '@/domain/publish'
import {
  GetPublishedSnapshotResponseSchema,
  RevokePublishedSnapshotResponseSchema,
} from '@/contracts/publish'
import { handle } from '@/server/http'
import { findViewableSnapshot, revokeSnapshot } from '@/server/publish'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ snapshotId: string }> }

/** 404 covers missing, hidden and revoked alike — see `findViewableSnapshot`. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { snapshotId } = await params
    return GetPublishedSnapshotResponseSchema.parse({ snapshot: await findViewableSnapshot(snapshotId) })
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
