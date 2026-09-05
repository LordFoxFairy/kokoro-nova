import { z } from 'zod'

import type { ScenarioId } from '@/contracts/scenario'

export const TeamProjectionStateSchema = z.enum(['ready', 'empty', 'permission-denied'])
export const TeamRoleSchema = z.enum(['owner', 'admin', 'member'])
export const SharedAssetPermissionSchema = z.enum(['owner', 'edit', 'comment', 'view'])
export const SharedAssetKindSchema = z.enum(['image', 'video', 'audio'])

export const TeamMemberSchema = z.object({
  id: z.string().min(1).max(120),
  displayName: z.string().min(1).max(120),
  avatarInitial: z.string().min(1).max(2),
  role: TeamRoleSchema,
}).strict()

/**
 * Local invitations deliberately use an alias, rather than an email address
 * or an external principal. The future membership service owns resolution and
 * delivery; this fixture only captures the UI command boundary.
 */
export const TeamInviteSchema = z.object({
  id: z.string().min(1).max(120),
  inviteeAlias: z.string().min(1).max(80),
  role: z.enum(['admin', 'member']),
  state: z.literal('pending'),
  createdAt: z.string().datetime(),
}).strict()

export const TeamWorkspaceSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  role: TeamRoleSchema,
  seatCount: z.number().int().nonnegative(),
  seatLimit: z.number().int().positive(),
  sharedAssetCount: z.number().int().nonnegative(),
  members: z.array(TeamMemberSchema).min(1).max(50),
  pendingInvites: z.array(TeamInviteSchema).max(50),
}).strict()

export const TeamResponseSchema = z.object({
  state: TeamProjectionStateSchema,
  message: z.string().min(1).max(240),
  team: TeamWorkspaceSchema.nullable(),
}).superRefine((value, context) => {
  if (value.state === 'ready' && !value.team) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['team'], message: 'ready 团队必须包含 team' })
  }
  if (value.state !== 'ready' && value.team) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['team'], message: '非 ready 团队不能包含 team' })
  }
})

export const SharedAssetSchema = z.object({
  id: z.string().min(1).max(120),
  teamId: z.string().min(1).max(120),
  name: z.string().min(1).max(160),
  kind: SharedAssetKindSchema,
  thumbnailUrl: z.string().min(1).max(2_000),
  ownerDisplayName: z.string().min(1).max(120),
  permission: SharedAssetPermissionSchema,
  updatedAt: z.string().datetime(),
}).strict()

export const SharedAssetsResponseSchema = z.object({
  state: TeamProjectionStateSchema,
  message: z.string().min(1).max(240),
  assets: z.array(SharedAssetSchema).max(100),
}).superRefine((value, context) => {
  if (value.state !== 'ready' && value.assets.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['assets'], message: '非 ready 共享资产必须为空数组' })
  }
})

export const LocalIdempotencyKeySchema = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/, '幂等键只能包含字母、数字、_ 或 -')

export const CreateTeamInviteRequestSchema = z.object({
  inviteeAlias: z.string().trim().min(1).max(80),
  role: z.enum(['admin', 'member']),
  idempotencyKey: LocalIdempotencyKeySchema,
}).strict()

export const CreateTeamInviteResponseSchema = z.object({
  invite: TeamInviteSchema,
  team: TeamResponseSchema,
  message: z.string().min(1).max(240),
}).strict()

export const UpdateTeamMemberRequestSchema = z.object({
  role: z.enum(['admin', 'member']),
  idempotencyKey: LocalIdempotencyKeySchema,
}).strict()

export const TeamMemberUpdateResponseSchema = z.object({
  member: TeamMemberSchema.nullable(),
  team: TeamResponseSchema,
  message: z.string().min(1).max(240),
}).strict().superRefine((value, context) => {
  if (!value.member || value.team.state !== 'ready') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '成员更新必须返回 ready 团队和更新后的成员', path: ['member'] })
  }
})

export type TeamProjectionState = z.infer<typeof TeamProjectionStateSchema>
export type TeamResponse = z.infer<typeof TeamResponseSchema>
export type SharedAssetsResponse = z.infer<typeof SharedAssetsResponseSchema>
export type TeamRole = z.infer<typeof TeamRoleSchema>
export type TeamInvite = z.infer<typeof TeamInviteSchema>
export type CreateTeamInviteRequest = z.infer<typeof CreateTeamInviteRequestSchema>
export type CreateTeamInviteResponse = z.infer<typeof CreateTeamInviteResponseSchema>
export type UpdateTeamMemberRequest = z.infer<typeof UpdateTeamMemberRequestSchema>
export type TeamMemberUpdateResponse = z.infer<typeof TeamMemberUpdateResponseSchema>

type TeamFixtureBundle = {
  team: TeamResponse
  sharedAssets: SharedAssetsResponse
}

const populatedFixture: TeamFixtureBundle = {
  team: {
    state: 'ready',
    message: '已加载 Kokoro 创作组的本地团队视图。',
    team: {
      id: 'team_kokoro_creative',
      name: 'Kokoro 创作组',
      role: 'owner',
      seatCount: 3,
      seatLimit: 5,
      sharedAssetCount: 2,
      pendingInvites: [],
      members: [
        { id: 'member_local_cd385d', displayName: '微信用户cd385d', avatarInitial: '微', role: 'owner' },
        { id: 'member_liu', displayName: '刘同学', avatarInitial: '刘', role: 'admin' },
        { id: 'member_video', displayName: '视频策划', avatarInitial: '视', role: 'member' },
      ],
    },
  },
  sharedAssets: {
    state: 'ready',
    message: '展示 2 个本地共享资产；权限仅用于前端演示。',
    assets: [
      {
        id: 'shared_asset_city_board',
        teamId: 'team_kokoro_creative',
        name: '雨夜城市分镜参考',
        kind: 'image',
        thumbnailUrl: '/fixtures/libtv/assets/rain.webp',
        ownerDisplayName: '刘同学',
        permission: 'edit',
        updatedAt: '2026-09-04T12:00:00.000Z',
      },
      {
        id: 'shared_asset_voice_over',
        teamId: 'team_kokoro_creative',
        name: '旁白氛围音轨',
        kind: 'audio',
        thumbnailUrl: '/fixtures/libtv/assets/ambient.mp3',
        ownerDisplayName: '视频策划',
        permission: 'view',
        updatedAt: '2026-09-04T11:30:00.000Z',
      },
    ],
  },
}

const emptyFixture: TeamFixtureBundle = {
  team: { state: 'empty', message: '当前本地账户尚未加入团队。', team: null },
  sharedAssets: { state: 'empty', message: '加入团队后，这里会显示可访问的共享资产。', assets: [] },
}

const deniedFixture: TeamFixtureBundle = {
  team: { state: 'permission-denied', message: '登录后才可读取团队与共享资产。', team: null },
  sharedAssets: { state: 'permission-denied', message: '登录后才可读取团队共享资产。', assets: [] },
}

/**
 * One immutable, scenario-derived fixture authority for team and shared assets.
 * It intentionally models no remote membership, invites, tokens, or file URLs.
 */
export function teamFixtureForScenario(scenarioId: ScenarioId): TeamFixtureBundle {
  if (scenarioId === 'anonymous' || scenarioId === 'public-showcase' || scenarioId === 'account-switch-required') {
    return deniedFixture
  }
  return scenarioId === 'authenticated-empty' ? emptyFixture : populatedFixture
}
