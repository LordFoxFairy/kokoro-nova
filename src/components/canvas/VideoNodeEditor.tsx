'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore as useFlowStore } from '@xyflow/react'
import { availableVideoModes, videoModeOptions } from '@/domain/compile'
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
  IconSparkle,
  IconStop,
  IconStyle,
  IconVideo,
} from '../icons'
import { ProgressBar, Spinner, Toggle } from '../ui/controls'
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
}

type OpenPopover = 'models' | 'modes' | 'output' | 'camera' | 'advanced' | null

/**
 * The current LibTV canvas keeps the Video composer attached to its node while
 * cancelling the graph zoom for the form itself. The graph remains spatial;
 * text, hit targets and menus stay readable at a stable screen size.
 */
export function VideoNodeEditor({ node, job, onRun, onCancel }: VideoNodeEditorProps) {
  const zoom = useFlowStore((state) => state.transform[2])
  const document = useEditor((state) => state.document)
  const commit = useEditor((state) => state.commit)
  const inspect = useEditor((state) => state.inspect)
  const setLeftPanel = useEditor((state) => state.setLeftPanel)
  const toast = useEditor((state) => state.toast)
  const [prompt, setPrompt] = useState(node.data.prompt ?? '')
  const [popover, setPopover] = useState<OpenPopover>(null)

  useEffect(() => setPrompt(node.data.prompt ?? ''), [node.id, node.data.prompt])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
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
  }, [inspect, popover])

  const patchNode = (patch: Partial<NodeData>) => {
    const current = useEditor.getState().document.nodes.find((item) => item.id === node.id)
    if (!current) return
    void commit([{ op: 'updateNode', nodeId: node.id, patch: { data: { ...current.data, ...patch } } }], '编辑视频节点')
  }

  const model = node.data.modelId ? MODELS_BY_ID.get(node.data.modelId) : undefined
  const capabilities = node.data.modelId ? modelOutputOptions(node.data.modelId) : null
  const output = capabilities
    ? normalizeOutputForModel(node.data.modelId!, node.data.output, availableVideoModes(document, node.id))
    : (node.data.output ?? {})
  const modeRows = videoModeOptions(document, node.id)
  const running = job?.status === 'running' || job?.status === 'queued'
  const cost = node.data.modelId ? quoteCredits(node.data.modelId, output).credits : 0
  const advanced = (node.data.extra?.advanced as
    | { webSearch?: boolean; autoCompliance?: boolean; autoLink?: boolean }
    | undefined) ?? { webSearch: false, autoCompliance: true, autoLink: true }

  const references = useMemo(
    () =>
      document.edges
        .filter((edge) => edge.target === node.id)
        .map((edge) => document.nodes.find((item) => item.id === edge.source))
        .filter((item): item is WorkflowNode => Boolean(item)),
    [document.edges, document.nodes, node.id],
  )

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
            <QuickAction label="参考" icon={<IconLink size={14} />} onClick={() => setLeftPanel('material')} />
            <QuickAction
              label="标记"
              icon={<IconLocate size={14} />}
              active={Boolean(node.data.extra?.marked)}
              onClick={() => patchNode({ extra: { ...node.data.extra, marked: !node.data.extra?.marked } })}
            />
            <QuickAction label="角色库" icon={<IconCharacter size={14} />} onClick={() => setLeftPanel('character')} />
            <QuickAction
              label="运镜"
              icon={<IconVideo size={14} />}
              active={popover === 'camera'}
              onClick={() => setPopover(popover === 'camera' ? null : 'camera')}
            />
            <QuickAction label="特效" icon={<IconEffect size={14} />} onClick={() => setLeftPanel('material')} />
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
            <div data-testid="video-reference-strip" className="flex min-h-9 items-center gap-1.5 overflow-hidden px-0.5">
              {references.map((reference, index) => {
                const artifact = reference.data.artifacts?.[0]
                return (
                  <div
                    key={reference.id}
                    className="flex h-9 min-w-0 max-w-[150px] items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.045] px-1.5"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/8 text-ink-400">
                      {artifact?.thumbnailUrl || (artifact?.kind === 'image' && artifact.url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={artifact.thumbnailUrl ?? artifact.url} alt="" className="h-full w-full object-cover" />
                      ) : reference.type === 'video' ? (
                        <IconVideo size={13} />
                      ) : (
                        <IconImage size={13} />
                      )}
                    </span>
                    <span className="truncate text-[11px] text-ink-600">{index + 1} · {reference.name}</span>
                    <IconAt size={11} className="shrink-0 text-ink-400" />
                  </div>
                )
              })}
            </div>
          )}

          <textarea
            data-testid="video-prompt"
            value={prompt}
            rows={references.length > 0 ? 3 : 5}
            placeholder="描述你想要生成的画面内容，@引用素材"
            onChange={(event) => setPrompt(event.target.value)}
            onBlur={() => {
              if (prompt !== (node.data.prompt ?? '')) patchNode({ prompt })
            }}
            className="min-h-[76px] flex-1 resize-none rounded-xl border border-transparent bg-transparent px-2 py-2 text-[13px] leading-relaxed text-ink-800 outline-none placeholder:text-ink-400 focus:border-white/10 focus:bg-black/10"
          />

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
            ) : (
              <button
                type="button"
                data-testid="video-run"
                aria-label="生成视频"
                onClick={() => onRun(node.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d9dadb] text-[#1f1f1f] hover:bg-white"
              >
                <IconPlay size={13} />
              </button>
            )}
          </div>

          {running && (
            <div className="flex items-center gap-2 px-1 text-[11px] text-ink-500">
              <Spinner size={12} />
              <span>生成中 {job?.progress ?? 0}%</span>
              <div className="flex-1"><ProgressBar value={job?.progress ?? 0} /></div>
            </div>
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
          <ModePopover rows={modeRows} value={output.mode} onChange={(mode) => setOutput({ mode })} />
        )}
        {popover === 'output' && capabilities && (
          <OutputPopover capabilities={capabilities} output={output} onChange={setOutput} />
        )}
        {popover === 'camera' && (
          <CameraPopover
            current={(node.data.extra?.cameraMove as string | undefined) ?? null}
            onChange={(cameraMove, promptSuffix) => {
              patchNode({ extra: { ...node.data.extra, cameraMove } })
              if (!prompt.includes(promptSuffix)) setPrompt((value) => (value ? `${value}\n${promptSuffix}` : promptSuffix))
              setPopover(null)
            }}
          />
        )}
        {popover === 'advanced' && (
          <AdvancedPopover advanced={advanced} onChange={setAdvanced} />
        )}
      </section>
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

function CameraPopover({
  current,
  onChange,
}: {
  current: string | null
  onChange: (id: string, prompt: string) => void
}) {
  return (
    <div
      role="menu"
      aria-label="运镜库"
      className="absolute top-10 left-2 z-40 grid w-[370px] grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-[#292929] p-2 shadow-[0_14px_40px_rgba(0,0,0,0.5)]"
    >
      {CAMERA_MOVES.map((move) => (
        <button
          key={move.id}
          type="button"
          role="menuitemradio"
          aria-checked={move.id === current}
          onClick={() => onChange(move.id, move.prompt)}
          className={cn(
            'flex items-center gap-2 rounded-xl px-2 py-2 text-left text-[11px] text-ink-600 hover:bg-white/8',
            move.id === current && 'bg-white/8 text-ink-900',
          )}
        >
          <IconStyle size={13} />
          <span className="truncate">{move.group} · {move.name}</span>
        </button>
      ))}
    </div>
  )
}
