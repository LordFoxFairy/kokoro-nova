import { SkillListResponseSchema } from '@/contracts/skills'
import { handle } from '@/server/http'
import { listSkills } from '@/server/skills'

export const dynamic = 'force-dynamic'

/**
 * Skill catalogue feed.
 *
 * `collection` is 全部 / 收藏 / 我的. Unrecognised values fall back to 全部
 * rather than erroring: the parameter comes from a URL a reader can edit, and a
 * broken tab name is not a reason to refuse to show the catalogue.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url)
    return SkillListResponseSchema.parse(await listSkills({
      category: url.searchParams.get('category'),
      query: url.searchParams.get('q'),
      collection: url.searchParams.get('collection'),
    }))
  })
}
