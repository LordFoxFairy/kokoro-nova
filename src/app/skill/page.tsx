import { SkillGallery } from '@/components/skills/SkillGallery'

export const dynamic = 'force-dynamic'

/**
 * LibTV's observed marketplace address is singular. Keep this route rendered
 * in place instead of redirecting so shared links retain the official-shaped
 * path while `/skills` remains a backwards-compatible local alias.
 */
export default function SkillAliasPage() {
  return <SkillGallery />
}
