'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { createEdge, createNode } from '@/domain/factory'
import {
  createImageDerivedMutations,
  type ImageTransformRequest,
} from '@/domain/image-authoring'
import { SLASH_PRESETS, type CharacterPreset } from '@/domain/libraries'
import { quoteCredits } from '@/domain/models'
import { instantiatePreset, PRESETS_BY_ID, type ToolboxPreset } from '@/domain/presets'
import { ids, newId } from '@/domain/ids'
import {
  pruneVideoReferenceExtras,
  readVideoElementMarks,
  toggleVideoReference,
} from '@/domain/video-references'
import type {
  Artifact,
  Asset,
  CanvasMutation,
  GenerationJob,
  NodeData,
  NodeType,
  WorkflowNode,
  WorkflowGroup,
} from '@/domain/types'
import { ApiError, client } from '@/lib/api'
import { useEditor } from '@/lib/editor-store'
import { AgentPanel } from '../agent/AgentPanel'
import { AssetLibraryPanel } from '../assets/AssetLibraryPanel'
import { DirectorStudio, type CapturedShot, type DirectorScene } from '../director/DirectorStudio'
import { LegacyScriptWizard } from '../script/ScriptWizard'
import { ScriptV2BatchMaterializeDialog } from '../script/ScriptV2Dialogs'
import { ScriptV2Workspace, type ScriptV2StateChange } from '../script/ScriptV2Workspace'
import type { ScriptDraft } from '../script/script-model'
import { readScriptV2State } from '@/domain/script-v2'
import { createScriptV2BatchMutations, type ScriptV2BatchKind, type ScriptV2BatchMaterializeOptions } from '@/domain/script-v2-mock'
import { StoryboardView } from '../storyboard/StoryboardView'
import { duplicateStoryboardNode } from '@/domain/storyboard'
import { Menu } from '../ui/Menu'
import { Spinner } from '../ui/controls'
import { AssetSidebar } from './AssetSidebar'
import { PresenceLayer } from './PresenceLayer'
import { BottomToolbar } from './BottomToolbar'
import { CharacterPanel, HistoryPanel, MaterialPanel, ToolboxPanel } from './LibraryPanels'
import { NodeInspector } from './NodeInspector'
import { ShortcutsPanel, useCanvasShortcuts } from './shortcuts'
import { TopBar } from './TopBar'
import { ConfirmGate } from './ConfirmGate'
import { Toasts } from './Toasts'
import {
  getCanvasZoomAnnouncement,
  shouldYieldNativeCanvasKey,
  WorkflowCanvas,
  useCanvasCommands,
  nextFreeSpot,
} from './WorkflowCanvas'
import { NODE_SIZE } from '@/domain/factory'

/** Poll interval while at least one job is in flight. */
const POLL_MS = 1200

const CANVAS_RESPONSIVE_STYLES = `
[data-app-shell="editor"] [data-testid="canvas-toolbar"] button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

@media (max-width: 760px) {
  [data-app-shell="editor"] [data-testid="editor-topbar"] {
    left: 0.5rem;
    right: 0.5rem;
    top: 0.5rem;
    height: auto;
    min-height: 2rem;
    align-items: flex-start;
    gap: 0.5rem;
    overflow-x: auto;
  }
  [data-app-shell="editor"] [data-testid="editor-topbar"] > div:first-child {
    height: auto;
    max-width: 100%;
    flex-wrap: wrap;
  }
  [data-app-shell="editor"] [data-testid="project-canvas-control"] {
    max-width: calc(100vw - 1rem);
  }
  [data-app-shell="editor"] [data-testid="editor-account-actions"] {
    flex: 0 0 auto;
    max-width: calc(100vw - 1rem);
    overflow-x: auto;
  }
  [data-app-shell="editor"] [data-testid="canvas-status-rail"] {
    left: 0.5rem;
    right: 0.5rem;
    bottom: 4.5rem;
    max-width: calc(100vw - 1rem);
    overflow-x: auto;
    white-space: nowrap;
  }
  [data-app-shell="editor"] [data-testid="canvas-primary-rail"] {
    left: 0.5rem;
    right: 0.5rem;
    bottom: 0.5rem;
    max-width: calc(100vw - 1rem);
    transform: none;
    overflow-x: auto;
    justify-content: flex-start;
  }
  [data-app-shell="editor"] [data-testid="canvas-status-rail"] > *,
  [data-app-shell="editor"] [data-testid="canvas-primary-rail"] > * {
    flex: 0 0 auto;
  }
  [data-app-shell="editor"] [data-testid="rf__minimap"] {
    max-width: calc(100vw - 1rem);
    margin-right: 0.5rem !important;
    margin-bottom: 8.5rem !important;
  }
  [data-app-shell="editor"] [data-testid="agent-panel"] {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(340px, 100vw);
  }
  [data-app-shell="editor"] [data-testid="asset-sidebar"] {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(280px, 88vw) !important;
  }
}
`

function WorkspaceInner({ projectId, canvasId }: { projectId: string; canvasId?: string }) {
  const flow = useReactFlow()
  const load = useEditor((s) => s.load)
  const loading = useEditor((s) => s.loading)
  const project = useEditor((s) => s.project)
  const viewMode = useEditor((s) => s.viewMode)
  const setViewMode = useEditor((s) => s.setViewMode)
  const loadedCanvasId = useEditor((s) => s.canvasId)
  const document = useEditor((s) => s.document)
  const jobs = useEditor((s) => s.jobs)
  const leftPanel = useEditor((s) => s.leftPanel)
  const setLeftPanel = useEditor((s) => s.setLeftPanel)
  const inspectedNodeId = useEditor((s) => s.inspectedNodeId)
  const inspect = useEditor((s) => s.inspect)
  const commit = useEditor((s) => s.commit)
  const commitWith = useEditor((s) => s.commitWith)
  const upsertJob = useEditor((s) => s.upsertJob)
  const setBalance = useEditor((s) => s.setBalance)
  const applyServerDocument = useEditor((s) => s.applyServerDocument)
  const select = useEditor((s) => s.select)
  const toast = useEditor((s) => s.toast)
  const zoom = useEditor((s) => s.zoom)
  const showMinimap = useEditor((s) => s.showMinimap)
  const assetSidebarOpen = useEditor((s) => s.assetSidebarOpen)
  const showEdges = useEditor((s) => s.showEdges)
  const snapToGrid = useEditor((s) => s.snapToGrid)
  const toolMode = useEditor((s) => s.toolMode)

  const commands = useCanvasCommands()
  const [materialKind, setMaterialKind] = useState<'style' | 'effect'>('style')
  /** When set, choosing a style binds it to this Image node instead of dropping a free node. */
  const [materialTargetNodeId, setMaterialTargetNodeId] = useState<string | null>(null)
  const [pendingJob, setPendingJob] = useState<GenerationJob | null>(null)
  /** Node whose full-screen editor is open; its type selects which one. */
  const [studioNodeId, setStudioNodeId] = useState<string | null>(null)
  const [scriptBatchRequest, setScriptBatchRequest] = useState<{
    nodeId: string
    kind: ScriptV2BatchKind
  } | null>(null)
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false)
  const [storyboardConfig, setStoryboardConfig] = useState<{ groupId: string; anchor: { x: number; y: number } } | null>(
    null,
  )
  const [selectionMode, setSelectionMode] = useState<{
    kind: 'reference' | 'element'
    targetNodeId: string
  } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [canvasError, setCanvasError] = useState<string | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    setLoadError(null)
    setSessionExpired(false)
    void load(projectId, canvasId)
      .then(() => {
        if (!active) return
        const state = useEditor.getState()
        if (!state.project || state.projectId !== projectId) {
          setLoadError('画布加载失败，请重试。')
        }
      })
      .catch((error) => {
        if (!active) return
        if (error instanceof ApiError && error.status === 401) {
          setSessionExpired(true)
          return
        }
        setLoadError(error instanceof Error ? error.message : '画布加载失败，请重试。')
      })
    return () => {
      active = false
    }
  }, [projectId, canvasId, load, loadAttempt])

  /* ---------------- generation ---------------- */

  const runNode = useCallback(
    async (nodeId: string) => {
      const currentCanvasId = useEditor.getState().canvasId
      if (!currentCanvasId) return
      try {
        const { job } = await client.jobs.create({
          canvasId: currentCanvasId,
          nodeId,
        })
        upsertJob(job)
        // Confirm gate: a quoted job waits for explicit approval.
        setPendingJob(job)
      } catch (error) {
        toast(error instanceof Error ? error.message : '无法提交生成', 'error')
      }
    },
    [upsertJob, toast],
  )

  const confirmJob = useCallback(
    async (jobId: string) => {
      try {
        const { job, balance } = await client.jobs.transition(jobId, 'confirm')
        upsertJob(job)
        setBalance(balance)
        setPendingJob(null)
      } catch (error) {
        // Keep the confirmation gate mounted so typed fixture/capability errors
        // remain actionable instead of disappearing behind a toast.
        toast(error instanceof Error ? error.message : '确认失败', 'error')
        throw error
      }
    },
    [upsertJob, setBalance, toast],
  )

  const cancelJob = useCallback(
    async (jobId: string) => {
      try {
        const { job, balance } = await client.jobs.transition(jobId, 'cancel')
        upsertJob(job)
        setBalance(balance)
        setPendingJob(null)
      } catch (error) {
        toast(error instanceof Error ? error.message : '取消失败', 'error')
      }
    },
    [upsertJob, setBalance, toast],
  )

  /** A terminal retry is server-idempotent and always reopens the confirmation gate. */
  const retryJob = useCallback(
    async (jobId: string) => {
      try {
        const { job, balance } = await client.jobs.transition(jobId, 'retry')
        upsertJob(job)
        setBalance(balance)
        setPendingJob(job)
      } catch (error) {
        toast(error instanceof Error ? error.message : '重试失败', 'error')
      }
    },
    [upsertJob, setBalance, toast],
  )

  // Poll in-flight jobs; terminal states rewrite the document server-side.
  const activeJobIds = useMemo(
    () => jobs.filter((j) => j.status === 'queued' || j.status === 'running').map((j) => j.id),
    [jobs],
  )
  const pollRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (activeJobIds.length === 0) return
    const timer = setInterval(async () => {
      for (const jobId of activeJobIds) {
        if (pollRef.current.has(jobId)) continue
        pollRef.current.add(jobId)
        try {
          const result = await client.jobs.get(jobId)
          upsertJob(result.job)
          setBalance(result.balance)
          if (result.document && result.revision !== null) {
            applyServerDocument(result.document, result.revision)
          }
          if (result.job.status === 'failed' || result.job.status === 'compliance_blocked') {
            toast(result.job.error ?? '生成失败', 'error')
          }
        } catch {
          // Transient failures are retried on the next tick.
        } finally {
          pollRef.current.delete(jobId)
        }
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [activeJobIds, upsertJob, setBalance, applyServerDocument, toast])

  /* ---------------- node helpers ---------------- */

  const patchNode = useCallback(
    (nodeId: string, patch: Partial<NodeData>) => {
      const node = useEditor.getState().document.nodes.find((n) => n.id === nodeId)
      if (!node) return
      void commit([{ op: 'updateNode', nodeId, patch: { data: { ...node.data, ...patch } } }], '编辑节点')
    },
    [commit],
  )

  const persistScriptV2State = useCallback(
    async (nodeId: string, change: ScriptV2StateChange, label = '编辑脚本节点') => {
      await commitWith((current) => {
        const node = current.nodes.find((candidate) => candidate.id === nodeId)
        if (!node || node.type !== 'script') return []
        const currentState = readScriptV2State(node.data.extra, node.id)
        const state = typeof change === 'function' ? change(currentState) : change
        if (state === currentState) return []
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

  /** Open the shared batch settings sheet; no graph write happens here. */
  const requestScriptBatch = useCallback((nodeId: string, kind: ScriptV2BatchKind) => {
    setScriptBatchRequest({ nodeId, kind })
  }, [])

  /** Materialize the confirmed selection as one revision and one undo frame. */
  const confirmScriptBatch = useCallback(
    async (options: ScriptV2BatchMaterializeOptions) => {
      const request = scriptBatchRequest
      if (!request) return
      let createdNodeIds: string[] = []
      let blockedReason: string | null = null
      let producedMutations = false
      const ok = await commitWith((current) => {
        const source = current.nodes.find((candidate) => candidate.id === request.nodeId)
        if (!source || source.type !== 'script') {
          blockedReason = '脚本节点不存在'
          return []
        }
        const state = readScriptV2State(source.data.extra, source.id)
        const result = createScriptV2BatchMutations(current, request.nodeId, state, request.kind, options)
        createdNodeIds = result.createdNodeIds
        blockedReason = result.blockedReason
        producedMutations = result.mutations.length > 0
        return result.mutations
      }, request.kind === 'image' ? '批量生成分镜' : '批量生视频')
      if (blockedReason) throw new Error(blockedReason)
      // An empty mutation list with known output IDs is an idempotent replay:
      // a previous request committed successfully but its response was lost.
      // Do not turn that recovery path into a duplicate graph transaction.
      if ((producedMutations && !ok) || createdNodeIds.length === 0) throw new Error('批量生成没有创建节点')

      setScriptBatchRequest(null)
      setStudioNodeId(null)
      inspect(null)
      select(createdNodeIds)
      toast(`已创建 ${createdNodeIds.length} 个待确认${request.kind === 'image' ? '图片' : '视频'}节点`, 'success')
      window.requestAnimationFrame(() => {
        flow.fitView({ nodes: createdNodeIds.map((id) => ({ id })), duration: 400, padding: 0.24 })
      })
    },
    [commitWith, flow, inspect, scriptBatchRequest, select, toast],
  )

  const focusCanvasNodeElement = useCallback((nodeId: string) => {
    const focus = (attempt = 0) => {
      const nodeElement = [...window.document.querySelectorAll<HTMLElement>('.react-flow__node')].find(
        (element) => element.dataset.id === nodeId,
      )
      if (nodeElement) {
        nodeElement.focus({ preventScroll: true })
        return
      }
      // A view switch mounts React Flow asynchronously. Retry for a few
      // frames so a locate request cannot be lost between the two views.
      if (attempt < 8) window.requestAnimationFrame(() => focus(attempt + 1))
    }
    window.requestAnimationFrame(() => focus())
  }, [])

  const locateNode = useCallback(
    (nodeId: string) => {
      const node = useEditor.getState().document.nodes.find((n) => n.id === nodeId)
      if (!node) return
      select([nodeId])
      flow.setCenter(node.position.x + node.size.width / 2, node.position.y + node.size.height / 2, {
        zoom: Math.max(0.7, flow.getZoom()),
        duration: 320,
      })
      focusCanvasNodeElement(nodeId)
    },
    [flow, focusCanvasNodeElement, select],
  )

  const openWorkflowNode = useCallback(
    (nodeId: string) => {
      setViewMode('workflow')
      // Wait for the workflow view to mount before querying its React Flow
      // node; the second frame makes the handoff focusable instead of only
      // updating the store selection.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => locateNode(nodeId))
      })
    },
    [locateNode, setViewMode],
  )

  const duplicateStoryboardCard = useCallback(
    async (nodeId: string) => {
      const created: { node: WorkflowNode | null } = { node: null }
      const ok = await commitWith((doc) => {
        const result = duplicateStoryboardNode(doc, nodeId)
        created.node = result?.node ?? null
        return result?.mutations ?? []
      }, '创建副本')
      if (!ok || !created.node) return
      toast('已在工作流中创建副本', 'success')
      setViewMode('workflow')
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => locateNode(created.node!.id))
      })
    },
    [commitWith, locateNode, setViewMode, toast],
  )

  const startCanvasSelection = useCallback(
    (kind: 'reference' | 'element', targetNodeId: string) => {
      const target = useEditor.getState().document.nodes.find((node) => node.id === targetNodeId)
      const supported =
        target?.type === 'video' ||
        target?.type === 'image' ||
        (target?.type === 'text' && kind === 'reference') ||
        (target?.type === 'audio' && kind === 'reference')
      if (!supported) return
      setLeftPanel(null)
      setStoryboardConfig(null)
      inspect(targetNodeId)
      setSelectionMode({ kind, targetNodeId })
    },
    [inspect, setLeftPanel],
  )

  const returnFromSelection = useCallback(() => {
    const targetNodeId = selectionMode?.targetNodeId
    setSelectionMode(null)
    if (!targetNodeId) return
    inspect(targetNodeId)
    window.requestAnimationFrame(() => locateNode(targetNodeId))
  }, [inspect, locateNode, selectionMode])

  const exitSelection = useCallback(() => {
    const targetNodeId = selectionMode?.targetNodeId
    setSelectionMode(null)
    inspect(null)
    if (targetNodeId) focusCanvasNodeElement(targetNodeId)
  }, [focusCanvasNodeElement, inspect, selectionMode])

  const toggleSelectedReference = useCallback(
    async (sourceNodeId: string) => {
      const targetNodeId = selectionMode?.targetNodeId
      if (!targetNodeId || selectionMode.kind !== 'reference') return
      await commitWith((doc) => {
        const removing = doc.edges.some(
          (edge) => edge.source === sourceNodeId && edge.target === targetNodeId,
        )
        const mutations = toggleVideoReference(doc, targetNodeId, sourceNodeId)
        if (!removing) return mutations
        const target = doc.nodes.find((node) => node.id === targetNodeId)
        if (!target) return mutations
        return [
          ...mutations,
          {
            op: 'updateNode' as const,
            nodeId: targetNodeId,
            patch: {
              data: {
                ...target.data,
                extra: pruneVideoReferenceExtras(target.data.extra, sourceNodeId),
              },
            },
          },
        ]
      }, '选择画布参考')
    },
    [commitWith, selectionMode],
  )

  const removeVideoReference = useCallback(
    async (targetNodeId: string, sourceNodeId: string) => {
      await commitWith((doc) => {
        const target = doc.nodes.find((node) => node.id === targetNodeId)
        if (!target) return []
        const edge = doc.edges.find(
          (candidate) => candidate.source === sourceNodeId && candidate.target === targetNodeId,
        )
        if (!edge) return []
        return [
          { op: 'removeEdge' as const, edgeId: edge.id },
          {
            op: 'updateNode' as const,
            nodeId: targetNodeId,
            patch: {
              data: {
                ...target.data,
                extra: pruneVideoReferenceExtras(target.data.extra, sourceNodeId),
              },
            },
          },
        ]
      }, '移除画布参考')
    },
    [commitWith],
  )

  const selectElementSource = useCallback(
    async (sourceNodeId: string) => {
      const targetNodeId = selectionMode?.targetNodeId
      if (!targetNodeId || selectionMode.kind !== 'element') return

      const markId = newId('elm')
      const ok = await commitWith((doc) => {
        const target = doc.nodes.find((node) => node.id === targetNodeId)
        if (!target) return []
        const marks = readVideoElementMarks(target.data.extra)
        const referenceExists = doc.edges.some(
          (edge) => edge.source === sourceNodeId && edge.target === targetNodeId,
        )
        const referenceMutations = referenceExists
          ? []
          : toggleVideoReference(doc, targetNodeId, sourceNodeId)
        const nextMark = {
          id: markId,
          nodeId: sourceNodeId,
          x: 0.22,
          y: 0.18,
          width: 0.44,
          height: 0.58,
          label: `元素 ${marks.length + 1}`,
        }
        return [
          ...referenceMutations,
          {
            op: 'updateNode' as const,
            nodeId: targetNodeId,
            patch: {
              data: {
                ...target.data,
                extra: { ...target.data.extra, elementMarks: [...marks, nextMark] },
              },
            },
          },
        ]
      }, '标记视频参考元素')

      if (ok) {
        setSelectionMode(null)
        inspect(targetNodeId)
        window.requestAnimationFrame(() => locateNode(targetNodeId))
      }
    },
    [commitWith, inspect, locateNode, selectionMode],
  )

  const selectCanvasCandidate = useCallback(
    (sourceNodeId: string) => {
      if (selectionMode?.kind === 'reference') void toggleSelectedReference(sourceNodeId)
      if (selectionMode?.kind === 'element') void selectElementSource(sourceNodeId)
    },
    [selectElementSource, selectionMode, toggleSelectedReference],
  )

  /** Pan so a rect in flow coordinates sits inside the visible canvas area. */
  const ensureVisible = useCallback(
    (position: { x: number; y: number }, size: { width: number; height: number }) => {
      const topLeft = flow.flowToScreenPosition({ x: position.x, y: position.y })
      const bottomRight = flow.flowToScreenPosition({
        x: position.x + size.width,
        y: position.y + size.height,
      })

      // Reserve room for the top bar and the right-hand drawers.
      const inside =
        topLeft.x > 32 &&
        topLeft.y > 80 &&
        bottomRight.x < window.innerWidth - 32 &&
        bottomRight.y < window.innerHeight - 100

      if (!inside) {
        flow.setCenter(position.x + size.width / 2, position.y + size.height / 2, {
          zoom: flow.getZoom(),
          duration: 260,
        })
      }
    },
    [flow],
  )

  const addNodeAtViewportCenter = useCallback(
    async (type: NodeType) => {
      const center = flow.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })
      const size = NODE_SIZE[type]
      // The store resolves the final, non-overlapping spot near this hint.
      const node = await commands.addNode(type, {
        x: center.x - size.width / 2,
        y: center.y - size.height / 2,
      })
      // Avoidance can push the node past the edge of the viewport; follow it so
      // a freshly created node is never left off-screen.
      if (node) ensureVisible(node.position, node.size)
    },
    [flow, commands, ensureVisible],
  )

  /* ---------------- library actions ---------------- */

  const usePreset = useCallback(
    async (preset: ToolboxPreset) => {
      const doc = useEditor.getState().document
      const origin = nextFreeSpot(doc.nodes)
      const { mutations, nodes } = instantiatePreset(preset, origin, doc.nodes)
      const ok = await commit(mutations, `使用模板 ${preset.name}`)
      if (ok) {
        select(nodes.map((n) => n.id))
        flow.fitView({ nodes: nodes.map((n) => ({ id: n.id })), duration: 400, padding: 0.35 })
      }
    },
    [commit, select, flow],
  )

  const applyMaterial = useCallback(
    async (preset: { id: string; name: string; hue: number }, kind: 'style' | 'effect') => {
      const targetNodeId = kind === 'style' ? materialTargetNodeId : null
      await commitWith((doc) => {
        const target = targetNodeId ? doc.nodes.find((item) => item.id === targetNodeId) : null
        if (targetNodeId && target?.type !== 'image') return []
        const position = target
          ? { x: target.position.x - 360, y: target.position.y + 40 }
          : nextFreeSpot(doc.nodes)
        const node = createNode(kind, position, doc.nodes, { name: preset.name })
        node.data.extra = { presetId: preset.id, presetName: preset.name, hue: preset.hue }
        const mutations: CanvasMutation[] = [{ op: 'addNode', node }]

        if (target?.type === 'image') {
          mutations.push({ op: 'addEdge', edge: createEdge(node.id, target.id) })
          mutations.push({
            op: 'updateNode',
            nodeId: target.id,
            patch: {
              data: {
                ...target.data,
                extra: {
                  ...target.data.extra,
                  imageStyle: {
                    nodeId: node.id,
                    presetId: preset.id,
                    name: preset.name,
                  },
                },
              },
            },
          })
        }
        return mutations
      }, `添加${kind === 'style' ? '风格' : '特效'}节点`)
      setMaterialTargetNodeId(null)
    },
    [commitWith, materialTargetNodeId],
  )

  const openImageStyle = useCallback(
    (nodeId: string) => {
      const node = useEditor.getState().document.nodes.find((item) => item.id === nodeId)
      if (node?.type !== 'image') return
      setMaterialTargetNodeId(nodeId)
      setMaterialKind('style')
      setLeftPanel('material')
    },
    [setLeftPanel],
  )

  const applyImageTool = useCallback(
    async (sourceNodeId: string, request: ImageTransformRequest) => {
      const created: { id: string | null } = { id: null }
      const ok = await commitWith((doc) => {
        const source = doc.nodes.find((item) => item.id === sourceNodeId)
        if (source?.type !== 'image' && source?.type !== 'director') return []
        const result = createImageDerivedMutations(doc, sourceNodeId, request)
        created.id = result.node.id
        return result.mutations
      }, `图片工具 ${request.label}`)
      if (!ok || !created.id) return
      select([created.id])
      inspect(created.id)
      toast(`已创建「${request.label}」待确认节点`, 'success')
    },
    [commitWith, inspect, select, toast],
  )

  /** Applying a character creates four independent reference image nodes. */
  const applyCharacter = useCallback(
    async (character: CharacterPreset) => {
      const doc = useEditor.getState().document
      const origin = nextFreeSpot(doc.nodes)
      const pool = [...doc.nodes]
      const mutations: CanvasMutation[] = []

      character.references.forEach((reference, index) => {
        const node = createNode(
          'image',
          { x: origin.x + (index % 2) * 440, y: origin.y + Math.floor(index / 2) * 400 },
          pool,
          { name: `${character.name} · ${reference.label}` },
        )
        node.data.prompt = `${character.name}的${reference.label}`
        node.data.artifacts = [
          {
            id: ids.artifact(),
            jobId: 'character-library',
            kind: 'image',
            url: `/api/preview/character?hue=${reference.hue}&label=${encodeURIComponent(reference.label)}`,
            thumbnailUrl: `/api/preview/character?hue=${reference.hue}&label=${encodeURIComponent(reference.label)}`,
            width: 1024,
            height: 1024,
            durationSeconds: null,
            createdAt: new Date().toISOString(),
            modelId: 'lib-image-2',
            assetId: null,
          },
        ]
        pool.push(node)
        mutations.push({ op: 'addNode', node })
      })

      await commit(mutations, `应用角色 ${character.name}`)
    },
    [commit],
  )

  /** Drop a library asset onto the canvas as a media node already bound to it. */
  const insertAsset = useCallback(
    async (asset: Asset) => {
      const type: NodeType = asset.kind === 'video' ? 'video' : asset.kind === 'audio' ? 'audio' : 'image'
      await commitWith((doc) => {
        const node = createNode(type, nextFreeSpot(doc.nodes), doc.nodes, { name: asset.name })
        node.data.artifacts = [
          {
            id: ids.artifact(),
            jobId: 'asset-library',
            kind: asset.kind,
            url: asset.url,
            thumbnailUrl: asset.thumbnailUrl,
            width: asset.width,
            height: asset.height,
            durationSeconds: asset.durationSeconds,
            createdAt: new Date().toISOString(),
            modelId: 'lib-image-2',
            assetId: asset.id,
          },
        ]
        return [{ op: 'addNode', node }]
      }, '从资产库添加')
    },
    [commitWith],
  )

  /**
   * Turn a confirmed shot list into one node per shot, each wired to the script
   * node so the storyboard shows where every frame came from.
   */
  const batchFromShots = useCallback(
    async (scriptNodeId: string, draft: ScriptDraft, kind: 'image' | 'video') => {
      const shots = draft.shots.filter((shot) => shot.finalPrompt.trim())
      if (shots.length === 0) {
        toast('没有可用的最终提示词', 'error')
        return
      }

      await commitWith((doc) => {
        const source = doc.nodes.find((n) => n.id === scriptNodeId)
        if (!source) return []
        const pool = [...doc.nodes]
        const mutations: CanvasMutation[] = []

        shots.forEach((shot, index) => {
          const node = createNode(
            kind,
            { x: source.position.x + source.size.width + 160, y: source.position.y + index * 420 },
            pool,
            { name: `镜头 ${index + 1}` },
          )
          node.data.prompt = shot.finalPrompt
          if (kind === 'video') {
            node.data.output = { ...node.data.output, durationSeconds: shot.durationSeconds as 5 | 10 | 15 }
          }
          pool.push(node)
          mutations.push({ op: 'addNode', node })
          mutations.push({ op: 'addEdge', edge: createEdge(source.id, node.id) })
        })
        return mutations
      }, kind === 'video' ? '批量生视频' : '批量生图')

      toast(`已创建 ${shots.length} 个待确认${kind === 'video' ? '视频' : '图片'}节点`, 'success')
    },
    [commitWith, toast],
  )

  const insertArtifact = useCallback(
    async (artifact: Artifact) => {
      const doc = useEditor.getState().document
      const type: NodeType = artifact.kind === 'video' ? 'video' : artifact.kind === 'audio' ? 'audio' : 'image'
      const node = createNode(type, nextFreeSpot(doc.nodes), doc.nodes)
      node.data.artifacts = [artifact]
      await commit([{ op: 'addNode', node }], '从生成历史添加')
    },
    [commit],
  )

  /** Slash presets create a pending node wired to the source as a reference. */
  const applySlash = useCallback(
    async (sourceNodeId: string, presetId: string) => {
      const preset = SLASH_PRESETS.find((p) => p.id === presetId) ?? SLASH_PRESETS[0]
      await applyImageTool(sourceNodeId, {
        tool: 'preset',
        label: preset.name,
        prompt: preset.promptTemplate,
        output: preset.output,
        credits: quoteCredits('lib-image-2', preset.output).credits,
        parameters: { presetId: preset.id },
      })
    },
    [applyImageTool],
  )

  /** 拼接 creates a new stitched image node from the storyboard group. */
  const stitchGroup = useCallback(
    async (groupId: string) => {
      const doc = useEditor.getState().document
      const group = doc.groups.find((g) => g.id === groupId)
      if (!group?.storyboard) return
      const members = doc.nodes.filter((n) => group.nodeIds.includes(n.id))
      const bottom = Math.max(...members.map((n) => n.position.y + n.size.height))
      const left = Math.min(...members.map((n) => n.position.x))

      const node = createNode('image', { x: left, y: bottom + 140 }, doc.nodes, { name: '分镜拼接-2k' })
      node.data.artifacts = [
        {
          id: ids.artifact(),
          jobId: 'storyboard-stitch',
          kind: 'image',
          url: `/api/preview/stitch?rows=${group.storyboard.grid.rows}&cols=${group.storyboard.grid.cols}&seq=${group.storyboard.showSequenceNumbers ? 1 : 0}`,
          thumbnailUrl: `/api/preview/stitch?rows=${group.storyboard.grid.rows}&cols=${group.storyboard.grid.cols}&seq=${group.storyboard.showSequenceNumbers ? 1 : 0}`,
          width: 2048,
          height: 1152,
          durationSeconds: null,
          createdAt: new Date().toISOString(),
          modelId: 'lib-image-2',
          assetId: null,
        },
      ]
      await commit([{ op: 'addNode', node }], '分镜拼接')
    },
    [commit],
  )

  /* ---------------- shortcuts ---------------- */

  const runSelection = useCallback(() => {
    for (const nodeId of useEditor.getState().selection) void runNode(nodeId)
  }, [runNode])

  useCanvasShortcuts(
    {
      onGroup: () => void commands.groupSelection(),
      onMergeStoryboard: () => void commands.mergeStoryboardGroups(),
      onUngroup: () => void commands.ungroupSelection(),
      onConnect: () => void commands.connectSelection(),
      onDuplicate: () => void commands.duplicateSelection(),
      onRunSelection: runSelection,
      onNewNode: () => void addNodeAtViewportCenter('text'),
      onDelete: () => void commands.deleteSelection(),
      onArrange: () => void commands.autoArrange(),
    },
    viewMode === 'workflow' && !pendingJob,
  )

  const onEditorKeyDownCapture = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null
    if (!target) return

    const nativeControl = target.closest(
      'a, button, input, select, textarea, [contenteditable="true"], [role="button"]',
    )
    const hasFocusableAncestor = Boolean(
      target.closest('[tabindex]:not([tabindex="-1"]), a, button, input, select, textarea'),
    )
    const isNativeFocusable = shouldYieldNativeCanvasKey({
      tagName: target.tagName,
      isContentEditable: target.isContentEditable,
      hasFocusableAncestor,
    })

    // The legacy canvas shortcut hook treats Tab as “new node”. Let the
    // browser move focus whenever the user is already in an interactive
    // control, while preserving the canvas shortcut from the pane itself.
    if (event.key === 'Tab' && isNativeFocusable) {
      event.stopPropagation()
      return
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && nativeControl) {
      event.stopPropagation()
    }
  }, [])

  useEffect(() => {
    const root = toolbarRef.current
    if (!root) return

    const setPressed = (selector: string, pressed: boolean) => {
      root.querySelector<HTMLButtonElement>(selector)?.setAttribute('aria-pressed', String(pressed))
    }

    setPressed('[data-testid="asset-sidebar-toggle"]', assetSidebarOpen)
    setPressed('[aria-label="小地图"]', showMinimap)
    setPressed('[aria-label="隐藏连线"], [aria-label="显示连线"]', showEdges)
    setPressed('[aria-label="网格吸附"]', snapToGrid)
    setPressed('[aria-label="移动工具 (V)"]', toolMode === 'select')
    setPressed('[aria-label="工具箱"]', leftPanel === 'toolbox')
    setPressed('[aria-label="素材库"]', leftPanel === 'material')
    setPressed('[aria-label="角色库"]', leftPanel === 'character')
    setPressed('[aria-label="生成历史"]', leftPanel === 'history')
    setPressed('[aria-label="快捷键"]', leftPanel === 'shortcuts')

    const assetToggle = root.querySelector<HTMLButtonElement>('[data-testid="asset-sidebar-toggle"]')
    assetToggle?.setAttribute('aria-expanded', String(assetSidebarOpen))

    const addButton = root.querySelector<HTMLButtonElement>('[data-testid="add-node-button"]')
    addButton?.setAttribute('aria-haspopup', 'menu')

    const zoomButton = root.querySelector<HTMLButtonElement>('[data-testid="zoom-readout"]')
    zoomButton?.setAttribute('aria-label', `${getCanvasZoomAnnouncement(zoom)} 点击此按钮重置缩放。`)
    zoomButton?.setAttribute('aria-describedby', 'canvas-zoom-help')
    zoomButton?.setAttribute(
      'aria-keyshortcuts',
      'Control+Plus Control+Minus Control+0 Meta+Plus Meta+Minus Meta+0',
    )
  }, [assetSidebarOpen, leftPanel, showEdges, showMinimap, snapToGrid, toolMode, zoom])

  const studioNode = document.nodes.find((n) => n.id === studioNodeId) ?? null
  const scriptV2CanvasImages = document.nodes.flatMap((node) => {
    const artifact = node.data.artifacts?.find((candidate) => candidate.kind === 'image')
    if (!artifact) return []
    return [{
      nodeId: node.id,
      name: node.name,
      url: artifact.thumbnailUrl ?? artifact.url,
      artifactId: artifact.id,
    }]
  })
  const inspectedNode = document.nodes.find((n) => n.id === inspectedNodeId) ?? null
  const inspectedJob = inspectedNode?.data.jobId
    ? jobs.find((j) => j.id === inspectedNode.data.jobId) ?? null
    : null

  const storyboardGroup: WorkflowGroup | null = storyboardConfig
    ? document.groups.find((g) => g.id === storyboardConfig.groupId) ?? null
    : null

  const loadFailure = loadError ?? (!project ? '画布加载失败，请重试。' : null)
  const handleCanvasError = useCallback(
    (message: string) => {
      setCanvasError(message)
      toast(message, 'error')
    },
    [toast],
  )

  if (loading) {
    return (
      <div
        data-testid="canvas-loading"
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="flex h-screen items-center justify-center gap-2 text-ink-400"
      >
        <Spinner /> <span>正在加载画布</span>
      </div>
    )
  }

  if (sessionExpired) {
    return (
      <section
        data-testid="canvas-session-expired"
        role="status"
        aria-live="assertive"
        className="flex h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center text-ink-700"
      >
        <h1 className="text-base font-semibold text-ink-900">编辑会话已过期</h1>
        <p className="max-w-md text-sm text-ink-500">会话已过期，请刷新页面</p>
        <button
          type="button"
          data-testid="canvas-session-refresh"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-accent"
        >
          刷新页面
        </button>
      </section>
    )
  }

  if (loadFailure) {
    return (
      <section
        data-testid="canvas-load-error"
        role="alert"
        aria-live="assertive"
        className="flex h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center text-ink-700"
      >
        <h1 className="text-base font-semibold text-ink-900">画布加载失败</h1>
        <p className="max-w-md text-sm text-ink-500">{loadFailure}</p>
        <button
          type="button"
          onClick={() => {
            setLoadError(null)
            setLoadAttempt((attempt) => attempt + 1)
          }}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-accent hover:bg-accent/90"
        >
          重试
        </button>
      </section>
    )
  }

  return (
    <div
      data-app-shell="editor"
      className="relative flex h-screen w-screen overflow-hidden bg-canvas"
      aria-label="LibTV 工作流编辑器"
    >
      <style>{CANVAS_RESPONSIVE_STYLES}</style>
      {!selectionMode && <AssetSidebar
        onLocateNode={locateNode}
        onRenameNode={(nodeId, name) => void commit([{ op: 'updateNode', nodeId, patch: { name } }], '重命名节点')}
        onDuplicateNode={(nodeId) => {
          const source = document.nodes.find((n) => n.id === nodeId)
          if (!source) return
          const copy = createNode(
            source.type,
            { x: source.position.x + 60, y: source.position.y + 60 },
            document.nodes,
            { name: `${source.name}副本`, data: JSON.parse(JSON.stringify(source.data)) },
          )
          void commit([{ op: 'addNode', node: copy }], '创建副本')
        }}
      />}

      <main
        className="relative min-w-0 flex-1"
        aria-label="工作区"
        onKeyDownCapture={onEditorKeyDownCapture}
      >
        {!selectionMode && <TopBar />}
        {selectionMode && (
          <CanvasSelectionBanner
            kind={selectionMode.kind}
            onBack={returnFromSelection}
            onExit={exitSelection}
          />
        )}

        {viewMode === 'workflow' ? (
          <>
            <WorkflowCanvas
              onRun={runNode}
              onCancelJob={cancelJob}
              onRetryJob={retryJob}
              onOpenNode={inspect}
              openNodeId={inspectedNodeId}
              onStitch={stitchGroup}
              onOpenStoryboardConfig={(groupId, anchor) => setStoryboardConfig({ groupId, anchor })}
              selectionMode={selectionMode}
              onStartVideoSelection={startCanvasSelection}
              onExitVideoSelection={returnFromSelection}
              onSelectCanvasCandidate={selectCanvasCandidate}
              onRemoveVideoReference={removeVideoReference}
              onLocateNode={locateNode}
              onOpenImageStyle={openImageStyle}
              onApplyImageTool={(sourceNodeId, request) => void applyImageTool(sourceNodeId, request)}
              onOpenScriptWorkspace={setStudioNodeId}
              onMaterializeScriptBatch={requestScriptBatch}
              onCanvasError={handleCanvasError}
            />
            {!selectionMode && <PresenceLayer canvasId={canvasId ?? null} />}
            {!selectionMode && (
              <div
                ref={toolbarRef}
                data-testid="canvas-toolbar"
                role="toolbar"
                aria-label="画布工具栏"
                aria-describedby="canvas-toolbar-help"
                className="pointer-events-none absolute inset-0 z-20"
              >
                <BottomToolbar
                  onAddNode={addNodeAtViewportCenter}
                  onAutoArrange={() => void commands.autoArrange()}
                  onOpenMaterial={(kind) => {
                    setMaterialTargetNodeId(null)
                    setMaterialKind(kind)
                    setLeftPanel('material')
                  }}
                  onOpenAssetLibrary={() => setAssetLibraryOpen(true)}
                />
                <p id="canvas-toolbar-help" className="sr-only">
                  使用 Tab 在工具栏控件之间移动焦点；缩放可使用 Command/Ctrl 加号、减号或 0。
                </p>
                <div
                  data-testid="canvas-zoom-live"
                  className="sr-only"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  id="canvas-zoom-help"
                >
                  {getCanvasZoomAnnouncement(zoom)}
                </div>
              </div>
            )}
          </>
        ) : (
          <StoryboardView onLocateNode={openWorkflowNode} onDuplicateNode={duplicateStoryboardCard} />
        )}

        {viewMode === 'workflow' && inspectedNode && inspectedNode.type !== 'video' && inspectedNode.type !== 'image' && inspectedNode.type !== 'audio' && inspectedNode.type !== 'text' && inspectedNode.type !== 'script' && (
          <NodeInspector
            node={inspectedNode}
            job={inspectedJob}
            onClose={() => inspect(null)}
            onPatch={patchNode}
            onRun={runNode}
            onCancel={cancelJob}
            onRetry={retryJob}
            onAddToAgent={(nodeId) => {
              const node = document.nodes.find((n) => n.id === nodeId)
              if (node) useEditor.getState().pushAgentRef({ id: node.id, label: node.name, kind: 'node' })
            }}
            onApplySlash={applySlash}
            onOpenStudio={setStudioNodeId}
          />
        )}
      </main>

      {!selectionMode && <AgentPanel />}

      {canvasError && (
        <div
          data-testid="canvas-error-notice"
          role="alert"
          aria-live="assertive"
          className="pointer-events-auto absolute left-1/2 top-16 z-[90] flex w-[min(560px,calc(100vw_-_24px))] -translate-x-1/2 items-center gap-3 rounded-xl border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-900 shadow-lg"
        >
          <span className="min-w-0 flex-1">{canvasError}</span>
          <button
            type="button"
            aria-label="关闭画布错误提示"
            onClick={() => setCanvasError(null)}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-red-700"
          >
            关闭
          </button>
        </div>
      )}

      {/* Panels */}
      <ToolboxPanel open={leftPanel === 'toolbox'} onClose={() => setLeftPanel(null)} onUse={usePreset} />
      <MaterialPanel
        open={leftPanel === 'material'}
        kind={materialKind}
        onClose={() => {
          setLeftPanel(null)
          setMaterialTargetNodeId(null)
        }}
        onApply={applyMaterial}
      />
      <CharacterPanel open={leftPanel === 'character'} onClose={() => setLeftPanel(null)} onApply={applyCharacter} />
      <HistoryPanel open={leftPanel === 'history'} onClose={() => setLeftPanel(null)} onInsert={insertArtifact} />
      <ShortcutsPanel open={leftPanel === 'shortcuts'} onClose={() => setLeftPanel(null)} />

      {/* Full-screen editors owned by a specific node type. */}
      <DirectorStudio
        open={studioNode?.type === 'director'}
        onClose={() => setStudioNodeId(null)}
        initialScene={studioNode?.data.extra?.scene as DirectorScene | undefined}
        initialShots={studioNode?.data.extra?.shots as CapturedShot[] | undefined}
        onSave={(scene, shots) => {
          if (!studioNode) return
          patchNode(studioNode.id, { extra: { ...studioNode.data.extra, scene, shots } })
          setStudioNodeId(null)
          toast(`已保存导演台场景与 ${shots.length} 个镜头`, 'success')
        }}
      />

      <LegacyScriptWizard
        open={studioNode?.type === 'scriptLegacy'}
        onClose={() => setStudioNodeId(null)}
        initialDraft={studioNode?.data.extra?.draft as ScriptDraft | undefined}
        onApply={(draft, action) => {
          if (!studioNode) return
          patchNode(studioNode.id, { extra: { ...studioNode.data.extra, draft, shots: draft.shots } })
          setStudioNodeId(null)
          if (action === 'save') {
            toast(`已保存 ${draft.shots.length} 个镜头`, 'success')
            return
          }
          // Batch actions materialise one node per shot; the user still passes
          // through the confirm gate for each generation.
          void batchFromShots(studioNode.id, draft, action === 'batch-video' ? 'video' : 'image')
        }}
      />

      <ScriptV2Workspace
        open={studioNode?.type === 'script'}
        canvasId={loadedCanvasId ?? canvasId ?? 'canvas_local'}
        nodeId={studioNode?.id ?? 'script_local'}
        canvasImages={scriptV2CanvasImages}
        nodeName={studioNode?.name ?? '脚本 V2'}
        state={studioNode?.type === 'script' ? readScriptV2State(studioNode.data.extra, studioNode.id) : null}
        onStateChange={(state, label) =>
          studioNode?.type === 'script'
            ? persistScriptV2State(studioNode.id, state, label)
            : undefined
        }
        onLocateNode={(nodeId) => {
          setStudioNodeId(null)
          window.requestAnimationFrame(() => locateNode(nodeId))
        }}
        onMaterializeBatch={(kind) => {
          if (studioNode?.type === 'script') requestScriptBatch(studioNode.id, kind)
        }}
        onClose={() => setStudioNodeId(null)}
      />

      <AssetLibraryPanel
        open={assetLibraryOpen}
        onClose={() => setAssetLibraryOpen(false)}
        onInsert={(asset) => {
          void insertAsset(asset)
          setAssetLibraryOpen(false)
        }}
      />

      <ConfirmGate job={pendingJob} onConfirm={confirmJob} onCancel={cancelJob} onClose={() => setPendingJob(null)} />

      {scriptBatchRequest && (() => {
        const batchNode = document.nodes.find((node) => node.id === scriptBatchRequest.nodeId)
        if (!batchNode || batchNode.type !== 'script') return null
        return (
          <ScriptV2BatchMaterializeDialog
            open
            state={readScriptV2State(batchNode.data.extra, batchNode.id)}
            kind={scriptBatchRequest.kind}
            onConfirm={confirmScriptBatch}
            onClose={() => setScriptBatchRequest(null)}
          />
        )
      })()}

      {storyboardConfig && storyboardGroup?.storyboard && (
        <Menu
          anchor={storyboardConfig.anchor}
          onClose={() => setStoryboardConfig(null)}
          width={196}
          sections={[
            {
              title: '画幅',
              items: (['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] as const).map((ratio) => ({
                id: `aspect-${ratio}`,
                label: ratio,
                checked: storyboardGroup.storyboard?.aspectRatio === ratio,
                onSelect: () =>
                  void commit(
                    [
                      {
                        op: 'updateGroup',
                        groupId: storyboardGroup.id,
                        patch: { storyboard: { ...storyboardGroup.storyboard!, aspectRatio: ratio } },
                      },
                    ],
                    '设置分镜画幅',
                  ),
              })),
            },
            {
              title: '宫格',
              items: [2, 3, 4, 5].map((n) => ({
                id: `grid-${n}`,
                label: `${n}×${n}`,
                checked: storyboardGroup.storyboard?.grid.rows === n,
                onSelect: () =>
                  void commit(
                    [
                      {
                        op: 'updateGroup',
                        groupId: storyboardGroup.id,
                        patch: { storyboard: { ...storyboardGroup.storyboard!, grid: { rows: n, cols: n } } },
                      },
                    ],
                    '设置宫格',
                  ),
              })),
            },
            {
              items: [
                {
                  id: 'sequence',
                  label: '显示序号',
                  checked: storyboardGroup.storyboard?.showSequenceNumbers,
                  onSelect: () =>
                    void commit(
                      [
                        {
                          op: 'updateGroup',
                          groupId: storyboardGroup.id,
                          patch: {
                            storyboard: {
                              ...storyboardGroup.storyboard!,
                              showSequenceNumbers: !storyboardGroup.storyboard!.showSequenceNumbers,
                            },
                          },
                        },
                      ],
                      '切换序号',
                    ),
                },
                {
                  id: 'to-normal',
                  label: '转普通组',
                  onSelect: () =>
                    void commit(
                      [
                        {
                          op: 'updateGroup',
                          groupId: storyboardGroup.id,
                          patch: { kind: 'normal', name: `分组 ${storyboardGroup.nodeIds.length} 个节点` },
                        },
                      ],
                      '转普通组',
                    ),
                },
              ],
            },
          ]}
        />
      )}

      <Toasts />

      {/* Selection hint used by the empty-canvas starter shortcuts */}
      {document.nodes.length === 0 && viewMode === 'workflow' && <EmptyCanvasStarters onPick={usePreset} />}
    </div>
  )
}

function CanvasSelectionBanner({
  kind,
  onBack,
  onExit,
}: {
  kind: 'reference' | 'element'
  onBack: () => void
  onExit: () => void
}) {
  const title = kind === 'reference' ? '从画布选择参考' : '元素选择模式'
  const instruction = kind === 'reference' ? '在当前画布中添加参考' : '点击图片选择局部元素'
  const bannerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => bannerRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      data-testid="canvas-selection-banner"
      ref={bannerRef}
      role="region"
      aria-live="polite"
      aria-atomic="true"
      aria-labelledby="canvas-selection-title"
      aria-describedby="canvas-selection-instructions"
      tabIndex={-1}
      className="pointer-events-none absolute inset-0 z-[80] outline-none"
    >
      <div className="pointer-events-auto absolute left-1/2 top-4 flex min-h-11 w-[min(520px,calc(100vw_-_24px))] min-w-0 max-w-[calc(100vw_-_24px)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-xl border border-[#6ea4ff]/45 bg-[#1268e8] px-3 py-1.5 text-white shadow-[0_14px_40px_rgba(0,50,145,0.38)]">
        <span className="mr-2 flex h-7 w-7 items-center justify-center rounded-lg bg-white/14 text-[15px]">
          {kind === 'reference' ? '↗' : '⌖'}
        </span>
        <div className="min-w-0 flex-1">
          <div id="canvas-selection-title" className="text-[13px] font-semibold">{title}</div>
          <div className="text-[10px] text-white/65">{instruction}</div>
        </div>
        <button
          type="button"
          onClick={onBack}
          aria-label="返回节点并聚焦目标节点"
          className="h-7 rounded-lg bg-white px-3 text-[11px] font-medium text-[#1557bb] hover:bg-[#eef5ff] focus-visible:outline-2 focus-visible:outline-white"
        >
          返回节点
        </button>
        <button
          type="button"
          onClick={onExit}
          aria-label="退出画布选择模式，按 Escape"
          className="ml-1.5 h-7 rounded-lg px-3 text-[11px] text-white/80 hover:bg-white/12 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
        >
          退出 <kbd className="ml-1 rounded border border-white/25 px-1 text-[10px]">Esc</kbd>
        </button>
      </div>

      <div
        id="canvas-selection-instructions"
        role="status"
        className="absolute left-1/2 top-[76px] max-w-[calc(100vw_-_24px)] -translate-x-1/2 rounded-full border border-white/10 bg-black/68 px-4 py-2 text-center text-[11px] text-white/78 shadow-lg backdrop-blur-md"
      >
        {instruction}
        <span className="ml-1 text-white/55">按 Esc 退出</span>
      </div>
    </div>
  )
}

function EmptyCanvasStarters({ onPick }: { onPick: (preset: ToolboxPreset) => void }) {
  const starters = [
    { id: 'preset-shot-breakdown', label: '故事脚本生成', accent: 'from-slate-700/70 via-slate-900 to-black' },
    { id: 'preset-character-turnaround', label: '角色三视图', accent: 'from-rose-950/80 via-zinc-900 to-black' },
    { id: 'preset-first-frame-video', label: '首帧图生视频', accent: 'from-cyan-950/70 via-zinc-900 to-black' },
    { id: 'preset-audio-video', label: '音频生视频', accent: 'from-amber-950/70 via-zinc-900 to-black' },
  ]
  return (
    <section
      data-testid="empty-canvas-starters"
      role="region"
      aria-labelledby="empty-canvas-title"
      aria-describedby="empty-canvas-description"
      className="pointer-events-none absolute inset-x-0 bottom-24 top-14 z-10 flex flex-col items-center justify-center gap-6 overflow-y-auto px-3"
    >
      <h2 id="empty-canvas-title" className="sr-only">空白工作流画布</h2>
      <p id="empty-canvas-description" className="text-center text-[13px] text-ink-400">
        双击画布 自由生成节点
      </p>
      <div
        role="group"
        aria-label="起始工作流模板"
        className="pointer-events-auto grid w-full max-w-[52rem] grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:w-auto lg:max-w-[calc(100%_-_32px)]"
      >
        {starters.map((starter) => {
          const preset = PRESETS_BY_ID.get(starter.id)
          if (!preset) return null
          return (
            <button
              key={starter.id}
              type="button"
              data-testid={`starter-${starter.id}`}
              onClick={() => onPick(preset)}
              aria-label={`${starter.label}，创建起始工作流`}
              className={`group relative flex h-14 w-full min-w-0 shrink-0 items-center overflow-hidden rounded-lg border border-white/8 bg-gradient-to-r px-3.5 text-left text-[13px] font-medium text-white/88 shadow-[var(--shadow-float)] transition-[border-color,transform] hover:-translate-y-0.5 hover:border-white/16 focus-visible:outline-2 focus-visible:outline-accent lg:w-52 ${starter.accent}`}
            >
              <span className="relative z-10">{starter.label}</span>
              <span className="absolute -right-5 h-20 w-20 rounded-full bg-white/8 blur-xl transition-transform group-hover:scale-125" />
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function CanvasWorkspace(props: { projectId: string; canvasId?: string }) {
  return (
    <ReactFlowProvider>
      <WorkspaceInner {...props} />
    </ReactFlowProvider>
  )
}
