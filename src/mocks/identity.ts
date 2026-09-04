import type { LocalIdentity } from '@/contracts/identity'
import type { LocalPreferences } from '@/contracts/preferences'
import type { NotificationItem } from '@/contracts/notifications'

/**
 * Stable, deliberately redacted account fixture. It is never derived from a
 * browser cookie, real Access Key, or the observed LibTV session.
 */
export const LOCAL_IDENTITY_FIXTURE: LocalIdentity = {
  id: 'local_identity_cd385d',
  displayName: '微信用户cd385d',
  avatarInitial: '微',
  maskedAccount: '微信 · cd••••5d',
  uuidMasked: 'cd385d••••••9a21',
  accessKey: {
    label: 'Access key',
    maskedValue: '•••• •••• •••• ••••',
    state: 'not-created',
  },
  team: { label: '创建团队', seatCount: 0 },
  membership: {
    label: '免费用户',
    benefit: 'Seedance 2.5 限时活动权益',
  },
  credits: {
    balance: 20,
    distributions: [
      { label: '通用积分', value: 10 },
      { label: '会员积分', value: 5 },
      { label: '活动积分', value: 3 },
      { label: '赠送积分', value: 2 },
    ],
  },
  storage: { usedGb: 0.25, totalGb: 3 },
}

export const DEFAULT_LOCAL_PREFERENCES: LocalPreferences = {
  theme: 'dark',
  aiWatermark: true,
}

export const LOCAL_NOTIFICATION_FIXTURE: readonly NotificationItem[] = [
  {
    id: 'local-notice-render',
    title: '视频任务已完成',
    body: '你的本地演示视频已写回画布，可在故事板继续剪辑。',
    createdAt: '2026-09-04T12:00:00.000Z',
    unread: true,
  },
  {
    id: 'local-notice-skill',
    title: 'CLI & Skill 已就绪',
    body: 'Access Key 仅展示脱敏入口；未来后端接入时再签发真实凭据。',
    createdAt: '2026-09-04T11:00:00.000Z',
    unread: true,
  },
] as const
