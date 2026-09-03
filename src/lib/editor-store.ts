'use client'

import { create } from 'zustand'
import { applyMutations, MutationError } from '@/domain/mutations'
import { emptyDocument } from '@/domain/factory'
import type {
  Canvas,
  CanvasMutation,
  GenerationJob,
  Project,
  WorkflowDocument,
} from '@/domain/types'
import { api, ApiError } from './api'

export type ViewMode = 'workflow' | 'storyboard'

export type LeftPanel =
  | null
  | 'addNode'
  | 'toolbox'
  | 'material'
  | 'character'
  | 'history'
  | 'shortcuts'
  | 'help'

export interface Toast {
  id: number
  tone: 'info' | 'error' | 'success'
  message: string
}

interface UndoFrame {
  label: string
  /** Document snapshots — small enough at this graph size, and immune to
   * asymmetric-inverse bugs that plague per-op undo. */
  before: WorkflowDocument
  after: WorkflowDocument
}

interface EditorState {
  projectId: string | null
  canvasId: string | null
  project: Project | null
  canvases: Canvas[]
  document: WorkflowDocument
  revision: number
  balance: number
  jobs: GenerationJob[]
  loading: boolean

  viewMode: ViewMode
  selection: string[]
  /** Node whose inspector/detail drawer is open. */
  inspectedNodeId: string | null
  leftPanel: LeftPanel
  assetSidebarOpen: boolean
  agentOpen: boolean
  showEdges: boolean
  snapToGrid: boolean
  showMinimap: boolean
  zoom: number
  toolMode: 'select' | 'hand'

  undoStack: UndoFrame[]
  redoStack: UndoFrame[]
  toasts: Toast[]

  /** Chips queued for the agent composer from canvas selection. */
  pendingAgentRefs: { id: string; label: string; kind: 'node' | 'artifact' }[]
}

interface EditorActions {
  load: (projectId: string, canvasId?: string) => Promise<void>
  reloadCanvas: (canvasId: string) => Promise<void>
  commit: (mutations: CanvasMutation[], label: string) => Promise<boolean>
  /**
   * Queue a write whose mutations depend on the document state at the moment
   * the write actually runs — node placement and auto-naming both do.
   */
  commitWith: (produce: (doc: WorkflowDocument) => CanvasMutation[], label: string) => Promise<boolean>
  /** Local-only document write used during drags; not pushed until settled. */
  patchLocal: (mutate: (doc: WorkflowDocument) => WorkflowDocument) => void
  undo: () => Promise<void>
  redo: () => Promise<void>

  setViewMode: (mode: ViewMode) => void
  select: (ids: string[]) => void
  toggleSelect: (id: string, additive: boolean) => void
  inspect: (nodeId: string | null) => void
  setLeftPanel: (panel: LeftPanel) => void
  setAssetSidebar: (open: boolean) => void
  setAgentOpen: (open: boolean) => void
  toggleEdges: () => void
  toggleSnap: () => void
  toggleMinimap: () => void
  setZoom: (zoom: number) => void
  setToolMode: (mode: 'select' | 'hand') => void

  setJobs: (jobs: GenerationJob[]) => void
  upsertJob: (job: GenerationJob) => void
  setBalance: (balance: number) => void
  applyServerDocument: (document: WorkflowDocument, revision: number) => void

  pushAgentRef: (ref: { id: string; label: string; kind: 'node' | 'artifact' }) => void
  clearAgentRefs: () => void

  toast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
}

let toastSeq = 0

/** Serialises canvas writes so concurrent actions cannot race the revision. */
let commitQueue: Promise<void> = Promise.resolve()

export const useEditor = create<EditorState & EditorActions>((set, get) => ({
  projectId: null,
  canvasId: null,
  project: null,
  canvases: [],
  document: emptyDocument(),
  revision: 0,
  balance: 0,
  jobs: [],
  loading: true,

  viewMode: 'workflow',
  selection: [],
  inspectedNodeId: null,
  leftPanel: null,
  assetSidebarOpen: false,
  agentOpen: false,
  showEdges: true,
  snapToGrid: false,
  showMinimap: false,
  zoom: 1,
  toolMode: 'select',

  undoStack: [],
  redoStack: [],
  toasts: [],
  pendingAgentRefs: [],

  async load(projectId, canvasId) {
    set({ loading: true })
    try {
      const projectData = await api.get<{ project: Project; canvases: Canvas[]; balance: number }>(
        `/api/projects/${projectId}`,
      )
      const target =
        projectData.canvases.find((c) => c.id === canvasId) ?? projectData.canvases[0] ?? null
      if (!target) throw new Error('项目没有画布')

      const jobs = await api
        .get<{ jobs: GenerationJob[] }>(`/api/jobs?canvasId=${target.id}`)
        .then((r) => r.jobs)
        .catch(() => [])

      set({
        projectId,
        canvasId: target.id,
        project: projectData.project,
        canvases: projectData.canvases,
        document: target.document,
        revision: target.revision,
        zoom: target.document.viewport.zoom,
        balance: projectData.balance,
        jobs,
        loading: false,
        undoStack: [],
        redoStack: [],
        selection: [],
        inspectedNodeId: null,
      })
    } catch (error) {
      set({ loading: false })
      get().toast(error instanceof Error ? error.message : '加载失败', 'error')
    }
  },

  async reloadCanvas(canvasId) {
    const data = await api.get<{ canvas: Canvas; jobs: GenerationJob[]; balance: number }>(
      `/api/canvases/${canvasId}`,
    )
    set({
      canvasId,
      document: data.canvas.document,
      revision: data.canvas.revision,
      zoom: data.canvas.document.viewport.zoom,
      jobs: data.jobs,
      balance: data.balance,
      selection: [],
      inspectedNodeId: null,
      undoStack: [],
      redoStack: [],
    })
  },

  /**
   * Apply mutations optimistically, then persist.
   *
   * Calls are serialised through `commitQueue`: two UI actions in quick
   * succession would otherwise both read the same `revision`, and the loser
   * would come back 409 and lose the user's edit. On a genuine conflict (a
   * concurrent editor) we resync and replay the same mutations once against
   * the fresh document rather than dropping them.
   */
  commit(mutations, label) {
    return get().commitWith(() => mutations, label)
  },

  commitWith(produce, label) {
    const run = async (): Promise<boolean> => {
      const attempt = async (isRetry: boolean): Promise<boolean> => {
        const { canvasId, revision, document } = get()
        if (!canvasId) return false

        // Produced here, not at call time, so placement and auto-naming see
        // every earlier queued write.
        const mutations = produce(document)
        if (mutations.length === 0) return false

        // Validate locally first so an invalid edit never round-trips and the
        // user sees the reason immediately.
        let optimistic: WorkflowDocument
        try {
          optimistic = applyMutations(document, mutations)
        } catch (error) {
          const message = error instanceof MutationError ? error.message : '这次操作无法应用'
          get().toast(message, 'error')
          return false
        }

        set({ document: optimistic })

        try {
          const result = await api.post<{ revision: number; document: WorkflowDocument }>(
            `/api/canvases/${canvasId}`,
            { canvasId, expectedRevision: revision, mutations, label },
          )
          set((state) => ({
            document: result.document,
            revision: result.revision,
            undoStack: [...state.undoStack, { label, before: document, after: result.document }].slice(-50),
            redoStack: [],
          }))
          return true
        } catch (error) {
          set({ document })
          if (error instanceof ApiError && error.status === 409 && !isRetry) {
            // Rebase onto the authoritative document, then replay once.
            await get().reloadCanvas(canvasId)
            return attempt(true)
          }
          get().toast(error instanceof Error ? error.message : '保存失败', 'error')
          return false
        }
      }

      return attempt(false)
    }

    const next = commitQueue.then(run, run)
    commitQueue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  },

  patchLocal(mutate) {
    set((state) => ({ document: mutate(state.document) }))
  },

  async undo() {
    const { undoStack, canvasId, revision } = get()
    const frame = undoStack[undoStack.length - 1]
    if (!frame || !canvasId) return
    try {
      // Undo replaces the whole document rather than replaying inverse ops.
      const result = await api.post<{ revision: number; document: WorkflowDocument }>(
        `/api/canvases/${canvasId}`,
        {
          canvasId,
          expectedRevision: revision,
          mutations: documentReplaceMutations(get().document, frame.before),
          label: `撤销 ${frame.label}`,
        },
      )
      set((state) => ({
        document: result.document,
        revision: result.revision,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, frame],
        selection: [],
      }))
    } catch (error) {
      get().toast(error instanceof Error ? error.message : '撤销失败', 'error')
    }
  },

  async redo() {
    const { redoStack, canvasId, revision } = get()
    const frame = redoStack[redoStack.length - 1]
    if (!frame || !canvasId) return
    try {
      const result = await api.post<{ revision: number; document: WorkflowDocument }>(
        `/api/canvases/${canvasId}`,
        {
          canvasId,
          expectedRevision: revision,
          mutations: documentReplaceMutations(get().document, frame.after),
          label: `重做 ${frame.label}`,
        },
      )
      set((state) => ({
        document: result.document,
        revision: result.revision,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, frame],
        selection: [],
      }))
    } catch (error) {
      get().toast(error instanceof Error ? error.message : '重做失败', 'error')
    }
  },

  setViewMode: (viewMode) => set({ viewMode, leftPanel: null }),
  select: (selection) => set({ selection }),
  toggleSelect: (id, additive) =>
    set((state) => {
      if (!additive) return { selection: [id] }
      return state.selection.includes(id)
        ? { selection: state.selection.filter((x) => x !== id) }
        : { selection: [...state.selection, id] }
    }),
  inspect: (inspectedNodeId) => set({ inspectedNodeId }),
  setLeftPanel: (leftPanel) => set((s) => ({ leftPanel: s.leftPanel === leftPanel ? null : leftPanel })),
  setAssetSidebar: (assetSidebarOpen) => set({ assetSidebarOpen }),
  setAgentOpen: (agentOpen) => set({ agentOpen }),
  toggleEdges: () => set((s) => ({ showEdges: !s.showEdges })),
  toggleSnap: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  setZoom: (zoom) => set({ zoom }),
  setToolMode: (toolMode) => set({ toolMode }),

  setJobs: (jobs) => set({ jobs }),
  upsertJob: (job) =>
    set((state) => {
      const index = state.jobs.findIndex((j) => j.id === job.id)
      if (index === -1) return { jobs: [job, ...state.jobs] }
      const jobs = state.jobs.slice()
      jobs[index] = job
      return { jobs }
    }),
  setBalance: (balance) => set({ balance }),
  applyServerDocument: (document, revision) => set({ document, revision }),

  pushAgentRef: (ref) =>
    set((state) =>
      state.pendingAgentRefs.some((r) => r.id === ref.id)
        ? state
        : { pendingAgentRefs: [...state.pendingAgentRefs, ref], agentOpen: true },
    ),
  clearAgentRefs: () => set({ pendingAgentRefs: [] }),

  toast: (message, tone = 'info') => {
    toastSeq += 1
    const id = toastSeq
    set((state) => ({ toasts: [...state.toasts, { id, tone, message }] }))
    setTimeout(() => get().dismissToast(id), 4200)
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

/**
 * Express "make the document look like `target`" as a mutation list.
 * Used by undo/redo so the server still validates every write.
 */
function documentReplaceMutations(current: WorkflowDocument, target: WorkflowDocument): CanvasMutation[] {
  const mutations: CanvasMutation[] = []

  // Tear down in dependency-safe order: groups, then edges, then nodes.
  for (const group of current.groups) {
    mutations.push({ op: 'removeGroup', groupId: group.id, deleteNodes: false })
  }
  for (const edge of current.edges) {
    mutations.push({ op: 'removeEdge', edgeId: edge.id })
  }
  for (const node of current.nodes) {
    if (!target.nodes.some((n) => n.id === node.id)) {
      mutations.push({ op: 'removeNode', nodeId: node.id })
    }
  }

  for (const node of target.nodes) {
    if (current.nodes.some((n) => n.id === node.id)) {
      const { id, ...patch } = node
      void id
      mutations.push({ op: 'updateNode', nodeId: node.id, patch })
    } else {
      mutations.push({ op: 'addNode', node })
    }
  }
  for (const edge of target.edges) {
    mutations.push({ op: 'addEdge', edge })
  }
  for (const group of target.groups) {
    mutations.push({ op: 'addGroup', group })
  }
  mutations.push({ op: 'setViewport', viewport: target.viewport })

  return mutations
}

/* ------------------------------------------------------------------ *
 * Derived selectors
 * ------------------------------------------------------------------ */

export function useSelectedNodes() {
  return useEditor((s) => s.document.nodes.filter((n) => s.selection.includes(n.id)))
}

export function useNode(nodeId: string | null) {
  return useEditor((s) => (nodeId ? s.document.nodes.find((n) => n.id === nodeId) ?? null : null))
}

export function useActiveJob(nodeId: string | null) {
  return useEditor((s) => {
    if (!nodeId) return null
    const node = s.document.nodes.find((n) => n.id === nodeId)
    if (!node?.data.jobId) return null
    return s.jobs.find((j) => j.id === node.data.jobId) ?? null
  })
}
