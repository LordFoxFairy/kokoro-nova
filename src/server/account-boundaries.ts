import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import {
  AccessKeyResponseSchema,
  AccountExternalHandoffsResponseSchema,
  type AccessKeyCommandRequest,
  type AccessKeyProjection,
  type AccessKeyResponse,
  type AccountExternalHandoffsResponse,
} from '@/contracts/account-external'
import {
  CreateTeamInviteResponseSchema,
  TeamMemberUpdateResponseSchema,
  TeamResponseSchema,
  teamFixtureForScenario,
  type CreateTeamInviteRequest,
  type CreateTeamInviteResponse,
  type TeamInvite,
  type TeamResponse,
  type TeamRole,
  type TeamMemberUpdateResponse,
  type UpdateTeamMemberRequest,
} from '@/contracts/team'
import type { ScenarioId } from '@/contracts/scenario'
import { HttpError } from '@/server/http'
import { readLocalIdentity, requireLocalAuthentication } from '@/server/identity'
import { DATA_DIR, activeScenarioId, activeScenarioIdWhileLocked, withWorkspaceLock } from '@/server/store'

const BOUNDARY_FILE = path.join(DATA_DIR, 'account-boundaries.json')
const ACCESS_KEY_SCOPES = ['account:read', 'jobs:create', 'assets:read'] as const

type StoredBoundaryState = {
  scenarioId: ScenarioId
  accessKey: { state: AccessKeyProjection['state']; generation: number; createdAt: string | null; revokedAt: string | null }
  accessKeyRequests: Record<string, { fingerprint: string; response: AccessKeyResponse }>
  teamRoles: Record<string, TeamRole>
  invites: TeamInvite[]
  inviteRequests: Record<string, { fingerprint: string; response: CreateTeamInviteResponse }>
  memberRequests: Record<string, { fingerprint: string; response: TeamMemberUpdateResponse }>
}

function defaultState(scenarioId: ScenarioId): StoredBoundaryState {
  return {
    scenarioId,
    accessKey: { state: 'not-created', generation: 0, createdAt: null, revokedAt: null },
    accessKeyRequests: {},
    teamRoles: {},
    invites: [],
    inviteRequests: {},
    memberRequests: {},
  }
}

function createdAtFor(generation: number) {
  return `2026-09-04T${String(12 + Math.floor(generation / 60)).padStart(2, '0')}:${String(generation % 60).padStart(2, '0')}:00.000Z`
}

function revokedAtFor(generation: number) {
  return `2026-09-04T${String(13 + Math.floor(generation / 60)).padStart(2, '0')}:${String(generation % 60).padStart(2, '0')}:00.000Z`
}

function projection(accessKey: StoredBoundaryState['accessKey']): AccessKeyProjection {
  return {
    id: 'access_key_local',
    label: 'Access key',
    maskedValue: accessKey.state === 'not-created' ? '尚未创建' : `lvtk_••••••••${String(accessKey.generation).padStart(2, '0')}`,
    state: accessKey.state,
    generation: accessKey.generation,
    createdAt: accessKey.createdAt,
    revokedAt: accessKey.revokedAt,
    scopes: [...ACCESS_KEY_SCOPES],
  }
}

function parseStoredState(value: unknown, scenarioId: ScenarioId): StoredBoundaryState {
  if (!value || typeof value !== 'object') return defaultState(scenarioId)
  const record = value as Partial<StoredBoundaryState>
  if (record.scenarioId !== scenarioId) return defaultState(scenarioId)
  const key = record.accessKey
  const validKey = key && (key.state === 'not-created' || key.state === 'active' || key.state === 'revoked')
  return {
    scenarioId,
    accessKey: validKey && typeof key.generation === 'number'
      ? { state: key.state, generation: key.generation, createdAt: typeof key.createdAt === 'string' ? key.createdAt : null, revokedAt: typeof key.revokedAt === 'string' ? key.revokedAt : null }
      : defaultState(scenarioId).accessKey,
    accessKeyRequests: record.accessKeyRequests && typeof record.accessKeyRequests === 'object' ? record.accessKeyRequests : {},
    teamRoles: record.teamRoles && typeof record.teamRoles === 'object' ? record.teamRoles : {},
    invites: Array.isArray(record.invites) ? record.invites : [],
    inviteRequests: record.inviteRequests && typeof record.inviteRequests === 'object' ? record.inviteRequests : {},
    memberRequests: record.memberRequests && typeof record.memberRequests === 'object' ? record.memberRequests : {},
  }
}

async function load(alreadyLocked = false): Promise<StoredBoundaryState> {
  const scenarioId = alreadyLocked ? await activeScenarioIdWhileLocked() : await activeScenarioId()
  try {
    return parseStoredState(JSON.parse(await fs.readFile(BOUNDARY_FILE, 'utf8')) as unknown, scenarioId)
  } catch {
    return defaultState(scenarioId)
  }
}

async function persist(state: StoredBoundaryState) {
  await fs.mkdir(DATA_DIR, { recursive: true })
  const temporary = `${BOUNDARY_FILE}.${process.pid}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary, JSON.stringify(state, null, 2), 'utf8')
    await fs.rename(temporary, BOUNDARY_FILE)
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined)
  }
}

async function mutate<T>(operation: (state: StoredBoundaryState) => T | Promise<T>) {
  return withWorkspaceLock(async () => {
    const state = await load(true)
    const value = await operation(state)
    await persist(state)
    return value
  })
}

function ensureTeam(state: StoredBoundaryState, scenarioId: ScenarioId) {
  const fixture = teamFixtureForScenario(scenarioId).team
  if (fixture.state !== 'ready' || !fixture.team) throw new HttpError(409, '当前本地账户没有可管理的团队')
  return fixture.team
}

function teamProjection(state: StoredBoundaryState, scenarioId: ScenarioId): TeamResponse {
  const fixture = teamFixtureForScenario(scenarioId).team
  if (fixture.state !== 'ready' || !fixture.team) return TeamResponseSchema.parse(fixture)
  return TeamResponseSchema.parse({
    ...fixture,
    team: {
      ...fixture.team,
      members: fixture.team.members.map((member) => ({ ...member, role: state.teamRoles[member.id] ?? member.role })),
      pendingInvites: state.invites,
    },
  })
}

function fingerprint(input: unknown) {
  return JSON.stringify(input)
}

function replayOrReject<T>(requests: Record<string, { fingerprint: string; response: T }>, idempotencyKey: string, input: unknown): T | null {
  const previous = requests[idempotencyKey]
  if (!previous) return null
  if (previous.fingerprint !== fingerprint(input)) throw new HttpError(409, '同一幂等键不能用于不同命令')
  return previous.response
}

export async function resetLocalAccountBoundaryStore(scenarioId: ScenarioId) {
  await persist(defaultState(scenarioId))
}

export async function readLocalAccessKey(): Promise<AccessKeyResponse> {
  await requireLocalAuthentication()
  return withWorkspaceLock(async () => {
    const state = await load(true)
    return AccessKeyResponseSchema.parse({ key: projection(state.accessKey), message: 'Access Key 仅以脱敏本地生命周期展示。' })
  })
}

export async function commandLocalAccessKey(input: AccessKeyCommandRequest): Promise<AccessKeyResponse> {
  await requireLocalAuthentication()
  return mutate((state) => {
    const replay = replayOrReject(state.accessKeyRequests, input.idempotencyKey, { action: input.action })
    if (replay) return AccessKeyResponseSchema.parse(replay)

    const key = state.accessKey
    if (input.action === 'create' && key.state !== 'active') {
      key.state = 'active'; key.generation += 1; key.createdAt = createdAtFor(key.generation); key.revokedAt = null
    } else if (input.action === 'rotate') {
      if (key.state !== 'active') throw new HttpError(409, '仅 active Access Key 可以轮换')
      key.generation += 1; key.createdAt = createdAtFor(key.generation); key.revokedAt = null
    } else if (input.action === 'revoke') {
      if (key.state !== 'active') throw new HttpError(409, '仅 active Access Key 可以撤销')
      key.state = 'revoked'; key.revokedAt = revokedAtFor(key.generation)
    }
    const response = AccessKeyResponseSchema.parse({
      key: projection(key),
      message: input.action === 'create' ? '已创建脱敏 Access Key 生命周期记录。' : input.action === 'rotate' ? '已轮换脱敏 Access Key；旧 generation 已失效。' : '已撤销脱敏 Access Key；本地 fixture 不保留真实凭据。',
    })
    state.accessKeyRequests[input.idempotencyKey] = { fingerprint: fingerprint({ action: input.action }), response }
    return response
  })
}

export async function readLocalTeamProjection(): Promise<TeamResponse> {
  const [scenarioId, identity] = await Promise.all([activeScenarioId(), readLocalIdentity()])
  if (identity.session.status !== 'authenticated') return TeamResponseSchema.parse(teamFixtureForScenario('anonymous').team)
  return withWorkspaceLock(async () => teamProjection(await load(true), scenarioId))
}

export async function createLocalTeamInvite(input: CreateTeamInviteRequest): Promise<CreateTeamInviteResponse> {
  await requireLocalAuthentication()
  return mutate(async (state) => {
    const replay = replayOrReject(state.inviteRequests, input.idempotencyKey, { inviteeAlias: input.inviteeAlias, role: input.role })
    if (replay) return CreateTeamInviteResponseSchema.parse(replay)
    const base = ensureTeam(state, await activeScenarioIdWhileLocked())
    if (base.seatCount + state.invites.length >= base.seatLimit) throw new HttpError(409, '本地团队没有可用邀请席位')
    const invite: TeamInvite = {
      id: `invite_local_${String(state.invites.length + 1).padStart(4, '0')}`,
      inviteeAlias: input.inviteeAlias,
      role: input.role,
      state: 'pending',
      createdAt: `2026-09-04T14:${String(state.invites.length).padStart(2, '0')}:00.000Z`,
    }
    state.invites.push(invite)
    const response = CreateTeamInviteResponseSchema.parse({ invite, team: teamProjection(state, await activeScenarioIdWhileLocked()), message: '本地邀请已创建；未来后端负责邮箱/成员目录投递。' })
    state.inviteRequests[input.idempotencyKey] = { fingerprint: fingerprint({ inviteeAlias: input.inviteeAlias, role: input.role }), response }
    return response
  })
}

export async function updateLocalTeamMember(memberId: string, input: UpdateTeamMemberRequest): Promise<TeamMemberUpdateResponse> {
  await requireLocalAuthentication()
  return mutate(async (state) => {
    const replay = replayOrReject(state.memberRequests, input.idempotencyKey, { memberId, role: input.role })
    if (replay) return TeamMemberUpdateResponseSchema.parse(replay)
    const base = ensureTeam(state, await activeScenarioIdWhileLocked())
    const member = base.members.find((candidate) => candidate.id === memberId)
    if (!member) throw new HttpError(404, '本地团队成员不存在')
    if (member.role === 'owner') throw new HttpError(403, '所有者角色不可通过成员更新命令修改')
    state.teamRoles[memberId] = input.role
    const team = teamProjection(state, await activeScenarioIdWhileLocked())
    const updatedMember = team.team?.members.find((candidate) => candidate.id === memberId)
    const response = TeamMemberUpdateResponseSchema.parse({ member: updatedMember, team, message: `已将 ${member.displayName} 更新为${input.role === 'admin' ? '管理员' : '成员'}。` })
    state.memberRequests[input.idempotencyKey] = { fingerprint: fingerprint({ memberId, role: input.role }), response }
    return response
  })
}

export async function readLocalAccountHandoffs(): Promise<AccountExternalHandoffsResponse> {
  const identity = await readLocalIdentity()
  const authenticated = identity.session.status === 'authenticated'
  const blocked = {
    state: 'authentication-required' as const,
    message: '登录后才可继续该账户外部命令。',
    actionLabel: '登录后继续',
    action: null,
  }
  return AccountExternalHandoffsResponseSchema.parse({
    state: authenticated ? 'ready' : 'permission-denied',
    message: authenticated ? '以下命令为前端 handoff 状态，不会触发支付、开票或远端模型市场。' : '登录后可查看订阅、发票和模型市场 handoff。',
    subscription: authenticated ? { state: 'handoff-ready', owner: 'billing', title: '订阅计划', message: '账单服务接手开通、变更与取消订阅。', actionLabel: '前往订阅方案', action: 'open-subscription' } : { owner: 'billing', title: '订阅计划', ...blocked },
    invoices: authenticated ? { state: 'empty', owner: 'invoice', title: '购买记录与发票', message: '当前确定性 fixture 没有购买记录或可开具发票。', actionLabel: '查看购买记录', action: 'view-invoices' } : { owner: 'invoice', title: '购买记录与发票', ...blocked },
    modelMarket: authenticated ? { state: 'handoff-ready', owner: 'model-market', title: '模型市场', message: '模型目录服务负责可购买模型、地区可用性与授权展示。', actionLabel: '浏览模型市场', action: 'browse-model-market' } : { owner: 'model-market', title: '模型市场', ...blocked },
  })
}
