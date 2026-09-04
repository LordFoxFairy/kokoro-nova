import { describe, expect, it } from 'vitest'

import {
  appendClip,
  emptyCompositeDocument,
  type CompositeSource,
} from '@/domain/composite'
import type { Artifact, WorkflowDocument } from '@/domain/types'
import {
  collectSources,
  isExcludedCompositeSource,
  playheadValueForKey,
  sourceAspectRatio,
  sourceAspectRatioLabel,
  splitValidationMessage,
  trimPointsForDrag,
} from '../ClipEditor'

function artifact(id: string, kind: Artifact['kind'], width: number | null, height: number | null): Artifact {
  return {
    id,
    jobId: `job-${id}`,
    kind,
    url: `/media/${id}`,
    thumbnailUrl: null,
    width,
    height,
    durationSeconds: kind === 'video' ? 10 : null,
    createdAt: '2026-09-04T00:00:00.000Z',
    modelId: 'fixture-model',
    assetId: null,
  }
}

function source(id: string, duration = 10): CompositeSource {
  return {
    artifact: { ...artifact(id, 'video', 1280, 720), durationSeconds: duration },
    nodeId: `node-${id}`,
    nodeName: `镜头 ${id}`,
  }
}

function workflowWithSources(...nodes: WorkflowDocument['nodes']): WorkflowDocument {
  return {
    schemaVersion: 1,
    nodes,
    edges: [],
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

describe('ClipEditor timeline accessibility helpers', () => {
  it('moves the playhead by keyboard steps and clamps Home/End at the timeline bounds', () => {
    expect(playheadValueForKey(1, 'ArrowRight', 10)).toBeCloseTo(1.1)
    expect(playheadValueForKey(1, 'ArrowLeft', 10)).toBeCloseTo(0.9)
    expect(playheadValueForKey(4, 'PageUp', 10)).toBe(5)
    expect(playheadValueForKey(4, 'PageDown', 10)).toBe(3)
    expect(playheadValueForKey(4, 'Home', 10)).toBe(0)
    expect(playheadValueForKey(4, 'End', 10)).toBe(10)
    expect(playheadValueForKey(9.99, 'ArrowRight', 10)).toBe(10)
    expect(playheadValueForKey(0, 'ArrowLeft', 10)).toBe(0)
    expect(playheadValueForKey(4, 'Tab', 10)).toBeNull()
  })

  it('uses overlap-aware timeline positions when validating a selected downstream split', () => {
    let document = appendClip(emptyCompositeDocument(), source('first', 10))
    document = appendClip(document, source('second', 10))
    document = {
      ...document,
      clips: document.clips.map((clip, index) => index === 0
        ? { ...clip, transitionAfter: { type: 'fade', durationSeconds: 1 } }
        : clip),
    }

    const secondClipId = document.clips[1].id
    // The second clip begins at 9 seconds because the preceding transition
    // overlaps the two clips by one second.
    expect(splitValidationMessage(document, secondClipId, 9)).toContain('起点')
    expect(splitValidationMessage(document, secondClipId, 9.1)).toBeNull()
  })

  it('explains split boundaries instead of silently changing a different clip', () => {
    let document = appendClip(emptyCompositeDocument(), source('a'))
    document = appendClip(document, source('b'))
    const firstClipId = document.clips[0].id

    expect(splitValidationMessage(document, firstClipId, 0)).toContain('起点')
    expect(splitValidationMessage(document, firstClipId, 10)).toContain('终点')
    expect(splitValidationMessage(document, firstClipId, -1)).toContain('片段内部')
    expect(splitValidationMessage(document, firstClipId, 5)).toBeNull()
    expect(splitValidationMessage(document, null, 5)).toContain('选择一个片段')
    expect(splitValidationMessage(document, firstClipId, Number.NaN)).toContain('无效')
  })

  it('reports when a clip is too short to leave both minimum split sides', () => {
    const document = appendClip(emptyCompositeDocument(), source('short', 0.1))
    expect(splitValidationMessage(document, document.clips[0].id, 0.05)).toContain('太短')
  })

  it('maps trim-handle drags to source points while preserving a minimum clip duration', () => {
    const clip = appendClip(emptyCompositeDocument(), source('trim')).clips[0]

    expect(trimPointsForDrag(clip, 'in', 80, 40)).toEqual({ inPoint: 2, outPoint: 10 })
    expect(trimPointsForDrag({ ...clip, speed: 2 }, 'out', -80, 40)).toEqual({ inPoint: 0, outPoint: 6 })
    expect(trimPointsForDrag(clip, 'in', -9999, 40)).toEqual({ inPoint: 0, outPoint: 10 })
    expect(trimPointsForDrag(clip, 'out', 9999, 40)).toEqual({ inPoint: 0, outPoint: 10 })
    expect(trimPointsForDrag({ ...clip, inPoint: 4, outPoint: 6 }, 'out', -9999, 40)).toEqual({
      inPoint: 4,
      outPoint: 4.05,
    })
  })
})

describe('ClipEditor source semantics', () => {
  it('uses source dimensions for the original aspect ratio and labels the current composite exclusion', () => {
    expect(sourceAspectRatio({ width: 1176, height: 1764 })).toBe('1176 / 1764')
    expect(sourceAspectRatioLabel({ width: 1176, height: 1764 })).toBe('2:3')
    expect(sourceAspectRatio({ width: null, height: null })).toBe('16 / 9')
    expect(sourceAspectRatioLabel({ width: 0, height: 720 })).toBe('16:9')

    const compositeVideo = {
      id: 'composite',
      type: 'videoComposite',
      name: '当前合成',
      data: {
        artifacts: [
          artifact('composite-output', 'video', 1176, 1764),
          artifact('composite-audio', 'audio', null, null),
        ],
      },
    } as WorkflowDocument['nodes'][number]
    const regularVideo = {
      id: 'source',
      type: 'video',
      name: '源视频',
      data: { artifacts: [artifact('source-output', 'video', 1280, 720)] },
    } as WorkflowDocument['nodes'][number]

    const sources = collectSources(workflowWithSources(compositeVideo, regularVideo))
    const excluded = sources.find((item) => item.artifact.id === 'composite-output')
    const compositeAudio = sources.find((item) => item.artifact.id === 'composite-audio')
    const included = sources.find((item) => item.artifact.id === 'source-output')
    expect(excluded && isExcludedCompositeSource(excluded)).toBe(true)
    expect(compositeAudio && isExcludedCompositeSource(compositeAudio)).toBe(false)
    expect(included && isExcludedCompositeSource(included)).toBe(false)
  })
})
