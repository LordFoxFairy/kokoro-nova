import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z, type ZodType } from 'zod'

import { AccessKeyResponseSchema, AccountExternalHandoffsResponseSchema } from '@/contracts/account-external'
import { AccountProfileResponseSchema } from '@/contracts/account'
import { AgentSessionDetailResponseSchema, CreateAgentSessionResponseSchema, ListAgentSessionsResponseSchema } from '@/contracts/agent'
import { AssetFolderListResponseSchema, AssetLifecycleListResponseSchema } from '@/contracts/assets'
import { ComposeTaskResponseSchema } from '@/contracts/compose'
import { CreationContextReadResponseSchema } from '@/contracts/creation-context'
import { HomeDiscoveryResponseSchema } from '@/contracts/home'
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { IdentityResponseSchema } from '@/contracts/identity'
import { GetJobResponseSchema, ListJobsResponseSchema } from '@/contracts/jobs'
import { LedgerViewProjectionSchema } from '@/contracts/ledger'
import { CanvasDetailLocalResponseSchema, ProjectDetailLocalResponseSchema, ProjectListLocalResponseSchema } from '@/contracts/local'
import { MaterialCatalogResponseSchema, GetMaterialResponseSchema } from '@/contracts/materials'
import { ModelCatalogResponseSchema } from '@/contracts/models'
import { NotificationsResponseSchema } from '@/contracts/notifications'
import { PreferencesResponseSchema } from '@/contracts/preferences'
import { GetPublishedSnapshotResponseSchema, ListPublishedSnapshotsResponseSchema } from '@/contracts/publish'
import { ListRecycleBinResponseSchema } from '@/contracts/recycle-bin'
import { LOCAL_API_ROUTES } from '@/contracts/route-manifest'
import { ScenarioResponseSchema } from '@/contracts/scenario'
import { ScriptV2RunResponseSchema } from '@/contracts/script-v2'
import {
  ShowcaseDetailResponseSchema,
  ShowcaseEngagementResponseSchema,
  ShowcaseListResponseSchema,
  ShowcasePlaybackManifestSchema,
} from '@/contracts/showcase'
import {
  AuthorSkillListResponseSchema,
  GetAuthoredSkillResponseSchema,
  GetSkillResponseSchema,
  SkillListResponseSchema,
} from '@/contracts/skills'
import { SharedAssetsResponseSchema, TeamResponseSchema } from '@/contracts/team'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { __resetComposeTasksForTests } from '@/server/compose'
import { resetPresence } from '@/server/presence'
import { __resetScriptV2Runs } from '@/server/script-v2'
import { readState, resetStore } from '@/server/store'

import { GET as getAccessKey } from '../access-key/route'
import { GET as getAccountHandoffs } from '../account/handoffs/route'
import { GET as getAccount } from '../account/route'
import { GET as getAgentSession } from '../agent/sessions/[sessionId]/route'
import { GET as getAgentSessions, POST as createAgentSession } from '../agent/sessions/route'
import { GET as getAssetFolders } from '../assets/folders/route'
import { GET as getAssets } from '../assets/route'
import { GET as getCanvas } from '../canvases/[canvasId]/route'
import { POST as createComposeTask } from '../compose/route'
import { GET as getComposeTask } from '../compose/[taskId]/route'
import { GET as getCreationContext } from '../creation-context/route'
import { GET as getScenario } from '../dev/scenario/route'
import { GET as getHome } from '../home/route'
import { GET as getIdentity } from '../identity/route'
import { GET as getJob } from '../jobs/[jobId]/route'
import { GET as getJobs } from '../jobs/route'
import { GET as getLedger } from '../ledger/route'
import { GET as getMaterial } from '../materials/[materialId]/route'
import { GET as getMaterials } from '../materials/route'
import { GET as getMedia } from '../media/[...path]/route'
import { GET as getModels } from '../models/route'
import { GET as getNotifications } from '../notifications/route'
import { GET as getPreferences } from '../preferences/route'
import { GET as getPresence } from '../presence/[canvasId]/route'
import { GET as getCharacterPreview } from '../preview/character/route'
import { GET as getStitchPreview } from '../preview/stitch/route'
import { GET as getProject } from '../projects/[projectId]/route'
import { GET as getProjects } from '../projects/route'
import { GET as getPublishedSnapshot } from '../publish/[snapshotId]/route'
import { GET as getPublishedSnapshots } from '../publish/route'
import { GET as getRecycleBin } from '../recycle-bin/route'
import { POST as createScriptRun } from '../script-v2/runs/route'
import { GET as getScriptRun } from '../script-v2/runs/[runId]/route'
import { GET as getSharedAssets } from '../shared-assets/route'
import { GET as getShowcaseEngagement } from '../showcase/[snapshotId]/engagement/route'
import { GET as getShowcasePlayback } from '../showcase/[snapshotId]/playback/route'
import { GET as getShowcaseDetail } from '../showcase/[snapshotId]/route'
import { GET as getShowcase } from '../showcase/route'
import { GET as getAuthoredSkill } from '../skills/author/[skillId]/route'
import { GET as getAuthoredSkills, POST as createAuthoredSkill } from '../skills/author/route'
import { GET as getSkill } from '../skills/[skillId]/route'
import { GET as getSkills } from '../skills/route'
import { GET as getTeam } from '../team/route'

type JsonCase = {
  operationId: string
  responseSchema: ZodType
  invoke: () => Promise<Response>
}

type ErrorCase = {
  operationId: string
  invoke: () => Promise<Response>
}

const params = <T extends Record<string, unknown>>(value: T) => ({ params: Promise.resolve(value) })
const request = (path: string) => new Request(`http://localhost${path}`)
const jsonRequest = (path: string, body: unknown) => new Request(`http://localhost${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

async function stateFixture() {
  const state = await readState()
  const project = state.projects[0]
  const canvas = state.canvases[0]
  const job = state.jobs[0]
  if (!project || !canvas || !job) throw new Error('authenticated-populated fixture must seed project, canvas, and job')
  return { project, canvas, job }
}

async function createSmokeAgentSession() {
  const response = await createAgentSession(jsonRequest('/api/agent/sessions', {}))
  expect(response.status).toBe(200)
  return CreateAgentSessionResponseSchema.parse(await response.json())
}

async function createSmokeComposeTask() {
  const response = await createComposeTask(jsonRequest('/api/compose', {
    clips: [{
      url: '/api/media/fixtures/city-night.mp4',
      inPoint: 0,
      outPoint: 1,
      speed: 1,
      muted: false,
      transitionAfter: null,
      transitionDurationSeconds: null,
    }],
    audioTracks: [],
    subtitles: [],
  }))
  expect(response.status).toBe(200)
  return ComposeTaskResponseSchema.parse(await response.json()).task
}

async function createSmokeScriptRun() {
  const response = await createScriptRun(jsonRequest('/api/script-v2/runs', {
    idempotencyKey: 'manifest-smoke-run',
    canvasId: 'can_video_main',
    nodeId: 'node_script_v2',
    operation: 'generate-full',
    input: {
      storyText: '港口晨雾里，信使把最后一封信交给船长。',
      entry: 'screenplay',
      modelId: 'gvlm-3.1',
    },
  }))
  expect(response.status).toBe(200)
  return ScriptV2RunResponseSchema.parse(await response.json()).run
}

async function firstCataloguedSkillId() {
  const response = await getSkills(request('/api/skills'))
  expect(response.status).toBe(200)
  const skill = SkillListResponseSchema.parse(await response.json()).skills[0]
  if (!skill) throw new Error('skill catalogue fixture must contain a skill')
  return skill.id
}

async function createSmokeAuthoredSkill() {
  const response = await createAuthoredSkill(jsonRequest('/api/skills/author', { name: 'Manifest smoke Skill' }))
  expect(response.status).toBe(200)
  return GetAuthoredSkillResponseSchema.parse(await response.json()).skill
}

const jsonCases: JsonCase[] = [
  { operationId: 'getHomeCreationContext', responseSchema: CreationContextReadResponseSchema, invoke: () => getCreationContext() },
  { operationId: 'getAgentSession', responseSchema: AgentSessionDetailResponseSchema, invoke: async () => {
    const session = await createSmokeAgentSession()
    return getAgentSession(request(`/api/agent/sessions/${session.id}`), params({ sessionId: session.id }))
  } },
  { operationId: 'listAgentSessions', responseSchema: ListAgentSessionsResponseSchema, invoke: () => getAgentSessions(request('/api/agent/sessions')) },
  { operationId: 'listAssetFolders', responseSchema: AssetFolderListResponseSchema, invoke: () => getAssetFolders() },
  { operationId: 'listAssets', responseSchema: AssetLifecycleListResponseSchema, invoke: () => getAssets(request('/api/assets')) },
  { operationId: 'getCanvas', responseSchema: CanvasDetailLocalResponseSchema, invoke: async () => {
    const { canvas } = await stateFixture()
    return getCanvas(request(`/api/canvases/${canvas.id}`), params({ canvasId: canvas.id }))
  } },
  { operationId: 'getComposeTask', responseSchema: ComposeTaskResponseSchema, invoke: async () => {
    const task = await createSmokeComposeTask()
    return getComposeTask(request(`/api/compose/${task.id}`), params({ taskId: task.id }))
  } },
  { operationId: 'getActiveScenario', responseSchema: ScenarioResponseSchema, invoke: () => getScenario() },
  { operationId: 'getHomeDiscovery', responseSchema: HomeDiscoveryResponseSchema, invoke: () => getHome() },
  { operationId: 'getGenerationJob', responseSchema: GetJobResponseSchema, invoke: async () => {
    const { job } = await stateFixture()
    return getJob(request(`/api/jobs/${job.id}`), params({ jobId: job.id }))
  } },
  { operationId: 'listGenerationJobs', responseSchema: ListJobsResponseSchema, invoke: () => getJobs(request('/api/jobs')) },
  { operationId: 'getAccountProfile', responseSchema: AccountProfileResponseSchema, invoke: () => getAccount() },
  { operationId: 'getAccountExternalHandoffs', responseSchema: AccountExternalHandoffsResponseSchema, invoke: () => getAccountHandoffs() },
  { operationId: 'getLocalAccessKey', responseSchema: AccessKeyResponseSchema, invoke: () => getAccessKey() },
  { operationId: 'getLocalTeam', responseSchema: TeamResponseSchema, invoke: () => getTeam() },
  { operationId: 'getLocalSharedAssets', responseSchema: SharedAssetsResponseSchema, invoke: () => getSharedAssets() },
  { operationId: 'getLocalIdentity', responseSchema: IdentityResponseSchema, invoke: () => getIdentity(request('/api/identity')) },
  { operationId: 'getLocalPreferences', responseSchema: PreferencesResponseSchema, invoke: () => getPreferences() },
  { operationId: 'getNotificationSummary', responseSchema: NotificationsResponseSchema, invoke: () => getNotifications() },
  { operationId: 'listLedgerEntries', responseSchema: LedgerViewProjectionSchema, invoke: () => getLedger(request('/api/ledger')) },
  { operationId: 'listModels', responseSchema: ModelCatalogResponseSchema, invoke: () => getModels(request('/api/models')) },
  { operationId: 'listMaterials', responseSchema: MaterialCatalogResponseSchema, invoke: () => getMaterials(request('/api/materials')) },
  { operationId: 'getMaterial', responseSchema: GetMaterialResponseSchema, invoke: () => getMaterial(request('/api/materials/style-noir'), params({ materialId: 'style-noir' })) },
  { operationId: 'getScriptV2Run', responseSchema: ScriptV2RunResponseSchema, invoke: async () => {
    const run = await createSmokeScriptRun()
    return getScriptRun(request(`/api/script-v2/runs/${run.id}`), params({ runId: run.id }))
  } },
  { operationId: 'getProject', responseSchema: ProjectDetailLocalResponseSchema, invoke: async () => {
    const { project } = await stateFixture()
    return getProject(request(`/api/projects/${project.id}`), params({ projectId: project.id }))
  } },
  { operationId: 'listProjects', responseSchema: ProjectListLocalResponseSchema, invoke: () => getProjects() },
  { operationId: 'listRecycleBin', responseSchema: ListRecycleBinResponseSchema, invoke: () => getRecycleBin() },
  { operationId: 'getPublishedSnapshot', responseSchema: GetPublishedSnapshotResponseSchema, invoke: () => getPublishedSnapshot(request('/api/publish/showcase-dust-skeleton'), params({ snapshotId: 'showcase-dust-skeleton' })) },
  { operationId: 'listPublishedSnapshots', responseSchema: ListPublishedSnapshotsResponseSchema, invoke: () => getPublishedSnapshots() },
  { operationId: 'getShowcaseDetail', responseSchema: ShowcaseDetailResponseSchema, invoke: () => getShowcaseDetail(request('/api/showcase/pub_city_night_01'), params({ snapshotId: 'pub_city_night_01' })) },
  { operationId: 'getShowcasePlaybackManifest', responseSchema: ShowcasePlaybackManifestSchema, invoke: () => getShowcasePlayback(request('/api/showcase/pub_city_night_01/playback'), params({ snapshotId: 'pub_city_night_01' })) },
  { operationId: 'getShowcaseEngagement', responseSchema: ShowcaseEngagementResponseSchema, invoke: () => getShowcaseEngagement(request('/api/showcase/pub_city_night_01/engagement'), params({ snapshotId: 'pub_city_night_01' })) },
  { operationId: 'listShowcaseEntries', responseSchema: ShowcaseListResponseSchema, invoke: () => getShowcase(request('/api/showcase')) },
  { operationId: 'getSkill', responseSchema: GetSkillResponseSchema, invoke: async () => {
    const skillId = await firstCataloguedSkillId()
    return getSkill(request(`/api/skills/${skillId}`), params({ skillId }))
  } },
  { operationId: 'getAuthoredSkill', responseSchema: GetAuthoredSkillResponseSchema, invoke: async () => {
    const skill = await createSmokeAuthoredSkill()
    return getAuthoredSkill(request(`/api/skills/author/${skill.id}`), params({ skillId: skill.id }))
  } },
  { operationId: 'listAuthoredSkills', responseSchema: AuthorSkillListResponseSchema, invoke: () => getAuthoredSkills() },
  { operationId: 'listSkills', responseSchema: SkillListResponseSchema, invoke: () => getSkills(request('/api/skills')) },
]

const errorCases: ErrorCase[] = [
  { operationId: 'getAgentSession', invoke: () => getAgentSession(request('/api/agent/sessions/missing'), params({ sessionId: 'missing' })) },
  { operationId: 'getCanvas', invoke: () => getCanvas(request('/api/canvases/missing'), params({ canvasId: 'missing' })) },
  { operationId: 'getComposeTask', invoke: () => getComposeTask(request('/api/compose/missing'), params({ taskId: 'missing' })) },
  { operationId: 'getGenerationJob', invoke: () => getJob(request('/api/jobs/missing'), params({ jobId: 'missing' })) },
  { operationId: 'listLedgerEntries', invoke: () => getLedger(request('/api/ledger?limit=zero')) },
  { operationId: 'listModels', invoke: () => getModels(request('/api/models?media=unknown')) },
  { operationId: 'listMaterials', invoke: () => getMaterials(request('/api/materials?kind=unknown')) },
  { operationId: 'getMaterial', invoke: () => getMaterial(request('/api/materials/missing'), params({ materialId: 'missing' })) },
  { operationId: 'getScriptV2Run', invoke: () => getScriptRun(request('/api/script-v2/runs/missing'), params({ runId: 'missing' })) },
  { operationId: 'getProject', invoke: () => getProject(request('/api/projects/missing'), params({ projectId: 'missing' })) },
  { operationId: 'getPublishedSnapshot', invoke: () => getPublishedSnapshot(request('/api/publish/missing'), params({ snapshotId: 'missing' })) },
  { operationId: 'getShowcaseDetail', invoke: () => getShowcaseDetail(request('/api/showcase/missing'), params({ snapshotId: 'missing' })) },
  { operationId: 'getShowcasePlaybackManifest', invoke: () => getShowcasePlayback(request('/api/showcase/missing/playback'), params({ snapshotId: 'missing' })) },
  { operationId: 'getShowcaseEngagement', invoke: () => getShowcaseEngagement(request('/api/showcase/missing/engagement'), params({ snapshotId: 'missing' })) },
  { operationId: 'getLocalIdentity', invoke: () => getIdentity(request('/api/identity?returnTo=https://invalid.test')) },
  { operationId: 'getSkill', invoke: () => getSkill(request('/api/skills/missing'), params({ skillId: 'missing' })) },
  { operationId: 'getAuthoredSkill', invoke: () => getAuthoredSkill(request('/api/skills/author/missing'), params({ skillId: 'missing' })) },
  { operationId: 'listSkills', invoke: () => getSkills(request('/api/skills?composer=unknown')) },
]

const specialCases = [
  {
    operationId: 'readLocalMedia',
    contentType: 'video/mp4',
    reason: 'binary media bytes are not a JSON response',
    invoke: () => getMedia(request('/api/media/fixtures/city-night.mp4'), params({ path: ['fixtures', 'city-night.mp4'] })),
  },
  {
    operationId: 'getCanvasPresence',
    contentType: 'text/event-stream; charset=utf-8',
    reason: 'SSE frames have their own event schema and do not have a JSON response body',
    invoke: () => getPresence(
      request('/api/presence/cvs_manifest_smoke?participantId=smoke&name=Smoke&color=%234c7ef3&x=0&y=0&zoom=1'),
      params({ canvasId: 'cvs_manifest_smoke' }),
    ),
  },
  {
    operationId: 'previewCharacterReference',
    contentType: 'image/svg+xml',
    reason: 'deterministic SVG is an explicitly exempt image transport, not JSON',
    invoke: () => getCharacterPreview(request('/api/preview/character')),
  },
  {
    operationId: 'previewStoryboardStitch',
    contentType: 'image/svg+xml',
    reason: 'deterministic SVG is an explicitly exempt image transport, not JSON',
    invoke: () => getStitchPreview(request('/api/preview/stitch')),
  },
] as const

async function assertSpecialBody(operationId: string, response: Response) {
  if (operationId === 'getCanvasPresence') {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('SSE response did not expose a body')
    try {
      const decoder = new TextDecoder()
      let opening = ''
      for (let index = 0; index < 4 && !opening.includes('event: snapshot'); index += 1) {
        const { done, value } = await reader.read()
        opening += decoder.decode(value, { stream: !done })
        if (done) break
      }
      expect(opening).toContain('event: snapshot')
      const data = opening.split('\n').find((line) => line.startsWith('data: '))?.slice('data: '.length)
      expect(z.object({ type: z.literal('snapshot'), participants: z.array(z.unknown()) }).strict().parse(JSON.parse(data ?? ''))).toBeTruthy()
    } finally {
      await reader.cancel()
      reader.releaseLock()
    }
    return
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  expect(bytes.byteLength).toBeGreaterThan(0)
  if (operationId.startsWith('preview')) expect(new TextDecoder().decode(bytes)).toContain('<svg')
}

describe.sequential('route-manifest runtime smoke matrix', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
    await __resetComposeTasksForTests()
    __resetScriptV2Runs()
    resetPresence()
  })

  afterEach(() => {
    resetPresence()
  })

  afterAll(async () => {
    await __resetComposeTasksForTests()
    __resetScriptV2Runs()
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('covers every manifest GET operation exactly once', () => {
    const manifestGetOperationIds = LOCAL_API_ROUTES.filter((route) => route.method === 'GET').map((route) => route.operationId).sort()
    const matrixOperationIds = [...jsonCases, ...specialCases].map((testCase) => testCase.operationId).sort()
    expect(matrixOperationIds).toEqual(manifestGetOperationIds)
  })

  it.each(jsonCases)('$operationId returns JSON accepted by its success response schema', async ({ invoke, responseSchema }) => {
    const response = await invoke()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    responseSchema.parse(await response.json())
  })

  it.each(errorCases)('$operationId controlled failures use the standard JSON error envelope', async ({ invoke }) => {
    const response = await invoke()
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.headers.get('content-type')).toContain('application/json')
    const error = LocalErrorEnvelopeSchema.parse(await response.json())
    expect(error.requestId).toMatch(/^req_local_/)
  })

  it('tracks every controllable JSON error fixture against a manifest GET operation', () => {
    const jsonOperationIds = new Set(jsonCases.map((testCase) => testCase.operationId))
    expect(errorCases.map((testCase) => testCase.operationId).every((operationId) => jsonOperationIds.has(operationId))).toBe(true)
  })

  it.each(specialCases)('$operationId is explicitly exempt from JSON and has its declared content type', async ({ operationId, contentType, invoke, reason }) => {
    expect(reason).toBeTruthy()
    const response = await invoke()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(contentType)
    await assertSpecialBody(operationId, response)
  })
})
