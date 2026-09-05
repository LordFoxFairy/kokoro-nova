import { SharedAssetsResponseSchema } from '@/contracts/team'
import { handle } from '@/server/http'
import { readLocalSharedAssets } from '@/server/team'

export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(async () => SharedAssetsResponseSchema.parse(await readLocalSharedAssets()))
}
