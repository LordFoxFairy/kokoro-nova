'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useStore as useFlowStore } from '@xyflow/react'
import { availableVideoModes, videoModeOptions } from '@/domain/compile'
import { createNode } from '@/domain/factory'
import { newId } from '@/domain/ids'
import { CAMERA_MOVES } from '@/domain/libraries'
import {
  MODELS_BY_ID,
  VIDEO_MODE_LABELS,
  modelOutputOptions,
  normalizeOutputForModel,
  quoteCredits,
  type ModelDefinition,
  type VideoGenerationMode,
} from '@/domain/models'
import type { GenerationJob, NodeData, OutputSpec, WorkflowNode } from '@/domain/types'
import {
  orderedVideoReferences,
  readVideoElementMarks,
  readVideoMentions,
  videoReferenceLabel,
} from '@/domain/video-references'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import {
  IconAt,
  IconCharacter,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconCredit,
  IconEffect,
  IconFilter,
  IconImage,
  IconLink,
  IconLocate,
  IconPlay,
  IconSearch,
  IconSparkle,
  IconStop,
  IconVideo,
} from '../icons'
import { ProgressBar, Spinner, Toggle } from '../ui/controls'
import { MaterialPanel } from './LibraryPanels'
import {
  formatVideoOutputSummary,
  formatVideoResolution,
  VideoModelCatalog,
  VideoModelMark,
} from '../video/VideoModelCatalog'

interface VideoNodeEditorProps {
  node: WorkflowNode
  job: GenerationJob | null
  onRun: (nodeId: string) => void
  onCancel: (jobId: string) => void
  selectionMode: 'reference' | 'element' | null
  onStartSelection: (kind: 'reference' | 'element', targetNodeId: string) => void
  onExitSelection: () => void
  onRemoveReference: (targetNodeId: string, sourceNodeId: string) => void
  onLocateReference: (nodeId: string) => void
}

type OpenPopover = 'models' | 'modes' | 'output' | 'camera' | 'advanced' | null

const VIDEO_GENERATION_LOCKED_STATUSES = ['awaiting_confirmation', 'queued', 'running'] as const

export function isVideoGenerationLocked(status: GenerationJob['status'] | undefined) {
  return status !== undefined && VIDEO_GENERATION_LOCKED_STATUSES.includes(status as (typeof VIDEO_GENERATION_LOCKED_STATUSES)[number])
}

export function videoGenerationStatusCopy(status: GenerationJob['status'] | undefined) {
  switch (status) {
    case 'awaiting_confirmation':
      return { label: '等待确认', description: '已提交，等待确认后开始生成' }
    case 'queued':
      return { label: '排队中', description: '已进入生成队列，请稍候' }
    case 'running':
      return { label: '生成中', description: '正在生成视频，请稍候' }
    default:
      return null
  }
}

export function videoPromptNeedsFlush(prompt: string, storedPrompt: string | undefined) {
  return prompt !== (storedPrompt ?? '')
}

/**
 * The current LibTV canvas keeps the Video composer attached to its node while
 * cancelling the graph zoom for the form itself. The graph remains spatial;
 * text, hit targets and menus stay readable at a stable screen size.
 */
export function VideoNodeEditor({
  node,
  job,
  onRun,
  onCancel,
  selectionMode,
  onStartSelection,
  onExitSelection,
  onRemoveReference,
  onLocateReference,
}: VideoNodeEditorProps) {
  const zoom = useFlowStore((state) => state.transform[2])
  const document = useEditor((state) => state.document)
  const commit = useEditor((state) => state.commit)
  const inspect = useEditor((state) => state.inspect)
  const setLeftPanel = useEditor((state) => state.setLeftPanel)
  const toast = useEditor((state) => state.toast)
  const [prompt, setPrompt] = useState(node.data.prompt ?? '')
  const [popover, setPopover] = useState<OpenPopover>(null)
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null)
  const [localEffectPanelOpen, setLocalEffectPanelOpen] = useState(false)
  const [runInFlight, setRunInFlight] = useState(false)
  const promptCommitRef = useRef<Promise<boolean> | null>(null)
  const runInFlightRef = useRef(false)

  useEffect(() => setPrompt(node.data.prompt ?? ''), [node.id, node.data.prompt])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      if (selectionMode) {
        onExitSelection()
        return
      }
      if (previewNodeId) {
        setPreviewNodeId(null)
        return
      }
      if (popover) {
        setPopover(null)
        return
      }
      const target = event.target as HTMLElement | null
      if (target?.matches('textarea,input')) target.blur()
      inspect(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [inspect, onExitSelection, popover, previewNodeId, selectionMode])

  const patchNode = (patch: Partial<NodeData>) => {
    const current = useEditor.getState().document.nodes.find((item) => item.id === node.id)
    if (!current) return Promise.resolve(false)
    return commit([{ op: 'updateNode', nodeId: node.id, patch: { data: { ...current.data, ...patch } } }], '编辑视频节点')
  }

  const model = node.data.modelId ? MODELS_BY_ID.get(node.data.modelId) : undefined
  const capabilities = node.data.modelId ? modelOutputOptions(node.data.modelId) : null
  const output = capabilities
    ? normalizeOutputForModel(node.data.modelId!, node.data.output, availableVideoModes(document, node.id))
    : (node.data.output ?? {})
  const modeRows = videoModeOptions(document, node.id)
  const running = job?.status === 'running' || job?.status === 'queued'
  const generationLocked = isVideoGenerationLocked(job?.status)
  const generationStatus = videoGenerationStatusCopy(job?.status)
  const cost = node.data.modelId ? quoteCredits(node.data.modelId, output).credits : 0
  const advanced = (node.data.extra?.advanced as
    | { webSearch?: boolean; autoCompliance?: boolean; autoLink?: boolean }
    | undefined) ?? { webSearch: false, autoCompliance: true, autoLink: true }
  const cameraFavorites = Array.isArray(node.data.extra?.cameraFavorites)
    ? node.data.extra.cameraFavorites.filter((id): id is string => typeof id === 'string')
    : []

  const references = useMemo(() => orderedVideoReferences(document, node.id), [document, node.id])
  const mentions = readVideoMentions(node.data.extra)
  const elementMarks = readVideoElementMarks(node.data.extra)
  const previewReference = references.find((reference) => reference.node.id === previewNodeId)?.node ?? null

  const setOutput = (outputPatch: Partial<OutputSpec>) => {
    if (!node.data.modelId) return
    patchNode({
      output: normalizeOutputForModel(node.data.modelId, { ...output, ...outputPatch }, availableVideoModes(document, node.id)),
    })
  }

  const selectModel = (nextModel: ModelDefinition) => {
    const availableModes = availableVideoModes(document, node.id, nextModel.id)
    patchNode({
      modelId: nextModel.id,
      output: normalizeOutputForModel(nextModel.id, output, availableModes),
    })
    setPopover(null)
  }

  const setAdvanced = (patch: Partial<typeof advanced>) => {
    patchNode({
      extra: {
        ...node.data.extra,
        advanced: { ...advanced, ...patch },
      },
    })
  }

  const insertMention = (reference: WorkflowNode, index: number) => {
    const label = videoReferenceLabel(reference, index)
    const nextMention = {
      id: newId('vmn'),
      nodeId: reference.id,
      label,
      ordinal: mentions.length + 1,
    }
    patchNode({
      extra: {
        ...node.data.extra,
        videoMentions: [...mentions, nextMention],
      },
    })
    setPreviewNodeId(reference.id)
  }

  const removeMention = (mentionId: string) => {
    patchNode({
      extra: {
        ...node.data.extra,
        videoMentions: mentions.filter((mention) => mention.id !== mentionId),
      },
    })
  }

  const flushPrompt = () => {
    const flush = async () => {
      const pendingCommit = promptCommitRef.current
      if (pendingCommit) {
        if (!(await pendingCommit)) return false
        const persistedPrompt = useEditor.getState().document.nodes.find((item) => item.id === node.id)?.data.prompt
        if (!videoPromptNeedsFlush(prompt, persistedPrompt)) return true
      }

      const currentPrompt = useEditor.getState().document.nodes.find((item) => item.id === node.id)?.data.prompt
      if (!videoPromptNeedsFlush(prompt, currentPrompt)) return true

      const nextCommit = patchNode({ prompt })
      promptCommitRef.current = nextCommit
      try {
        return await nextCommit
      } finally {
        if (promptCommitRef.current === nextCommit) promptCommitRef.current = null
      }
    }

    return flush()
  }

  const handleRun = async () => {
    if (generationLocked || runInFlightRef.current) return
    runInFlightRef.current = true
    setRunInFlight(true)
    try {
      if (await flushPrompt()) await onRun(node.id)
    } finally {
      runInFlightRef.current = false
      setRunInFlight(false)
    }
  }

  const openEffectMaterialPanel = () => {
    setLocalEffectPanelOpen(true)
  }

  const applyLocalEffect = async (preset: { id: string; name: string; hue: number }) => {
    const currentDocument = useEditor.getState().document
    const effectNode = createNode(
      'effect',
      { x: node.position.x + node.size.width + 120, y: node.position.y },
      currentDocument.nodes,
      { name: preset.name },
    )
    effectNode.data.extra = {
      ...effectNode.data.extra,
      presetId: preset.id,
      presetName: preset.name,
      hue: preset.hue,
    }
    if (await commit([{ op: 'addNode', node: effectNode }], '添加特效节点')) setLocalEffectPanelOpen(false)
  }

  return (
    <div
      data-testid="video-node-editor"
      data-zoom-compensation={(1 / Math.max(zoom, 0.01)).toFixed(5)}
      className="node-floating-ui nodrag nowheel nopan absolute -bottom-3 left-1/2 z-30 w-[660px] -translate-x-1/2 translate-y-full origin-top"
      style={{ transform: `scale(${1 / Math.max(zoom, 0.01)})` }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <section className="relative flex min-h-[254px] w-full flex-col overflow-visible rounded-2xl border border-white/10 bg-[#242424] shadow-[0_14px_45px_rgba(0,0,0,0.42)]">
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          <div className="flex items-center gap-1.5">
            <QuickAction
              label="参考"
              icon={<IconLink size={14} />}
              active={selectionMode === 'reference'}
              onClick={() => onStartSelection('reference', node.id)}
            />
            <QuickAction
              label="标记"
              icon={<IconLocate size={14} />}
              active={selectionMode === 'element' || elementMarks.length > 0}
              onClick={() => onStartSelection('element', node.id)}
            />
            <QuickAction label="角色库" icon={<IconCharacter size={14} />} onClick={() => setLeftPanel('character')} />
            <QuickAction
              label="运镜"
              icon={<IconVideo size={14} />}
              active={popover === 'camera'}
              onClick={() => setPopover(popover === 'camera' ? null : 'camera')}
            />
            <QuickAction label="特效" icon={<IconEffect size={14} />} onClick={openEffectMaterialPanel} />
            <button
              type="button"
              aria-label="关闭视频编辑器"
              onClick={() => inspect(null)}
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 hover:bg-white/8 hover:text-ink-800"
            >
              <IconClose size={15} />
            </button>
          </div>

          {references.length > 0 && (
            <div data-testid="video-reference-strip" className="flex min-h-12 items-center gap-1.5 overflow-x-auto px-0.5 pb-0.5">
              {references.map(({ node: reference }, index) => {
                const artifact = reference.data.artifacts?.[0]
                const label = videoReferenceLabel(reference, index)
                return (
                  <div
                    key={reference.id}
                    data-testid={`video-reference-card-${reference.id}`}
                    className="group/reference relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/12 bg-white/[0.055]"
                  >
                    <span className="flex h-full w-full items-center justify-center overflow-hidden bg-white/8 text-ink-400">
                      {artifact?.thumbnailUrl || (artifact?.kind === 'image' && artifact.url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={artifact.thumbnailUrl ?? artifact.url} alt="" className="h-full w-full object-cover" />
                      ) : reference.type === 'video' ? (
                        <IconVideo size={13} />
                      ) : (
                        <IconImage size={13} />
                      )}
                    </span>
                    <span className="absolute top-0.5 left-0.5 flex h-4 min-w-4 items-center justify-center rounded bg-black/72 px-1 text-[9px] font-semibold text-white">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      aria-label={`在提示词中引用 ${label}`}
                      title={`在提示词中引用 ${label}`}
                      onClick={() => insertMention(reference, index)}
                      className="absolute right-0.5 bottom-0.5 flex h-4 w-4 items-center justify-center rounded bg-black/72 text-[9px] font-semibold text-white hover:bg-[#1769e8]"
                    >
                      @
                    </button>
                    <button
                      type="button"
                      aria-label={`移除参考 ${label}`}
                      title={`移除参考 ${label}`}
                      onClick={() => {
                        setPreviewNodeId(null)
                        onRemoveReference(node.id, reference.id)
                      }}
                      className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded bg-black/72 text-white opacity-0 transition-opacity hover:bg-[#b62d3a] group-hover/reference:opacity-100 focus-visible:opacity-100"
                    >
                      <IconClose size={9} />
                    </button>
                    <span className="sr-only">{label} · {reference.name}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="min-h-[76px] flex-1 rounded-xl border border-transparent bg-transparent px-2 py-1.5 focus-within:border-white/10 focus-within:bg-black/10">
            {(mentions.length > 0 || elementMarks.length > 0) && (
              <div className="mb-1 flex flex-wrap items-center gap-1">
                {mentions.map((mention) => (
                  <span
                    key={mention.id}
                    data-testid="video-mention-chip"
                    className="inline-flex h-5 items-center gap-1 rounded-md border border-[#4d8eff]/32 bg-[#1769e8]/20 px-1.5 text-[10px] font-medium text-[#90b9ff]"
                  >
                    <IconAt size={10} />
                    {mention.label}
                    <button
                      type="button"
                      aria-label={`删除引用 ${mention.label}`}
                      onClick={() => removeMention(mention.id)}
                      className="text-[#90b9ff]/65 hover:text-white"
                    >
                      <IconClose size={8} />
                    </button>
                  </span>
                ))}
                {elementMarks.map((mark) => (
                  <span
                    key={mark.id}
                    data-testid="video-element-chip"
                    className="inline-flex h-5 items-center gap-1 rounded-md border border-[#a683ff]/32 bg-[#7654d8]/18 px-1.5 text-[10px] font-medium text-[#c5b4ff]"
                  >
                    <IconLocate size={10} /> {mark.label}
                  </span>
                ))}
              </div>
            )}
            <textarea
              data-testid="video-prompt"
              value={prompt}
              rows={mentions.length > 0 || elementMarks.length > 0 ? 2 : references.length > 0 ? 3 : 5}
              placeholder="描述你想要生成的画面内容，@引用素材"
              onChange={(event) => setPrompt(event.target.value)}
              onBlur={() => void flushPrompt()}
              className="min-h-[56px] w-full resize-none bg-transparent text-[13px] leading-relaxed text-ink-800 outline-none placeholder:text-ink-400"
            />
          </div>

          <div className="flex h-8 w-full items-center gap-1 border-t border-white/[0.06] pt-2">
            <button
              type="button"
              data-testid="video-model-selector"
              aria-haspopup="dialog"
              aria-expanded={popover === 'models'}
              onClick={() => setPopover(popover === 'models' ? null : 'models')}
              className="flex h-8 min-w-[110px] max-w-[190px] items-center gap-1.5 rounded-lg px-2 text-[12px] text-ink-800 transition-colors hover:bg-white/8"
            >
              <VideoModelMark iconKey={model?.iconKey} />
              <span className="truncate font-medium">{model?.label ?? '选择模型'}</span>
              {model?.membershipTier === 'vip' && <span className="text-[10px] text-[#ffc657]">◆</span>}
              <IconChevronDown size={12} className="shrink-0 text-ink-400" />
            </button>

            <button
              type="button"
              data-testid="video-mode-selector"
              aria-haspopup="menu"
              aria-expanded={popover === 'modes'}
              onClick={() => setPopover(popover === 'modes' ? null : 'modes')}
              className="flex h-8 max-w-[120px] items-center gap-1 rounded-lg px-2 text-[12px] text-ink-700 hover:bg-white/8"
            >
              <span className="truncate">{output.mode ? VIDEO_MODE_LABELS[output.mode] : '生成模式'}</span>
              <IconChevronDown size={12} className="shrink-0 text-ink-400" />
            </button>

            <span className="h-5 w-px bg-white/8" />

            <button
              type="button"
              data-testid="video-output-selector"
              aria-haspopup="dialog"
              aria-expanded={popover === 'output'}
              onClick={() => setPopover(popover === 'output' ? null : 'output')}
              className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-lg px-2 text-[12px] text-ink-700 hover:bg-white/8"
            >
              <span className="truncate tabular-nums">{formatVideoOutputSummary(output)}</span>
              <IconChevronDown size={12} className="shrink-0 text-ink-400" />
            </button>

            <button
              type="button"
              aria-label="提示词优化"
              onClick={() => toast('已使用本地规则优化提示词', 'success')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-white/8 hover:text-ink-800"
            >
              <IconSparkle size={15} />
            </button>
            <button
              type="button"
              aria-label="高级设置"
              aria-expanded={popover === 'advanced'}
              onClick={() => setPopover(popover === 'advanced' ? null : 'advanced')}
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/8',
                popover === 'advanced' ? 'bg-white/8 text-ink-900' : 'text-ink-500',
              )}
            >
              <IconFilter size={15} />
            </button>

            <span className="ml-1 flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-ink-500">
              <IconCredit size={12} /> {cost}
            </span>
            {running ? (
              <button
                type="button"
                aria-label="取消生成"
                onClick={() => job && onCancel(job.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-ink-800"
              >
                <IconStop size={13} />
              </button>
            ) : generationLocked || runInFlight ? (
              <button
                type="button"
                data-testid="video-run"
                disabled
                aria-label={generationStatus?.label ?? '正在保存提示词'}
                title={generationStatus?.description ?? '正在保存提示词，请稍候'}
                className="flex h-8 w-8 shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-white/15 text-ink-400"
              >
                <IconPlay size={13} />
              </button>
            ) : (
              <button
                type="button"
                data-testid="video-run"
                aria-label="生成视频"
                onClick={() => void handleRun()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d9dadb] text-[#1f1f1f] hover:bg-white"
              >
                <IconPlay size={13} />
              </button>
            )}
          </div>

          {generationStatus && (
            <div className="flex items-center gap-2 px-1 text-[11px] text-ink-500">
              {running && <Spinner size={12} />}
              <span data-testid="video-generation-status">{generationStatus.label}</span>
              <span className="text-ink-400">{running ? `${job?.progress ?? 0}% · ` : '· '}{generationStatus.description}</span>
              <div className="flex-1"><ProgressBar value={job?.progress ?? 0} /></div>
            </div>
          )}

          {previewReference && (
            <ReferencePreview
              reference={previewReference}
              onClose={() => setPreviewNodeId(null)}
              onLocate={() => {
                setPreviewNodeId(null)
                onLocateReference(previewReference.id)
              }}
            />
          )}
        </div>

        {popover === 'models' && (
          <VideoModelCatalog
            currentId={node.data.modelId ?? null}
            onSelect={selectModel}
            onClose={() => setPopover(null)}
            className="absolute bottom-12 left-2 z-50 h-[520px] w-[410px]"
          />
        )}
        {popover === 'modes' && (
          <ModePopover rows={modeRows} value={output.mode} onChange={(mode) => { setOutput({ mode }); setPopover(null) }} />
        )}
        {popover === 'output' && capabilities && (
          <OutputPopover capabilities={capabilities} output={output} onChange={(patch) => { setOutput(patch); setPopover(null) }} />
        )}
        {popover === 'camera' && (
          <CameraLibraryPortal
            current={(node.data.extra?.cameraMove as string | undefined) ?? null}
            favorites={cameraFavorites}
            onChange={(cameraMove, promptSuffix) => {
              const nextPrompt = prompt.includes(promptSuffix)
                ? prompt
                : prompt
                  ? `${prompt}\n${promptSuffix}`
                  : promptSuffix
              setPrompt(nextPrompt)
              patchNode({
                prompt: nextPrompt,
                extra: { ...node.data.extra, cameraMove },
              })
              setPopover(null)
            }}
            onFavoritesChange={(favorites) => {
              patchNode({ extra: { ...node.data.extra, cameraFavorites: favorites } })
            }}
            onClose={() => setPopover(null)}
          />
        )}
        {popover === 'advanced' && (
          <AdvancedPopover advanced={advanced} onChange={setAdvanced} />
        )}
      </section>
      <MaterialPanel
        open={localEffectPanelOpen}
        kind="effect"
        onClose={() => setLocalEffectPanelOpen(false)}
        onApply={(preset) => void applyLocalEffect(preset)}
      />
    </div>
  )
}

function QuickAction({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] transition-colors',
        active ? 'bg-white/12 text-ink-900' : 'bg-white/[0.065] text-ink-600 hover:bg-white/10 hover:text-ink-800',
      )}
    >
      {icon} {label}
    </button>
  )
}

function ModePopover({
  rows,
  value,
  onChange,
}: {
  rows: ReturnType<typeof videoModeOptions>
  value: OutputSpec['mode']
  onChange: (mode: VideoGenerationMode) => void
}) {
  return (
    <div
      role="menu"
      aria-label="视频生成模式"
      data-testid="video-mode-menu"
      className="absolute bottom-12 left-[126px] z-40 w-[220px] rounded-2xl border border-white/10 bg-[#292929] p-2 shadow-[0_14px_40px_rgba(0,0,0,0.5)]"
    >
      <div className="px-2 pb-1.5 text-[10px] font-medium text-ink-400">视频生成模式</div>
      {rows.map((row) => (
        <button
          key={row.mode}
          type="button"
          role="menuitemradio"
          aria-checked={row.mode === value}
          disabled={!row.available}
          title={row.reason ?? undefined}
          onClick={() => onChange(row.mode)}
          className={cn(
            'flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[12px]',
            row.available ? 'text-ink-700 hover:bg-white/8' : 'cursor-not-allowed text-ink-300',
            row.mode === value && 'bg-white/8 text-ink-900',
          )}
        >
          <IconVideo size={13} />
          <span className="flex-1">{VIDEO_MODE_LABELS[row.mode]}</span>
          {row.mode === value && <IconCheck size={12} />}
        </button>
      ))}
    </div>
  )
}

function OutputPopover({
  capabilities,
  output,
  onChange,
}: {
  capabilities: NonNullable<ReturnType<typeof modelOutputOptions>>
  output: OutputSpec
  onChange: (patch: Partial<OutputSpec>) => void
}) {
  return (
    <div
      role="dialog"
      aria-label="视频输出设置"
      data-testid="video-output-popover"
      className="absolute right-2 bottom-12 z-40 w-[350px] space-y-3 rounded-2xl border border-white/10 bg-[#292929] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.5)]"
    >
      <OptionGrid
        label="比例"
        values={capabilities.aspectRatios}
        value={output.aspectRatio}
        format={(value) => (value === 'auto' ? 'Auto' : value)}
        onChange={(aspectRatio) => onChange({ aspectRatio })}
      />
      <OptionGrid
        label="清晰度"
        values={capabilities.resolutions}
        value={output.resolution}
        format={formatVideoResolution}
        onChange={(resolution) => onChange({ resolution })}
      />
      <OptionGrid
        label="视频时长"
        values={capabilities.durationsSeconds}
        value={output.durationSeconds}
        format={(seconds) => `${seconds}s`}
        onChange={(durationSeconds) => onChange({ durationSeconds })}
      />
      {capabilities.audio !== 'unsupported' && (
        <OptionGrid
          label="生成音频"
          values={[true, false] as const}
          value={Boolean(output.withAudio)}
          format={(enabled) => (enabled ? '开启' : '关闭')}
          onChange={(withAudio) => onChange({ withAudio })}
          disabled={capabilities.audio === 'required' ? [false] : []}
        />
      )}
      <OptionGrid
        label="生成数量"
        values={capabilities.counts}
        value={output.count ?? 1}
        format={(count) => `${count}个`}
        onChange={(count) => onChange({ count })}
      />
    </div>
  )
}

function OptionGrid<T extends string | number | boolean>({
  label,
  values,
  value,
  format,
  onChange,
  disabled = [],
}: {
  label: string
  values: readonly T[]
  value: T | undefined
  format: (value: T) => string
  onChange: (value: T) => void
  disabled?: readonly T[]
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium text-ink-500">{label}</div>
      <div className="grid grid-cols-4 gap-1.5">
        {values.map((option) => {
          const active = option === value
          const blocked = disabled.includes(option)
          return (
            <button
              key={String(option)}
              type="button"
              aria-pressed={active}
              disabled={blocked}
              onClick={() => onChange(option)}
              className={cn(
                'h-9 rounded-xl border text-[11px] transition-colors',
                active
                  ? 'border-white/45 bg-white/9 text-ink-900'
                  : 'border-white/8 bg-transparent text-ink-500 hover:bg-white/6 hover:text-ink-800',
                blocked && 'cursor-not-allowed opacity-35',
              )}
            >
              {format(option)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AdvancedPopover({
  advanced,
  onChange,
}: {
  advanced: { webSearch?: boolean; autoCompliance?: boolean; autoLink?: boolean }
  onChange: (patch: Partial<typeof advanced>) => void
}) {
  return (
    <div
      data-testid="video-advanced-settings"
      className="absolute inset-x-0 top-full z-30 mt-2 space-y-0.5 rounded-2xl border border-white/10 bg-[#242424] px-4 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.48)]"
    >
      <div className="pb-1 text-[11px] font-medium text-ink-400">高级设置</div>
      <Toggle checked={Boolean(advanced.webSearch)} onChange={(webSearch) => onChange({ webSearch })} label="联网搜索" />
      <Toggle
        checked={advanced.autoCompliance ?? true}
        onChange={(autoCompliance) => onChange({ autoCompliance })}
        label="自动校验素材"
      />
      <Toggle
        checked={advanced.autoLink ?? true}
        onChange={(autoLink) => onChange({ autoLink })}
        label="智能引用 AutoLink"
      />
    </div>
  )
}

function ReferencePreview({
  reference,
  onClose,
  onLocate,
}: {
  reference: WorkflowNode
  onClose: () => void
  onLocate: () => void
}) {
  const artifact = reference.data.artifacts?.[0]
  const previewUrl = artifact?.thumbnailUrl ?? artifact?.url ?? null

  return (
    <aside
      data-testid="video-reference-preview"
      className="absolute top-[68px] left-[76px] z-50 w-[250px] overflow-hidden rounded-2xl border border-white/12 bg-[#2b2b2b] shadow-[0_18px_46px_rgba(0,0,0,0.52)]"
      onDoubleClick={onLocate}
      title="双击可聚焦至节点"
    >
      <div className="relative h-[132px] bg-black/35">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={reference.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-400">
            {reference.type === 'video' ? <IconVideo size={28} /> : <IconImage size={28} />}
          </div>
        )}
        <button
          type="button"
          aria-label="关闭参考预览"
          onClick={onClose}
          className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white/75 hover:text-white"
        >
          <IconClose size={12} />
        </button>
      </div>
      <div className="flex items-center gap-2 p-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-ink-800">{reference.name}</div>
          <div className="mt-0.5 text-[10px] text-ink-400">双击可聚焦至节点</div>
        </div>
        <button
          type="button"
          aria-label={`定位${reference.name}`}
          onClick={onLocate}
          className="flex h-7 items-center gap-1 rounded-lg bg-white/8 px-2 text-[10px] text-ink-700 hover:bg-white/12"
        >
          <IconLocate size={11} /> 定位
        </button>
      </div>
    </aside>
  )
}

type CameraLibraryTab = 'plaza' | 'favorites' | 'mine'

function CameraLibraryPortal({
  current,
  favorites,
  onChange,
  onFavoritesChange,
  onClose,
}: {
  current: string | null
  favorites: string[]
  onChange: (id: string, prompt: string) => void
  onFavoritesChange: (favorites: string[]) => void
  onClose: () => void
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <CameraLibrary
      current={current}
      favorites={favorites}
      onChange={onChange}
      onFavoritesChange={onFavoritesChange}
      onClose={onClose}
    />,
    document.body,
  )
}

function CameraLibrary({
  current,
  favorites,
  onChange,
  onFavoritesChange,
  onClose,
}: {
  current: string | null
  favorites: string[]
  onChange: (id: string, prompt: string) => void
  onFavoritesChange: (favorites: string[]) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<CameraLibraryTab>('plaza')
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  const source = tab === 'favorites' ? CAMERA_MOVES.filter((move) => favorites.includes(move.id)) : CAMERA_MOVES
  const rows =
    tab === 'mine'
      ? []
      : source.filter(
          (move) =>
            !normalized ||
            move.name.toLocaleLowerCase('zh-CN').includes(normalized) ||
            move.group.toLocaleLowerCase('zh-CN').includes(normalized),
        )

  const toggleFavorite = (id: string) => {
    onFavoritesChange(
      favorites.includes(id) ? favorites.filter((favorite) => favorite !== id) : [...favorites, id],
    )
  }

  return (
    <div
      className="fixed inset-0 z-[140] bg-black/58"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <button type="button" aria-label="关闭运镜库背景" className="absolute inset-0" onClick={onClose} />
      <section
        role="dialog"
        aria-label="运镜库"
        aria-modal="false"
        data-testid="video-camera-library"
        className="absolute top-[126px] bottom-[120px] left-1/2 flex w-[calc(100vw-32px)] max-w-[1420px] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#292929] shadow-[0_24px_80px_rgba(0,0,0,0.62)]"
      >
        <header className="flex h-[58px] shrink-0 items-center gap-2 border-b border-white/8 px-4">
          <div role="tablist" aria-label="运镜分类" className="flex items-center gap-1">
            {([
              ['plaza', '运镜广场'],
              ['favorites', '我的收藏'],
              ['mine', '我的运镜'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  'h-9 rounded-lg px-3 text-[12px] transition-colors',
                  tab === value ? 'bg-white/9 font-medium text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/78',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="ml-3 flex h-9 w-[336px] items-center gap-2 rounded-lg bg-white/[0.075] px-3 text-white/42 focus-within:bg-white/10 focus-within:text-white/68">
            <IconSearch size={15} />
            <input
              type="search"
              aria-label="搜索运镜名称"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && rows[0]) onChange(rows[0].id, rows[0].prompt)
              }}
              placeholder="搜索运镜名称"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-white/82 outline-none placeholder:text-white/32"
            />
          </label>

          <span className="ml-auto text-[10px] tabular-nums text-white/32">
            {tab === 'mine' ? '0 个运镜' : `${rows.length} 个运镜`}
          </span>
          <button
            type="button"
            aria-label="关闭运镜库"
            onClick={onClose}
            className="ml-2 flex h-9 w-9 items-center justify-center rounded-lg text-white/45 hover:bg-white/8 hover:text-white"
          >
            <IconClose size={19} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'mine' ? (
            <CameraEmptyState title="还没有自定义运镜" detail="创建的个人运镜会保存在这里" />
          ) : rows.length === 0 ? (
            <CameraEmptyState
              title={tab === 'favorites' ? '还没有收藏运镜' : '没有找到相关运镜'}
              detail={tab === 'favorites' ? '在运镜广场点击星标即可收藏' : '试试搜索其他名称'}
            />
          ) : (
            <div className="grid grid-cols-4 gap-x-1 gap-y-2">
              {rows.map((move, index) => {
                const favorite = favorites.includes(move.id)
                return (
                  <div key={move.id} className="group relative min-w-0">
                    <button
                      type="button"
                      data-testid={`camera-move-card-${move.id}`}
                      aria-label={move.name}
                      aria-pressed={move.id === current}
                      onClick={() => onChange(move.id, move.prompt)}
                      className={cn(
                        'block w-full overflow-hidden rounded-md border text-left transition-[border-color,transform] hover:-translate-y-px hover:border-white/28',
                        move.id === current ? 'border-[#6a9eff]' : 'border-transparent',
                      )}
                    >
                      <CameraMovePreview hue={move.hue} variant={move.previewVariant} index={index} />
                      <span className="block truncate bg-[#292929] px-1 py-1 text-center text-[11px] text-white/82">
                        {move.name}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`${favorite ? '取消收藏' : '收藏'} ${move.name}`}
                      aria-pressed={favorite}
                      onClick={() => toggleFavorite(move.id)}
                      className={cn(
                        'absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-white/12 bg-black/52 text-[17px] shadow-md backdrop-blur transition-opacity hover:bg-black/72',
                        favorite ? 'text-[#ffd36a]' : 'text-white/80 opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                      )}
                    >
                      <span aria-hidden="true">{favorite ? '★' : '☆'}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function CameraMovePreview({ hue, variant, index }: { hue: number; variant: string; index: number }) {
  const positions = ['50% 46%', '42% 50%', '58% 42%', '50% 58%']
  return (
    <span
      className="relative block aspect-[1.78/1] overflow-hidden bg-[#111]"
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${hue} 45% 19% / .22), hsl(${(hue + 52) % 360} 42% 8% / .48)), url('/fixtures/libtv/media/city-night-poster.webp')`,
        backgroundPosition: positions[index % positions.length],
        backgroundSize: index % 3 === 0 ? 'cover' : `${112 + (index % 4) * 7}% auto`,
      }}
      data-preview-variant={variant}
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_36%,rgba(0,0,0,.42)_100%)]" />
      <span
        className="absolute top-1/2 left-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/45 bg-black/24 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <span className="absolute top-1/2 left-1/2 -translate-x-[42%] -translate-y-1/2 text-[12px] text-white">▶</span>
      </span>
    </span>
  )
}

function CameraEmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/6 text-white/28">
        <IconVideo size={22} />
      </span>
      <div className="text-[13px] font-medium text-white/65">{title}</div>
      <div className="mt-1 text-[11px] text-white/30">{detail}</div>
    </div>
  )
}
