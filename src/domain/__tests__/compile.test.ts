import { describe, expect, it } from 'vitest'

import {
  availableVideoModes,
  CompileError,
  compileNode,
  runnableNodes,
  upstreamNodes,
} from '@/domain/compile'
import { createEdge, createNode, emptyDocument } from '@/domain/factory'
import { PRICE_VERSION } from '@/domain/models'
import { applyMutations } from '@/domain/mutations'
import type { Artifact, CanvasMutation, NodeData, WorkflowDocument, WorkflowNode } from '@/domain/types'

function artifact(kind: Artifact['kind'], url: string): Artifact {
  return {
    id: `art_${url}`,
    jobId: 'job_1',
    kind,
    url,
    thumbnailUrl: `${url}#thumb`,
    width: 1920,
    height: 1080,
    durationSeconds: kind === 'video' ? 5 : null,
    createdAt: '2026-01-01T00:00:00.000Z',
    modelId: 'lib-image-2',
    assetId: null,
  }
}

function node(
  type: WorkflowNode['type'],
  id: string,
  data: Partial<NodeData> = {},
): WorkflowNode {
  const base = createNode(type, { x: 0, y: 0 }, [], { id, name: `${type}-${id}` })
  return { ...base, data: { ...base.data, ...data } }
}

function build(nodes: WorkflowNode[], rest: CanvasMutation[] = []): WorkflowDocument {
  return applyMutations(emptyDocument(), [
    ...nodes.map((n): CanvasMutation => ({ op: 'addNode', node: n })),
    ...rest,
  ])
}

describe('upstreamNodes', () => {
  it('returns only direct predecessors, in document order', () => {
    const t = node('text', 'nd_t', { prompt: '灯塔' })
    const i = node('image', 'nd_i')
    const v = node('video', 'nd_v')
    const doc = build([t, i, v], [
      { op: 'addEdge', edge: createEdge(t.id, i.id) },
      { op: 'addEdge', edge: createEdge(i.id, v.id) },
      { op: 'addEdge', edge: createEdge(t.id, v.id) },
    ])

    expect(upstreamNodes(doc, v.id).map((n) => n.id)).toEqual([t.id, i.id])
    expect(upstreamNodes(doc, t.id)).toEqual([])
  })
})

describe('compileNode / validation', () => {
  it('throws when the node does not exist', () => {
    expect(() => compileNode(build([]), 'nd_ghost')).toThrow(CompileError)
    expect(() => compileNode(build([]), 'nd_ghost')).toThrow('节点不存在: nd_ghost')
  })

  it('throws when no model is selected', () => {
    const styleNode = node('style', 'nd_style')
    expect(() => compileNode(build([styleNode]), styleNode.id)).toThrow('style-nd_style 未选择模型')
  })

  it('throws when the model id is unknown', () => {
    const i = node('image', 'nd_i', { prompt: '一只猫', modelId: 'not-a-model' })
    expect(() => compileNode(build([i]), i.id)).toThrow('未知模型: not-a-model')
  })

  it('throws when the node has neither prompt nor media input', () => {
    const i = node('image', 'nd_i')
    expect(() => compileNode(build([i]), i.id)).toThrow(CompileError)
    expect(() => compileNode(build([i]), i.id)).toThrow('image-nd_i 需要提示词或已连接的素材输入')
  })

  it('treats whitespace as an empty prompt', () => {
    const i = node('image', 'nd_i', { prompt: '   \n  ' })
    expect(() => compileNode(build([i]), i.id)).toThrow('需要提示词或已连接的素材输入')
  })

  it('accepts a media input as a substitute for a prompt', () => {
    const src = node('image', 'nd_src', { artifacts: [artifact('image', 'https://cdn.test/src.png')] })
    const target = node('image', 'nd_target')
    const doc = build([src, target], [{ op: 'addEdge', edge: createEdge(src.id, target.id) }])

    const { spec } = compileNode(doc, target.id)

    expect(spec.prompt).toBe('')
    expect(spec.inputs).toEqual([
      { kind: 'image', value: 'https://cdn.test/src.png', fromNodeId: src.id },
    ])
  })

  it('does not require a prompt for videoComposite', () => {
    const vc = node('videoComposite', 'nd_vc')

    const { spec } = compileNode(build([vc]), vc.id)

    expect(spec.prompt).toBe('')
    expect(spec.inputs).toEqual([])
  })
})

describe('compileNode / inputs and prompt', () => {
  it('collects upstream text and upstream image artifacts as inputs', () => {
    const t = node('text', 'nd_t', { prompt: '  暴风雨中的灯塔  ' })
    const empty = node('text', 'nd_empty', { prompt: '   ' })
    const src = node('image', 'nd_src', { artifacts: [artifact('image', 'https://cdn.test/src.png')] })
    const target = node('image', 'nd_target', { prompt: '低角度镜头' })
    const doc = build([t, empty, src, target], [
      { op: 'addEdge', edge: createEdge(t.id, target.id) },
      { op: 'addEdge', edge: createEdge(empty.id, target.id) },
      { op: 'addEdge', edge: createEdge(src.id, target.id) },
    ])

    const { spec, quote } = compileNode(doc, target.id)

    expect(spec.inputs).toEqual([
      { kind: 'text', value: '暴风雨中的灯塔', fromNodeId: t.id },
      { kind: 'image', value: 'https://cdn.test/src.png', fromNodeId: src.id },
    ])
    expect(spec.prompt).toBe('低角度镜头\n暴风雨中的灯塔')
    expect(spec.nodeId).toBe(target.id)
    expect(spec.nodeType).toBe('image')
    expect(spec.modelId).toBe('lib-image-2')
    expect(quote.priceVersion).toBe(PRICE_VERSION)
    // 18 base × 1.25 for the default 2K output; 标准画质 and count 1 are neutral.
    expect(quote.credits).toBe(23)
    expect(Date.parse(quote.expiresAt)).toBeGreaterThan(Date.now())
  })

  it('skips an upstream media node that has not produced an artifact yet', () => {
    const src = node('image', 'nd_src')
    const target = node('image', 'nd_target', { prompt: '继续' })
    const doc = build([src, target], [{ op: 'addEdge', edge: createEdge(src.id, target.id) }])

    expect(compileNode(doc, target.id).spec.inputs).toEqual([])
  })

  it('turns style presets into inputs and ignores unset ones', () => {
    const styled = node('style', 'nd_style', { extra: { presetId: 'preset-noir' } })
    const bare = node('style', 'nd_bare', { extra: { presetId: null } })
    const target = node('image', 'nd_target', { prompt: '城市夜景' })
    const doc = build([styled, bare, target], [
      { op: 'addEdge', edge: createEdge(styled.id, target.id) },
      { op: 'addEdge', edge: createEdge(bare.id, target.id) },
    ])

    expect(compileNode(doc, target.id).spec.inputs).toEqual([
      { kind: 'style', value: 'preset-noir', fromNodeId: styled.id },
    ])
  })

  it('adds dropped references but not the ones already covered by edges', () => {
    const target = node('image', 'nd_target', {
      prompt: '海报',
      references: [
        { id: 'ref_1', kind: 'image', origin: 'asset', refId: 'ast_logo', label: 'Logo' },
        { id: 'ref_2', kind: 'video', origin: 'node', refId: 'nd_other', label: '上游节点' },
      ],
    })

    expect(compileNode(build([target]), target.id).spec.inputs).toEqual([
      { kind: 'image', value: 'ast_logo', fromNodeId: null },
    ])
  })

  it('produces the same digest for the same graph and a different one after an edit', () => {
    const t = node('text', 'nd_t', { prompt: '灯塔' })
    const target = node('image', 'nd_target', { prompt: '海报' })
    const doc = build([t, target], [{ op: 'addEdge', edge: createEdge(t.id, target.id) }])

    const first = compileNode(doc, target.id).spec.workflowDigest
    expect(compileNode(doc, target.id).spec.workflowDigest).toBe(first)

    const edited = applyMutations(doc, [
      { op: 'updateNode', nodeId: target.id, patch: { data: { ...target.data, prompt: '另一张海报' } } },
    ])
    expect(compileNode(edited, target.id).spec.workflowDigest).not.toBe(first)
  })
})

describe('availableVideoModes', () => {
  it('grows as image and video inputs are connected', () => {
    const v = node('video', 'nd_v', { prompt: '推镜头' })
    const i1 = node('image', 'nd_i1', { artifacts: [artifact('image', 'https://cdn.test/1.png')] })
    const i2 = node('image', 'nd_i2', { artifacts: [artifact('image', 'https://cdn.test/2.png')] })
    const src = node('video', 'nd_src', { artifacts: [artifact('video', 'https://cdn.test/s.mp4')] })

    const alone = build([v, i1, i2, src])
    expect(availableVideoModes(alone, v.id)).toEqual(['text2video'])

    const oneImage = applyMutations(alone, [{ op: 'addEdge', edge: createEdge(i1.id, v.id) }])
    expect(availableVideoModes(oneImage, v.id)).toEqual(['text2video', 'first-frame'])

    const twoImages = applyMutations(oneImage, [{ op: 'addEdge', edge: createEdge(i2.id, v.id) }])
    expect(availableVideoModes(twoImages, v.id)).toEqual([
      'text2video',
      'first-frame',
      'first-last-frame',
    ])

    const withVideo = applyMutations(twoImages, [{ op: 'addEdge', edge: createEdge(src.id, v.id) }])
    expect(availableVideoModes(withVideo, v.id)).toEqual([
      'text2video',
      'first-frame',
      'first-last-frame',
      'video2video',
    ])
  })
})

describe('compileNode / video output mode', () => {
  it('falls back to the widest available mode when the stored one is unreachable', () => {
    const v = node('video', 'nd_v', {
      prompt: '推镜头',
      output: { aspectRatio: '16:9', resolution: '720p', durationSeconds: 5, count: 1, mode: 'first-last-frame' },
    })

    expect(compileNode(build([v]), v.id).spec.output.mode).toBe('text2video')
  })

  it('falls back to the widest reachable mode, not the narrowest', () => {
    // One image only: 首尾帧 needs two, so the stored mode is unreachable and the
    // fallback has to land on 首帧 rather than dropping all the way to 文生视频.
    const i1 = node('image', 'nd_i1', { artifacts: [artifact('image', 'https://cdn.test/1.png')] })
    const v = node('video', 'nd_v', {
      prompt: '推镜头',
      output: { aspectRatio: '16:9', resolution: '720p', durationSeconds: 5, count: 1, mode: 'first-last-frame' },
    })
    const doc = build([i1, v], [{ op: 'addEdge', edge: createEdge(i1.id, v.id) }])

    expect(availableVideoModes(doc, v.id)).toEqual(['text2video', 'first-frame'])
    expect(compileNode(doc, v.id).spec.output.mode).toBe('first-frame')
  })

  it('keeps a mode that the connected inputs support', () => {
    const i1 = node('image', 'nd_i1', { artifacts: [artifact('image', 'https://cdn.test/1.png')] })
    const v = node('video', 'nd_v', {
      prompt: '推镜头',
      output: { aspectRatio: '16:9', resolution: '720p', durationSeconds: 5, count: 1, mode: 'first-frame' },
    })
    const doc = build([i1, v], [{ op: 'addEdge', edge: createEdge(i1.id, v.id) }])

    expect(compileNode(doc, v.id).spec.output.mode).toBe('first-frame')
  })
})

describe('runnableNodes', () => {
  it('keeps only the nodes that currently compile', () => {
    const ready = node('image', 'nd_ready', { prompt: '一只猫' })
    const blocked = node('image', 'nd_blocked')
    const doc = build([ready, blocked])

    expect(runnableNodes(doc, [ready.id, blocked.id, 'nd_ghost'])).toEqual([ready.id])
  })
})
