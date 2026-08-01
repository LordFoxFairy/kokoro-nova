'use client'

import { useMemo } from 'react'
import type { WorkflowDocument, WorkflowGroup } from '@/domain/types'
import { canConvertToStoryboardGroup } from '@/domain/mutations'
import { cn } from '@/lib/cn'
import { IconGrid, IconGroup, IconDownload, IconPlay, IconToolbox } from '../icons'
import { Tooltip } from '../ui/Tooltip'

export interface GroupBounds {
  group: WorkflowGroup
  x: number
  y: number
  width: number
  height: number
}

const PADDING = 26
const TITLE_SPACE = 34

export function computeGroupBounds(doc: WorkflowDocument): GroupBounds[] {
  return doc.groups
    .map((group) => {
      const members = doc.nodes.filter((n) => group.nodeIds.includes(n.id))
      if (members.length === 0) return null
      const minX = Math.min(...members.map((n) => n.position.x))
      const minY = Math.min(...members.map((n) => n.position.y))
      const maxX = Math.max(...members.map((n) => n.position.x + n.size.width))
      const maxY = Math.max(...members.map((n) => n.position.y + n.size.height))
      return {
        group,
        x: minX - PADDING,
        y: minY - PADDING - TITLE_SPACE,
        width: maxX - minX + PADDING * 2,
        height: maxY - minY + PADDING * 2 + TITLE_SPACE,
      }
    })
    .filter((b): b is GroupBounds => b !== null)
}

/**
 * The painted frames.
 *
 * They pan and zoom with the graph and are stacked *under* ReactFlow's
 * renderer, so a frame tints the canvas but never the cards it surrounds.
 * That also puts them under the pane, which swallows pointer events — so
 * nothing here is clickable and everything that is lives in `GroupChrome`.
 */
export function GroupFrames({
  document: doc,
  selectedGroupId,
}: {
  document: WorkflowDocument
  selectedGroupId: string | null
}) {
  const bounds = useMemo(() => computeGroupBounds(doc), [doc])

  return (
    <>
      {bounds.map(({ group, x, y, width, height }) => {
        const active = group.id === selectedGroupId
        const isStoryboard = group.kind === 'storyboard'

        return (
          <div
            key={group.id}
            style={{ left: x, top: y, width, height }}
            className={cn(
              'absolute rounded-3xl border-2 border-dashed transition-colors',
              isStoryboard
                ? active
                  ? 'border-accent bg-accent-soft/30'
                  : 'border-accent/40 bg-accent-soft/15'
                : active
                  ? 'border-ink-400 bg-ink-100/40'
                  : 'border-ink-300/70 bg-ink-100/25',
            )}
          />
        )
      })}
    </>
  )
}

interface GroupChromeProps {
  document: WorkflowDocument
  selectedGroupId: string | null
  onSelectGroup: (groupId: string) => void
  onRunGroup: (groupId: string) => void
  onUngroup: (groupId: string) => void
  onConvertToStoryboard: (groupId: string) => void
  onAddToToolbox: (groupId: string) => void
  onDownloadGroup: (groupId: string) => void
  onStitch: (groupId: string) => void
  onOpenStoryboardConfig: (groupId: string, anchor: { x: number; y: number }) => void
}

/**
 * Everything a user can click on a group, stacked *over* ReactFlow's renderer
 * because the pane would otherwise eat every one of these events.
 */
export function GroupChrome({
  document: doc,
  selectedGroupId,
  onSelectGroup,
  onRunGroup,
  onUngroup,
  onConvertToStoryboard,
  onAddToToolbox,
  onDownloadGroup,
  onStitch,
  onOpenStoryboardConfig,
}: GroupChromeProps) {
  const bounds = useMemo(() => computeGroupBounds(doc), [doc])

  return (
    <>
      {bounds.map(({ group, x, y, width, height }) => {
        const active = group.id === selectedGroupId
        const isStoryboard = group.kind === 'storyboard'
        const eligibility = canConvertToStoryboardGroup(doc, group.id)

        return (
          <div
            key={group.id}
            data-testid={`group-${group.id}`}
            // The wrapper itself is transparent to the pointer; its children opt
            // in and bubble back up here, so any hit on the group selects it.
            onPointerDown={() => onSelectGroup(group.id)}
            className="pointer-events-none absolute"
            style={{ left: x, top: y, width, height }}
          >
            {frameBands(width, height).map((band, index) => (
              <div key={index} className="pointer-events-auto absolute" style={band} />
            ))}

            <div className="pointer-events-auto absolute left-4 top-2.5 flex items-center gap-1.5">
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
                  isStoryboard ? 'bg-accent text-white' : 'bg-ink-200/80 text-ink-700',
                )}
              >
                {isStoryboard ? <IconGrid size={12} /> : <IconGroup size={12} />}
                {group.name}
              </span>
              {isStoryboard && group.storyboard && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    const rect = e.currentTarget.getBoundingClientRect()
                    onOpenStoryboardConfig(group.id, { x: rect.left, y: rect.bottom + 6 })
                  }}
                  className="rounded-full bg-surface px-2 py-1 text-[10px] text-ink-600 shadow-sm hover:bg-ink-50"
                >
                  {group.storyboard.aspectRatio} · {group.storyboard.grid.rows}×{group.storyboard.grid.cols}
                </button>
              )}
            </div>

            {active && (
              <div
                className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl bg-surface p-1 shadow-[var(--shadow-panel)]"
                style={{ top: height + 10 }}
                data-testid={`group-actions-${group.id}`}
              >
                <GroupAction
                  label="整组执行"
                  icon={<IconPlay size={14} />}
                  onClick={() => onRunGroup(group.id)}
                />
                <GroupAction
                  label="添加到工具箱"
                  icon={<IconToolbox size={14} />}
                  onClick={() => onAddToToolbox(group.id)}
                />
                {!isStoryboard && (
                  <GroupAction
                    label="转分镜组"
                    icon={<IconGrid size={14} />}
                    disabled={!eligibility.ok}
                    disabledReason={eligibility.ok ? undefined : eligibility.reason}
                    testId={`convert-storyboard-${group.id}`}
                    onClick={() => onConvertToStoryboard(group.id)}
                  />
                )}
                {isStoryboard && (
                  <GroupAction
                    label="拼接 2K"
                    icon={<IconGrid size={14} />}
                    testId={`stitch-${group.id}`}
                    onClick={() => onStitch(group.id)}
                  />
                )}
                <GroupAction
                  label="批量下载"
                  icon={<IconDownload size={14} />}
                  onClick={() => onDownloadGroup(group.id)}
                />
                <div className="mx-0.5 h-4 w-px bg-ink-200" />
                <button
                  type="button"
                  onClick={() => onUngroup(group.id)}
                  className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-600 transition-colors hover:bg-ink-50"
                >
                  解组
                </button>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

/**
 * The band between the frame edge and the members' own box.
 *
 * Only this band takes pointer events: covering the middle as well would put an
 * invisible sheet over every node inside the group and make them unclickable.
 */
function frameBands(width: number, height: number) {
  const top = TITLE_SPACE + PADDING
  const bottom = height - PADDING
  return [
    { left: 0, top: 0, width, height: top },
    { left: 0, top: bottom, width, height: PADDING },
    { left: 0, top, width: PADDING, height: bottom - top },
    { left: width - PADDING, top, width: PADDING, height: bottom - top },
  ]
}

function GroupAction({
  label,
  icon,
  onClick,
  disabled,
  disabledReason,
  testId,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  disabledReason?: string
  testId?: string
}) {
  return (
    <Tooltip label={disabled ? (disabledReason ?? label) : label}>
      <button
        type="button"
        disabled={disabled}
        data-testid={testId}
        onClick={onClick}
        className={cn(
          'rounded-lg p-2 transition-colors',
          disabled ? 'cursor-not-allowed text-ink-300' : 'text-ink-600 hover:bg-ink-50',
        )}
        aria-label={label}
      >
        {icon}
      </button>
    </Tooltip>
  )
}
