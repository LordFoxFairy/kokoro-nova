import { describe, expect, it } from 'vitest'

import {
  appendScriptV2Row,
  composeScriptV2AutoPrompts,
  defaultScriptV2State,
  readScriptV2State,
  scriptV2PromptInputFingerprint,
} from '@/domain/script-v2'

describe('Script V2 automatic prompt composition', () => {
  it('replaces eligible tracks while leaving rows without source content untouched', () => {
    let state = defaultScriptV2State('auto-compose')
    state = appendScriptV2Row(state, {
      plotDescription: '林夏在雨夜车站拾起录音带',
      dialogue: '林夏说：先离开这里。',
      lightingAndAtmosphere: '蓝紫霓虹映在湿地面',
      audioEffects: '远处列车驶过',
      cinematics: { cameraMovement: '缓慢推近' },
      imageGenerationPrompt: '旧的图片提示词',
    })
    state = appendScriptV2Row(state, {
      imageGenerationPrompt: '保留的图片提示词',
      videoMotionPrompt: '保留的视频提示词',
    })

    const result = composeScriptV2AutoPrompts(state, state.rows.map((row) => row.id))

    expect(result.changedRowIds).toEqual([state.rows[0].id])
    expect(result.rows[0].imageGenerationPrompt).not.toBe('旧的图片提示词')
    expect(result.rows[0].imageGenerationPrompt).toContain('画面：林夏在雨夜车站拾起录音带')
    expect(result.rows[0].videoMotionPrompt).toContain('镜头缓慢推近')
    expect(result.rows[0].imagePromptState).toBe('synced')
    expect(result.rows[0].videoPromptState).toBe('synced')
    expect(result.rows[1].imageGenerationPrompt).toBe('保留的图片提示词')
    expect(result.rows[1].videoMotionPrompt).toBe('保留的视频提示词')
    expect(result.rows[1].imagePromptState).toBe('synced')
    expect(result.rows[1].videoPromptState).toBe('synced')
  })
})

describe('Script V2 prompt run persistence', () => {
  it('keeps valid prompt batch runs when canonical state is reloaded', () => {
    let state = defaultScriptV2State('prompt-run-persistence')
    state = appendScriptV2Row(state, {
      plotDescription: '林夏在雨夜车站回头',
      imageGenerationPrompt: '雨夜车站的图片提示词',
      videoMotionPrompt: '回头并缓慢推近',
    })
    const row = state.rows[0]
    const requestContexts = (['image', 'video'] as const).map((track) => ({
      shotId: row.id,
      track,
      operationId: `operation-${track}`,
      requestInputFingerprint: scriptV2PromptInputFingerprint(
        row,
        track,
        state.assets,
        state.styleDescription,
      ),
    }))
    const run = {
      runId: 'prompt-run-persisted',
      status: 'running' as const,
      targetShotIds: [row.id],
      batchSize: 20,
      batches: [{
        batchId: 'prompt-run-persisted_1',
        shotIds: [row.id],
        status: 'running' as const,
        taskId: 'task-persisted',
        requestContexts,
      }],
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:01.000Z',
    }

    const restored = readScriptV2State({
      scriptV2: { ...state, promptBatchRuns: [run] },
    } as unknown as Record<string, unknown>)

    expect(restored.promptBatchRuns).toEqual([run])
  })
})
