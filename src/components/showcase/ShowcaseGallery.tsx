'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SnapshotSummary } from '@/domain/publish'
import { api } from '@/lib/api'
import { EmptyState, Spinner } from '../ui/controls'
import { IconImage, IconLayers, IconPlay } from '../icons'

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

  useEffect(() => {
    let cancelled = false
    void api
      .get<{ snapshots: SnapshotSummary[] }>('/api/publish')
      .then((data) => {
        if (cancelled) return
        setSnapshots(data.snapshots)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen bg-surface" data-testid="showcase-gallery">
      <header className="flex items-center justify-between px-8 py-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-900 text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7.5 8 5l6 2.5L20 5v11.5L14 19l-6-2.5L4 19z" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink-900">Kokoro Nova</span>
        </Link>
        <Link
          href="/project"
          className="rounded-full bg-ink-50 px-4 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:bg-ink-100"
        >
          我的项目
        </Link>
      </header>

      <div className="px-8 pb-5">
        <h1 className="text-[17px] font-semibold text-ink-900">公开作品</h1>
        <p className="mt-1 text-[13px] text-ink-500">
          每个作品都是发布那一刻的冻结副本，可以只读浏览它的工作流与故事板。
        </p>
      </div>

      <div className="px-8 pb-16">
        {loading ? (
          <div className="flex justify-center py-20 text-ink-400">
            <Spinner size={22} />
          </div>
        ) : snapshots.length === 0 ? (
          <EmptyState
            icon={<IconPlay size={30} />}
            title="暂无公开作品"
            description="把画布发布之后，作品会出现在这里，任何人都可以浏览它的制作过程。"
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
                  className="group flex flex-col"
                >
                  <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl bg-ink-100 transition-shadow group-hover:shadow-[var(--shadow-float)]">
                    {snapshot.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={snapshot.coverUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <IconImage size={34} className="text-ink-300" />
                    )}
                  </span>
                  <span className="mt-2.5 block truncate text-[13px] text-ink-900">{snapshot.title}</span>
                  {snapshot.summary && (
                    <span className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-500">
                      {snapshot.summary}
                    </span>
                  )}
                  <span className="mt-1 flex items-center gap-2 text-[12px] text-ink-400">
                    {new Date(snapshot.publishedAt).toLocaleDateString('zh-CN')}
                    <span className="flex items-center gap-1">
                      <IconLayers size={12} />
                      {snapshot.nodeCount} 个节点
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            <div className="pt-14 text-center text-[13px] text-ink-300">没有更多了</div>
          </>
        )}
      </div>
    </div>
  )
}
