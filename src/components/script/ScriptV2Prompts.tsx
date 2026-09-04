'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { client } from '@/api/client'
import {
  MODELS_BY_ID,
  type ModelDefinition,
} from '@/domain/models'
import type {
  ScriptV2ComposeMode,
  ScriptV2PromptState,
  ScriptV2PromptTrack,
  ScriptV2Row,
  ScriptV2State,
} from '@/domain/script-v2'
import type { ScriptV2Run } from '@/contracts/script-v2'
import { cn } from '@/lib/cn'
import {
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconCredit,
  IconRefresh,
  IconSparkle,
  IconWarning,
} from '../icons'
import { Spinner } from '../ui/controls'
import { useScriptV2DialogFocus } from './ScriptV2Dialogs'

const SCRIPT_MODEL_IDS = ['gvlm-3.1', 'cvlm-5.5', 'gvlm-3.1-flash'] as const
const SCRIPT_MODELS = SCRIPT_MODEL_IDS.flatMap((id) => {
  const model = MODELS_BY_ID.get(id)
  return model ? [model] : []
})

const PROMPT_STATE_LABELS: Record<ScriptV2PromptState, string> = {
  none: '未生成',
  synced: '已生成',
  stale: '需重算',
  generating: '合成中',
  user_edited: '已生成',
  user_edited_stale: '内容已变更',
}

export interface ScriptV2PromptRunView {
  activeRun: ScriptV2Run | null
  progressByRowId: Record<string, number>
}

export interface ScriptV2PromptDetailDialogProps {
  open: boolean
  row: ScriptV2Row | null
  state: ScriptV2State
  runView?: ScriptV2PromptRunView
  onPatch: (rowId: string, patch: {
    imageGenerationPrompt?: string
    videoMotionPrompt?: string
  }, label: string) => void | Promise<void>
  onModeChange: (mode: ScriptV2ComposeMode) => void | Promise<void>
  onModelChange: (modelId: string) => void | Promise<void>
  onRecompute: (rowId: string) => Promise<unknown>
  onAutoCompose: (rowId: string) => void
  onCancelRun?: () => Promise<unknown>
  onRegisterFlush?: (flush: (() => void) | null) => void
  onClose: () => void
}

/**
 * The single-shot prompt editor mirrors the compact LibTV sheet: two large
 * independent text tracks, a shared generation mode/model footer, and a
 * deliberate no-accidental-dismiss backdrop.
 */
export function ScriptV2PromptDetailDialog({
  open,
  row,
  state,
  runView,
  onPatch,
  onModeChange,
  onModelChange,
  onRecompute,
  onAutoCompose,
  onCancelRun,
  onRegisterFlush,
  onClose,
}: ScriptV2PromptDetailDialogProps) {
  const [imageDraft, setImageDraft] = useState('')
  const [videoDraft, setVideoDraft] = useState('')
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [quote, setQuote] = useState<number | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imageDraftRef = useRef('')
  const videoDraftRef = useRef('')
  const rowRef = useRef(row)
  const timersRef = useRef<Partial<Record<ScriptV2PromptTrack, number>>>({})
  const dirtyRef = useRef<Partial<Record<ScriptV2PromptTrack, boolean>>>({})
  const onPatchRef = useRef(onPatch)
  const mode = state.promptComposer.singleMode
  const rowId = row?.id
  const model = SCRIPT_MODELS.find((candidate) => candidate.id === state.promptComposer.modelId) ?? SCRIPT_MODELS[0]

  rowRef.current = row
  onPatchRef.current = onPatch

  useEffect(() => {
    if (!open || !rowId) return
    setImageDraft(row.imageGenerationPrompt)
    setVideoDraft(row.videoMotionPrompt)
    imageDraftRef.current = row.imageGenerationPrompt
    videoDraftRef.current = row.videoMotionPrompt
    dirtyRef.current = {}
    setModelMenuOpen(false)
    setError(null)
  // The row object is intentionally excluded: parent state updates must not
  // reset a draft while the user is typing into the editor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id])

  // Track prompt fields explicitly; the whole row object changes for unrelated
  // canvas state updates and must not be a dependency.
  useEffect(() => {
    if (!open || !row) return
    if (!dirtyRef.current.image && imageDraftRef.current !== row.imageGenerationPrompt) {
      imageDraftRef.current = row.imageGenerationPrompt
      setImageDraft(row.imageGenerationPrompt)
    }
    if (!dirtyRef.current.video && videoDraftRef.current !== row.videoMotionPrompt) {
      videoDraftRef.current = row.videoMotionPrompt
      setVideoDraft(row.videoMotionPrompt)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id, row?.imageGenerationPrompt, row?.videoMotionPrompt])

  const commitTrack = (track: ScriptV2PromptTrack) => {
    const currentRow = rowRef.current
    if (!currentRow || !dirtyRef.current[track]) return
    const value = track === 'image' ? imageDraftRef.current : videoDraftRef.current
    dirtyRef.current[track] = false
    if (track === 'image' && value === currentRow.imageGenerationPrompt) return
    if (track === 'video' && value === currentRow.videoMotionPrompt) return
    void onPatchRef.current(
      currentRow.id,
      track === 'image'
        ? { imageGenerationPrompt: value }
        : { videoMotionPrompt: value },
      track === 'image' ? `保存镜头 ${currentRow.shotNumber} 分镜图提示词` : `保存镜头 ${currentRow.shotNumber} 视频运动提示词`,
    )
  }

  const flushAll = () => {
    for (const track of ['image', 'video'] as const) {
      const timer = timersRef.current[track]
      if (timer !== undefined) window.clearTimeout(timer)
      delete timersRef.current[track]
      commitTrack(track)
    }
  }

  useEffect(() => {
    onRegisterFlush?.(flushAll)
    return () => {
      flushAll()
      onRegisterFlush?.(null)
    }
    // The registration is intentionally tied to the mounted shot, not to
    // every parent render; refs keep the latest callbacks available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterFlush, row?.id])

  useEffect(() => {
    if (!open || !rowId) return
    const controller = new AbortController()
    setQuote(null)
    setQuoteError(null)
    if (mode === 'auto') {
      setQuote(0)
      return () => controller.abort()
    }
    void client.scriptV2
      .quote(
        {
          operation: 'recompute-prompts',
          modelId: state.promptComposer.modelId,
          shotCount: 1,
        },
        { signal: controller.signal },
      )
      .then((response) => setQuote(response.quote.credits))
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === 'AbortError') return
        setQuoteError(reason instanceof Error ? reason.message : '报价失败')
      })
    return () => controller.abort()
  }, [mode, open, rowId, state.promptComposer.modelId])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (modelMenuOpen) {
        setModelMenuOpen(false)
        return
      }
      flushAll()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
    // flushAll is intentionally the current closure for this mounted row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelMenuOpen, onClose, open, row?.id])

  if (!open || !row) return null

  const activeModel = model ?? SCRIPT_MODELS[0]
  const progress = Math.round(Math.max(
    runView?.progressByRowId[row.id] ?? 0,
    runView?.activeRun?.progress ?? 0,
  ))
  const imageStatus = promptStatus(row.imagePromptState, state, row.id)
  const videoStatus = promptStatus(row.videoPromptState, state, row.id)
  const canSubmit = mode === 'auto' || quote !== null

  const schedule = (track: ScriptV2PromptTrack) => {
    dirtyRef.current[track] = true
    const previous = timersRef.current[track]
    if (previous !== undefined) window.clearTimeout(previous)
    timersRef.current[track] = window.setTimeout(() => {
      delete timersRef.current[track]
      commitTrack(track)
    }, 500)
  }

  const selectMode = (next: ScriptV2ComposeMode) => {
    flushAll()
    void onModeChange(next)
  }

  const submit = async () => {
    flushAll()
    if (!canSubmit) return
    setError(null)
    if (mode === 'auto') {
      onAutoCompose(row.id)
      return
    }
    setRunning(true)
    try {
      await onRecompute(row.id)
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === 'AbortError')) {
        setError(reason instanceof Error ? reason.message : '提示词合成失败')
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <PromptLayer ariaLabel={`第 ${row.shotNumber} 镜：最终提示词`} testId="script-v2-prompt-detail-dialog" width="max-w-[760px]">
      <header className="flex h-14 items-center border-b border-white/8 px-4">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[14px] font-medium text-white/90">第 {row.shotNumber} 镜：最终提示词</h2>
          <span className="group relative text-white/35" title="两条提示词分别用于分镜图和视频运动生成">
            <span className="flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px]">?</span>
          </span>
        </div>
        <button
          type="button"
          aria-label="关闭提示词"
          onClick={() => {
            flushAll()
            onClose()
          }}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/42 hover:bg-white/8 hover:text-white"
        >
          <IconClose size={16} />
        </button>
      </header>

      <div className="space-y-3.5 p-4">
        <PromptTrackEditor
          track="image"
          row={row}
          value={imageDraft}
          state={imageStatus.state}
          statusLabel={imageStatus.label}
          onChange={(value) => {
            imageDraftRef.current = value
            setImageDraft(value)
            schedule('image')
          }}
        />
        <PromptTrackEditor
          track="video"
          row={row}
          value={videoDraft}
          state={videoStatus.state}
          statusLabel={videoStatus.label}
          onChange={(value) => {
            videoDraftRef.current = value
            setVideoDraft(value)
            schedule('video')
          }}
        />
        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-lg bg-red-400/10 px-3 py-2 text-[11px] text-red-200">
            <IconWarning size={14} />
            {error}
            <button type="button" className="ml-auto underline" onClick={() => void submit()}>重试</button>
          </div>
        )}
        {quoteError && <p role="alert" className="text-right text-[10px] text-red-300">{quoteError}</p>}
      </div>

      <footer className="relative flex min-h-[58px] flex-wrap items-center gap-2 border-t border-white/8 bg-[#2a2a2a] px-4 py-2.5">
        <div className="relative">
          <button
            type="button"
            aria-label={`提示词模型 ${activeModel?.label ?? state.promptComposer.modelId}`}
            aria-expanded={modelMenuOpen}
            disabled={mode === 'auto'}
            onClick={() => setModelMenuOpen((value) => !value)}
            className="flex h-9 min-w-[136px] items-center gap-2 rounded-lg px-2 text-left text-[11px] text-white/72 hover:bg-white/7 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <IconSparkle size={14} />
            <span className="min-w-0 flex-1 truncate">{activeModel?.label ?? state.promptComposer.modelId}</span>
            <IconChevronDown size={12} />
          </button>
          {modelMenuOpen && mode === 'smart' && (
            <ScriptModelMenu
              currentId={state.promptComposer.modelId}
              onSelect={(next) => {
                setModelMenuOpen(false)
                void onModelChange(next.id)
              }}
            />
          )}
        </div>

        <fieldset role="radiogroup" aria-label="生成方式" className="ml-auto flex items-center gap-3 text-[11px] text-white/62">
          <legend className="sr-only">生成方式</legend>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name={`script-v2-single-mode-${row.id}`}
              value="smart"
              checked={mode === 'smart'}
              onChange={() => selectMode('smart')}
              className="accent-white"
            />
            智能合成
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name={`script-v2-single-mode-${row.id}`}
              value="auto"
              checked={mode === 'auto'}
              onChange={() => selectMode('auto')}
              className="accent-white"
            />
            自动拼接
          </label>
        </fieldset>

        <span className="flex items-center gap-1 text-[10px] text-white/40">
          <IconCredit size={12} />
          <span data-testid="script-v2-prompt-quote">{mode === 'auto' ? '—' : quote ?? '…'}</span>
        </span>
        <button
          type="button"
          disabled={!canSubmit || running}
          onClick={() => void submit()}
          className="flex h-9 min-w-[108px] items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-[11px] font-medium text-[#202020] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {running ? <><Spinner size={13} /> 合成中 {progress}%</> : <><IconRefresh size={13} /> 重新合成提示词</>}
        </button>
        {running && onCancelRun && (
          <button type="button" onClick={() => void onCancelRun()} className="h-8 rounded-lg px-2 text-[10px] text-white/42 hover:bg-white/7 hover:text-white/75">
            取消
          </button>
        )}
      </footer>
    </PromptLayer>
  )
}

export interface ScriptV2BatchPromptDialogProps {
  open: boolean
  rows: ScriptV2Row[]
  state: ScriptV2State
  runView?: ScriptV2PromptRunView
  onModeChange: (mode: ScriptV2ComposeMode) => void | Promise<void>
  onModelChange: (modelId: string) => void | Promise<void>
  onRecompute: (rowIds: string[]) => Promise<unknown>
  onAutoCompose: (rowIds: string[]) => void
  onCancelRun?: () => Promise<unknown>
  onClose: () => void
}

/** Multi-shot prompt sheet with selection, expandable context, and serial-run feedback. */
export function ScriptV2BatchPromptDialog({
  open,
  rows,
  state,
  runView,
  onModeChange,
  onModelChange,
  onRecompute,
  onAutoCompose,
  onCancelRun,
  onClose,
}: ScriptV2BatchPromptDialogProps) {
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [quote, setQuote] = useState<number | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<'success' | 'failed' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wasOpen = useRef(false)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const mode = state.promptComposer.batchMode
  const selectedIds = rows.filter((row) => selected[row.id]).map((row) => row.id)
  const allSelected = rows.length > 0 && selectedIds.length === rows.length
  const partiallySelected = selectedIds.length > 0 && !allSelected
  const model = SCRIPT_MODELS.find((candidate) => candidate.id === state.promptComposer.modelId) ?? SCRIPT_MODELS[0]

  useEffect(() => {
    if (open && !wasOpen.current) {
      setSelected(Object.fromEntries(rows.map((row) => [row.id, false])))
      setExpanded({})
      setModelMenuOpen(false)
      setQuote(null)
      setQuoteError(null)
      setRunning(false)
      setResult(null)
      setError(null)
    }
    wasOpen.current = open
  }, [open, rows])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setQuote(null)
    setQuoteError(null)
    if (mode === 'auto' || selectedIds.length === 0) {
      setQuote(mode === 'auto' ? 0 : null)
      return () => controller.abort()
    }
    void client.scriptV2
      .quote(
        {
          operation: 'recompute-prompts',
          modelId: state.promptComposer.modelId,
          shotCount: selectedIds.length,
        },
        { signal: controller.signal },
      )
      .then((response) => setQuote(response.quote.credits))
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === 'AbortError') return
        setQuoteError(reason instanceof Error ? reason.message : '报价失败')
      })
    return () => controller.abort()
  }, [mode, open, selectedIds.length, state.promptComposer.modelId])

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = partiallySelected
  }, [partiallySelected])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (modelMenuOpen) {
        setModelMenuOpen(false)
        return
      }
      if (!running) onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [modelMenuOpen, onClose, open, running])

  if (!open) return null

  const latestBatch = [...state.promptBatchRuns].reverse().find((run) =>
    run.targetShotIds.some((id) => selectedIds.includes(id)),
  )
  const batchSummary = latestBatch
    ? latestBatch.batches.map((batch, index) => `${index + 1}批 ${batch.shotIds.length}镜 · ${batchStatusLabel(batch.status)}`).join('  ')
    : null
  const progress = Math.round(runView?.activeRun?.progress ?? 0)
  const canSubmit = selectedIds.length > 0 && (mode === 'auto' || quote !== null)

  const submit = async () => {
    if (!canSubmit || running) return
    setError(null)
    setResult(null)
    setRunning(true)
    try {
      if (mode === 'auto') {
        onAutoCompose(selectedIds)
      } else {
        await onRecompute(selectedIds)
      }
      setResult('success')
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : '提示词合成失败')
      setResult('failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <PromptLayer ariaLabel="合成最终提示词" testId="script-v2-batch-prompt-dialog" width="max-w-[800px]">
      <header className="flex min-h-14 items-center border-b border-white/8 px-4">
        <div>
          <h2 className="text-[14px] font-medium text-white/90">合成最终提示词</h2>
          <p className="mt-0.5 text-[10px] text-white/32">重新生成将同时覆盖图片提示词和视频提示词，且无法撤销</p>
        </div>
        {!running && (
          <button type="button" aria-label="关闭批量提示词" onClick={onClose} className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/42 hover:bg-white/8 hover:text-white">
            <IconClose size={16} />
          </button>
        )}
      </header>

      <div className="max-h-[calc(100vh-180px)] overflow-y-auto p-3 sm:max-h-[500px] sm:p-4">
        <div className="space-y-2">
          {rows.map((row) => {
            const isSelected = Boolean(selected[row.id])
            const isExpanded = Boolean(expanded[row.id])
            return (
              <div key={row.id} className={cn('rounded-xl border transition-colors', isSelected ? 'border-white/20 bg-white/[0.045]' : 'border-white/9 bg-white/[0.02]')}>
                <div className="flex min-h-12 items-center gap-2 px-3">
                  <input
                    type="checkbox"
                    aria-label={`选择镜头 ${row.shotNumber}`}
                    checked={isSelected}
                    onChange={(event) => setSelected((current) => ({ ...current, [row.id]: event.target.checked }))}
                    className="h-4 w-4 accent-white"
                  />
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-white/8 px-1 font-mono text-[10px] text-white/68">{row.shotNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-white/62">{row.plotDescription || '未填写画面描述'}</span>
                  <button
                    type="button"
                    aria-label={`镜头 ${row.shotNumber} 详情`}
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded((current) => ({ ...current, [row.id]: !current[row.id] }))}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-white/40 hover:bg-white/7 hover:text-white/72"
                  >
                    {isExpanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                    {isExpanded ? '收起' : '详情'}
                  </button>
                </div>
                {isExpanded && (
                  <div className="grid grid-cols-2 gap-x-5 gap-y-2 border-t border-white/7 px-3 py-3 text-[10px] text-white/38">
                    <Detail label="时长" value={`${row.durationSeconds}s`} />
                    <Detail label="景别" value={row.shotSize} />
                    <Detail label="光影氛围" value={row.lightingAndAtmosphere || '—'} />
                    <Detail label="运镜" value={row.cinematics?.cameraMovement || '—'} />
                    <Detail label="分镜图提示词" value={row.imageGenerationPrompt || '待生成'} wide />
                    <Detail label="视频运动提示词" value={row.videoMotionPrompt || '待生成'} wide />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <footer className="relative flex min-h-[62px] flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/8 bg-[#2a2a2a] px-4 py-2.5">
        <label className="flex items-center gap-2 text-[11px] text-white/62">
          <input
            type="checkbox"
            aria-label="全选镜头"
            checked={allSelected}
            ref={selectAllRef}
            onChange={(event) => setSelected(Object.fromEntries(rows.map((row) => [row.id, event.target.checked]))) }
            className="h-4 w-4 accent-white"
          />
          全选镜头
        </label>
        <span className="text-[10px] text-white/32">已选{selectedIds.length}/{rows.length}</span>

        <div className="relative ml-auto flex flex-wrap items-center justify-end gap-2">
          {mode === 'smart' && (
            <button
              type="button"
              aria-label={`提示词模型 ${model?.label ?? state.promptComposer.modelId}`}
              aria-expanded={modelMenuOpen}
              onClick={() => setModelMenuOpen((value) => !value)}
              className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] text-white/62 hover:bg-white/7"
            >
              <IconSparkle size={13} />
              {model?.label ?? state.promptComposer.modelId}
              <IconChevronDown size={11} />
            </button>
          )}
          {modelMenuOpen && mode === 'smart' && (
            <ScriptModelMenu
              currentId={state.promptComposer.modelId}
              onSelect={(next) => {
                setModelMenuOpen(false)
                void onModelChange(next.id)
              }}
              align="right"
            />
          )}
          <fieldset role="radiogroup" aria-label="生成方式" className="flex items-center gap-2.5 text-[10px] text-white/62">
            <legend className="sr-only">生成方式</legend>
            <label className="flex cursor-pointer items-center gap-1"><input type="radio" name="script-v2-batch-mode" checked={mode === 'smart'} onChange={() => void onModeChange('smart')} className="accent-white" />智能合成</label>
            <label className="flex cursor-pointer items-center gap-1"><input type="radio" name="script-v2-batch-mode" checked={mode === 'auto'} onChange={() => void onModeChange('auto')} className="accent-white" />自动拼接</label>
          </fieldset>
          <span className="flex items-center gap-1 text-[10px] text-white/38"><IconCredit size={12} /><span data-testid="script-v2-prompt-quote">{mode === 'auto' ? '—' : quote ?? '…'}</span></span>
          <button
            type="button"
            disabled={!canSubmit || running}
            onClick={() => void submit()}
            className="flex h-9 min-w-[88px] items-center justify-center gap-1 rounded-lg bg-white px-3 text-[11px] font-medium text-[#202020] disabled:cursor-not-allowed disabled:opacity-30"
          >
            {running ? <><Spinner size={12} /> {progress}%</> : '确认合成'}
          </button>
          {running && onCancelRun && <button type="button" onClick={() => void onCancelRun()} className="h-8 rounded-lg px-2 text-[10px] text-white/40 hover:bg-white/7">取消</button>}
        </div>

        <div className="basis-full text-right">
          {quoteError && <span role="alert" className="mr-3 text-[10px] text-red-300">{quoteError}</span>}
          {error && <span role="alert" className="mr-3 text-[10px] text-red-300">合成失败：{error}</span>}
          {result === 'success' && <span className="mr-3 text-[10px] text-emerald-300">已提交合成</span>}
          {batchSummary && <span data-testid="script-v2-prompt-batch-progress" className="text-[10px] text-white/38">串行进度：{batchSummary}</span>}
        </div>
      </footer>
    </PromptLayer>
  )
}

export interface ScriptV2PromptStageProps {
  state: ScriptV2State
  onOpenDetail: (rowId: string) => void
  onOpenBatch: () => void
}

/** Stage-three table projection; prompt details remain in the modal for focused editing. */
export function ScriptV2PromptStage({ state, onOpenDetail, onOpenBatch }: ScriptV2PromptStageProps) {
  const ready = state.rows.filter((row) => promptTrackReady(row, 'image') && promptTrackReady(row, 'video')).length
  return (
    <div className="thin-scrollbar min-h-0 flex-1 overflow-auto bg-[#171717]" data-testid="script-v2-prompt-stage">
      <table aria-label="提示词镜头表" className="w-full min-w-[1380px] table-fixed border-collapse text-left">
        <colgroup>
          <col className="w-[82px]" /><col className="w-[88px]" /><col className="w-[300px]" /><col className="w-[108px]" />
          <col className="w-[160px]" /><col className="w-[170px]" /><col className="w-[130px]" /><col className="w-[130px]" />
          <col className="w-[270px]" /><col className="w-[70px]" />
        </colgroup>
        <thead className="sticky top-0 z-20 bg-[#222222]">
          <tr>{['镜号', '时长', '画面描述', '景别', '光影氛围', '对白·旁白', '音效', '运镜', '最终提示词', '操作'].map((header, index) => (
            <th key={header} scope="col" className={cn('h-12 border-b border-r border-white/8 px-3 text-[11px] font-normal text-white/42 last:border-r-0', index === 0 && 'sticky left-0 z-30 bg-[#222222]', index === 8 && 'bg-cyan-400/10 text-cyan-100/65', index === 9 && 'sticky right-0 z-30 bg-[#222222]')}>{header}</th>
          ))}</tr>
        </thead>
        <tbody>
          {state.rows.map((row) => (
            <tr key={row.id} data-testid={`script-v2-prompt-row-${row.id}`} className="group/row bg-[#1b1b1b] hover:bg-[#202020]">
              <td className="sticky left-0 z-10 border-b border-r border-white/8 bg-[#1b1b1b] px-3 text-[11px] text-white/70">{row.shotNumber}</td>
              <td className="border-b border-r border-white/8 px-3 text-[11px] text-white/55">{row.durationSeconds}s</td>
              <td className="border-b border-r border-white/8 px-3 text-[11px] text-white/58"><span className="line-clamp-2">{row.plotDescription || '+'}</span></td>
              <td className="border-b border-r border-white/8 px-3 text-[11px] text-white/55">{row.shotSize}</td>
              <td className="border-b border-r border-white/8 px-3 text-[11px] text-white/45">{row.lightingAndAtmosphere || '+'}</td>
              <td className="border-b border-r border-white/8 px-3 text-[11px] text-white/45">{row.dialogue || '+'}</td>
              <td className="border-b border-r border-white/8 px-3 text-[11px] text-white/45">{row.audioEffects || '+'}</td>
              <td className="border-b border-r border-white/8 px-3 text-[11px] text-white/45">{row.cinematics?.cameraMovement || '+'}</td>
              <td className="border-b border-r border-white/8 bg-cyan-400/[0.025] px-3">
                <button type="button" aria-label={`查看镜头 ${row.shotNumber} 最终提示词`} onClick={() => onOpenDetail(row.id)} className="w-full text-left">
                  <span className="block truncate text-[10px] text-white/62">{row.imageGenerationPrompt || row.videoMotionPrompt || '待生成提示词'}</span>
                  <span className="mt-1 flex gap-1.5">
                    <PromptStatusBadge track="image" state={row.imagePromptState} />
                    <PromptStatusBadge track="video" state={row.videoPromptState} />
                  </span>
                </button>
              </td>
              <td className="sticky right-0 z-10 border-b border-white/8 bg-[#1b1b1b] px-3"><button type="button" aria-label={`编辑镜头 ${row.shotNumber} 提示词`} onClick={() => onOpenDetail(row.id)} className="rounded-md px-2 py-1 text-[10px] text-white/38 hover:bg-white/7 hover:text-white/72">编辑</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-end gap-4 px-5 py-4 text-[10px] text-white/32">
        <span>{ready}/{state.rows.length} 个镜头已完成双轨提示词</span>
        <button type="button" onClick={onOpenBatch} className="flex h-9 items-center gap-1.5 rounded-lg bg-white px-4 text-[11px] font-medium text-[#202020] disabled:opacity-30" disabled={state.rows.length === 0}>
          <IconSparkle size={13} />一键合成全部提示词
        </button>
      </div>
    </div>
  )
}

function PromptTrackEditor({
  track,
  row,
  value,
  state,
  statusLabel,
  onChange,
}: {
  track: ScriptV2PromptTrack
  row: ScriptV2Row
  value: string
  state: ScriptV2PromptState
  statusLabel: string
  onChange: (value: string) => void
}) {
  const image = track === 'image'
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-[11px] text-white/68">
        {image ? '分镜图提示词' : '视频运动提示词'}
        <span data-testid={`script-v2-${track}-prompt-status`} className={cn('rounded-full px-1.5 py-0.5 text-[9px]', statusTone(state))}>{statusLabel}</span>
        <span className="ml-auto text-[9px] text-white/28">自动保存</span>
      </span>
      <textarea
        aria-label={`第 ${row.shotNumber} 镜${image ? '分镜图' : '视频运动'}提示词`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => undefined}
        rows={image ? 6 : 6}
        placeholder={image ? '描述主体、构图、环境、光影和视觉质感' : '描述动作、运镜、节奏和镜头衔接'}
        className="h-[154px] w-full resize-none rounded-xl border border-white/9 bg-[#151515] px-3 py-2.5 text-[12px] leading-relaxed text-white/82 outline-none placeholder:text-white/22 focus:border-white/22"
      />
    </label>
  )
}

function ScriptModelMenu({
  currentId,
  onSelect,
  align = 'left',
}: {
  currentId: string
  onSelect: (model: ModelDefinition) => void
  align?: 'left' | 'right'
}) {
  return (
    <div role="listbox" aria-label="提示词模型目录" className={cn('absolute bottom-[42px] z-20 w-[250px] overflow-hidden rounded-xl border border-white/10 bg-[#303030] p-1.5 shadow-[0_18px_46px_rgba(0,0,0,.55)]', align === 'right' ? 'right-0' : 'left-0')}>
      {SCRIPT_MODELS.map((candidate) => (
        <button key={candidate.id} type="button" role="option" aria-selected={candidate.id === currentId} onClick={() => onSelect(candidate)} className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/7', candidate.id === currentId && 'bg-white/7')}>
          <IconSparkle size={13} className="text-white/35" />
          <span className="min-w-0 flex-1"><span className="block text-[11px] text-white/78">{candidate.label}</span><span className="block text-[9px] text-white/30">{candidate.description}</span></span>
          <span className="text-[9px] text-white/28">{candidate.latencyLabel}</span>
        </button>
      ))}
    </div>
  )
}

function PromptLayer({
  ariaLabel,
  testId,
  width,
  children,
}: {
  ariaLabel: string
  testId: string
  width: string
  children: ReactNode
}) {
  const dialogRef = useScriptV2DialogFocus(true)

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[1px] sm:p-6" data-testid={`${testId}-backdrop`}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={ariaLabel} data-testid={testId} className={cn('max-h-[calc(100vh-24px)] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#242424] shadow-[0_24px_90px_rgba(0,0,0,.58)] sm:max-h-[calc(100vh-48px)]', width)}>
        {children}
      </div>
    </div>
  )
}

function PromptStatusBadge({ track, state }: { track: ScriptV2PromptTrack; state: ScriptV2PromptState }) {
  return <span data-testid={`script-v2-${track}-status-badge`} className={cn('rounded-full px-1.5 py-0.5 text-[8px]', statusTone(state))}>{PROMPT_STATE_LABELS[state]}</span>
}

function promptTrackReady(row: ScriptV2Row, track: ScriptV2PromptTrack): boolean {
  const value = track === 'image' ? row.imageGenerationPrompt : row.videoMotionPrompt
  const state = track === 'image' ? row.imagePromptState : row.videoPromptState
  return Boolean(value.trim()) && (state === 'synced' || state === 'user_edited')
}

function promptStatus(
  state: ScriptV2PromptState,
  scriptState: ScriptV2State,
  rowId: string,
): { state: ScriptV2PromptState; label: string } {
  const latest = [...scriptState.promptBatchRuns].reverse().find((run) => run.targetShotIds.includes(rowId))
  const failed = latest?.status === 'failed' && latest.batches.some((batch) => batch.shotIds.includes(rowId) && batch.status === 'failed')
  if (failed && state === 'generating') return { state: 'stale', label: '合成失败 · 重试' }
  return { state, label: PROMPT_STATE_LABELS[state] }
}

function statusTone(state: ScriptV2PromptState): string {
  if (state === 'synced' || state === 'user_edited') return 'bg-emerald-400/12 text-emerald-200'
  if (state === 'generating') return 'bg-cyan-400/12 text-cyan-200'
  if (state === 'stale' || state === 'user_edited_stale') return 'bg-amber-400/12 text-amber-200'
  return 'bg-white/8 text-white/38'
}

function batchStatusLabel(status: string): string {
  switch (status) {
    case 'succeeded': return '完成'
    case 'failed': return '失败'
    case 'running': return '处理中'
    case 'submitting': return '提交中'
    case 'cancelled': return '已取消'
    default: return '待处理'
  }
}

function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? 'col-span-2' : ''}><span className="mr-2 text-white/25">{label}</span><span className="text-white/52">{value}</span></div>
}
