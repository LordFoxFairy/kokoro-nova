import { describe, expect, it } from 'vitest'

import { agentGenerationModeHint, agentRunStateLabel, mergeAgentMessages, shouldSubmitAgentKey } from '../AgentPanel'
import type { AgentMessage } from '@/domain/types'

const message = (id: string, seq: number, content: string): AgentMessage => ({
  id,
  sessionId: 'session_fixture',
  seq,
  role: 'assistant',
  content,
  createdAt: `2026-09-04T00:00:0${seq}.000Z`,
})

describe('agent panel interaction helpers', () => {
  it('submits on Enter but preserves Shift+Enter for a newline', () => {
    expect(shouldSubmitAgentKey({ key: 'Enter', shiftKey: false })).toBe(true)
    expect(shouldSubmitAgentKey({ key: 'Enter', shiftKey: true })).toBe(false)
    expect(shouldSubmitAgentKey({ key: 'Escape', shiftKey: false })).toBe(false)
  })

  it('deduplicates and orders incremental session messages', () => {
    expect(mergeAgentMessages([message('a', 1, 'old'), message('b', 3, 'b')], [message('a', 2, 'updated'), message('c', 4, 'c')])).toEqual([
      message('a', 2, 'updated'),
      message('b', 3, 'b'),
      message('c', 4, 'c'),
    ])
  })

  it('explains the distinct manual and automatic workflow mutation behaviour', () => {
    expect(agentGenerationModeHint('manual')).toContain('确认')
    expect(agentGenerationModeHint('auto')).toContain('安全')
    expect(agentGenerationModeHint('auto')).toContain('自动应用')
  })

  it('labels run states for the status indicator', () => {
    expect(agentRunStateLabel('idle')).toBe('就绪')
    expect(agentRunStateLabel('running')).toBe('运行中')
    expect(agentRunStateLabel('success')).toBe('已完成')
    expect(agentRunStateLabel('error')).toBe('需要重试')
  })
})
