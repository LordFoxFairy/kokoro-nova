'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useStore as useFlowStore } from '@xyflow/react'
import type { ImageTransformRequest } from '@/domain/image-authoring'
import { IMAGE_AUTHORING_PRESETS, type ImageAuthoringPreset } from '@/domain/libraries'
import {
  IMAGE_ASPECT_RATIOS,
  MODELS_BY_ID,
  imageModelOutputOptions,
  normalizeImageOutputForModel,
  quoteCredits,
  type ImageModelCapabilities,
  type ModelDefinition,
} from '@/domain/models'
import type { GenerationJob, NodeData, OutputSpec, WorkflowNode } from '@/domain/types'
import { orderedVideoReferences, readVideoElementMarks } from '@/domain/video-references'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import {
  IconClose,
  IconCredit,
  IconDownload,
  IconExpand,
  IconFilter,
  IconGrid,
  IconImage,
  IconLink,
  IconLocate,
  IconPlay,
  IconSparkle,
  IconStop,
  IconStyle,
} from '../icons'
import { ImageModelCatalog, ImageModelMark, formatImageOutputSummary } from '../image/ImageModelCatalog'
import {
  CropEditor,
  EmotionEditor,
  LightingEditor,
  MultiAngleEditor,
  PanoramaViewer,
  type ImageToolRequest,
} from '../storyboard/ImageToolEditors'
import { ProgressBar, Spinner, Toggle } from '../ui/controls'

interface ImageNodeEditorProps {
  node: WorkflowNode
  job: GenerationJob | null
  onRun: (nodeId: string) => void
  onCancel: (jobId: string) => void
  selectionMode: 'reference' | 'element' | null
  onStartSelection: (kind: 'reference' | 'element', targetNodeId: string) => void
  onExitSelection: () => void
  onRemoveReference: (targetNodeId: string, sourceNodeId: string) => void
  onLocateReference: (nodeId: string) => void
  onOpenStyle: (nodeId: string) => void
  onApplyTool: (sourceNodeId: string, request: ImageTransformRequest) => void
}

type OpenPopover = 'models' | 'output' | 'presets' | 'advanced' | 'portrait' | null
type ActiveTool = 'crop' | 'lighting' | 'multi-angle' | 'emotion' | 'panorama' | null

/**
 * Node-attached Image composer. As on the official canvas, the form cancels
 * React Flow zoom so its 660px reading width and hit targets stay constant.
 */
export function ImageNodeEditor({
  node,
  job,
  onRun,
  onCancel,
  selectionMode,
  onStartSelection,
  onExitSelection,
  onRemoveReference,
  onLocateReference,
  onOpenStyle,
  onApplyTool,
}: ImageNodeEditorProps) {
  const zoom = useFlowStore((state) => state.transform[2])
  const workflow = useEditor((state) => state.document)
  const commitWith = useEditor((state) => state.commitWith)
  const inspect = useEditor((state) => state.inspect)
  const toast = useEditor((state) => state.toast)
  const [prompt, setPrompt] = useState(node.data.prompt ?? '')
  const [popover, setPopover] = useState<OpenPopover>(null)
  const [activeTool, setActiveTool] = useState<ActiveTool>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => setPrompt(node.data.prompt ?? ''), [node.id, node.data.prompt])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      if (expanded) {
        setExpanded(false)
        return
      }
      if (activeTool) return
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
  }, [activeTool, expanded, inspect, onExitSelection, popover, selectionMode])

  const patchNode = (
    patchOrProducer: Partial<NodeData> | ((current: NodeData) => Partial<NodeData>),
  ) => {
    void commitWith((document) => {
      const current = document.nodes.find((item) => item.id === node.id)
      if (!current) return []
      const patch = typeof patchOrProducer === 'function'
        ? patchOrProducer(current.data)
        : patchOrProducer
      return [{
        op: 'updateNode',
        nodeId: current.id,
        patch: {
          data: {
            ...current.data,
            ...patch,
            ...(patch.extra
              ? { extra: { ...current.data.extra, ...patch.extra } }
              : {}),
          },
        },
      }]
    }, '编辑图片节点')
  }

  const model = node.data.modelId ? MODELS_BY_ID.get(node.data.modelId) : undefined
  const capabilities = node.data.modelId ? imageModelOutputOptions(node.data.modelId) : null
  const output = capabilities
    ? normalizeImageOutputForModel(node.data.modelId!, node.data.output)
    : (node.data.output ?? {})
  const running = job?.status === 'running' || job?.status === 'queued'
  const cost = node.data.modelId ? quoteCredits(node.data.modelId, output).credits : 0
  const references = useMemo(() => orderedVideoReferences(workflow, node.id), [workflow, node.id])
  const elementMarks = readVideoElementMarks(node.data.extra)
  const advanced = (node.data.extra?.advanced as { autoLink?: boolean } | undefined) ?? { autoLink: true }
  const artifact = node.data.artifacts?.[0] ?? null

  const setOutput = (outputPatch: Partial<OutputSpec>) => {
    void commitWith((document) => {
      const current = document.nodes.find((item) => item.id === node.id)
      if (!current?.data.modelId) return []
      return [{
        op: 'updateNode',
        nodeId: current.id,
        patch: {
          data: {
            ...current.data,
            output: normalizeImageOutputForModel(current.data.modelId, {
              ...current.data.output,
              ...outputPatch,
            }),
          },
        },
      }]
    }, '编辑图片输出')
  }

  const selectModel = (nextModel: ModelDefinition) => {
    patchNode((current) => ({
      modelId: nextModel.id,
      output: normalizeImageOutputForModel(nextModel.id, current.output),
    }))
    setPopover(null)
  }

  const selectPreset = (preset: ImageAuthoringPreset) => {
    setPrompt(preset.promptTemplate)
    patchNode((current) => ({
      prompt: preset.promptTemplate,
      output: normalizeImageOutputForModel(current.modelId ?? 'lib-image-2', preset.output),
      extra: {
        imagePreset: { id: preset.id, name: preset.name },
      },
    }))
    setPopover(null)
  }

  const applyTool = (request: ImageTransformRequest | ImageToolRequest) => onApplyTool(node.id, request)

  const quickDerived = (
    tool: string,
    label: string,
    promptText: string,
    outputPatch: Partial<ImageTransformRequest['output']> = {},
    parameters: ImageTransformRequest['parameters'] = {},
  ) => {
    applyTool({
      tool,
      label,
      prompt: promptText,
      output: {
        quality: outputPatch.quality ?? 'standard',
        resolution: outputPatch.resolution ?? '2K',
        aspectRatio: outputPatch.aspectRatio ?? '16:9',
        count: outputPatch.count ?? 1,
      },
      credits: tool === 'upscale' ? 12 : 22,
      parameters,
    })
  }

  return (
    <>
      <div
        data-testid="image-node-editor"
        data-zoom-compensation={(1 / Math.max(zoom, 0.01)).toFixed(5)}
        className="node-floating-ui nodrag nowheel nopan absolute -bottom-3 left-1/2 z-30 w-[660px] -translate-x-1/2 translate-y-full origin-top"
        style={{ transform: `scale(${1 / Math.max(zoom, 0.01)})` }}
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {artifact && (
          <ImageArtifactToolbar
            onSelect={(tool) => {
              if (tool === 'portrait') return setPopover('portrait')
              if (tool === 'panorama') return setActiveTool('panorama')
              if (tool === 'multi-angle') return setActiveTool('multi-angle')
              if (tool === 'lighting') return setActiveTool('lighting')
              if (tool === 'nine-grid') return setPopover('presets')
              if (tool === 'element-edit') return onStartSelection('element', node.id)
              if (tool === 'upscale') {
                return quickDerived('upscale', '高清', '保持内容不变，提升清晰度、纹理与边缘质量。', {
                  resolution: '4K',
                  quality: 'high',
                })
              }
              if (tool === 'layer-separation') {
                return quickDerived('layer-separation', '图层分离', '将主体、前景与背景分离为可继续编辑的图层。', {
                  count: 4,
                })
              }
              if (tool === 'grid-split') {
                return quickDerived('grid-split', '宫格切分', '识别并切分宫格中的独立画面，按阅读顺序输出。', {
                  count: 4,
                })
              }
            }}
            onDownload={() => {
              const pathname = new URL(artifact.url, window.location.href).pathname
              const extension = pathname.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'png'
              const link = window.document.createElement('a')
              link.href = artifact.url
              link.download = `${node.name.replace(/[\\/:*?"<>|]/g, '-')}.${extension}`
              link.click()
            }}
            onExpand={() => setExpanded(true)}
          />
        )}

        <section className="relative flex min-h-[236px] w-full flex-col overflow-visible rounded-2xl border border-white/10 bg-[#242424] shadow-[0_14px_45px_rgba(0,0,0,0.42)]">
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
              <QuickAction label="风格" icon={<IconStyle size={14} />} onClick={() => onOpenStyle(node.id)} />
              <button
                type="button"
                aria-label="关闭图片编辑器"
                onClick={() => inspect(null)}
                className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 hover:bg-white/8 hover:text-ink-800"
              >
                <IconClose size={15} />
              </button>
            </div>

            {references.length > 0 && (
              <div data-testid="image-reference-strip" className="flex min-h-11 items-center gap-1.5 overflow-x-auto px-0.5 pb-0.5">
                {references.map(({ node: reference }, index) => {
                  const preview = reference.data.artifacts?.[0]
                  return (
                    <div
                      key={reference.id}
                      data-testid={`image-reference-card-${reference.id}`}
                      className="group/reference relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/12 bg-white/[0.055]"
                    >
                      {preview?.thumbnailUrl || preview?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preview.thumbnailUrl ?? preview.url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-ink-400"><IconImage size={14} /></span>
                      )}
                      <span className="absolute top-0.5 left-0.5 rounded bg-black/72 px-1 text-[9px] text-white">{index + 1}</span>
                      <button
                        type="button"
                        aria-label={`定位参考 ${reference.name}`}
                        onClick={() => onLocateReference(reference.id)}
                        className="absolute bottom-0.5 left-0.5 flex h-4 w-4 items-center justify-center rounded bg-black/72 text-white opacity-0 group-hover/reference:opacity-100 focus-visible:opacity-100"
                      >
                        <IconLocate size={9} />
                      </button>
                      <button
                        type="button"
                        aria-label={`移除参考 ${reference.name}`}
                        onClick={() => onRemoveReference(node.id, reference.id)}
                        className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded bg-black/72 text-white opacity-0 hover:bg-[#b62d3a] group-hover/reference:opacity-100 focus-visible:opacity-100"
                      >
                        <IconClose size={9} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {elementMarks.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {elementMarks.map((mark) => (
                  <span key={mark.id} data-testid="image-element-chip" className="rounded-md border border-[#a683ff]/32 bg-[#7654d8]/18 px-1.5 py-0.5 text-[10px] text-[#c5b4ff]">
                    <IconLocate size={9} className="mr-1 inline" />{mark.label}
                  </span>
                ))}
              </div>
            )}

            <textarea
              data-testid="image-prompt"
              value={prompt}
              rows={references.length > 0 ? 4 : 5}
              placeholder="可直接文字生图，或上传图片输入文字指令对图片进行编辑，如：将背景改为雪夜"
              onChange={(event) => setPrompt(event.target.value)}
              onBlur={() => {
                if (prompt !== (node.data.prompt ?? '')) patchNode({ prompt })
              }}
              className="min-h-[88px] w-full resize-none rounded-xl border border-transparent bg-transparent px-2 py-1.5 text-[13px] leading-relaxed text-ink-800 outline-none placeholder:text-ink-400 focus:border-white/10 focus:bg-black/10"
            />

            <div className="flex h-8 w-full items-center gap-1 border-t border-white/[0.06] pt-2">
              <button
                type="button"
                data-testid="image-model-selector"
                aria-haspopup="dialog"
                aria-expanded={popover === 'models'}
                onClick={() => setPopover(popover === 'models' ? null : 'models')}
                className="flex h-8 min-w-[116px] max-w-[180px] items-center gap-1.5 rounded-lg px-2 text-[12px] text-ink-800 hover:bg-white/8"
              >
                <ImageModelMark iconKey={model?.iconKey} />
                <span className="truncate font-medium">{model?.label ?? '选择模型'}</span>
                <span className="text-[10px] text-ink-400">⌄</span>
              </button>
              <span className="h-5 w-px bg-white/8" />
              <button
                type="button"
                data-testid="image-output-selector"
                aria-haspopup="dialog"
                aria-expanded={popover === 'output'}
                onClick={() => setPopover(popover === 'output' ? null : 'output')}
                className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-lg px-2 text-[12px] text-ink-700 hover:bg-white/8"
              >
                <span className="truncate tabular-nums">{formatImageOutputSummary(output)}</span>
                <span className="shrink-0 text-[10px] text-ink-400">⌄</span>
              </button>
              <button
                type="button"
                aria-label="预设"
                aria-expanded={popover === 'presets'}
                onClick={() => setPopover(popover === 'presets' ? null : 'presets')}
                className="flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] text-ink-700 hover:bg-white/8"
              >
                <IconGrid size={14} /> 预设
              </button>
              <button
                type="button"
                aria-label="提示词优化"
                onClick={() => {
                  const improved = prompt.trim() ? `${prompt.trim()}，电影级构图，细节清晰，光线自然。` : '电影级构图，细节清晰，光线自然。'
                  setPrompt(improved)
                  patchNode({ prompt: improved })
                  toast('已使用本地规则优化提示词', 'success')
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-white/8 hover:text-ink-800"
              >
                <IconSparkle size={15} />
              </button>
              <button
                type="button"
                aria-label="高级设置"
                aria-expanded={popover === 'advanced'}
                onClick={() => setPopover(popover === 'advanced' ? null : 'advanced')}
                className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/8', popover === 'advanced' ? 'bg-white/8 text-ink-900' : 'text-ink-500')}
              >
                <IconFilter size={15} />
              </button>
              <span className="ml-1 flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-ink-500"><IconCredit size={12} />{cost}</span>
              {running ? (
                <button type="button" aria-label="取消生成" onClick={() => job && onCancel(job.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-ink-800"><IconStop size={13} /></button>
              ) : (
                <button
                  type="button"
                  data-testid="image-run"
                  aria-label="生成图片"
                  disabled={!prompt.trim() && references.length === 0}
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
            <ImageModelCatalog currentId={node.data.modelId ?? null} onSelect={selectModel} onClose={() => setPopover(null)} className="absolute bottom-12 left-2 z-50 h-[470px] w-[410px]" />
          )}
          {popover === 'output' && capabilities && <ImageOutputPopover capabilities={capabilities} output={output} onChange={setOutput} />}
          {popover === 'presets' && <ImagePresetCatalog onSelect={selectPreset} />}
          {popover === 'advanced' && (
            <div data-testid="image-advanced-settings" className="absolute inset-x-0 top-full z-30 mt-2 rounded-2xl border border-white/10 bg-[#242424] px-4 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.48)]">
              <div className="pb-1 text-[11px] font-medium text-ink-400">高级设置</div>
              <Toggle
                checked={advanced.autoLink ?? true}
                onChange={(autoLink) => patchNode((current) => {
                  const currentAdvanced = (current.extra?.advanced as { autoLink?: boolean } | undefined) ?? {}
                  return { extra: { advanced: { ...currentAdvanced, autoLink } } }
                })}
                label="智能引用 AutoLink"
              />
            </div>
          )}
          {popover === 'portrait' && (
            <div className="absolute -top-[88px] left-2 z-40 w-44 rounded-xl border border-white/10 bg-[#292929] p-1.5 shadow-xl">
              <button type="button" onClick={() => { selectPreset(IMAGE_AUTHORING_PRESETS.find((preset) => preset.id === 'slash-portrait-quality')!) }} className="block w-full rounded-lg px-3 py-2 text-left text-[12px] text-ink-700 hover:bg-white/8">人像调节</button>
              <button type="button" onClick={() => { setPopover(null); setActiveTool('emotion') }} className="block w-full rounded-lg px-3 py-2 text-left text-[12px] text-ink-700 hover:bg-white/8">情绪调节</button>
            </div>
          )}
        </section>
      </div>

      {typeof window !== 'undefined' && createPortal(
        <>
          {expanded && artifact && (
            <div
              data-testid="image-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={`${node.name} 图片预览`}
              className="fixed inset-0 z-[140] flex items-center justify-center bg-black/88 p-10 backdrop-blur-sm"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) setExpanded(false)
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={artifact.url} alt={node.name} className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
              <button
                type="button"
                aria-label="关闭图片预览"
                onClick={() => setExpanded(false)}
                className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/18"
              >
                <IconClose size={18} />
              </button>
            </div>
          )}
          <CropEditor
            open={activeTool === 'crop'}
            imageUrl={artifact?.url ?? null}
            onClose={() => setActiveTool(null)}
            onApply={(aspect, rotation, mirrored) => {
              const parts = [aspect === '原图' ? null : `裁剪为 ${aspect}`, rotation ? `旋转 ${rotation}°` : null, mirrored ? '水平镜像' : null].filter(Boolean)
              if (parts.length === 0) return
              quickDerived('crop', '裁剪', `保持画面内容不变，${parts.join('，')}。`, { aspectRatio: aspect === '原图' ? '16:9' : aspect as ImageTransformRequest['output']['aspectRatio'] }, { aspect, rotation, mirrored })
            }}
          />
          <LightingEditor open={activeTool === 'lighting'} imageUrl={artifact?.url ?? null} onClose={() => setActiveTool(null)} onSubmit={applyTool} />
          <MultiAngleEditor open={activeTool === 'multi-angle'} imageUrl={artifact?.url ?? null} onClose={() => setActiveTool(null)} onSubmit={applyTool} />
          <EmotionEditor open={activeTool === 'emotion'} imageUrl={artifact?.url ?? null} onClose={() => setActiveTool(null)} onSubmit={applyTool} />
          <PanoramaViewer
            open={activeTool === 'panorama'}
            imageUrl={artifact?.url ?? null}
            onClose={() => setActiveTool(null)}
            onCapture={(views) => {
              quickDerived('panorama', views === 1 ? '全景当前视角' : `全景 ${views} 视角`, views === 1 ? '从全景中截取当前视角的透视校正画面。' : `从全景中均匀截取 ${views} 个视角的透视校正画面。`, {}, { views })
              setActiveTool(null)
            }}
          />
        </>,
        window.document.body,
      )}
    </>
  )
}

function QuickAction({ label, icon, active, onClick }: { label: string; icon: ReactNode; active?: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={cn('flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-ink-600 hover:bg-white/8 hover:text-ink-800', active && 'bg-[#1769e8]/24 text-[#8db8ff]')}>{icon}{label}</button>
}

function ImageOutputPopover({ capabilities, output, onChange }: { capabilities: ImageModelCapabilities; output: OutputSpec; onChange: (patch: Partial<OutputSpec>) => void }) {
  const qualityLabels = { low: '低画质', standard: '标准画质', high: '高画质' } as const
  return (
    <div data-testid="image-output-popover" role="dialog" aria-label="图片输出参数" className="absolute bottom-12 left-[130px] z-50 w-[438px] space-y-3 rounded-2xl border border-white/10 bg-[#292929] p-3 shadow-[0_18px_55px_rgba(0,0,0,0.55)]">
      <OptionGrid label="画质" columns={3} values={capabilities.qualities} value={output.quality} format={(quality) => qualityLabels[quality]} aria={(quality) => qualityLabels[quality]} onChange={(quality) => onChange({ quality })} />
      <OptionGrid label="清晰度" columns={3} values={capabilities.resolutions} value={output.resolution} format={(resolution) => String(resolution)} aria={(resolution) => `${resolution} 清晰度`} onChange={(resolution) => onChange({ resolution })} />
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium text-ink-500">比例</div>
        <div className="grid grid-cols-5 gap-1.5">
          {capabilities.aspectRatios.map((ratio) => <AspectButton key={ratio} ratio={ratio} active={output.aspectRatio === ratio} onClick={() => onChange({ aspectRatio: ratio })} />)}
        </div>
      </div>
      <OptionGrid label="生成数量" columns={3} values={capabilities.counts} value={output.count ?? 1} format={(count) => `${count}张`} aria={(count) => `${count}张 生成数量`} onChange={(count) => onChange({ count })} />
    </div>
  )
}

function OptionGrid<T extends string | number>({ label, values, value, format, aria, onChange, columns }: { label: string; values: readonly T[]; value: T | undefined; format: (value: T) => string; aria: (value: T) => string; onChange: (value: T) => void; columns: number }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium text-ink-500">{label}</div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {values.map((option) => <button key={String(option)} type="button" aria-label={aria(option)} aria-pressed={option === value} onClick={() => onChange(option)} className={cn('h-9 rounded-xl border text-[11px] transition-colors', option === value ? 'border-white/45 bg-white/9 text-ink-900' : 'border-white/8 text-ink-500 hover:bg-white/6 hover:text-ink-800')}>{format(option)}</button>)}
      </div>
    </div>
  )
}

function AspectButton({ ratio, active, onClick }: { ratio: (typeof IMAGE_ASPECT_RATIOS)[number]; active: boolean; onClick: () => void }) {
  const [width, height] = ratio.split(':').map(Number)
  const landscape = width >= height
  const long = Math.max(width, height) / Math.min(width, height)
  return (
    <button type="button" data-image-aspect={ratio} aria-label={`${ratio} 比例`} aria-pressed={active} onClick={onClick} className={cn('flex h-14 flex-col items-center justify-center gap-1 rounded-xl border text-[10px] transition-colors', active ? 'border-white/50 bg-white/9 text-ink-900' : 'border-white/8 text-ink-500 hover:bg-white/6 hover:text-ink-800')}>
      <span className="block rounded-[2px] border border-current" style={{ width: landscape ? Math.min(24, 11 * long) : 9, height: landscape ? 9 : Math.min(24, 11 * long) }} />
      {ratio}
    </button>
  )
}

function ImagePresetCatalog({ onSelect }: { onSelect: (preset: ImageAuthoringPreset) => void }) {
  const sections = ['分镜叙事', '质感调节', '空间与机位', '设定图'] as const
  return (
    <div data-testid="image-preset-catalog" role="dialog" aria-label="图片预设目录" className="thin-scrollbar absolute bottom-12 right-2 z-50 max-h-[520px] w-[410px] overflow-y-auto rounded-2xl border border-white/10 bg-[#292929] p-2 shadow-[0_18px_55px_rgba(0,0,0,0.55)]">
      {sections.map((section) => (
        <section key={section} className="mb-2 last:mb-0">
          <div className="px-2 py-1 text-[10px] font-medium text-ink-400">{section}</div>
          <div className="grid grid-cols-2 gap-1">
            {IMAGE_AUTHORING_PRESETS.filter((preset) => preset.category === section).map((preset) => (
              <button key={preset.id} type="button" onClick={() => onSelect(preset)} className="rounded-xl px-2.5 py-2 text-left hover:bg-white/[0.065]">
                <span className="block text-[12px] font-medium text-ink-800">{preset.name}</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-ink-400">{preset.summary}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

type ToolbarTool = 'portrait' | 'panorama' | 'multi-angle' | 'lighting' | 'nine-grid' | 'upscale' | 'element-edit' | 'layer-separation' | 'grid-split'

function ImageArtifactToolbar({
  onSelect,
  onDownload,
  onExpand,
}: {
  onSelect: (tool: ToolbarTool) => void
  onDownload: () => void
  onExpand: () => void
}) {
  const actions: { id: ToolbarTool; label: string }[] = [
    { id: 'portrait', label: '人像质感调节' },
    { id: 'panorama', label: '全景' },
    { id: 'multi-angle', label: '多角度' },
    { id: 'lighting', label: '打光' },
    { id: 'nine-grid', label: '九宫格' },
    { id: 'upscale', label: '高清' },
    { id: 'element-edit', label: '元素编辑' },
    { id: 'layer-separation', label: '图层分离' },
    { id: 'grid-split', label: '宫格切分' },
  ]
  return (
    <div data-testid="image-artifact-toolbar" className="absolute -top-11 left-1/2 z-40 flex h-10 max-w-[760px] -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-xl border border-white/10 bg-[#292929] px-1.5 shadow-[0_12px_34px_rgba(0,0,0,.45)]">
      {actions.map((action) => <button key={action.id} type="button" onClick={() => onSelect(action.id)} className="h-8 rounded-lg px-2 text-[10px] text-ink-700 hover:bg-white/8">{action.label}</button>)}
      <span className="mx-0.5 h-5 w-px bg-white/10" />
      <button type="button" aria-label="下载图片" onClick={onDownload} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-600 hover:bg-white/8"><IconDownload size={14} /></button>
      <button type="button" aria-label="展开图片" onClick={onExpand} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-600 hover:bg-white/8"><IconExpand size={14} /></button>
    </div>
  )
}
