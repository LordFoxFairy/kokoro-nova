import { afterAll, describe, expect, it } from 'vitest'

import {
  SkillComposerContextResponseSchema,
  SkillComposerModesResponseSchema,
} from '@/contracts/skills'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET } from './route'

describe.sequential('GET /api/skills composer context', () => {
  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('serves stable attachment, reference, Skill and mode fixtures on the existing Skills boundary', async () => {
    const attachments = await GET(new Request('http://localhost/api/skills?composer=attachments'))
    const references = await GET(new Request('http://localhost/api/skills?composer=references'))
    const skills = await GET(new Request('http://localhost/api/skills?composer=skills'))
    const modes = await GET(new Request('http://localhost/api/skills?composer=modes'))

    expect(attachments.status).toBe(200)
    expect(references.status).toBe(200)
    expect(skills.status).toBe(200)
    expect(modes.status).toBe(200)

    const attachmentBody = SkillComposerContextResponseSchema.parse(await attachments.json())
    const referenceBody = SkillComposerContextResponseSchema.parse(await references.json())
    const skillBody = SkillComposerContextResponseSchema.parse(await skills.json())
    expect(attachmentBody.kind).toBe('attachments')
    expect(attachmentBody.items[0]?.id).toBe('attachment-night-city-board')
    expect(referenceBody.kind).toBe('references')
    expect(referenceBody.items[0]?.id).toBe('reference-main-character')
    expect(skillBody.kind).toBe('skills')
    expect(skillBody.items[0]).toMatchObject({ id: 'skill-storyboard-breakdown', version: '2.4.0' })
    expect(SkillComposerModesResponseSchema.parse(await modes.json()).items.map((item) => item.id)).toEqual([
      'manual',
      'auto',
      'draft',
    ])
  })

  it('keeps empty and error fixtures deterministic and rejects unknown composer kinds', async () => {
    const empty = await GET(new Request('http://localhost/api/skills?composer=references&fixture=empty'))
    const error = await GET(new Request('http://localhost/api/skills?composer=references&fixture=error'))
    const invalid = await GET(new Request('http://localhost/api/skills?composer=other'))

    expect(empty.status).toBe(200)
    expect(await empty.json()).toEqual({ kind: 'references', items: [] })
    expect(error.status).toBe(503)
    expect(await error.json()).toEqual({ error: '本地上下文暂时不可用' })
    expect(invalid.status).toBe(400)
  })
})
