import { describe, expect, it, vi } from 'vitest'

import { skillAuthoringApi } from '@/api/skills-authoring'
import { api } from '@/lib/api'

const record = {
  id: 'skill-local-001', name: '镜头节奏助手', summary: '将镜头表整理为节奏明确的短片执行单。', category: '叙事分镜', version: '0.1.0', status: 'draft',
  review: { status: 'not_requested', checkedAt: null, checks: [] }, files: [{ path: 'SKILL.md', language: 'markdown', content: '# Skill' }], tags: [],
  createdAt: '2026-09-04T12:00:00.000Z', updatedAt: '2026-09-04T12:00:00.000Z', publishedAt: null, author: '本地创作者', hue: 204,
}

describe('typed Skill authoring client', () => {
  it('uses local authoring paths and parses create/update/action responses', async () => {
    const post = vi.spyOn(api, 'post')
      .mockResolvedValueOnce({ skill: record })
      .mockResolvedValueOnce({ skill: { ...record, status: 'in_review', review: { ...record.review, status: 'approved' } } })
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ skill: { ...record, status: 'in_review', review: { ...record.review, status: 'approved' } } })
    await expect(skillAuthoringApi.create({ name: record.name })).resolves.toMatchObject({ skill: { id: record.id } })
    await expect(skillAuthoringApi.update(record.id, { summary: record.summary })).resolves.toMatchObject({ skill: { name: record.name } })
    await expect(skillAuthoringApi.action(record.id, 'submit_review')).resolves.toMatchObject({ skill: { status: 'in_review' } })
    expect(post).toHaveBeenNthCalledWith(1, '/api/skills/author', { name: record.name })
    expect(patch).toHaveBeenCalledWith('/api/skills/author/skill-local-001', { summary: record.summary })
    expect(post).toHaveBeenNthCalledWith(2, '/api/skills/author/skill-local-001', { action: 'submit_review' })
    post.mockRestore(); patch.mockRestore()
  })
})
