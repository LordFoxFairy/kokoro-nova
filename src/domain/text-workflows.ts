import { audioExecutionOutput, defaultAudioAuthoringState } from './audio-authoring'
import { createEdge, createGroup, createNode } from './factory'
import {
  readTextAuthoringState,
  type TextAuthoringState,
  type TextStarterIntent,
} from './text-authoring'
import type { CanvasMutation, WorkflowDocument, WorkflowNode } from './types'

export const TEXT_STARTER_PROMPTS = {
  text2video:
    '电影级人物镜头 雨夜街头，霓虹灯反射在湿漉漉的地面，女主撑伞站在路灯下，表情克制而坚定，镜头环绕人物360度缓慢移动，浅景深，光影对比强烈，电影级调色，真实皮肤质感',
  caption: '根据图片生成结构化中文提示词，包括主体描述、环境、光影、镜头语言、风格关键词。',
  text2music:
    '生成一首现代品牌电子音乐（约 110 BPM），干净有力的低频贝斯，清晰电子鼓点，整体风格高级、未来感强。开场节奏型贝斯与简洁合成器音色建立律动。主段加入稳定鼓点，节奏清晰，保持克制的张力。强化段加入更丰富的音层，合成器音色提升，律动增强但不过度拥挤。结尾鼓点减弱，仅保留低频与氛围音渐出，干净利落收尾。',
} as const

export interface TextStarterMutationResult {
  mutations: CanvasMutation[]
  createdNodeIds: string[]
  groupId: string | null
}

function stateForIntent(node: WorkflowNode, intent: TextStarterIntent): TextAuthoringState {
  const previous = readTextAuthoringState(node.data.extra)
  return {
    ...previous,
    mode: intent === 'free' ? 'document' : 'generator',
    intent,
    expanded: false,
  }
}

function updateTextNode(
  node: WorkflowNode,
  intent: TextStarterIntent,
  prompt: string,
): CanvasMutation {
  return {
    op: 'updateNode',
    nodeId: node.id,
    patch: {
      ...(intent === 'free' ? { size: { width: 350, height: 200 } } : {}),
      data: {
        ...node.data,
        prompt,
        extra: {
          ...node.data.extra,
          // Kept for old scenario snapshots; v1 state is the new source of truth.
          intent,
          textAuthoring: stateForIntent(node, intent),
        },
      },
    },
  }
}

/** Materialize one observed Text starter as a single canvas transaction. */
export function createTextStarterMutations(
  document: WorkflowDocument,
  sourceNodeId: string,
  intent: TextStarterIntent,
): TextStarterMutationResult {
  const source = document.nodes.find((node) => node.id === sourceNodeId)
  if (!source) throw new Error(`节点不存在: ${sourceNodeId}`)
  if (source.type !== 'text') throw new Error('文本预设需要文本节点')

  if (intent === 'free') {
    return {
      mutations: [updateTextNode(source, intent, '')],
      createdNodeIds: [source.id],
      groupId: null,
    }
  }

  const pool = [...document.nodes]
  let target: WorkflowNode
  let edge: ReturnType<typeof createEdge>
  let groupName: string
  let groupNodeIds: string[]

  if (intent === 'caption') {
    target = createNode(
      'image',
      { x: source.position.x - 500, y: source.position.y },
      pool,
      { name: '参考图片' },
    )
    edge = createEdge(target.id, source.id)
    groupName = '预设 - 图片反推提示词'
    groupNodeIds = [target.id, source.id]
  } else if (intent === 'text2video') {
    target = createNode(
      'video',
      { x: source.position.x + source.size.width + 150, y: source.position.y },
      pool,
      { name: '视频生成' },
    )
    target.data.prompt = '根据文字描述生成视频。'
    target.data.modelId = 'seedance-2-fast'
    target.data.output = {
      aspectRatio: '16:9',
      resolution: '720p',
      durationSeconds: 5,
      count: 1,
      withAudio: false,
      mode: 'text2video',
    }
    edge = createEdge(source.id, target.id)
    groupName = '预设 - 文生视频'
    groupNodeIds = [source.id, target.id]
  } else {
    target = createNode(
      'audio',
      { x: source.position.x + 80, y: source.position.y + source.size.height + 150 },
      pool,
      { name: '音乐生成' },
    )
    const audioAuthoring = defaultAudioAuthoringState('mureka-v8')
    target.data.modelId = 'mureka-v8'
    target.data.output = audioExecutionOutput('mureka-v8', audioAuthoring)
    target.data.extra = { ...target.data.extra, audioAuthoring }
    edge = createEdge(source.id, target.id)
    groupName = '预设 - 文字生音乐'
    groupNodeIds = [source.id, target.id]
  }

  const prompt = TEXT_STARTER_PROMPTS[intent]
  const group = createGroup('normal', groupNodeIds, groupName)
  target.groupId = group.id

  return {
    mutations: [
      updateTextNode(source, intent, prompt),
      { op: 'addNode', node: target },
      { op: 'addEdge', edge },
      { op: 'addGroup', group },
    ],
    createdNodeIds: groupNodeIds,
    groupId: group.id,
  }
}
