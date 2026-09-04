'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createImageDerivedMutations } from '@/domain/image-authoring'
import { availableVideoModes, videoModeOptions } from '@/domain/compile'
import { CAMERA_MOVES, EFFECT_PRESETS, SLASH_PRESETS } from '@/domain/libraries'
import {
  MODELS_BY_ID,
  VIDEO_MODE_LABELS,
  modelOutputOptions,
  normalizeOutputForModel,
  quoteCredits,
  type ModelDefinition,
} from '@/domain/models'
import type { StoryboardCard, StoryboardReference } from '@/domain/storyboard'
import {
  videoReferenceCandidates,
  toggleVideoReference,
  pruneVideoReferenceExtras,
} from '@/domain/video-references'
import type {
  Artifact,
  GenerationJob,
  JobStatus,
  NodeData,
  NodeReference,
  OutputSpec,
  WorkflowDocument,
  WorkflowNode,
} from '@/domain/types'
import { changeAssetLifecycle } from '@/api/assets'
import { client } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { Menu, useMenuAnchor } from '../ui/Menu'
import { Chip, ProgressBar, Spinner } from '../ui/controls'
import {
  IconCheck,
  IconClose,
  IconCopy,
  IconCredit,
  IconCut,
  IconDownload,
  IconKey,
  IconLink,
  IconMore,
  IconPlus,
  IconRefresh,
  IconStop,
  IconTrash,
  IconVideo,
  IconWarning,
} from '../icons'
import { ArtifactPreview, MediaPlaceholder } from '../canvas/node-visuals'
import {
  formatVideoOutputSummary,
  formatVideoResolution,
  VideoModelCatalog,
} from '../video/VideoModelCatalog'
import {
  CropEditor,
  EmotionEditor,
  LightingEditor,
  MultiAngleEditor,
  PanoramaViewer,
  type ImageToolRequest,
} from './ImageToolEditors'

type ImageTool = null | 'crop' | 'lighting' | 'multi-angle' | 'emotion' | 'panorama'

export type RegenerationStatus =
  | 'ready'
  | 'awaiting_confirmation'
  | 'in_flight'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'compliance_blocked'

export type AssetRecoveryState = 'idle' | 'restoring' | 'succeeded' | 'failed'
type AssetRecoveryTarget = Pick<NonNullable<StoryboardCard['degradation']>, 'availability' | 'assetId'>

/** A storyboard card can restore only an attributable, soft-deleted local asset. */
export function canRecoverStoryboardAsset(target: AssetRecoveryTarget | null | undefined): boolean {
  return target?.availability === 'recoverable' && Boolean(target.assetId)
}

/** Keep recovery feedback stable while a failed local request remains retryable. */
export function assetRecoveryMessage(state: AssetRecoveryState, error?: string | null): string | null {
  if (state === 'restoring') return '正在恢复资产…'
  if (state === 'succeeded') return '资产已恢复，故事板已更新。'
  if (state === 'failed') return `${error || '恢复资产失败'}，可再次尝试。`
  return null
}

const GENERATION_STATUS_LABELS: Record<JobStatus, string> = {
  awaiting_confirmation: '等待确认',
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '生成失败',
  cancelled: '已取消',
  compliance_blocked: '合规阻断',
}

/** Shared projection helper: jobs are authoritative by node id, not node.data.jobId. */
export function latestJobForNode(jobs: readonly GenerationJob[], nodeId: string): GenerationJob | null {
  return jobs
    .filter((job) => job.nodeId === nodeId)
    .reduce<GenerationJob | null>((latest, job) => {
      if (!latest) return job
      const order = job.createdAt.localeCompare(latest.createdAt)
      // API/store job lists are newest-first. Preserve the first item when
      // fixture timestamps share a millisecond so a freshly inserted job is
      // not hidden by an older record.
      return order > 0 ? job : latest
    }, null)
}

export function generationStatusLabel(status: JobStatus): string {
  return GENERATION_STATUS_LABELS[status]
}

export function regenerationStatusForJob(job: GenerationJob | null): RegenerationStatus {
  if (!job) return 'ready'
  if (job.status === 'awaiting_confirmation') return 'awaiting_confirmation'
  if (job.status === 'queued' || job.status === 'running') return 'in_flight'
  if (job.status === 'succeeded') return 'succeeded'
  if (job.status === 'cancelled') return 'cancelled'
  if (job.status === 'compliance_blocked') return 'compliance_blocked'
  return 'failed'
}

const COMPLIANCE_RECOVERY_COPY = '该内容未通过合规检查，请调整提示词或参考元素后重试。'

/** Keep workflow/provider reasons while ensuring the drawer exposes its recovery action copy. */
export function regenerationStatusError(
  job: Pick<GenerationJob, 'status' | 'error'> | null,
  error: string | null,
): string | null {
  if (job?.status === 'compliance_blocked') {
    const reason = job.error ?? error
    if (!reason) return COMPLIANCE_RECOVERY_COPY
    if (reason.includes('未通过合规检查')) return reason
    return `${COMPLIANCE_RECOVERY_COPY}（${reason}）`
  }
  return error ?? job?.error ?? null
}

export function cycleFocusIndex(currentIndex: number, count: number, backwards: boolean): number {
  if (count <= 0) return -1
  if (backwards) return currentIndex <= 0 ? count - 1 : currentIndex - 1
  return currentIndex < 0 || currentIndex >= count - 1 ? 0 : currentIndex + 1
}

export function mediaAspectRatio(card: Pick<StoryboardCard, 'resourceAspectRatio' | 'aspectRatio'>): string {
  const ratio = card.resourceAspectRatio ?? card.aspectRatio
  if (!ratio) return '16 / 9'
  const [width, height] = ratio.split(':')
  return Number(width) > 0 && Number(height) > 0 ? `${width} / ${height}` : '16 / 9'
}

export function mergeNodeData(current: NodeData, patch: Partial<NodeData>): NodeData {
  return {
    ...current,
    ...patch,
    ...(patch.extra === undefined ? {} : { extra: { ...current.extra, ...patch.extra } }),
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function artifactKindForNode(node: WorkflowNode): 'image' | 'video' | 'audio' {
  const kind = (node.data.artifacts ?? [])[0]?.kind
  if (kind === 'image' || kind === 'video' || kind === 'audio') return kind
  if (node.type === 'video' || node.type === 'videoComposite') return 'video'
  if (node.type === 'audio') return 'audio'
  if (node.type === 'text' || node.type === 'script' || node.type === 'scriptLegacy') return 'image'
  return 'image'
}

/**
 * Detail for one storyboard card.
 *
 * Two capabilities worth calling out:
 *  - 参考元素 opens the *source node's* detail, not a copy of the media, so the
 *    provenance chain stays navigable;
 *  - 添加到对话 injects a locatable context chip into the agent composer.
 */
export function MediaDetailDrawer({
  card,
  onClose,
  onOpenClipEditor,
  onLocateNode,
  onDuplicateNode,
}: {
  card: StoryboardCard | null
  onClose: () => void
  onOpenClipEditor: () => void
  onLocateNode: (nodeId: string) => void
  onDuplicateNode: (nodeId: string) => void | Promise<void>
}) {
  const document = useEditor((s) => s.document)
  const canvasId = useEditor((s) => s.canvasId)
  const jobs = useEditor((s) => s.jobs)
  const balance = useEditor((s) => s.balance)
  const commit = useEditor((s) => s.commit)
  const commitWith = useEditor((s) => s.commitWith)
  const upsertJob = useEditor((s) => s.upsertJob)
  const setJobs = useEditor((s) => s.setJobs)
  const setBalance = useEditor((s) => s.setBalance)
  const applyServerDocument = useEditor((s) => s.applyServerDocument)
  const pushAgentRef = useEditor((s) => s.pushAgentRef)
  const toast = useEditor((s) => s.toast)
  const [referenceNodeId, setReferenceNodeId] = useState<string | null>(null)
  const [referenceId, setReferenceId] = useState<string | null>(null)
  const [referencePickerOpen, setReferencePickerOpen] = useState(false)
  const [activeTool, setActiveTool] = useState<ImageTool>(null)
  const [promptDraft, setPromptDraft] = useState('')
  const [promptDirty, setPromptDirty] = useState(false)
  const [promptSaving, setPromptSaving] = useState(false)
  const [runJobId, setRunJobId] = useState<string | null>(null)
  const [runAction, setRunAction] = useState<'saving' | 'creating' | 'confirming' | 'cancelling' | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [assetRecoveryState, setAssetRecoveryState] = useState<AssetRecoveryState>('idle')
  const [assetRecoveryError, setAssetRecoveryError] = useState<string | null>(null)
  const runBusyRef = useRef(false)
  const pollInFlight = useRef(false)
  const drawerRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const moreMenu = useMenuAnchor()
  const gridMenu = useMenuAnchor()

  const node = card ? document.nodes.find((n) => n.id === card.nodeId) : undefined
  const artifact = node?.data.artifacts?.[0] ?? card?.artifact ?? null
  const model = node?.data.modelId ? MODELS_BY_ID.get(node.data.modelId) : null
  const cost = node?.data.modelId ? quoteCredits(node.data.modelId, node.data.output).credits : 0
  const latestJob = node ? latestJobForNode(jobs, node.id) : null
  const currentJob =
    (runJobId ? jobs.find((job) => job.id === runJobId) : null) ??
    (latestJob?.status === 'succeeded' ? null : latestJob)
  const pollingJobId = currentJob?.id ?? null
  const regenerationStatus = regenerationStatusForJob(currentJob)
  const referencedNode = referenceNodeId ? document.nodes.find((n) => n.id === referenceNodeId) : null
  const selectedReference = card?.references.find((reference) => reference.id === referenceId) ?? null

  useEffect(() => {
    setReferenceNodeId(null)
    setReferenceId(null)
    setReferencePickerOpen(false)
    setActiveTool(null)
    setRunJobId(null)
    setRunError(null)
    setAssetRecoveryState('idle')
    setAssetRecoveryError(null)
    setPromptDirty(false)
  }, [card?.nodeId]) // A drawer follows the selected node, not a stale card snapshot.

  useEffect(() => {
    const nodeId = card?.nodeId
    if (!nodeId || typeof globalThis.document === 'undefined') return
    const active = globalThis.document.activeElement
    if (active instanceof HTMLElement && !drawerRef.current?.contains(active)) returnFocusRef.current = active
  }, [card?.nodeId])

  const closeDrawer = useCallback(() => {
    const returnTarget = returnFocusRef.current
    const fallbackId = card?.nodeId
    onClose()
    window.requestAnimationFrame(() => {
      if (returnTarget?.isConnected) returnTarget.focus()
      else if (fallbackId) globalThis.document.querySelector<HTMLElement>(`[data-testid="storyboard-card-${fallbackId}"]`)?.focus()
    })
  }, [card?.nodeId, onClose])

  useEffect(() => {
    const root = drawerRef.current
    if (!card || !root) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDrawer()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) {
        event.preventDefault()
        root.focus()
        return
      }
      const next = cycleFocusIndex(focusable.indexOf(globalThis.document.activeElement as HTMLElement), focusable.length, event.shiftKey)
      event.preventDefault()
      focusable[next]?.focus()
    }
    root.addEventListener('keydown', onKeyDown)
    const initial = root.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    window.requestAnimationFrame(() => {
      if (!root.contains(globalThis.document.activeElement)) (initial ?? root).focus()
    })
    return () => root.removeEventListener('keydown', onKeyDown)
  }, [card, closeDrawer])

  useEffect(() => {
    if (!promptDirty) setPromptDraft(node?.data.prompt ?? '')
  }, [node?.id, node?.data.prompt, promptDirty])

  const syncCanvas = useCallback(
    async (jobResult?: { document: WorkflowDocument | null; revision: number | null; balance: number }) => {
      if (!canvasId) return
      if (jobResult?.document && jobResult.revision !== null) {
        // Keep the local undo stack intact; a terminal job is a server-side
        // projection update, not a reason to discard the user's local history.
        applyServerDocument(jobResult.document, jobResult.revision)
        return
      }
      const result = await client.canvas.bootstrap(canvasId)
      setJobs(result.jobs)
      setBalance(result.balance)
      applyServerDocument(result.canvas.document, result.canvas.revision)
    },
    [applyServerDocument, canvasId, setBalance, setJobs],
  )

  const patchNodeData = useCallback(
    (nodeId: string, patch: Partial<NodeData> | ((data: NodeData) => Partial<NodeData>), label: string) =>
      commitWith((doc) => {
        const current = doc.nodes.find((item) => item.id === nodeId)
        if (!current) return []
        const nextPatch = typeof patch === 'function' ? patch(current.data) : patch
        if (Object.keys(nextPatch).length === 0) return []
        return [
          {
            op: 'updateNode' as const,
            nodeId,
            patch: { data: mergeNodeData(current.data, nextPatch) },
          },
        ]
      }, label),
    [commitWith],
  )

  const savePrompt = useCallback(async (): Promise<boolean> => {
    if (!node) return false
    setPromptSaving(true)
    const nextPrompt = promptDraft
    try {
      const ok = await patchNodeData(
        node.id,
        (data) => (data.prompt === nextPrompt ? {} : { prompt: nextPrompt }),
        '编辑视频提示词',
      )
      const saved = useEditor.getState().document.nodes.find((item) => item.id === node.id)?.data.prompt === nextPrompt
      if (saved || ok) setPromptDirty(false)
      return saved || ok
    } finally {
      setPromptSaving(false)
    }
  }, [node, patchNodeData, promptDraft])

  const createRegeneration = useCallback(async () => {
    if (!node || node.type !== 'video' || card?.column !== 'video' || !canvasId || runAction || runBusyRef.current || regenerationStatus === 'in_flight') return
    runBusyRef.current = true
    setRunError(null)
    setRunAction('saving')
    try {
      const promptSaved = await savePrompt()
      if (!promptSaved) {
        setRunError('提示词保存失败，请重试')
        return
      }

      setRunAction('creating')
      const result = await client.jobs.create({ canvasId, nodeId: node.id })
      upsertJob(result.job)
      setRunJobId(result.job.id)
      setRunError(null)
    } catch (error) {
      setRunError(errorMessage(error, '提交再生成失败'))
      toast(errorMessage(error, '提交再生成失败'), 'error')
    } finally {
      runBusyRef.current = false
      setRunAction(null)
    }
  }, [card?.column, canvasId, node, regenerationStatus, runAction, savePrompt, toast, upsertJob])

  const confirmRegeneration = useCallback(async () => {
    const job = currentJob
    if (!job || job.status !== 'awaiting_confirmation' || runAction || runBusyRef.current) return
    runBusyRef.current = true
    setRunAction('confirming')
    setRunError(null)
    try {
      const result = await client.jobs.transition(job.id, 'confirm')
      upsertJob(result.job)
      setBalance(result.balance)
      setRunJobId(result.job.id)
      runBusyRef.current = false
      setRunAction(null)
    } catch (error) {
      runBusyRef.current = false
      setRunAction(null)
      setRunError(errorMessage(error, '确认再生成失败'))
      toast(errorMessage(error, '确认再生成失败'), 'error')
    }
  }, [currentJob, runAction, setBalance, toast, upsertJob])

  const cancelRegeneration = useCallback(async () => {
    const job = currentJob
    if (!job || (job.status !== 'awaiting_confirmation' && job.status !== 'queued' && job.status !== 'running') || runAction || runBusyRef.current) {
      return
    }
    runBusyRef.current = true
    setRunAction('cancelling')
    setRunError(null)
    try {
      const result = await client.jobs.transition(job.id, 'cancel')
      upsertJob(result.job)
      setBalance(result.balance)
      setRunJobId(result.job.id)
      runBusyRef.current = false
      setRunAction(null)
      if (result.job.status === 'cancelled') await syncCanvas()
    } catch (error) {
      runBusyRef.current = false
      setRunAction(null)
      setRunError(errorMessage(error, '取消再生成失败'))
      toast(errorMessage(error, '取消再生成失败'), 'error')
    }
  }, [currentJob, runAction, setBalance, syncCanvas, toast, upsertJob])

  useEffect(() => {
    if (!pollingJobId || regenerationStatus !== 'in_flight') return
    let disposed = false
    const poll = async () => {
      if (disposed || pollInFlight.current) return
      pollInFlight.current = true
      try {
        const result = await client.jobs.get(pollingJobId)
        if (disposed) return
        upsertJob(result.job)
        setBalance(result.balance)
        if (result.job.status === 'succeeded' && result.document && result.revision !== null) {
          applyServerDocument(result.document, result.revision)
        } else if (
          result.job.status === 'failed' ||
          result.job.status === 'compliance_blocked' ||
          result.job.status === 'cancelled'
        ) {
          await syncCanvas(result)
        }
      } catch {
        // A transient local mock transport error leaves the inline status in
        // place and is retried on the next interval.
      } finally {
        pollInFlight.current = false
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 1100)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [applyServerDocument, pollingJobId, regenerationStatus, setBalance, syncCanvas, upsertJob])

  const toggleReference = useCallback(
    async (sourceNodeId: string) => {
      if (!node || node.type !== 'video') return
      try {
        const ok = await commitWith((doc) => {
          const target = doc.nodes.find((item) => item.id === node.id)
          if (!target) return []
          const mutations = toggleVideoReference(doc, target.id, sourceNodeId)
          const removed = mutations.some((mutation) => mutation.op === 'removeEdge')
          if (!removed) return mutations
          const sourceExtra = pruneVideoReferenceExtras(target.data.extra, sourceNodeId)
          return [
            ...mutations,
            {
              op: 'updateNode' as const,
              nodeId: target.id,
              patch: { data: { ...target.data, extra: sourceExtra } },
            },
          ]
        }, '更新视频参考元素')
        if (ok) toast('参考元素已更新', 'success')
      } catch (error) {
        toast(errorMessage(error, '参考元素更新失败'), 'error')
      }
    },
    [commitWith, node, toast],
  )

  const addDroppedReference = useCallback(
    async (payload: string) => {
      if (!node || node.type !== 'video') return
      let parsed: Partial<NodeReference> | null = null
      try {
        parsed = JSON.parse(payload) as Partial<NodeReference>
      } catch {
        parsed = null
      }
      if (parsed?.origin === 'node' && parsed.refId) {
        const sourceNode = document.nodes.find((item) => item.id === parsed?.refId)
        if (sourceNode) await toggleReference(sourceNode.id)
        return
      }
      if (parsed?.origin && parsed.refId && parsed.kind && parsed.label) {
        const reference: NodeReference = {
          id: parsed.id ?? `ref:${parsed.origin}:${parsed.refId}`,
          origin: parsed.origin,
          refId: parsed.refId,
          kind: parsed.kind,
          label: parsed.label,
          thumbnailUrl: parsed.thumbnailUrl ?? null,
        }
        const ok = await patchNodeData(
          node.id,
          (data) =>
            (data.references ?? []).some((item) => item.id === reference.id)
              ? {}
              : { references: [...(data.references ?? []), reference] },
          '添加参考元素',
        )
        if (ok) toast('参考元素已添加', 'success')
        return
      }
      const sourceNode = document.nodes.find((item) => item.id === payload)
      if (sourceNode) await toggleReference(sourceNode.id)
    },
    [document.nodes, node, patchNodeData, toast, toggleReference],
  )

  const removeExplicitReference = useCallback(
    async (reference: StoryboardReference) => {
      if (!node || reference.origin === 'node') return
      const ok = await patchNodeData(
        node.id,
        (data) => ({ references: (data.references ?? []).filter((item) => item.id !== reference.refId && item.id !== reference.id.replace(/^ref:/, '')) }),
        '移除参考元素',
      )
      if (ok) {
        setReferenceId(null)
        toast('参考元素已移除', 'success')
      }
    },
    [node, patchNodeData, toast],
  )

  const referenceCandidates = useMemo(() => {
    if (!node || node.type !== 'video') return []
    try {
      return videoReferenceCandidates(document, node.id)
    } catch {
      return []
    }
  }, [document, node])

  const openReference = (reference: StoryboardReference) => {
    if (reference.origin === 'node') {
      setReferenceId(null)
      setReferenceNodeId(reference.refId)
    } else {
      setReferenceNodeId(null)
      setReferenceId(reference.id)
    }
  }

  /**
   * Every image tool resolves to a *new pending node* wired back to this image
   * as a reference. Nothing edits the source in place, so the provenance chain
   * stays intact and the original artifact is always recoverable.
   */
  const createDerivedNode = (nodeId: string, request: ImageToolRequest) => {
    void commitWith(
      (doc) => {
        if (!doc.nodes.some((item) => item.id === nodeId)) return []
        return createImageDerivedMutations(doc, nodeId, request).mutations
      },
      `图片工具 ${request.label}`,
    ).then((ok) => {
      if (ok) toast(`已创建「${request.label}」待确认节点`, 'success')
    })
  }

  const restoreAsset = useCallback(async () => {
    const assetId = card?.degradation?.assetId
    if (!canRecoverStoryboardAsset(card?.degradation) || !assetId || assetRecoveryState === 'restoring') return
    setAssetRecoveryState('restoring')
    setAssetRecoveryError(null)
    try {
      // The typed local asset contract dispatches the lifecycle event that
      // StoryboardView uses to re-project the same workflow card.
      await changeAssetLifecycle(assetId, 'restore')
      setAssetRecoveryState('succeeded')
    } catch (error) {
      setAssetRecoveryError(errorMessage(error, '恢复资产失败'))
      setAssetRecoveryState('failed')
    }
  }, [assetRecoveryState, card?.degradation])

  if (!card) return null

  return (
    <aside
      ref={drawerRef}
      data-testid="media-detail"
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-detail-title"
      tabIndex={-1}
      className="absolute right-0 top-0 z-40 flex h-full min-h-0 w-[min(420px,calc(100vw_-_1rem))] max-w-full flex-col border-l border-ink-100 bg-surface shadow-[var(--shadow-panel)]"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-ink-100 px-4 py-3">
        <h2 id="media-detail-title" className="truncate text-[14px] font-semibold text-ink-900">
          {referencedNode ? referencedNode.name : selectedReference ? selectedReference.label : card.nodeName}
        </h2>
        {(referencedNode || selectedReference) && (
          <button
            type="button"
            onClick={() => {
              setReferenceNodeId(null)
              setReferenceId(null)
            }}
            className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-500"
          >
            返回
          </button>
        )}
        <button
          type="button"
          onClick={(e) => moreMenu.openFrom(e, 'point')}
          aria-label="更多操作"
          data-testid="storyboard-card-more"
          className="ml-auto rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-ink-50"
        >
          <IconMore size={16} />
        </button>
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="关闭"
          className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50"
        >
          <IconClose size={16} />
        </button>
      </header>

      <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {referencedNode ? (
          // Source node detail: prompt, model, params and pending status.
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl bg-ink-100" style={{ aspectRatio: mediaAspectRatio({ resourceAspectRatio: null, aspectRatio: referencedNode.data.output?.aspectRatio ?? null }) }}>
              {(referencedNode.data.artifacts ?? [])[0] ? (
                <ArtifactPreview
                  url={(referencedNode.data.artifacts ?? [])[0].url}
                  kind={(referencedNode.data.artifacts ?? [])[0].kind}
                  poster={(referencedNode.data.artifacts ?? [])[0].thumbnailUrl}
                  alt={referencedNode.name}
                  controls
                  className="h-full w-full object-contain"
                />
              ) : (
                <MediaPlaceholder kind={artifactKindForNode(referencedNode)} />
              )}
            </div>
            <Section title="提示词">
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-ink-600">
                {referencedNode.data.prompt || '（空）'}
              </p>
            </Section>
            <Section title="模型与参数">
              <div className="flex flex-wrap gap-1.5">
                {referencedNode.data.modelId && (
                  <Chip>{MODELS_BY_ID.get(referencedNode.data.modelId)?.label}</Chip>
                )}
                {referencedNode.data.output?.aspectRatio && <Chip>{referencedNode.data.output.aspectRatio}</Chip>}
                {referencedNode.data.output?.resolution && <Chip>{referencedNode.data.output.resolution}</Chip>}
                {(referencedNode.data.artifacts ?? []).length === 0 && (
                  <Chip tone="accent">待确认后生成</Chip>
                )}
              </div>
            </Section>
            <button
              type="button"
              data-testid="reference-add-to-agent"
              onClick={() => {
                pushAgentRef({ id: referencedNode.id, label: referencedNode.name, kind: 'node' })
                toast('已添加到对话', 'success')
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink-100 py-2.5 text-[13px] text-ink-700 transition-colors hover:bg-ink-200"
            >
              <IconLink size={14} /> 添加到对话
            </button>
          </div>
        ) : selectedReference ? (
          <ReferenceDetail
            reference={selectedReference}
            onAddToAgent={() => {
              pushAgentRef({ id: selectedReference.refId, label: selectedReference.label, kind: 'artifact' })
              toast('已添加到对话', 'success')
            }}
            onRemove={() => void removeExplicitReference(selectedReference)}
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-xl bg-ink-100" style={{ aspectRatio: mediaAspectRatio(card) }}>
              {artifact && !card.degradation ? (
                <ArtifactPreview
                  url={artifact.url}
                  kind={artifact.kind}
                  poster={artifact.thumbnailUrl}
                  alt={card.nodeName}
                  controls
                  className="h-full w-full object-contain"
                />
              ) : (
                <MediaPlaceholder kind={card.column === 'video' ? 'video' : card.column === 'audio' ? 'audio' : 'image'} />
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {model && <Chip>{model.label}</Chip>}
              {card.dimensions && <Chip>{card.dimensions}</Chip>}
              {card.durationLabel && <Chip>{card.durationLabel}</Chip>}
              {card.videoKind && <Chip tone="accent">{card.videoKind === 'final' ? '成片' : '片段'}</Chip>}
            </div>

            {card.degradation && (
              <AssetRecoveryPanel
                degradation={card.degradation}
                state={assetRecoveryState}
                error={assetRecoveryError}
                onRestore={() => void restoreAsset()}
              />
            )}

            {/* Image tools operate on a generated still and never edit it in place. */}
            {card.column === 'image' && artifact && !card.degradation && (
              <Section title="图片工具">
                <div className="flex flex-wrap gap-1.5">
                  <ToolButton label="人像质感" onClick={() => setActiveTool('emotion')} />
                  <ToolButton label="全景" onClick={() => setActiveTool('panorama')} />
                  <ToolButton label="多角度" onClick={() => setActiveTool('multi-angle')} />
                  <ToolButton label="打光" onClick={() => setActiveTool('lighting')} />
                  <ToolButton
                    label="九宫格"
                    testId="tool-nine-grid"
                    onClick={(e) => gridMenu.openFrom(e)}
                  />
                  <ToolButton label="裁剪" onClick={() => setActiveTool('crop')} />
                </div>
              </Section>
            )}

            {(card.references.length > 0 || card.column === 'video') && (
              <Section title={`参考元素（${card.references.length}）`}>
                <div
                  data-testid="detail-reference-dropzone"
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'copy'
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const payload = event.dataTransfer.getData('application/x-nova-reference') || event.dataTransfer.getData('text/plain')
                    if (payload) void addDroppedReference(payload)
                  }}
                  className="rounded-xl border border-dashed border-ink-200 p-2 transition-colors [&:has(button:focus-visible)]:border-accent"
                >
                  {card.references.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {card.references.map((reference) => (
                        <div key={reference.id} className="relative min-w-0">
                          <button
                            type="button"
                            data-testid={`reference-${reference.refId}`}
                            onClick={() => openReference(reference)}
                            className="block w-full overflow-hidden rounded-lg ring-1 ring-ink-100 transition-shadow hover:shadow-[var(--shadow-float)]"
                          >
                            <div className="aspect-square bg-ink-100">
                              {reference.thumbnailUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={reference.thumbnailUrl} alt={reference.label} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-ink-400">
                                  {reference.kind === 'video' ? <IconVideo size={15} /> : <IconLink size={14} />}
                                </div>
                              )}
                            </div>
                            <div className="truncate p-1 text-[9px] text-ink-500">{reference.label}</div>
                          </button>
                          {node?.type === 'video' && (
                            <button
                              type="button"
                              aria-label={`移除参考 ${reference.label}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                if (reference.origin === 'node') void toggleReference(reference.refId)
                                else void removeExplicitReference(reference)
                              }}
                              className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink-900/75 text-[10px] text-white"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-2 text-center text-[11px] text-ink-400">拖入画布节点，或从候选中添加</div>
                  )}

                  {card.column === 'video' && node?.type === 'video' && (
                    <div className="mt-2">
                      <button
                        type="button"
                        data-testid="detail-add-reference"
                        aria-expanded={referencePickerOpen}
                        onClick={() => setReferencePickerOpen((open) => !open)}
                        className="flex w-full items-center justify-center gap-1 rounded-lg bg-ink-100 py-1.5 text-[11px] text-ink-600 transition-colors hover:bg-ink-200"
                      >
                        <IconPlus size={12} /> 添加参考元素
                      </button>
                      {referencePickerOpen && (
                        <div data-testid="detail-reference-picker" className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg bg-ink-50 p-1.5">
                          {referenceCandidates.length === 0 ? (
                            <div className="px-2 py-2 text-[11px] text-ink-400">暂无可用节点</div>
                          ) : (
                            referenceCandidates.map((candidate) => (
                              <button
                                key={candidate.node.id}
                                type="button"
                                data-testid={`detail-reference-candidate-${candidate.node.id}`}
                                disabled={!candidate.selectable && !candidate.selected}
                                onClick={() => void toggleReference(candidate.node.id)}
                                className={cn(
                                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors',
                                  candidate.selected ? 'bg-accent/10 text-accent' : 'hover:bg-surface',
                                  !candidate.selectable && !candidate.selected && 'cursor-not-allowed opacity-40',
                                )}
                                title={candidate.reason ?? undefined}
                              >
                                <span className="min-w-0 flex-1 truncate">{candidate.node.name}</span>
                                <span className="shrink-0 text-[10px] text-ink-400">
                                  {candidate.selected ? '已选' : candidate.selectable ? '添加' : candidate.reason ?? '不可用'}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Section>
            )}

            {card.column === 'video' && node?.type === 'video' ? (
              <Section title="提示词">
                <textarea
                  data-testid="detail-video-prompt"
                  value={promptDraft}
                  onChange={(event) => {
                    setPromptDraft(event.target.value)
                    setPromptDirty(true)
                  }}
                  rows={4}
                  placeholder="描述这一段视频想呈现的画面、动作和节奏"
                  className="w-full resize-y rounded-xl border border-ink-200 bg-surface px-3 py-2 text-[12px] leading-relaxed text-ink-700 outline-none transition-colors focus:border-accent"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-ink-400" aria-live="polite">
                    {promptSaving ? '保存中…' : promptDirty ? '有未保存修改' : '已与工作流同步'}
                  </span>
                  <button
                    type="button"
                    data-testid="detail-save-prompt"
                    disabled={!promptDirty || promptSaving}
                    onClick={() => void savePrompt()}
                    className="rounded-lg bg-ink-100 px-2.5 py-1.5 text-[11px] text-ink-700 transition-colors hover:bg-ink-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {promptSaving ? '保存中…' : '保存提示词'}
                  </button>
                </div>
              </Section>
            ) : node?.data.prompt ? (
              <Section title="提示词">
                <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-ink-600">{node.data.prompt}</p>
              </Section>
            ) : null}

            {/* Re-running a shot must be possible without leaving the storyboard. */}
            {card.column === 'video' && node && node.type === 'video' && (
              <VideoRegenerationControls
                node={node}
                onPatch={(patch) => void patchNodeData(node.id, patch, '调整视频参数')}
              />
            )}

            {card.column === 'video' && (
              <button
                type="button"
                data-testid="detail-clip"
                onClick={onOpenClipEditor}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink-100 py-2.5 text-[13px] text-ink-700 transition-colors hover:bg-ink-200"
              >
                <IconCut size={14} /> 剪辑
              </button>
            )}
          </>
        )}
      </div>

      {!referencedNode && !selectedReference && node && (card.column !== 'video' || node.type === 'video') && (
        <footer className="shrink-0 border-t border-ink-100 p-3">
          {card.column === 'video' && node.type === 'video' ? (
            <RegenerationFooter
              job={currentJob}
              status={regenerationStatus}
              cost={cost}
              balance={balance}
              artifact={artifact}
              action={runAction}
              error={runError}
              onCreate={() => void createRegeneration()}
              onConfirm={() => void confirmRegeneration()}
              onCancel={() => void cancelRegeneration()}
            />
          ) : (
            <button
              type="button"
              data-testid="detail-regenerate"
              onClick={() => toast('已在画布节点上打开生成器', 'info')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
            >
              重新生成
              <span className="flex items-center gap-0.5 text-ink-300">
                <IconCredit size={12} />
                {cost}
              </span>
            </button>
          )}
        </footer>
      )}

      {/* Image tool editors */}
      <CropEditor
        open={activeTool === 'crop'}
        imageUrl={artifact?.url ?? null}
        onClose={() => setActiveTool(null)}
        onApply={(aspect, rotation, mirrored) => {
          if (!node) return
          const parts = [
            aspect === '原图' ? null : `裁剪为 ${aspect}`,
            rotation ? `旋转 ${rotation}°` : null,
            mirrored ? '水平镜像' : null,
          ].filter(Boolean)
          if (parts.length === 0) return
          createDerivedNode(node.id, {
            tool: 'crop',
            label: '裁剪',
            prompt: `保持画面内容不变，${parts.join('，')}。`,
            output: {
              resolution: '2K',
              quality: 'standard',
              count: 1,
              aspectRatio: (aspect === '原图' ? '16:9' : aspect) as ImageToolRequest['output']['aspectRatio'],
            },
            credits: 12,
          })
        }}
      />
      <LightingEditor
        open={activeTool === 'lighting'}
        imageUrl={artifact?.url ?? null}
        onClose={() => setActiveTool(null)}
        onSubmit={(request) => node && createDerivedNode(node.id, request)}
      />
      <MultiAngleEditor
        open={activeTool === 'multi-angle'}
        imageUrl={artifact?.url ?? null}
        onClose={() => setActiveTool(null)}
        onSubmit={(request) => node && createDerivedNode(node.id, request)}
      />
      <EmotionEditor
        open={activeTool === 'emotion'}
        imageUrl={artifact?.url ?? null}
        onClose={() => setActiveTool(null)}
        onSubmit={(request) => node && createDerivedNode(node.id, request)}
      />
      <PanoramaViewer
        open={activeTool === 'panorama'}
        imageUrl={artifact?.url ?? null}
        onClose={() => setActiveTool(null)}
        onCapture={(views) => {
          if (!node) return
          createDerivedNode(node.id, {
            tool: 'panorama',
            label: views === 1 ? '全景当前视角' : `全景 ${views} 视角`,
            prompt:
              views === 1
                ? '从全景中截取当前视角的透视校正画面。'
                : `从全景中均匀截取 ${views} 个视角的透视校正画面。`,
            output: { resolution: '2K', quality: 'standard', count: 1, aspectRatio: '16:9' },
            credits: 12 * views,
          })
          setActiveTool(null)
        }}
      />

      {gridMenu.anchor && node && (
        <Menu
          anchor={gridMenu.anchor}
          onClose={gridMenu.close}
          width={210}
          sections={[
            {
              title: '宫格与叙事预设',
              items: SLASH_PRESETS.map((preset) => ({
                id: preset.id,
                label: preset.name,
                onSelect: () =>
                  createDerivedNode(node.id, {
                    tool: preset.id,
                    label: preset.name,
                    prompt: preset.promptTemplate,
                    output: preset.output,
                    credits: 0,
                  }),
              })),
            },
          ]}
        />
      )}

      {moreMenu.anchor && node && (
        <Menu
          anchor={moreMenu.anchor}
          onClose={moreMenu.close}
          width={168}
          sections={[
            {
              items: [
                {
                  id: 'key',
                  label: node.keyElement ? '取消关键元素' : '设置关键元素',
                  icon: <IconKey size={14} />,
                  onSelect: () =>
                    void commit(
                      [{ op: 'updateNode', nodeId: node.id, patch: { keyElement: !node.keyElement } }],
                      '设置关键元素',
                    ),
                },
                {
                  id: 'locate',
                  label: '在工作流中定位',
                  onSelect: () => onLocateNode(card.nodeId),
                },
                {
                  id: 'duplicate',
                  label: '创建副本',
                  icon: <IconCopy size={14} />,
                  onSelect: () => void onDuplicateNode(card.nodeId),
                },
                {
                  id: 'download',
                  label: '下载',
                  icon: <IconDownload size={14} />,
                  disabled: !artifact || Boolean(card.degradation),
                  disabledReason: card.degradation ? '资产媒体当前不可用' : '没有生成结果',
                  onSelect: () => {
                    if (!artifact) return
                    const link = window.document.createElement('a')
                    link.href = artifact.url
                    link.download = ''
                    link.click()
                  },
                },
                {
                  id: 'delete',
                  label: '删除',
                  icon: <IconTrash size={14} />,
                  danger: true,
                  onSelect: () => {
                    void commit([{ op: 'removeNode', nodeId: node.id }], '删除节点')
                    closeDrawer()
                  },
                },
              ],
            },
          ]}
        />
      )}
    </aside>
  )
}

function AssetRecoveryPanel({
  degradation,
  state,
  error,
  onRestore,
}: {
  degradation: NonNullable<StoryboardCard['degradation']>
  state: AssetRecoveryState
  error: string | null
  onRestore: () => void
}) {
  const recoverable = canRecoverStoryboardAsset(degradation)
  const message = assetRecoveryMessage(state, error)

  return (
    <Section title="资产可用性">
      <div data-testid="detail-asset-recovery" className="space-y-2.5 rounded-xl border border-danger/20 bg-danger/6 p-3">
        <div className="flex items-start gap-2 text-[12px] text-danger">
          <IconWarning size={14} className="mt-px shrink-0" />
          <span>
            {degradation.availability === 'recoverable' ? '该资产已被移除，但仍可恢复。' : '该资产媒体当前不可用。'}
          </span>
        </div>
        {message && (
          <p
            id="detail-asset-recovery-status"
            data-testid="detail-asset-recovery-status"
            role="status"
            aria-live="polite"
            className={cn('text-[11px]', state === 'failed' ? 'text-danger' : 'text-ink-600')}
          >
            {message}
          </p>
        )}
        {recoverable && (
          <button
            type="button"
            data-testid="detail-restore-asset"
            aria-describedby={message ? 'detail-asset-recovery-status' : undefined}
            disabled={state === 'restoring'}
            onClick={onRestore}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink-900 py-2 text-[12px] font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-60"
          >
            {state === 'restoring' ? <Spinner size={12} /> : <IconRefresh size={13} />}
            {state === 'restoring' ? '恢复中…' : state === 'failed' ? '再次尝试恢复' : '恢复资产'}
          </button>
        )}
      </div>
    </Section>
  )
}

function ReferenceDetail({
  reference,
  onAddToAgent,
  onRemove,
}: {
  reference: StoryboardReference
  onAddToAgent: () => void
  onRemove: () => void
}) {
  const previewKind = reference.kind === 'video' || reference.kind === 'audio' ? reference.kind : 'image'

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl bg-ink-100" style={{ aspectRatio: '16 / 9' }}>
        {reference.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={reference.thumbnailUrl} alt={reference.label} className="h-full w-full object-contain" />
        ) : (
          <MediaPlaceholder kind={previewKind} />
        )}
      </div>
      <Section title="参考元素信息">
        <div className="flex flex-wrap gap-1.5">
          <Chip>{reference.kind}</Chip>
          <Chip>{reference.origin === 'asset' ? '资产库' : '上传内容'}</Chip>
        </div>
        <p className="text-[12px] leading-relaxed text-ink-600">{reference.label}</p>
      </Section>
      <button
        type="button"
        data-testid="reference-add-to-agent"
        onClick={onAddToAgent}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink-100 py-2.5 text-[13px] text-ink-700 transition-colors hover:bg-ink-200"
      >
        <IconLink size={14} /> 添加到对话
      </button>
      {reference.origin !== 'node' && (
        <button
          type="button"
          data-testid="reference-remove"
          onClick={onRemove}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] text-danger transition-colors hover:bg-danger/8"
        >
          <IconTrash size={13} /> 从视频配置移除
        </button>
      )}
    </div>
  )
}

function RegenerationFooter({
  job,
  status,
  cost,
  balance,
  artifact,
  action,
  error,
  onCreate,
  onConfirm,
  onCancel,
}: {
  job: GenerationJob | null
  status: RegenerationStatus
  cost: number
  balance: number
  artifact: Artifact | null
  action: 'saving' | 'creating' | 'confirming' | 'cancelling' | null
  error: string | null
  onCreate: () => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const busy = action !== null
  const quote = job?.quote.credits ?? cost
  const statusError = regenerationStatusError(job, error)

  return (
    <div data-testid="detail-regeneration" aria-live="polite" className="space-y-2.5">
      {status === 'awaiting_confirmation' && job && (
        <div data-testid="detail-regeneration-confirm" className="space-y-2.5 rounded-xl border border-accent/25 bg-accent/6 p-3">
          <div className="flex items-center gap-2 text-[12px] font-medium text-ink-800">
            <IconCredit size={14} className="text-accent" />
            确认本次再生成
          </div>
          <div className="space-y-1 text-[11px] text-ink-500">
            <div className="flex items-center justify-between gap-3">
              <span>预计消耗</span>
              <span className="font-medium tabular-nums text-ink-700">{quote} 积分</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>当前余额</span>
              <span className="tabular-nums">{balance} 积分</span>
            </div>
            {job.spec && (
              <div className="truncate pt-1 text-[10px] text-ink-400">
                {formatVideoOutputSummary(job.spec.output)} · {job.spec.inputs.length} 个参考输入
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="detail-confirm-regenerate"
              disabled={busy}
              onClick={onConfirm}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink-900 py-2 text-[12px] font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-60"
            >
              {action === 'confirming' && <Spinner size={12} />}
              确认再生成
            </button>
            <button
              type="button"
              data-testid="detail-cancel-regenerate"
              disabled={busy}
              onClick={onCancel}
              className="rounded-lg bg-ink-100 px-3 py-2 text-[12px] text-ink-600 transition-colors hover:bg-ink-200 disabled:cursor-wait disabled:opacity-60"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {status === 'in_flight' && job && (
        <div data-testid="detail-regeneration-progress" className="space-y-2 rounded-xl border border-running/20 bg-running/5 p-3">
          <div className="flex items-center gap-2 text-[12px] font-medium text-ink-800">
            <Spinner size={13} />
            {generationStatusLabel(job.status)}
            <span className="ml-auto tabular-nums text-[11px] text-ink-500">{job.progress}%</span>
          </div>
          <ProgressBar value={job.progress} />
          <div className="flex items-center justify-between gap-2 text-[10px] text-ink-400">
            <span>完成后会自动同步到故事板，原结果仍可回看</span>
            <button
              type="button"
              data-testid="detail-stop-regenerate"
              disabled={busy}
              onClick={onCancel}
              className="shrink-0 rounded-md px-1.5 py-1 text-ink-600 hover:bg-ink-100 disabled:opacity-50"
            >
              {action === 'cancelling' ? <Spinner size={11} /> : <IconStop size={11} />} 取消
            </button>
          </div>
        </div>
      )}

      {status === 'succeeded' && (
        <div data-testid="detail-regeneration-success" className="flex items-start gap-2 rounded-xl border border-success/20 bg-success/6 px-3 py-2.5 text-[11px] text-ink-600">
          <IconCheck size={14} className="mt-px shrink-0 text-success" />
          <span>再生成完成，最新结果已写回工作流{job?.artifacts.length ? `（${job.artifacts.length} 个产物）` : ''}。</span>
        </div>
      )}

      {status === 'cancelled' && (
        <div data-testid="detail-regeneration-cancelled" className="flex items-start gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 text-[11px] text-ink-600">
          <IconStop size={14} className="mt-px shrink-0 text-ink-400" />
          <span>本次再生成已取消，原结果未被覆盖。</span>
        </div>
      )}

      {status === 'failed' && (
        <div data-testid="detail-regeneration-error" className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/6 px-3 py-2.5 text-[11px] text-danger">
          <IconWarning size={14} className="mt-px shrink-0" />
          <span>{statusError ?? '生成失败，请检查配置后重试。'}</span>
        </div>
      )}

      {status === 'compliance_blocked' && (
        <div data-testid="detail-regeneration-compliance" className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/8 px-3 py-2.5 text-[11px] text-amber-700">
          <IconWarning size={14} className="mt-px shrink-0" />
          <span>{statusError ?? COMPLIANCE_RECOVERY_COPY}</span>
        </div>
      )}

      {statusError && status !== 'failed' && status !== 'compliance_blocked' && action === null && (
        <div data-testid="detail-regeneration-error" className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/6 px-3 py-2.5 text-[11px] text-danger">
          <IconWarning size={14} className="mt-px shrink-0" />
          <span>{statusError}</span>
        </div>
      )}

      {(status === 'ready' || status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'compliance_blocked') && (
        <button
          type="button"
          data-testid="detail-regenerate"
          disabled={busy}
          onClick={onCreate}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? <Spinner size={13} /> : status === 'failed' || status === 'cancelled' || status === 'compliance_blocked' ? <IconRefresh size={13} /> : null}
          {action === 'saving' ? '保存配置…' : action === 'creating' ? '提交中…' : status === 'failed' || status === 'cancelled' ? '重试再生成' : status === 'compliance_blocked' ? '修改后重试' : '重新生成'}
          <span className="flex items-center gap-0.5 text-ink-300">
            <IconCredit size={12} />
            {cost}
          </span>
        </button>
      )}

      {artifact && status === 'succeeded' && (
        <div className="text-center text-[10px] text-ink-400">当前预览已切换到最新产物；可在展开列查看历史版本。</div>
      )}
    </div>
  )
}

/**
 * The regeneration block on a video card. It edits the underlying node, so a
 * change made here is the same edit as one made on the canvas — there is no
 * separate storyboard-only copy of the parameters.
 */
function VideoRegenerationControls({
  node,
  onPatch,
}: {
  node: WorkflowNode
  onPatch: (
    patch: Partial<WorkflowNode['data']> | ((data: NodeData) => Partial<WorkflowNode['data']>)
  ) => void
}) {
  const document = useEditor((state) => state.document)
  const cameraMenu = useMenuAnchor()
  const effectMenu = useMenuAnchor()
  const [catalogOpen, setCatalogOpen] = useState(false)

  const model = node.data.modelId ? MODELS_BY_ID.get(node.data.modelId) : null
  const capabilities = node.data.modelId ? modelOutputOptions(node.data.modelId) : null
  const output = capabilities
    ? normalizeOutputForModel(node.data.modelId!, node.data.output, availableVideoModes(document, node.id))
    : (node.data.output ?? {})
  const modeRows = videoModeOptions(document, node.id)
  const cameraMoveId = (node.data.extra?.cameraMove as string | undefined) ?? null
  const effectId = (node.data.extra?.effect as string | undefined) ?? null

  const setOutput = (patch: Partial<OutputSpec>) => {
    onPatch((data) => {
      const modelId = data.modelId ?? node.data.modelId
      if (!modelId) return {}
      const currentOutput = normalizeOutputForModel(
        modelId,
        data.output,
        availableVideoModes(document, node.id),
      )
      return {
        output: normalizeOutputForModel(
          modelId,
          { ...currentOutput, ...patch },
          availableVideoModes(document, node.id),
        ),
      }
    })
  }

  const selectModel = (nextModel: ModelDefinition) => {
    onPatch((data) => ({
      modelId: nextModel.id,
      output: normalizeOutputForModel(
        nextModel.id,
        data.output ?? output,
        availableVideoModes(document, node.id, nextModel.id),
      ),
    }))
    setCatalogOpen(false)
  }

  return (
    <Section title="再生成配置">
      <div className="space-y-2.5">
        <button
          type="button"
          data-testid="detail-model"
          aria-haspopup="dialog"
          aria-expanded={catalogOpen}
          onClick={() => setCatalogOpen((open) => !open)}
          className="flex w-full items-center justify-between rounded-xl border border-ink-200 px-3 py-2 text-[13px] transition-colors hover:border-ink-300"
        >
          <span className="font-medium text-ink-900">{model?.label ?? '选择模型'}</span>
          <span className="text-[11px] text-ink-400">{model?.latencyLabel}</span>
        </button>

        <div data-testid="detail-video-output" className="text-[11px] tabular-nums text-ink-500">
          {formatVideoOutputSummary(output)}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(capabilities?.aspectRatios ?? []).map((ratio) => (
            <PillToggle
              key={ratio}
              label={ratio === 'auto' ? 'Auto' : ratio}
              active={output.aspectRatio === ratio}
              onClick={() => setOutput({ aspectRatio: ratio })}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(capabilities?.resolutions ?? []).map((resolution) => (
            <PillToggle
              key={resolution}
              label={formatVideoResolution(resolution)}
              grow
              active={output.resolution === resolution}
              onClick={() => setOutput({ resolution })}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(capabilities?.durationsSeconds ?? []).map((seconds) => (
            <PillToggle
              key={seconds}
              label={`${seconds}s`}
              grow
              active={output.durationSeconds === seconds}
              onClick={() => setOutput({ durationSeconds: seconds })}
            />
          ))}
        </div>

        {capabilities?.audio !== 'unsupported' && (
          <div className="flex gap-1.5">
            <PillToggle
              label="有声"
              grow
              active={Boolean(output.withAudio)}
              onClick={() => setOutput({ withAudio: true })}
            />
            <PillToggle
              label="静音"
              grow
              active={!output.withAudio}
              disabled={capabilities?.audio === 'required'}
              onClick={() => setOutput({ withAudio: false })}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {(capabilities?.counts ?? []).map((count) => (
            <PillToggle
              key={count}
              label={`${count}个`}
              grow
              active={(output.count ?? 1) === count}
              onClick={() => setOutput({ count })}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {modeRows.map((row) => (
            <PillToggle
              key={row.mode}
              label={VIDEO_MODE_LABELS[row.mode]}
              active={output.mode === row.mode}
              disabled={!row.available}
              title={row.reason ?? undefined}
              onClick={() => setOutput({ mode: row.mode })}
            />
          ))}
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={(e) => cameraMenu.openFrom(e)}
            className="flex-1 truncate rounded-lg bg-ink-100 px-2 py-2 text-[12px] text-ink-700 hover:bg-ink-200"
          >
            {CAMERA_MOVES.find((m) => m.id === cameraMoveId)?.name ?? '运镜库'}
          </button>
          <button
            type="button"
            onClick={(e) => effectMenu.openFrom(e)}
            className="flex-1 truncate rounded-lg bg-ink-100 px-2 py-2 text-[12px] text-ink-700 hover:bg-ink-200"
          >
            {EFFECT_PRESETS.find((f) => f.id === effectId)?.name ?? '特效市场'}
          </button>
        </div>
      </div>

      {catalogOpen && (
        <VideoModelCatalog
          currentId={node.data.modelId ?? null}
          onSelect={selectModel}
          onClose={() => setCatalogOpen(false)}
          className="fixed right-2 top-[64px] bottom-[72px] z-[70] w-[404px]"
        />
      )}
      {cameraMenu.anchor && (
        <Menu
          anchor={cameraMenu.anchor}
          onClose={cameraMenu.close}
          width={200}
          sections={[
            {
              title: '运镜库',
              items: CAMERA_MOVES.map((move) => ({
                id: move.id,
                label: `${move.group} · ${move.name}`,
                checked: move.id === cameraMoveId,
                onSelect: () => onPatch({ extra: { cameraMove: move.id } }),
              })),
            },
          ]}
        />
      )}
      {effectMenu.anchor && (
        <Menu
          anchor={effectMenu.anchor}
          onClose={effectMenu.close}
          width={210}
          sections={[
            {
              title: '推荐特效',
              items: EFFECT_PRESETS.map((preset) => ({
                id: preset.id,
                label: preset.name,
                badge: preset.commercial ? '可商用' : undefined,
                checked: preset.id === effectId,
                onSelect: () => onPatch({ extra: { effect: preset.id } }),
              })),
            },
          ]}
        />
      )}
    </Section>
  )
}

function PillToggle({
  label,
  active,
  onClick,
  grow,
  disabled,
  title,
}: {
  label: string
  active: boolean
  onClick: () => void
  grow?: boolean
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        'rounded-lg px-2.5 py-1.5 text-[12px] transition-colors',
        grow && 'flex-1',
        active ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
        disabled && 'cursor-not-allowed opacity-35',
      )}
    >
      {label}
    </button>
  )
}

function ToolButton({
  label,
  onClick,
  testId,
}: {
  label: string
  onClick: (event: React.MouseEvent) => void
  testId?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="rounded-lg bg-ink-100 px-2.5 py-1.5 text-[12px] text-ink-700 transition-colors hover:bg-ink-200"
    >
      {label}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-1.5')}>
      <div className="text-[12px] font-medium text-ink-500">{title}</div>
      {children}
    </div>
  )
}
