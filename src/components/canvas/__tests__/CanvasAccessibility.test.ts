import { describe, expect, it } from 'vitest'
import {
  applyCanvasEdgeSelectionChanges,
  createEdgeReconnectMutations,
  formatCanvasError,
  getCanvasSelectionAnnouncement,
  getCanvasZoomAnnouncement,
  getNextCanvasCandidateIndex,
  shouldYieldNativeCanvasKey,
} from '../WorkflowCanvas'
import type { EdgeChange } from '@xyflow/react'
import { createEdge, createNode } from '@/domain/factory'
import type { WorkflowDocument } from '@/domain/types'

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

  it('keeps edge selection changes additive and removes deselected edges', () => {
    const changes: EdgeChange[] = [
      { id: 'edge-2', type: 'select', selected: true },
      { id: 'edge-1', type: 'select', selected: false },
    ]

    expect(applyCanvasEdgeSelectionChanges(['edge-1'], changes)).toEqual(['edge-2'])
    expect(getCanvasSelectionAnnouncement(null, 0, 0, 1)).toBe('已选择 1 条连线。')
  })

  it('reconnects an edge with its stable id so selection survives the rewrite', () => {
    const source = createNode('text', { x: 0, y: 0 }, [], { id: 'text-1' })
    const oldTarget = createNode('image', { x: 500, y: 0 }, [source], { id: 'image-1' })
    const newTarget = createNode('video', { x: 1_000, y: 0 }, [source, oldTarget], { id: 'video-1' })
    const edge = { ...createEdge(source.id, oldTarget.id), id: 'edge-1' }
    const document: WorkflowDocument = {
      schemaVersion: 1,
      nodes: [source, oldTarget, newTarget],
      edges: [edge],
      groups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }

    expect(createEdgeReconnectMutations(document, edge.id, source.id, newTarget.id)).toEqual([
      { op: 'removeEdge', edgeId: edge.id },
      { op: 'addEdge', edge: { ...edge, target: newTarget.id } },
    ])
  })
})
