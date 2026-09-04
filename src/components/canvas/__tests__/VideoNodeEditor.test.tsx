import { describe, expect, it } from 'vitest'

import {
  isVideoGenerationLocked,
  videoGenerationStatusCopy,
  videoPromptNeedsFlush,
} from '../VideoNodeEditor'

describe('VideoNodeEditor generation controls', () => {
  it('locks repeat generation for confirmation and in-flight states', () => {
    expect(isVideoGenerationLocked('awaiting_confirmation')).toBe(true)
    expect(isVideoGenerationLocked('queued')).toBe(true)
    expect(isVideoGenerationLocked('running')).toBe(true)
    expect(isVideoGenerationLocked('failed')).toBe(false)
    expect(isVideoGenerationLocked(undefined)).toBe(false)
  })

  it('provides an explanation for every locked state', () => {
    expect(videoGenerationStatusCopy('awaiting_confirmation')).toEqual({
      label: '等待确认',
      description: '已提交，等待确认后开始生成',
    })
    expect(videoGenerationStatusCopy('queued')).toEqual({
      label: '排队中',
      description: '已进入生成队列，请稍候',
    })
    expect(videoGenerationStatusCopy('running')).toEqual({
      label: '生成中',
      description: '正在生成视频，请稍候',
    })
    expect(videoGenerationStatusCopy('succeeded')).toBeNull()
  })

  it('flushes a changed prompt before running', () => {
    expect(videoPromptNeedsFlush('new prompt', 'old prompt')).toBe(true)
    expect(videoPromptNeedsFlush('', undefined)).toBe(false)
    expect(videoPromptNeedsFlush('same prompt', 'same prompt')).toBe(false)
  })
})
