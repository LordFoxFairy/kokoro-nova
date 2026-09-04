'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  appendScriptV2Row,
  composeScriptV2AutoPrompts,
  defaultScriptV2State,
  moveScriptV2Row,
  removeScriptV2Row,
  restoreScriptV2PromptSnapshot,
  scriptV2AssetReady,
  scriptV2PromptContentFingerprint,
  scriptV2PromptSnapshot,
  updateScriptV2Row,
  type ScriptV2PromptSnapshot,
  type ScriptV2RowPatch,
  type ScriptV2Stage,
  type ScriptV2State,
} from '@/domain/script-v2'
import { cn } from '@/lib/cn'
import { IconCheck, IconClose, IconImage, IconPlus, IconScript, IconSparkle, IconVideo } from '../icons'
import { ScriptV2Assets } from './ScriptV2Assets'
import type { ScriptV2CanvasImageCandidate } from './ScriptV2Dialogs'
import {
  ScriptV2BatchPromptDialog,
  ScriptV2PromptDetailDialog,
  ScriptV2PromptStage,
} from './ScriptV2Prompts'
import { ScriptV2ShotTable } from './ScriptV2ShotTable'
import { useScriptV2Runs } from './useScriptV2Runs'

interface ScriptV2WorkspaceProps {
  open: boolean
  canvasId: string
  nodeId: string
  canvasImages: ScriptV2CanvasImageCandidate[]
  state: ScriptV2State | null
  nodeName: string
  onStateChange: (change: ScriptV2StateChange, label?: string) => void | Promise<void>
  onLocateNode?: (nodeId: string) => void
  onMaterializeBatch?: (kind: 'image' | 'video') => void | Promise<void>
  onClose: () => void
}

export type ScriptV2StateChange =
  | ScriptV2State
  | ((current: ScriptV2State) => ScriptV2State)

interface ScriptV2AutoPromptUndo {
  rowIds: string[]
  snapshot: ScriptV2PromptSnapshot[]
  beforeFingerprint: string
  afterFingerprint: string
}

function promptReady(state: ScriptV2State) {
  return state.rows.filter((row) => {
    const accepted = (value: string) => value === 'synced' || value === 'user_edited'
    return (
      row.imageGenerationPrompt.trim() &&
      row.videoMotionPrompt.trim() &&
      accepted(row.imagePromptState) &&
      accepted(row.videoPromptState)
    )
  }).length
}

/** Full-screen three-stage Script V2 workspace rooted in canonical node state. */
export function ScriptV2Workspace({
  open,
  canvasId,
  nodeId,
  canvasImages,
  state,
  nodeName,
  onStateChange,
  onLocateNode,
  onMaterializeBatch,
  onClose,
}: ScriptV2WorkspaceProps) {
  const [childSurfaceOpen, setChildSurfaceOpen] = useState(false)
  const [promptRowId, setPromptRowId] = useState<string | null>(null)
  const [batchPromptOpen, setBatchPromptOpen] = useState(false)
  const [autoPromptUndo, setAutoPromptUndo] = useState<ScriptV2AutoPromptUndo | null>(null)
  const promptFlushRef = useRef<(() => void) | null>(null)
  const workspaceState = state ?? defaultScriptV2State(nodeId)

  const runs = useScriptV2Runs({
    canvasId,
    nodeId,
    state: workspaceState,
    onStateChange: (next) => onStateChange(next, '合成提示词'),
    flushPendingPromptEdits: () => promptFlushRef.current?.(),
    resumePersistedPromptRuns: true,
  })

  const registerPromptFlush = useCallback((flush: (() => void) | null) => {
    promptFlushRef.current = flush
  }, [])

  useEffect(() => {
    if (!autoPromptUndo) return
    const timer = window.setTimeout(() => setAutoPromptUndo(null), 20_000)
    return () => window.clearTimeout(timer)
  }, [autoPromptUndo])

  useEffect(() => {
    if (!autoPromptUndo) return
    const currentFingerprint = scriptV2PromptContentFingerprint(workspaceState, autoPromptUndo.rowIds)
    if (
      currentFingerprint !== autoPromptUndo.afterFingerprint &&
      currentFingerprint !== autoPromptUndo.beforeFingerprint
    ) {
      setAutoPromptUndo(null)
    }
  }, [autoPromptUndo, workspaceState])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (childSurfaceOpen) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => window.removeEventListener('keydown', closeOnEscape, true)
  }, [childSurfaceOpen, onClose, open])

  useEffect(() => {
    if (!open) setChildSurfaceOpen(false)
  }, [open])

  if (!open || !state) return null

  const allAssets = [...workspaceState.assets.characters, ...workspaceState.assets.scenes, ...workspaceState.assets.props]
  const activeAssets = allAssets.filter((asset) => asset.status !== 'lost')
  const readyAssets = activeAssets.filter(scriptV2AssetReady).length
  const assetsReady = activeAssets.every(scriptV2AssetReady)
  const readyPrompts = promptReady(workspaceState)
  const stageCompletions =
    (workspaceState.rows.length > 0 ? 1 : 0) +
    (assetsReady ? 1 : 0) +
    (workspaceState.rows.length > 0 && readyPrompts === workspaceState.rows.length ? 1 : 0)
  const stages: Array<{ id: ScriptV2Stage; title: string; subtitle: string }> = [
    { id: 'shots', title: '确认镜头', subtitle: `${workspaceState.rows.length}个镜头已就绪` },
    {
      id: 'assets',
      title: '准备资产',
      subtitle: `${readyAssets}/${activeAssets.length} 已生成${readyAssets < activeAssets.length ? `、还差 ${activeAssets.length - readyAssets} 个` : ''}`,
    },
    { id: 'prompts', title: '合成提示词', subtitle: `${readyPrompts}/${workspaceState.rows.length} 已合成` },
  ]
  const canCompose = workspaceState.rows.length > 0 && workspaceState.rows.every((row) => row.plotDescription.trim())

  const openPrompt = (rowId: string) => {
    promptFlushRef.current?.()
    setBatchPromptOpen(false)
    setPromptRowId(rowId)
    setChildSurfaceOpen(true)
  }

  const openBatchPrompt = () => {
    promptFlushRef.current?.()
    setPromptRowId(null)
    setBatchPromptOpen(true)
    setChildSurfaceOpen(true)
  }

  const closePromptSurface = () => {
    promptFlushRef.current?.()
    setPromptRowId(null)
    setBatchPromptOpen(false)
    setChildSurfaceOpen(false)
  }

  const closeWorkspace = () => {
    closePromptSurface()
    onClose()
  }

  const setStage = (activeStage: ScriptV2Stage) => {
    promptFlushRef.current?.()
    void onStateChange(
      (current) => ({ ...current, activeStage }),
      `切换到${stages.find((stage) => stage.id === activeStage)?.title}`,
    )
  }

  const patchRow = (rowId: string, patch: ScriptV2RowPatch, label: string) => {
    void onStateChange((current) => updateScriptV2Row(current, rowId, patch), label)
  }

  const patchPrompt = (
    rowId: string,
    patch: { imageGenerationPrompt?: string; videoMotionPrompt?: string },
    label: string,
  ) => {
    void onStateChange((current) => updateScriptV2Row(current, rowId, patch), label)
  }

  const updatePromptComposer = (
    patch: Partial<ScriptV2State['promptComposer']>,
    label: string,
  ) => {
    promptFlushRef.current?.()
    void onStateChange(
      (current) => ({ ...current, promptComposer: { ...current.promptComposer, ...patch } }),
      label,
    )
  }

  const applyAutoCompose = (rowIds: string[]) => {
    const selectedRows = workspaceState.rows.filter((row) => rowIds.includes(row.id))
    const hasExistingPrompt = selectedRows.some(
      (row) => row.imageGenerationPrompt.trim() || row.videoMotionPrompt.trim(),
    )
    if (
      hasExistingPrompt &&
      !window.confirm('重新生成将同时覆盖图片提示词和视频运动提示词，且无法撤销。是否继续？')
    ) {
      return
    }
    const beforeFingerprint = scriptV2PromptContentFingerprint(workspaceState, rowIds)
    const snapshot = scriptV2PromptSnapshot(workspaceState, rowIds)
    const composed = composeScriptV2AutoPrompts(workspaceState, rowIds)
    const { changedRowIds, ...nextState } = composed
    if (!changedRowIds.length) return
    const afterFingerprint = scriptV2PromptContentFingerprint(nextState, changedRowIds)
    void onStateChange(nextState, '自动拼接提示词')
    setAutoPromptUndo({
      rowIds: changedRowIds,
      snapshot,
      beforeFingerprint,
      afterFingerprint,
    })
  }

  const undoAutoCompose = () => {
    if (!autoPromptUndo) return
    const currentFingerprint = scriptV2PromptContentFingerprint(workspaceState, autoPromptUndo.rowIds)
    if (currentFingerprint !== autoPromptUndo.afterFingerprint) {
      setAutoPromptUndo(null)
      return
    }
    void onStateChange(
      restoreScriptV2PromptSnapshot(workspaceState, autoPromptUndo.snapshot),
      '撤销自动拼接提示词',
    )
    setAutoPromptUndo(null)
  }

  const promptRow = workspaceState.rows.find((row) => row.id === promptRowId) ?? null
  const promptRunView = {
    activeRun: runs.activeRun,
    progressByRowId: runs.progressByRowId,
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="脚本 V2 工作区"
      data-testid="script-v2-workspace"
      className="fixed inset-0 z-[160] flex flex-col bg-[#171717] text-white"
    >
      <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-white/8 px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/7 text-white/70">
          <IconScript size={17} />
        </span>
        <div className="w-[180px] min-w-0">
          <h2 className="truncate text-[13px] font-medium text-white/88">{workspaceState.title || nodeName}</h2>
          <p className="truncate text-[10px] text-white/32">脚本 V2 · 自动保存</p>
        </div>

        <nav data-testid="script-v2-stages" aria-label="脚本阶段" className="mx-auto flex min-w-0 flex-1 items-center justify-center">
          {stages.map((stage, index) => {
            const active = workspaceState.activeStage === stage.id
            const complete = index === 0
              ? workspaceState.rows.length > 0
              : index === 1
                ? assetsReady
                : readyPrompts === workspaceState.rows.length && workspaceState.rows.length > 0
            return (
              <div key={stage.id} className="flex min-w-0 items-center">
                <button
                  type="button"
                  aria-label={`${stage.title} ${stage.subtitle}`}
                  aria-current={active ? 'step' : undefined}
                  onClick={() => setStage(stage.id)}
                  className={cn(
                    'group/stage flex min-w-[150px] items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/5',
                    active && 'bg-white/[0.055]',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                      active
                        ? 'border-white bg-white text-[#202020]'
                        : complete
                          ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-300'
                          : 'border-white/16 text-white/44',
                    )}
                  >
                    {complete && !active ? <IconCheck size={12} /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-[11px] font-medium', active ? 'text-white/88' : 'text-white/58')}>
                      {stage.title}
                    </span>
                    <span className="block truncate text-[9px] text-white/30">{stage.subtitle}</span>
                  </span>
                </button>
                {index < stages.length - 1 && <span className="mx-1 h-px w-9 bg-white/12" />}
              </div>
            )
          })}
        </nav>

        <span className="shrink-0 text-[10px] text-white/36">
          {stageCompletions}/3 完成后可批量生视频
        </span>
        <button
          type="button"
          aria-label="关闭 (ESC)"
          onClick={closeWorkspace}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/42 hover:bg-white/8 hover:text-white"
        >
          <IconClose size={17} />
        </button>
      </header>

      {workspaceState.activeStage === 'shots' ? (
        <ScriptV2ShotTable
          rows={workspaceState.rows}
          onPatch={patchRow}
          onOpenPrompt={openPrompt}
          onMove={(from, to) =>
            void onStateChange((current) => moveScriptV2Row(current, from, to), '调整镜头顺序')
          }
          onDelete={(rowId, shotNumber) =>
            void onStateChange(
              (current) => removeScriptV2Row(current, rowId),
              `删除镜头 ${shotNumber}`,
            )
          }
          onChildSurfaceChange={setChildSurfaceOpen}
        />
      ) : workspaceState.activeStage === 'assets' ? (
        <ScriptV2Assets
          canvasId={canvasId}
          nodeId={nodeId}
          canvasImages={canvasImages}
          state={workspaceState}
          onStateChange={onStateChange}
          onLocateNode={onLocateNode}
          onChildSurfaceChange={setChildSurfaceOpen}
        />
      ) : (
        <ScriptV2PromptStage
          state={workspaceState}
          onOpenDetail={openPrompt}
          onOpenBatch={openBatchPrompt}
        />
      )}

      <footer className="flex min-h-16 shrink-0 flex-wrap items-center gap-y-2 border-t border-white/8 bg-[#1d1d1d] px-3 py-2 sm:px-5">
        {workspaceState.activeStage === 'shots' && (
          <>
            <FooterButton
              icon={<IconPlus size={15} />}
              onClick={() => void onStateChange((current) => appendScriptV2Row(current), '添加镜头')}
            >
              添加镜头
            </FooterButton>
            <button
              type="button"
              disabled={!canCompose}
              title={canCompose ? undefined : '请先补全所有镜头的画面描述'}
              onClick={() => {
                setStage('prompts')
                openBatchPrompt()
              }}
              className="ml-auto flex h-10 items-center gap-2 rounded-xl bg-white px-5 text-[12px] font-medium text-[#202020] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <IconSparkle size={14} />
              一键合成全部提示词
            </button>
          </>
        )}
        {workspaceState.activeStage === 'assets' && (
          <>
            <span className="flex items-center gap-2 text-[10px] text-white/38">
              <span className={assetsReady ? 'text-emerald-300' : 'text-amber-300'}>
                <IconCheck size={14} />
              </span>
              {assetsReady
                ? '资产已生成，如再次生成将会覆盖之前的图片/场景/道具等资产'
                : `检测到有 ${activeAssets.length - readyAssets} 个资产尚未生成`}
            </span>
            <button
              type="button"
              disabled={!assetsReady}
              onClick={() => setStage('prompts')}
              className="ml-auto flex h-10 items-center rounded-xl bg-white px-5 text-[12px] font-medium text-[#202020] disabled:cursor-not-allowed disabled:opacity-30"
            >
              下一步：合成提示词
            </button>
          </>
        )}
        {workspaceState.activeStage === 'prompts' && (
          <>
            <span id="script-v2-batch-actions-hint" className="text-[10px] text-white/32">
              {workspaceState.rows.length > 0 ? '从已合成的镜头创建画布节点' : '请先添加镜头后再批量生成'}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {autoPromptUndo && (
                <button
                  type="button"
                  data-testid="script-v2-prompt-undo"
                  onClick={undoAutoCompose}
                  className="flex h-9 items-center rounded-xl border border-white/12 px-3 text-[11px] text-white/62 hover:bg-white/7 hover:text-white"
                >
                  撤销自动拼接
                </button>
              )}
              <button
                type="button"
                data-testid="script-v2-batch-image"
                aria-describedby="script-v2-batch-actions-hint"
                disabled={!onMaterializeBatch || workspaceState.rows.length === 0}
                onClick={() => void onMaterializeBatch?.('image')}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-cyan-200/18 bg-cyan-200/8 px-3 text-[11px] font-medium text-cyan-100/80 hover:bg-cyan-200/14 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <IconImage size={13} />
                批量生成分镜
              </button>
              <button
                type="button"
                data-testid="script-v2-batch-video"
                aria-describedby="script-v2-batch-actions-hint"
                disabled={!onMaterializeBatch || workspaceState.rows.length === 0}
                onClick={() => void onMaterializeBatch?.('video')}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-[11px] font-medium text-[#202020] hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <IconVideo size={13} />
                批量生视频
              </button>
            </div>
          </>
        )}
      </footer>

      {promptRowId !== null && (
        <ScriptV2PromptDetailDialog
          open={Boolean(promptRow)}
          row={promptRow}
          state={workspaceState}
          runView={promptRunView}
          onPatch={patchPrompt}
          onModeChange={(mode) => updatePromptComposer({ singleMode: mode }, '切换提示词生成方式')}
          onModelChange={(modelId) => updatePromptComposer({ modelId }, '选择提示词模型')}
          onRecompute={(rowId) => runs.recomputePrompts([rowId])}
          onAutoCompose={(rowId) => applyAutoCompose([rowId])}
          onCancelRun={runs.cancelRun}
          onRegisterFlush={registerPromptFlush}
          onClose={closePromptSurface}
        />
      )}

      {batchPromptOpen && (
        <ScriptV2BatchPromptDialog
          open
          rows={workspaceState.rows}
          state={workspaceState}
          runView={promptRunView}
          onModeChange={(mode) => updatePromptComposer({ batchMode: mode }, '切换批量提示词生成方式')}
          onModelChange={(modelId) => updatePromptComposer({ modelId }, '选择批量提示词模型')}
          onRecompute={(rowIds) => runs.recomputePrompts(rowIds)}
          onAutoCompose={applyAutoCompose}
          onCancelRun={runs.cancelRun}
          onClose={closePromptSurface}
        />
      )}
    </div>
  )
}

function FooterButton({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-xl px-3 text-[12px] font-medium text-white/66 hover:bg-white/7 hover:text-white/90"
    >
      {icon}
      {children}
    </button>
  )
}
