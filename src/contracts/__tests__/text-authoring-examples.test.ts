import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import textUpdate from '../../../docs/api/examples/canvas-text-authoring-update-request.json'
import textStarter from '../../../docs/api/examples/canvas-text-starter-text2video.request.json'
import captionStarter from '../../../docs/api/examples/canvas-text-starter-caption.request.json'
import musicStarter from '../../../docs/api/examples/canvas-text-starter-music.request.json'
import textModels from '../../../docs/api/examples/models-text.response.json'
import { ArtifactSchema, TextAuthoringStateSchema } from '@/contracts/local'
import { ModelCatalogResponseSchema } from '@/contracts/models'
import { createNode, emptyDocument } from '@/domain/factory'
import { MODEL_CATALOG_VERSION, modelsFor } from '@/domain/models'
import { applyMutations } from '@/domain/mutations'
import { readTextAuthoringState } from '@/domain/text-authoring'
import type { CanvasMutation } from '@/domain/types'

function openApi() {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'docs/api/openapi.yaml'), 'utf8'))
}

function textFixture() {
  const text = createNode('text', { x: 400, y: 260 }, [], {
    id: 'node_text_contract',
    name: '文本节点 1',
  })
  return applyMutations(emptyDocument(), [{ op: 'addNode', node: text }])
}

describe('Text authoring API examples', () => {
  it('rejects duplicate block ids and documents over the aggregate character budget', () => {
    const base = {
      schemaVersion: 1 as const,
      mode: 'document' as const,
      intent: 'free' as const,
      document: {
        background: 'charcoal' as const,
        blocks: [
          { id: 'a', kind: 'paragraph' as const, text: '正文', marks: [] },
        ],
      },
      translationEnabled: false,
      expanded: false,
    }

    expect(TextAuthoringStateSchema.safeParse({
      ...base,
      document: {
        ...base.document,
        blocks: [base.document.blocks[0], { ...base.document.blocks[0], text: '重复' }],
      },
    }).success).toBe(false)

    expect(TextAuthoringStateSchema.safeParse({
      ...base,
      document: {
        ...base.document,
        blocks: [
          { ...base.document.blocks[0], text: '甲'.repeat(25_001) },
          { ...base.document.blocks[0], id: 'b', text: '乙'.repeat(25_000) },
        ],
      },
    }).success).toBe(false)
  })

  it('executes the documented manual-authoring mutation through the runtime schema', () => {
    const after = applyMutations(textFixture(), textUpdate.mutations as CanvasMutation[])
    const text = after.nodes.find((node) => node.id === 'node_text_contract')!

    expect(TextAuthoringStateSchema.parse(text.data.extra?.textAuthoring)).toEqual(
      textUpdate.mutations[0].patch.data.extra.textAuthoring,
    )
    expect(readTextAuthoringState(text.data.extra)).toMatchObject({
      mode: 'document',
      intent: 'free',
      document: { background: 'paper' },
    })
  })

  it('executes the documented starter as one complete graph mutation envelope', () => {
    const after = applyMutations(textFixture(), textStarter.mutations as CanvasMutation[])
    const video = after.nodes.find((node) => node.id === 'node_video_text_starter')!

    expect(after.nodes).toHaveLength(2)
    expect(after.edges).toMatchObject([
      { source: 'node_text_contract', target: 'node_video_text_starter' },
    ])
    expect(after.groups).toMatchObject([
      {
        id: 'group_text_to_video',
        name: '预设 - 文生视频',
        nodeIds: ['node_text_contract', 'node_video_text_starter'],
      },
    ])
    expect(video.data.output).toMatchObject({
      aspectRatio: '16:9',
      resolution: '720p',
      durationSeconds: 5,
      withAudio: false,
      mode: 'text2video',
    })
  })

  it('executes the caption and music starter examples with directional edges', () => {
    const caption = applyMutations(textFixture(), captionStarter.mutations as CanvasMutation[])
    expect(caption.edges).toMatchObject([
      { source: 'node_image_caption_source', target: 'node_text_contract' },
    ])
    expect(caption.groups[0].name).toBe('预设 - 图片反推提示词')

    const music = applyMutations(textFixture(), musicStarter.mutations as CanvasMutation[])
    const audio = music.nodes.find((node) => node.id === 'node_audio_music_target')!
    expect(music.edges).toMatchObject([
      { source: 'node_text_contract', target: 'node_audio_music_target' },
    ])
    expect(music.groups[0].name).toBe('预设 - 文字生音乐')
    expect(audio.data).toMatchObject({ modelId: 'mureka-v8', output: { durationSeconds: 30 } })
  })

  it('keeps the Text model example aligned with the versioned registry', () => {
    const parsed = ModelCatalogResponseSchema.parse(textModels)
    expect(parsed.version).toBe(MODEL_CATALOG_VERSION)
    expect(parsed.media).toBe('text')
    expect(parsed.items.map((model) => [model.id, model.label, model.latencyLabel])).toEqual(
      modelsFor('text').map((model) => [model.id, model.label, model.latencyLabel]),
    )
    expect(parsed.items.every((model) => model.textCapabilities?.scene === 'text-generate')).toBe(true)
  })

  it('round-trips inline generated text without requiring the .txt file fetch', () => {
    expect(
      ArtifactSchema.parse({
        id: 'artifact_text_contract',
        jobId: 'job_text_contract',
        kind: 'text',
        url: '/api/media/job_text_contract-0.txt',
        thumbnailUrl: null,
        width: null,
        height: null,
        durationSeconds: null,
        createdAt: '2026-09-03T12:00:00.000Z',
        modelId: 'gvlm-3.1',
        assetId: null,
        textContent: '确定性的本地文本结果',
      }).textContent,
    ).toBe('确定性的本地文本结果')
  })

  it('publishes Text state, model capabilities, inline artifact and executable examples', () => {
    const document = openApi()
    expect(document.info.version).toBe('1.12.0-project-recycle-bin')
    expect(document.components.schemas.NodeExtra.properties.textAuthoring.$ref).toBe(
      '#/components/schemas/TextAuthoringState',
    )
    expect(document.components.schemas.ModelDefinition.properties.textCapabilities.$ref).toBe(
      '#/components/schemas/TextModelCapabilities',
    )
    expect(document.components.schemas.Artifact.properties.textContent.type).toEqual(['string', 'null'])
    expect(document.components.examples.TextAuthoringUpdateRequestExample.externalValue).toBe(
      './examples/canvas-text-authoring-update-request.json',
    )
    expect(document.components.examples.TextStarterVideoRequestExample.externalValue).toBe(
      './examples/canvas-text-starter-text2video.request.json',
    )
    expect(document.components.examples.TextStarterCaptionRequestExample.externalValue).toBe(
      './examples/canvas-text-starter-caption.request.json',
    )
    expect(document.components.examples.TextStarterMusicRequestExample.externalValue).toBe(
      './examples/canvas-text-starter-music.request.json',
    )
    expect(document.components.examples.TextModelCatalogResponseExample.externalValue).toBe(
      './examples/models-text.response.json',
    )
  })
})
