'use client'

import { useEffect, useMemo, useState } from 'react'
import { availableVideoModes } from '@/domain/compile'
import {
  CAMERA_MOVES,
  IMAGE_TOOL_ACTIONS,
  PARALINGUISTIC_CUES,
  PAUSE_PRESETS,
  SHOT_SIZES,
  SLASH_PRESETS,
  VOICES,
} from '@/domain/libraries'
import { MODELS_BY_ID, modelsFor, quoteCredits, type ModelMedia } from '@/domain/models'
import { NODE_META } from '@/domain/nodes'
import type { GenerationJob, NodeData, OutputSpec, WorkflowNode } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { Menu, useMenuAnchor, type MenuSection } from '../ui/Menu'
import { Chip, Field, ProgressBar, SegmentedControl, Slider, Spinner, Toggle } from '../ui/controls'
import {
  IconChevronDown,
  IconClose,
  IconCredit,
  IconEffect,
  IconLink,
  IconPlay,
  IconStop,
  IconStyle,
  IconWarning,
} from '../icons'
import { ArtifactPreview, MediaPlaceholder } from './node-visuals'

interface NodeInspectorProps {
  node: WorkflowNode | null
  job: GenerationJob | null
  onClose: () => void
  onPatch: (nodeId: string, patch: Partial<NodeData>) => void
  onRun: (nodeId: string) => void
  onCancel: (jobId: string) => void
  onAddToAgent: (nodeId: string) => void
  onApplySlash: (nodeId: string, presetId: string) => void
  /** Opens the full-screen editor a director or script node owns. */
  onOpenStudio: (nodeId: string) => void
}

const ASPECT_OPTIONS: NonNullable<OutputSpec['aspectRatio']>[] = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']

/**
 * The node generator, opened from the canvas.
 *
 * Rendered as a right-side drawer rather than an in-node expansion so the graph
 * stays visible while editing — the node stays selected and its edges keep
 * showing what will feed the run.
 */
export function NodeInspector({
  node,
  job,
  onClose,
  onPatch,
  onRun,
  onCancel,
  onAddToAgent,
  onApplySlash,
  onOpenStudio,
}: NodeInspectorProps) {
  const document = useEditor((s) => s.document)
  const [prompt, setPrompt] = useState(node?.data.prompt ?? '')

  useEffect(() => {
    setPrompt(node?.data.prompt ?? '')
  }, [node?.id, node?.data.prompt])

  // Escape closes the drawer, unless a menu or a field is handling it first.
  useEffect(() => {
    if (!node) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        target.blur()
        return
      }
      // `document` in this module is the workflow document, not the DOM one.
      if (window.document.querySelector('[data-testid="menu"]')) return
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [node, onClose])

  const modelMenu = useMenuAnchor()
  const presetMenu = useMenuAnchor()
  const cameraMenu = useMenuAnchor()
  const voiceMenu = useMenuAnchor()

  const media: ModelMedia | null = useMemo(() => {
    if (!node) return null
    const produces = NODE_META[node.type].produces
    return produces === 'text' ? 'text' : (produces as ModelMedia | null)
  }, [node])

  if (!node) return null

  const model = node.data.modelId ? MODELS_BY_ID.get(node.data.modelId) : null
  const output = node.data.output ?? {}
  const artifacts = node.data.artifacts ?? []
  const artifact = artifacts[0] ?? null
  const cost = node.data.modelId ? quoteCredits(node.data.modelId, output) : { credits: 0, breakdown: [] }
  const running = job?.status === 'running' || job?.status === 'queued'
  const upstream = document.edges.filter((e) => e.target === node.id).length

  const setOutput = (patch: Partial<OutputSpec>) => {
    onPatch(node.id, { output: { ...output, ...patch } })
  }

  const modelSections: MenuSection[] = media
    ? [
        {
          title: '模型目录',
          items: modelsFor(media).map((m) => ({
            id: m.id,
            label: m.label,
            checked: m.id === node.data.modelId,
            shortcut: m.latencyLabel,
            onSelect: () => onPatch(node.id, { modelId: m.id }),
          })),
        },
      ]
    : []

  return (
    <aside
      data-testid="node-inspector"
      className="absolute right-0 top-0 z-40 flex h-full w-[400px] flex-col border-l border-ink-100 bg-surface shadow-[var(--shadow-panel)]"
    >
      <header className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
        <span className="truncate text-[14px] font-semibold text-ink-900">{node.name}</span>
        <span className="rounded bg-ink-100 px-1.5 py-px text-[10px] text-ink-500">
          {NODE_META[node.type].label}
        </span>
        <button
          type="button"
          onClick={() => onAddToAgent(node.id)}
          title="添加到对话"
          className="ml-auto rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-ink-50"
        >
          <IconLink size={16} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50"
        >
          <IconClose size={16} />
        </button>
      </header>

      <div className="thin-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
        {/* Result / placeholder */}
        {NODE_META[node.type].produces && NODE_META[node.type].produces !== 'text' && (
          <div className="overflow-hidden rounded-xl" style={{ aspectRatio: '16 / 9' }}>
            {artifact ? (
              <ArtifactPreview
                url={artifact.url}
                kind={artifact.kind}
                poster={artifact.thumbnailUrl}
                alt={node.name}
                controls
              />
            ) : running ? (
              <div className="shimmer h-full w-full" />
            ) : (
              <MediaPlaceholder kind={(NODE_META[node.type].produces ?? 'image') as 'image' | 'video' | 'audio'} />
            )}
          </div>
        )}

        {/* Image tool actions available on a generated still */}
        {node.type === 'image' && artifact && (
          <div className="flex flex-wrap gap-1.5">
            {IMAGE_TOOL_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={(e) => (action.id === 'nine-grid' ? presetMenu.openFrom(e) : onApplySlash(node.id, `slash-${action.id}`))}
                className="rounded-lg bg-ink-100 px-2.5 py-1.5 text-[12px] text-ink-700 transition-colors hover:bg-ink-200"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* These node types own a full-screen editor rather than an inline form. */}
        {(node.type === 'director' || node.type === 'script' || node.type === 'scriptLegacy') && (
          <button
            type="button"
            data-testid="open-studio"
            onClick={() => onOpenStudio(node.id)}
            className="w-full rounded-xl bg-ink-900 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
          >
            {node.type === 'director' ? '打开导演台' : '打开分镜流程'}
          </button>
        )}

        {/* References fed by graph edges */}
        <Field label={`参考输入（${upstream} 个连接）`}>
          <div className="flex flex-wrap gap-1.5">
            {document.edges
              .filter((e) => e.target === node.id)
              .map((edge) => {
                const source = document.nodes.find((n) => n.id === edge.source)
                if (!source) return null
                return (
                  <Chip key={edge.id} icon={<IconLink size={10} />}>
                    {source.name}
                  </Chip>
                )
              })}
            {upstream === 0 && (
              <span className="text-[11px] text-ink-400">从其他节点拖出连线即可作为参考输入</span>
            )}
          </div>
        </Field>

        {/* Prompt */}
        {node.type !== 'videoComposite' && (
          <Field label="提示词">
            <textarea
              value={prompt}
              data-testid="node-prompt"
              onChange={(e) => setPrompt(e.target.value)}
              onBlur={() => {
                if (prompt !== (node.data.prompt ?? '')) onPatch(node.id, { prompt })
              }}
              rows={node.type === 'text' || node.type === 'audio' ? 7 : 4}
              placeholder={
                node.type === 'image'
                  ? '可直接文字生图，或上传图片输入文字指令对图片进行编辑，如：将背景改为雪夜'
                  : node.type === 'audio'
                    ? '输入需要转换为语音的文本，可插入停顿与副语言提示'
                    : '描述你想要的画面或内容'
              }
              className="w-full resize-none rounded-xl border border-ink-200 p-3 text-[13px] leading-relaxed outline-none transition-colors placeholder:text-ink-300 focus:border-accent"
            />
          </Field>
        )}

        {/* Audio composer helpers */}
        {node.type === 'audio' && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {PAUSE_PRESETS.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  onClick={() => setPrompt((p) => `${p}[停顿 ${seconds}s]`)}
                  className="rounded-md bg-ink-100 px-2 py-1 text-[11px] text-ink-600 hover:bg-ink-200"
                >
                  停顿 {seconds}s
                </button>
              ))}
            </div>
            <div className="thin-scrollbar flex max-h-20 flex-wrap gap-1 overflow-y-auto">
              {PARALINGUISTIC_CUES.map((cue) => (
                <button
                  key={cue}
                  type="button"
                  onClick={() => setPrompt((p) => `${p}[${cue}]`)}
                  className="rounded-md bg-ink-50 px-2 py-1 text-[11px] text-ink-500 hover:bg-ink-100"
                >
                  {cue}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Model selector */}
        {media && (
          <Field label="模型">
            <button
              type="button"
              data-testid="model-selector"
              onClick={(e) => modelMenu.openFrom(e)}
              className="flex w-full items-center justify-between rounded-xl border border-ink-200 px-3 py-2 text-[13px] transition-colors hover:border-ink-300"
            >
              <span className="flex items-center gap-2">
                <span className="font-medium text-ink-900">{model?.label ?? '选择模型'}</span>
                {model && <span className="text-[11px] text-ink-400">{model.latencyLabel}</span>}
              </span>
              <IconChevronDown size={14} className="text-ink-400" />
            </button>
          </Field>
        )}

        {/* Output spec */}
        {model && model.controls.includes('aspectRatio') && (
          <Field label="画幅比例">
            <div className="flex flex-wrap gap-1.5">
              {ASPECT_OPTIONS.map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setOutput({ aspectRatio: ratio })}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-[12px] transition-colors',
                    output.aspectRatio === ratio ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                  )}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </Field>
        )}

        {model?.controls.includes('quality') && (
          <Field label="画质">
            <SegmentedControl
              size="sm"
              value={output.quality ?? 'standard'}
              onChange={(quality) => setOutput({ quality })}
              options={[
                { value: 'standard', label: '标准画质' },
                { value: 'high', label: '高品质' },
              ]}
            />
          </Field>
        )}

        {model?.controls.includes('resolution') && (
          <Field label="分辨率">
            <div className="flex gap-1.5">
              {(media === 'video' ? (['480p', '720p', '1080p'] as const) : (['1K', '2K', '4K'] as const)).map(
                (resolution) => (
                  <button
                    key={resolution}
                    type="button"
                    onClick={() => setOutput({ resolution })}
                    className={cn(
                      'flex-1 rounded-lg py-1.5 text-[12px] transition-colors',
                      output.resolution === resolution
                        ? 'bg-ink-900 text-white'
                        : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                    )}
                  >
                    {resolution}
                  </button>
                ),
              )}
            </div>
          </Field>
        )}

        {model?.controls.includes('durationSeconds') && (
          <Field label="时长">
            <div className="flex gap-1.5">
              {([5, 10, 15] as const).map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  onClick={() => setOutput({ durationSeconds: seconds })}
                  className={cn(
                    'flex-1 rounded-lg py-1.5 text-[12px] transition-colors',
                    output.durationSeconds === seconds
                      ? 'bg-ink-900 text-white'
                      : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                  )}
                >
                  {seconds} 秒
                </button>
              ))}
            </div>
          </Field>
        )}

        {model?.controls.includes('count') && (
          <Field label="生成数量">
            <div className="flex gap-1.5">
              {([1, 2, 4] as const).map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setOutput({ count })}
                  className={cn(
                    'flex-1 rounded-lg py-1.5 text-[12px] transition-colors',
                    (output.count ?? 1) === count ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                  )}
                >
                  {count} 张
                </button>
              ))}
            </div>
          </Field>
        )}

        {/* Video-only: mode derived from connected inputs */}
        {media === 'video' && (
          <Field label="生成模式" hint="模式随已连接的输入变化">
            <div className="flex flex-wrap gap-1.5">
              {availableVideoModes(document, node.id).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setOutput({ mode })}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-[12px] transition-colors',
                    output.mode === mode ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                  )}
                >
                  {
                    { text2video: '文生视频', 'first-frame': '首帧生视频', 'first-last-frame': '首尾帧生视频', video2video: '视频生视频' }[
                      mode
                    ]
                  }
                </button>
              ))}
            </div>
          </Field>
        )}

        {media === 'video' && (
          <>
            <Toggle
              checked={Boolean(output.withAudio)}
              onChange={(withAudio) => setOutput({ withAudio })}
              label="生成音频"
              description="部分模型支持画面与音轨同时生成"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={(e) => cameraMenu.openFrom(e)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink-100 py-2 text-[12px] text-ink-700 hover:bg-ink-200"
              >
                <IconStyle size={13} /> 运镜库
              </button>
              <button
                type="button"
                onClick={() => useEditor.getState().setLeftPanel('material')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink-100 py-2 text-[12px] text-ink-700 hover:bg-ink-200"
              >
                <IconEffect size={13} /> 特效市场
              </button>
            </div>
          </>
        )}

        {/* Audio-only: voice + delivery */}
        {media === 'audio' && model?.controls.includes('voiceId') && (
          <>
            <Field label="音色">
              <button
                type="button"
                onClick={(e) => voiceMenu.openFrom(e)}
                className="flex w-full items-center justify-between rounded-xl border border-ink-200 px-3 py-2 text-[13px]"
              >
                {VOICES.find((v) => v.id === output.voiceId)?.name ?? '选择音色'}
                <IconChevronDown size={14} className="text-ink-400" />
              </button>
            </Field>
            <Slider
              label="语速"
              min={0.5}
              max={2}
              step={0.05}
              value={output.speed ?? 1}
              onChange={(speed) => setOutput({ speed })}
              format={(v) => `${v.toFixed(2)}×`}
            />
            <Slider
              label="音调"
              min={-12}
              max={12}
              value={output.pitch ?? 0}
              onChange={(pitch) => setOutput({ pitch })}
            />
            <Slider
              label="音量"
              min={0.2}
              max={2}
              step={0.05}
              value={output.volume ?? 1}
              onChange={(volume) => setOutput({ volume })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </>
        )}

        {/* Script v2 shot table */}
        {node.type === 'script' && <ScriptShotTable node={node} onPatch={onPatch} />}

        {/* Advanced */}
        {media === 'video' && (
          <details className="rounded-xl bg-ink-50 p-3">
            <summary className="cursor-pointer text-[12px] font-medium text-ink-600">高级设置</summary>
            <div className="space-y-1 pt-2">
              <Toggle
                checked={Boolean((node.data.extra?.advanced as { webSearch?: boolean } | undefined)?.webSearch)}
                onChange={(webSearch) =>
                  onPatch(node.id, {
                    extra: { ...node.data.extra, advanced: { ...(node.data.extra?.advanced ?? {}), webSearch } },
                  })
                }
                label="联网搜索"
              />
              <Toggle
                checked={
                  (node.data.extra?.advanced as { autoCompliance?: boolean } | undefined)?.autoCompliance ?? true
                }
                onChange={(autoCompliance) =>
                  onPatch(node.id, {
                    extra: {
                      ...node.data.extra,
                      advanced: { ...(node.data.extra?.advanced ?? {}), autoCompliance },
                    },
                  })
                }
                label="自动合规校验"
                description="提交前校验人像与版权素材"
              />
            </div>
          </details>
        )}
      </div>

      {/* Submit bar with quote */}
      {NODE_META[node.type].produces && (
        <footer className="border-t border-ink-100 p-3">
          {running ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[12px] text-ink-600">
                <Spinner size={13} />
                生成中 {job?.progress ?? 0}%
                <button
                  type="button"
                  onClick={() => job && onCancel(job.id)}
                  className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-ink-500 hover:bg-ink-50"
                >
                  <IconStop size={12} /> 取消
                </button>
              </div>
              <ProgressBar value={job?.progress ?? 0} />
            </div>
          ) : (
            <>
              {(job?.status === 'failed' || job?.status === 'compliance_blocked') && (
                <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-danger/8 p-2 text-[11px] text-danger">
                  <IconWarning size={13} className="mt-px shrink-0" />
                  <span>{job.error}</span>
                </div>
              )}
              <button
                type="button"
                data-testid="inspector-run"
                onClick={() => onRun(node.id)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
              >
                <IconPlay size={13} />
                生成
                <span className="flex items-center gap-0.5 text-ink-300">
                  <IconCredit size={12} />
                  {cost.credits}
                </span>
              </button>
            </>
          )}
        </footer>
      )}

      {modelMenu.anchor && <Menu sections={modelSections} anchor={modelMenu.anchor} onClose={modelMenu.close} width={252} />}
      {presetMenu.anchor && (
        <Menu
          anchor={presetMenu.anchor}
          onClose={presetMenu.close}
          width={220}
          sections={[
            {
              title: '宫格与叙事预设',
              items: SLASH_PRESETS.map((preset) => ({
                id: preset.id,
                label: preset.name,
                onSelect: () => onApplySlash(node.id, preset.id),
              })),
            },
          ]}
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
                onSelect: () => {
                  onPatch(node.id, { extra: { ...node.data.extra, cameraMove: move.id } })
                  setPrompt((p) => (p ? `${p}\n${move.prompt}` : move.prompt))
                },
              })),
            },
          ]}
        />
      )}
      {voiceMenu.anchor && (
        <Menu
          anchor={voiceMenu.anchor}
          onClose={voiceMenu.close}
          width={236}
          sections={[
            {
              title: `音色库（${VOICES.length}）`,
              items: VOICES.map((voice) => ({
                id: voice.id,
                label: `${voice.name} · ${voice.language}${voice.accent !== '标准' ? `/${voice.accent}` : ''}`,
                checked: voice.id === output.voiceId,
                onSelect: () => setOutput({ voiceId: voice.id }),
              })),
            },
          ]}
        />
      )}
    </aside>
  )
}

interface Shot {
  id: string
  index: number
  durationSeconds: number
  description: string
  shotSize: string
  dialogue: string
}

/** Phase 1 of the script v2 flow: the editable shot table. */
function ScriptShotTable({
  node,
  onPatch,
}: {
  node: WorkflowNode
  onPatch: (nodeId: string, patch: Partial<NodeData>) => void
}) {
  const shots = ((node.data.extra?.shots as Shot[] | undefined) ?? []).slice()

  const update = (next: Shot[]) => {
    onPatch(node.id, { extra: { ...node.data.extra, shots: next } })
  }

  return (
    <Field label={`镜头表（${shots.length}）`}>
      <div className="space-y-2">
        {shots.map((shot, index) => (
          <div key={shot.id} className="rounded-xl bg-ink-50 p-2.5">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[11px] font-medium text-ink-700">镜号 {index + 1}</span>
              <select
                value={shot.shotSize}
                onChange={(e) => {
                  const next = shots.slice()
                  next[index] = { ...shot, shotSize: e.target.value }
                  update(next)
                }}
                className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-ink-600 outline-none"
              >
                {SHOT_SIZES.map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
              <input
                type="number"
                min={5}
                max={15}
                value={shot.durationSeconds}
                onChange={(e) => {
                  const next = shots.slice()
                  next[index] = { ...shot, durationSeconds: Number(e.target.value) }
                  update(next)
                }}
                className="w-12 rounded-md bg-surface px-1.5 py-0.5 text-[11px] outline-none"
              />
              <span className="text-[10px] text-ink-400">秒</span>
              <button
                type="button"
                onClick={() => update(shots.filter((s) => s.id !== shot.id))}
                className="ml-auto text-[11px] text-ink-400 hover:text-danger"
              >
                删除
              </button>
            </div>
            <textarea
              value={shot.description}
              onChange={(e) => {
                const next = shots.slice()
                next[index] = { ...shot, description: e.target.value }
                update(next)
              }}
              rows={2}
              placeholder="画面描述"
              className="w-full resize-none rounded-lg border border-ink-200 bg-surface p-2 text-[12px] outline-none focus:border-accent"
            />
          </div>
        ))}
        <button
          type="button"
          data-testid="script-add-shot"
          onClick={() =>
            update([
              ...shots,
              {
                id: `shot-${Date.now()}`,
                index: shots.length,
                durationSeconds: 5,
                description: '',
                shotSize: '中景',
                dialogue: '',
              },
            ])
          }
          className="w-full rounded-lg border border-dashed border-ink-200 py-2 text-[12px] text-ink-500 transition-colors hover:border-ink-300 hover:text-ink-700"
        >
          添加镜头
        </button>
      </div>
    </Field>
  )
}
