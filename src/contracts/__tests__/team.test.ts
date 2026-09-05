import { describe, expect, it } from 'vitest'

import {
  SharedAssetsResponseSchema,
  TeamResponseSchema,
  teamFixtureForScenario,
} from '../team'

describe('local team and shared-assets contract', () => {
  it('keeps populated, empty and permission fixtures explicitly typed', () => {
    const populated = TeamResponseSchema.parse(teamFixtureForScenario('authenticated-populated').team)
    expect(populated.state).toBe('ready')
    expect(populated.team?.role).toBe('owner')

    const empty = TeamResponseSchema.parse(teamFixtureForScenario('authenticated-empty').team)
    expect(empty).toMatchObject({ state: 'empty', team: null })

    const denied = SharedAssetsResponseSchema.parse(teamFixtureForScenario('anonymous').sharedAssets)
    expect(denied).toMatchObject({ state: 'permission-denied', assets: [] })
  })
})
