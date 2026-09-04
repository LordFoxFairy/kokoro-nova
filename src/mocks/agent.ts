import { findSkill } from '@/domain/skills'
import type { AgentContextChip, CanvasMutation } from '@/domain/types'

export const LOCAL_AGENT_ENGINE = 'local-deterministic-skill-runner/v1' as const

export type AgentWorkflowKind = 'text' | 'media'
export type AgentMediaOutcome = 'succeeded' | 'failed_with_text_fallback'

export interface PinnedSkillFixture {
  id: string
  name: string
  version: string
}

export interface AgentExecutionFixture {
  engine: typeof LOCAL_AGENT_ENGINE
  skill: PinnedSkillFixture | null
  workflowKind: AgentWorkflowKind
  mediaOutcome: AgentMediaOutcome
}

const TEXT_FIRST_SKILLS = new Set([
  'skill-storyboard-breakdown',
  'skill-ad-script-structure',
  'skill-hook-first-three-seconds',
])
const MEDIA_WORDS = ['视频', '短片', '片段', '动画', 'video', '图片', '画面', '海报', 'image', '配音', '音频', '音乐', 'audio']
const FAILURE_WORDS = ['[fixture:media-failure]', '媒体失败', '生成失败', '降级', 'fallback', '模型不可用']

/** Pin the exact catalogue version at planning time; later catalogue edits cannot change a run. */
export function selectedSkillFixture(context: AgentContextChip[]): PinnedSkillFixture | null {
  const chip = context.find((item) => item.kind === 'skill')
  if (!chip) return null
  const skill = findSkill(chip.refId)
  return skill ? { id: skill.id, name: skill.name, version: skill.version } : null
}

/**
 * No LLM is involved: the selected skill + local phrase markers decide one
 * reproducible execution class. A storyboard/ad skill stays text-first unless
 * the user explicitly requests media; other selected skills default to media.
 */
export function fixtureForAgentExecution(input: {
  text: string
  context: AgentContextChip[]
}): AgentExecutionFixture {
  const skill = selectedSkillFixture(input.context)
  const lower = input.text.toLowerCase()
  const explicitlyRequestsMedia = MEDIA_WORDS.some((word) => lower.includes(word))
  const workflowKind: AgentWorkflowKind = skill && TEXT_FIRST_SKILLS.has(skill.id) && !explicitlyRequestsMedia
    ? 'text'
    : 'media'
  const mediaOutcome: AgentMediaOutcome = FAILURE_WORDS.some((word) => lower.includes(word))
    ? 'failed_with_text_fallback'
    : 'succeeded'

  return { engine: LOCAL_AGENT_ENGINE, skill, workflowKind, mediaOutcome }
}

export function planningToolTrace(fixture: AgentExecutionFixture) {
  const subject = fixture.skill
    ? `已固定 Skill「${fixture.skill.name}」v${fixture.skill.version}`
    : '未选择 Skill，使用本地通用创作模板'
  return [
    { tool: 'skills.resolve', status: 'ok' as const, summary: subject },
    {
      tool: 'workflow.plan',
      status: 'ok' as const,
      summary: `确定性 ${fixture.workflowKind === 'media' ? '媒体' : '文本'}工作流计划已生成；执行器：${fixture.engine}`,
    },
  ]
}

export function executionToolTrace(input: {
  fixture: AgentExecutionFixture
  mutations: CanvasMutation[]
}) {
  const added = input.mutations.filter((mutation) => mutation.op === 'addNode').length
  const traces = [
    { tool: 'workflow.apply', status: 'ok' as const, summary: `已原子写入 ${added} 个工作流节点。` },
  ]
  if (input.fixture.workflowKind === 'text') {
    return {
      traces: [
        ...traces,
        { tool: 'text.render', status: 'running' as const, summary: '本地文本执行器运行中。' },
        { tool: 'text.render', status: 'ok' as const, summary: '文本草稿已写入工作流，等待后续人工或模型编辑。' },
      ],
      note: 'Skill 文本工作流已执行完成；本地 mock 只写入可编辑草稿，不调用真实 LLM。',
    }
  }
  if (input.fixture.mediaOutcome === 'failed_with_text_fallback') {
    return {
      traces: [
        ...traces,
        { tool: 'media.generate', status: 'running' as const, summary: '本地媒体执行器运行中。' },
        { tool: 'media.generate', status: 'error' as const, summary: 'fixture 指定媒体生成失败；未创建远程任务或消耗积分。' },
        { tool: 'workflow.fallback', status: 'ok' as const, summary: '已保留文本/分镜节点作为可继续编辑的降级工作流。' },
      ],
      note: '媒体执行未完成，已降级为可编辑的文本工作流。你可以调整提示词后再次确认运行。',
    }
  }
  return {
    traces: [
      ...traces,
      { tool: 'media.generate', status: 'running' as const, summary: '本地媒体执行器运行中。' },
      { tool: 'media.generate', status: 'ok' as const, summary: '媒体工作流已就绪；本地 fixture 未调用真实模型或外部服务。' },
    ],
    note: '媒体工作流已进入本地可演示完成态；节点仍可在画布中继续编辑或交给后端执行器接手。',
  }
}
