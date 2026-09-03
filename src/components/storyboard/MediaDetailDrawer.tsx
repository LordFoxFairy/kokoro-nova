'use client'

import { useState } from 'react'
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
import type { OutputSpec, WorkflowNode } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { Menu, useMenuAnchor } from '../ui/Menu'
import { Chip } from '../ui/controls'
import {
  IconClose,
  IconCopy,
  IconCredit,
  IconCut,
  IconDownload,
  IconKey,
  IconLink,
  IconMore,
  IconTrash,
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
}: {
  card: StoryboardCard | null
  onClose: () => void
  onOpenClipEditor: () => void
}) {
  const document = useEditor((s) => s.document)
  const commit = useEditor((s) => s.commit)
  const commitWith = useEditor((s) => s.commitWith)
  const pushAgentRef = useEditor((s) => s.pushAgentRef)
  const toast = useEditor((s) => s.toast)
  const [referenceNodeId, setReferenceNodeId] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<ImageTool>(null)
  const moreMenu = useMenuAnchor()
  const gridMenu = useMenuAnchor()

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

  if (!card) return null

  const node = document.nodes.find((n) => n.id === card.nodeId)
  const artifact = card.artifact
  const model = node?.data.modelId ? MODELS_BY_ID.get(node.data.modelId) : null
  const cost = node?.data.modelId ? quoteCredits(node.data.modelId, node.data.output).credits : 0

  const referencedNode = referenceNodeId ? document.nodes.find((n) => n.id === referenceNodeId) : null

  const openReference = (reference: StoryboardReference) => {
    if (reference.origin === 'node') setReferenceNodeId(reference.refId)
  }

  return (
    <aside
      data-testid="media-detail"
      className="absolute right-0 top-0 z-40 flex h-full w-[420px] flex-col border-l border-ink-100 bg-surface shadow-[var(--shadow-panel)]"
    >
      <header className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
        <span className="truncate text-[14px] font-semibold text-ink-900">
          {referencedNode ? referencedNode.name : card.nodeName}
        </span>
        {referencedNode && (
          <button
            type="button"
            onClick={() => setReferenceNodeId(null)}
            className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-500"
          >
            返回
          </button>
        )}
        <button
          type="button"
          onClick={(e) => moreMenu.openFrom(e, 'point')}
          aria-label="更多操作"
          className="ml-auto rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-ink-50"
        >
          <IconMore size={16} />
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
        {referencedNode ? (
          // Source node detail: prompt, model, params and pending status.
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl" style={{ aspectRatio: '16 / 9' }}>
              {(referencedNode.data.artifacts ?? [])[0] ? (
                <ArtifactPreview
                  url={(referencedNode.data.artifacts ?? [])[0].url}
                  kind={(referencedNode.data.artifacts ?? [])[0].kind}
                  poster={(referencedNode.data.artifacts ?? [])[0].thumbnailUrl}
                  alt={referencedNode.name}
                  controls
                />
              ) : (
                <MediaPlaceholder kind="image" />
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
        ) : (
          <>
            <div className="overflow-hidden rounded-xl bg-ink-100" style={{ aspectRatio: '16 / 9' }}>
              {artifact ? (
                <ArtifactPreview
                  url={artifact.url}
                  kind={artifact.kind}
                  poster={artifact.thumbnailUrl}
                  alt={card.nodeName}
                  controls
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

            {/* Image tools operate on a generated still and never edit it in place. */}
            {card.column === 'image' && artifact && (
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

            {card.references.length > 0 && (
              <Section title={`参考元素（${card.references.length}）`}>
                <div className="grid grid-cols-4 gap-2">
                  {card.references.map((reference) => (
                    <button
                      key={reference.id}
                      type="button"
                      data-testid={`reference-${reference.refId}`}
                      onClick={() => openReference(reference)}
                      className="overflow-hidden rounded-lg ring-1 ring-ink-100 transition-shadow hover:shadow-[var(--shadow-float)]"
                    >
                      <div className="aspect-square bg-ink-100">
                        {reference.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={reference.thumbnailUrl} alt={reference.label} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="truncate p-1 text-[9px] text-ink-500">{reference.label}</div>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {node?.data.prompt && (
              <Section title="提示词">
                <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-ink-600">{node.data.prompt}</p>
              </Section>
            )}

            {/* Re-running a shot must be possible without leaving the storyboard. */}
            {card.column === 'video' && node && (
              <VideoRegenerationControls
                node={node}
                onPatch={(patch) =>
                  void commit(
                    [{ op: 'updateNode', nodeId: node.id, patch: { data: { ...node.data, ...patch } } }],
                    '调整视频参数',
                  )
                }
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

      {!referencedNode && node && (
        <footer className="border-t border-ink-100 p-3">
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
                  id: 'duplicate',
                  label: '创建副本',
                  icon: <IconCopy size={14} />,
                  onSelect: () => toast('已在工作流中创建副本', 'success'),
                },
                {
                  id: 'download',
                  label: '下载',
                  icon: <IconDownload size={14} />,
                  disabled: !artifact,
                  disabledReason: '没有生成结果',
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
                    onClose()
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
  onPatch: (patch: Partial<WorkflowNode['data']>) => void
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
    if (!node.data.modelId) return
    onPatch({
      output: normalizeOutputForModel(
        node.data.modelId,
        { ...output, ...patch },
        availableVideoModes(document, node.id),
      ),
    })
  }

  const selectModel = (nextModel: ModelDefinition) => {
    onPatch({
      modelId: nextModel.id,
      output: normalizeOutputForModel(
        nextModel.id,
        output,
        availableVideoModes(document, node.id, nextModel.id),
      ),
    })
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
                onSelect: () => onPatch({ extra: { ...node.data.extra, cameraMove: move.id } }),
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
                onSelect: () => onPatch({ extra: { ...node.data.extra, effect: preset.id } }),
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
