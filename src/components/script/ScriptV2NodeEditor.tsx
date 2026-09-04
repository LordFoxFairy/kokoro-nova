'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '@xyflow/react'
import { MODELS_BY_ID, type ModelDefinition } from '@/domain/models'
import {
  appendScriptV2Row,
  readScriptV2State,
  scriptV2BatchBlockedReason,
  scriptV2StateToCsv,
  type ScriptV2State,
} from '@/domain/script-v2'
import type { WorkflowNode } from '@/domain/types'
import { cn } from '@/lib/cn'
import {
  IconCharacter,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconCredit,
  IconDownload,
  IconImage,
  IconRefresh,
  IconScript,
  IconText,
  IconVideo,
} from '../icons'
import { Spinner, Toggle } from '../ui/controls'
import { useScriptV2Runs } from './useScriptV2Runs'

const SCRIPT_MODEL_IDS = ['gvlm-3.1', 'cvlm-5.5', 'gvlm-3.1-flash'] as const
const GENERATOR_PLACEHOLDER = '描述剧情片段、故事，为你生成分镜脚本'

export interface ScriptV2NodeEditorProps {
  node: WorkflowNode
  open: boolean
  onOpenGenerator: (entry: 'screenplay' | 'character') => void
  onCloseGenerator: () => void
  onOpenWorkspace: () => void
  onStateChange: (state: ScriptV2State, label?: string) => void | Promise<void>
  onMaterializeBatch: (kind: 'image' | 'video') => void | Promise<void>
}

/** Script V2 canvas card and its zoom-compensated, attached generator. */
export function ScriptV2NodeEditor({
  node,
  open,
  onOpenGenerator,
  onCloseGenerator,
  onOpenWorkspace,
  onStateChange,
  onMaterializeBatch,
}: ScriptV2NodeEditorProps) {
  const state = readScriptV2State(node.data.extra, node.id)
  const zoom = useStore((store) => store.transform[2])
  const [prompt, setPrompt] = useState(state.generator.prompt)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [characterName, setCharacterName] = useState('')
  const [characterDescription, setCharacterDescription] = useState('')
  const [characterPremise, setCharacterPremise] = useState('')
  const models = useMemo(
    () => SCRIPT_MODEL_IDS.flatMap((id) => {
      const model = MODELS_BY_ID.get(id)
      return model ? [model] : []
    }),
    [],
  )
  const activeModel = MODELS_BY_ID.get(state.generator.modelId) ?? models[0]
  const runs = useScriptV2Runs({
    nodeId: node.id,
    state,
    onStateChange: (next) => onStateChange(next, '生成分镜脚本'),
  })

  useEffect(() => setPrompt(state.generator.prompt), [node.id, state.generator.prompt])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (modelsOpen) {
        setModelsOpen(false)
        return
      }
      onCloseGenerator()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [modelsOpen, onCloseGenerator, open])

  const beginGenerator = (entry: 'screenplay' | 'character') => {
    void onStateChange(
      { ...state, entry },
      entry === 'character' ? '角色生成分镜脚本' : '剧本生成分镜脚本',
    )
    onOpenGenerator(entry)
  }

  const beginManual = () => {
    const next = appendScriptV2Row(
      { ...state, entry: 'manual', activeStage: 'shots' },
      { durationSeconds: 5, shotSize: '中景' },
    )
    void onStateChange(next, '自己编写分镜脚本')
    onOpenWorkspace()
  }

  const persistGenerator = async (patch: Partial<ScriptV2State['generator']>, label: string) => {
    await onStateChange(
      { ...state, generator: { ...state.generator, ...patch } },
      label,
    )
  }

  const selectModel = (model: ModelDefinition) => {
    setModelsOpen(false)
    void persistGenerator({ modelId: model.id }, '选择脚本模型')
  }

  const submit = async () => {
    const storyText = prompt.trim()
    if (!storyText || runs.isRunning) return
    const generator = {
      ...state.generator,
      prompt: storyText,
      status: 'generating' as const,
      error: null,
    }
    try {
      await runs.generateScript({
        storyText,
        entry: state.entry === 'character' ? 'character' : 'screenplay',
        modelId: generator.modelId,
        ...(state.entry === 'character'
          ? {
              character: {
                name: characterName.trim(),
                description: characterDescription.trim(),
                premise: characterPremise.trim(),
              },
            }
          : {}),
      })
      setRegenerating(false)
      onCloseGenerator()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      await onStateChange(
        {
          ...state,
          generator: {
            ...generator,
            status: 'failed',
            error: error instanceof Error ? error.message : '脚本生成失败',
          },
        },
        '脚本生成失败',
      )
    }
  }

  const regenerate = () => {
    setPrompt(state.generator.prompt || state.originalStoryText)
    setRegenerating(true)
    onOpenGenerator(state.entry === 'character' ? 'character' : 'screenplay')
  }

  const downloadCsv = () => {
    const blob = new Blob([scriptV2StateToCsv(state)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `script-v2-${node.id}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const imageBlockedReason = scriptV2BatchBlockedReason(state, 'image')
  const videoBlockedReason = scriptV2BatchBlockedReason(state, 'video')

  const card = state.rows.length === 0 ? (
    <div data-testid="script-v2-entry-list" className="flex flex-1 flex-col justify-center gap-1.5">
      <EntryButton icon={<IconScript size={14} />} onClick={() => beginGenerator('screenplay')}>
        剧本生成分镜脚本
      </EntryButton>
      <EntryButton icon={<IconCharacter size={14} />} onClick={() => beginGenerator('character')}>
        角色生成分镜脚本
      </EntryButton>
      <EntryButton icon={<IconText size={14} />} onClick={beginManual}>
        自己编写分镜脚本
      </EntryButton>
    </div>
  ) : (
    <div data-testid="script-v2-resource-card" className="flex flex-1 flex-col gap-2.5">
      <div className="rounded-xl border border-ink-100 bg-ink-50/70 p-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
            <IconCheck size={12} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium text-ink-800">确认镜头</div>
            <div className="text-[10px] text-ink-400">已完成 · {state.rows.length} 个镜头</div>
          </div>
        </div>
        {['准备资产', '合成提示词'].map((label, index) => (
          <div key={label} className="mt-1.5 flex items-center gap-2.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-200 text-[10px] font-medium text-ink-500">
              {index + 2}
            </span>
            <span className="text-[11px] text-ink-500">{label}</span>
          </div>
        ))}
      </div>
      <div data-testid="script-v2-resource-toolbar" className="grid grid-cols-2 gap-1.5">
        <ResourceAction icon={<IconRefresh size={12} />} onClick={regenerate}>
          重新生成
        </ResourceAction>
        <ResourceAction
          icon={<IconImage size={12} />}
          disabledReason={imageBlockedReason}
          onClick={() => void onMaterializeBatch('image')}
        >
          批量生成分镜
        </ResourceAction>
        <ResourceAction
          icon={<IconVideo size={12} />}
          disabledReason={videoBlockedReason}
          onClick={() => void onMaterializeBatch('video')}
        >
          批量生视频
        </ResourceAction>
        <ResourceAction icon={<IconDownload size={12} />} onClick={downloadCsv}>
          下载
        </ResourceAction>
      </div>
      <button
        type="button"
        data-testid="script-v2-open-workspace"
        onClick={onOpenWorkspace}
        className="mt-auto flex items-center justify-between rounded-lg px-1 py-1 text-left text-[12px] font-medium text-ink-700 hover:text-ink-900"
      >
        <span>打开脚本节点 →</span>
      </button>
    </div>
  )

  return (
    <>
      {card}
      {open && state.entry !== null && (state.rows.length === 0 || regenerating) && (
        <div
          data-testid="script-v2-generator"
          data-zoom-compensation={(1 / Math.max(zoom, 0.01)).toFixed(5)}
          className="node-floating-ui nodrag nowheel nopan absolute -bottom-3 left-1/2 z-30 w-[660px] -translate-x-1/2 translate-y-full origin-top"
          style={{ transform: `scale(${1 / Math.max(zoom, 0.01)})` }}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <section className="relative flex min-h-[294px] w-full flex-col overflow-visible rounded-2xl border border-white/10 bg-[#242424] shadow-[0_14px_45px_rgba(0,0,0,0.45)]">
            <header className="flex items-center gap-2 px-3 pt-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/7 text-white/65">
                {state.entry === 'character' ? <IconCharacter size={14} /> : <IconScript size={14} />}
              </span>
              <div>
                <div className="text-[12px] font-medium text-white/90">
                  {state.entry === 'character' ? '角色生成分镜脚本' : '剧本生成分镜脚本'}
                </div>
                <div className="text-[10px] text-white/35">AI 分析故事并拆解连续镜头</div>
              </div>
              <button
                type="button"
                aria-label="关闭脚本生成器"
                onClick={onCloseGenerator}
                className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/8 hover:text-white/80"
              >
                <IconClose size={15} />
              </button>
            </header>

            {state.entry === 'character' && (
              <div data-testid="script-v2-character-section" className="grid grid-cols-[150px_1fr] gap-2 px-3 pt-3">
                <GeneratorInput value={characterName} onChange={setCharacterName} placeholder="角色名称" />
                <GeneratorInput value={characterDescription} onChange={setCharacterDescription} placeholder="角色描述" />
                <div className="col-span-2">
                  <GeneratorInput value={characterPremise} onChange={setCharacterPremise} placeholder="角色前提（选填）" />
                </div>
              </div>
            )}

            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={GENERATOR_PLACEHOLDER}
              rows={state.entry === 'character' ? 4 : 7}
              className="mx-3 mt-3 min-h-[112px] flex-1 resize-none rounded-xl border border-white/8 bg-white/[0.045] px-3 py-2.5 text-[13px] leading-relaxed text-white/88 outline-none placeholder:text-white/28 focus:border-white/18"
            />

            {state.generator.error && (
              <div className="mx-3 mt-2 rounded-lg bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300">
                {state.generator.error}
              </div>
            )}

            <footer className="relative flex items-center gap-2 px-3 py-3">
              <button
                type="button"
                aria-expanded={modelsOpen}
                onClick={() => setModelsOpen((value) => !value)}
                className="flex h-9 min-w-[154px] items-center gap-2 rounded-xl bg-white/[0.065] px-3 text-left text-[11px] text-white/75 hover:bg-white/[0.09]"
              >
                <span className="flex-1">
                  <span className="block font-medium text-white/85">{activeModel?.label ?? 'GVLM 3.1'}</span>
                  <span className="block text-[9px] text-white/32">{activeModel?.latencyLabel ?? '20s'}</span>
                </span>
                <IconChevronDown size={13} />
              </button>

              {modelsOpen && (
                <div
                  role="listbox"
                  aria-label="脚本模型"
                  data-testid="script-v2-model-catalog"
                  className="absolute bottom-[52px] left-3 z-40 w-[280px] overflow-hidden rounded-xl border border-white/10 bg-[#303030] p-1.5 shadow-[0_18px_46px_rgba(0,0,0,0.5)]"
                >
                  {models.map((model) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={model.id === state.generator.modelId}
                      key={model.id}
                      onClick={() => selectModel(model)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/7',
                        model.id === state.generator.modelId && 'bg-white/7',
                      )}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#6f76ff] to-[#a34cff] text-[10px] font-semibold text-white">
                        AI
                      </span>
                      <span className="min-w-0 flex-1">
                        <span data-testid="script-v2-model-name" className="block text-[12px] font-medium text-white/88">
                          {model.label}
                        </span>
                        <span className="block truncate text-[9px] text-white/35">{model.description}</span>
                      </span>
                      <span data-testid="script-v2-model-latency" className="text-[10px] tabular-nums text-white/38">
                        {model.latencyLabel}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="min-w-[128px] rounded-xl px-2">
                <Toggle
                  checked={state.generator.translating}
                  onChange={(translating) => void persistGenerator({ translating }, '切换脚本翻译')}
                  label="翻译成英文"
                />
              </div>

              <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-white/42">
                <IconCredit size={13} />
                <span data-testid="script-v2-quote">6</span>
              </span>
              <button
                type="button"
                disabled={!prompt.trim() || runs.isRunning}
                onClick={() => void submit()}
                className="flex h-9 min-w-[118px] items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-[12px] font-medium text-[#202020] transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
              >
                {runs.isRunning && <Spinner size={13} />}
                {runs.isRunning ? `${runs.activeRun?.progress ?? 0}%` : '生成分镜脚本'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}

function ResourceAction({
  icon,
  children,
  onClick,
  disabledReason = null,
}: {
  icon: ReactNode
  children: ReactNode
  onClick: () => void
  disabledReason?: string | null
}) {
  return (
    <button
      type="button"
      disabled={Boolean(disabledReason)}
      title={disabledReason ?? undefined}
      onClick={onClick}
      className="flex h-7 items-center justify-center gap-1 rounded-lg border border-ink-100 bg-surface px-2 text-[10px] font-medium text-ink-600 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-35"
    >
      {icon}
      {children}
    </button>
  )
}

function GeneratorInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-9 w-full rounded-lg border border-white/9 bg-white/[0.055] px-3 text-[12px] text-white/85 outline-none placeholder:text-white/28 focus:border-white/20"
    />
  )
}

function EntryButton({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="nodrag nowheel nopan flex h-12 items-center gap-2.5 rounded-xl border border-transparent bg-ink-50 px-3 text-left text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-200 hover:bg-ink-100"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface text-ink-500 shadow-sm">
        {icon}
      </span>
      <span className="flex-1">{children}</span>
      <IconChevronRight size={13} className="text-ink-300" />
    </button>
  )
}
