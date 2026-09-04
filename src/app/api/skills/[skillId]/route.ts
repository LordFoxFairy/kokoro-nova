import {
  GetSkillResponseSchema,
  ToggleSkillFavouriteRequestSchema,
  ToggleSkillFavouriteResponseSchema,
} from '@/contracts/skills'
import { HttpError, handle } from '@/server/http'
import { getSkill, setSkillFavourite } from '@/server/skills'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ skillId: string }> }

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { skillId } = await params
    return GetSkillResponseSchema.parse({ skill: await getSkill(skillId) })
  })
}

/**
 * Toggle the star.
 *
 * The action names the state it wants (`favourite` / `unfavourite`) instead of
 * saying "flip", so the endpoint is idempotent — see `setSkillFavourite`.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { skillId } = await params
    const body = ToggleSkillFavouriteRequestSchema.safeParse(await request.json().catch(() => ({})))
    if (!body.success) throw new HttpError(400, 'action 只接受 favourite 或 unfavourite')
    return ToggleSkillFavouriteResponseSchema.parse({
      skill: await setSkillFavourite(skillId, body.data.action === 'favourite'),
    })
  })
}
