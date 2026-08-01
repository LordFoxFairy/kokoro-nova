import { HttpError, handle } from '@/server/http'
import { getSkill, setSkillFavourite } from '@/server/skills'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ skillId: string }> }

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { skillId } = await params
    return { skill: await getSkill(skillId) }
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
    const body = (await request.json().catch(() => ({}))) as { action?: string }
    if (body.action !== 'favourite' && body.action !== 'unfavourite') {
      throw new HttpError(400, 'action 只接受 favourite 或 unfavourite')
    }
    return { skill: await setSkillFavourite(skillId, body.action === 'favourite') }
  })
}
