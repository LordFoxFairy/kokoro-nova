import { describe, expect, it } from 'vitest'

import {
  SKILL_CATALOGUE,
  SKILL_CATEGORIES,
  applyFavourite,
  favouriteSkills,
  findSkill,
  isFavourite,
  parseSkillCategory,
  parseSkillCollection,
  searchSkills,
  selectSkills,
  skillsByCategory,
  toSkillCards,
  type Skill,
} from '@/domain/skills'

function skill(id: string, overrides: Partial<Skill> = {}): Skill {
  return {
    id,
    name: `技能 ${id}`,
    summary: '摘要',
    category: '叙事分镜',
    author: 'Lib 官方',
    origin: 'official',
    version: '1.0.0',
    updatedAt: '2026-01-01',
    hue: 200,
    usageCount: 0,
    tags: [],
    examples: ['示例'],
    executableSpec: [{ heading: '步骤', body: '正文' }],
    ...overrides,
  }
}

describe('catalogue', () => {
  it('has unique ids across at least ten skills', () => {
    expect(SKILL_CATALOGUE.length).toBeGreaterThanOrEqual(10)
    expect(new Set(SKILL_CATALOGUE.map((s) => s.id)).size).toBe(SKILL_CATALOGUE.length)
  })

  it('spreads over several categories, all of them selectable in the rail', () => {
    const used = new Set(SKILL_CATALOGUE.map((s) => s.category))
    expect(used.size).toBeGreaterThanOrEqual(4)
    for (const category of used) expect(SKILL_CATEGORIES).toContain(category)
  })

  it('ships a loadable contract on every row — a spec-less skill is not loadable', () => {
    for (const row of SKILL_CATALOGUE) {
      expect(row.executableSpec.length).toBeGreaterThan(0)
      expect(row.examples.length).toBeGreaterThan(0)
      for (const section of row.executableSpec) {
        expect(section.heading.trim()).not.toBe('')
        expect(section.body.trim()).not.toBe('')
      }
    }
  })

  it('keeps cover hues on the colour wheel so generated art is reproducible', () => {
    for (const row of SKILL_CATALOGUE) {
      expect(row.hue).toBeGreaterThanOrEqual(0)
      expect(row.hue).toBeLessThan(360)
    }
  })

  it('has a 我的 shelf to browse and resolves ids through findSkill', () => {
    expect(SKILL_CATALOGUE.some((s) => s.origin === 'personal')).toBe(true)
    expect(findSkill(SKILL_CATALOGUE[0].id)).toBe(SKILL_CATALOGUE[0])
    expect(findSkill('skill-does-not-exist')).toBeUndefined()
  })
})

describe('skillsByCategory', () => {
  const rows = [skill('a'), skill('b', { category: '广告文案' }), skill('c', { category: '广告文案' })]

  it('passes everything through for 全部', () => {
    expect(skillsByCategory(rows, '全部').map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps only the named category', () => {
    expect(skillsByCategory(rows, '广告文案').map((s) => s.id)).toEqual(['b', 'c'])
  })

  it('matches nothing for a category no skill declares', () => {
    expect(skillsByCategory(rows, '交付规范')).toEqual([])
  })

  it('never hands back the caller-owned array', () => {
    expect(skillsByCategory(rows, '全部')).not.toBe(rows)
  })
})

describe('searchSkills', () => {
  const rows = [
    skill('a', { name: '分镜拆解', tags: ['镜头表'] }),
    skill('b', { name: 'Shot List', summary: '把镜头表转成提示词', author: '社区' }),
    skill('c', { name: '交付校验', category: '交付规范' }),
  ]

  it('treats a blank or whitespace query as no filter at all', () => {
    expect(searchSkills(rows, '').map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(searchSkills(rows, '   ').map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('matches every field the card shows, so a visible match is never filtered out', () => {
    expect(searchSkills(rows, '拆解').map((s) => s.id)).toEqual(['a'])
    expect(searchSkills(rows, '镜头表').map((s) => s.id)).toEqual(['a', 'b'])
    expect(searchSkills(rows, '社区').map((s) => s.id)).toEqual(['b'])
    expect(searchSkills(rows, '交付规范').map((s) => s.id)).toEqual(['c'])
  })

  it('ignores case and surrounding whitespace', () => {
    expect(searchSkills(rows, '  shot LIST ').map((s) => s.id)).toEqual(['b'])
  })

  it('returns empty rather than falling back to everything on a miss', () => {
    expect(searchSkills(rows, '不存在的东西')).toEqual([])
  })
})

describe('favourites projection', () => {
  const rows = [skill('a'), skill('b'), skill('c')]

  it('is empty when nothing is starred', () => {
    expect(favouriteSkills(rows, [])).toEqual([])
  })

  it('reads in catalogue order, not in the order things were starred', () => {
    expect(favouriteSkills(rows, ['c', 'a']).map((s) => s.id)).toEqual(['a', 'c'])
  })

  it('drops ids whose skill left the catalogue instead of throwing', () => {
    expect(favouriteSkills(rows, ['b', 'skill-gone']).map((s) => s.id)).toEqual(['b'])
  })

  it('answers membership through isFavourite', () => {
    expect(isFavourite(['a'], 'a')).toBe(true)
    expect(isFavourite(['a'], 'b')).toBe(false)
    expect(isFavourite([], 'a')).toBe(false)
  })
})

describe('applyFavourite', () => {
  it('adds a star', () => {
    expect(applyFavourite([], 'a', true)).toEqual(['a'])
    expect(applyFavourite(['a'], 'b', true)).toEqual(['a', 'b'])
  })

  it('is idempotent — starring twice is indistinguishable from starring once', () => {
    const once = applyFavourite(['a'], 'b', true)
    expect(applyFavourite(once, 'b', true)).toEqual(once)
    expect(applyFavourite(applyFavourite(once, 'b', true), 'b', true)).toEqual(['a', 'b'])
  })

  it('removes a star, and removing an absent one is a no-op', () => {
    expect(applyFavourite(['a', 'b'], 'a', false)).toEqual(['b'])
    expect(applyFavourite(['b'], 'a', false)).toEqual(['b'])
    expect(applyFavourite([], 'a', false)).toEqual([])
  })

  it('never mutates the list it was given — it may be the persisted one', () => {
    const stored = ['a']
    applyFavourite(stored, 'b', true)
    applyFavourite(stored, 'a', false)
    expect(stored).toEqual(['a'])
    expect(applyFavourite(stored, 'b', true)).not.toBe(stored)
    expect(applyFavourite(stored, 'a', true)).not.toBe(stored)
  })

  it('leaves the seeded catalogue untouched through a full star/unstar cycle', () => {
    const before = JSON.stringify(SKILL_CATALOGUE)
    const target = SKILL_CATALOGUE[0].id
    const starred = applyFavourite([], target, true)
    applyFavourite(starred, target, false)
    expect(JSON.stringify(SKILL_CATALOGUE)).toBe(before)
    expect(SKILL_CATALOGUE[0]).not.toHaveProperty('favourite')
  })
})

describe('selectSkills', () => {
  const rows = [
    skill('official-a', { name: '分镜拆解', category: '叙事分镜' }),
    skill('community-b', { name: '连贯性巡检', category: '叙事分镜', origin: 'community' }),
    skill('mine-c', { name: '品牌口径守卫', category: '广告文案', origin: 'personal', author: '我' }),
    skill('mine-d', { name: '服装设定表', category: '角色一致性', origin: 'personal', author: '我' }),
  ]

  it('defaults to the whole catalogue', () => {
    expect(selectSkills(rows).map((s) => s.id)).toEqual(rows.map((s) => s.id))
  })

  it('narrows 收藏 to the starred rows only', () => {
    expect(selectSkills(rows, { collection: '收藏', favouriteIds: ['mine-c'] }).map((s) => s.id)).toEqual([
      'mine-c',
    ])
    expect(selectSkills(rows, { collection: '收藏' })).toEqual([])
  })

  it('narrows 我的 to what this space authored, not to what it starred', () => {
    expect(
      selectSkills(rows, { collection: '我的', favouriteIds: ['official-a'] }).map((s) => s.id),
    ).toEqual(['mine-c', 'mine-d'])
  })

  it('applies collection, category and query together', () => {
    expect(
      selectSkills(rows, { collection: '我的', category: '广告文案' }).map((s) => s.id),
    ).toEqual(['mine-c'])
    expect(
      selectSkills(rows, { collection: '收藏', favouriteIds: ['official-a', 'community-b'], query: '巡检' })
        .map((s) => s.id),
    ).toEqual(['community-b'])
    expect(selectSkills(rows, { collection: '我的', category: '叙事分镜' })).toEqual([])
  })

  it('falls back to 全部 for query values that are not real filter names', () => {
    expect(selectSkills(rows, { collection: 'starred', category: 'anything' }).map((s) => s.id)).toEqual(
      rows.map((s) => s.id),
    )
  })
})

describe('parsing query values', () => {
  it('keeps known values and rejects everything else', () => {
    expect(parseSkillCategory('广告文案')).toBe('广告文案')
    expect(parseSkillCategory('全部')).toBe('全部')
    expect(parseSkillCategory('nope')).toBe('全部')
    expect(parseSkillCategory(null)).toBe('全部')
    expect(parseSkillCollection('收藏')).toBe('收藏')
    expect(parseSkillCollection('我的')).toBe('我的')
    expect(parseSkillCollection(undefined)).toBe('全部')
  })
})

describe('toSkillCards', () => {
  const rows = [skill('a'), skill('b')]

  it('attaches this reader’s stars without writing them onto the catalogue row', () => {
    const cards = toSkillCards(rows, ['b'])
    expect(cards.map((c) => [c.id, c.favourite])).toEqual([
      ['a', false],
      ['b', true],
    ])
    expect(cards[1]).not.toBe(rows[1])
    expect(rows[1]).not.toHaveProperty('favourite')
  })

  it('marks nothing when the reader has no stars', () => {
    expect(toSkillCards(rows, []).every((c) => !c.favourite)).toBe(true)
  })
})
