import { describe, expect, it } from 'vitest'

import { getSkillGalleryRequestState } from '../SkillGallery'
import { getSkillDetailRequestState } from '../SkillDetail'

describe('skill surface state copy', () => {
  it('keeps the catalogue actionable across loading, stale and empty states', () => {
    expect(getSkillGalleryRequestState({ loading: true, initialised: false, hasSkills: false, error: null })).toBe('initial-loading')
    expect(getSkillGalleryRequestState({ loading: true, initialised: true, hasSkills: true, error: null })).toBe('refreshing')
    expect(getSkillGalleryRequestState({ loading: false, initialised: true, hasSkills: true, error: '请求失败' })).toBe('stale-error')
    expect(getSkillGalleryRequestState({ loading: false, initialised: true, hasSkills: false, error: '请求失败' })).toBe('error')
    expect(getSkillGalleryRequestState({ loading: false, initialised: true, hasSkills: false, error: null })).toBe('empty')
  })

  it('separates a missing detail from a loading failure that can be retried', () => {
    expect(getSkillDetailRequestState({ loading: true, hasSkill: false, error: null })).toBe('loading')
    expect(getSkillDetailRequestState({ loading: false, hasSkill: false, error: '请求失败' })).toBe('error')
    expect(getSkillDetailRequestState({ loading: false, hasSkill: false, error: null })).toBe('missing')
    expect(getSkillDetailRequestState({ loading: false, hasSkill: true, error: null })).toBe('ready')
  })
})
