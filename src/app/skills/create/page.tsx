import { SkillAuthorPage } from '@/components/skills/SkillAuthorPage'

export const dynamic = 'force-dynamic'

/** Backwards-compatible plural authoring route for existing Kokoro Nova links. */
export default function SkillsCreatePage() {
  return <SkillAuthorPage />
}
