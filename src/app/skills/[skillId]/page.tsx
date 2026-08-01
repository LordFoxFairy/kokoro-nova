import { SkillDetail } from '@/components/skills/SkillDetail'

export const dynamic = 'force-dynamic'

/**
 * Skill detail route.
 *
 * The id in the URL is the catalogue id, which is stable across versions — a new
 * version replaces the contract behind the same address rather than minting a
 * new page, so a link handed out today keeps pointing at "this skill".
 */
export default async function SkillDetailPage({ params }: { params: Promise<{ skillId: string }> }) {
  const { skillId } = await params
  return <SkillDetail skillId={skillId} />
}
