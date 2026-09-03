'use client'

import { memo, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { NODE_META } from '@/domain/nodes'
import { MODELS_BY_ID, quoteCredits } from '@/domain/models'
import type { GenerationJob, JobStatus, WorkflowNode } from '@/domain/types'
import { cn } from '@/lib/cn'
import { Menu, useMenuAnchor, type MenuSection } from '../ui/Menu'
import { ProgressBar, Spinner } from '../ui/controls'
import {
  IconAudio,
  IconCopy,
  IconCredit,
  IconImage,
  IconKey,
  IconLink,
  IconMore,
  IconPlay,
  IconStop,
  IconText,
  IconTrash,
  IconVideo,
  IconWarning,
} from '../icons'
import { ArtifactPreview, MediaPlaceholder, NODE_ICON, TrySuggestions } from './node-visuals'

export interface NodeCardData extends Record<string, unknown> {
  node: WorkflowNode
  job: GenerationJob | null
  onOpen: (nodeId: string) => void
  onRun: (nodeId: string) => void
  onCancel: (jobId: string) => void
  onDuplicate: (nodeId: string) => void
  onDelete: (nodeId: string) => void
  onToggleKeyElement: (nodeId: string) => void
  onAddToAgent: (nodeId: string) => void
  onSetIntent: (nodeId: string, intent: string) => void
}

const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  awaiting_confirmation: '等待确认',
  queued: '排队中',
  running: '生成中',
  succeeded: '生成完成',
  failed: '生成失败',
  cancelled: '已取消',
  compliance_blocked: '素材合规校验未通过',
}

/**
 * A canvas node.
 *
 * The card is a compact summary — prompt, model, output spec, artifact or
 * placeholder — and the full generator lives in the inspector drawer. That
 * split keeps the graph readable at the 50% zoom the workspace usually sits at.
 */
function NodeCardImpl({ data, selected }: NodeProps) {
  const {
    node,
    job,
    onOpen,
    onRun,
    onCancel,
    onDuplicate,
    onDelete,
    onToggleKeyElement,
    onAddToAgent,
    onSetIntent,
  } = data as NodeCardData

  const meta = NODE_META[node.type]
  const Icon = NODE_ICON[node.type]
  const menu = useMenuAnchor()
  const [hovered, setHovered] = useState(false)

  const artifact = (node.data.artifacts ?? [])[0] ?? null
  const model = node.data.modelId ? MODELS_BY_ID.get(node.data.modelId) : null
  const running = job ? job.status === 'running' || job.status === 'queued' : false
  const awaiting = job?.status === 'awaiting_confirmation'
  const failed = job?.status === 'failed' || job?.status === 'compliance_blocked'
  const cancelled = job?.status === 'cancelled'
  const statusLabel = job ? JOB_STATUS_LABEL[job.status] : null
  const statusTestId = job ? `job-status-${job.id}` : undefined

  const cost = node.data.modelId ? quoteCredits(node.data.modelId, node.data.output).credits : 0

  const menuSections: MenuSection[] = [
    {
      items: [
        {
          id: 'key',
          label: node.keyElement ? '取消关键元素' : '设置关键元素',
          icon: <IconKey size={14} />,
          onSelect: () => onToggleKeyElement(node.id),
        },
        { id: 'duplicate', label: '创建副本', icon: <IconCopy size={14} />, onSelect: () => onDuplicate(node.id) },
        {
          id: 'agent',
          label: '添加到对话',
          icon: <IconLink size={14} />,
          onSelect: () => onAddToAgent(node.id),
        },
      ],
    },
    {
      items: [
        {
          id: 'save-asset',
          label: '保存资产',
          disabled: !artifact,
          disabledReason: '没有生成结果时不可保存',
          onSelect: () => undefined,
        },
        {
          id: 'delete',
          label: '删除',
          icon: <IconTrash size={14} />,
          danger: true,
          onSelect: () => onDelete(node.id),
        },
      ],
    },
  ]

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={() => onOpen(node.id)}
      data-testid={`node-${node.id}`}
      data-node-type={node.type}
      className="group relative"
      style={{ width: node.size.width }}
    >
      {/* Title sits above the card, matching the canvas layout. */}
      <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
        <span className="text-ink-500">
          <Icon size={14} />
        </span>
        <span className="truncate text-[12px] font-medium text-ink-700">{node.name}</span>
        {node.keyElement && (
          <span className="rounded bg-accent-soft px-1 py-px text-[9px] font-medium text-accent-ink">关键</span>
        )}
        <button
          type="button"
          aria-label="更多操作"
          data-testid={`node-more-${node.id}`}
          onClick={(e) => menu.openFrom(e, 'point')}
          className={cn(
            'ml-auto rounded p-0.5 text-ink-400 transition-opacity hover:bg-ink-100 hover:text-ink-700',
            hovered || selected ? 'opacity-100' : 'opacity-0',
          )}
        >
          <IconMore size={14} />
        </button>
      </div>

      <div
        className={cn(
          'relative rounded-2xl bg-surface transition-shadow',
          selected ? 'ring-2 ring-accent' : 'ring-1 ring-ink-200/70',
          running && 'running-ring',
        )}
        style={{ minHeight: node.size.height }}
      >
        <Handle type="target" position={Position.Left} className="connectionindicator" />
        <Handle type="source" position={Position.Right} className="connectionindicator" />

        <div className="flex h-full flex-col p-3">
          <NodeBody
            node={node}
            artifact={artifact}
            running={running}
            job={job}
            onSetIntent={onSetIntent}
            onOpen={onOpen}
          />
        </div>

        {/* Status footer: cost + run control, or progress while running. */}
        {meta.produces && (
          <div className="flex items-center gap-2 border-t border-ink-100 px-3 py-2">
            {running ? (
              <>
                <Spinner size={13} />
                <span data-testid={statusTestId} className="shrink-0 text-[11px] font-medium text-ink-700">
                  {statusLabel}
                </span>
                <span className="text-[11px] text-ink-500">{job?.progress ?? 0}%</span>
                <div className="flex-1">
                  <ProgressBar value={job?.progress ?? 0} />
                </div>
                <button
                  type="button"
                  onClick={() => job && onCancel(job.id)}
                  className="rounded-md p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-danger"
                  aria-label="取消生成"
                >
                  <IconStop size={13} />
                </button>
              </>
            ) : failed ? (
              <>
                <IconWarning size={13} className="text-danger" />
                <span
                  data-testid={statusTestId}
                  title={job.error ?? undefined}
                  className="flex-1 truncate text-[11px] font-medium text-danger"
                >
                  {statusLabel}
                </span>
                <button
                  type="button"
                  onClick={() => onRun(node.id)}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-ink-600 transition-colors hover:bg-ink-100"
                >
                  重试
                </button>
              </>
            ) : cancelled ? (
              <>
                <IconStop size={13} className="text-ink-400" />
                <span data-testid={statusTestId} className="flex-1 text-[11px] font-medium text-ink-500">
                  {statusLabel}
                </span>
                <button
                  type="button"
                  onClick={() => onRun(node.id)}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-ink-600 transition-colors hover:bg-ink-100"
                >
                  重新生成
                </button>
              </>
            ) : (
              <>
                {statusLabel && (
                  <span
                    data-testid={statusTestId}
                    className={cn(
                      'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                      awaiting ? 'bg-running/10 text-running' : 'bg-success/10 text-success',
                    )}
                  >
                    {statusLabel}
                  </span>
                )}
                {model && <span className="truncate text-[11px] text-ink-500">{model.label}</span>}
                <span className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-ink-500">
                  <IconCredit size={12} />
                  {cost}
                </span>
                <button
                  type="button"
                  data-testid={`node-run-${node.id}`}
                  onClick={() => onRun(node.id)}
                  className={cn(
                    'rounded-full p-1.5 transition-colors',
                    awaiting ? 'bg-running text-white' : 'bg-ink-900 text-white hover:opacity-85',
                  )}
                  aria-label={awaiting ? '待确认' : '生成'}
                >
                  <IconPlay size={12} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {menu.anchor && (
        <Menu sections={menuSections} anchor={menu.anchor} onClose={menu.close} />
      )}
    </div>
  )
}

function NodeBody({
  node,
  artifact,
  running,
  job,
  onSetIntent,
  onOpen,
}: {
  node: WorkflowNode
  artifact: WorkflowNode['data']['artifacts'] extends (infer A)[] | undefined ? A | null : never
  running: boolean
  job: GenerationJob | null
  onSetIntent: (nodeId: string, intent: string) => void
  onOpen: (nodeId: string) => void
}) {
  const prompt = node.data.prompt ?? ''

  switch (node.type) {
    case 'text': {
      if (prompt) {
        return (
          <div className="flex-1 overflow-hidden text-[12px] leading-relaxed whitespace-pre-wrap text-ink-700">
            {prompt.length > 220 ? `${prompt.slice(0, 220)}…` : prompt}
          </div>
        )
      }
      return (
        <div className="flex flex-1 flex-col justify-center">
          <TrySuggestions
            items={[
              { icon: <IconText size={14} />, label: '自己编写内容', onClick: () => onOpen(node.id) },
              { icon: <IconVideo size={14} />, label: '文生视频', onClick: () => onSetIntent(node.id, 'text2video') },
              { icon: <IconImage size={14} />, label: '图片反推提示词', onClick: () => onSetIntent(node.id, 'caption') },
              { icon: <IconAudio size={14} />, label: '文字生音乐', onClick: () => onSetIntent(node.id, 'text2music') },
            ]}
          />
        </div>
      )
    }

    case 'image':
    case 'director': {
      return (
        <div className="flex flex-1 flex-col gap-2">
          <div className="relative flex-1 overflow-hidden rounded-xl" style={{ minHeight: 150 }}>
            {artifact ? (
              <ArtifactPreview url={artifact.url} kind="image" alt={node.name} />
            ) : running ? (
              <div className="shimmer h-full w-full rounded-xl" />
            ) : (
              <MediaPlaceholder kind="image" label={job ? '待确认后生成' : '待确认后生成'} />
            )}
          </div>
          {prompt && <p className="line-clamp-2 text-[11px] leading-snug text-ink-500">{prompt}</p>}
        </div>
      )
    }

    case 'video':
    case 'videoComposite': {
      return (
        <div className="flex flex-1 flex-col gap-2">
          <div className="relative flex-1 overflow-hidden rounded-xl bg-ink-100" style={{ minHeight: 140 }}>
            {artifact ? (
              <ArtifactPreview url={artifact.url} kind="video" poster={artifact.thumbnailUrl} alt={node.name} />
            ) : running ? (
              <div className="shimmer h-full w-full rounded-xl" />
            ) : (
              <MediaPlaceholder kind="video" />
            )}
          </div>
          {prompt && <p className="line-clamp-2 text-[11px] leading-snug text-ink-500">{prompt}</p>}
        </div>
      )
    }

    case 'audio': {
      return (
        <div className="flex flex-1 flex-col gap-2">
          {artifact ? (
            <ArtifactPreview url={artifact.url} kind="audio" alt={node.name} />
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-xl bg-ink-50">
              <IconAudio size={26} className="text-ink-300" />
            </div>
          )}
          <p className="line-clamp-3 text-[11px] leading-snug text-ink-500">
            {prompt || '输入要转换为语音的文本'}
          </p>
        </div>
      )
    }

    case 'script':
    case 'scriptLegacy': {
      const shots = (node.data.extra?.shots as unknown[] | undefined) ?? []
      return (
        <div className="flex flex-1 flex-col gap-2.5">
          <div className="flex items-center gap-1.5">
            {['确认镜头', '准备资产', '合成提示词'].map((label, index) => (
              <div key={label} className="flex flex-1 items-center gap-1.5">
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-medium',
                    index === 0 ? 'bg-ink-900 text-white' : 'bg-ink-200 text-ink-500',
                  )}
                >
                  {index + 1}
                </span>
                <span className="truncate text-[10px] text-ink-500">{label}</span>
                {index < 2 && <span className="h-px flex-1 bg-ink-200" />}
              </div>
            ))}
          </div>
          <div className="flex-1 rounded-xl bg-ink-50 p-2.5 text-[11px] leading-relaxed text-ink-500">
            {shots.length > 0 ? `已确认 ${shots.length} 个镜头` : prompt || '剧本生成 / 角色生成 / 自己编写'}
          </div>
        </div>
      )
    }

    case 'style':
    case 'effect': {
      const presetName = (node.data.extra?.presetName as string | undefined) ?? null
      const hue = (node.data.extra?.hue as number | undefined) ?? 220
      return (
        <div className="flex flex-1 flex-col gap-2">
          <div
            className="flex-1 rounded-xl"
            style={{
              background: `linear-gradient(140deg, hsl(${hue} 62% 62%), hsl(${(hue + 45) % 360} 58% 44%))`,
              minHeight: 130,
            }}
          />
          <div className="truncate text-[12px] font-medium text-ink-700">{presetName ?? '未选择'}</div>
        </div>
      )
    }

    case 'assetLibrary': {
      return (
        <div className="flex flex-1 items-center justify-center rounded-xl bg-ink-50 text-[11px] text-ink-400">
          从资产库选择素材
        </div>
      )
    }
  }
}

export const NodeCard = memo(NodeCardImpl)
