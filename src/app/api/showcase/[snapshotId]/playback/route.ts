import { ShowcasePlaybackManifestSchema } from '@/contracts/showcase'
import { handle } from '@/server/http'
import { findShowcasePlaybackManifest } from '@/server/showcase'

export const dynamic = 'force-dynamic'

/** Public, local-fixture playback manifest; native media bytes stay under /api/media. */
export async function GET(_request: Request, { params }: { params: Promise<{ snapshotId: string }> }) {
  return handle(async () => {
    const { snapshotId } = await params
    return ShowcasePlaybackManifestSchema.parse(await findShowcasePlaybackManifest(snapshotId))
  })
}
