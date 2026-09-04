import { describe, expect, it } from 'vitest'

import addReference from '../../../docs/api/examples/canvas-image-reference-add.request.json'
import applyPreset from '../../../docs/api/examples/canvas-image-preset.request.json'
import applyStyle from '../../../docs/api/examples/canvas-image-style-apply.request.json'
import transformImage from '../../../docs/api/examples/canvas-image-transform.request.json'
import imageModels from '../../../docs/api/examples/models-image.response.json'
import { readImageTransformSpec } from '@/domain/image-authoring'
import { MODEL_CATALOG_VERSION, modelsFor } from '@/domain/models'
import { applyMutations } from '@/domain/mutations'
import type { CanvasMutation } from '@/domain/types'
import { buildVideoWorkspace } from '@/mocks/scenarios/video-project'
import { OutputSpecSchema } from '@/contracts/local'
import { ModelCatalogResponseSchema } from '@/contracts/models'

function fixtureDocument() {
  return buildVideoWorkspace('succeeded').canvases.find((canvas) => canvas.id === 'can_video_main')!.document
}

describe('Image authoring API examples', () => {
  it('round-trips the expanded image fields through runtime response schemas', () => {
    expect(OutputSpecSchema.parse({
      quality: 'low',
      resolution: '4K',
      aspectRatio: '9:21',
      count: 4,
    })).toEqual({ quality: 'low', resolution: '4K', aspectRatio: '9:21', count: 4 })

    const parsed = ModelCatalogResponseSchema.parse(imageModels)
    expect(parsed.items[0].imageCapabilities).toEqual(imageModels.items[0].imageCapabilities)
  })

  it('keeps the documented image model response aligned with the runtime registry', () => {
    expect(imageModels.version).toBe(MODEL_CATALOG_VERSION)
    expect(imageModels.media).toBe('image')
    expect(imageModels.items.map((model) => [model.id, model.label, model.latencyLabel])).toEqual(
      modelsFor('image').map((model) => [model.id, model.label, model.latencyLabel]),
    )
    expect(imageModels.items.every((model) => model.imageCapabilities.aspectRatios.length === 13)).toBe(true)
  })

  it('adds a graph reference using the shared canvas mutation transaction', () => {
    const before = {
      ...fixtureDocument(),
      edges: fixtureDocument().edges.filter((edge) => edge.id !== 'edge_text_image'),
    }
    const after = applyMutations(before, addReference.mutations as CanvasMutation[])

    expect(after.edges).toContainEqual(
      expect.objectContaining({ source: 'node_text_01', target: 'node_image_01' }),
    )
  })

  it('binds a style node and the inspectable style selection atomically', () => {
    const after = applyMutations(fixtureDocument(), applyStyle.mutations as CanvasMutation[])
    const image = after.nodes.find((node) => node.id === 'node_image_01')

    expect(after.nodes).toContainEqual(expect.objectContaining({ id: 'node_style_fixture', type: 'style' }))
    expect(after.edges).toContainEqual(
      expect.objectContaining({ source: 'node_style_fixture', target: 'node_image_01' }),
    )
    expect(image?.data.extra?.imageStyle).toEqual({
      nodeId: 'node_style_fixture',
      presetId: 'style-cine-teal',
      name: '电影青橙',
    })
  })

  it('persists a preset as prompt, exact output and semantic selection metadata', () => {
    const after = applyMutations(fixtureDocument(), applyPreset.mutations as CanvasMutation[])
    const image = after.nodes.find((node) => node.id === 'node_image_01')

    expect(image?.data.prompt).toContain('九宫格')
    expect(image?.data.output).toEqual({
      resolution: '4K',
      quality: 'high',
      count: 1,
      aspectRatio: '16:9',
    })
    expect(image?.data.extra?.imagePreset).toEqual({ id: 'slash-multicam-9', name: '多机位九宫格' })
  })

  it('creates a non-destructive derived node with replayable transform metadata', () => {
    const after = applyMutations(fixtureDocument(), transformImage.mutations as CanvasMutation[])
    const source = after.nodes.find((node) => node.id === 'node_image_01')
    const derived = after.nodes.find((node) => node.id === 'node_image_upscale_fixture')

    expect(source?.data.artifacts).toHaveLength(1)
    expect(after.edges).toContainEqual(
      expect.objectContaining({ source: 'node_image_01', target: 'node_image_upscale_fixture' }),
    )
    expect(readImageTransformSpec(derived?.data.extra)).toMatchObject({
      version: 1,
      sourceNodeId: 'node_image_01',
      tool: 'upscale',
      output: { resolution: '4K', quality: 'high', count: 1, aspectRatio: '16:9' },
    })
  })
})
