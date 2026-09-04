import {
  SkillComposerContextKindSchema,
  SkillComposerContextResponseSchema,
  SkillComposerModesResponseSchema,
  SkillListResponseSchema,
} from '@/contracts/skills'
import { composerAssets, SKILL_COMPOSER_MODES } from '@/mocks/skills'
import { handle, HttpError } from '@/server/http'
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
    if (url.searchParams.has('composer')) {
      const composer = SkillComposerContextKindSchema.safeParse(url.searchParams.get('composer'))
      if (!composer.success) throw new HttpError(400, '未知的 Skill composer context')
      const fixture = url.searchParams.get('fixture')
      if (fixture === 'error') throw new HttpError(503, '本地上下文暂时不可用')

      if (composer.data === 'modes') {
        return SkillComposerModesResponseSchema.parse({ kind: 'modes', items: SKILL_COMPOSER_MODES })
      }

      if (composer.data === 'skills') {
        const result = await listSkills({
          query: url.searchParams.get('q'),
          collection: url.searchParams.get('collection'),
        })
        return SkillComposerContextResponseSchema.parse({
          kind: 'skills',
          items: fixture === 'empty' ? [] : result.skills.map((skill) => ({
            id: skill.id,
            name: skill.name,
            summary: skill.summary,
            category: skill.category,
            version: skill.version,
            favourite: skill.favourite,
          })),
          counts: result.counts,
        })
      }

      return SkillComposerContextResponseSchema.parse({
        kind: composer.data,
        items: fixture === 'empty' ? [] : composerAssets(composer.data),
      })
    }
    return SkillListResponseSchema.parse(await listSkills({
      category: url.searchParams.get('category'),
      query: url.searchParams.get('q'),
      collection: url.searchParams.get('collection'),
    }))
  })
}
