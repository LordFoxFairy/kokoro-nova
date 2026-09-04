import { describe, expect, it } from 'vitest'

import { defaultAudioAuthoringState } from '@/domain/audio-authoring'
import { createNode, emptyDocument } from '@/domain/factory'
import { modelsFor, textModelOutputOptions } from '@/domain/models'
import { applyMutations } from '@/domain/mutations'
import {
  defaultTextAuthoringState,
  normalizeTextAuthoringState,
  readTextAuthoringState,
  textDocumentPlainText,
  textProviderParams,
  type TextAuthoringState,
} from '@/domain/text-authoring'
import {
  TEXT_STARTER_PROMPTS,
  createTextStarterMutations,
} from '@/domain/text-workflows'

describe('observed text model catalogue', () => {
  it('freezes the four official models in visible order', () => {
    expect(
      modelsFor('text').map((model) => [
        model.id,
        model.label,
        model.latencyLabel,
        model.description,
      ]),
    ).toEqual([
      ['gvlm-3.1', 'GVLM 3.1', '20s', '多模态文本模型Pro'],
      ['cvlm-5.5', 'CVLM 5.5', '10s', '超智能大语言模型'],
      ['gvlm-3.1-flash', 'GVLM 3.1 Flash', '15s', '多模态文本模型lite'],
      ['qwen-3-vl-flash', 'Qwen 3 VL Flash', '10s', 'Qwen 3 VL Flash'],
    ])
    expect(modelsFor('text').every((model) => textModelOutputOptions(model.id))).toBe(true)
    expect(new Set(modelsFor('text').map((model) => model.id)).size).toBe(4)
  })

  it('publishes the confirmed provider projection for the default model', () => {
    expect(textModelOutputOptions('gvlm-3.1')).toEqual({
      family: 'multimodal',
      maxCharacters: 20_000,
      acceptsReferences: ['text', 'image'],
      providerModelId: 'aurora-3-prime',
      scene: 'text-generate',
      supportsTranslation: true,
    })
  })
})

describe('TextAuthoringState v1', () => {
  it('starts in generator mode with one safe empty paragraph', () => {
    expect(defaultTextAuthoringState()).toEqual({
      schemaVersion: 1,
      mode: 'generator',
      intent: null,
      document: {
        background: 'charcoal',
        blocks: [{ id: 'block-1', kind: 'paragraph', text: '', marks: [] }],
      },
      translationEnabled: false,
      expanded: false,
    })
  })

  it('rejects partial imported state and normalizes unsafe or duplicate block data', () => {
    expect(readTextAuthoringState({ textAuthoring: { schemaVersion: 1 } })).toEqual(
      defaultTextAuthoringState(),
    )

    const dirty = {
      schemaVersion: 1,
      mode: 'document',
      intent: 'free',
      document: {
        background: 'paper',
        blocks: [
          { id: 'same', kind: 'heading-1', text: '<img src=x onerror=alert(1)>标题', marks: ['bold', 'bold'] },
          { id: 'same', kind: 'paragraph', text: '正文', marks: ['italic', 'script'] },
          { id: 'bad', kind: 'iframe', text: '危险', marks: [] },
        ],
      },
      translationEnabled: 1,
      expanded: true,
    } as unknown as TextAuthoringState

    expect(normalizeTextAuthoringState(dirty)).toEqual({
      schemaVersion: 1,
      mode: 'document',
      intent: 'free',
      document: {
        background: 'paper',
        blocks: [
          { id: 'same', kind: 'heading-1', text: '<img src=x onerror=alert(1)>标题', marks: ['bold'] },
          { id: 'same-2', kind: 'paragraph', text: '正文', marks: ['italic'] },
        ],
      },
      translationEnabled: false,
      expanded: true,
    })
  })

  it('projects only visible document content to plain text', () => {
    const state = defaultTextAuthoringState()
    state.mode = 'document'
    state.document.blocks = [
      { id: 'a', kind: 'heading-1', text: '雨夜', marks: ['bold'] },
      { id: 'b', kind: 'bullet-list', text: '霓虹街道', marks: [] },
      { id: 'c', kind: 'divider', text: '', marks: [] },
      { id: 'd', kind: 'ordered-list', text: '人物入场', marks: ['italic'] },
      { id: 'e', kind: 'paragraph', text: '   ', marks: [] },
    ]

    expect(textDocumentPlainText(state)).toBe('雨夜\n霓虹街道\n人物入场')
  })

  it('maps generator and manual modes to explicit provider-safe params', () => {
    const generator = defaultTextAuthoringState()
    generator.intent = 'caption'
    expect(textProviderParams('分析这张图片', 'gvlm-3.1', generator)).toEqual({
      action: 'text_generate',
      generatorType: 'default',
      content: [],
      params: {
        prompt: '分析这张图片',
        model: 'aurora-3-prime',
        count: 1,
        scene: 'text-generate',
        textList: [],
        imageList: [],
        videoList: [],
        audioList: [],
      },
    })

    const document = defaultTextAuthoringState()
    document.mode = 'document'
    document.intent = 'free'
    document.document.blocks = [
      { id: 'a', kind: 'paragraph', text: '本地占位调研', marks: [] },
    ]
    expect(textProviderParams('', 'gvlm-3.1', document)).toMatchObject({
      action: 'text_resource',
      content: ['本地占位调研'],
      params: { prompt: '', model: 'aurora-3-prime', count: 1 },
    })
  })
})

describe('Text starter workflows', () => {
  function fixture() {
    const source = createNode('text', { x: 400, y: 300 }, [], {
      id: 'node_text_source',
      name: '文本节点 1',
    })
    const document = applyMutations(emptyDocument(), [{ op: 'addNode', node: source }])
    return { source, document }
  }

  it('switches free writing to a 350 x 200 manual document without adding graph objects', () => {
    const { source, document } = fixture()
    const result = createTextStarterMutations(document, source.id, 'free')
    const next = applyMutations(document, result.mutations)
    const text = next.nodes.find((node) => node.id === source.id)!

    expect(result.createdNodeIds).toEqual([source.id])
    expect(result.groupId).toBeNull()
    expect(next.nodes).toHaveLength(1)
    expect(next.edges).toHaveLength(0)
    expect(next.groups).toHaveLength(0)
    expect(text.size).toEqual({ width: 350, height: 200 })
    expect(readTextAuthoringState(text.data.extra)).toMatchObject({ mode: 'document', intent: 'free' })
  })

  it('materializes 文生视频 atomically with observed prompts and output defaults', () => {
    const { source, document } = fixture()
    const result = createTextStarterMutations(document, source.id, 'text2video')
    const next = applyMutations(document, result.mutations)
    const text = next.nodes.find((node) => node.id === source.id)!
    const video = next.nodes.find((node) => node.type === 'video')!

    expect(next.groups).toMatchObject([
      { id: result.groupId, name: '预设 - 文生视频', nodeIds: [source.id, video.id] },
    ])
    expect(next.edges).toMatchObject([{ source: source.id, target: video.id }])
    expect(text.data.prompt).toBe(TEXT_STARTER_PROMPTS.text2video)
    expect(readTextAuthoringState(text.data.extra).intent).toBe('text2video')
    expect(video.data).toMatchObject({
      prompt: '根据文字描述生成视频。',
      modelId: 'seedance-2-fast',
      output: {
        aspectRatio: '16:9',
        resolution: '720p',
        durationSeconds: 5,
        count: 1,
        withAudio: false,
        mode: 'text2video',
      },
    })
  })

  it('materializes 图片反推提示词 with an Image -> Text edge', () => {
    const { source, document } = fixture()
    const result = createTextStarterMutations(document, source.id, 'caption')
    const next = applyMutations(document, result.mutations)
    const text = next.nodes.find((node) => node.id === source.id)!
    const image = next.nodes.find((node) => node.type === 'image')!

    expect(next.groups[0]).toMatchObject({
      id: result.groupId,
      name: '预设 - 图片反推提示词',
      nodeIds: [image.id, source.id],
    })
    expect(next.edges).toMatchObject([{ source: image.id, target: source.id }])
    expect(text.data.prompt).toBe(TEXT_STARTER_PROMPTS.caption)
    expect(readTextAuthoringState(text.data.extra).intent).toBe('caption')
  })

  it('materializes 文字生音乐 with Mureka authoring state and a Text -> Audio edge', () => {
    const { source, document } = fixture()
    const result = createTextStarterMutations(document, source.id, 'text2music')
    const next = applyMutations(document, result.mutations)
    const text = next.nodes.find((node) => node.id === source.id)!
    const audio = next.nodes.find((node) => node.type === 'audio')!

    expect(next.groups[0]).toMatchObject({
      id: result.groupId,
      name: '预设 - 文字生音乐',
      nodeIds: [source.id, audio.id],
    })
    expect(next.edges).toMatchObject([{ source: source.id, target: audio.id }])
    expect(text.data.prompt).toBe(TEXT_STARTER_PROMPTS.text2music)
    expect(audio.data.modelId).toBe('mureka-v8')
    expect(audio.data.extra?.audioAuthoring).toEqual(defaultAudioAuthoringState('mureka-v8'))
  })
})
