import { TeamResponseSchema } from '@/contracts/team'
import { handle } from '@/server/http'
import { readLocalTeam } from '@/server/team'

export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(async () => TeamResponseSchema.parse(await readLocalTeam()))
}
