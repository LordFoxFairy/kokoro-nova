import type { OutputSpec } from './types'

export type ModelMedia = 'image' | 'video' | 'audio' | 'text'

export type ModelAvailability = 'available' | 'preview' | 'coming-soon'
export type MembershipTier = 'standard' | 'vip'
export type VideoGenerationMode = NonNullable<OutputSpec['mode']>
export type ModelAspectRatio = NonNullable<OutputSpec['aspectRatio']>
export type ModelResolution = NonNullable<OutputSpec['resolution']>
export type ModelCount = NonNullable<OutputSpec['count']>

export interface ReferenceCountConstraint {
  min: number
  max?: number
}

export interface VideoReferenceRequirement {
  images?: ReferenceCountConstraint
  videos?: ReferenceCountConstraint
  audios?: ReferenceCountConstraint
  /** Used by all-purpose reference models that accept any media mix. */
  anyMedia?: ReferenceCountConstraint
}

export interface VideoModelCapabilities {
  aspectRatios: readonly ModelAspectRatio[]
  resolutions: readonly ModelResolution[]
  durationsSeconds: readonly number[]
  counts: readonly ModelCount[]
  audio: 'unsupported' | 'optional' | 'required'
  modes: readonly VideoGenerationMode[]
  referenceRequirements: Partial<Record<VideoGenerationMode, VideoReferenceRequirement>>
  defaults: {
    aspectRatio: ModelAspectRatio
    resolution: ModelResolution
    durationSeconds: number
    count: ModelCount
    withAudio: boolean
    mode: VideoGenerationMode
  }
}

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
  /** Versioned output and reference rules for video models. */
  capabilities?: VideoModelCapabilities
  membershipTier?: MembershipTier
  availability?: ModelAvailability
  /** Stable family key used by the local icon tile; never a remote asset URL. */
  iconKey?: string
  tags?: readonly string[]
  description: string
}

export const MODEL_CATALOG_VERSION = '2026-09-03.1'

export const VIDEO_MODE_LABELS: Record<VideoGenerationMode, string> = {
  text2video: '文生视频',
  'omni-reference': '全能参考',
  image2video: '图生视频',
  'first-frame': '首帧生视频',
  'first-last-frame': '首尾帧',
  'image-reference': '图片参考',
  video2video: '视频生视频',
  'motion-transfer': '动作迁移',
  'digital-human': '数字人',
}

const VIDEO_RATIOS = ['auto', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'] as const
const VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'] as const
const VIDEO_COUNTS = [1, 2, 4] as const
const OMNI_MODES = ['text2video', 'omni-reference', 'image2video', 'first-last-frame', 'image-reference'] as const
const EDIT_MODES = [...OMNI_MODES, 'video2video'] as const
const IMAGE_MODES = ['text2video', 'image2video', 'first-frame', 'first-last-frame'] as const

const DEFAULT_MODE_REQUIREMENTS: Partial<Record<VideoGenerationMode, VideoReferenceRequirement>> = {
  'omni-reference': { anyMedia: { min: 1 } },
  image2video: { images: { min: 1 } },
  'first-frame': { images: { min: 1, max: 1 } },
  'first-last-frame': { images: { min: 2, max: 2 } },
  'image-reference': { images: { min: 1 } },
  video2video: { videos: { min: 1 } },
  'motion-transfer': { images: { min: 1, max: 1 }, videos: { min: 1, max: 1 } },
  'digital-human': { images: { min: 1 }, audios: { min: 1 } },
}

interface VideoCapabilitiesOptions {
  aspectRatios?: readonly ModelAspectRatio[]
  resolutions?: readonly ModelResolution[]
  durationsSeconds?: readonly number[]
  counts?: readonly ModelCount[]
  audio?: VideoModelCapabilities['audio']
  modes?: readonly VideoGenerationMode[]
  defaultMode?: VideoGenerationMode
  referenceRequirements?: VideoModelCapabilities['referenceRequirements']
}

function videoCapabilities(options: VideoCapabilitiesOptions = {}): VideoModelCapabilities {
  const aspectRatios = options.aspectRatios ?? VIDEO_RATIOS
  const resolutions = options.resolutions ?? VIDEO_RESOLUTIONS
  const durationsSeconds = options.durationsSeconds ?? [5, 10, 15]
  const counts = options.counts ?? VIDEO_COUNTS
  const audio = options.audio ?? 'optional'
  const modes = options.modes ?? OMNI_MODES
  const defaultMode = options.defaultMode ?? modes[0]

  return {
    aspectRatios,
    resolutions,
    durationsSeconds,
    counts,
    audio,
    modes,
    referenceRequirements: Object.fromEntries(
      modes
        .filter((mode) => mode !== 'text2video')
        .map((mode) => [mode, options.referenceRequirements?.[mode] ?? DEFAULT_MODE_REQUIREMENTS[mode] ?? {}]),
    ),
    defaults: {
      aspectRatio: aspectRatios.includes('16:9') ? '16:9' : aspectRatios[0],
      resolution: resolutions.includes('720p') ? '720p' : resolutions[0],
      durationSeconds: durationsSeconds[0],
      count: counts[0],
      withAudio: audio === 'required',
      mode: defaultMode,
    },
  }
}

interface VideoModelOptions {
  id: string
  label: string
  provider: string
  latencyLabel: string
  baseCredits: number
  description: string
  iconKey: string
  tags?: readonly string[]
  membershipTier?: MembershipTier
  availability?: ModelAvailability
  capabilities?: VideoModelCapabilities
}

function videoModel(options: VideoModelOptions): ModelDefinition {
  const capabilities = options.capabilities ?? videoCapabilities()
  return {
    ...options,
    media: 'video',
    controls: [
      'aspectRatio',
      'resolution',
      'durationSeconds',
      ...(capabilities.audio === 'unsupported' ? [] : (['withAudio'] as const)),
      'count',
      'mode',
    ],
    membershipTier: options.membershipTier ?? 'standard',
    availability: options.availability ?? 'available',
    capabilities,
  }
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

  // ---- video — current observed catalogue order ----
  videoModel({
    id: 'seedance-2-5',
    label: 'Seedance 2.5',
    provider: 'Seedance',
    latencyLabel: '2min',
    baseCredits: 48,
    iconKey: 'seedance',
    tags: ['默认', '全能参考', '音画同步'],
    description: '全能参考与长时音画同步的旗舰视频模型。',
    capabilities: videoCapabilities({
      resolutions: ['480p', '720p', '1080p', '4K'],
      durationsSeconds: [5, 10, 15, 30],
      modes: OMNI_MODES,
      defaultMode: 'omni-reference',
    }),
  }),
  videoModel({
    id: 'seedance-2',
    label: 'Seedance 2.0 VIP',
    provider: 'Seedance',
    latencyLabel: '2min',
    baseCredits: 35,
    iconKey: 'seedance',
    membershipTier: 'vip',
    tags: ['会员通道', '音画同步'],
    description: '会员专属通道，支持 15 秒音画同步。',
    capabilities: videoCapabilities({ modes: OMNI_MODES, defaultMode: 'omni-reference' }),
  }),
  videoModel({
    id: 'seedance-2-fast',
    label: 'Seedance 2.0 Fast VIP',
    provider: 'Seedance',
    latencyLabel: '2min',
    baseCredits: 30,
    iconKey: 'seedance',
    membershipTier: 'vip',
    tags: ['会员通道', '快速'],
    description: '快速版会员通道，支持 15 秒音画同步。',
    capabilities: videoCapabilities({ modes: OMNI_MODES, defaultMode: 'omni-reference' }),
  }),
  videoModel({
    id: 'seedance-2-mini',
    label: 'Seedance 2.0 Mini',
    provider: 'Seedance',
    latencyLabel: '2min',
    baseCredits: 22,
    iconKey: 'seedance',
    tags: ['高性价比', '音画同步'],
    description: '轻量高性价比版本，支持 15 秒音画同步。',
    capabilities: videoCapabilities({ modes: OMNI_MODES, defaultMode: 'omni-reference' }),
  }),
  videoModel({
    id: 'kling-o3',
    label: 'Kling O3',
    provider: 'Kling',
    latencyLabel: '3min',
    baseCredits: 44,
    iconKey: 'kling',
    tags: ['视频编辑', '多镜头', '音画同出'],
    description: '兼顾视频编辑、参考一致性和多镜头音画同出。',
    capabilities: videoCapabilities({ modes: EDIT_MODES, defaultMode: 'omni-reference' }),
  }),
  videoModel({
    id: 'minimax-h3-max',
    label: 'Minimax H3 Max',
    provider: 'MiniMax',
    latencyLabel: '30s',
    baseCredits: 36,
    iconKey: 'minimax',
    tags: ['极速', '首尾帧'],
    description: '后训练极速生成，支持文生、图生与首尾帧控制。',
    capabilities: videoCapabilities({
      aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16'],
      resolutions: ['720p', '1080p'],
      durationsSeconds: [5, 10],
      counts: [1, 2],
      audio: 'unsupported',
      modes: ['text2video', 'image2video', 'first-last-frame'],
    }),
  }),
  videoModel({
    id: 'minimax-h3',
    label: 'Minimax H3',
    provider: 'MiniMax',
    latencyLabel: '2min',
    baseCredits: 38,
    iconKey: 'minimax',
    tags: ['全模态', '商用'],
    description: '全模态输入与多参数控制，适配多种商用场景。',
    capabilities: videoCapabilities({ modes: EDIT_MODES, defaultMode: 'omni-reference' }),
  }),
  videoModel({
    id: 'wan-3-prime',
    label: 'Wan 3.0 Prime',
    provider: 'Wan',
    latencyLabel: '1min',
    baseCredits: 34,
    iconKey: 'wan',
    tags: ['快速', '全模态'],
    description: '快速全模态参考，侧重写实与主体一致性。',
    capabilities: videoCapabilities({ modes: EDIT_MODES, defaultMode: 'omni-reference' }),
  }),
  videoModel({
    id: 'wan-3',
    label: 'Wan 3.0',
    provider: 'Wan',
    latencyLabel: '3min',
    baseCredits: 38,
    iconKey: 'wan',
    tags: ['全模态', '文档参考'],
    description: '全模态参考并支持文档与网页输入，保持写实一致性。',
    capabilities: videoCapabilities({ modes: EDIT_MODES, defaultMode: 'omni-reference' }),
  }),
  videoModel({
    id: 'happy-horse-1-1',
    label: 'Happy Horse 1.1',
    provider: 'Alibaba',
    latencyLabel: '3min',
    baseCredits: 34,
    iconKey: 'happy-horse',
    tags: ['一致性', '视听'],
    description: '画面一致性与视听质量更可控。',
    capabilities: videoCapabilities({ modes: OMNI_MODES, defaultMode: 'omni-reference' }),
  }),
  videoModel({
    id: 'happy-horse-1',
    label: 'Happy Horse 1.0',
    provider: 'Alibaba',
    latencyLabel: '3min',
    baseCredits: 30,
    iconKey: 'happy-horse',
    tags: ['多参考'],
    description: '支持多参考输入的视频生成。',
    capabilities: videoCapabilities({ modes: OMNI_MODES, defaultMode: 'omni-reference' }),
  }),
  videoModel({
    id: 'kling-3-turbo',
    label: 'Kling 3.0 Turbo',
    provider: 'Kling',
    latencyLabel: '3min',
    baseCredits: 36,
    iconKey: 'kling',
    tags: ['高质感', '多镜头'],
    description: '高质感快速视频生成，支持多镜头叙事。',
    capabilities: videoCapabilities({ modes: IMAGE_MODES }),
  }),
  videoModel({
    id: 'kling-3',
    label: 'Kling 3.0',
    provider: 'Kling',
    latencyLabel: '3min',
    baseCredits: 42,
    iconKey: 'kling',
    tags: ['高质感', '多镜头'],
    description: '高质感视频生成，支持多镜头叙事。',
    capabilities: videoCapabilities({ modes: IMAGE_MODES }),
  }),
  videoModel({
    id: 'wan-2-7',
    label: 'Wan 2.7',
    provider: 'Wan',
    latencyLabel: '3min',
    baseCredits: 32,
    iconKey: 'wan',
    tags: ['全能参考', '视频编辑'],
    description: '全能参考并可修改视频画面、剧情与环境。',
    capabilities: videoCapabilities({ modes: EDIT_MODES, defaultMode: 'omni-reference' }),
  }),
  videoModel({
    id: 'kling-o1',
    label: 'Kling O1',
    provider: 'Kling',
    latencyLabel: '3min',
    baseCredits: 35,
    iconKey: 'kling',
    tags: ['视频编辑', '多模态'],
    description: '一代视频编辑模型，支持多模态输入。',
    capabilities: videoCapabilities({ modes: EDIT_MODES, defaultMode: 'omni-reference' }),
  }),
  videoModel({
    id: 'wan-2-6',
    label: 'Wan 2.6',
    provider: 'Wan',
    latencyLabel: '3min',
    baseCredits: 30,
    iconKey: 'wan',
    tags: ['音画同步', '多镜头'],
    description: '音画同步并支持多机位镜头，最长 15 秒。',
    capabilities: videoCapabilities({ modes: IMAGE_MODES }),
  }),
  videoModel({
    id: 'hailuo-2-3-fast',
    label: 'Hailuo 2.3 Fast',
    provider: 'MiniMax',
    latencyLabel: '1min',
    baseCredits: 24,
    iconKey: 'minimax',
    tags: ['快速', '动作'],
    description: '快速表达动作、表情和镜头变化。',
    capabilities: videoCapabilities({ audio: 'unsupported', modes: IMAGE_MODES }),
  }),
  videoModel({
    id: 'hailuo-2-3',
    label: 'Hailuo 2.3',
    provider: 'MiniMax',
    latencyLabel: '2min',
    baseCredits: 30,
    iconKey: 'minimax',
    tags: ['高质感', '动作'],
    description: '高质感表达动作、表情和镜头变化。',
    capabilities: videoCapabilities({ audio: 'unsupported', modes: IMAGE_MODES }),
  }),
  videoModel({
    id: 'seedance-1-5-pro',
    label: 'Seedance1.5 Pro',
    provider: 'Seedance',
    latencyLabel: '2min',
    baseCredits: 30,
    iconKey: 'seedance',
    tags: ['音画同步', '多机位'],
    description: '音画同步、多机位镜头，最长支持 12 秒。',
    capabilities: videoCapabilities({ durationsSeconds: [5, 8, 12], modes: IMAGE_MODES }),
  }),
  videoModel({
    id: 'seedance-1-pro',
    label: 'Seedance 1.0 Pro',
    provider: 'Seedance',
    latencyLabel: '2min',
    baseCredits: 28,
    iconKey: 'seedance',
    tags: ['1080P', '长时'],
    description: '高精度提示词理解，支持最长 40 秒的 1080P 视频。',
    capabilities: videoCapabilities({
      resolutions: ['720p', '1080p'],
      durationsSeconds: [5, 10, 20, 40],
      audio: 'unsupported',
      modes: IMAGE_MODES,
    }),
  }),
  videoModel({
    id: 'seedance-1-lite',
    label: 'Seedance 1.0 Lite',
    provider: 'Seedance',
    latencyLabel: '1min',
    baseCredits: 18,
    iconKey: 'seedance',
    tags: ['轻量', '快速'],
    description: '轻量快速，适合日常视频草稿。',
    capabilities: videoCapabilities({ audio: 'unsupported', modes: IMAGE_MODES }),
  }),
  videoModel({
    id: 'kling-2-6',
    label: 'Kling 2.6',
    provider: 'Kling',
    latencyLabel: '2min',
    baseCredits: 30,
    iconKey: 'kling',
    tags: ['音画同步'],
    description: '通用视频生成并可直出同步音画。',
    capabilities: videoCapabilities({ modes: IMAGE_MODES }),
  }),
  videoModel({
    id: 'kling-3-motion-transfer',
    label: 'Kling3.0 动作迁移',
    provider: 'Kling',
    latencyLabel: '8min',
    baseCredits: 56,
    iconKey: 'kling',
    tags: ['动作控制', '专用'],
    description: '动作控制模型，需要一张图片和一条视频。',
    capabilities: videoCapabilities({
      aspectRatios: ['auto', '16:9', '9:16'],
      resolutions: ['720p', '1080p'],
      durationsSeconds: [5, 10],
      counts: [1],
      audio: 'unsupported',
      modes: ['motion-transfer'],
      defaultMode: 'motion-transfer',
      referenceRequirements: {
        'motion-transfer': { images: { min: 1, max: 1 }, videos: { min: 1, max: 1 } },
      },
    }),
  }),
  videoModel({
    id: 'style-video',
    label: 'Style Video',
    provider: 'Lib',
    latencyLabel: '2min',
    baseCredits: 26,
    iconKey: 'style-video',
    tags: ['图生视频', '风格'],
    description: '稳定的风格化图生视频，强调画面表现力。',
    capabilities: videoCapabilities({ audio: 'unsupported', modes: ['image2video'], defaultMode: 'image2video' }),
  }),
  videoModel({
    id: 'hailuo-2',
    label: 'Hailuo 02',
    provider: 'MiniMax',
    latencyLabel: '2min',
    baseCredits: 28,
    iconKey: 'minimax',
    tags: ['运动特效'],
    description: '画质稳定，适合运动和特效场景。',
    capabilities: videoCapabilities({ audio: 'unsupported', modes: IMAGE_MODES }),
  }),
  videoModel({
    id: 'vidu-q2',
    label: 'Vidu Q2',
    provider: 'Vidu',
    latencyLabel: '3min',
    baseCredits: 28,
    iconKey: 'vidu',
    tags: ['多图参考'],
    description: '多图主体参考与精确控制。',
    capabilities: videoCapabilities({ audio: 'unsupported', modes: ['image-reference', 'image2video'] }),
  }),
  videoModel({
    id: 'vidu-q2-pro',
    label: 'Vidu Q2 Pro',
    provider: 'Vidu',
    latencyLabel: '—',
    baseCredits: 34,
    iconKey: 'vidu',
    tags: ['主体参考'],
    description: 'Vidu Q2 的高质量主体参考版本。',
    capabilities: videoCapabilities({ audio: 'unsupported', modes: ['image-reference', 'image2video'] }),
  }),
  videoModel({
    id: 'vidu-q2-turbo',
    label: 'Vidu Q2 Turbo',
    provider: 'Vidu',
    latencyLabel: '—',
    baseCredits: 22,
    iconKey: 'vidu',
    tags: ['快速'],
    description: 'Vidu Q2 的快速主体参考版本。',
    capabilities: videoCapabilities({ audio: 'unsupported', modes: ['image-reference', 'image2video'] }),
  }),
  videoModel({
    id: 'vidu-q3-pro',
    label: 'Vidu Q3 Pro',
    provider: 'Vidu',
    latencyLabel: '2min',
    baseCredits: 36,
    iconKey: 'vidu',
    tags: ['主体参考'],
    description: '新一代主体参考与精确控制。',
    capabilities: videoCapabilities({ audio: 'unsupported', modes: ['image-reference', 'image2video'] }),
  }),
  videoModel({
    id: 'omnihuman-1-5',
    label: 'OmniHuman 1.5',
    provider: 'ByteDance',
    latencyLabel: '3min',
    baseCredits: 42,
    iconKey: 'omnihuman',
    tags: ['数字人', '多模态'],
    description: '多模态数字人视频生成。',
    capabilities: videoCapabilities({
      aspectRatios: ['auto', '16:9', '9:16'],
      resolutions: ['720p', '1080p'],
      durationsSeconds: [5, 10, 15],
      counts: [1, 2],
      audio: 'required',
      modes: ['digital-human'],
      defaultMode: 'digital-human',
      referenceRequirements: { 'digital-human': { images: { min: 1 }, audios: { min: 1 } } },
    }),
  }),
  videoModel({
    id: 'kling-2-5',
    label: 'Kling 2.5',
    provider: 'Kling',
    latencyLabel: '2min',
    baseCredits: 24,
    iconKey: 'kling',
    tags: ['快速', '性价比'],
    description: '快速稳定、适合高频草稿生成。',
    capabilities: videoCapabilities({ audio: 'unsupported', modes: IMAGE_MODES }),
  }),
  videoModel({
    id: 'kling-2-1',
    label: 'Kling 2.1',
    provider: 'Kling',
    latencyLabel: '3min',
    baseCredits: 26,
    iconKey: 'kling',
    tags: ['首尾帧'],
    description: '支持首尾帧控制，图生视频表现稳定。',
    capabilities: videoCapabilities({ audio: 'unsupported', modes: IMAGE_MODES }),
  }),
  videoModel({
    id: 'wan-2-2',
    label: 'Wan 2.2',
    provider: 'Wan',
    latencyLabel: '3min',
    baseCredits: 24,
    iconKey: 'wan',
    tags: ['特效'],
    description: '支持多种预设特效玩法。',
    capabilities: videoCapabilities({ audio: 'unsupported', modes: IMAGE_MODES }),
  }),
  videoModel({
    id: 'wan-2-5',
    label: 'Wan 2.5',
    provider: 'Wan',
    latencyLabel: '3min',
    baseCredits: 28,
    iconKey: 'wan',
    tags: ['特效', '音画同步'],
    description: '支持特效与同步音画生成。',
    capabilities: videoCapabilities({ modes: IMAGE_MODES }),
  }),
  videoModel({
    id: 'pixverse-v5-5',
    label: 'Pixverse V5.5',
    provider: 'Pixverse',
    latencyLabel: '3min',
    baseCredits: 28,
    iconKey: 'pixverse',
    tags: ['特效'],
    description: '丰富的模板化特效与视频玩法。',
    capabilities: videoCapabilities({ audio: 'unsupported', modes: IMAGE_MODES }),
  }),
  videoModel({
    id: 'pixverse-v5',
    label: 'Pixverse V5',
    provider: 'Pixverse',
    latencyLabel: '3min',
    baseCredits: 24,
    iconKey: 'pixverse',
    tags: ['特效'],
    description: '支持丰富特效与快速视频玩法。',
    capabilities: videoCapabilities({ audio: 'unsupported', modes: IMAGE_MODES }),
  }),

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

export function modelOutputOptions(modelId: string): VideoModelCapabilities | null {
  const model = MODELS_BY_ID.get(modelId)
  return model?.media === 'video' ? (model.capabilities ?? null) : null
}

/**
 * Normalize persisted or imported output parameters against the selected
 * model. This runs in both the UI and compiler so old drafts cannot submit a
 * capability combination that the current registry no longer exposes.
 */
export function normalizeOutputForModel(
  modelId: string,
  output: OutputSpec | undefined,
  currentlyAvailableModes?: readonly VideoGenerationMode[],
): OutputSpec {
  const next = { ...(output ?? {}) }
  const capabilities = modelOutputOptions(modelId)
  if (!capabilities) return next

  const { defaults } = capabilities
  next.aspectRatio = capabilities.aspectRatios.includes(next.aspectRatio as ModelAspectRatio)
    ? next.aspectRatio
    : defaults.aspectRatio
  next.resolution = capabilities.resolutions.includes(next.resolution as ModelResolution)
    ? next.resolution
    : defaults.resolution
  next.durationSeconds = capabilities.durationsSeconds.includes(next.durationSeconds ?? Number.NaN)
    ? next.durationSeconds
    : defaults.durationSeconds
  next.count = capabilities.counts.includes(next.count as ModelCount) ? next.count : defaults.count

  if (capabilities.audio === 'required') next.withAudio = true
  else if (capabilities.audio === 'unsupported') next.withAudio = false
  else next.withAudio = Boolean(next.withAudio)

  const available = currentlyAvailableModes
    ? capabilities.modes.filter((mode) => currentlyAvailableModes.includes(mode))
    : capabilities.modes
  const fallback = available.includes(defaults.mode) ? defaults.mode : (available.at(-1) ?? defaults.mode)
  next.mode = next.mode && available.includes(next.mode) ? next.mode : fallback

  return next
}

export const DEFAULT_MODEL: Record<ModelMedia, string> = {
  image: 'lib-image-2',
  video: 'seedance-2-5',
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
