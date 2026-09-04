import { describe, expect, it } from 'vitest'

import {
  generationStatusCopy,
  isGenerationLocked,
  isGenerationPolling,
} from '../generation-status'

describe('shared media generation status controls', () => {
  it.each(['image', 'audio', 'text', 'script'] as const)(
    '%s preserves the Video confirmation and in-flight lock semantics',
    () => {
      expect(isGenerationLocked('awaiting_confirmation')).toBe(true)
      expect(isGenerationLocked('queued')).toBe(true)
      expect(isGenerationLocked('running')).toBe(true)
      expect(isGenerationLocked('failed')).toBe(false)
      expect(isGenerationPolling('queued')).toBe(true)
      expect(isGenerationPolling('running')).toBe(true)
      expect(isGenerationPolling('awaiting_confirmation')).toBe(false)
    },
  )

  it('keeps refresh-visible copy for every durable nonterminal status', () => {
    expect(generationStatusCopy('awaiting_confirmation')).toEqual({
      label: '等待确认',
      description: '已提交，等待确认后开始生成',
    })
    expect(generationStatusCopy('queued')).toEqual({
      label: '排队中',
      description: '已进入生成队列，请稍候',
    })
    expect(generationStatusCopy('running')).toEqual({
      label: '生成中',
      description: '正在生成，请稍候',
    })
  })
})
