'use client'

import { useMemo, useEffect, useState } from 'react'
import Link from 'next/link'
import type { SnapshotSummary } from '@/domain/publish'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { EmptyState, Spinner } from '../ui/controls'
import { IconChevronRight, IconClose, IconImage, IconLayers, IconPlay, IconRefresh, IconSearch } from '../icons'
import { LibTvLogo } from '../shell/LibTvLogo'

/** Categories observed on the public TV Show discovery surface. */
export const SHOWCASE_CATEGORIES = [
  '全部',
  'AI 漫剧精卫计划',
  '广告导演请就位',
  '精选画布',
  '专业影视',
  '短剧漫剧',
  '商业广告',
  '动漫游戏',
  '教育生活',
  'TV 工具箱',
] as const

export type ShowcaseEntry = {
  id: string
  title: string
  summary: string
  coverUrl: string | null
  publishedAt: string
  nodeCount: number
  mediaCount: number
  category: (typeof SHOWCASE_CATEGORIES)[number]
  author: string
  authorTier: string | null
  likeCount: number
}

/**
 * The published-snapshot endpoint predates the public discovery projection.
 * Keep that frozen API intact and derive the small, deterministic set of
 * discovery labels the local fixture needs at the UI boundary.
 */
export function toShowcaseEntry(snapshot: SnapshotSummary): ShowcaseEntry {
  return {
    id: snapshot.id,
    title: snapshot.title,
    summary: snapshot.summary,
    coverUrl: snapshot.coverUrl,
    publishedAt: snapshot.publishedAt,
    nodeCount: snapshot.nodeCount,
    mediaCount: snapshot.mediaCount,
    category: snapshot.mediaCount > 0 ? '专业影视' : '精选画布',
    author: '公开创作者',
    authorTier: null,
    likeCount: 0,
  }
}

export function filterShowcaseEntries(
  entries: ShowcaseEntry[],
  category: ShowcaseEntry['category'],
  query: string,
): { entries: ShowcaseEntry[]; fallback: boolean } {
  const categoryEntries = entries.filter((entry) => category === '全部' || entry.category === category)
  const needle = query.trim().toLocaleLowerCase('zh-CN')
  if (!needle) return { entries: categoryEntries, fallback: false }

  const matches = categoryEntries.filter((entry) =>
    `${entry.title} ${entry.summary} ${entry.author}`.toLocaleLowerCase('zh-CN').includes(needle),
  )
  // The observed page recommends the public collection for an unmatched query
  // instead of replacing the screen with a dead-end empty state.
  return matches.length > 0
    ? { entries: matches, fallback: false }
    : { entries: categoryEntries, fallback: categoryEntries.length > 0 }
}

export function getShowcaseSearchFeedback({
  category,
  query,
  resultCount,
  fallback,
}: {
  category: ShowcaseEntry['category']
  query: string
  resultCount: number
  fallback: boolean
}): string {
  const normalizedQuery = query.trim()
  if (fallback && normalizedQuery) return `未找到“${normalizedQuery}”的完全匹配，展示${category === '全部' ? '全部' : category}作品`
  if (normalizedQuery) return `搜索“${normalizedQuery}” · ${resultCount} 个作品`
  if (category === '全部') return `共 ${resultCount} 个公开作品`
  return `${category} · ${resultCount} 个作品`
}

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
  const [category, setCategory] = useState<ShowcaseEntry['category']>('全部')
  const [draftQuery, setDraftQuery] = useState('')
  const [query, setQuery] = useState('')
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
  const entries = useMemo(() => snapshots.map(toShowcaseEntry), [snapshots])
  const filtered = useMemo(() => filterShowcaseEntries(entries, category, query), [category, entries, query])
  const searchFeedback = getShowcaseSearchFeedback({
    category,
    query,
    resultCount: filtered.entries.length,
    fallback: filtered.fallback,
  })
  const retry = () => setReloadToken((token) => token + 1)
  const clearFilters = () => {
    setCategory('全部')
    setDraftQuery('')
    setQuery('')
  }

  return (
    <div className="min-h-screen bg-[#111] text-white" data-testid="showcase-gallery" aria-busy={loading}>
      <aside className="flex h-12 items-center justify-center overflow-hidden border-b border-white/[0.05] bg-[#d7f3fb] px-4 text-[12px] text-[#17232a]">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#ec168c] px-3 py-1 font-medium text-white">
          <span aria-hidden="true">⏱</span> 活动剩余 5 天 23 时
        </span>
        <span className="ml-3 truncate font-medium">Agent 全面上线，专业 Skills 助力创作</span>
        <Link
          href="/account"
          className="ml-3 shrink-0 rounded-full border border-[#17232a] px-3 py-1 font-medium transition-colors hover:bg-[#17232a] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          限时抢购
        </Link>
      </aside>

      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <LibTvLogo className="h-6 w-[88px]" />
          <span className="sr-only">Kokoro Nova · LibTV</span>
        </Link>
        <nav aria-label="公开探索导航" className="flex items-center gap-2">
          <Link
            href="/skills"
            className="rounded-lg border border-white/[0.08] px-3 py-2 text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Skills
          </Link>
          <Link
            href="/account"
            className="rounded-lg border border-white/[0.08] px-3 py-2 text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            账户
          </Link>
          <Link
            href="/project"
            className="rounded-lg bg-white px-3.5 py-2 text-[12px] font-medium text-[#151515] transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            我的项目
          </Link>
        </nav>
      </header>

      <main className="px-4 pb-16 sm:px-8" aria-labelledby="showcase-title">
        <div className="mx-auto max-w-[1500px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2 pt-7">
            <div>
              <h1 id="showcase-title" className="text-[18px] font-semibold tracking-tight text-white">TV Show</h1>
              <p className="mt-1 text-[12px] text-white/45">公开探索 · 只读浏览发布时冻结的制作过程</p>
            </div>
            <div className="text-[12px] text-white/45" data-testid="showcase-status" role="status" aria-live="polite">
              {requestState === 'loading' ? '正在加载公开作品…' : requestState === 'refreshing' ? '正在刷新公开作品…' : ''}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-b border-white/[0.07] pb-3 lg:flex-row lg:items-center">
            {!query && (
              <div className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto" role="group" aria-label="TV Show 分类">
                {SHOWCASE_CATEGORIES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    data-testid={`showcase-category-${item}`}
                    data-selected={category === item ? 'true' : undefined}
                    aria-pressed={category === item}
                    onClick={() => setCategory(item)}
                    className={cn(
                      'shrink-0 rounded-lg border px-3 py-1.5 text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                      category === item
                        ? 'border-white/[0.16] bg-white/[0.12] text-white'
                        : 'border-white/[0.07] text-white/48 hover:bg-white/[0.06] hover:text-white/80',
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
            <form
              role="search"
              aria-label="搜索公开作品"
              onSubmit={(event) => {
                event.preventDefault()
                setQuery(draftQuery.trim())
              }}
              className="flex h-9 w-full shrink-0 items-center gap-2 rounded-full border border-white/[0.1] px-3 text-white/35 transition-colors focus-within:border-white/25 lg:ml-auto lg:w-64"
            >
              <label className="sr-only" htmlFor="showcase-search">搜索 TV Show</label>
              <input
                id="showcase-search"
                data-testid="showcase-search"
                inputMode="search"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="请输入搜索内容"
                aria-label="搜索 TV Show"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-white/85 outline-none placeholder:text-white/28 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
              {(draftQuery || query) && (
                <button
                  type="button"
                  data-testid="showcase-clear-search"
                  aria-label="清除搜索"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setDraftQuery('')
                    setQuery('')
                  }}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/[0.1] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <IconClose size={12} />
                </button>
              )}
              <button
                type="submit"
                data-testid="showcase-search-submit"
                aria-label="提交搜索"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/[0.1] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <IconSearch size={14} />
              </button>
            </form>
          </div>

          <p data-testid="showcase-search-feedback" aria-live="polite" className="mt-3 min-h-4 text-[11px] text-white/35">
            {searchFeedback}
          </p>

          <div aria-busy={loading}>
        {loading && snapshots.length === 0 ? (
          <div className="flex justify-center py-20 text-white/50" role="status" aria-label="正在加载公开作品">
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[13px] font-medium text-[#151515] transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
        ) : filtered.entries.length === 0 ? (
          <EmptyState
            icon={<IconPlay size={30} />}
            title={category === '全部' ? '暂无公开作品' : `${category}暂无作品`}
            description={query ? `没有找到“${query}”对应的作品。` : '把画布发布之后，作品会出现在这里，任何人都可以浏览它的制作过程。'}
            action={
              query || category !== '全部' ? (
                <button
                  type="button"
                  data-testid="showcase-clear-filters"
                  onClick={clearFilters}
                  className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-medium text-[#151515] transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  清除筛选
                </button>
              ) : (
                <Link
                  href="/project"
                  className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-medium text-[#151515] transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  去我的项目
                </Link>
              )
            }
          />
        ) : (
          <>
            <div
              className="grid grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2 xl:grid-cols-4"
              data-testid="showcase-grid"
            >
              {filtered.entries.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/showcase/${entry.id}`}
                  data-testid={`showcase-card-${entry.id}`}
                  className="group flex min-w-0 flex-col rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                >
                  <span className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-[#222] ring-1 ring-white/[0.07] transition-shadow group-hover:shadow-[0_0_0_1px_rgba(255,255,255,.18),0_12px_28px_rgba(0,0,0,.28)]">
                    {entry.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.coverUrl} alt={entry.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]" />
                    ) : (
                      <IconImage size={34} className="text-white/25" aria-hidden="true" />
                    )}
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/65 px-2 py-1 text-[10px] text-white/80 backdrop-blur">
                      查看制作过程 <IconChevronRight size={11} className="ml-0.5 inline" />
                    </span>
                  </span>
                  <span className="mt-2.5 block truncate text-[14px] font-medium text-white/90">{entry.title}</span>
                  {entry.summary && (
                    <span className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-white/42">
                      {entry.summary}
                    </span>
                  )}
                  <span className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-white/40">
                    <span className="truncate">
                      {entry.author}
                      {entry.authorTier && <span className="ml-1.5 text-[#d3aa68]">{entry.authorTier}</span>}
                    </span>
                    <span className="shrink-0">♡ {entry.likeCount}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-[11px] text-white/30">
                    {new Date(entry.publishedAt).toLocaleDateString('zh-CN')}
                    <span className="flex items-center gap-1">
                      <IconLayers size={12} />
                      {entry.nodeCount} 个节点
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            <div className="pt-14 text-center text-[13px] text-white/35">没有更多了</div>
          </>
        )}
          </div>
        </div>
      </main>
    </div>
  )
}
