import { describe, expect, it } from 'vitest'

import { ScriptV2StateSchema } from '@/contracts/script-v2'
import { createNode, emptyDocument } from '@/domain/factory'
import { applyMutations } from '@/domain/mutations'
import {
  createScriptV2BatchMutations,
  generateMockScriptV2,
  generateMockScriptV2Asset,
  recognizeMockScriptV2Assets,
  recomputeMockScriptV2Prompts,
} from '@/domain/script-v2-mock'
import {
  SCRIPT_V2_SHOT_SIZES,
  type ScriptV2Asset,
  type ScriptV2State,
} from '@/domain/script-v2'
import type { CanvasMutation } from '@/domain/types'

const FIXTURE_TIME = '2026-09-04T00:00:00.000Z'

function generatedState(): ScriptV2State {
  const result = generateMockScriptV2({
    storyText: '@林夏 在雨夜车站收到一封迟到十年的信，@周野 从末班列车走下。',
    idempotencySeed: 'script-seed-a',
    entry: 'screenplay',
  })
  return ScriptV2StateSchema.parse({
    version: 1,
    identitySeed: 'script-seed-a',
    nextRowOrdinal: 5,
    nextAssetOrdinal: result.assets.characters.length + 1,
    entry: 'screenplay',
    activeStage: 'prompts',
    title: result.title,
    originalStoryText: '@林夏 在雨夜车站收到一封迟到十年的信，@周野 从末班列车走下。',
    styleDescription: result.styleDescription ?? null,
    rows: result.rows,
    assets: result.assets,
    generator: {
      modelId: 'gvlm-3.1',
      prompt: '',
      translating: true,
      referenceIds: [],
      status: 'idle',
      error: null,
    },
    promptComposer: { singleMode: 'smart', batchMode: 'smart', modelId: 'gvlm-3.1' },
    promptBatchRuns: [],
  })
}

function withScriptNode(state: ScriptV2State) {
  const script = createNode('script', { x: 120, y: 160 }, [], {
    id: 'node_script_fixture',
    name: '脚本 V2 节点 1',
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
    data: {
      prompt: state.originalStoryText,
      modelId: 'gvlm-3.1',
      references: [],
      artifacts: [],
      jobId: null,
      extra: { scriptV2: state },
    },
  })
  return applyMutations(emptyDocument(), [{ op: 'addNode', node: script }])
}

function nonWhitespaceLength(value: string): number {
  return value.replace(/\s/g, '').length
}

describe('deterministic Script V2 fixture engine', () => {
  it('returns byte-equal four-beat scripts for the same story and seed', () => {
    const input = {
      storyText: '@林夏 在雨夜车站收到一封迟到十年的信，@周野 从末班列车走下。',
      idempotencySeed: 'script-seed-a',
      entry: 'screenplay' as const,
    }

    const first = generateMockScriptV2(input)
    const replay = generateMockScriptV2(input)
    const otherSeed = generateMockScriptV2({ ...input, idempotencySeed: 'script-seed-b' })

    expect(replay).toEqual(first)
    expect(first.rows).toHaveLength(4)
    expect(first.rows.map((row) => row.id)).not.toEqual(otherSeed.rows.map((row) => row.id))
    const semantics = (result: typeof first) =>
      result.rows.map((row) => ({
        shotNumber: row.shotNumber,
        durationSeconds: row.durationSeconds,
        plotDescription: row.plotDescription,
        shotSize: row.shotSize,
        imageGenerationPrompt: row.imageGenerationPrompt,
        videoMotionPrompt: row.videoMotionPrompt,
      }))
    expect(semantics(first)).toEqual(semantics(otherSeed))
    expect(first.rows.every((row) => row.durationSeconds >= 5 && row.durationSeconds <= 15)).toBe(true)
    expect(first.rows.every((row) => SCRIPT_V2_SHOT_SIZES.includes(row.shotSize))).toBe(true)
    expect(first.rows.every((row) => row.imageGenerationPrompt && row.videoMotionPrompt)).toBe(true)
  })

  it('keeps explicit @mentions as character assets in first-appearance order', () => {
    const result = recognizeMockScriptV2Assets({
      storyText: '@周野 先抵达，随后 @林夏 出现，最后再次提到 @周野。',
      idempotencySeed: 'asset-order',
    })

    expect(result.operation).toBe('recognize-assets-only')
    expect(result.assets.characters.map((asset) => asset.name)).toEqual(['周野', '林夏'])
    expect(result.assets.characters.every((asset) => asset.status === 'pending')).toBe(true)
    expect(result.assets.scenes).toEqual([])
    expect(result.assets.props).toEqual([])
  })

  it('produces inspectable dual-track prompts that meet the observed quality floor', () => {
    const state = generatedState()
    const result = recomputeMockScriptV2Prompts({ state, rowIds: state.rows.map((row) => row.id) })
    const visualTerms = ['镜头', '构图', '光线', '色彩', '质感', '景深', '环境', '人物', '动作', '材质']
    const motionVerbs = ['推进', '移动', '转身', '抬起', '掠过', '跟随', '停下']

    expect(result.operation).toBe('recompute-prompts')
    expect(result.shots).toHaveLength(4)
    for (const shot of result.shots) {
      expect(nonWhitespaceLength(shot.imageGenerationPrompt)).toBeGreaterThanOrEqual(200)
      expect(nonWhitespaceLength(shot.imageGenerationPrompt)).toBeLessThanOrEqual(400)
      expect(visualTerms.filter((term) => shot.imageGenerationPrompt.includes(term)).length).toBeGreaterThanOrEqual(8)
      expect(nonWhitespaceLength(shot.videoMotionPrompt)).toBeGreaterThanOrEqual(350)
      expect(motionVerbs.filter((verb) => shot.videoMotionPrompt.includes(verb)).length).toBeGreaterThanOrEqual(3)
      expect(shot.videoMotionPrompt).toMatch(/首先|随后|与此同时|最后/)
    }
  })

  it('rejects a single recompute request above the official 20-shot bound', () => {
    const state = generatedState()
    const rowIds = Array.from({ length: 21 }, (_, index) => `shot_${index}`)

    expect(() => recomputeMockScriptV2Prompts({ state, rowIds })).toThrow('最多 20 个镜头')
  })

  it('returns a deterministic local SVG for an AI asset', () => {
    const asset: ScriptV2Asset = {
      id: 'asset_character_linxia',
      role: 'character',
      name: '林夏',
      description: '黑色风衣，短发',
      source: 'ai',
      status: 'pending',
      createdAt: FIXTURE_TIME,
      updatedAt: FIXTURE_TIME,
    }
    const settings = {
      modelId: 'lib-image-2',
      prompt: '黑色风衣，短发，克制神情',
      quality: 'standard' as const,
      resolution: '2K' as const,
      aspectRatio: '2:1',
    }

    const first = generateMockScriptV2Asset({ asset, settings })
    const replay = generateMockScriptV2Asset({ asset, settings })

    expect(replay).toEqual(first)
    expect(first).toMatchObject({ operation: 'generate-asset', asset: { status: 'ready' } })
    expect(first.asset.thumbnailUrl).toMatch(/^data:image\/svg\+xml/)
    expect(first.asset.generation).toEqual(settings)
  })
})

describe('Script V2 batch graph materialization', () => {
  it('creates a storyboard group, one Image node and one Script edge per shot atomically', () => {
    const state = generatedState()
    const document = withScriptNode(state)
    const result = createScriptV2BatchMutations(document, 'node_script_fixture', state, 'image')
    const after = applyMutations(document, result.mutations as CanvasMutation[])
    const created = after.nodes.filter((node) => result.createdNodeIds.includes(node.id))

    expect(result.blockedReason).toBeNull()
    expect(result.mutations).toHaveLength(state.rows.length * 2 + 1)
    expect(created).toHaveLength(4)
    expect(created.every((node) => node.type === 'image')).toBe(true)
    expect(created.map((node) => node.data.prompt)).toEqual(state.rows.map((row) => row.imageGenerationPrompt))
    expect(after.edges.filter((edge) => edge.source === 'node_script_fixture').map((edge) => edge.target))
      .toEqual(result.createdNodeIds)
    expect(after.groups).toContainEqual(expect.objectContaining({
      id: result.groupId,
      kind: 'storyboard',
      name: '分镜图生成器组',
      nodeIds: result.createdNodeIds,
    }))
  })

  it('creates a normal Video group with motion prompts and inherited durations', () => {
    const generated = generatedState()
    const state = {
      ...generated,
      assets: {
        characters: generated.assets.characters.map((asset) => ({ ...asset, status: 'ready' as const })),
        scenes: generated.assets.scenes.map((asset) => ({ ...asset, status: 'ready' as const })),
        props: generated.assets.props.map((asset) => ({ ...asset, status: 'ready' as const })),
      },
    }
    const document = withScriptNode(state)
    const result = createScriptV2BatchMutations(document, 'node_script_fixture', state, 'video')
    const after = applyMutations(document, result.mutations)
    const created = result.createdNodeIds.map((id) => after.nodes.find((node) => node.id === id)!)

    expect(result.blockedReason).toBeNull()
    expect(created.every((node) => node.type === 'video')).toBe(true)
    expect(created.map((node) => node.data.prompt)).toEqual(state.rows.map((row) => row.videoMotionPrompt))
    expect(created.map((node) => node.data.output?.durationSeconds)).toEqual(
      state.rows.map((row) => row.durationSeconds),
    )
    expect(after.groups).toContainEqual(expect.objectContaining({
      id: result.groupId,
      kind: 'normal',
      name: '批量视频生成器组',
      nodeIds: result.createdNodeIds,
    }))
  })

  it('returns a reason and no partial mutations when a required prompt track is incomplete', () => {
    const state = generatedState()
    state.rows[1] = { ...state.rows[1], videoMotionPrompt: '' }
    const result = createScriptV2BatchMutations(
      withScriptNode(state),
      'node_script_fixture',
      state,
      'video',
    )

    expect(result).toMatchObject({ mutations: [], createdNodeIds: [], groupId: null })
    expect(result.blockedReason).toContain('视频运动提示词')
  })
})

describe('Script V2 factory state', () => {
  it('initializes the canonical state from the final node id and stops writing legacy copies', () => {
    const node = createNode('script', { x: 0, y: 0 }, [], { id: 'node_script_seed' })

    expect(node.data.extra).toEqual({
      scriptV2: expect.objectContaining({ version: 1, identitySeed: 'node_script_seed', rows: [] }),
    })
    expect(node.data.extra).not.toHaveProperty('phase')
    expect(node.data.extra).not.toHaveProperty('shots')
    expect(ScriptV2StateSchema.parse(node.data.extra?.scriptV2)).toBeTruthy()
  })
})
