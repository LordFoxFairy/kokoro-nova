import { describe, expect, it } from 'vitest'

import {
  SCRIPT_V2_MAX_DURATION_SECONDS,
  SCRIPT_V2_MIN_DURATION_SECONDS,
  SCRIPT_V2_SHOT_SIZES,
  appendScriptV2Row,
  defaultScriptV2State,
  moveScriptV2Row,
  removeScriptV2Row,
  updateScriptV2Row,
} from '@/domain/script-v2'

describe('Script V2 canonical state', () => {
  it('freezes the observed shot-size vocabulary and default workspace state', () => {
    expect(SCRIPT_V2_SHOT_SIZES).toEqual([
      '大远景',
      '远景',
      '全景',
      '中远景',
      '中景',
      '中近景',
      '近景',
      '特写',
      '大特写',
      '头肩景',
      '半身景',
      '全身景',
    ])
    expect(SCRIPT_V2_MIN_DURATION_SECONDS).toBe(5)
    expect(SCRIPT_V2_MAX_DURATION_SECONDS).toBe(15)

    expect(defaultScriptV2State('script-seed')).toEqual(
      expect.objectContaining({
        version: 1,
        entry: null,
        activeStage: 'shots',
        title: '',
        originalStoryText: '',
        styleDescription: null,
        rows: [],
        assets: { characters: [], scenes: [], props: [] },
        generator: expect.objectContaining({
          modelId: 'gvlm-3.1',
          prompt: '',
          translating: true,
          status: 'idle',
        }),
        promptComposer: {
          singleMode: 'smart',
          batchMode: 'smart',
          modelId: 'gvlm-3.1',
        },
        promptBatchRuns: [],
      }),
    )
  })

  it('creates stable rows, clamps duration and keeps shot numbers dense', () => {
    let state = defaultScriptV2State('script-seed')
    state = appendScriptV2Row(state, {
      durationSeconds: 2,
      plotDescription: '第一镜',
      shotSize: '近景',
    })
    state = appendScriptV2Row(state, {
      durationSeconds: 99,
      plotDescription: '第二镜',
    })

    expect(state.rows.map((row) => [row.id, row.shotNumber, row.durationSeconds, row.shotSize])).toEqual([
      ['shot_e34a90f3', 1, 5, '近景'],
      ['shot_e44a9286', 2, 15, '近景'],
    ])

    state = moveScriptV2Row(state, 0, 1)
    expect(state.rows.map((row) => [row.id, row.shotNumber])).toEqual([
      ['shot_e44a9286', 1],
      ['shot_e34a90f3', 2],
    ])

    state = removeScriptV2Row(state, 'shot_e44a9286')
    expect(state.rows.map((row) => [row.id, row.shotNumber])).toEqual([['shot_e34a90f3', 1]])
  })

  it('invalidates only prompt tracks affected by authoring changes', () => {
    let state = defaultScriptV2State('prompt-seed')
    state = appendScriptV2Row(state, {
      plotDescription: '雨夜中的人物停在路灯下',
      imageGenerationPrompt: '图片提示词',
      videoMotionPrompt: '视频提示词',
      imagePromptState: 'synced',
      videoPromptState: 'user_edited',
      colorLabel: 'red',
    })
    const rowId = state.rows[0].id

    const recolored = updateScriptV2Row(state, rowId, { colorLabel: 'blue' })
    expect(recolored.rows[0]).toMatchObject({
      imagePromptState: 'synced',
      videoPromptState: 'user_edited',
      colorLabel: 'blue',
    })

    const rewritten = updateScriptV2Row(recolored, rowId, { plotDescription: '清晨中的人物走过路灯' })
    expect(rewritten.rows[0]).toMatchObject({
      imagePromptState: 'stale',
      videoPromptState: 'user_edited_stale',
    })

    const imageOnly = updateScriptV2Row(rewritten, rowId, {
      imageGenerationPrompt: '手工图片提示词',
      imagePromptState: 'user_edited',
    })
    expect(imageOnly.rows[0]).toMatchObject({
      imagePromptState: 'user_edited',
      videoPromptState: 'user_edited_stale',
    })
  })
})
