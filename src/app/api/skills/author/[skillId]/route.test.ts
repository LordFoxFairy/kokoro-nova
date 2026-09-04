import { afterEach, describe, expect, it } from 'vitest'

import { AuthorSkillActionResponseSchema, GetAuthoredSkillResponseSchema } from '@/contracts/skills'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { POST as create } from '../route'
import { GET, PATCH, POST } from './route'

const params = { params: Promise.resolve({ skillId: 'skill-local-001' }) }
const request = (method: 'POST' | 'PATCH', body: unknown) => new Request('http://localhost/api/skills/author/skill-local-001', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe.sequential('Skill authoring detail lifecycle route', () => {
  afterEach(async () => { await resetStore(DEFAULT_SCENARIO_ID) })

  it('returns a validation error, then reviews, publishes and unpublishes a versioned file tree', async () => {
    await create(new Request('http://localhost/api/skills/author', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
    const invalidPublish = await POST(request('POST', { action: 'publish' }), params)
    expect(invalidPublish.status).toBe(422)
    expect((await invalidPublish.json()).error).toContain('简介')

    const saved = await PATCH(request('PATCH', {
      name: '镜头节奏助手',
      summary: '将镜头表整理为节奏明确、可执行的短片创作任务。',
      category: '叙事分镜',
      usageScenarios: '适用于脚本定稿后需要明确镜头节奏的短片创作。',
      howToUse: '输入镜头表与目标时长，调用后确认镜头节奏。',
      outputContent: '返回镜头节奏表、转场建议与可执行镜头清单。',
      outputTypes: ['image', 'video', 'text'],
      cover: '/fixtures/libtv/skills/example-01.svg',
      version: '1.2.0',
      tags: ['节奏', '镜头'],
      files: [
        { path: 'SKILL.md', language: 'markdown', content: '# 镜头节奏助手\n\n## 执行步骤\n1. 读取镜头表。' },
        { path: 'notes/review.md', language: 'markdown', content: '# 审核说明' },
      ],
    }), params)
    expect(saved.status).toBe(200)
    expect(GetAuthoredSkillResponseSchema.parse(await saved.json()).skill.files).toHaveLength(2)

    const reviewed = await POST(request('POST', { action: 'submit_review' }), params)
    expect(AuthorSkillActionResponseSchema.parse(await reviewed.json()).skill).toMatchObject({ status: 'in_review', review: { status: 'approved' } })
    const published = await POST(request('POST', { action: 'publish' }), params)
    expect(AuthorSkillActionResponseSchema.parse(await published.json()).skill).toMatchObject({ status: 'published', version: '1.2.0', outputTypes: ['image', 'video', 'text'], cover: '/fixtures/libtv/skills/example-01.svg' })
    const unpublished = await POST(request('POST', { action: 'unpublish' }), params)
    expect(AuthorSkillActionResponseSchema.parse(await unpublished.json()).skill.status).toBe('unpublished')

    const after = await GET(new Request('http://localhost/api/skills/author/skill-local-001'), params)
    expect(GetAuthoredSkillResponseSchema.parse(await after.json()).skill.status).toBe('unpublished')
  })
})
