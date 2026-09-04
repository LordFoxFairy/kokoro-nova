import { describe, expect, it } from 'vitest'

import {
  audioExecutionOutput,
  canGenerateClonedVoice,
  defaultAudioAuthoringState,
  insertAudioToken,
  normalizeAudioAuthoringForModel,
  readAudioAuthoringState,
} from '@/domain/audio-authoring'
import { WorkflowNodeSchema } from '@/contracts/local'
import { createNode, emptyDocument } from '@/domain/factory'
import { PARALINGUISTIC_CUES, PAUSE_PRESETS, VOICES } from '@/domain/libraries'
import { audioModelOutputOptions, modelsFor } from '@/domain/models'
import { applyMutations } from '@/domain/mutations'
import { canvasReferenceCandidates, toggleCanvasReference } from '@/domain/video-references'
import type { CanvasMutation, WorkflowNode } from '@/domain/types'

function build(nodes: WorkflowNode[], mutations: CanvasMutation[] = []) {
  return applyMutations(emptyDocument(), [
    ...nodes.map((node): CanvasMutation => ({ op: 'addNode', node })),
    ...mutations,
  ])
}

describe('observed audio model catalogue', () => {
  it('freezes the six official audio models in visible order', () => {
    expect(
      modelsFor('audio').map((model) => [
        model.id,
        model.label,
        model.description,
        audioModelOutputOptions(model.id)?.family,
        audioModelOutputOptions(model.id)?.maxCharacters,
        model.baseCredits,
      ]),
    ).toEqual([
      [
        'seed-audio-1',
        'Seed Audio 1.0',
        '多模态音频生成，支持人声、音效、音乐一体化创作',
        'multimodal',
        2_000,
        1,
      ],
      [
        'minimax-speech-2.8-hd',
        'Minimax-speech-2.8-hd',
        '文字转语音，多元的情绪渲染',
        'tts-minimax',
        50_000,
        1,
      ],
      [
        'minimax-speech-2.8-turbo',
        'Minimax-speech-2.8-turbo',
        '文字转语音，快速生成自然的音频效果',
        'tts-minimax',
        50_000,
        1,
      ],
      [
        'eleven-v3',
        'Eleven V3',
        '文字转语音，提供高质量、可定制的语音',
        'tts-eleven',
        5_000,
        2,
      ],
      [
        'eleven-music-v3',
        'Eleven Music V3',
        '智能音乐生成，高质量音乐生成',
        'music-eleven',
        5_000,
        60,
      ],
      [
        'mureka-v8',
        'Mureka V8',
        '智能音乐生成，兼具多元风格与自然人声',
        'music-mureka',
        1_024,
        60,
      ],
    ])
    expect(new Set(modelsFor('audio').map((model) => model.id)).size).toBe(6)
    expect(modelsFor('audio').every((model) => audioModelOutputOptions(model.id))).toBe(true)
  })

  it('records exact model-family defaults and supported authoring tools', () => {
    expect(audioModelOutputOptions('seed-audio-1')).toMatchObject({
      family: 'multimodal',
      acceptsReferences: ['text', 'audio'],
      supportsVoice: false,
      supportsPauseTokens: false,
      supportsCueTokens: false,
      defaults: { language: 'zh', sampleRate: '24k', format: 'wav' },
    })
    expect(audioModelOutputOptions('minimax-speech-2.8-hd')).toMatchObject({
      family: 'tts-minimax',
      supportsVoice: true,
      supportsPauseTokens: true,
      supportsCueTokens: true,
      defaults: { voiceId: 'voice-girl', speed: 1, pitch: 0, volume: 1 },
    })
    expect(audioModelOutputOptions('eleven-v3')).toMatchObject({
      family: 'tts-eleven',
      supportsVoice: true,
      supportsPauseTokens: false,
      supportsCueTokens: false,
      defaults: { voiceId: 'voice-jin', stability: 'natural' },
    })
    expect(audioModelOutputOptions('mureka-v8')).toMatchObject({
      family: 'music-mureka',
      defaults: { musicDurationSeconds: 30, murekaMode: 'description', instrumental: true },
    })
  })
})

describe('audio authoring state', () => {
  it('seeds every new audio node with the default model and v1 state', () => {
    const node = createNode('audio', { x: 10, y: 20 }, [], { id: 'node_audio_fixture' })

    expect(node).toMatchObject({
      id: 'node_audio_fixture',
      type: 'audio',
      data: {
        prompt: '',
        modelId: 'seed-audio-1',
        output: { language: 'zh', sampleRate: '24k', format: 'wav' },
        extra: { audioAuthoring: defaultAudioAuthoringState('seed-audio-1') },
      },
    })
  })

  it('creates a complete serializable v1 state for the selected model', () => {
    expect(defaultAudioAuthoringState('seed-audio-1')).toEqual({
      schemaVersion: 1,
      settings: {
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
      },
      favoriteVoiceIds: [],
      customVoices: [],
      advancedOpen: false,
    })
  })

  it('keeps valid imported state while clamping invalid ranges and enums', () => {
    const base = defaultAudioAuthoringState('minimax-speech-2.8-hd')
    const normalized = normalizeAudioAuthoringForModel('minimax-speech-2.8-hd', {
      ...base,
      settings: {
        ...base.settings,
        language: 'en',
        sampleRate: '48k',
        format: 'mp3',
        voiceId: 'voice-young-elite',
        speed: 9,
        pitch: -100,
        volume: Number.NaN,
        effectPitch: 120,
        effectStrength: -140,
        timbre: 24,
        soundEffect: 'telephone',
        stability: 'steady',
        musicDurationSeconds: 999,
        murekaMode: 'lyrics',
        instrumental: false,
      },
      favoriteVoiceIds: ['voice-girl', 'voice-girl', 'missing'],
    })

    expect(normalized.settings).toEqual({
      language: 'en',
      sampleRate: '48k',
      format: 'mp3',
      voiceId: 'voice-young-elite',
      speed: 2,
      pitch: -12,
      volume: 1,
      effectPitch: 100,
      effectStrength: -100,
      timbre: 24,
      soundEffect: 'telephone',
      stability: 'steady',
      musicDurationSeconds: 30,
      murekaMode: 'lyrics',
      instrumental: false,
    })
    expect(normalized.favoriteVoiceIds).toEqual(['voice-girl'])
  })

  it('strictly reads v1 metadata and migrates missing or malformed values to defaults', () => {
    const valid = defaultAudioAuthoringState('eleven-v3')
    valid.advancedOpen = true
    valid.settings.voiceId = 'voice-jin'

    expect(readAudioAuthoringState({ audioAuthoring: valid }, 'eleven-v3')).toEqual(valid)
    expect(readAudioAuthoringState({}, 'eleven-v3')).toEqual(defaultAudioAuthoringState('eleven-v3'))
    expect(
      readAudioAuthoringState(
        {
          audioAuthoring: {
            schemaVersion: 2,
            settings: { language: 'fr', voiceId: 4 },
            favoriteVoiceIds: 'all',
          },
        },
        'eleven-v3',
      ),
    ).toEqual(defaultAudioAuthoringState('eleven-v3'))
  })

  it('projects only the active model family settings into provider output', () => {
    const seed = defaultAudioAuthoringState('seed-audio-1')
    seed.settings = { ...seed.settings, language: 'en', sampleRate: '48k', format: 'mp3' }
    expect(audioExecutionOutput('seed-audio-1', seed)).toEqual({
      language: 'en',
      sampleRate: '48k',
      format: 'mp3',
    })

    const minimax = defaultAudioAuthoringState('minimax-speech-2.8-hd')
    minimax.settings = {
      ...minimax.settings,
      speed: 1.25,
      pitch: 2,
      volume: 0.8,
      effectPitch: 8,
      effectStrength: 12,
      timbre: -4,
      soundEffect: 'telephone',
    }
    expect(audioExecutionOutput('minimax-speech-2.8-hd', minimax)).toEqual({
      voiceId: 'voice-girl',
      speed: 1.25,
      pitch: 2,
      volume: 0.8,
      effectPitch: 8,
      effectStrength: 12,
      timbre: -4,
      soundEffect: 'telephone',
    })

    const eleven = defaultAudioAuthoringState('eleven-v3')
    eleven.settings = { ...eleven.settings, stability: 'steady' }
    expect(audioExecutionOutput('eleven-v3', eleven)).toEqual({
      voiceId: 'voice-jin',
      stability: 'steady',
    })

    const music = defaultAudioAuthoringState('eleven-music-v3')
    music.settings = { ...music.settings, musicDurationSeconds: 60 }
    expect(audioExecutionOutput('eleven-music-v3', music)).toEqual({ durationSeconds: 60 })

    const mureka = defaultAudioAuthoringState('mureka-v8')
    mureka.settings = { ...mureka.settings, musicDurationSeconds: 120, instrumental: false }
    expect(audioExecutionOutput('mureka-v8', mureka)).toEqual({
      durationSeconds: 120,
      murekaMode: 'description',
      instrumental: false,
    })
    mureka.settings.murekaMode = 'lyrics'
    expect(audioExecutionOutput('mureka-v8', mureka)).toEqual({
      durationSeconds: 120,
      murekaMode: 'lyrics',
    })
  })

  it('validates audio metadata at the local Canvas contract boundary', () => {
    const node = createNode('audio', { x: 0, y: 0 })
    expect(WorkflowNodeSchema.safeParse(node).success).toBe(true)

    const invalidEnum = structuredClone(node)
    ;(invalidEnum.data.extra?.audioAuthoring as { settings: { format: string } }).settings.format = 'flac'
    expect(WorkflowNodeSchema.safeParse(invalidEnum).success).toBe(false)

    const invalidRange = structuredClone(node)
    ;(invalidRange.data.extra?.audioAuthoring as { settings: { speed: number } }).settings.speed = 9
    expect(WorkflowNodeSchema.safeParse(invalidRange).success).toBe(false)

    const invalidVersion = structuredClone(node)
    ;(invalidVersion.data.extra?.audioAuthoring as { schemaVersion: number }).schemaVersion = 2
    expect(WorkflowNodeSchema.safeParse(invalidVersion).success).toBe(false)

    const duplicateFavorites = structuredClone(node)
    ;(duplicateFavorites.data.extra?.audioAuthoring as { favoriteVoiceIds: string[] }).favoriteVoiceIds = [
      'voice-girl',
      'voice-girl',
    ]
    expect(WorkflowNodeSchema.safeParse(duplicateFavorites).success).toBe(false)
  })
})

describe('audio canvas references', () => {
  it('accepts text and audio sources while rejecting incompatible media', () => {
    const text = createNode('text', { x: 0, y: 0 }, [], { id: 'nd_audio_text' })
    const audio = createNode('audio', { x: 0, y: 400 }, [], { id: 'nd_audio_source' })
    const image = createNode('image', { x: 0, y: 800 }, [], { id: 'nd_audio_image' })
    const target = createNode('audio', { x: 600, y: 0 }, [], { id: 'nd_audio_target' })
    const document = build([text, audio, image, target])

    expect(
      canvasReferenceCandidates(document, target.id).map((candidate) => ({
        id: candidate.node.id,
        selectable: candidate.selectable,
        reason: candidate.reason,
      })),
    ).toEqual([
      { id: text.id, selectable: true, reason: null },
      { id: audio.id, selectable: true, reason: null },
      { id: image.id, selectable: false, reason: '音频节点不接受图片输入' },
    ])

    const withText = applyMutations(document, toggleCanvasReference(document, target.id, text.id))
    const withBoth = applyMutations(withText, toggleCanvasReference(withText, target.id, audio.id))
    expect(withBoth.edges.map((edge) => [edge.source, edge.target])).toEqual([
      [text.id, target.id],
      [audio.id, target.id],
    ])
  })
})

describe('TTS markers and local voice prerequisites', () => {
  it('freezes all observed pause and paralinguistic presets without duplicates', () => {
    expect(PAUSE_PRESETS).toEqual([0.25, 0.5, 1, 1.5])
    expect(PARALINGUISTIC_CUES).toEqual([
      '笑声',
      '轻笑',
      '咳嗽',
      '清嗓子',
      '正常换气',
      '喘气',
      '吸气',
      '呼气',
      '倒吸气',
      '吸鼻子',
      '叹气',
      '喷鼻息',
      '打嗝',
      '咂嘴',
      '哼唱',
      '嘶嘶声',
      '嗯',
      '口哨',
      '喷嚏',
      '抽泣',
      '鼓掌',
    ])
    expect(new Set(PARALINGUISTIC_CUES).size).toBe(21)
  })

  it('inserts a marker over the active selection and returns the next caret', () => {
    expect(insertAudioToken('开场这里结束', 2, 4, '<#0.25#>')).toEqual({
      prompt: '开场<#0.25#>结束',
      caret: 10,
    })
    expect(insertAudioToken('对白', 2, 2, '(喘气)')).toEqual({ prompt: '对白(喘气)', caret: 6 })
    expect(insertAudioToken('对白', -10, 99, '(笑声)')).toEqual({ prompt: '(笑声)', caret: 4 })
  })

  it('requires a named recording and explicit consent before local clone generation', () => {
    expect(canGenerateClonedVoice({ hasRecording: false, consent: true, name: '我的音色' })).toBe(false)
    expect(canGenerateClonedVoice({ hasRecording: true, consent: false, name: '我的音色' })).toBe(false)
    expect(canGenerateClonedVoice({ hasRecording: true, consent: true, name: '   ' })).toBe(false)
    expect(canGenerateClonedVoice({ hasRecording: true, consent: true, name: '我的音色' })).toBe(true)
  })

  it('provides the exact 20-row public voice fixture needed by page one', () => {
    expect(VOICES).toHaveLength(20)
    expect(VOICES.map((voice) => voice.name)).toEqual([
      '青涩青年音色',
      '精英青年音色',
      '霸道青年音色',
      '青年大学生音色',
      '少女音色',
      '御姐音色',
      '成熟女性音色',
      '甜美女性音色',
      '青涩青年音色-beta',
      '精英青年音色-beta',
      '霸道青年音色-beta',
      '青年大学生音色-beta',
      '少女音色-beta',
      '御姐音色-beta',
      '成熟女性音色-beta',
      '甜美女性音色-beta',
      '聪明男童',
      '可爱男童',
      '萌萌女童',
      '卡通猪小琪',
    ])
    expect(new Set(VOICES.map((voice) => voice.id)).size).toBe(20)
  })
})
