'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listLifecycleAssets } from '@/api/assets'
import { ASSET_AVAILABILITY_LABELS, ASSET_LIFECYCLE_REASON_LABELS, type AssetLifecycle } from '@/domain/assets'
import { MODELS_BY_ID } from '@/domain/models'
import {
  filterVideoCards,
  projectStoryboard,
  reconcileStoryboardExpandedColumn,
  VIDEO_FILTER_LABELS,
  type StoryboardCard,
  type VideoFilter,
} from '@/domain/storyboard'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { Menu, useMenuAnchor } from '../ui/Menu'
import { EmptyState } from '../ui/controls'
import {
  IconAudio,
  IconChevronDown,
  IconCollapse,
  IconCut,
  IconExpand,
  IconImage,
  IconText,
  IconVideo,
} from '../icons'
import { ArtifactPreview, MediaPlaceholder } from '../canvas/node-visuals'
import {
  generationStatusLabel,
  latestJobForNode,
  mediaAspectRatio,
  regenerationStatusForJob,
  MediaDetailDrawer,
} from './MediaDetailDrawer'
import { ClipEditor } from './ClipEditor'
import type { GenerationJob } from '@/domain/types'

type ExpandedColumn = 'image' | 'video' | null

const STORYBOARD_COLUMN_MIN_WIDTH = 280
const STORYBOARD_COLUMN_TRACK = `minmax(${STORYBOARD_COLUMN_MIN_WIDTH}px, 1fr)`

/** Keep media columns usable at compact widths; the grid can then scroll instead of crushing controls. */
export function getStoryboardGridTemplate(hasLeftRail: boolean, mediaColumnCount: number): string {
  const mediaColumns = Math.max(0, Math.min(2, mediaColumnCount))
  if (hasLeftRail) {
    return [
      `minmax(${STORYBOARD_COLUMN_MIN_WIDTH}px, 33.38%)`,
      ...Array.from({ length: mediaColumns }, () => STORYBOARD_COLUMN_TRACK),
    ].join(' ')
  }
  if (mediaColumns === 2) return `repeat(2, ${STORYBOARD_COLUMN_TRACK})`
  return STORYBOARD_COLUMN_TRACK
}

/**
 * Storyboard.
 *
 * This is a projection, never a second document: every card resolves back to a
 * node id, and every reference chip traces to the node that produced it. That
 * is what lets 参考元素 → 源节点 → 添加到对话 work without a parallel store.
 */
export function StoryboardView({
  onLocateNode,
  onDuplicateNode,
}: {
  /** Switch back to the workflow and centre the matching node. */
  onLocateNode: (nodeId: string) => void
  /** Duplicate the projected card in the source workflow document. */
  onDuplicateNode: (nodeId: string) => void | Promise<void>
}) {
  const document = useEditor((s) => s.document)
  const jobs = useEditor((s) => s.jobs)
  const [videoFilter, setVideoFilter] = useState<VideoFilter>('all')
  const [expanded, setExpanded] = useState<ExpandedColumn>(null)
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null)
  const [clipEditorOpen, setClipEditorOpen] = useState(false)
  const [assetLifecycleById, setAssetLifecycleById] = useState<Record<string, AssetLifecycle>>({})

  const filterMenu = useMenuAnchor()

  const reloadAssetLifecycles = useCallback(async () => {
    try {
      const result = await listLifecycleAssets({ visibility: 'all' })
      setAssetLifecycleById(Object.fromEntries(result.assets.map((asset) => [asset.id, asset.lifecycle])))
    } catch {
      // A lifecycle lookup failure never removes a storyboard card. The
      // document continues to render with a conservative active fallback.
    }
  }, [])

  useEffect(() => {
    void reloadAssetLifecycles()
    const onLifecycleChange = () => void reloadAssetLifecycles()
    window.addEventListener('kokoro:asset-lifecycle-changed', onLifecycleChange)
    return () => window.removeEventListener('kokoro:asset-lifecycle-changed', onLifecycleChange)
  }, [reloadAssetLifecycles])

  const projection = useMemo(
    () => projectStoryboard(
      document,
      (modelId) => (modelId ? MODELS_BY_ID.get(modelId)?.label ?? null : null),
      (assetId) => assetLifecycleById[assetId] ?? null,
    ),
    [assetLifecycleById, document],
  )

  const videoCards = filterVideoCards(projection.video, videoFilter)
  const effectiveExpanded = reconcileStoryboardExpandedColumn(expanded, projection)
  const allCards = useMemo(
    () => [...projection.audio, ...projection.text, ...projection.image, ...projection.video],
    [projection],
  )
  // Keep only the node identity in UI state. The selected card is re-projected
  // from the workflow document so terminal job updates and undo/reload are
  // visible in an already-open drawer.
  const detail = detailNodeId ? allCards.find((card) => card.nodeId === detailNodeId) ?? null : null
  const hasLeftRail = projection.audio.length > 0 || projection.text.length > 0
  const showImage = projection.image.length > 0 && effectiveExpanded !== 'video'
  const showVideo = projection.video.length > 0 && effectiveExpanded !== 'image'
  const mediaColumnCount = Number(showImage) + Number(showVideo)

  const gridTemplateColumns = getStoryboardGridTemplate(hasLeftRail, mediaColumnCount)

  const openClipEditor = useCallback(() => {
    setDetailNodeId(null)
    setClipEditorOpen(true)
  }, [])

  const closeClipEditor = useCallback(() => {
    setClipEditorOpen(false)
    window.requestAnimationFrame(() => {
      globalThis.document.querySelector<HTMLElement>('[data-testid="open-clip-editor"]')?.focus()
    })
  }, [])

  useEffect(() => {
    if (expanded !== effectiveExpanded) setExpanded(effectiveExpanded)
  }, [effectiveExpanded, expanded])

  if (clipEditorOpen) {
    return <ClipEditor open onClose={closeClipEditor} />
  }

  return (
    <div
      className="thin-scrollbar relative grid h-full min-w-0 gap-3 overflow-x-auto overflow-y-hidden px-4 pb-4 pt-[72px] max-[1100px]:pt-28"
      data-testid="storyboard-view"
      style={{ gridTemplateColumns }}
    >
      {hasLeftRail && mediaColumnCount === 2 && (
        <div
          data-testid="storyboard-scroll-hint"
          aria-hidden="true"
          className="pointer-events-none absolute bottom-20 left-1/2 z-10 hidden -translate-x-1/2 rounded-full bg-ink-900/80 px-2.5 py-1 text-[10px] text-white/80 shadow-[var(--shadow-float)] max-[900px]:flex"
        >
          左右滑动查看更多
        </div>
      )}

      {projection.isEmpty && (
        <div data-testid="storyboard-empty" className="col-span-full flex min-h-0 items-center justify-center">
          <EmptyState
            icon={<IconImage size={28} />}
            title="故事板还是空的"
            description="在工作流中创建图片、视频、音频或文本节点后，它们会出现在这里。"
          />
        </div>
      )}

      {/* Audio and text share one responsive column and survive media expansion. */}
      {hasLeftRail && (
        <div data-testid="storyboard-left-rail" className="flex min-w-[280px] flex-col gap-3">
          {projection.audio.length > 0 && (
            <ColumnShell
              title="音频"
              icon={<IconAudio size={14} />}
              testId="storyboard-audio"
              className={projection.text.length > 0 ? 'h-[152px]' : 'h-full'}
              grow={false}
            >
              <div className="space-y-2.5">
                {projection.audio.map((card) => (
                  <button
                    key={card.nodeId}
                    type="button"
                    data-testid={`storyboard-card-${card.nodeId}`}
                    onClick={() => setDetailNodeId(card.nodeId)}
                    className="flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors hover:bg-ink-50"
                  >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-400">
                      <IconAudio size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-ink-700">{card.nodeName}</span>
                      {card.degradation ? (
                        <span data-testid={`storyboard-degradation-${card.nodeId}`} className="block text-[10px] text-danger">{ASSET_AVAILABILITY_LABELS[card.degradation.availability]} · {ASSET_LIFECYCLE_REASON_LABELS[card.degradation.reason]}</span>
                      ) : card.durationLabel ? (
                        <span className="block text-[10px] text-ink-400">{card.durationLabel}</span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </ColumnShell>
          )}

          {projection.text.length > 0 && (
            <ColumnShell title="文本" icon={<IconText size={14} />} testId="storyboard-text">
              <div className="space-y-1">
                {projection.text.map((card) => (
                  <button
                    key={card.nodeId}
                    type="button"
                    data-testid={`storyboard-card-${card.nodeId}`}
                    onClick={() => setDetailNodeId(card.nodeId)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-ink-50"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-400">
                      <IconText size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-ink-700">{card.nodeName}</span>
                      {card.degradation ? (
                        <span data-testid={`storyboard-degradation-${card.nodeId}`} className="mt-0.5 block truncate text-[10px] text-danger">{ASSET_AVAILABILITY_LABELS[card.degradation.availability]} · {ASSET_LIFECYCLE_REASON_LABELS[card.degradation.reason]}</span>
                      ) : card.textContent ? (
                        <span className="mt-0.5 block truncate text-[10px] text-ink-400">{card.textContent}</span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </ColumnShell>
          )}
        </div>
      )}

      {/* Image column */}
      {showImage && (
        <ColumnShell
          title="图片"
          icon={<IconImage size={14} />}
          testId="storyboard-image"
          actions={
            <button
              type="button"
              data-testid="expand-image"
              onClick={() => setExpanded(effectiveExpanded === 'image' ? null : 'image')}
              className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
              aria-label={effectiveExpanded === 'image' ? '收起图片列' : '展开图片列'}
            >
              {effectiveExpanded === 'image' ? <IconCollapse size={15} /> : <IconExpand size={15} />}
            </button>
          }
        >
          <MediaGrid
            cards={projection.image}
            dense={effectiveExpanded === 'image'}
            kind="image"
            jobs={jobs}
            onOpen={(card) => setDetailNodeId(card.nodeId)}
          />
        </ColumnShell>
      )}

      {/* Video column */}
      {showVideo && (
        <ColumnShell
          title="视频"
          icon={<IconVideo size={14} />}
          testId="storyboard-video"
          actions={
            <>
              <button
                type="button"
                data-testid="video-filter"
                onClick={(e) => filterMenu.openFrom(e)}
                className="flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-[12px] text-ink-500 transition-colors hover:bg-ink-50"
              >
                {VIDEO_FILTER_LABELS[videoFilter]}
                <IconChevronDown size={12} />
              </button>
              <button
                type="button"
                data-testid="expand-video"
                onClick={() => setExpanded(effectiveExpanded === 'video' ? null : 'video')}
                className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
                aria-label={effectiveExpanded === 'video' ? '收起视频列' : '展开视频列'}
              >
                {effectiveExpanded === 'video' ? <IconCollapse size={15} /> : <IconExpand size={15} />}
              </button>
            </>
          }
        >
          {videoCards.length === 0 ? (
            <EmptyState
              compact
              title={videoFilter === 'all' ? '暂无视频节点' : `没有属于「${VIDEO_FILTER_LABELS[videoFilter]}」的内容`}
            />
          ) : (
            <MediaGrid
              cards={videoCards}
              dense={effectiveExpanded === 'video'}
              kind="video"
              jobs={jobs}
              onOpen={(card) => setDetailNodeId(card.nodeId)}
            />
          )}
        </ColumnShell>
      )}

      {/* Clip editor entry pinned bottom-right */}
      <button
        type="button"
        data-testid="open-clip-editor"
        onClick={openClipEditor}
        className="absolute bottom-5 right-5 z-30 flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-full bg-surface shadow-[var(--shadow-panel)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <IconCut size={18} className="text-ink-700" />
        <span className="text-[10px] text-ink-500">剪辑</span>
      </button>

      {filterMenu.anchor && (
        <Menu
          anchor={filterMenu.anchor}
          onClose={filterMenu.close}
          align="end"
          width={140}
          sections={[
            {
              items: (['all', 'final', 'clip'] as VideoFilter[]).map((filter) => ({
                id: filter,
                label: VIDEO_FILTER_LABELS[filter],
                checked: videoFilter === filter,
                onSelect: () => setVideoFilter(filter),
              })),
            },
          ]}
        />
      )}

      <MediaDetailDrawer
        card={detail}
        onClose={() => setDetailNodeId(null)}
        onOpenClipEditor={openClipEditor}
        onLocateNode={onLocateNode}
        onDuplicateNode={onDuplicateNode}
      />
    </div>
  )
}

function ColumnShell({
  title,
  icon,
  children,
  actions,
  className,
  testId,
  grow = true,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  actions?: React.ReactNode
  className?: string
  testId?: string
  grow?: boolean
}) {
  return (
    <section
      data-testid={testId}
      className={cn(
        'flex min-w-[280px] flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-ink-100',
        grow ? 'flex-1' : 'shrink-0',
        className,
      )}
    >
      <header className="flex items-center gap-1.5 px-4 py-3">
        <span className="text-ink-400">{icon}</span>
        <h2 className="text-[13px] font-semibold text-ink-900">{title}</h2>
        <div className="ml-auto flex items-center gap-0.5">{actions}</div>
      </header>
      <div className="thin-scrollbar flex-1 overflow-y-auto px-4 pb-4">{children}</div>
    </section>
  )
}

function MediaGrid({
  cards,
  dense,
  kind,
  jobs,
  onOpen,
}: {
  cards: StoryboardCard[]
  dense: boolean
  kind: 'image' | 'video'
  jobs: GenerationJob[]
  onOpen: (card: StoryboardCard) => void
}) {
  if (dense) {
    // Expanded columns switch from vertical cards to a denser thumbnail grid.
    return (
      <div className="grid grid-cols-4 gap-3">
        {cards.flatMap((card) =>
          (card.artifacts.length > 0 ? card.artifacts : [null]).map((artifact, index) => (
            <button
              key={`${card.nodeId}-${index}`}
              type="button"
              draggable
              onDragStart={(event) => setReferenceDragData(event, card)}
              onClick={() => onOpen(card)}
              data-testid={`storyboard-card-${card.nodeId}`}
              className="overflow-hidden rounded-xl text-left ring-1 ring-ink-100 transition-shadow hover:shadow-[var(--shadow-float)]"
            >
              <div style={{ aspectRatio: mediaAspectRatio(card) }}>
                {artifact && !card.degradation ? (
                  <ArtifactPreview
                    url={artifact.url}
                    kind={artifact.kind}
                    poster={artifact.thumbnailUrl}
                    alt={card.nodeName}
                    className="h-full w-full object-contain"
                  />
                ) : card.degradation ? (
                  <StoryboardDegradationNotice card={card} compact />
                ) : (
                  <MediaPlaceholder kind={kind} />
                )}
              </div>
              <div className="truncate px-2 py-1.5 text-[11px] text-ink-600">{card.nodeName}</div>
              <StoryboardJobStatus card={card} jobs={jobs} compact />
            </button>
          )),
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {cards.map((card) => (
        <div
          key={card.nodeId}
          draggable
          onDragStart={(event) => setReferenceDragData(event, card)}
        >
          <div className="mb-1.5 text-[11px] text-ink-400">{card.nodeName}</div>
          <button
            type="button"
            data-testid={`storyboard-card-${card.nodeId}`}
            onClick={() => onOpen(card)}
            className="block w-full overflow-hidden rounded-xl bg-ink-100 text-left transition-shadow hover:shadow-[var(--shadow-float)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            style={{ aspectRatio: mediaAspectRatio(card) }}
          >
            {card.artifact && !card.degradation ? (
              <ArtifactPreview
                url={card.artifact.url}
                kind={card.artifact.kind}
                poster={card.artifact.thumbnailUrl}
                alt={card.nodeName}
                className="h-full w-full object-contain"
              />
            ) : card.degradation ? (
              <StoryboardDegradationNotice card={card} />
            ) : (
              <MediaPlaceholder kind={kind} />
            )}
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {card.modelLabel && (
              <span className="rounded-md bg-ink-100 px-1.5 py-1 text-[10px] text-ink-500">
                {card.modelLabel}
              </span>
            )}
            {card.dimensions && <span className="text-[10px] text-ink-400">{card.dimensions}</span>}
            {card.durationLabel && <span className="text-[10px] text-ink-400">{card.durationLabel}</span>}
          </div>
          <StoryboardJobStatus card={card} jobs={jobs} />
          {card.references.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-ink-100 pt-2">
              {card.references.map((ref) => (
                <span
                  key={ref.id}
                  className={cn('flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-ink-100', ref.degradation && 'ring-1 ring-danger/50 opacity-70')}
                  title={ref.degradation ? `${ref.label}：${ASSET_LIFECYCLE_REASON_LABELS[ref.degradation.reason]}` : ref.label}
                >
                  {ref.thumbnailUrl && !ref.degradation ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ref.thumbnailUrl} alt={ref.label} className="h-full w-full object-cover" />
                  ) : (
                    <IconText size={13} className="text-ink-400" />
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function StoryboardDegradationNotice({ card, compact = false }: { card: StoryboardCard; compact?: boolean }) {
  if (!card.degradation) return null
  const { availability, reason } = card.degradation
  return (
    <div
      data-testid={`storyboard-degradation-${card.nodeId}`}
      className={cn('flex h-full w-full flex-col items-center justify-center gap-1 bg-danger/8 px-3 text-center text-danger', compact && 'text-[10px]')}
    >
      <span className="text-[12px] font-medium">{ASSET_AVAILABILITY_LABELS[availability]}</span>
      <span className="max-w-[220px] text-[10px] leading-relaxed text-danger/80">{ASSET_LIFECYCLE_REASON_LABELS[reason]}</span>
      {card.degradation.assetId && availability === 'recoverable' && <span className="text-[10px] text-danger/80">打开详情后可恢复资产</span>}
    </div>
  )
}

function setReferenceDragData(event: React.DragEvent, card: StoryboardCard) {
  const payload = JSON.stringify({
    origin: 'node',
    refId: card.nodeId,
    kind: card.column === 'video' ? 'video' : card.column,
    label: card.nodeName,
    thumbnailUrl: card.artifact?.thumbnailUrl ?? null,
  })
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-nova-reference', payload)
  event.dataTransfer.setData('text/plain', card.nodeId)
}

function StoryboardJobStatus({
  card,
  jobs,
  compact = false,
}: {
  card: StoryboardCard
  jobs: GenerationJob[]
  compact?: boolean
}) {
  const job = latestJobForNode(jobs, card.nodeId)
  if (!job) return null
  const state = regenerationStatusForJob(job)
  if (state === 'ready' || state === 'succeeded') return null

  const tone = state === 'in_flight' ? 'text-running' : state === 'failed' ? 'text-danger' : state === 'compliance_blocked' ? 'text-amber-700' : 'text-ink-500'
  return (
    <div
      data-testid={`storyboard-status-${card.nodeId}`}
      aria-live="polite"
      className={cn('flex items-center gap-1.5 text-[10px]', tone, compact ? 'px-2 pb-2' : 'mt-1')}
    >
      {state === 'in_flight' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-running" />}
      {state === 'failed' && <span className="h-1.5 w-1.5 rounded-full bg-danger" />}
      {state === 'compliance_blocked' && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
      {state !== 'in_flight' && state !== 'failed' && state !== 'compliance_blocked' && <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />}
      <span>{generationStatusLabel(job.status)}</span>
      {state === 'in_flight' && <span className="tabular-nums">{job.progress}%</span>}
      {(job.status === 'failed' || job.status === 'compliance_blocked') && <span className="ml-auto">点击查看并重试</span>}
    </div>
  )
}
