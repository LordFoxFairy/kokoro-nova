import { describe, expect, it } from 'vitest'

import {
  appendScriptV2Row,
  defaultScriptV2State,
  scriptV2BatchBlockedReason,
  updateScriptV2Row,
} from '@/domain/script-v2'

describe('Script V2 stage gates', () => {
  it('revokes materialization gates when an edited row makes completed prompt tracks stale', () => {
    let state = appendScriptV2Row(defaultScriptV2State('stage-gates'), {
      plotDescription: '守灯人在雨夜站台递出旧录音带。',
      imageGenerationPrompt: '雨夜站台，守灯人与旅人，电影感构图。',
      videoMotionPrompt: '镜头平稳推近，列车灯光掠过人物侧脸。',
    })

    expect(scriptV2BatchBlockedReason(state, 'image')).toBeNull()
    expect(scriptV2BatchBlockedReason(state, 'video')).toBeNull()

    state = updateScriptV2Row(state, state.rows[0].id, {
      plotDescription: '守灯人在雨夜站台递出旧录音带，列车灯光掠过两人侧脸。',
    })

    expect(scriptV2BatchBlockedReason(state, 'image')).toBe('有 1 个镜头的分镜图提示词需要重新合成')
    expect(scriptV2BatchBlockedReason(state, 'video')).toBe('有 1 个镜头的视频运动提示词需要重新合成')
  })
})
