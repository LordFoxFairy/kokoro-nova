/**
 * Node type vocabulary.
 *
 * The current add-node menu is documented as: 文本 / 图片 / 视频 /
 * 智能剪辑(Beta, serialized as `videoComposite`) / 导演台(NEW) /
 * 逐帧拉片(SD 2.5, serialized as `scriptLegacy`) / 音频 /
 * 脚本(二级: v2 + legacy) / 素材库(二级: 风格 + 特效),
 * plus the two "add resource" entries which create an image/video/audio node
 * pre-bound to an existing asset rather than a distinct node type.
 */
export const NODE_TYPES = [
  'text',
  'image',
  'video',
  'videoComposite',
  'director',
  'audio',
  'script',
  'scriptLegacy',
  'style',
  'effect',
  'assetLibrary',
] as const

export type NodeType = (typeof NODE_TYPES)[number]

export interface NodeTypeMeta {
  type: NodeType
  label: string
  /** Grouping used by the add-node menu and the asset-management type filter. */
  menu: 'node' | 'submenu:script' | 'submenu:material'
  badge?: 'NEW' | 'Beta'
  /** Media class this node can output; null means it produces no媒体 artifact. */
  produces: 'text' | 'image' | 'video' | 'audio' | null
  /** Media classes this node accepts on its input port. */
  accepts: readonly ('text' | 'image' | 'video' | 'audio' | 'style' | 'effect')[]
  /** Which storyboard column the node projects into. */
  storyboardColumn: 'text' | 'image' | 'video' | 'audio' | null
  description: string
}

export const NODE_META: Record<NodeType, NodeTypeMeta> = {
  text: {
    type: 'text',
    label: '文本',
    menu: 'node',
    produces: 'text',
    accepts: ['text', 'image'],
    storyboardColumn: 'text',
    description: '手写内容、文生视频、图片反推提示词或文字生音乐的起点。',
  },
  image: {
    type: 'image',
    label: '图片',
    menu: 'node',
    produces: 'image',
    accepts: ['text', 'image', 'style', 'effect'],
    storyboardColumn: 'image',
    description: '文字生图，或上传图片后用文字指令对图片进行编辑。',
  },
  video: {
    type: 'video',
    label: '视频',
    menu: 'node',
    produces: 'video',
    accepts: ['text', 'image', 'video', 'audio', 'style', 'effect'],
    storyboardColumn: 'video',
    description: '文生视频、首帧生视频、首尾帧生视频。',
  },
  videoComposite: {
    type: 'videoComposite',
    label: '视频合成',
    menu: 'node',
    badge: 'Beta',
    produces: 'video',
    accepts: ['video', 'audio', 'image'],
    storyboardColumn: 'video',
    description: '把多段已生成视频合成为成片，支持转场、字幕和导出。',
  },
  director: {
    type: 'director',
    label: '导演台',
    menu: 'node',
    badge: 'NEW',
    produces: 'image',
    accepts: ['image'],
    storyboardColumn: 'image',
    description: '搭建 3D 场景并进行多视角截图。',
  },
  audio: {
    type: 'audio',
    label: '音频',
    menu: 'node',
    produces: 'audio',
    accepts: ['text', 'audio'],
    storyboardColumn: 'audio',
    description: '文字转语音、音乐生成与音色克隆。',
  },
  script: {
    type: 'script',
    label: '脚本 V2',
    menu: 'submenu:script',
    produces: 'text',
    accepts: ['text', 'image', 'video'],
    storyboardColumn: 'text',
    description: '确认镜头 → 准备资产 → 合成提示词的三阶段分镜流程。',
  },
  scriptLegacy: {
    type: 'scriptLegacy',
    label: '脚本 (旧版 Beta)',
    menu: 'submenu:script',
    badge: 'Beta',
    produces: 'text',
    accepts: ['text', 'image', 'video'],
    storyboardColumn: 'text',
    description: '旧版分镜脚本：剧本 / 视频参考 / 角色参考三种入口。',
  },
  style: {
    type: 'style',
    label: '风格',
    menu: 'submenu:material',
    badge: 'NEW',
    produces: null,
    accepts: [],
    storyboardColumn: null,
    description: '从风格库落成的素材节点，可连接到图片或视频节点。',
  },
  effect: {
    type: 'effect',
    label: '特效',
    menu: 'submenu:material',
    badge: 'NEW',
    produces: null,
    accepts: [],
    storyboardColumn: null,
    description: '从特效库落成的素材节点，可连接到视频节点。',
  },
  assetLibrary: {
    type: 'assetLibrary',
    label: '资产库',
    menu: 'node',
    produces: null,
    accepts: [],
    storyboardColumn: null,
    description: '把个人或 Agent 资产引入画布，作为下游节点的参考输入。',
  },
}

export const MEDIA_OF_NODE: Record<NodeType, 'text' | 'image' | 'video' | 'audio' | 'style' | 'effect' | null> = {
  text: 'text',
  image: 'image',
  video: 'video',
  videoComposite: 'video',
  director: 'image',
  audio: 'audio',
  script: 'text',
  scriptLegacy: 'text',
  style: 'style',
  effect: 'effect',
  assetLibrary: null,
}

/**
 * Edge validity. `assetLibrary` is polymorphic: it carries whatever media its
 * bound asset holds, so the check is deferred to the runtime asset kind.
 */
export function canConnect(
  sourceType: NodeType,
  targetType: NodeType,
  sourceAssetKind?: 'image' | 'video' | 'audio' | null,
): { ok: true } | { ok: false; reason: string } {
  if (sourceType === targetType && sourceType === 'text') {
    return { ok: true }
  }
  const produced = sourceType === 'assetLibrary' ? (sourceAssetKind ?? null) : MEDIA_OF_NODE[sourceType]
  if (!produced) {
    return { ok: false, reason: `${NODE_META[sourceType].label}节点没有可输出的内容` }
  }
  const accepted = NODE_META[targetType].accepts
  if (accepted.length === 0) {
    return { ok: false, reason: `${NODE_META[targetType].label}节点不接受输入` }
  }
  if (!accepted.includes(produced)) {
    return {
      ok: false,
      reason: `${NODE_META[targetType].label}节点不接受${
        { text: '文本', image: '图片', video: '视频', audio: '音频', style: '风格', effect: '特效' }[produced]
      }输入`,
    }
  }
  return { ok: true }
}
