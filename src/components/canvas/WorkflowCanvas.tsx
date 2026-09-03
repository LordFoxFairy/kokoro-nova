'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useStore,
  type Edge,
  type Node as FlowNode,
  type NodeChange,
  type OnConnect,
  type ReactFlowInstance,
} from '@xyflow/react'
import { createEdge, createGroup, createNode, NODE_SIZE } from '@/domain/factory'
import { NODE_META } from '@/domain/nodes'
import { canConvertToStoryboardGroup } from '@/domain/mutations'
import type { CanvasMutation, NodeType, WorkflowNode } from '@/domain/types'
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

interface WorkflowCanvasProps {
  onRun: (nodeId: string) => void
  onCancelJob: (jobId: string) => void
  onOpenNode: (nodeId: string) => void
  onStitch: (groupId: string) => void
  onOpenStoryboardConfig: (groupId: string, anchor: { x: number; y: number }) => void
}

function CanvasInner({
  onRun,
  onCancelJob,
  onOpenNode,
  onStitch,
  onOpenStoryboardConfig,
}: WorkflowCanvasProps) {
  const document = useEditor((s) => s.document)
  const jobs = useEditor((s) => s.jobs)
  const selection = useEditor((s) => s.selection)
  const showEdges = useEditor((s) => s.showEdges)
  const snapToGrid = useEditor((s) => s.snapToGrid)
  const showMinimap = useEditor((s) => s.showMinimap)
  const toolMode = useEditor((s) => s.toolMode)
  const commit = useEditor((s) => s.commit)
  const commitWith = useEditor((s) => s.commitWith)
  const patchLocal = useEditor((s) => s.patchLocal)
  const select = useEditor((s) => s.select)
  const pushAgentRef = useEditor((s) => s.pushAgentRef)
  const setZoom = useEditor((s) => s.setZoom)
  const toast = useEditor((s) => s.toast)

  const flow = useReactFlow()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  // Subscribe to the transform so group frames track pan/zoom every frame.
  const transform = useStore((s) => s.transform)
  const instanceRef = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null)
  /** Positions captured at drag start, so one drag becomes one undo frame. */
  const dragOrigin = useRef<Map<string, { x: number; y: number }> | null>(null)

  const jobByNode = useMemo(() => {
    const map = new Map<string, (typeof jobs)[number]>()
    for (const job of jobs) {
      const existing = map.get(job.nodeId)
      if (!existing || job.createdAt > existing.createdAt) map.set(job.nodeId, job)
    }
    return map
  }, [jobs])

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
    (nodeId: string, intent: string) => {
      void commit(
        [{ op: 'updateNode', nodeId, patch: { data: { ...document.nodes.find((n) => n.id === nodeId)?.data, extra: { intent } } } }],
        '设置文本用途',
      )
      onOpenNode(nodeId)
    },
    [commit, document.nodes, onOpenNode],
  )

  const nodes: FlowNode[] = useMemo(
    () =>
      document.nodes.map((node) => ({
        id: node.id,
        type: 'card',
        position: node.position,
        selected: selection.includes(node.id),
        // Groups render behind nodes; a member still drags independently.
        data: {
          node,
          job: jobByNode.get(node.id) ?? null,
          onOpen: onOpenNode,
          onRun,
          onCancel: onCancelJob,
          onDuplicate: handleDuplicate,
          onDelete: handleDelete,
          onToggleKeyElement: handleToggleKeyElement,
          onAddToAgent: handleAddToAgent,
          onSetIntent: handleSetIntent,
        } satisfies NodeCardData,
      })),
    [
      document.nodes,
      selection,
      jobByNode,
      onOpenNode,
      onRun,
      onCancelJob,
      handleDuplicate,
      handleDelete,
      handleToggleKeyElement,
      handleAddToAgent,
      handleSetIntent,
    ],
  )

  const edges: Edge[] = useMemo(
    () =>
      document.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'default',
        animated: false,
      })),
    [document.edges],
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
        if (mutations.length > 0) void commit(mutations, '移动节点')
      }
    },
    [document.nodes, patchLocal, commit, select],
  )

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return
      void commit([{ op: 'addEdge', edge: createEdge(connection.source, connection.target) }], '连线')
    },
    [commit],
  )

  /**
   * Double-clicking empty canvas creates a text node there — the empty-canvas
   * hint advertises this. Guarded on the pane so double-clicking a card still
   * opens its generator instead of dropping a node underneath it.
   */
  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.classList.contains('react-flow__pane')) return

      const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      void commitWith((doc) => {
        const size = NODE_SIZE.text
        const at = freeSpotNear(doc.nodes, { x: point.x - size.width / 2, y: point.y - size.height / 2 }, size)
        return [{ op: 'addNode', node: createNode('text', at, doc.nodes) }]
      }, '新建文本节点')
    },
    [flow, commitWith],
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

  useEffect(() => {
    const instance = instanceRef.current
    if (!instance) return
    // Restore the saved viewport once the graph is mounted.
    instance.setViewport(document.viewport)
    // Intentionally only on first mount of a canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={cn('h-full w-full', !showEdges && 'edges-hidden')}
      data-testid="workflow-canvas"
      // Bound here rather than on <ReactFlow>, which does not forward this prop.
      onDoubleClick={onPaneDoubleClick}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES_MAP}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onConnect={onConnect}
        onInit={(instance) => {
          instanceRef.current = instance
        }}
        onMove={(_, viewport) => setZoom(viewport.zoom)}
        onPaneClick={() => {
          select([])
          setSelectedGroupId(null)
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
        deleteKeyCode={null}
        multiSelectionKeyCode={MULTI_SELECT_KEYS}
        nodesDraggable={toolMode === 'select'}
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
    if (selection.length === 0) return
    await commit(
      selection.map((nodeId) => ({ op: 'removeNode' as const, nodeId })),
      '删除节点',
    )
    select([])
  }, [selection, commit, select])

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
