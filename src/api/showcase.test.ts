import { describe, expect, it } from 'vitest'

import { findShowcaseFixtureSnapshot } from '@/mocks/showcase'
import {
  buildShowcaseCloneMutations,
  getShowcaseSessionMode,
  toggleShowcaseFavourite,
} from './showcase'

describe('showcase clone workflow', () => {
  it('replays a frozen public snapshot through the canonical canvas mutation path', () => {
    const snapshot = findShowcaseFixtureSnapshot('showcase-dust-skeleton')
    expect(snapshot).not.toBeNull()

    const mutations = buildShowcaseCloneMutations(snapshot!.document)

    expect(mutations.filter((mutation) => mutation.op === 'addNode')).toHaveLength(snapshot!.document.nodes.length)
    expect(mutations.filter((mutation) => mutation.op === 'addEdge')).toHaveLength(snapshot!.document.edges.length)
    expect(mutations.filter((mutation) => mutation.op === 'addGroup')).toHaveLength(snapshot!.document.groups.length)
    expect(mutations.at(-1)).toEqual({ op: 'setViewport', viewport: snapshot!.document.viewport })
  })

  it('toggles a local favourite without duplicating ids', () => {
    expect(toggleShowcaseFavourite(['pub_city_night_01'], 'showcase-dust-skeleton')).toEqual([
      'pub_city_night_01',
      'showcase-dust-skeleton',
    ])
    expect(toggleShowcaseFavourite(['pub_city_night_01'], 'pub_city_night_01')).toEqual([])
  })

  it('projects the Account session before showcase mutations distinguish visitor modes', () => {
    expect(getShowcaseSessionMode({ loading: true, profile: null, error: null })).toBe('loading')
    expect(getShowcaseSessionMode({
      loading: false,
      profile: { identity: { maskedAccount: '未登录' } } as never,
      error: null,
    })).toBe('anonymous')
    expect(getShowcaseSessionMode({
      loading: false,
      profile: { identity: { maskedAccount: '188****2606' } } as never,
      error: null,
    })).toBe('authenticated')
    expect(getShowcaseSessionMode({ loading: false, profile: null, error: '本地会话不可用' })).toBe('unavailable')
  })
})
