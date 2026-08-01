import { summarizeSnapshot } from '@/domain/publish'
import { handle } from '@/server/http'
import { listPublishedSnapshots, publishCanvas, type PublishInput } from '@/server/publish'

export const dynamic = 'force-dynamic'

/** Public gallery feed. No auth: a listed snapshot is public by definition. */
export async function GET() {
  return handle(async () => ({ snapshots: await listPublishedSnapshots() }))
}

export async function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json().catch(() => ({}))) as PublishInput
    const snapshot = await publishCanvas(body)
    // The caller just froze the document it already holds, so the summary is
    // enough — the full copy is fetched by whoever opens the public page.
    return { snapshot: summarizeSnapshot(snapshot) }
  })
}
