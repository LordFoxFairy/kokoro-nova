'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useStore,
  type Edge,
  type EdgeChange,
  type Node as FlowNode,
  type NodeChange,
  type OnConnect,
  type ReactFlowInstance,
  type AriaLabelConfig,
} from '@xyflow/react'
import { createEdge, createGroup, createNode, NODE_SIZE } from '@/domain/factory'
import type { ImageTransformRequest } from '@/domain/image-authoring'
import { MEDIA_OF_NODE, NODE_META } from '@/domain/nodes'
import { canConvertToStoryboardGroup } from '@/domain/mutations'
import { videoReferenceCandidates } from '@/domain/video-references'
import { createTextStarterMutations } from '@/domain/text-workflows'
import type { TextStarterIntent } from '@/domain/text-authoring'
import type { CanvasMutation, NodeType, Viewport, WorkflowDocument, WorkflowNode } from '@/domain/types'
import type { ScriptV2State } from '@/domain/script-v2'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { NodeCard, type NodeCardData } from './NodeCard'
import { GroupChrome, GroupFrames } from './GroupLayer'

const GRID_SIZE = 20

/*
 * ReactFlow copies these into its internal store on every render. Passing
 * fresh literals makes that store update, which re-renders, which builds fresh
 * literals again — an unbounded loop. They are constant, so hoist them.
 */
const SNAP_GRID: [number, number] = [GRID_SIZE, GRID_SIZE]
const PAN_BUTTONS = [1, 2]
const PRO_OPTIONS = { hideAttribution: true }
const MULTI_SELECT_KEYS = ['Meta', 'Shift']
const MIN_CANVAS_ZOOM = 0.1
const MAX_CANVAS_ZOOM = 2.5
const DEFAULT_CANVAS_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }

/** Browser-local view state stays out of the shared workflow document. */
export const CANVAS_VIEWPORT_STORAGE_PREFIX = 'kokoro-nova:canvas-viewport:'

export function normalizeCanvasViewport(
  input: Partial<Viewport> | null | undefined,
  fallback: Viewport = DEFAULT_CANVAS_VIEWPORT,
): Viewport {
  const x = Number.isFinite(input?.x) ? Number(input?.x) : fallback.x
  const y = Number.isFinite(input?.y) ? Number(input?.y) : fallback.y
  const rawZoom = Number.isFinite(input?.zoom) ? Number(input?.zoom) : fallback.zoom
  return {
    x,
    y,
    zoom: Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, rawZoom)),
  }
}

export function getCanvasViewportStorageKey(canvasId: string): string {
  return `${CANVAS_VIEWPORT_STORAGE_PREFIX}${canvasId}`
}

function readCanvasViewport(canvasId: string | null): Viewport | null {
  if (!canvasId || typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(getCanvasViewportStorageKey(canvasId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Viewport> | null
    if (!parsed || typeof parsed !== 'object') return null
    return normalizeCanvasViewport(parsed)
  } catch {
    // Private browsing and test harnesses may deny storage access. The canvas
    // remains usable with the server-provided viewport in that case.
    return null
  }
}

function writeCanvasViewport(canvasId: string | null, viewport: Viewport): void {
  if (!canvasId || typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(getCanvasViewportStorageKey(canvasId), JSON.stringify(viewport))
  } catch {
    // View state is an enhancement; a storage quota/security error must not
    // interrupt panning or zooming.
  }
}

function sameCanvasViewport(a: Viewport | null, b: Viewport): boolean {
  return Boolean(a && a.x === b.x && a.y === b.y && a.zoom === b.zoom)
}

export type CanvasCandidateDirection = 'next' | 'previous' | 'first' | 'last'

/** Keep candidate focus navigation deterministic, including an empty canvas. */
export function getNextCanvasCandidateIndex(
  currentIndex: number,
  direction: CanvasCandidateDirection,
  count: number,
): number {
  const size = Math.floor(count)
  if (!Number.isFinite(size) || size <= 0) return -1
  if (direction === 'first') return 0
  if (direction === 'last') return size - 1

  const current = Number.isFinite(currentIndex) ? Math.trunc(currentIndex) : -1
  if (current < 0) return direction === 'previous' ? size - 1 : 0
  const offset = direction === 'previous' ? -1 : 1
  return ((current + offset) % size + size) % size
}

export function getCanvasSelectionAnnouncement(
  mode: { kind: 'reference' | 'element'; targetNodeId: string } | null,
  candidateCount: number,
  selectedCount: number,
  selectedEdgeCount = 0,
): string {
  if (!mode) {
    if (selectedEdgeCount > 0) return `已选择 ${selectedEdgeCount} 条连线。`
    return `已选择 ${selectedCount} 个节点。`
  }
  const label = mode.kind === 'reference' ? '参考选择模式' : '元素选择模式'
  if (candidateCount <= 0) return `${label}：暂无可用候选。按 Escape 退出。`
  return `${label}：${candidateCount} 个候选，已选择 ${selectedCount} 个。按 Escape 退出。`
}

export function getCanvasZoomAnnouncement(zoom: number): string {
  const normalized = Number.isFinite(zoom) ? Math.min(2.5, Math.max(0.1, zoom)) : 1
  const percentage = Math.round(normalized * 100)
  return `画布缩放 ${percentage}%。使用 Command/Ctrl 加号或减号调整，Command/Ctrl+0 重置为 100%。`
}

export function formatCanvasError(code: string, message: string): string {
  const normalizedCode = code.trim() || 'unknown'
  const detail = message.trim()
  return detail
    ? `画布操作失败（${normalizedCode}）：${detail}`
    : `画布操作失败（${normalizedCode}）。`
}

/** Apply React Flow's controlled edge selection events without mutating the document. */
export function applyCanvasEdgeSelectionChanges(current: string[], changes: EdgeChange[]): string[] {
  const next = new Set(current)
  for (const change of changes) {
    if (change.type === 'select') {
      if (change.selected) next.add(change.id)
      else next.delete(change.id)
    } else if (change.type === 'remove' || change.type === 'replace') {
      next.delete(change.id)
    }
  }
  return [...next]
}

/** Rewire an existing edge while preserving its identity for selection and history. */
export function createEdgeReconnectMutations(
  document: WorkflowDocument,
  edgeId: string,
  source: string,
  target: string,
): CanvasMutation[] {
  const edge = document.edges.find((candidate) => candidate.id === edgeId)
  if (!edge || !source || !target || (edge.source === source && edge.target === target)) return []
  return [
    { op: 'removeEdge', edgeId },
    { op: 'addEdge', edge: { ...edge, source, target } },
  ]
}

export function shouldYieldNativeCanvasKey(input: {
  tagName?: string
  isContentEditable?: boolean
  hasFocusableAncestor?: boolean
}): boolean {
  const tagName = input.tagName?.toUpperCase()
  return Boolean(
    input.isContentEditable ||
      input.hasFocusableAncestor ||
      (tagName && ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tagName)),
  )
}

const FLOW_ARIA_LABEL_CONFIG: Partial<AriaLabelConfig> = {
  'node.a11yDescription.default': '按 Enter 或空格选择节点；按 Delete 删除；按 Escape 取消选择。',
  'node.a11yDescription.keyboardDisabled': '此节点当前不可用键盘操作。',
  'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }) =>
    `已向${direction}移动所选节点，位置 ${Math.round(x)}, ${Math.round(y)}。`,
  'edge.a11yDescription.default': '连接两个工作流节点的连线。',
  'minimap.ariaLabel': '画布小地图，可拖动平移并滚动缩放。',
  'handle.ariaLabel': '工作流连接点。',
}

const CANVAS_FOCUS_STYLES = `
[data-testid="workflow-canvas"] .react-flow__node:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
  box-shadow: 0 0 0 4px rgba(103, 209, 243, 0.22);
}
[data-testid="workflow-canvas"] .react-flow__edge:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}
[data-testid="workflow-canvas"] button[data-testid^="reference-candidate-"]:focus-visible,
[data-testid="workflow-canvas"] button[data-testid^="element-candidate-"]:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(18, 101, 232, 0.5);
}
[data-testid="workflow-canvas"] [data-testid="rf__minimap"]:focus-within {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}
`

interface WorkflowCanvasProps {
  onRun: (nodeId: string) => void
  onCancelJob: (jobId: string) => void
  onOpenNode: (nodeId: string | null) => void
  openNodeId: string | null
  onStitch: (groupId: string) => void
  onOpenStoryboardConfig: (groupId: string, anchor: { x: number; y: number }) => void
  selectionMode: { kind: 'reference' | 'element'; targetNodeId: string } | null
  onStartVideoSelection: (kind: 'reference' | 'element', targetNodeId: string) => void
  onExitVideoSelection: () => void
  onSelectCanvasCandidate: (nodeId: string) => void
  onRemoveVideoReference: (targetNodeId: string, sourceNodeId: string) => void
  onLocateNode: (nodeId: string) => void
  onOpenImageStyle: (nodeId: string) => void
  onApplyImageTool: (sourceNodeId: string, request: ImageTransformRequest) => void
  onOpenScriptWorkspace: (nodeId: string) => void
  onMaterializeScriptBatch: (nodeId: string, kind: 'image' | 'video') => void
  onCanvasError?: (message: string) => void
}

function CanvasInner({
  onRun,
  onCancelJob,
  onOpenNode,
  openNodeId,
  onStitch,
  onOpenStoryboardConfig,
  selectionMode,
  onStartVideoSelection,
  onExitVideoSelection,
  onSelectCanvasCandidate,
  onRemoveVideoReference,
  onLocateNode,
  onOpenImageStyle,
  onApplyImageTool,
  onOpenScriptWorkspace,
  onMaterializeScriptBatch,
  onCanvasError,
}: WorkflowCanvasProps) {
  const document = useEditor((s) => s.document)
  const jobs = useEditor((s) => s.jobs)
  const selection = useEditor((s) => s.selection)
  const edgeSelection = useEditor((s) => s.edgeSelection)
  const showEdges = useEditor((s) => s.showEdges)
  const snapToGrid = useEditor((s) => s.snapToGrid)
  const showMinimap = useEditor((s) => s.showMinimap)
  const toolMode = useEditor((s) => s.toolMode)
  const commit = useEditor((s) => s.commit)
  const commitWith = useEditor((s) => s.commitWith)
  const patchLocal = useEditor((s) => s.patchLocal)
  const select = useEditor((s) => s.select)
  const selectEdges = useEditor((s) => s.selectEdges)
  const pushAgentRef = useEditor((s) => s.pushAgentRef)
  const setZoom = useEditor((s) => s.setZoom)
  const toast = useEditor((s) => s.toast)

  const flow = useReactFlow()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  // Subscribe to the transform so group frames track pan/zoom every frame.
  const transform = useStore((s) => s.transform)
  const instanceRef = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [liveMessage, setLiveMessage] = useState('')
  const [commandMessage, setCommandMessage] = useState('')
  const [flowErrorMessage, setFlowErrorMessage] = useState('')
  const commandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentCanvasId = useEditor((s) => s.canvasId)
  const restoredViewport = useRef<Viewport | null>(null)
  /** Positions captured at drag start, so one drag becomes one undo frame. */
  const dragOrigin = useRef<Map<string, { x: number; y: number }> | null>(null)

  const announceCommand = useCallback((message: string) => {
    setCommandMessage(message)
    if (commandTimer.current) clearTimeout(commandTimer.current)
    commandTimer.current = setTimeout(() => {
      commandTimer.current = null
      setCommandMessage('')
    }, 2400)
  }, [])

  useEffect(() => {
    return () => {
      if (commandTimer.current) clearTimeout(commandTimer.current)
    }
  }, [])

  const jobByNode = useMemo(() => {
    const map = new Map<string, (typeof jobs)[number]>()
    for (const job of jobs) {
      const existing = map.get(job.nodeId)
      if (!existing || job.createdAt > existing.createdAt) map.set(job.nodeId, job)
    }
    return map
  }, [jobs])

  const referenceCandidateByNode = useMemo(() => {
    if (!selectionMode) return new Map<string, ReturnType<typeof videoReferenceCandidates>[number]>()
    try {
      return new Map(
        videoReferenceCandidates(document, selectionMode.targetNodeId).map((candidate) => [
          candidate.node.id,
          candidate,
        ]),
      )
    } catch {
      return new Map<string, ReturnType<typeof videoReferenceCandidates>[number]>()
    }
  }, [document, selectionMode])

  const candidateStats = useMemo(() => {
    if (!selectionMode) return { candidateCount: 0, selectedCount: 0 }

    let candidateCount = 0
    let selectedCount = 0
    for (const candidate of referenceCandidateByNode.values()) {
      const media =
        candidate.node.type === 'assetLibrary'
          ? ((candidate.node.data.extra?.assetKind as 'image' | 'video' | 'audio' | undefined) ?? null)
          : MEDIA_OF_NODE[candidate.node.type]
      const selectable =
        selectionMode.kind === 'reference'
          ? candidate.selectable
          : media === 'image' && candidate.selectable
      if (!selectable) continue
      candidateCount += 1
      if (candidate.selected) selectedCount += 1
    }
    return { candidateCount, selectedCount }
  }, [referenceCandidateByNode, selectionMode])

  const handleDuplicate = useCallback(
    (nodeId: string) => {
      const source = document.nodes.find((n) => n.id === nodeId)
      if (!source) return
      const copy = createNode(
        source.type,
        { x: source.position.x + 60, y: source.position.y + 60 },
        document.nodes,
        { name: `${source.name}副本`, data: JSON.parse(JSON.stringify(source.data)) },
      )
      void commit([{ op: 'addNode', node: copy }], '创建副本')
    },
    [document.nodes, commit],
  )

  const handleDelete = useCallback(
    (nodeId: string) => {
      void commit([{ op: 'removeNode', nodeId }], '删除节点')
    },
    [commit],
  )

  const handleToggleKeyElement = useCallback(
    (nodeId: string) => {
      const node = document.nodes.find((n) => n.id === nodeId)
      if (!node) return
      void commit([{ op: 'updateNode', nodeId, patch: { keyElement: !node.keyElement } }], '设置关键元素')
    },
    [document.nodes, commit],
  )

  const handleAddToAgent = useCallback(
    (nodeId: string) => {
      const node = document.nodes.find((n) => n.id === nodeId)
      if (!node) return
      pushAgentRef({ id: node.id, label: node.name, kind: 'node' })
    },
    [document.nodes, pushAgentRef],
  )

  const handleSetIntent = useCallback(
    async (nodeId: string, intent: TextStarterIntent) => {
      let createdNodeIds: string[] = []
      const ok = await commitWith((current) => {
        const result = createTextStarterMutations(current, nodeId, intent)
        createdNodeIds = result.createdNodeIds
        return result.mutations
      }, intent === 'free' ? '自己编写文本' : `使用文本预设 ${intent}`)
      if (!ok) return

      if (intent === 'free') {
        select([])
        setSelectedGroupId(null)
        onOpenNode(nodeId)
        return
      }

      onOpenNode(null)
      select(createdNodeIds)
      window.requestAnimationFrame(() => {
        flow.fitView({
          nodes: createdNodeIds.map((id) => ({ id })),
          duration: 400,
          padding: 0.28,
        })
      })
    },
    [commitWith, flow, onOpenNode, select],
  )

  const handleScriptStateChange = useCallback(
    async (nodeId: string, state: ScriptV2State, label = '编辑脚本节点') => {
      await commitWith((current) => {
        const node = current.nodes.find((candidate) => candidate.id === nodeId)
        if (!node || node.type !== 'script') return []
        return [
          {
            op: 'updateNode' as const,
            nodeId,
            patch: {
              data: {
                ...node.data,
                prompt: state.originalStoryText,
                modelId: state.generator.modelId,
                extra: { ...node.data.extra, scriptV2: state },
              },
            },
          },
        ]
      }, label)
    },
    [commitWith],
  )

  const focusCanvasNode = useCallback((nodeId: string) => {
    const root = canvasRef.current
    if (!root) return
    const nodeElement = [...root.querySelectorAll<HTMLElement>('.react-flow__node')].find(
      (element) => element.dataset.id === nodeId,
    )
    nodeElement?.focus()
  }, [])

  const handleSelectCanvasCandidate = useCallback(
    (nodeId: string) => {
      const focusAfterSelection =
        selectionMode?.kind === 'element' ? selectionMode.targetNodeId : nodeId
      onSelectCanvasCandidate(nodeId)
      window.requestAnimationFrame(() => {
        const root = canvasRef.current
        const candidateButton = root
          ? [...root.querySelectorAll<HTMLButtonElement>('button[data-testid]')].find(
              (button) => button.dataset.testid === `${selectionMode?.kind}-candidate-${nodeId}`,
            )
          : null
        if (candidateButton && !candidateButton.disabled) {
          candidateButton.focus()
          return
        }
        focusCanvasNode(focusAfterSelection)
      })
    },
    [focusCanvasNode, onSelectCanvasCandidate, selectionMode],
  )

  const onCanvasKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!selectionMode) return
      const target = event.target as HTMLElement | null
      const candidate = target?.closest<HTMLButtonElement>(
        `button[data-testid^="${selectionMode.kind}-candidate-"]`,
      )
      if (!candidate || candidate.disabled) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onExitVideoSelection()
        return
      }

      const direction: CanvasCandidateDirection | null =
        event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 'next'
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? 'previous'
            : event.key === 'Home'
              ? 'first'
              : event.key === 'End'
                ? 'last'
                : null
      if (!direction) return

      const buttons = [
        ...(canvasRef.current?.querySelectorAll<HTMLButtonElement>(
          `button[data-testid^="${selectionMode.kind}-candidate-"]`,
        ) ?? []),
      ].filter((button) => !button.disabled)
      const nextIndex = getNextCanvasCandidateIndex(buttons.indexOf(candidate), direction, buttons.length)
      if (nextIndex < 0) return
      event.preventDefault()
      event.stopPropagation()
      buttons[nextIndex]?.focus()
    },
    [onExitVideoSelection, selectionMode],
  )

  useEffect(() => {
    setLiveMessage(
      getCanvasSelectionAnnouncement(
        selectionMode,
        candidateStats.candidateCount,
        selectionMode ? candidateStats.selectedCount : selection.length,
        selectionMode ? 0 : edgeSelection.length,
      ),
    )
  }, [candidateStats, edgeSelection, selection, selectionMode])

  useEffect(() => {
    const root = canvasRef.current
    if (!root || !selectionMode) return

    const prefix = `${selectionMode.kind}-candidate-`
    for (const button of root.querySelectorAll<HTMLButtonElement>('button[data-testid]')) {
      const testId = button.dataset.testid ?? ''
      if (!testId.startsWith(prefix)) continue
      const nodeId = testId.slice(prefix.length)
      const candidate = referenceCandidateByNode.get(nodeId)
      const candidateNode = document.nodes.find((node) => node.id === nodeId)
      const media =
        candidateNode?.type === 'assetLibrary'
          ? ((candidateNode.data.extra?.assetKind as 'image' | 'video' | 'audio' | undefined) ?? null)
          : candidateNode
            ? MEDIA_OF_NODE[candidateNode.type]
            : null
      const selected = selectionMode.kind === 'reference' && Boolean(candidate?.selected)
      const selectable = selectionMode.kind === 'reference'
        ? Boolean(candidate?.selectable)
        : media === 'image' && Boolean(candidate?.selectable)
      const name = candidate?.node.name ?? nodeId
      button.setAttribute('aria-pressed', String(selected))
      button.setAttribute('aria-describedby', 'canvas-selection-instructions')
      button.setAttribute(
        'aria-label',
        selectionMode.kind === 'reference'
          ? selected
            ? `取消选择参考：${name}`
            : selectable
              ? `添加参考：${name}`
              : `不可用参考：${name}`
          : selectable
            ? `标记元素：${name}`
            : `不可选择：${name}`,
      )
      button.setAttribute('data-selection-state', selected ? 'selected' : selectable ? 'available' : 'unavailable')
    }
  }, [document.nodes, referenceCandidateByNode, selectionMode])

  useEffect(() => {
    const validIds = new Set(document.edges.map((edge) => edge.id))
    const next = edgeSelection.filter((edgeId) => validIds.has(edgeId))
    if (next.length !== edgeSelection.length) selectEdges(next)
  }, [document.edges, edgeSelection, selectEdges])

  useEffect(() => {
    if (!selectionMode) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target?.closest('[role="dialog"], [role="menu"]')) return
      event.preventDefault()
      onExitVideoSelection()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onExitVideoSelection, selectionMode])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || openNodeId || selectionMode) return
      const target = event.target as HTMLElement | null
      if (target?.closest('[role="dialog"], [role="menu"], input, textarea, [contenteditable="true"]')) return
      if (useEditor.getState().selection.length === 0) return
      select([])
      setSelectedGroupId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openNodeId, select, selectionMode])

  const nodes: FlowNode[] = useMemo(
    () =>
      document.nodes.map((node) => ({
        id: node.id,
        type: 'card',
        position: node.position,
        selected: selection.includes(node.id),
        focusable: true,
        ariaRole: 'group',
        ariaLabel: `${node.name}，${NODE_META[node.type].label}节点${
          selection.includes(node.id) ? '，已选中' : '，未选中'
        }${openNodeId === node.id ? '，正在编辑' : ''}`,
        domAttributes: {
          'aria-selected': selection.includes(node.id),
          'data-selection-state': selection.includes(node.id) ? 'selected' : 'not-selected',
        },
        // Groups render behind nodes; a member still drags independently.
        data: {
          node,
          job: jobByNode.get(node.id) ?? null,
          onRun,
          onCancel: onCancelJob,
          onDuplicate: handleDuplicate,
          onDelete: handleDelete,
          onToggleKeyElement: handleToggleKeyElement,
          onAddToAgent: handleAddToAgent,
          onSetIntent: handleSetIntent,
          onStartVideoSelection,
          onExitVideoSelection,
          onSelectCanvasCandidate: handleSelectCanvasCandidate,
          onRemoveVideoReference,
          onLocateNode,
          onOpenImageStyle,
          onApplyImageTool,
          onOpenNode,
          onOpenScriptWorkspace,
          onScriptStateChange: handleScriptStateChange,
          onMaterializeScriptBatch,
          canvasSelection: selectionMode
            ? node.id === selectionMode.targetNodeId
              ? {
                  ...selectionMode,
                  selected: false,
                  selectable: false,
                  reason: null,
                }
              : (() => {
                  const candidate = referenceCandidateByNode.get(node.id)
                  const media =
                    node.type === 'assetLibrary'
                      ? ((node.data.extra?.assetKind as 'image' | 'video' | 'audio' | undefined) ?? null)
                      : MEDIA_OF_NODE[node.type]
                  const elementSelectable = selectionMode.kind === 'element' && media === 'image'
                  return {
                    ...selectionMode,
                    selected: candidate?.selected ?? false,
                    selectable:
                      selectionMode.kind === 'reference'
                        ? (candidate?.selectable ?? false)
                        : elementSelectable && (candidate?.selectable ?? false),
                    reason:
                      selectionMode.kind === 'reference'
                        ? (candidate ? candidate.reason : '该节点不可作为参考')
                        : elementSelectable
                          ? (candidate?.reason ?? null)
                          : '仅可选择图片节点',
                  }
                })()
            : null,
          open: openNodeId === node.id,
        } satisfies NodeCardData,
      })),
    [
      document.nodes,
      selection,
      jobByNode,
      onRun,
      onCancelJob,
      handleDuplicate,
      handleDelete,
      handleToggleKeyElement,
      handleAddToAgent,
      handleSetIntent,
      onStartVideoSelection,
      onExitVideoSelection,
      handleSelectCanvasCandidate,
      onRemoveVideoReference,
      onLocateNode,
      onOpenImageStyle,
      onApplyImageTool,
      onOpenNode,
      onOpenScriptWorkspace,
      handleScriptStateChange,
      onMaterializeScriptBatch,
      selectionMode,
      referenceCandidateByNode,
      openNodeId,
    ],
  )

  const edges: Edge[] = useMemo(
    () =>
      document.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'default' as const,
        animated: false,
        selected: edgeSelection.includes(edge.id),
        selectable: !selectionMode,
        deletable: true,
        reconnectable: !selectionMode,
        focusable: !selectionMode,
        ariaRole: 'group',
        ariaLabel: `${document.nodes.find((node) => node.id === edge.source)?.name ?? edge.source} → ${
          document.nodes.find((node) => node.id === edge.target)?.name ?? edge.target
        } 连线${edgeSelection.includes(edge.id) ? '，已选中' : ''}`,
        domAttributes: { 'aria-selected': edgeSelection.includes(edge.id) },
        interactionWidth: 24,
      })),
    [document.edges, document.nodes, edgeSelection, selectionMode],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const current = useEditor.getState().edgeSelection
      const next = applyCanvasEdgeSelectionChanges(current, changes)
      const changed = next.length !== current.length || current.some((id) => !next.includes(id))
      if (changed) selectEdges(next)
    },
    [selectEdges],
  )

  const onReconnect = useCallback(
    (oldEdge: Edge, connection: { source: string | null; target: string | null }) => {
      if (!connection.source || !connection.target) return
      void commitWith(
        (current) => createEdgeReconnectMutations(current, oldEdge.id, connection.source!, connection.target!),
        '重连',
      ).then((ok) => {
        if (ok) announceCommand('已更新节点连线')
      })
    },
    [announceCommand, commitWith],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // The graph is fully controlled, so ReactFlow keeps no selection of its
      // own: it emits `select` changes and expects them back through `nodes`.
      // Dropping them strands ⇧-click multi-selection inside ReactFlow.
      const selectChanges = changes.filter(
        (c): c is Extract<NodeChange, { type: 'select' }> => c.type === 'select',
      )
      if (selectChanges.length > 0) {
        const current = useEditor.getState().selection
        const next = new Set(current)
        for (const change of selectChanges) {
          if (change.selected) next.add(change.id)
          else next.delete(change.id)
        }
        // Write only on a real difference: an equal-but-new array gives `nodes`
        // a fresh identity and ReactFlow re-emits the same change forever.
        const changed = next.size !== current.length || current.some((id) => !next.has(id))
        if (changed) {
          select([...next])
          if (next.size === 0) setSelectedGroupId(null)
        }
      }

      // Position changes are applied locally during the drag and committed once
      // on release, so a drag is a single undo step and a single network write.
      const positionChanges = changes.filter(
        (c): c is Extract<NodeChange, { type: 'position' }> => c.type === 'position',
      )
      if (positionChanges.length === 0) return

      if (!dragOrigin.current) {
        dragOrigin.current = new Map(document.nodes.map((n) => [n.id, { ...n.position }]))
      }

      const moving = positionChanges.filter((c) => c.position)
      if (moving.length > 0) {
        patchLocal((doc) => ({
          ...doc,
          nodes: doc.nodes.map((n) => {
            const change = moving.find((c) => c.id === n.id)
            return change?.position ? { ...n, position: change.position } : n
          }),
        }))
      }

      const settled = positionChanges.filter((c) => c.dragging === false)
      if (settled.length > 0 && dragOrigin.current) {
        const origin = dragOrigin.current
        dragOrigin.current = null
        const mutations: CanvasMutation[] = []
        for (const change of settled) {
          const node = useEditor.getState().document.nodes.find((n) => n.id === change.id)
          const before = origin.get(change.id)
          if (!node || !before) continue
          if (before.x === node.position.x && before.y === node.position.y) continue
          mutations.push({ op: 'updateNode', nodeId: node.id, patch: { position: node.position } })
        }
        if (mutations.length > 0) {
          void commit(mutations, '移动节点').then((ok) => {
            if (ok) announceCommand(`已移动 ${mutations.length} 个节点`)
          })
        }
      }
    },
    [document.nodes, patchLocal, commit, select, announceCommand],
  )

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return
      void commitWith(
        (document) => {
          if (document.edges.some((edge) => edge.source === connection.source && edge.target === connection.target)) {
            return []
          }
          return [{ op: 'addEdge', edge: createEdge(connection.source!, connection.target!) }]
        },
        '连线',
      ).then((ok) => {
        if (ok) announceCommand('已建立节点连线')
      })
    },
    [announceCommand, commitWith],
  )

  /**
   * Double-clicking empty canvas creates a text node there — the empty-canvas
   * hint advertises this. Guarded on the pane so double-clicking a card still
   * opens its generator instead of dropping a node underneath it.
   */
  const onCanvasDoubleClickCapture = useCallback(
    (event: React.MouseEvent) => {
      if (selectionMode) return
      const target = event.target as HTMLElement

      // ReactFlow updates the controlled node after the first click. In a
      // native `dblclick` sequence that can make the second click land on the
      // pane even though the pointer never left the card. Resolve the node
      // from both the event target and the pointer coordinates before treating
      // the gesture as an empty-canvas double click.
      if (target.closest('.node-floating-ui')) return
      const directNode = target.closest<HTMLElement>('[data-node-type]')
      const hitNode = directNode ?? [...window.document.querySelectorAll<HTMLElement>('[data-node-type]')].find((element) => {
        const rect = element.getBoundingClientRect()
        return (
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        )
      })

      if (hitNode) {
        const nodeId = hitNode.closest<HTMLElement>('.react-flow__node')?.dataset.id
        if (nodeId) {
          event.preventDefault()
          event.stopPropagation()
          window.dispatchEvent(new Event('libtv:cancel-node-suggestion'))
          // Node-attached authoring is an inspection mode, not a batch canvas
          // selection. ReactFlow's native click sequence can otherwise leave
          // the card selected or unselected depending on render timing.
          select([])
          setSelectedGroupId(null)
          onOpenNode(nodeId)
        }
        return
      }

      if (!target.closest('.react-flow__pane')) return

      const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      void commitWith((doc) => {
        const size = NODE_SIZE.text
        const at = freeSpotNear(doc.nodes, { x: point.x - size.width / 2, y: point.y - size.height / 2 }, size)
        return [{ op: 'addNode', node: createNode('text', at, doc.nodes) }]
      }, '新建文本节点').then((ok) => {
        if (ok) announceCommand('已创建文本节点')
      })
    },
    [announceCommand, flow, commitWith, onOpenNode, select, selectionMode],
  )

  /**
   * ⌥-dragging a node leaves a copy behind at the original position, so the
   * gesture reads as "pull a duplicate out" rather than "move the original".
   */
  const onNodeDragStart = useCallback(
    // ReactFlow hands over the native event here, not a React synthetic one.
    (event: MouseEvent | TouchEvent, dragged: FlowNode) => {
      if (!('altKey' in event) || !event.altKey) return
      const source = useEditor.getState().document.nodes.find((n) => n.id === dragged.id)
      if (!source) return
      void commitWith((doc) => {
        const copy = createNode(source.type, source.position, doc.nodes, {
          name: `${source.name}副本`,
          data: JSON.parse(JSON.stringify(source.data)),
        })
        return [{ op: 'addNode', node: copy }]
      }, '节点复制')
    },
    [commitWith],
  )

  const handleRunGroup = useCallback(
    (groupId: string) => {
      const group = document.groups.find((g) => g.id === groupId)
      if (!group) return
      for (const nodeId of group.nodeIds) onRun(nodeId)
    },
    [document.groups, onRun],
  )

  const handleUngroup = useCallback(
    (groupId: string) => {
      void commit([{ op: 'removeGroup', groupId, deleteNodes: false }], '解组')
      setSelectedGroupId(null)
    },
    [commit],
  )

  const handleConvertToStoryboard = useCallback(
    (groupId: string) => {
      const eligibility = canConvertToStoryboardGroup(document, groupId)
      if (!eligibility.ok) {
        toast(eligibility.reason, 'error')
        return
      }
      const group = document.groups.find((g) => g.id === groupId)
      if (!group) return
      void commit(
        [
          {
            op: 'updateGroup',
            groupId,
            patch: {
              kind: 'storyboard',
              name: `分镜组 ${group.nodeIds.length} 个节点`,
              storyboard: { aspectRatio: '16:9', grid: { rows: 2, cols: 2 }, showSequenceNumbers: false },
            },
          },
        ],
        '转分镜组',
      )
    },
    [document, commit, toast],
  )

  const handleAddToToolbox = useCallback(() => {
    toast('已添加到工具箱「我的工具」', 'success')
  }, [toast])

  const handleDownloadGroup = useCallback(
    (groupId: string) => {
      const group = document.groups.find((g) => g.id === groupId)
      const artifacts =
        group?.nodeIds
          .map((id) => document.nodes.find((n) => n.id === id))
          .flatMap((n) => n?.data.artifacts ?? []) ?? []
      if (artifacts.length === 0) {
        toast('组内没有可下载的生成结果', 'error')
        return
      }
      for (const artifact of artifacts) {
        const link = window.document.createElement('a')
        link.href = artifact.url
        link.download = ''
        link.click()
      }
    },
    [document, toast],
  )

  const handleFlowError = useCallback(
    (code: string, message: string) => {
      const formatted = formatCanvasError(code, message)
      setCommandMessage('')
      setFlowErrorMessage(formatted)
      setLiveMessage(formatted)
      if (onCanvasError) {
        onCanvasError(formatted)
      } else {
        toast(formatted, 'error')
      }
    },
    [onCanvasError, toast],
  )

  const restoreViewport = useCallback(
    (instance: ReactFlowInstance<FlowNode, Edge>) => {
      const serverViewport = normalizeCanvasViewport({
        x: document.viewport.x,
        y: document.viewport.y,
        zoom: document.viewport.zoom,
      })
      const next = readCanvasViewport(currentCanvasId) ?? serverViewport
      restoredViewport.current = next
      setZoom(next.zoom)
      void instance.setViewport(next)
    },
    [currentCanvasId, document.viewport.x, document.viewport.y, document.viewport.zoom, setZoom],
  )

  const persistViewport = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      const next = normalizeCanvasViewport(viewport)
      setZoom(next.zoom)
      if (sameCanvasViewport(restoredViewport.current, next)) return
      restoredViewport.current = next
      writeCanvasViewport(currentCanvasId, next)
      announceCommand(`画布视图已保存（${Math.round(next.zoom * 100)}%）`)
    },
    [announceCommand, currentCanvasId, setZoom],
  )

  useEffect(() => {
    const instance = instanceRef.current
    if (!instance) return
    // Restore the local camera when a canvas is first mounted or switched.
    // The shared WorkflowDocument remains untouched: view state belongs to the
    // current browser tab and is deliberately separate from graph mutations.
    restoreViewport(instance)
  }, [restoreViewport])

  return (
    <div
      ref={canvasRef}
      className={cn(
        'h-full w-full',
        !showEdges && 'edges-hidden',
        selectionMode && 'canvas-selection-active',
      )}
      data-testid="workflow-canvas"
      role="region"
      aria-label="工作流画布区域"
      onKeyDownCapture={onCanvasKeyDownCapture}
      // Capture before ReactFlow's controlled selection update can retarget the
      // second click from a node to the pane.
      onDoubleClickCapture={onCanvasDoubleClickCapture}
    >
      <style>{CANVAS_FOCUS_STYLES}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES_MAP}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onEdgeClick={() => {
          onOpenNode(null)
          setSelectedGroupId(null)
        }}
        onInit={(instance) => {
          instanceRef.current = instance
          restoreViewport(instance)
        }}
        onMove={(_, viewport) => setZoom(normalizeCanvasViewport(viewport).zoom)}
        onMoveEnd={persistViewport}
        onPaneClick={() => {
          if (selectionMode) return
          select([])
          setSelectedGroupId(null)
          onOpenNode(null)
        }}
        snapToGrid={snapToGrid}
        snapGrid={SNAP_GRID}
        panOnDrag={toolMode === 'hand' ? true : PAN_BUTTONS}
        selectionOnDrag={toolMode === 'select'}
        minZoom={0.1}
        maxZoom={2.5}
        // d3-zoom's own dblclick handler stops immediate propagation, which
        // would swallow double-click-to-create before it reaches the wrapper.
        zoomOnDoubleClick={false}
        defaultViewport={document.viewport}
        proOptions={PRO_OPTIONS}
        aria-label="工作流画布。使用 Tab 浏览节点，Enter 或空格选择，方向键移动。"
        ariaLabelConfig={FLOW_ARIA_LABEL_CONFIG}
        nodesFocusable
        autoPanOnNodeFocus
        onError={handleFlowError}
        deleteKeyCode={null}
        multiSelectionKeyCode={MULTI_SELECT_KEYS}
        edgesFocusable={!selectionMode}
        edgesReconnectable={!selectionMode}
        nodesDraggable={toolMode === 'select' && !selectionMode}
        elevateNodesOnSelect
        elevateEdgesOnSelect
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1} color="var(--color-ink-300)" />
        {showMinimap && (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            style={{ width: 168, height: 112, marginBottom: 76, marginRight: 16 }}
            // Concrete colours: the minimap paints into its own SVG, where the
            // theme custom properties do not resolve and nodes came out blank.
            nodeColor="#c2c8d2"
            nodeStrokeColor="#9aa3b2"
            nodeStrokeWidth={2}
            maskColor="rgba(244,245,247,0.72)"
            ariaLabel="画布小地图，可拖动平移并滚动缩放。"
          />
        )}
        {/*
          Groups straddle ReactFlow's renderer: the frames belong under the
          cards, but the pane on top of them absorbs every pointer event, so the
          clickable half has to be re-stacked above it.
        */}
        <ViewportLayer transform={transform} zIndex={0}>
          <GroupFrames document={document} selectedGroupId={selectedGroupId} />
        </ViewportLayer>
        <ViewportLayer transform={transform} zIndex={RENDERER_Z}>
          <GroupChrome
            document={document}
            selectedGroupId={selectedGroupId}
            onSelectGroup={setSelectedGroupId}
            onRunGroup={handleRunGroup}
            onUngroup={handleUngroup}
            onConvertToStoryboard={handleConvertToStoryboard}
            onAddToToolbox={handleAddToToolbox}
            onDownloadGroup={handleDownloadGroup}
            onStitch={onStitch}
            onOpenStoryboardConfig={onOpenStoryboardConfig}
          />
        </ViewportLayer>
      </ReactFlow>
      <div
        data-testid="canvas-live-region"
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {commandMessage || liveMessage}
      </div>
      <div
        data-testid="canvas-error-live-region"
        className="sr-only"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        {flowErrorMessage}
      </div>
    </div>
  )
}

const NODE_TYPES_MAP = { card: NodeCard }

/**
 * ReactFlow stacks its renderer at 4 and its panels (minimap, controls) at 5.
 * Matching the renderer puts a layer above the cards on document order alone,
 * without also climbing over the panels.
 */
const RENDERER_Z = 4

/** An overlay pinned to the graph, so its children can use flow coordinates. */
function ViewportLayer({
  transform,
  zIndex,
  children,
}: {
  transform: [number, number, number]
  zIndex: number
  children: React.ReactNode
}) {
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex }}>
      <div
        className="absolute"
        style={{
          transform: `translate(${transform[0]}px, ${transform[1]}px) scale(${transform[2]})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * No provider here on purpose. `CanvasWorkspace` owns the single
 * `ReactFlowProvider`, so the toolbar, shortcuts and sidebar all share this
 * instance — nesting a second provider would give them an empty one whose
 * zoom/fitView/setCenter calls silently do nothing.
 */
export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return <CanvasInner {...props} />
}

/* ------------------------------------------------------------------ *
 * Shared canvas commands, used by both the toolbar and the shortcuts
 * ------------------------------------------------------------------ */

export function useCanvasCommands() {
  const commit = useEditor((s) => s.commit)
  const commitWith = useEditor((s) => s.commitWith)
  const document = useEditor((s) => s.document)
  const selection = useEditor((s) => s.selection)
  const edgeSelection = useEditor((s) => s.edgeSelection)
  const toast = useEditor((s) => s.toast)
  const select = useEditor((s) => s.select)

  /**
   * `preferred` is a hint, not a final position: the free-spot search and the
   * auto-name both run against the document as it exists when the queued write
   * executes, so rapid successive adds neither stack nor collide on names.
   */
  const addNode = useCallback(
    async (type: NodeType, preferred?: { x: number; y: number }) => {
      const placed: { node: WorkflowNode | null } = { node: null }
      const ok = await commitWith((doc) => {
        const at = preferred
          ? freeSpotNear(doc.nodes, preferred, NODE_SIZE[type])
          : nextFreeSpot(doc.nodes)
        const node = createNode(type, at, doc.nodes)
        placed.node = node
        // Selected here, together with the optimistic insert, rather than after
        // the write is acknowledged: the round-trip easily outlives the user's
        // next click, and a late select would take the selection back off
        // whatever they clicked while the node was still being saved.
        select([node.id])
        return [{ op: 'addNode', node }]
      }, `新建${NODE_META[type].label}节点`)

      return ok ? placed.node : null
    },
    [commitWith, select],
  )

  const groupSelection = useCallback(async () => {
    if (selection.length < 2) {
      toast('至少选择两个节点才能成组', 'error')
      return
    }
    const group = createGroup('normal', selection)
    await commit([{ op: 'addGroup', group }], '成组')
  }, [selection, commit, toast])

  const ungroupSelection = useCallback(async () => {
    const groupIds = new Set(
      selection
        .map((id) => document.nodes.find((n) => n.id === id)?.groupId)
        .filter((id): id is string => Boolean(id)),
    )
    if (groupIds.size === 0) {
      toast('选中的节点不在任何分组中', 'error')
      return
    }
    await commit(
      [...groupIds].map((groupId) => ({ op: 'removeGroup' as const, groupId, deleteNodes: false })),
      '解组',
    )
  }, [selection, document.nodes, commit, toast])

  /** ⌘⌥G merges existing storyboard groups; it does not create one. */
  const mergeStoryboardGroups = useCallback(async () => {
    const groups = document.groups.filter(
      (g) => g.kind === 'storyboard' && g.nodeIds.some((id) => selection.includes(id)),
    )
    if (groups.length < 2) {
      toast('合并分镜组需要选中至少两个已有分镜组', 'error')
      return
    }
    const merged = createGroup('storyboard', groups.flatMap((g) => g.nodeIds))
    await commit(
      [
        ...groups.map((g) => ({ op: 'removeGroup' as const, groupId: g.id, deleteNodes: false })),
        { op: 'addGroup', group: merged },
      ],
      '合并分镜组',
    )
  }, [document.groups, selection, commit, toast])

  const duplicateSelection = useCallback(async () => {
    if (selection.length === 0) return
    const sources = document.nodes.filter((n) => selection.includes(n.id))
    const idMap = new Map<string, string>()
    const pool = [...document.nodes]
    const mutations: CanvasMutation[] = []

    for (const source of sources) {
      const copy = createNode(
        source.type,
        { x: source.position.x + 48, y: source.position.y + 48 },
        pool,
        { name: `${source.name}副本`, data: JSON.parse(JSON.stringify(source.data)) },
      )
      idMap.set(source.id, copy.id)
      pool.push(copy)
      mutations.push({ op: 'addNode', node: copy })
    }
    // Internal edges are preserved between the copies; external ones are not.
    for (const edge of document.edges) {
      const source = idMap.get(edge.source)
      const target = idMap.get(edge.target)
      if (source && target) mutations.push({ op: 'addEdge', edge: createEdge(source, target) })
    }
    await commit(mutations, '复制节点和连线')
    select([...idMap.values()])
  }, [selection, document, commit, select])

  const deleteSelection = useCallback(async () => {
    if (selection.length === 0 && edgeSelection.length === 0) return
    await commit(
      [
        ...edgeSelection.map((edgeId) => ({ op: 'removeEdge' as const, edgeId })),
        ...selection.map((nodeId) => ({ op: 'removeNode' as const, nodeId })),
      ],
      edgeSelection.length > 0 && selection.length === 0 ? '删除连线' : '删除节点和连线',
    )
    select([])
  }, [selection, edgeSelection, commit, select])

  const connectSelection = useCallback(async () => {
    if (selection.length < 2) {
      toast('选择两个节点后才能连线', 'error')
      return
    }
    const ordered = document.nodes
      .filter((n) => selection.includes(n.id))
      .sort((a, b) => a.position.x - b.position.x)
    const mutations: CanvasMutation[] = []
    for (let i = 0; i < ordered.length - 1; i += 1) {
      mutations.push({ op: 'addEdge', edge: createEdge(ordered[i].id, ordered[i + 1].id) })
    }
    await commit(mutations, '连线')
  }, [selection, document.nodes, commit, toast])

  /** 整理画布 — pack nodes into a stable grid without changing the graph. */
  const autoArrange = useCallback(async () => {
    if (document.nodes.length === 0) return
    const columns = Math.max(1, Math.ceil(Math.sqrt(document.nodes.length)))
    const gapX = 520
    const gapY = 460
    const ordered = [...document.nodes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const mutations: CanvasMutation[] = ordered.map((node, index) => ({
      op: 'updateNode' as const,
      nodeId: node.id,
      patch: {
        position: {
          x: 120 + (index % columns) * gapX,
          y: 120 + Math.floor(index / columns) * gapY,
        },
      },
    }))
    await commit(mutations, '整理画布')
  }, [document.nodes, commit])

  return {
    addNode,
    groupSelection,
    ungroupSelection,
    mergeStoryboardGroups,
    duplicateSelection,
    deleteSelection,
    connectSelection,
    autoArrange,
  }
}

/** Place a new node to the right of the current content, avoiding overlap. */
export function nextFreeSpot(nodes: WorkflowNode[]): { x: number; y: number } {
  if (nodes.length === 0) return { x: 160, y: 140 }
  const rightMost = nodes.reduce((best, n) => (n.position.x > best.position.x ? n : best), nodes[0])
  return { x: rightMost.position.x + rightMost.size.width + 90, y: rightMost.position.y }
}

const GAP = 60

/**
 * Find a spot near `preferred` that does not overlap an existing node.
 *
 * Without this, adding several nodes in a row from the menu stacks them all at
 * the viewport centre and only the last one is reachable.
 */
export function freeSpotNear(
  nodes: WorkflowNode[],
  preferred: { x: number; y: number },
  size: { width: number; height: number },
): { x: number; y: number } {
  const overlaps = (candidate: { x: number; y: number }) =>
    nodes.some(
      (n) =>
        candidate.x < n.position.x + n.size.width + GAP &&
        candidate.x + size.width + GAP > n.position.x &&
        candidate.y < n.position.y + n.size.height + GAP &&
        candidate.y + size.height + GAP > n.position.y,
    )

  if (!overlaps(preferred)) return preferred

  // Walk outward in a coarse grid: along the row first, then to the next row.
  const stepX = size.width + GAP
  const stepY = size.height + GAP
  for (let row = 0; row < 24; row += 1) {
    for (let col = 0; col < 24; col += 1) {
      const candidate = { x: preferred.x + col * stepX, y: preferred.y + row * stepY }
      if (!overlaps(candidate)) return candidate
    }
  }
  return { x: preferred.x, y: preferred.y + 24 * stepY }
}

export { NODE_SIZE }
