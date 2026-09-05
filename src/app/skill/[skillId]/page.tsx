import { SkillDetail } from '@/components/skills/SkillDetail'

export const dynamic = 'force-dynamic'

/** Singular LibTV-compatible detail address; `/skills/[skillId]` stays valid. */
export default async function SkillAliasDetailPage({
  params,
}: {
  params: Promise<{ skillId: string }>
}) {
  const { skillId } = await params
  return <SkillDetail skillId={skillId} />
}
