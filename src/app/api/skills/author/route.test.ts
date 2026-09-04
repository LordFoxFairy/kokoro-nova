import { afterEach, describe, expect, it } from 'vitest'

import { AuthorSkillListResponseSchema, CreateAuthoredSkillResponseSchema } from '@/contracts/skills'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET, POST } from './route'

describe.sequential('Skill authoring collection route', () => {
  afterEach(async () => { await resetStore(DEFAULT_SCENARIO_ID) })

  it('starts empty and creates the deterministic draft/file template', async () => {
    const empty = await GET()
    expect(AuthorSkillListResponseSchema.parse(await empty.json())).toEqual({ skills: [] })

    const created = await POST(new Request('http://localhost/api/skills/author', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '镜头节奏助手' }) }))
    expect(created.status).toBe(200)
    const body = CreateAuthoredSkillResponseSchema.parse(await created.json())
    expect(body.skill).toMatchObject({ id: 'skill-local-001', name: '镜头节奏助手', version: '0.1.0', status: 'draft' })
    expect(body.skill.files.map((file) => file.path)).toEqual(['SKILL.md', 'references.json'])
  })
})
