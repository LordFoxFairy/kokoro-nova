import { describe, expect, it } from 'vitest'

import { createNode, emptyDocument } from '@/domain/factory'
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_COUNTS,
  IMAGE_QUALITIES,
  IMAGE_RESOLUTIONS,
  imageModelOutputOptions,
  modelsFor,
  normalizeImageOutputForModel,
} from '@/domain/models'
import { applyMutations } from '@/domain/mutations'
import {
  canvasReferenceCandidates,
  toggleCanvasReference,
} from '@/domain/video-references'
import {
  createImageDerivedMutations,
  readImageTransformSpec,
  type ImageTransformRequest,
} from '@/domain/image-authoring'
import type { CanvasMutation, WorkflowDocument, WorkflowNode } from '@/domain/types'

function build(nodes: WorkflowNode[], mutations: CanvasMutation[] = []): WorkflowDocument {
  return applyMutations(emptyDocument(), [
    ...nodes.map((node): CanvasMutation => ({ op: 'addNode', node })),
    ...mutations,
  ])
}

describe('observed image model catalogue', () => {
  it('freezes the seven official image models in visible order', () => {
    expect(modelsFor('image').map((model) => [model.id, model.label, model.latencyLabel])).toEqual([
      ['lib-image-2', 'Lib Image', '60s'],
      ['lib-navo-pro', 'Lib Navo Pro', '50s'],
      ['lib-navo-2', 'Lib Navo 2', '25s'],
      ['seedream-5-pro', 'Seedream 5.0 Pro', '20s'],
      ['midjourney-v8-1', 'Midjourney V8.1', '50s'],
      ['midjourney-v7', 'Midjourney V7', '50s'],
      ['midjourney-niji-7', 'Midjourney Niji 7', '50s'],
    ])
    expect(new Set(modelsFor('image').map((model) => model.id)).size).toBe(7)
    expect(modelsFor('image').every((model) => imageModelOutputOptions(model.id))).toBe(true)
  })

  it('exposes the exact observed output option sets', () => {
    expect(IMAGE_QUALITIES).toEqual(['low', 'standard', 'high'])
    expect(IMAGE_RESOLUTIONS).toEqual(['1K', '2K', '4K'])
    expect(IMAGE_ASPECT_RATIOS).toEqual([
      '1:1',
      '1:2',
      '2:1',
      '9:16',
      '16:9',
      '3:4',
      '4:3',
      '3:2',
      '2:3',
      '5:4',
      '4:5',
      '21:9',
      '9:21',
    ])
    expect(IMAGE_COUNTS).toEqual([1, 2, 4])
  })

  it('keeps valid image output and clamps stale or cross-media values to model defaults', () => {
    expect(
      normalizeImageOutputForModel('lib-image-2', {
        quality: 'high',
        resolution: '4K',
        aspectRatio: '9:21',
        count: 4,
      }),
    ).toEqual({ quality: 'high', resolution: '4K', aspectRatio: '9:21', count: 4 })

    expect(
      normalizeImageOutputForModel('lib-navo-2', {
        quality: 'bogus' as never,
        resolution: '1080p',
        aspectRatio: 'auto',
        count: 3 as never,
        durationSeconds: 40,
        withAudio: true,
      }),
    ).toEqual({ quality: 'standard', resolution: '2K', aspectRatio: '16:9', count: 1 })
  })
})

describe('image canvas references', () => {
  it('uses the shared candidate engine for image targets and rejects incompatible media', () => {
    const sourceImage = createNode('image', { x: 0, y: 0 }, [], { id: 'nd_source_image' })
    const sourceStyle = createNode('style', { x: 0, y: 400 }, [], { id: 'nd_source_style' })
    const sourceAudio = createNode('audio', { x: 0, y: 800 }, [], { id: 'nd_source_audio' })
    const target = createNode('image', { x: 600, y: 0 }, [], { id: 'nd_target' })
    const document = build([sourceImage, sourceStyle, sourceAudio, target])

    expect(
      canvasReferenceCandidates(document, target.id).map((candidate) => ({
        id: candidate.node.id,
        selectable: candidate.selectable,
        reason: candidate.reason,
      })),
    ).toEqual([
      { id: sourceImage.id, selectable: true, reason: null },
      { id: sourceStyle.id, selectable: true, reason: null },
      { id: sourceAudio.id, selectable: false, reason: '图片节点不接受音频输入' },
    ])

    const connected = applyMutations(document, toggleCanvasReference(document, target.id, sourceImage.id))
    expect(connected.edges).toMatchObject([{ source: sourceImage.id, target: target.id }])
    expect(toggleCanvasReference(connected, target.id, sourceImage.id)).toEqual([
      { op: 'removeEdge', edgeId: connected.edges[0].id },
    ])
  })
})

describe('image transformation provenance', () => {
  it('derives a pending node with one source edge and a replayable typed transform spec', () => {
    const source = createNode('image', { x: 100, y: 200 }, [], {
      id: 'nd_source',
      name: '源图片',
    })
    source.data.prompt = '原始画面'
    const document = build([source])
    const sourceBefore = structuredClone(source)
    const request: ImageTransformRequest = {
      tool: 'lighting',
      label: '打光',
      prompt: '保持构图与主体不变，仅重建布光。',
      output: { quality: 'standard', resolution: '2K', aspectRatio: '16:9', count: 1 },
      credits: 22,
      parameters: { brightness: 12, temperature: -8, keyAngle: 45, rimLight: 40 },
    }

    const result = createImageDerivedMutations(document, source.id, request)
    const next = applyMutations(document, result.mutations)
    const derived = next.nodes.find((node) => node.id === result.node.id)

    expect(source).toEqual(sourceBefore)
    expect(derived).toMatchObject({
      type: 'image',
      name: '打光',
      data: {
        prompt: request.prompt,
        output: request.output,
        artifacts: [],
      },
    })
    expect(next.edges).toMatchObject([{ source: source.id, target: result.node.id }])
    expect(readImageTransformSpec(derived?.data.extra)).toEqual({
      version: 1,
      sourceNodeId: source.id,
      tool: 'lighting',
      label: '打光',
      parameters: request.parameters,
      output: request.output,
      credits: 22,
    })
  })

  it('returns null for malformed imported transform metadata', () => {
    expect(readImageTransformSpec(undefined)).toBeNull()
    expect(readImageTransformSpec({ imageTransform: { version: 2 } })).toBeNull()
    expect(readImageTransformSpec({ imageTransform: { version: 1, sourceNodeId: 3 } })).toBeNull()
    expect(readImageTransformSpec({
      imageTransform: {
        version: 1,
        sourceNodeId: 'nd_source',
        tool: 'upscale',
        label: '高清',
        parameters: {},
        output: { quality: 'ultra', resolution: '8K', aspectRatio: 'auto', count: 3 },
        credits: 12,
      },
    })).toBeNull()
    expect(readImageTransformSpec({
      imageTransform: {
        version: 1,
        sourceNodeId: 'nd_source',
        tool: 'lighting',
        label: '打光',
        parameters: { unsafeNestedValue: { nested: true } },
        output: { quality: 'standard', resolution: '2K', aspectRatio: '16:9', count: 1 },
        credits: 22,
      },
    })).toBeNull()
  })
})
