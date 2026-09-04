'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore as useFlowStore } from '@xyflow/react'
import {
  AUDIO_FORMATS,
  AUDIO_MUSIC_DURATIONS,
  AUDIO_SAMPLE_RATES,
  audioExecutionOutput,
  defaultAudioAuthoringState,
  insertAudioToken,
  normalizeAudioAuthoringForModel,
  readAudioAuthoringState,
  type AudioAuthoringState,
  type AudioSettings,
} from '@/domain/audio-authoring'
import { PARALINGUISTIC_CUES, PAUSE_PRESETS, VOICES } from '@/domain/libraries'
import { MODELS_BY_ID, audioModelOutputOptions, quoteCredits, type ModelDefinition } from '@/domain/models'
import { canvasReferenceLabel, orderedCanvasReferences } from '@/domain/video-references'
import type { GenerationJob, NodeData, WorkflowNode } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { AudioModelCatalog, AudioModelMark } from '../audio/AudioModelCatalog'
import { VoiceLibraryDialog } from '../audio/VoiceLibraryDialog'
import { IconAudio, IconClose, IconCredit, IconFilter, IconLink, IconPlay, IconStop, IconText } from '../icons'
import { ProgressBar, Spinner, Toggle } from '../ui/controls'

interface AudioNodeEditorProps {
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

type OpenPopover = 'models' | 'output' | 'advanced' | 'voices' | 'pause' | 'cues' | null

const LANGUAGE_LABELS = { zh: '中文', en: '英文' } as const
const SOUND_EFFECT_LABELS: Record<AudioSettings['soundEffect'], string> = {
  none: '无',
  echo: '空旷回音',
  hall: '礼堂广播',
  telephone: '电话失真',
  electronic: '电音',
}
const STABILITY_LABELS: Record<AudioSettings['stability'], string> = {
  lively: '活泼的',
  natural: '自然的',
  steady: '沉稳的',
}

function outputSummary(state: AudioAuthoringState): string {
  const language = LANGUAGE_LABELS[state.settings.language]
  return `${language} · ${state.settings.sampleRate} · ${state.settings.format}`
}

function voiceLabel(voiceId: string, state: AudioAuthoringState): string {
  if (voiceId === 'voice-jin') return 'Jin - 清晰、温暖、随性'
  return [...VOICES, ...state.customVoices].find((voice) => voice.id === voiceId)?.name ?? '少女音色'
}

/**
 * Node-attached Audio composer. It counter-scales React Flow so the editor
 * retains the observed 660px screen width at every canvas zoom level.
 */
export function AudioNodeEditor({
  node,
  job,
  onRun,
  onCancel,
  selectionMode,
  onStartSelection,
  onExitSelection,
  onRemoveReference,
  onLocateReference,
}: AudioNodeEditorProps) {
  const zoom = useFlowStore((state) => state.transform[2])
  const commitWith = useEditor((state) => state.commitWith)
  const inspect = useEditor((state) => state.inspect)
  const [prompt, setPrompt] = useState(node.data.prompt ?? '')
  const [popover, setPopover] = useState<OpenPopover>(null)
  const [customPause, setCustomPause] = useState('')
  const [customPauseOpen, setCustomPauseOpen] = useState(false)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  // Toolbar and popover actions move focus away from the textarea before their
  // click handlers run. Keep the editor selection independently of the DOM so
  // a focus change (or a controlled-value reconciliation) cannot turn an
  // insertion into an append.
  const promptSelectionRef = useRef({ start: prompt.length, end: prompt.length })

  const modelId = node.data.modelId ?? 'seed-audio-1'
  const model = MODELS_BY_ID.get(modelId)
  const capabilities = audioModelOutputOptions(modelId)
  const authoring = readAudioAuthoringState(node.data.extra, modelId)
  const document = useEditor((state) => state.document)
  const references = useMemo(() => orderedCanvasReferences(document, node.id), [document, node.id])
  const running = job?.status === 'running' || job?.status === 'queued'
  const cost = quoteCredits(modelId, node.data.output).credits
  const maxCharacters = capabilities?.family === 'music-mureka' && authoring.settings.murekaMode === 'lyrics'
    ? 3_000
    : (capabilities?.maxCharacters ?? 2_000)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      if (popover === 'voices') return
      if (selectionMode) {
        onExitSelection()
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
  }, [inspect, onExitSelection, popover, selectionMode])

  const patchNode = (patchOrProducer: Partial<NodeData> | ((current: NodeData) => Partial<NodeData>)) => {
    void commitWith((document) => {
      const current = document.nodes.find((item) => item.id === node.id)
      if (!current) return []
      const patch = typeof patchOrProducer === 'function' ? patchOrProducer(current.data) : patchOrProducer
      return [{
        op: 'updateNode',
        nodeId: current.id,
        patch: {
          data: {
            ...current.data,
            ...patch,
            ...(patch.extra ? { extra: { ...current.data.extra, ...patch.extra } } : {}),
          },
        },
      }]
    }, '编辑音频节点')
  }

  const updateAuthoring = (
    producer: (current: AudioAuthoringState) => AudioAuthoringState,
    label = '编辑音频参数',
  ) => {
    void commitWith((document) => {
      const current = document.nodes.find((item) => item.id === node.id)
      if (!current) return []
      const currentModelId = current.data.modelId ?? modelId
      const next = normalizeAudioAuthoringForModel(
        currentModelId,
        producer(readAudioAuthoringState(current.data.extra, currentModelId)),
      )
      return [{
        op: 'updateNode',
        nodeId: current.id,
        patch: {
          data: {
            ...current.data,
            output: audioExecutionOutput(currentModelId, next),
            extra: { ...current.data.extra, audioAuthoring: next },
          },
        },
      }]
    }, label)
  }

  const updateSetting = <K extends keyof AudioSettings,>(key: K, value: AudioSettings[K]) => {
    updateAuthoring((current) => ({
      ...current,
      settings: { ...current.settings, [key]: value },
    }))
  }

  const selectModel = (nextModel: ModelDefinition) => {
    patchNode((current) => {
      const previous = readAudioAuthoringState(current.extra, current.modelId ?? modelId)
      const defaults = defaultAudioAuthoringState(nextModel.id)
      const next = normalizeAudioAuthoringForModel(nextModel.id, {
        ...defaults,
        favoriteVoiceIds: previous.favoriteVoiceIds,
        customVoices: previous.customVoices,
      })
      return {
        modelId: nextModel.id,
        output: audioExecutionOutput(nextModel.id, next),
        extra: { audioAuthoring: next },
      }
    })
    setPopover(null)
  }

  const syncPromptSelection = () => {
    const textarea = promptRef.current
    if (!textarea) return
    promptSelectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    }
  }

  const toggleTokenPopover = (nextPopover: Extract<OpenPopover, 'pause' | 'cues'>) => {
    // The pointer handler captured the native textarea range before focus can
    // move. Re-reading it here is too late in some browsers: a toolbar click
    // has already collapsed the range by the time the click handler runs.
    setPopover((current) => (current === nextPopover ? null : nextPopover))
  }

  const addPromptToken = (token: string) => {
    const { start: selectionStart, end: selectionEnd } = promptSelectionRef.current
    const next = insertAudioToken(prompt, selectionStart, selectionEnd, token)
    setPrompt(next.prompt)
    patchNode({ prompt: next.prompt })
    setPopover(null)
    setCustomPauseOpen(false)
    promptSelectionRef.current = { start: next.caret, end: next.caret }
    window.requestAnimationFrame(() => {
      promptRef.current?.focus()
      promptRef.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  const promptTokens = [...prompt.matchAll(/<#[^#<>]+#>|\([^()]+\)/g)].map((match, index) => ({
    id: `${match.index ?? index}-${match[0]}`,
    value: match[0],
  }))

  return (
    <div
      data-testid="audio-node-editor"
      data-zoom-compensation={(1 / Math.max(zoom, 0.01)).toFixed(5)}
      className="node-floating-ui nodrag nowheel nopan absolute bottom-14 left-1/2 z-30 w-[660px] -translate-x-1/2 translate-y-full origin-top"
      style={{ transform: `scale(${1 / Math.max(zoom, 0.01)})` }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <section className="relative flex min-h-[236px] w-full flex-col overflow-visible rounded-2xl border border-white/10 bg-[#242424] shadow-[0_14px_45px_rgba(0,0,0,0.42)]">
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-pressed={selectionMode === 'reference'}
              onClick={() => onStartSelection('reference', node.id)}
              className={cn(
                'flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-ink-600 hover:bg-white/8 hover:text-ink-800',
                selectionMode === 'reference' && 'bg-[#1769e8]/24 text-[#8db8ff]',
              )}
            >
              <IconLink size={14} />参考
            </button>
            <button
              type="button"
              aria-label="关闭音频编辑器"
              onClick={() => inspect(null)}
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 hover:bg-white/8 hover:text-ink-800"
            >
              <IconClose size={15} />
            </button>
          </div>

          {capabilities?.family === 'tts-minimax' && (
            <div className="flex items-center gap-1.5 px-0.5">
              <button
                type="button"
                aria-expanded={popover === 'pause'}
                aria-controls="audio-pause-menu"
                onPointerDown={(event) => {
                  // Do not blur the prompt before React records its caret.
                  event.preventDefault()
                  event.stopPropagation()
                  syncPromptSelection()
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleTokenPopover('pause')
                }}
                className="h-7 rounded-lg bg-white/[0.055] px-2.5 text-[11px] text-ink-700 hover:bg-white/10"
              >
                {'<#> 停顿'}
              </button>
              <button
                type="button"
                aria-expanded={popover === 'cues'}
                aria-controls="audio-cue-menu"
                onPointerDown={(event) => {
                  // Preserve the selected prompt range while opening the menu.
                  event.preventDefault()
                  event.stopPropagation()
                  syncPromptSelection()
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleTokenPopover('cues')
                }}
                className="h-7 rounded-lg bg-white/[0.055] px-2.5 text-[11px] text-ink-700 hover:bg-white/10"
              >
                {'() 语气词'}
              </button>
            </div>
          )}

          {capabilities?.family === 'music-mureka' && (
            <div className="flex w-fit rounded-lg bg-black/18 p-0.5" role="group" aria-label="音乐生成方式">
              {([
                ['description', '描述生音乐'],
                ['lyrics', '歌词生音乐'],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={authoring.settings.murekaMode === mode}
                  onClick={() => updateSetting('murekaMode', mode)}
                  className={cn(
                    'h-7 rounded-md px-3 text-[11px] transition-colors',
                    authoring.settings.murekaMode === mode
                      ? 'bg-white/12 text-ink-900 shadow-sm'
                      : 'text-ink-400 hover:text-ink-700',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {promptTokens.length > 0 && (
            <div className="flex flex-wrap gap-1 px-1" aria-label="已插入的语音标记">
              {promptTokens.map((token) => (
                <span
                  key={token.id}
                  data-testid="audio-token-chip"
                  className="rounded-md border border-[#4bbdc8]/25 bg-[#1e8a96]/16 px-1.5 py-0.5 text-[10px] text-[#69d4df]"
                >
                  {token.value}
                </span>
              ))}
            </div>
          )}

          {references.length > 0 && (
            <div
              data-testid="audio-reference-strip"
              className="flex min-h-11 items-center gap-1.5 overflow-x-auto px-0.5 pb-0.5"
            >
              {references.map(({ node: reference }, index) => {
                const label = canvasReferenceLabel(reference, index)
                const artifact = reference.data.artifacts?.[0]
                return (
                  <div
                    key={reference.id}
                    data-testid={`audio-reference-card-${reference.id}`}
                    className="group/reference relative flex h-11 min-w-[112px] items-center gap-2 overflow-hidden rounded-lg border border-white/12 bg-white/[0.055] px-2 pr-7"
                  >
                    <button
                      type="button"
                      aria-label={`在提示词中引用 ${label}`}
                      title={`引用 ${reference.name}`}
                      onClick={() => addPromptToken(`@${label} `)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/20 text-ink-500">
                        {artifact?.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={artifact.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                        ) : reference.type === 'text' ? (
                          <IconText size={13} />
                        ) : (
                          <IconAudio size={13} />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[10px] font-medium text-ink-700">{label}</span>
                        <span className="block max-w-[64px] truncate text-[9px] text-ink-400">{reference.name}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`定位参考 ${reference.name}`}
                      onClick={() => onLocateReference(reference.id)}
                      className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded bg-black/55 text-[9px] text-white opacity-0 group-hover/reference:opacity-100 focus-visible:opacity-100"
                    >
                      ↗
                    </button>
                    <button
                      type="button"
                      aria-label={`移除参考 ${reference.name}`}
                      onClick={() => onRemoveReference(node.id, reference.id)}
                      className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded bg-black/55 text-[11px] text-white opacity-0 hover:bg-[#b62d3a] group-hover/reference:opacity-100 focus-visible:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <textarea
            ref={promptRef}
            data-testid="audio-prompt"
            value={prompt}
            maxLength={maxCharacters}
            rows={6}
            placeholder={
              capabilities?.family === 'multimodal'
                ? '描述你想要的音频效果，可用 @ 引用音频'
                : capabilities?.family === 'music-mureka' && authoring.settings.murekaMode === 'lyrics'
                  ? '输入歌词'
                  : capabilities?.family?.startsWith('music-')
                    ? '描述想要的音乐风格、情绪与结构'
                    : '输入要合成的文本'
            }
            onChange={(event) => {
              setPrompt(event.target.value)
              promptSelectionRef.current = {
                start: event.currentTarget.selectionStart,
                end: event.currentTarget.selectionEnd,
              }
            }}
            onSelect={(event) => {
              promptSelectionRef.current = {
                start: event.currentTarget.selectionStart,
                end: event.currentTarget.selectionEnd,
              }
            }}
            onBlur={() => {
              const textarea = promptRef.current
              if (textarea) {
                promptSelectionRef.current = {
                  start: textarea.selectionStart,
                  end: textarea.selectionEnd,
                }
              }
              if (prompt !== (node.data.prompt ?? '')) patchNode({ prompt })
            }}
            className="min-h-[118px] w-full resize-none rounded-xl border border-transparent bg-transparent px-2 py-1.5 text-[13px] leading-relaxed text-ink-800 outline-none placeholder:text-ink-400 focus:border-white/10 focus:bg-black/10"
          />

          <div className="flex h-8 w-full items-center gap-1 border-t border-white/[0.06] pt-2">
            <button
              type="button"
              data-testid="audio-model-selector"
              aria-haspopup="dialog"
              aria-expanded={popover === 'models'}
              onClick={() => setPopover(popover === 'models' ? null : 'models')}
              className="flex h-8 min-w-[158px] max-w-[224px] items-center gap-1.5 rounded-lg px-2 text-[12px] text-ink-800 hover:bg-white/8"
            >
              <AudioModelMark iconKey={model?.iconKey} />
              <span className="truncate font-medium">{model?.label ?? '选择模型'}</span>
              <span className="text-[10px] text-ink-400">⌄</span>
            </button>
            <span className="h-5 w-px bg-white/8" />
            {capabilities?.family === 'multimodal' ? (
              <button
                type="button"
                data-testid="audio-output-selector"
                aria-haspopup="dialog"
                aria-expanded={popover === 'output'}
                onClick={() => setPopover(popover === 'output' ? null : 'output')}
                className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-lg px-2 text-[12px] text-ink-700 hover:bg-white/8"
              >
                <span className="truncate tabular-nums">{outputSummary(authoring)}</span>
                <span className="shrink-0 text-[10px] text-ink-400">⌄</span>
              </button>
            ) : capabilities?.supportsVoice ? (
              <button
                type="button"
                data-testid="audio-voice-selector"
                aria-haspopup="dialog"
                aria-expanded={popover === 'voices'}
                onClick={() => setPopover(popover === 'voices' ? null : 'voices')}
                className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 text-[12px] text-ink-700 hover:bg-white/8"
              >
                <IconAudio size={14} />
                <span className="truncate">{voiceLabel(authoring.settings.voiceId, authoring)}</span>
                <span className="shrink-0 text-[10px] text-ink-400">⌄</span>
              </button>
            ) : (
              <span className="flex-1" />
            )}
            <button
              type="button"
              aria-label="高级设置"
              aria-expanded={popover === 'advanced'}
              onClick={() => setPopover(popover === 'advanced' ? null : 'advanced')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-white/8 hover:text-ink-800"
            >
              <IconFilter size={15} />
            </button>
            <span className="text-[11px] tabular-nums text-ink-400">{prompt.length}/{maxCharacters}</span>
            <span className="ml-1 flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-ink-500">
              <IconCredit size={12} />{cost}
            </span>
            {running ? (
              <button type="button" aria-label="取消生成" onClick={() => job && onCancel(job.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-ink-800">
                <IconStop size={13} />
              </button>
            ) : (
              <button
                type="button"
                data-testid="audio-run"
                aria-label="生成音频"
                disabled={!prompt.trim()}
                onClick={() => onRun(node.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d9dadb] text-[#1f1f1f] enabled:hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
              >
                <IconPlay size={13} />
              </button>
            )}
          </div>

          {running && (
            <div className="flex items-center gap-2 px-1 text-[11px] text-ink-500">
              <Spinner size={12} /><span>生成中 {job?.progress ?? 0}%</span><div className="flex-1"><ProgressBar value={job?.progress ?? 0} /></div>
            </div>
          )}
        </div>

        {popover === 'models' && (
          <AudioModelCatalog
            selectedId={modelId}
            onSelect={selectModel}
            onClose={() => setPopover(null)}
            className="absolute bottom-12 left-2 z-50 h-[430px] w-[410px]"
          />
        )}
        {popover === 'pause' && capabilities?.supportsPauseTokens && (
          <div
            data-testid="audio-pause-menu"
            role="dialog"
            aria-label="停顿时长"
            className="absolute bottom-12 left-2 z-50 w-[210px] rounded-xl border border-white/10 bg-[#292929] p-1.5 shadow-[0_14px_38px_rgba(0,0,0,.5)]"
          >
            {PAUSE_PRESETS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                onPointerDown={(event) => {
                  // Keep the prompt focused until addPromptToken commits the
                  // replacement. Otherwise its blur handler can enqueue the
                  // pre-token prompt after this action and overwrite it.
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={() => addPromptToken(`<#${seconds}#>`)}
                className="block h-8 w-full rounded-lg px-2 text-left text-[11px] text-ink-700 hover:bg-white/8"
              >
                {seconds === 1 ? '1.0s' : `${seconds}s`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustomPauseOpen(true)}
              className="block h-8 w-full rounded-lg px-2 text-left text-[11px] text-ink-700 hover:bg-white/8"
            >
              自定义
            </button>
            {customPauseOpen && (
              <div className="mt-1 flex gap-1.5 border-t border-white/8 pt-2">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="秒数"
                  value={customPause}
                  onChange={(event) => setCustomPause(event.target.value)}
                  placeholder="0.01–10"
                  className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/18 px-2 text-[11px] text-ink-800 outline-none focus:border-white/25"
                />
                <button
                  type="button"
                  disabled={!(Number(customPause) > 0 && Number(customPause) <= 10)}
                  onClick={() => addPromptToken(`<#${Number(customPause)}#>`)}
                  className="h-8 rounded-lg bg-white/10 px-2 text-[10px] text-ink-800 enabled:hover:bg-white/16 disabled:opacity-35"
                >
                  插入停顿
                </button>
              </div>
            )}
          </div>
        )}
        {popover === 'cues' && capabilities?.supportsCueTokens && (
          <div
            data-testid="audio-cue-menu"
            role="dialog"
            aria-label="语气词预设"
            className="absolute bottom-12 left-[92px] z-50 grid w-[360px] grid-cols-3 gap-1 rounded-xl border border-white/10 bg-[#292929] p-2 shadow-[0_14px_38px_rgba(0,0,0,.5)]"
          >
            {PARALINGUISTIC_CUES.map((cue) => (
              <button
                key={cue}
                type="button"
                onPointerDown={(event) => {
                  // See pause presets above: token insertion is one atomic
                  // prompt edit, not a blur-save followed by a second edit.
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={() => addPromptToken(`(${cue})`)}
                className="h-8 rounded-lg px-2 text-left text-[11px] text-ink-700 hover:bg-white/8"
              >
                {cue}
              </button>
            ))}
          </div>
        )}
        {popover === 'output' && capabilities?.family === 'multimodal' && (
          <SeedAudioOutputPopover state={authoring} onChange={updateSetting} />
        )}
        {popover === 'advanced' && (
          <AudioAdvancedPanel
            family={capabilities?.family ?? 'multimodal'}
            state={authoring}
            onSetting={updateSetting}
            onReset={() => {
              const defaults = defaultAudioAuthoringState(modelId)
              updateAuthoring((current) => ({
                ...defaults,
                favoriteVoiceIds: current.favoriteVoiceIds,
                customVoices: current.customVoices,
                advancedOpen: true,
              }), '重置音频参数')
            }}
          />
        )}
        {popover === 'voices' && (
          <VoiceLibraryDialog
            state={authoring}
            selectedVoiceId={authoring.settings.voiceId}
            onChange={(producer) => updateAuthoring(producer, '编辑音色库')}
            onClose={() => setPopover(null)}
          />
        )}
      </section>
    </div>
  )
}

function SeedAudioOutputPopover({
  state,
  onChange,
}: {
  state: AudioAuthoringState
  onChange: <K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) => void
}) {
  return (
    <div
      data-testid="audio-output-popover"
      role="dialog"
      aria-label="音频输出参数"
      className="absolute bottom-12 left-[170px] z-40 w-[350px] space-y-3 rounded-2xl border border-white/10 bg-[#292929] p-3 text-[12px] text-ink-600 shadow-[0_18px_55px_rgba(0,0,0,0.55)]"
    >
      <AudioOptionGroup label="语种">
        {(['zh', 'en'] as const).map((language) => (
          <AudioOption
            key={language}
            dataAttribute="language"
            label={LANGUAGE_LABELS[language]}
            active={state.settings.language === language}
            onClick={() => onChange('language', language)}
          />
        ))}
      </AudioOptionGroup>
      <AudioOptionGroup label="采样率">
        {AUDIO_SAMPLE_RATES.map((rate) => (
          <AudioOption
            key={rate}
            dataAttribute="sample-rate"
            label={rate}
            active={state.settings.sampleRate === rate}
            onClick={() => onChange('sampleRate', rate)}
          />
        ))}
      </AudioOptionGroup>
      <AudioOptionGroup label="输出格式">
        {AUDIO_FORMATS.map((format) => (
          <AudioOption
            key={format}
            dataAttribute="format"
            label={format}
            active={state.settings.format === format}
            onClick={() => onChange('format', format)}
          />
        ))}
      </AudioOptionGroup>
    </div>
  )
}

function AudioOptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium text-ink-400">{label}</div>
      <div className="grid grid-cols-4 gap-1.5">{children}</div>
    </div>
  )
}

function AudioOption({
  label,
  active,
  dataAttribute,
  onClick,
}: {
  label: string
  active: boolean
  dataAttribute: 'language' | 'sample-rate' | 'format'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      {...{ [`data-audio-${dataAttribute}`]: label }}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-9 rounded-xl border text-[11px] transition-colors',
        active
          ? 'border-white/45 bg-white/9 text-ink-900'
          : 'border-white/8 text-ink-500 hover:bg-white/6 hover:text-ink-800',
      )}
    >
      {label}
    </button>
  )
}

function AudioAdvancedPanel({
  family,
  state,
  onSetting,
  onReset,
}: {
  family: NonNullable<ReturnType<typeof audioModelOutputOptions>>['family']
  state: AudioAuthoringState
  onSetting: <K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) => void
  onReset: () => void
}) {
  return (
    <div
      data-testid="audio-advanced-settings"
      className="absolute inset-x-0 bottom-12 z-30 max-h-[520px] overflow-y-auto rounded-2xl border border-white/10 bg-[#242424] px-4 py-3 text-[12px] text-ink-500 shadow-[0_14px_40px_rgba(0,0,0,0.48)]"
    >
      {family === 'tts-minimax' && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium text-ink-700">基础调节</span>
            <button type="button" onClick={onReset} className="rounded-lg px-2 py-1 text-[11px] text-ink-500 hover:bg-white/8 hover:text-ink-800">一键重置</button>
          </div>
          <div className="space-y-2.5">
            <AudioRange label="语速" inputLabel="语速数值" value={state.settings.speed} min={0.5} max={2} step={0.01} digits={2} onChange={(value) => onSetting('speed', value)} />
            <AudioRange label="声调" inputLabel="声调数值" value={state.settings.pitch} min={-12} max={12} step={1} digits={0} onChange={(value) => onSetting('pitch', value)} />
            <AudioRange label="音量" inputLabel="音量数值" value={state.settings.volume} min={0} max={2} step={0.1} digits={1} onChange={(value) => onSetting('volume', value)} />
          </div>
          <div className="my-3 h-px bg-white/[0.07]" />
          <div className="mb-2 font-medium text-ink-700">音色效果调节</div>
          <div className="space-y-2.5">
            <AudioRange label="音高" inputLabel="音高数值" value={state.settings.effectPitch} min={-100} max={100} step={1} digits={0} onChange={(value) => onSetting('effectPitch', value)} />
            <AudioRange label="强度" inputLabel="强度数值" value={state.settings.effectStrength} min={-100} max={100} step={1} digits={0} onChange={(value) => onSetting('effectStrength', value)} />
            <AudioRange label="音色调节" inputLabel="音色调节数值" value={state.settings.timbre} min={-100} max={100} step={1} digits={0} onChange={(value) => onSetting('timbre', value)} />
          </div>
          <fieldset className="mt-3">
            <legend className="mb-1.5 text-[11px] text-ink-400">音效</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {(Object.entries(SOUND_EFFECT_LABELS) as Array<[AudioSettings['soundEffect'], string]>).map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 text-[11px] text-ink-600">
                  <input type="radio" name="audio-sound-effect" checked={state.settings.soundEffect === value} onChange={() => onSetting('soundEffect', value)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      {family === 'tts-eleven' && (
        <fieldset>
          <legend className="mb-2 font-medium text-ink-700">稳定性</legend>
          <div className="flex gap-5">
            {(Object.entries(STABILITY_LABELS) as Array<[AudioSettings['stability'], string]>).map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 text-[11px] text-ink-600">
                <input type="radio" name="audio-stability" checked={state.settings.stability === value} onChange={() => onSetting('stability', value)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {family === 'music-eleven' && (
        <div className="space-y-2">
          <div className="font-medium text-ink-700">音乐时长</div>
          <div className="flex gap-2">
            {AUDIO_MUSIC_DURATIONS.map((duration) => (
              <button
                key={duration}
                type="button"
                aria-pressed={state.settings.musicDurationSeconds === duration}
                onClick={() => onSetting('musicDurationSeconds', duration)}
                className={cn('h-8 rounded-lg border px-4 text-[11px]', state.settings.musicDurationSeconds === duration ? 'border-white/40 bg-white/9 text-ink-900' : 'border-white/8 text-ink-500')}
              >
                {duration}秒
              </button>
            ))}
          </div>
        </div>
      )}

      {family === 'music-mureka' && state.settings.murekaMode === 'description' && (
        <Toggle checked={state.settings.instrumental} onChange={(value) => onSetting('instrumental', value)} label="纯乐器" />
      )}

      {family === 'multimodal' && (
        <div className="text-[11px] leading-relaxed text-ink-400">输出语种、采样率和格式请在底栏参数中设置。</div>
      )}
    </div>
  )
}

function AudioRange({
  label,
  inputLabel,
  value,
  min,
  max,
  step,
  digits,
  onChange,
}: {
  label: string
  inputLabel: string
  value: number
  min: number
  max: number
  step: number
  digits: number
  onChange: (value: number) => void
}) {
  return (
    <label className="grid grid-cols-[70px_1fr_54px] items-center gap-2">
      <span className="text-[11px] text-ink-500">{label}</span>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-1 w-full cursor-pointer accent-[var(--color-accent)]" />
      <input
        key={`${inputLabel}-${value}`}
        type="text"
        role="textbox"
        inputMode="decimal"
        aria-label={inputLabel}
        defaultValue={value.toFixed(digits)}
        onBlur={(event) => {
          const parsed = Number(event.target.value)
          onChange(Number.isFinite(parsed) ? parsed : value)
        }}
        className="h-7 rounded-lg border border-white/8 bg-black/18 px-2 text-right text-[11px] tabular-nums text-ink-700 outline-none focus:border-white/25"
      />
    </label>
  )
}
