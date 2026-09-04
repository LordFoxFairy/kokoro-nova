import { summarizeSnapshot } from '@/domain/publish'
import {
  ListPublishedSnapshotsResponseSchema,
  PublishCanvasResponseSchema,
  PublishRequestSchema,
} from '@/contracts/publish'
import { handle, parseJsonBody } from '@/server/http'
import { listPublishedSnapshots, publishCanvas } from '@/server/publish'

export const dynamic = 'force-dynamic'

/** Public gallery feed. No auth: a listed snapshot is public by definition. */
export async function GET() {
  return handle(async () => ListPublishedSnapshotsResponseSchema.parse({ snapshots: await listPublishedSnapshots() }))
}

export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseJsonBody(request, PublishRequestSchema)
    const snapshot = await publishCanvas(body)
    // The caller just froze the document it already holds, so the summary is
    // enough — the full copy is fetched by whoever opens the public page.
    return PublishCanvasResponseSchema.parse({ snapshot: summarizeSnapshot(snapshot) })
  })
}
