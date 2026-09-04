import {
  AuthorSkillActionRequestSchema,
  AuthorSkillActionResponseSchema,
  GetAuthoredSkillResponseSchema,
  UpdateAuthoredSkillRequestSchema,
  UpdateAuthoredSkillResponseSchema,
} from '@/contracts/skills'
import { handle, parseJsonBody } from '@/server/http'
import { getAuthoredSkill, transitionAuthoredSkill, updateAuthoredSkill } from '@/server/skills-authoring'

export const dynamic = 'force-dynamic'
type Params = { params: Promise<{ skillId: string }> }

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { skillId } = await params
    return GetAuthoredSkillResponseSchema.parse({ skill: await getAuthoredSkill(skillId) })
  })
}

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { skillId } = await params
    const body = await parseJsonBody(request, UpdateAuthoredSkillRequestSchema)
    return UpdateAuthoredSkillResponseSchema.parse({ skill: await updateAuthoredSkill(skillId, body) })
  })
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { skillId } = await params
    const body = await parseJsonBody(request, AuthorSkillActionRequestSchema)
    return AuthorSkillActionResponseSchema.parse({ skill: await transitionAuthoredSkill(skillId, body.action) })
  })
}
