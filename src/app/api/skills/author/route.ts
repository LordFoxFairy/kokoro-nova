import {
  AuthorSkillListResponseSchema,
  CreateAuthoredSkillRequestSchema,
  CreateAuthoredSkillResponseSchema,
} from '@/contracts/skills'
import { handle, parseJsonBody } from '@/server/http'
import { createAuthoredSkill, listAuthoredSkills } from '@/server/skills-authoring'

export const dynamic = 'force-dynamic'

/** Local-only author shelf. Resetting the dev store resets this deterministic workspace aggregate. */
export async function GET() {
  return handle(async () => AuthorSkillListResponseSchema.parse({ skills: await listAuthoredSkills() }))
}

export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseJsonBody(request, CreateAuthoredSkillRequestSchema)
    return CreateAuthoredSkillResponseSchema.parse({ skill: await createAuthoredSkill(body.name) })
  })
}
