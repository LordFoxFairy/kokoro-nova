import { z } from 'zod'

const IsoTimestampSchema = z.string().datetime()

/** Strict persisted settings shared by Canvas validation and model responses. */
export const AudioSettingsSchema = z
  .object({
    language: z.enum(['zh', 'en']),
    sampleRate: z.enum(['8k', '16k', '24k', '48k']),
    format: z.enum(['wav', 'mp3', 'pcm', 'ogg_opus']),
    voiceId: z.string().min(1),
    speed: z.number().finite().min(0.5).max(2),
    pitch: z.number().finite().min(-12).max(12),
    volume: z.number().finite().min(0).max(2),
    effectPitch: z.number().finite().min(-100).max(100),
    effectStrength: z.number().finite().min(-100).max(100),
    timbre: z.number().finite().min(-100).max(100),
    soundEffect: z.enum(['none', 'echo', 'hall', 'telephone', 'electronic']),
    stability: z.enum(['lively', 'natural', 'steady']),
    musicDurationSeconds: z.union([z.literal(30), z.literal(60), z.literal(120)]),
    murekaMode: z.enum(['description', 'lyrics']),
    instrumental: z.boolean(),
  })
  .strict()

export const AudioVoiceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    language: z.string().min(1),
    accent: z.string().min(1),
    gender: z.enum(['男', '女', '中性', 'Character']),
    age: z.enum(['儿童', '青年', '成年', '老年']),
    tags: z.array(z.string()),
    source: z.literal('custom'),
    createdAt: IsoTimestampSchema,
  })
  .strict()

const UniqueVoiceIdsSchema = z
  .array(z.string())
  .refine((ids) => new Set(ids).size === ids.length, { message: 'voice IDs must be unique' })

const UniqueAudioReferenceKindsSchema = z
  .array(z.enum(['text', 'audio']))
  .refine((kinds) => new Set(kinds).size === kinds.length, {
    message: 'audio reference kinds must be unique',
  })

export const AudioAuthoringStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    settings: AudioSettingsSchema,
    favoriteVoiceIds: UniqueVoiceIdsSchema,
    customVoices: z.array(AudioVoiceSchema),
    advancedOpen: z.boolean(),
  })
  .strict()

export const AudioModelCapabilitiesSchema = z
  .object({
    family: z.enum(['multimodal', 'tts-minimax', 'tts-eleven', 'music-eleven', 'music-mureka']),
    maxCharacters: z.number().int().positive(),
    acceptsReferences: UniqueAudioReferenceKindsSchema,
    supportsVoice: z.boolean(),
    supportsPauseTokens: z.boolean(),
    supportsCueTokens: z.boolean(),
    defaults: AudioSettingsSchema,
  })
  .strict()

export type AudioSettingsContract = z.infer<typeof AudioSettingsSchema>
export type AudioVoiceContract = z.infer<typeof AudioVoiceSchema>
export type AudioAuthoringStateContract = z.infer<typeof AudioAuthoringStateSchema>
