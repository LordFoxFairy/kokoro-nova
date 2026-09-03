import type { ScenarioId, ScenarioMeta } from '@/contracts/scenario'
import { FIXED_NOW } from '@/mocks/clock'

function meta(
  id: ScenarioId,
  label: string,
  description: string,
  viewer: ScenarioMeta['viewer'] = 'authenticated',
  editorSession: ScenarioMeta['editorSession'] = 'active',
): ScenarioMeta {
  return { id, label, description, viewer, editorSession, seedVersion: 1, fixedNow: FIXED_NOW }
}

export const SCENARIO_CATALOG: Record<ScenarioId, ScenarioMeta> = {
  anonymous: meta('anonymous', '未登录公开态', '公开首页与登录门，不包含私有项目。', 'anonymous', 'none'),
  'authenticated-empty': meta('authenticated-empty', '登录空账户', '已登录但没有项目、资产或任务。', 'authenticated', 'none'),
  'authenticated-populated': meta('authenticated-populated', '登录完整账户', '包含完整视频项目、历史产物和 Agent 会话。'),
  'account-switch-required': meta(
    'account-switch-required',
    '账户选择门',
    '已识别登录身份，但进入工作区前需要选择账户。',
    'account-selection',
    'none',
  ),
  'session-expired': meta('session-expired', '编辑会话过期', '项目数据存在，但当前画布编辑租约已经过期。', 'authenticated', 'expired'),
  'video-awaiting-confirmation': meta('video-awaiting-confirmation', '视频等待确认', '视频报价已生成，尚未确认扣费。'),
  'video-queued': meta('video-queued', '视频排队中', '视频任务已确认并进入等待队列。'),
  'video-running': meta('video-running', '视频生成中', '视频任务进度固定在 58%，用于刷新恢复。'),
  'video-succeeded': meta('video-succeeded', '视频生成完成', '视频任务完成并写回本地产物。'),
  'video-failed': meta('video-failed', '视频生成失败', '视频任务以可重试的提供方错误结束。'),
  'video-cancelled': meta('video-cancelled', '视频已取消', '视频任务在运行期间取消并返还预留积分。'),
  'video-compliance-blocked': meta(
    'video-compliance-blocked',
    '合规阻断',
    '视频任务被素材合规检查阻断并返还预留积分。',
  ),
  'revision-conflict': meta('revision-conflict', '画布版本冲突', '服务端 revision 领先客户端一版，用于 409 重放。'),
  'public-showcase': meta('public-showcase', '公开作品', '包含可浏览的冻结工作流快照。', 'anonymous', 'none'),
}
