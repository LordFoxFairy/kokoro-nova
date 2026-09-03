'use client'

import { useMemo, useState } from 'react'
import { MODELS_BY_ID } from '@/domain/models'
import {
  filterVideoCards,
  projectStoryboard,
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
import { MediaDetailDrawer } from './MediaDetailDrawer'
import { ClipEditor } from './ClipEditor'

type ExpandedColumn = 'image' | 'video' | null

/**
 * Storyboard.
 *
 * This is a projection, never a second document: every card resolves back to a
 * node id, and every reference chip traces to the node that produced it. That
 * is what lets 参考元素 → 源节点 → 添加到对话 work without a parallel store.
 */
export function StoryboardView() {
  const document = useEditor((s) => s.document)
  const [videoFilter, setVideoFilter] = useState<VideoFilter>('all')
  const [expanded, setExpanded] = useState<ExpandedColumn>(null)
  const [detail, setDetail] = useState<StoryboardCard | null>(null)
  const [clipEditorOpen, setClipEditorOpen] = useState(false)

  const filterMenu = useMenuAnchor()

  const projection = useMemo(
    () => projectStoryboard(document, (modelId) => (modelId ? MODELS_BY_ID.get(modelId)?.label ?? null : null)),
    [document],
  )

  const videoCards = filterVideoCards(projection.video, videoFilter)
  const hasLeftRail = projection.audio.length > 0 || projection.text.length > 0
  const showImage = projection.image.length > 0 && expanded !== 'video'
  const showVideo = projection.video.length > 0 && expanded !== 'image'
  const mediaColumnCount = Number(showImage) + Number(showVideo)

  const gridTemplateColumns = hasLeftRail
    ? mediaColumnCount === 2
      ? '33.38% minmax(0, 1fr) minmax(0, 1fr)'
      : mediaColumnCount === 1
        ? '33.38% minmax(0, 1fr)'
        : 'minmax(0, 1fr)'
    : mediaColumnCount === 2
      ? 'repeat(2, minmax(0, 1fr))'
      : 'minmax(0, 1fr)'

  return (
    <div
      className="relative grid h-full gap-3 overflow-x-auto overflow-y-hidden px-4 pb-4 pt-[72px]"
      data-testid="storyboard-view"
      style={{ gridTemplateColumns }}
    >
      {/* Audio and text share one responsive column and survive media expansion. */}
      {hasLeftRail && (
        <div data-testid="storyboard-left-rail" className="flex min-w-0 flex-col gap-3">
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
                    onClick={() => setDetail(card)}
                    className="flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors hover:bg-ink-50"
                  >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-400">
                      <IconAudio size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-ink-700">{card.nodeName}</span>
                      {card.durationLabel && (
                        <span className="block text-[10px] text-ink-400">{card.durationLabel}</span>
                      )}
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
                    onClick={() => setDetail(card)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-ink-50"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-400">
                      <IconText size={14} />
                    </span>
                    <span className="truncate text-[12px] text-ink-700">{card.nodeName}</span>
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
              onClick={() => setExpanded(expanded === 'image' ? null : 'image')}
              className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
              aria-label={expanded === 'image' ? '收起图片列' : '展开图片列'}
            >
              {expanded === 'image' ? <IconCollapse size={15} /> : <IconExpand size={15} />}
            </button>
          }
        >
          <MediaGrid
            cards={projection.image}
            dense={expanded === 'image'}
            kind="image"
            onOpen={setDetail}
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
                onClick={() => setExpanded(expanded === 'video' ? null : 'video')}
                className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
                aria-label={expanded === 'video' ? '收起视频列' : '展开视频列'}
              >
                {expanded === 'video' ? <IconCollapse size={15} /> : <IconExpand size={15} />}
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
            <MediaGrid cards={videoCards} dense={expanded === 'video'} kind="video" onOpen={setDetail} />
          )}
        </ColumnShell>
      )}

      {/* Clip editor entry pinned bottom-right */}
      <button
        type="button"
        data-testid="open-clip-editor"
        onClick={() => setClipEditorOpen(true)}
        className="absolute bottom-5 right-5 z-30 flex flex-col items-center gap-0.5 rounded-2xl bg-surface px-3 py-2 shadow-[var(--shadow-panel)] transition-transform hover:-translate-y-0.5"
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

      <MediaDetailDrawer card={detail} onClose={() => setDetail(null)} onOpenClipEditor={() => setClipEditorOpen(true)} />
      <ClipEditor open={clipEditorOpen} onClose={() => setClipEditorOpen(false)} />
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
        'flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-ink-100',
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
  onOpen,
}: {
  cards: StoryboardCard[]
  dense: boolean
  kind: 'image' | 'video'
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
              onClick={() => onOpen(card)}
              data-testid={`storyboard-card-${card.nodeId}`}
              className="overflow-hidden rounded-xl text-left ring-1 ring-ink-100 transition-shadow hover:shadow-[var(--shadow-float)]"
            >
              <div className="aspect-video">
                {artifact ? (
                  <ArtifactPreview
                    url={artifact.url}
                    kind={artifact.kind}
                    poster={artifact.thumbnailUrl}
                    alt={card.nodeName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <MediaPlaceholder kind={kind} />
                )}
              </div>
              <div className="truncate px-2 py-1.5 text-[11px] text-ink-600">{card.nodeName}</div>
            </button>
          )),
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {cards.map((card) => (
        <div key={card.nodeId} data-testid={`storyboard-card-${card.nodeId}`}>
          <div className="mb-1.5 text-[11px] text-ink-400">{card.nodeName}</div>
          <button
            type="button"
            onClick={() => onOpen(card)}
            className="block w-full overflow-hidden rounded-xl bg-ink-100 transition-shadow hover:shadow-[var(--shadow-float)]"
            style={{ aspectRatio: '16 / 9' }}
          >
            {card.artifact ? (
              <ArtifactPreview
                url={card.artifact.url}
                kind={card.artifact.kind}
                poster={card.artifact.thumbnailUrl}
                alt={card.nodeName}
                className="h-full w-full object-cover"
              />
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
          {card.references.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-ink-100 pt-2">
              {card.references.map((ref) => (
                <span
                  key={ref.id}
                  className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-ink-100"
                  title={ref.label}
                >
                  {ref.thumbnailUrl ? (
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
