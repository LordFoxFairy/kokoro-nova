import { VOICES, type VoicePreset } from './libraries'
import { audioModelOutputOptions } from './models'
import type { OutputSpec } from './types'

export type AudioLanguage = 'zh' | 'en'
export type AudioSampleRate = '8k' | '16k' | '24k' | '48k'
export type AudioFormat = 'wav' | 'mp3' | 'pcm' | 'ogg_opus'
export type AudioSoundEffect = 'none' | 'echo' | 'hall' | 'telephone' | 'electronic'
export type AudioStability = 'lively' | 'natural' | 'steady'
export type MurekaMode = 'description' | 'lyrics'
export type AudioModelFamily = 'multimodal' | 'tts-minimax' | 'tts-eleven' | 'music-eleven' | 'music-mureka'

export interface AudioSettings {
  language: AudioLanguage
  sampleRate: AudioSampleRate
  format: AudioFormat
  voiceId: string
  speed: number
  pitch: number
  volume: number
  effectPitch: number
  effectStrength: number
  timbre: number
  soundEffect: AudioSoundEffect
  stability: AudioStability
  musicDurationSeconds: number
  murekaMode: MurekaMode
  instrumental: boolean
}

export interface AudioModelCapabilities {
  family: AudioModelFamily
  maxCharacters: number
  acceptsReferences: readonly ('text' | 'audio')[]
  supportsVoice: boolean
  supportsPauseTokens: boolean
  supportsCueTokens: boolean
  defaults: AudioSettings
}

export interface LocalVoice extends VoicePreset {
  source: 'custom'
  createdAt: string
}

export interface AudioAuthoringState {
  schemaVersion: 1
  settings: AudioSettings
  favoriteVoiceIds: string[]
  customVoices: LocalVoice[]
  advancedOpen: boolean
}

export const AUDIO_LANGUAGES = ['zh', 'en'] as const satisfies readonly AudioLanguage[]
export const AUDIO_SAMPLE_RATES = ['8k', '16k', '24k', '48k'] as const satisfies readonly AudioSampleRate[]
export const AUDIO_FORMATS = ['wav', 'mp3', 'pcm', 'ogg_opus'] as const satisfies readonly AudioFormat[]
export const AUDIO_SOUND_EFFECTS = ['none', 'echo', 'hall', 'telephone', 'electronic'] as const satisfies readonly AudioSoundEffect[]
export const AUDIO_STABILITIES = ['lively', 'natural', 'steady'] as const satisfies readonly AudioStability[]
export const MUREKA_MODES = ['description', 'lyrics'] as const satisfies readonly MurekaMode[]
export const AUDIO_MUSIC_DURATIONS = [30, 60, 120] as const

export const BASE_AUDIO_SETTINGS: AudioSettings = {
  language: 'zh',
  sampleRate: '24k',
  format: 'wav',
  voiceId: 'voice-girl',
  speed: 1,
  pitch: 0,
  volume: 1,
  effectPitch: 0,
  effectStrength: 0,
  timbre: 0,
  soundEffect: 'none',
  stability: 'natural',
  musicDurationSeconds: 30,
  murekaMode: 'description',
  instrumental: true,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, finiteOr(value, fallback)))
}

function validVoice(value: unknown): value is VoicePreset {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.language === 'string' &&
    typeof value.accent === 'string' &&
    ['男', '女', '中性', 'Character'].includes(String(value.gender)) &&
    ['儿童', '青年', '成年', '老年'].includes(String(value.age)) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === 'string')
  )
}

function validLocalVoice(value: unknown): value is LocalVoice {
  return (
    validVoice(value) &&
    isRecord(value) &&
    value.source === 'custom' &&
    typeof value.createdAt === 'string' &&
    !Number.isNaN(Date.parse(value.createdAt))
  )
}

function hasCompleteSettings(value: unknown): value is AudioSettings {
  if (!isRecord(value)) return false
  return (
    isOneOf(value.language, AUDIO_LANGUAGES) &&
    isOneOf(value.sampleRate, AUDIO_SAMPLE_RATES) &&
    isOneOf(value.format, AUDIO_FORMATS) &&
    typeof value.voiceId === 'string' &&
    typeof value.speed === 'number' &&
    typeof value.pitch === 'number' &&
    typeof value.volume === 'number' &&
    typeof value.effectPitch === 'number' &&
    typeof value.effectStrength === 'number' &&
    typeof value.timbre === 'number' &&
    isOneOf(value.soundEffect, AUDIO_SOUND_EFFECTS) &&
    isOneOf(value.stability, AUDIO_STABILITIES) &&
    typeof value.musicDurationSeconds === 'number' &&
    isOneOf(value.murekaMode, MUREKA_MODES) &&
    typeof value.instrumental === 'boolean'
  )
}

export function defaultAudioAuthoringState(modelId = 'seed-audio-1'): AudioAuthoringState {
  const defaults = audioModelOutputOptions(modelId)?.defaults ?? BASE_AUDIO_SETTINGS
  return {
    schemaVersion: 1,
    settings: { ...BASE_AUDIO_SETTINGS, ...defaults },
    favoriteVoiceIds: [],
    customVoices: [],
    advancedOpen: false,
  }
}

export function normalizeAudioAuthoringForModel(
  modelId: string,
  state: AudioAuthoringState,
): AudioAuthoringState {
  const defaults = audioModelOutputOptions(modelId)?.defaults ?? BASE_AUDIO_SETTINGS
  const settings: Record<string, unknown> = isRecord(state.settings) ? state.settings : {}
  const customVoices = Array.isArray(state.customVoices)
    ? state.customVoices.filter(validLocalVoice).map((voice) => ({ ...voice, tags: [...voice.tags] }))
    : []
  const validVoiceIds = new Set([...VOICES.map((voice) => voice.id), ...customVoices.map((voice) => voice.id)])
  const favoriteVoiceIds = Array.isArray(state.favoriteVoiceIds)
    ? [...new Set(state.favoriteVoiceIds.filter((id): id is string => typeof id === 'string' && validVoiceIds.has(id)))]
    : []
  const requestedDuration = finiteOr(settings.musicDurationSeconds, defaults.musicDurationSeconds)

  return {
    schemaVersion: 1,
    settings: {
      language: isOneOf(settings.language, AUDIO_LANGUAGES) ? settings.language : defaults.language,
      sampleRate: isOneOf(settings.sampleRate, AUDIO_SAMPLE_RATES) ? settings.sampleRate : defaults.sampleRate,
      format: isOneOf(settings.format, AUDIO_FORMATS) ? settings.format : defaults.format,
      voiceId:
        typeof settings.voiceId === 'string' && validVoiceIds.has(settings.voiceId)
          ? settings.voiceId
          : defaults.voiceId,
      speed: clamp(settings.speed, 0.5, 2, defaults.speed),
      pitch: clamp(settings.pitch, -12, 12, defaults.pitch),
      volume: clamp(settings.volume, 0, 2, defaults.volume),
      effectPitch: clamp(settings.effectPitch, -100, 100, defaults.effectPitch),
      effectStrength: clamp(settings.effectStrength, -100, 100, defaults.effectStrength),
      timbre: clamp(settings.timbre, -100, 100, defaults.timbre),
      soundEffect: isOneOf(settings.soundEffect, AUDIO_SOUND_EFFECTS)
        ? settings.soundEffect
        : defaults.soundEffect,
      stability: isOneOf(settings.stability, AUDIO_STABILITIES) ? settings.stability : defaults.stability,
      musicDurationSeconds: AUDIO_MUSIC_DURATIONS.includes(requestedDuration as (typeof AUDIO_MUSIC_DURATIONS)[number])
        ? requestedDuration
        : defaults.musicDurationSeconds,
      murekaMode: isOneOf(settings.murekaMode, MUREKA_MODES) ? settings.murekaMode : defaults.murekaMode,
      instrumental:
        typeof settings.instrumental === 'boolean' ? settings.instrumental : defaults.instrumental,
    },
    favoriteVoiceIds,
    customVoices,
    advancedOpen: Boolean(state.advancedOpen),
  }
}

/**
 * Project the replayable v1 authoring state into the immutable provider
 * contract. Only controls supported by the active family cross that boundary;
 * dormant values stay in `extra.audioAuthoring` for later model switches.
 */
export function audioExecutionOutput(
  modelId: string,
  state: AudioAuthoringState,
): OutputSpec {
  const family = audioModelOutputOptions(modelId)?.family
  const settings = normalizeAudioAuthoringForModel(modelId, state).settings

  switch (family) {
    case 'multimodal':
      return {
        language: settings.language,
        sampleRate: settings.sampleRate,
        format: settings.format,
      }
    case 'tts-minimax':
      return {
        voiceId: settings.voiceId,
        speed: settings.speed,
        pitch: settings.pitch,
        volume: settings.volume,
        effectPitch: settings.effectPitch,
        effectStrength: settings.effectStrength,
        timbre: settings.timbre,
        soundEffect: settings.soundEffect,
      }
    case 'tts-eleven':
      return {
        voiceId: settings.voiceId,
        stability: settings.stability,
      }
    case 'music-eleven':
      return { durationSeconds: settings.musicDurationSeconds }
    case 'music-mureka':
      return {
        durationSeconds: settings.musicDurationSeconds,
        murekaMode: settings.murekaMode,
        ...(settings.murekaMode === 'description'
          ? { instrumental: settings.instrumental }
          : {}),
      }
    default:
      return {}
  }
}

export function readAudioAuthoringState(
  extra: Record<string, unknown> | undefined,
  modelId: string,
): AudioAuthoringState {
  const candidate = extra?.audioAuthoring
  if (!isRecord(candidate) || candidate.schemaVersion !== 1 || !hasCompleteSettings(candidate.settings)) {
    return defaultAudioAuthoringState(modelId)
  }
  if (
    !Array.isArray(candidate.favoriteVoiceIds) ||
    !candidate.favoriteVoiceIds.every((id) => typeof id === 'string') ||
    !Array.isArray(candidate.customVoices) ||
    !candidate.customVoices.every(validLocalVoice) ||
    typeof candidate.advancedOpen !== 'boolean'
  ) {
    return defaultAudioAuthoringState(modelId)
  }
  return normalizeAudioAuthoringForModel(modelId, candidate as unknown as AudioAuthoringState)
}

export function insertAudioToken(
  prompt: string,
  selectionStart: number,
  selectionEnd: number,
  token: string,
): { prompt: string; caret: number } {
  const start = Math.max(0, Math.min(prompt.length, Math.trunc(selectionStart)))
  const end = Math.max(start, Math.min(prompt.length, Math.trunc(selectionEnd)))
  return {
    prompt: `${prompt.slice(0, start)}${token}${prompt.slice(end)}`,
    caret: start + token.length,
  }
}

export function canGenerateClonedVoice(input: {
  hasRecording: boolean
  consent: boolean
  name: string
}): boolean {
  return input.hasRecording && input.consent && input.name.trim().length > 0
}
