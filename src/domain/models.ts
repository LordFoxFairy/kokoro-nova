import type { OutputSpec } from './types'

export type ModelMedia = 'image' | 'video' | 'audio' | 'text'

export interface ModelDefinition {
  id: string
  label: string
  provider: string
  media: ModelMedia
  /** Human estimate shown on the model card, e.g. "约 30 秒". */
  latencyLabel: string
  /** Base credit cost before output multipliers. */
  baseCredits: number
  /** Which output controls the node should render for this model. */
  controls: readonly (keyof OutputSpec)[]
  /** Generation modes this model supports (video models only). */
  modes?: readonly NonNullable<OutputSpec['mode']>[]
  tags?: readonly string[]
  description: string
}

/**
 * Catalog shape mirrors the observed selectors: image / video / audio / 语言
 * tabs, each card showing provider, tier and an estimated duration.
 *
 * These entries are *local descriptors only* — no remote model is called until
 * an integrator registers a real provider in `src/server/generation/providers`.
 */
export const MODELS: ModelDefinition[] = [
  // ---- image ----
  {
    id: 'lib-image-2',
    label: 'Lib Image',
    provider: 'Lib',
    media: 'image',
    latencyLabel: '约 30 秒',
    baseCredits: 18,
    controls: ['aspectRatio', 'quality', 'resolution', 'count'],
    tags: ['默认', '文生图', '图生图'],
    description: '通用图像生成与指令式图片编辑，支持参考图与风格。',
  },
  {
    id: 'lib-image-ultra',
    label: 'Lib Image Ultra',
    provider: 'Lib',
    media: 'image',
    latencyLabel: '约 55 秒',
    baseCredits: 34,
    controls: ['aspectRatio', 'quality', 'resolution', 'count'],
    tags: ['高保真'],
    description: '更高细节与文字还原度，适合成片级分镜与关键视觉。',
  },
  {
    id: 'flux-kontext',
    label: 'Kontext',
    provider: 'Black Forest',
    media: 'image',
    latencyLabel: '约 25 秒',
    baseCredits: 22,
    controls: ['aspectRatio', 'quality', 'resolution', 'count'],
    tags: ['指令编辑'],
    description: '擅长按自然语言指令做局部修改并保持主体一致。',
  },
  {
    id: 'seedream-4',
    label: 'Seedream 4',
    provider: 'Seed',
    media: 'image',
    latencyLabel: '约 20 秒',
    baseCredits: 16,
    controls: ['aspectRatio', 'quality', 'resolution', 'count'],
    tags: ['快速'],
    description: '速度优先的通用图像模型，适合批量草稿与分镜探索。',
  },

  // ---- video ----
  {
    id: 'seedance-2',
    label: 'Seedance 2.0',
    provider: 'Seed',
    media: 'video',
    latencyLabel: '约 4 分钟',
    baseCredits: 35,
    controls: ['aspectRatio', 'resolution', 'durationSeconds', 'withAudio', 'count', 'mode'],
    modes: ['text2video', 'first-frame', 'first-last-frame'],
    tags: ['默认', '合规校验'],
    description: '默认视频生成器，提交前会对人像与版权素材做合规校验。',
  },
  {
    id: 'kling-o1',
    label: 'Kling O1',
    provider: 'Kling',
    media: 'video',
    latencyLabel: '约 5 分钟',
    baseCredits: 35,
    controls: ['aspectRatio', 'resolution', 'durationSeconds', 'count', 'mode'],
    modes: ['text2video', 'first-frame', 'first-last-frame', 'video2video'],
    tags: ['运镜'],
    description: '运动幅度与镜头语言表现稳定，支持首尾帧控制。',
  },
  {
    id: 'hailuo-2',
    label: 'Hailuo 02',
    provider: 'MiniMax',
    media: 'video',
    latencyLabel: '约 3 分钟',
    baseCredits: 28,
    controls: ['aspectRatio', 'resolution', 'durationSeconds', 'count', 'mode'],
    modes: ['text2video', 'first-frame'],
    tags: ['性价比'],
    description: '较短等待时间下的可用画质，适合分镜验证。',
  },
  {
    id: 'veo-3',
    label: 'Veo 3',
    provider: 'Google',
    media: 'video',
    latencyLabel: '约 6 分钟',
    baseCredits: 62,
    controls: ['aspectRatio', 'resolution', 'durationSeconds', 'withAudio', 'count', 'mode'],
    modes: ['text2video', 'first-frame'],
    tags: ['带音频'],
    description: '可同时生成画面与匹配音轨。',
  },

  // ---- audio ----
  {
    id: 'minimax-speech-2.8-hd',
    label: 'Minimax-speech-2.8-hd',
    provider: 'MiniMax',
    media: 'audio',
    latencyLabel: '约 15 秒',
    baseCredits: 6,
    controls: ['voiceId', 'speed', 'pitch', 'volume', 'emotion'],
    tags: ['默认', '语音'],
    description: '默认文字转语音模型，支持语速、音调、音量与情绪控制。',
  },
  {
    id: 'seed-audio-tts',
    label: 'Seed Audio TTS',
    provider: 'Seed',
    media: 'audio',
    latencyLabel: '约 12 秒',
    baseCredits: 5,
    controls: ['voiceId', 'speed', 'pitch', 'volume', 'emotion'],
    tags: ['语音'],
    description: '自然停顿与副语言提示表现良好。',
  },
  {
    id: 'eleven-multilingual-v2',
    label: 'Eleven Multilingual v2',
    provider: 'ElevenLabs',
    media: 'audio',
    latencyLabel: '约 18 秒',
    baseCredits: 9,
    controls: ['voiceId', 'speed', 'pitch', 'volume', 'emotion'],
    tags: ['多语言', '克隆'],
    description: '多语言音色与声音克隆。',
  },
  {
    id: 'mureka-music',
    label: 'Mureka Music',
    provider: 'Mureka',
    media: 'audio',
    latencyLabel: '约 60 秒',
    baseCredits: 14,
    controls: ['durationSeconds'],
    tags: ['音乐'],
    description: '按描述生成带结构的背景音乐。',
  },

  // ---- language ----
  {
    id: 'gvlm-3.1',
    label: 'GVLM 3.1',
    provider: 'Lib',
    media: 'text',
    latencyLabel: '约 10 秒',
    baseCredits: 6,
    controls: [],
    tags: ['默认'],
    description: '脚本拆解、提示词合成与图片反推的默认语言模型。',
  },
  {
    id: 'gvlm-3.1-pro',
    label: 'GVLM 3.1 Pro',
    provider: 'Lib',
    media: 'text',
    latencyLabel: '约 20 秒',
    baseCredits: 12,
    controls: [],
    description: '更长上下文与更稳定的分镜结构化输出。',
  },
  {
    id: 'gvlm-3.1-flash-lite',
    label: 'GVLM 3.1 Flash Lite',
    provider: 'Lib',
    media: 'text',
    latencyLabel: '约 10 秒',
    baseCredits: 3,
    description: '低成本快速草稿。',
    controls: [],
  },
  {
    id: 'cvlm-5.5',
    label: 'CVLM 5.5',
    provider: 'Lib',
    media: 'text',
    latencyLabel: '约 15 秒',
    baseCredits: 9,
    controls: [],
    description: '中文创意写作与对白偏好更强。',
  },
]

export const MODELS_BY_ID = new Map(MODELS.map((m) => [m.id, m]))

export function modelsFor(media: ModelMedia): ModelDefinition[] {
  return MODELS.filter((m) => m.media === media)
}

export const DEFAULT_MODEL: Record<ModelMedia, string> = {
  image: 'lib-image-2',
  video: 'seedance-2',
  audio: 'minimax-speech-2.8-hd',
  text: 'gvlm-3.1',
}

/* ------------------------------------------------------------------ *
 * Quoting
 * ------------------------------------------------------------------ */

const RESOLUTION_MULTIPLIER: Record<string, number> = {
  '1K': 1,
  '2K': 1.25,
  '4K': 2.4,
  adaptive: 1,
  '480p': 0.7,
  '720p': 1,
  '1080p': 1.6,
}

const QUALITY_MULTIPLIER: Record<string, number> = {
  standard: 1,
  high: 1.45,
}

export const PRICE_VERSION = '2026-07-27.1'

export interface QuoteBreakdownLine {
  label: string
  credits: number
}

/**
 * Deterministic cost estimate. The confirm gate shows this number, and the
 * ledger reserves exactly it before a job leaves `awaiting_confirmation`.
 */
export function quoteCredits(modelId: string, output: OutputSpec | undefined): {
  credits: number
  breakdown: QuoteBreakdownLine[]
} {
  const model = MODELS_BY_ID.get(modelId)
  if (!model) return { credits: 0, breakdown: [] }

  const breakdown: QuoteBreakdownLine[] = []
  let credits = model.baseCredits
  breakdown.push({ label: `${model.label} 基础`, credits: model.baseCredits })

  const out = output ?? {}

  if (out.resolution && RESOLUTION_MULTIPLIER[out.resolution] !== undefined) {
    const before = credits
    credits *= RESOLUTION_MULTIPLIER[out.resolution]
    if (credits !== before) {
      breakdown.push({ label: `分辨率 ${out.resolution}`, credits: Math.round(credits - before) })
    }
  }
  if (out.quality && QUALITY_MULTIPLIER[out.quality] !== undefined) {
    const before = credits
    credits *= QUALITY_MULTIPLIER[out.quality]
    if (credits !== before) {
      breakdown.push({ label: out.quality === 'high' ? '高品质' : '标准画质', credits: Math.round(credits - before) })
    }
  }
  if (model.media === 'video' && out.durationSeconds) {
    const before = credits
    credits *= out.durationSeconds / 5
    if (credits !== before) {
      breakdown.push({ label: `${out.durationSeconds} 秒`, credits: Math.round(credits - before) })
    }
  }
  if (out.withAudio) {
    const add = Math.round(credits * 0.15)
    credits += add
    breakdown.push({ label: '生成音频', credits: add })
  }

  credits = Math.round(credits)
  const count = out.count ?? 1
  if (count > 1) {
    const before = credits
    credits *= count
    breakdown.push({ label: `${count} 张/条`, credits: credits - before })
  }

  return { credits: Math.round(credits), breakdown }
}
