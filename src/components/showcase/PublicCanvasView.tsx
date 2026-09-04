'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { MODELS_BY_ID } from '@/domain/models'
import { NODE_META } from '@/domain/nodes'
import type { PublishedSnapshot } from '@/domain/publish'
import { projectStoryboard, type StoryboardCard } from '@/domain/storyboard'
import type { WorkflowDocument, WorkflowNode } from '@/domain/types'
import { ApiError, api } from '@/lib/api'
import { cloneShowcaseSnapshot } from '@/api/showcase'
import { cn } from '@/lib/cn'
import { Dialog } from '../ui/Dialog'
import { EmptyState, SegmentedControl, Spinner } from '../ui/controls'
import { ArtifactPreview, MediaPlaceholder, NODE_ICON } from '../canvas/node-visuals'
import {
  IconAudio,
  IconChevronLeft,
  IconCopy,
  IconImage,
  IconRefresh,
  IconStoryboard,
  IconText,
  IconVideo,
  IconWorkflow,
} from '../icons'
import { useShowcaseSession } from './useShowcaseSession'

type PublicView = 'workflow' | 'storyboard'

export type PublicSnapshotState = 'loading' | 'refreshing' | 'readonly' | 'stale-error' | 'unavailable'

export function getPublicSnapshotState({
  loading,
  hasSnapshot,
  error,
}: {
  loading: boolean
  hasSnapshot: boolean
  error: string | null
}): PublicSnapshotState {
  if (loading) return hasSnapshot ? 'refreshing' : 'loading'
  if (error) return hasSnapshot ? 'stale-error' : 'unavailable'
  return hasSnapshot ? 'readonly' : 'unavailable'
}

/**
 * Read-only viewing of a published snapshot.
 *
 * The two projections are the same two the editor has — the storyboard side
 * calls the very same `projectStoryboard`, because a second projection would be
 * a second definition of what the document means.
 *
 * Read-only is implemented, not merely styled: the editable canvas is never
 * mounted, so there is no run action, no inspector, no drag and no connection
 * gesture to disable in the first place. The workflow side is a static layout
 * driven by each node's stored position.
 */
export function PublicCanvasView({ snapshotId, onClose }: { snapshotId: string; onClose?: () => void }) {
  const [snapshot, setSnapshot] = useState<PublishedSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<PublicView>('workflow')
  const [cloneGateOpen, setCloneGateOpen] = useState(false)
  const [cloneConfirmOpen, setCloneConfirmOpen] = useState(false)
  const [cloneBusy, setCloneBusy] = useState(false)
  const [cloneError, setCloneError] = useState<string | null>(null)
  const [cloneResult, setCloneResult] = useState<{ projectId: string; canvasId: string } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const sessionMode = useShowcaseSession()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void api
      .get<{ snapshot: PublishedSnapshot }>(`/api/publish/${snapshotId}`)
      .then((data) => {
        if (!cancelled) setSnapshot(data.snapshot)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        // A revoked work answers 404 exactly like a missing one, so both land in
        // the same unavailable state — as they should.
        setError(cause instanceof ApiError ? cause.message : '作品加载失败，请稍后重试')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [snapshotId, reloadToken])

  const retry = () => setReloadToken((token) => token + 1)
  const requestState = getPublicSnapshotState({ loading, hasSnapshot: Boolean(snapshot), error })

  const openClone = () => {
    if (!snapshot || loading) return
    setCloneError(null)
    if (sessionMode === 'anonymous') {
      setCloneGateOpen(true)
      return
    }
    if (sessionMode === 'authenticated') {
      setCloneConfirmOpen(true)
      return
    }
    setCloneError('暂时无法确认登录状态，请稍后重试')
  }

  const confirmClone = async () => {
    if (!snapshot || cloneBusy) return
    setCloneBusy(true)
    setCloneError(null)
    try {
      const copy = await cloneShowcaseSnapshot(snapshot.id)
      setCloneConfirmOpen(false)
      setCloneResult({ projectId: copy.project.id, canvasId: copy.canvas.id })
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setCloneConfirmOpen(false)
        setCloneGateOpen(true)
        return
      }
      setCloneError(cause instanceof Error ? cause.message : '复制项目失败，请稍后重试')
    } finally {
      setCloneBusy(false)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-canvas" data-testid="public-canvas-view" aria-busy={loading}>
      <header className="flex shrink-0 items-center gap-3 bg-surface px-5 py-3 shadow-[var(--shadow-float)]">
        {onClose ? (
          <button
            type="button"
            data-testid="public-process-close"
            onClick={onClose}
            className="flex shrink-0 items-center gap-1 text-[13px] text-ink-600 transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconChevronLeft size={15} /> 返回作品
          </button>
        ) : (
          <Link
            href="/showcase"
            className="flex shrink-0 items-center gap-1 text-[13px] text-ink-600 transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconChevronLeft size={15} /> 公开作品
          </Link>
        )}
        <span className="h-4 w-px shrink-0 bg-ink-200" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-ink-900">
            {snapshot?.title ?? (loading ? '加载中…' : '作品不可用')}
          </div>
          <div className="truncate text-[11px] text-ink-600" data-testid="public-snapshot-status" role="status" aria-live="polite">
            {snapshot
              ? requestState === 'refreshing'
                ? '正在刷新只读预览，当前仍显示已发布副本…'
                : requestState === 'stale-error'
                  ? '刷新失败，当前仍显示已发布副本'
                  : `发布于 ${new Date(snapshot.publishedAt).toLocaleDateString('zh-CN')} · 只读预览，内容已在发布时冻结`
              : loading ? '正在加载只读预览…' : error ? '作品暂时不可用' : '只读预览'}
          </div>
        </div>

        {snapshot && (
          <SegmentedControl
            size="sm"
            value={view}
            onChange={setView}
            options={[
              {
                value: 'workflow',
                testId: 'public-view-workflow',
                label: (
                  <>
                    <IconWorkflow size={13} /> 工作流
                  </>
                ),
              },
              {
                value: 'storyboard',
                testId: 'public-view-storyboard',
                label: (
                  <>
                    <IconStoryboard size={13} /> 故事板
                  </>
                ),
              },
            ]}
          />
        )}

        {/* Present but gated: the reason is shown on click rather than hidden
            behind a disabled control the reader cannot interrogate. */}
        <button
          type="button"
          data-testid="clone-project"
          title={snapshot ? '复制作品到我的项目' : '作品加载完成后才能复制项目'}
          aria-label={snapshot ? '复制作品到我的项目' : '作品加载完成后才能复制项目'}
          onClick={openClone}
          disabled={!snapshot || loading || sessionMode === 'loading'}
          aria-busy={loading || sessionMode === 'loading'}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <IconCopy size={14} /> 复制项目
        </button>
      </header>

      <main className="min-h-0 flex-1 p-3.5" aria-busy={loading}>
        {loading && !snapshot ? (
          <div className="flex h-full items-center justify-center text-ink-600" role="status" aria-label="正在加载只读预览">
            <Spinner size={22} />
          </div>
        ) : !snapshot ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<IconImage size={30} />}
              title="作品不可用"
              description={error ?? '这个作品可能已被作者下架，或者链接不再有效。'}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    data-testid="public-snapshot-retry"
                    onClick={retry}
                    disabled={loading}
                    aria-busy={loading}
                    className="rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-wait disabled:bg-ink-200 disabled:text-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {loading ? '重试中…' : '重试'}
                  </button>
                  <Link
                    href="/showcase"
                    className="rounded-lg border border-ink-200 px-3.5 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    浏览其它作品
                  </Link>
                </div>
              }
            />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-3">
            {error && (
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl bg-danger/8 px-3.5 py-2.5 text-[12px] text-danger" role="alert">
                <span>刷新失败，仍显示已发布的只读副本：{error}</span>
                <button
                  type="button"
                  data-testid="public-snapshot-retry"
                  onClick={retry}
                  disabled={loading}
                  aria-busy={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 font-medium text-danger ring-1 ring-danger/20 hover:bg-danger/5 disabled:cursor-wait disabled:text-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
                >
                  <IconRefresh size={13} className={loading ? 'animate-spin' : undefined} />
                  {loading ? '重试中…' : '重试'}
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1">
              {view === 'workflow' ? <StaticWorkflow document={snapshot.document} /> : <StaticStoryboard document={snapshot.document} />}
            </div>
          </div>
        )}
      </main>

      <Dialog
        open={cloneGateOpen}
        onClose={() => setCloneGateOpen(false)}
        title="复制项目需要先登录"
        testId="clone-gate"
        footer={
          <button
            type="button"
            onClick={() => setCloneGateOpen(false)}
            className="rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
          >
            知道了
          </button>
        }
      >
        <div className="space-y-3 text-[13px] leading-relaxed text-ink-600">
          <p>复制会在你自己的空间里创建一份私有副本，因此需要一个账号来承载它——当前站点还没有接入登录，暂时无法复制。</p>
          <p className="text-ink-600">浏览不受影响：这份作品的工作流与故事板都可以完整查看。</p>
        </div>
      </Dialog>

      <Dialog
        open={cloneConfirmOpen}
        onClose={() => !cloneBusy && setCloneConfirmOpen(false)}
        title="复制公开作品"
        testId="showcase-clone-dialog"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCloneConfirmOpen(false)}
              disabled={cloneBusy}
              className="rounded-lg border border-ink-200 px-3.5 py-2 text-[13px] font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="showcase-clone-confirm"
              onClick={() => void confirmClone()}
              disabled={cloneBusy}
              className="rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-85 disabled:opacity-50"
            >
              {cloneBusy ? '正在复制…' : '复制到我的项目'}
            </button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink-600">将创建一个新的私有项目，并通过标准画布 mutation 复制当前公开快照的节点、连线、分组和视图；原作品不会被修改。</p>
        {cloneBusy && <p data-testid="showcase-clone-progress" className="mt-3 text-[12px] text-ink-600" role="status">正在复制冻结的工作流与故事板…</p>}
        {cloneError && <p data-testid="showcase-clone-error" className="mt-3 text-[12px] text-danger" role="alert">{cloneError}</p>}
      </Dialog>

      <Dialog
        open={Boolean(cloneResult)}
        onClose={() => setCloneResult(null)}
        title="已复制到我的项目"
        testId="showcase-clone-success"
        footer={
          cloneResult ? (
            <Link
              data-testid="showcase-clone-open-project"
              href={`/canvas?projectId=${encodeURIComponent(cloneResult.projectId)}&canvasId=${encodeURIComponent(cloneResult.canvasId)}`}
              className="inline-flex rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-85"
            >
              打开副本
            </Link>
          ) : null
        }
      >
        <p className="text-[13px] leading-relaxed text-ink-600">副本已创建完成。后续编辑和生成只会发生在你的新项目中。</p>
      </Dialog>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Workflow — static layout from stored node positions
 * ------------------------------------------------------------------ */

/** Breathing room around the graph so nodes never touch the viewport edge. */
const LAYOUT_PADDING = 80
const GROUP_PADDING = 26

interface Bounds {
  minX: number
  minY: number
  width: number
  height: number
}

function boundsOf(nodes: WorkflowNode[], padding: number): Bounds {
  const minX = Math.min(...nodes.map((n) => n.position.x))
  const minY = Math.min(...nodes.map((n) => n.position.y))
  const maxX = Math.max(...nodes.map((n) => n.position.x + n.size.width))
  const maxY = Math.max(...nodes.map((n) => n.position.y + n.size.height))
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}

function StaticWorkflow({ document }: { document: WorkflowDocument }) {
  const shellRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    // The graph is laid out in document coordinates and then scaled to fit, so
    // the whole work is visible at once without a pan gesture the reader does
    // not have.
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      setViewport({ width: rect.width, height: rect.height })
    })
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  const nodes = document.nodes
  const layout = useMemo(() => (nodes.length ? boundsOf(nodes, LAYOUT_PADDING) : null), [nodes])

  // Both dimensions must be measured before scaling: acting on a half-measured
  // box would flash the graph at the clamp floor on first paint.
  const scale =
    layout && viewport.width > 0 && viewport.height > 0
      ? Math.max(0.12, Math.min(1, viewport.width / layout.width, viewport.height / layout.height))
      : 1

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  return (
    <div
      ref={shellRef}
      data-testid="public-workflow"
      className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-canvas ring-1 ring-ink-100"
    >
      {!layout ? (
        <EmptyState title="这份作品没有节点" description="发布时的画布是空的，没有可以展示的工作流。" />
      ) : (
        <div
          // Nothing inside reacts to the pointer: read-only here means the layer
          // itself is inert, not that each affordance was individually removed.
          className="pointer-events-none relative shrink-0 select-none"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          {document.groups.map((group) => {
            const members = group.nodeIds
              .map((id) => nodeById.get(id))
              .filter((n): n is WorkflowNode => Boolean(n))
            if (members.length === 0) return null
            const box = boundsOf(members, GROUP_PADDING)
            return (
              <div
                key={group.id}
                className="absolute rounded-[22px] border border-dashed border-ink-300 bg-ink-50/50"
                style={{
                  left: box.minX - layout.minX,
                  top: box.minY - layout.minY,
                  width: box.width,
                  height: box.height,
                }}
              >
                <span className="absolute -top-6 left-1 text-[12px] font-medium text-ink-600">{group.name}</span>
              </div>
            )
          })}

          <svg
            width={layout.width}
            height={layout.height}
            className="absolute inset-0"
            aria-hidden="true"
          >
            {document.edges.map((edge) => {
              const source = nodeById.get(edge.source)
              const target = nodeById.get(edge.target)
              if (!source || !target) return null
              const x1 = source.position.x + source.size.width - layout.minX
              const y1 = source.position.y + source.size.height / 2 - layout.minY
              const x2 = target.position.x - layout.minX
              const y2 = target.position.y + target.size.height / 2 - layout.minY
              const bend = Math.max(40, Math.abs(x2 - x1) / 2)
              return (
                <path
                  key={edge.id}
                  d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="var(--color-ink-300)"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              )
            })}
          </svg>

          {nodes.map((node) => (
            <StaticNodeCard
              key={node.id}
              node={node}
              left={node.position.x - layout.minX}
              top={node.position.y - layout.minY}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StaticNodeCard({ node, left, top }: { node: WorkflowNode; left: number; top: number }) {
  const Icon = NODE_ICON[node.type]
  const meta = NODE_META[node.type]
  const artifact = (node.data.artifacts ?? [])[0] ?? null
  const produces = meta.produces

  return (
    <div
      data-testid={`public-node-${node.id}`}
      className="absolute flex flex-col overflow-hidden rounded-[14px] bg-surface shadow-[var(--shadow-node)] ring-1 ring-ink-100"
      style={{ left, top, width: node.size.width, height: node.size.height }}
    >
      <header className="flex shrink-0 items-center gap-2 px-3.5 py-2.5">
        <span className="text-ink-600" aria-hidden="true">
          <Icon size={14} />
        </span>
        <span className="truncate text-[13px] font-medium text-ink-900">{node.name}</span>
        <span className="ml-auto shrink-0 rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-600">
          {meta.label}
        </span>
      </header>
      <div className="min-h-0 flex-1 px-3.5 pb-3.5">
        {artifact ? (
          <ArtifactPreview
            url={artifact.url}
            kind={artifact.kind}
            poster={artifact.thumbnailUrl}
            alt={node.name}
            className="h-full w-full rounded-xl object-cover"
          />
        ) : produces === 'text' || produces === null ? (
          <div className="thin-scrollbar h-full overflow-hidden rounded-xl bg-ink-50 p-2.5 text-[12px] leading-relaxed text-ink-600">
            {node.data.prompt?.trim() || <span className="text-ink-600">暂无内容</span>}
          </div>
        ) : (
          <MediaPlaceholder kind={produces} label="未生成内容" />
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Storyboard — the editor's projection, without the editing affordances
 * ------------------------------------------------------------------ */

function StaticStoryboard({ document }: { document: WorkflowDocument }) {
  const projection = useMemo(
    () =>
      projectStoryboard(document, (modelId) => (modelId ? MODELS_BY_ID.get(modelId)?.label ?? null : null)),
    [document],
  )

  return (
    <div className="flex h-full gap-3.5 overflow-hidden" data-testid="public-storyboard">
      <div className="flex w-[260px] shrink-0 flex-col gap-3.5">
        <Column title="音频" icon={<IconAudio size={14} />} grow={false}>
          {projection.audio.length === 0 ? (
            <EmptyState compact title="暂无音频" />
          ) : (
            <div className="space-y-2.5">
              {projection.audio.map((card) => (
                <div key={card.nodeId} className="rounded-xl p-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-600" aria-hidden="true">
                      <IconAudio size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-ink-700">{card.nodeName}</span>
                      {card.durationLabel && (
                        <span className="block text-[10px] text-ink-600">{card.durationLabel}</span>
                      )}
                      {card.modelLabel && (
                        <span className="block truncate text-[10px] text-ink-600">{card.modelLabel}</span>
                      )}
                    </span>
                  </div>
                  {/* The player sits below the row rather than inside the 56px
                      tile, where its controls would be unusable. */}
                  {card.artifact && (
                    <audio src={card.artifact.url} controls preload="metadata" className="mt-2 w-full" />
                  )}
                </div>
              ))}
            </div>
          )}
        </Column>

        <Column title="文本" icon={<IconText size={14} />}>
          {projection.text.length === 0 ? (
            <EmptyState compact title="暂无文本" />
          ) : (
            <div className="space-y-1">
              {projection.text.map((card) => (
                <div key={card.nodeId} className="flex items-center gap-2 rounded-lg px-2 py-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600" aria-hidden="true">
                    <IconText size={14} />
                  </span>
                  <span className="truncate text-[12px] text-ink-700">{card.nodeName}</span>
                </div>
              ))}
            </div>
          )}
        </Column>
      </div>

      <Column title="图片" icon={<IconImage size={14} />} className="flex-1">
        {projection.image.length === 0 ? (
          <EmptyState compact title="暂无图片" />
        ) : (
          <MediaColumn cards={projection.image} kind="image" />
        )}
      </Column>

      <Column title="视频" icon={<IconVideo size={14} />} className="flex-1">
        {projection.video.length === 0 ? (
          <EmptyState compact title="暂无视频" />
        ) : (
          <MediaColumn cards={projection.video} kind="video" />
        )}
      </Column>
    </div>
  )
}

function Column({
  title,
  icon,
  children,
  className,
  grow = true,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
  className?: string
  grow?: boolean
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-ink-100',
        grow ? 'flex-1' : 'shrink-0',
        className,
      )}
    >
      <header className="flex items-center gap-1.5 px-4 py-3">
        <span className="text-ink-600" aria-hidden="true">{icon}</span>
        <h2 className="text-[13px] font-semibold text-ink-900">{title}</h2>
      </header>
      <div className="thin-scrollbar flex-1 overflow-y-auto px-4 pb-4">{children}</div>
    </section>
  )
}

function MediaColumn({ cards, kind }: { cards: StoryboardCard[]; kind: 'image' | 'video' }) {
  return (
    <div className="space-y-4">
      {cards.map((card) => (
        <div key={card.nodeId} data-testid={`public-storyboard-card-${card.nodeId}`}>
          <div className="mb-1.5 text-[11px] text-ink-600">{card.nodeName}</div>
          <div
            className="block w-full overflow-hidden rounded-xl bg-ink-100"
            style={{ aspectRatio: '16 / 9' }}
          >
            {card.artifact ? (
              <ArtifactPreview
                url={card.artifact.url}
                kind={card.artifact.kind}
                poster={card.artifact.thumbnailUrl}
                alt={card.nodeName}
                controls={kind === 'video'}
                className="h-full w-full object-cover"
              />
            ) : (
              <MediaPlaceholder kind={kind} label="未生成内容" />
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {card.modelLabel && (
              <span className="rounded-md bg-ink-100 px-1.5 py-1 text-[10px] text-ink-600">{card.modelLabel}</span>
            )}
            {card.dimensions && <span className="text-[10px] text-ink-600">{card.dimensions}</span>}
            {card.durationLabel && <span className="text-[10px] text-ink-600">{card.durationLabel}</span>}
          </div>
          {card.references.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-ink-100 pt-2">
              {card.references.map((reference) => (
                <span
                  key={reference.id}
                  title={reference.label}
                  className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-ink-100"
                >
                  {reference.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={reference.thumbnailUrl} alt={reference.label} className="h-full w-full object-cover" />
                  ) : (
                    <IconText size={13} className="text-ink-600" aria-hidden="true" />
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
