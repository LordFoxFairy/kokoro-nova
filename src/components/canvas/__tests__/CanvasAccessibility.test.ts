import { describe, expect, it } from 'vitest'
import {
  formatCanvasError,
  getCanvasSelectionAnnouncement,
  getCanvasZoomAnnouncement,
  getNextCanvasCandidateIndex,
  shouldYieldNativeCanvasKey,
} from '../WorkflowCanvas'

describe('canvas accessibility behavior', () => {
  it('wraps keyboard navigation across available reference candidates', () => {
    expect(getNextCanvasCandidateIndex(-1, 'next', 3)).toBe(0)
    expect(getNextCanvasCandidateIndex(2, 'next', 3)).toBe(0)
    expect(getNextCanvasCandidateIndex(0, 'previous', 3)).toBe(2)
    expect(getNextCanvasCandidateIndex(-1, 'previous', 3)).toBe(2)
    expect(getNextCanvasCandidateIndex(1, 'first', 3)).toBe(0)
    expect(getNextCanvasCandidateIndex(1, 'last', 3)).toBe(2)
    expect(getNextCanvasCandidateIndex(0, 'next', 0)).toBe(-1)
  })

  it('describes selection mode and current selection in a stable live message', () => {
    expect(
      getCanvasSelectionAnnouncement(
        { kind: 'reference', targetNodeId: 'video-1' },
        4,
        1,
      ),
    ).toBe('参考选择模式：4 个候选，已选择 1 个。按 Escape 退出。')
    expect(
      getCanvasSelectionAnnouncement(
        { kind: 'element', targetNodeId: 'video-1' },
        0,
        0,
      ),
    ).toBe('元素选择模式：暂无可用候选。按 Escape 退出。')
  })

  it('normalizes zoom and exposes the keyboard shortcuts in the announcement', () => {
    expect(getCanvasZoomAnnouncement(0.5)).toBe(
      '画布缩放 50%。使用 Command/Ctrl 加号或减号调整，Command/Ctrl+0 重置为 100%。',
    )
    expect(getCanvasZoomAnnouncement(9)).toContain('250%')
    expect(getCanvasZoomAnnouncement(Number.NaN)).toContain('100%')
  })

  it('formats React Flow errors for visible and live feedback', () => {
    expect(formatCanvasError('viewport', '视口更新失败')).toBe(
      '画布操作失败（viewport）：视口更新失败',
    )
    expect(formatCanvasError('unknown', '')).toBe('画布操作失败（unknown）。')
  })

  it('lets native focusable controls keep Tab and editing keys', () => {
    expect(
      shouldYieldNativeCanvasKey({ tagName: 'BUTTON', isContentEditable: false }),
    ).toBe(true)
    expect(
      shouldYieldNativeCanvasKey({
        tagName: 'SPAN',
        isContentEditable: false,
        hasFocusableAncestor: true,
      }),
    ).toBe(true)
    expect(
      shouldYieldNativeCanvasKey({ tagName: 'DIV', isContentEditable: false }),
    ).toBe(false)
  })
})
