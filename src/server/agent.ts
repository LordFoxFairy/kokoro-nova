import { ids } from '@/domain/ids'
import { createEdge, createNode } from '@/domain/factory'
import { DEFAULT_MODEL } from '@/domain/models'
import type {
  AgentContextChip,
  AgentMessage,
  AgentPayload,
  AgentSession,
  CanvasMutation,
  WorkflowDocument,
  WorkflowNode,
} from '@/domain/types'
import { executionToolTrace, fixtureForAgentExecution, planningToolTrace } from '@/mocks/agent'
import { findCanvas, type WorkspaceState } from './store'

/**
 * Local agent engine.
 *
 * The point of this module is the *protocol*, not the intelligence: an agent
 * turn either asks a clarifying question, proposes a set of canvas mutations
 * behind a confirm gate, or reports a quota gate. Swapping in a real LLM means
 * replacing `planTurn` — the session, seq cursor, context chips, confirm gate
 * and mutation application all stay as they are.
 *
 * Rules encoded here that come from the observed product:
 *  - the agent never writes the workflow directly; it proposes mutations that
 *    the Canvas mutation endpoint applies;
 *  - in 手动 mode a generation is only ever *proposed*;
 *  - 自动 mode can apply only a bounded, additive local proposal; all other
 *    proposals remain behind the same explicit confirmation gate;
 *  - free turns are metered and exhausting them yields a membership gate.
 */

export function appendMessage(
  state: WorkspaceState,
  session: AgentSession,
  message: Omit<AgentMessage, 'id' | 'sessionId' | 'seq' | 'createdAt'>,
): AgentMessage {
  session.seq += 1
  const full: AgentMessage = {
    ...message,
    id: ids.message(),
    sessionId: session.id,
    seq: session.seq,
    createdAt: new Date().toISOString(),
  }
  state.messages.push(full)
  session.updatedAt = full.createdAt
  return full
}

/** Sessions get their title from the first user message, as observed. */
export function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return '新会话'
  return clean.length <= 18 ? clean : `${clean.slice(0, 18)}…`
}

interface TurnInput {
  state: WorkspaceState
  session: AgentSession
  text: string
  context: AgentContextChip[]
}

export interface AgentToolTrace {
  tool: string
  summary: string
  status: 'running' | 'ok' | 'error'
}

/**
 * Auto mode is deliberately narrower than the general canvas mutation API.
 * It may append a small local graph, but never remove, rewrite, regroup or
 * reposition existing workflow state. The limit also keeps the fixture's
 * one-turn application bounded and reviewable.
 */
export const MAX_AUTO_MUTATIONS = 32

export function canAutoApplyProposal(mutations: CanvasMutation[]): boolean {
  return mutations.length > 0
    && mutations.length <= MAX_AUTO_MUTATIONS
    && mutations.every((mutation) => mutation.op === 'addNode' || mutation.op === 'addEdge')
}

export function autoApplyToolTrace(mutations: CanvasMutation[]): AgentToolTrace {
  const nodes = mutations.filter((mutation) => mutation.op === 'addNode').length
  const edges = mutations.filter((mutation) => mutation.op === 'addEdge').length
  return {
    tool: 'workflow.auto_apply',
    status: 'ok',
    summary: `自动模式通过本地安全规则，已应用 ${nodes} 个节点和 ${edges} 条连线。`,
  }
}

export interface TurnResult {
  reply: string
  payload?: AgentPayload
  /** Trace rows are persisted as tool messages before the assistant proposal. */
  toolCalls?: AgentToolTrace[]
}

const VIDEO_WORDS = ['视频', '短片', '片段', '影片', '动画', 'video']
const IMAGE_WORDS = ['图', '画面', '海报', '插画', 'image']
const AUDIO_WORDS = ['配音', '旁白', '音频', '语音', 'music', '音乐', '声音']
const SCRIPT_WORDS = ['脚本', '分镜', '剧本', '镜头表']

function mentions(text: string, words: string[]): boolean {
  const lower = text.toLowerCase()
  return words.some((w) => lower.includes(w.toLowerCase()))
}

/**
 * Decide the next turn.
 *
 * The first turn on a vague brief asks exactly one clarifying question and
 * creates nothing — this mirrors the documented `ask_human` behaviour where the
 * agent refuses to build until it has a subject.
 */
export function planTurn({ state, session, text, context }: TurnInput): TurnResult {
  const canvas = session.canvasId ? findCanvas(state, session.canvasId) : undefined
  const doc = canvas?.document

  if (session.settings.freeTurns <= 0) {
    return {
      reply: '本次会话的免费轮次已用完。开通会员后可继续使用 Agent 执行工具与生成媒体。',
      payload: { kind: 'quota_gate', reason: '免费轮次已用完' },
    }
  }

  const priorUserTurns = state.messages.filter((m) => m.sessionId === session.id && m.role === 'user').length
  const brief = text.trim()

  // A short opening brief with no attached context is under-specified.
  if (priorUserTurns <= 1 && brief.length < 24 && context.length === 0) {
    return {
      reply:
        '我需要先明确创作目标，才能决定建哪些节点。在你回答之前我不会创建或修改任何节点，也不会运行模型或消耗积分。',
      payload: {
        kind: 'ask_human',
        question: '你想制作一条什么主题的视频？请简单描述核心内容、想传达的信息，或你脑海中已有的画面。',
        placeholder: '例如：一条介绍产品的宣传片、一个旅行 Vlog、一段品牌故事……',
        answered: false,
      },
    }
  }

  if (!doc) {
    return { reply: '当前会话没有绑定画布，请先在项目中打开一个画布再让我操作节点。' }
  }

  const execution = fixtureForAgentExecution({ text: brief, context })
  const plan = buildPlan(doc, brief, context, execution.workflowKind)
  if (plan.mutations.length === 0) {
    return {
      reply: '我没有找到需要改动的地方。你可以告诉我想新增哪类节点，或选中画布上的节点再发给我。',
    }
  }

  const skillPrefix = execution.skill
    ? `已固定使用 Skill「${execution.skill.name}」v${execution.skill.version}。`
    : ''
  const summary = `${skillPrefix}${plan.summary}`
  return {
    reply: summary,
    toolCalls: planningToolTrace(execution),
    payload: {
      kind: 'mutation_proposal',
      summary,
      status: 'pending',
      mutations: plan.mutations,
    },
  }
}

interface Plan {
  summary: string
  mutations: CanvasMutation[]
}

/**
 * Translate a brief into a concrete node graph.
 *
 * The chain is always text → image → video (+ audio when narration is
 * mentioned), because that is the dependency order the storyboard columns
 * expect. Selected nodes in `context` are reused as the chain's head instead of
 * creating a duplicate.
 */
export function buildPlan(
  doc: WorkflowDocument,
  brief: string,
  context: AgentContextChip[],
  workflowKind: 'text' | 'media' = 'media',
): Plan {
  const mutations: CanvasMutation[] = []
  const pool: WorkflowNode[] = [...doc.nodes]

  const wantsVideo = workflowKind === 'media' && mentions(brief, VIDEO_WORDS)
  const wantsImage = workflowKind === 'media' && mentions(brief, IMAGE_WORDS)
  const wantsAudio = workflowKind === 'media' && mentions(brief, AUDIO_WORDS)
  const wantsScript = workflowKind === 'text' || mentions(brief, SCRIPT_WORDS)

  // Lay the new chain out to the right of everything that already exists.
  const rightEdge = doc.nodes.reduce((max, n) => Math.max(max, n.position.x + n.size.width), 0)
  const originX = doc.nodes.length ? rightEdge + 160 : 120
  const originY = 120

  const referencedNodes = context
    .filter((c) => c.kind === 'node')
    .map((c) => doc.nodes.find((n) => n.id === c.refId))
    .filter((n): n is WorkflowNode => Boolean(n))

  const created: WorkflowNode[] = []
  const add = (node: WorkflowNode) => {
    mutations.push({ op: 'addNode', node })
    pool.push(node)
    created.push(node)
    return node
  }
  const connect = (from: string, to: string) => {
    mutations.push({ op: 'addEdge', edge: createEdge(from, to) })
  }

  // Head of the chain: an existing selected text node, or a new one.
  let head = referencedNodes.find((n) => n.type === 'text') ?? null
  let column = 0

  if (!head) {
    const textNode = createNode('text', { x: originX, y: originY }, pool)
    textNode.data.prompt = brief
    add(textNode)
    head = textNode
    column += 1
  }

  if (wantsScript) {
    const scriptNode = createNode('script', { x: originX + column * 520, y: originY }, pool)
    scriptNode.data.modelId = DEFAULT_MODEL.text
    add(scriptNode)
    connect(head.id, scriptNode.id)
    head = scriptNode
    column += 1
  }

  let imageNode: WorkflowNode | null = referencedNodes.find((n) => n.type === 'image') ?? null
  if (wantsImage || wantsVideo || (workflowKind === 'media' && !wantsAudio && !wantsScript)) {
    if (!imageNode) {
      const node = createNode('image', { x: originX + column * 520, y: originY }, pool)
      node.data.prompt = ''
      add(node)
      imageNode = node
      column += 1
    }
    connect(head.id, imageNode.id)
  }

  if (wantsVideo) {
    const videoNode = createNode('video', { x: originX + column * 520, y: originY }, pool)
    add(videoNode)
    if (imageNode) connect(imageNode.id, videoNode.id)
    else connect(head.id, videoNode.id)
    column += 1
  }

  if (wantsAudio) {
    const audioNode = createNode('audio', { x: originX, y: originY + 420 }, pool)
    add(audioNode)
    connect(head.id, audioNode.id)
  }

  const names = created.map((n) => n.name).join('、')
  const edgeCount = mutations.filter((m) => m.op === 'addEdge').length
  const summary = created.length
    ? `我计划创建 ${created.length} 个节点（${names}）并建立 ${edgeCount} 条依赖连线。确认后我只写入画布结构，不会自动提交生成。`
    : `我计划建立 ${edgeCount} 条依赖连线。`

  return { summary, mutations }
}

/**
 * Convert an approved proposal into local tool trace rows.  The trigger stays
 * explicit: `[fixture:media-failure]` (or the documented Chinese markers)
 * leaves the text nodes in place and records a visible fallback instead of
 * invoking any external model.
 */
export function executionTraceForProposal(input: {
  text: string
  context: AgentContextChip[]
  mutations: CanvasMutation[]
}) {
  return executionToolTrace({
    fixture: fixtureForAgentExecution({ text: input.text, context: input.context }),
    mutations: input.mutations,
  })
}
