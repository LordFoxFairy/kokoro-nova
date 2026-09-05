import { TeamMemberUpdateResponseSchema, UpdateTeamMemberRequestSchema } from '@/contracts/team'
import { updateLocalTeamMember } from '@/server/account-boundaries'
import { handle, parseJsonBody } from '@/server/http'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, context: { params: Promise<{ memberId: string }> }) {
  return handle(async () => {
    const { memberId } = await context.params
    const body = await parseJsonBody(request, UpdateTeamMemberRequestSchema)
    return TeamMemberUpdateResponseSchema.parse(await updateLocalTeamMember(memberId, body))
  })
}
