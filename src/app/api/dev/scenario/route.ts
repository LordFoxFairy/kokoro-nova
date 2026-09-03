import { ScenarioIdSchema } from '@/contracts/scenario'
import { SCENARIO_CATALOG } from '@/mocks/scenarios/catalog'
import { handle, HttpError } from '@/server/http'
import { activeScenarioId, readState, resetStore, type WorkspaceState } from '@/server/store'

export const dynamic = 'force-dynamic'

function assertDevelopment() {
  if (process.env.NODE_ENV === 'production') {
    throw new HttpError(403, '该接口仅在开发环境可用')
  }
}

function responseFor(scenarioId: keyof typeof SCENARIO_CATALOG, state: WorkspaceState) {
  return {
    scenario: SCENARIO_CATALOG[scenarioId],
    state: {
      projects: state.projects.length,
      canvases: state.canvases.length,
      jobs: state.jobs.length,
      assets: state.assets.length,
    },
  }
}

export async function GET() {
  return handle(async () => {
    assertDevelopment()
    const scenarioId = await activeScenarioId()
    return responseFor(scenarioId, await readState())
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    assertDevelopment()
    const body = (await request.json().catch(() => null)) as unknown
    const scenarioId = ScenarioIdSchema.safeParse(
      body && typeof body === 'object' && 'scenarioId' in body ? (body as { scenarioId: unknown }).scenarioId : undefined,
    )
    if (!scenarioId.success) throw new HttpError(400, '未知的 mock scenario')

    return responseFor(scenarioId.data, await resetStore(scenarioId.data))
  })
}
