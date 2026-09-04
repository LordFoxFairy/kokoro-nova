import { describe, expect, it } from 'vitest'

import {
  GetPublishedSnapshotResponseSchema,
  ListPublishedSnapshotsResponseSchema,
  PublishedSnapshotSchema,
  SnapshotSummarySchema,
} from '@/contracts/publish'
import { SkillCardSchema, SkillListResponseSchema } from '@/contracts/skills'
import { emptyDocument } from '@/domain/factory'
import { freezeSnapshot, summarizeSnapshot } from '@/domain/publish'
import { SKILL_CATALOGUE } from '@/domain/skills'

describe('public discovery and marketplace contracts', () => {
  it('keeps Skill cards and collection metadata executable from the local catalogue', () => {
    const card = SkillCardSchema.parse({ ...SKILL_CATALOGUE[0], favourite: false })
    const response = SkillListResponseSchema.parse({
      skills: [card],
      category: '全部',
      collection: '全部',
      counts: { all: 1, favourite: 0, mine: 0 },
    })

    expect(response.skills[0].id).toBe(SKILL_CATALOGUE[0].id)
    expect(response.skills[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps published detail and list rows as separate response shapes', () => {
    const snapshot = freezeSnapshot(emptyDocument(), {
      id: 'pub_fixture',
      projectId: 'prj_fixture',
      canvasId: 'cvs_fixture',
      title: '本地样本',
      publishedAt: '2026-09-04T00:00:00.000Z',
    })

    const detail = GetPublishedSnapshotResponseSchema.parse({ snapshot })
    const summary = SnapshotSummarySchema.parse(summarizeSnapshot(snapshot))
    const listing = ListPublishedSnapshotsResponseSchema.parse({ snapshots: [summary] })

    expect(PublishedSnapshotSchema.parse(detail.snapshot).document).toEqual(emptyDocument())
    expect(listing.snapshots[0]).not.toHaveProperty('document')
    expect(listing.snapshots[0].nodeCount).toBe(0)
  })
})
