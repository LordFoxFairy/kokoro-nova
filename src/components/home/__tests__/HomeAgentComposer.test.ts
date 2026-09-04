import { describe, expect, it } from 'vitest'

import {
  buildHomeAgentBrief,
  nextHomeComposerEscapeState,
  type HomeAgentRequest,
} from '../HomeAgentComposer'

const request: HomeAgentRequest = {
  text: '一支雨夜城市的电影感短片',
  context: [
    { id: 'asset-1', kind: 'asset', label: '雨夜参考图' },
    { id: 'skill-1', kind: 'skill', label: '分镜拆解' },
  ],
  modelId: 'seedance-2-5',
  modelLabel: 'Seedance 2.5',
  generationMode: 'auto',
}

describe('home Agent composer request boundary', () => {
  it('serializes prompt, context, model and mode for the existing canvas seam', () => {
    expect(buildHomeAgentBrief(request)).toBe(
      '一支雨夜城市的电影感短片\n上下文：雨夜参考图、分镜拆解\n模型：Seedance 2.5\n生成模式：自动',
    )
  })

  it('does not add empty context lines to a clean request', () => {
    expect(
      buildHomeAgentBrief({
        text: '只写一个想法',
        context: [],
        modelId: null,
        modelLabel: null,
        generationMode: 'manual',
      }),
    ).toBe('只写一个想法\n生成模式：手动')
  })

  it('closes the active popover before collapsing the expanded composer', () => {
    expect(nextHomeComposerEscapeState({ expanded: true, activePopover: 'model' })).toEqual({
      expanded: true,
      activePopover: null,
      handled: true,
    })
    expect(nextHomeComposerEscapeState({ expanded: true, activePopover: null })).toEqual({
      expanded: false,
      activePopover: null,
      handled: true,
    })
  })

  it('leaves a collapsed composer alone when no layer is open', () => {
    expect(nextHomeComposerEscapeState({ expanded: false, activePopover: null })).toEqual({
      expanded: false,
      activePopover: null,
      handled: false,
    })
  })
})
