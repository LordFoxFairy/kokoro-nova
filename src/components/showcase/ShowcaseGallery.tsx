'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SnapshotSummary } from '@/domain/publish'
import { ApiError, api } from '@/lib/api'
import { EmptyState, Spinner } from '../ui/controls'
import { IconImage, IconLayers, IconPlay, IconRefresh } from '../icons'

export type ShowcaseRequestState = 'loading' | 'refreshing' | 'ready' | 'empty' | 'error' | 'stale-error'

export function getShowcaseRequestState({
  loading,
  hasData,
  error,
}: {
  loading: boolean
  hasData: boolean
  error: string | null
}): ShowcaseRequestState {
  if (error) return hasData ? 'stale-error' : 'error'
  if (loading) return hasData ? 'refreshing' : 'loading'
  return hasData ? 'ready' : 'empty'
}

/**
 * Public gallery.
 *
 * Everything here is anonymous-readable by construction: the feed only ever
 * contains frozen snapshots their author listed, so there is no signed-in state
 * to branch on and no editing affordance to hide.
 */
export function ShowcaseGallery() {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void api
      .get<{ snapshots: SnapshotSummary[] }>('/api/publish')
      .then((data) => {
        if (cancelled) return
        setSnapshots(data.snapshots)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof ApiError ? cause.message : '公开作品加载失败，请稍后重试')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const requestState = getShowcaseRequestState({ loading, hasData: snapshots.length > 0, error })
  const retry = () => setReloadToken((token) => token + 1)

  return (
    <div className="min-h-screen bg-surface" data-testid="showcase-gallery" aria-busy={loading}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-5">
        <Link href="/" className="flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-900 text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7.5 8 5l6 2.5L20 5v11.5L14 19l-6-2.5L4 19z" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink-900">Kokoro Nova</span>
        </Link>
        <Link
          href="/project"
          className="rounded-full bg-ink-50 px-4 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:bg-ink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          我的项目
        </Link>
      </header>

      <main className="px-4 pb-16 sm:px-8" aria-labelledby="showcase-title">
      <div className="pb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 id="showcase-title" className="text-[17px] font-semibold text-ink-900">公开作品</h1>
          <div className="text-[12px] text-ink-600" data-testid="showcase-status" role="status" aria-live="polite">
            {requestState === 'loading' ? '正在加载公开作品…' : requestState === 'refreshing' ? '正在刷新公开作品…' : ''}
          </div>
        </div>
        <p className="mt-1 text-[13px] text-ink-600">
          每个作品都是发布那一刻的冻结副本，可以只读浏览它的工作流与故事板。
        </p>
      </div>

      <div aria-busy={loading}>
        {loading && snapshots.length === 0 ? (
          <div className="flex justify-center py-20 text-ink-600" role="status" aria-label="正在加载公开作品">
            <Spinner size={22} />
          </div>
        ) : error && snapshots.length === 0 ? (
          <EmptyState
            icon={<IconPlay size={30} />}
            title="公开作品暂时加载失败"
            description={error}
            action={
              <button
                type="button"
                data-testid="showcase-retry"
                onClick={retry}
                disabled={loading}
                aria-busy={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-wait disabled:bg-ink-200 disabled:text-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <IconRefresh size={14} className={loading ? 'animate-spin' : undefined} />
                {loading ? '重试中…' : '重试'}
              </button>
            }
          />
        ) : error ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-danger/8 px-3.5 py-2.5 text-[12px] text-danger" role="alert">
            <span>刷新失败，仍显示上次成功读取的作品：{error}</span>
            <button
              type="button"
              data-testid="showcase-retry"
              onClick={retry}
              disabled={loading}
              aria-busy={loading}
              className="rounded-lg bg-surface px-3 py-1.5 font-medium text-danger ring-1 ring-danger/20 hover:bg-danger/5 disabled:cursor-wait disabled:text-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
            >
              {loading ? '重试中…' : '重试'}
            </button>
          </div>
        ) : snapshots.length === 0 ? (
          <EmptyState
            icon={<IconPlay size={30} />}
            title="暂无公开作品"
            description="把画布发布之后，作品会出现在这里，任何人都可以浏览它的制作过程。"
            action={
              <Link
                href="/project"
                className="rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                去我的项目
              </Link>
            }
          />
        ) : (
          <>
            <div
              className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-6 gap-y-7"
              data-testid="showcase-grid"
            >
              {snapshots.map((snapshot) => (
                <Link
                  key={snapshot.id}
                  href={`/showcase/${snapshot.id}`}
                  data-testid={`showcase-card-${snapshot.id}`}
                  className="group flex flex-col rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                >
                  <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl bg-ink-100 transition-shadow group-hover:shadow-[var(--shadow-float)]">
                    {snapshot.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={snapshot.coverUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <IconImage size={34} className="text-ink-600" aria-hidden="true" />
                    )}
                  </span>
                  <span className="mt-2.5 block truncate text-[13px] text-ink-900">{snapshot.title}</span>
                  {snapshot.summary && (
                    <span className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-600">
                      {snapshot.summary}
                    </span>
                  )}
                  <span className="mt-1 flex items-center gap-2 text-[12px] text-ink-600">
                    {new Date(snapshot.publishedAt).toLocaleDateString('zh-CN')}
                    <span className="flex items-center gap-1">
                      <IconLayers size={12} />
                      {snapshot.nodeCount} 个节点
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            <div className="pt-14 text-center text-[13px] text-ink-600">没有更多了</div>
          </>
        )}
      </div>
      </main>
    </div>
  )
}
