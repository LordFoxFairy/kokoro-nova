import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import audioUpdate from '../../../docs/api/examples/canvas-audio-authoring-update-request.json'
import audioUpdateResponse from '../../../docs/api/examples/canvas-audio-authoring-update-response.json'
import audioModels from '../../../docs/api/examples/models-audio.response.json'
import { AudioModelCapabilitiesSchema } from '@/contracts/audio'
import {
  AudioAuthoringStateSchema,
  OutputSpecSchema,
  WorkflowDocumentSchema,
} from '@/contracts/local'
import { ModelCatalogResponseSchema } from '@/contracts/models'
import { createNode, emptyDocument } from '@/domain/factory'
import { MODEL_CATALOG_VERSION, modelsFor } from '@/domain/models'
import { applyMutations } from '@/domain/mutations'
import type { CanvasMutation } from '@/domain/types'

function openApi() {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'docs/api/openapi.yaml'), 'utf8'))
}

describe('Audio authoring API examples', () => {
  it('executes the documented authoring mutation and validates the complete v1 state', () => {
    const target = createNode('audio', { x: 80, y: 120 }, [], {
      id: 'node_audio_contract',
      name: '旁白音频',
    })
    const before = applyMutations(emptyDocument(), [{ op: 'addNode', node: target }])
    const after = applyMutations(before, audioUpdate.mutations as CanvasMutation[])
    const audio = after.nodes.find((node) => node.id === target.id)

    expect(audio?.data.modelId).toBe('minimax-speech-2.8-hd')
    expect(AudioAuthoringStateSchema.parse(audio?.data.extra?.audioAuthoring)).toEqual(
      audioUpdate.mutations[0].patch.data.extra.audioAuthoring,
    )
    expect(OutputSpecSchema.parse(audio?.data.output)).toEqual({
      voiceId: 'voice-custom-contract',
      speed: 1.08,
      pitch: 1,
      volume: 0.9,
      effectPitch: 8,
      effectStrength: 12,
      timbre: -4,
      soundEffect: 'none',
    })
  })

  it('validates the documented mutation response through the runtime workflow schema', () => {
    expect(audioUpdateResponse.revision).toBe(8)
    const document = WorkflowDocumentSchema.parse(audioUpdateResponse.document)
    const audio = document.nodes.find((node) => node.id === 'node_audio_contract')
    expect(AudioAuthoringStateSchema.parse(audio?.data.extra?.audioAuthoring).schemaVersion).toBe(1)
  })

  it('keeps the Audio model response aligned with the registry and runtime schema', () => {
    const parsed = ModelCatalogResponseSchema.parse(audioModels)
    expect(parsed.version).toBe(MODEL_CATALOG_VERSION)
    expect(parsed.media).toBe('audio')
    expect(parsed.items.map((model) => [model.id, model.label])).toEqual(
      modelsFor('audio').map((model) => [model.id, model.label]),
    )
    expect(parsed.items.every((model) => model.audioCapabilities?.acceptsReferences.join(',') === 'text,audio')).toBe(true)
  })

  it('publishes Audio state, voice and model capability schemas plus executable examples', () => {
    const document = openApi()
    expect(document.info.version).toBe('1.12.0-project-recycle-bin')
    expect(document.components.schemas.NodeExtra.properties.audioAuthoring.$ref).toBe(
      '#/components/schemas/AudioAuthoringState',
    )
    expect(document.components.schemas.ModelDefinition.properties.audioCapabilities.$ref).toBe(
      '#/components/schemas/AudioModelCapabilities',
    )
    expect(document.components.schemas.AudioAuthoringState.properties.settings.$ref).toBe(
      '#/components/schemas/AudioSettings',
    )
    expect(document.components.schemas.AudioAuthoringState.properties.customVoices.items.$ref).toBe(
      '#/components/schemas/AudioVoice',
    )
    expect(document.components.examples.AudioAuthoringUpdateRequestExample.externalValue).toBe(
      './examples/canvas-audio-authoring-update-request.json',
    )
    expect(document.components.examples.AudioAuthoringUpdateResponseExample.externalValue).toBe(
      './examples/canvas-audio-authoring-update-response.json',
    )
    expect(document.components.examples.AudioModelCatalogResponseExample.externalValue).toBe(
      './examples/models-audio.response.json',
    )
  })

  it('enforces OpenAPI uniqueItems semantics at the runtime boundary', () => {
    const state = AudioAuthoringStateSchema.parse(
      audioUpdate.mutations[0].patch.data.extra.audioAuthoring,
    )
    expect(
      AudioAuthoringStateSchema.safeParse({
        ...state,
        favoriteVoiceIds: ['voice-girl', 'voice-girl'],
      }).success,
    ).toBe(false)

    const capabilities = audioModels.items[0].audioCapabilities
    expect(
      AudioModelCapabilitiesSchema.safeParse({
        ...capabilities,
        acceptsReferences: ['text', 'text'],
      }).success,
    ).toBe(false)
  })
})
