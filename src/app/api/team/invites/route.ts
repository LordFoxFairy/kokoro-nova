import { CreateTeamInviteRequestSchema, CreateTeamInviteResponseSchema } from '@/contracts/team'
import { createLocalTeamInvite } from '@/server/account-boundaries'
import { handle, parseJsonBody } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseJsonBody(request, CreateTeamInviteRequestSchema)
    return CreateTeamInviteResponseSchema.parse(await createLocalTeamInvite(body))
  })
}
