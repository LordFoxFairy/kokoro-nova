import type { ScenarioId } from '@/contracts/scenario'
import {
  SharedAssetsResponseSchema,
  TeamResponseSchema,
  teamFixtureForScenario,
  type SharedAssetsResponse,
  type TeamResponse,
} from '@/contracts/team'
import { readLocalTeamProjection } from '@/server/account-boundaries'
import { activeScenarioId } from '@/server/store'
import { readLocalIdentity } from '@/server/identity'

async function fixtureScenario(): Promise<ScenarioId> {
  const [scenarioId, identity] = await Promise.all([activeScenarioId(), readLocalIdentity()])
  return identity.session.status === 'authenticated' ? scenarioId : 'anonymous'
}

/** Read-only local projection. Future membership/storage services replace this seam. */
export async function readLocalTeam(): Promise<TeamResponse> {
  return TeamResponseSchema.parse(await readLocalTeamProjection())
}

/** Read-only local projection. It deliberately contains only fixture-relative URLs. */
export async function readLocalSharedAssets(): Promise<SharedAssetsResponse> {
  return SharedAssetsResponseSchema.parse(teamFixtureForScenario(await fixtureScenario()).sharedAssets)
}
