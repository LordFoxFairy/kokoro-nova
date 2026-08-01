import { createEdge, createGroup, createNode } from './factory'
import type { CanvasMutation, NodeType, WorkflowNode } from './types-reexport'

/**
 * Toolbox presets ("工具箱").
 *
 * A preset instantiates a group of nodes plus their dependency edges in one
 * action — the observed 左弧滑行 template creates a reference image node, a
 * rich prompt text node and an output video node with three edges.
 */

export interface PresetNodeSpec {
  type: NodeType
  name: string
  offset: { x: number; y: number }
  prompt?: string
  modelId?: string
  output?: Record<string, unknown>
}

export interface ToolboxPreset {
  id: string
  name: string
  category: string
  summary: string
  tutorialUrl: string | null
  nodes: PresetNodeSpec[]
  /** Edges expressed as indices into `nodes`. */
  edges: [number, number][]
}

export const PRESET_CATEGORIES = [
  '运镜',
  '电商展示',
  '角色动画',
  '转场',
  '空间效果',
  '时装',
  '分镜',
  '室内预览',
] as const

export const TOOLBOX_PRESETS: ToolboxPreset[] = [
  {
    id: 'preset-arc-left',
    name: '左弧滑行',
    category: '运镜',
    summary: '镜头沿左侧弧线滑行环绕主体，保持主体居中并露出环境纵深。',
    tutorialUrl: null,
    nodes: [
      { type: 'image', name: '参考图片', offset: { x: 0, y: 0 } },
      {
        type: 'text',
        name: '运镜提示词',
        offset: { x: 0, y: 380 },
        prompt:
          '镜头自主体右前方起幅，沿左侧弧线缓慢滑行环绕，主体始终居中，背景纵深随移动展开；速度均匀，无抖动。',
      },
      { type: 'video', name: '输出视频', offset: { x: 480, y: 190 } },
    ],
    edges: [
      [0, 2],
      [1, 2],
      [1, 0],
    ],
  },
  {
    id: 'preset-push-in',
    name: '推近特写',
    category: '运镜',
    summary: '从中景稳定推近到面部特写，用于情绪转折点。',
    tutorialUrl: null,
    nodes: [
      { type: 'image', name: '起幅画面', offset: { x: 0, y: 0 } },
      {
        type: 'text',
        name: '运镜提示词',
        offset: { x: 0, y: 380 },
        prompt: '镜头由中景匀速推近至面部特写，焦点始终锁定人物眼睛，背景虚化逐渐加强。',
      },
      { type: 'video', name: '输出视频', offset: { x: 480, y: 190 } },
    ],
    edges: [
      [0, 2],
      [1, 2],
    ],
  },
  {
    id: 'preset-product-360',
    name: '商品环绕展示',
    category: '电商展示',
    summary: '商品 360 度环绕，适合详情页首屏与短视频开场。',
    tutorialUrl: null,
    nodes: [
      { type: 'image', name: '商品图', offset: { x: 0, y: 0 } },
      {
        type: 'text',
        name: '展示提示词',
        offset: { x: 0, y: 380 },
        prompt: '商品置于纯色台面，镜头水平环绕一周，柔和顶光加轮廓光，材质与标识清晰可辨。',
      },
      { type: 'video', name: '展示视频', offset: { x: 480, y: 190 } },
    ],
    edges: [
      [0, 2],
      [1, 2],
    ],
  },
  {
    id: 'preset-character-turnaround',
    name: '角色三视图',
    category: '角色动画',
    summary: '由一张角色图推导正面、侧面、背面三视图，作为后续一致性参考。',
    tutorialUrl: null,
    nodes: [
      { type: 'image', name: '角色参考', offset: { x: 0, y: 0 } },
      {
        type: 'text',
        name: '三视图提示词',
        offset: { x: 0, y: 380 },
        prompt: '同一角色的正面、四分之三侧面与背面三视图，等比例站姿，纯色背景，服装与配饰保持一致。',
      },
      { type: 'image', name: '三视图输出', offset: { x: 480, y: 190 } },
    ],
    edges: [
      [0, 2],
      [1, 2],
    ],
  },
  {
    id: 'preset-cross-dissolve',
    name: '溶解转场',
    category: '转场',
    summary: '两段素材之间的柔和溶解，用于时间跳跃。',
    tutorialUrl: null,
    nodes: [
      { type: 'video', name: '前段素材', offset: { x: 0, y: 0 } },
      { type: 'video', name: '后段素材', offset: { x: 0, y: 360 } },
      { type: 'videoComposite', name: '转场合成', offset: { x: 480, y: 180 } },
    ],
    edges: [
      [0, 2],
      [1, 2],
    ],
  },
  {
    id: 'preset-parallax',
    name: '空间视差',
    category: '空间效果',
    summary: '单张静帧拆分前后景做视差位移，制造伪 3D 空间感。',
    tutorialUrl: null,
    nodes: [
      { type: 'image', name: '静帧', offset: { x: 0, y: 0 } },
      {
        type: 'text',
        name: '视差提示词',
        offset: { x: 0, y: 380 },
        prompt: '保持构图不变，前景与背景以不同速度横向位移，产生轻微视差；不改变主体形态。',
      },
      { type: 'video', name: '视差视频', offset: { x: 480, y: 190 } },
    ],
    edges: [
      [0, 2],
      [1, 2],
    ],
  },
  {
    id: 'preset-lookbook',
    name: '时装 Lookbook',
    category: '时装',
    summary: '模特走位与服装细节交替，输出可直接投放的短片段。',
    tutorialUrl: null,
    nodes: [
      { type: 'image', name: '造型图', offset: { x: 0, y: 0 } },
      {
        type: 'text',
        name: '走位提示词',
        offset: { x: 0, y: 380 },
        prompt: '模特自远处走向镜头，中途转身展示背面剪裁，光比柔和，面料垂坠与褶皱清晰。',
      },
      { type: 'video', name: '走秀片段', offset: { x: 480, y: 190 } },
    ],
    edges: [
      [0, 2],
      [1, 2],
    ],
  },
  {
    id: 'preset-shot-breakdown',
    name: '分镜拆解',
    category: '分镜',
    summary: '从一段剧情文本拆出镜头表，并为每个镜头准备图片。',
    tutorialUrl: null,
    nodes: [
      { type: 'text', name: '剧情梗概', offset: { x: 0, y: 0 } },
      { type: 'script', name: '分镜脚本', offset: { x: 440, y: 0 } },
      { type: 'image', name: '分镜画面', offset: { x: 940, y: 0 } },
    ],
    edges: [
      [0, 1],
      [1, 2],
    ],
  },
  {
    id: 'preset-interior-walkthrough',
    name: '室内漫游',
    category: '室内预览',
    summary: '室内空间的连续漫游镜头，用于空间预览与方案汇报。',
    tutorialUrl: null,
    nodes: [
      { type: 'image', name: '空间效果图', offset: { x: 0, y: 0 } },
      {
        type: 'text',
        name: '漫游提示词',
        offset: { x: 0, y: 380 },
        prompt: '镜头贴近地面高度平稳前推，依次经过玄关、客厅与落地窗，自然光由窗侧进入，无鱼眼畸变。',
      },
      { type: 'video', name: '漫游视频', offset: { x: 480, y: 190 } },
    ],
    edges: [
      [0, 2],
      [1, 2],
    ],
  },
]

export const PRESETS_BY_ID = new Map(TOOLBOX_PRESETS.map((p) => [p.id, p]))

/**
 * Compile a preset into mutations. Returns the created nodes so the caller can
 * select them and fit the viewport around the new group.
 */
export function instantiatePreset(
  preset: ToolboxPreset,
  origin: { x: number; y: number },
  existing: WorkflowNode[],
): { mutations: CanvasMutation[]; nodes: WorkflowNode[]; groupId: string } {
  const created: WorkflowNode[] = []
  const pool = [...existing]

  for (const spec of preset.nodes) {
    const node = createNode(spec.type, { x: origin.x + spec.offset.x, y: origin.y + spec.offset.y }, pool, {
      name: spec.name,
    })
    if (spec.prompt !== undefined) node.data.prompt = spec.prompt
    if (spec.modelId) node.data.modelId = spec.modelId
    if (spec.output) node.data.output = { ...node.data.output, ...spec.output }
    created.push(node)
    pool.push(node)
  }

  const group = createGroup('normal', created.map((n) => n.id), preset.name)
  for (const node of created) node.groupId = group.id

  const mutations: CanvasMutation[] = created.map((node) => ({ op: 'addNode', node }))
  for (const [from, to] of preset.edges) {
    mutations.push({ op: 'addEdge', edge: createEdge(created[from].id, created[to].id) })
  }
  mutations.push({ op: 'addGroup', group })

  return { mutations, nodes: created, groupId: group.id }
}
