'use client'

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import Link from 'next/link'

import { IconChevronLeft, IconChevronRight, IconClose, IconSearch } from '@/components/icons'
import type { HomeDiscoveryResponse } from '@/contracts/home'
import { cn } from '@/lib/cn'
import { Dialog } from '@/components/ui/Dialog'

type TvShowItem = HomeDiscoveryResponse['showcase'][number]

type TvShowFeedProps = {
  categories: string[]
  items: HomeDiscoveryResponse['showcase']
}

/** Keep the discovery projection deterministic and independent of the server. */
export function filterTvShowItems(items: TvShowItem[], category: string, query: string): TvShowItem[] {
  const needle = query.trim().toLocaleLowerCase('zh-CN')
  return items.filter((item) => {
    const inCategory = category === '全部' || item.category === category
    const inQuery = !needle || `${item.title} ${item.author}`.toLocaleLowerCase('zh-CN').includes(needle)
    return inCategory && inQuery
  })
}

/**
 * The public TV Show search is a submitted discovery query, not a per-keypress
 * client-side filter. When the frozen local catalogue has no literal match,
 * preserve the observed recommendation fallback instead of manufacturing an
 * empty result state for a query the real service would resolve semantically.
 */
export function resolveTvShowSearch(items: TvShowItem[], category: string, query: string) {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return { items: filterTvShowItems(items, category, ''), usedFallback: false }

  const exactMatches = filterTvShowItems(items, '全部', normalizedQuery)
  return exactMatches.length > 0 ? { items: exactMatches, usedFallback: false } : { items, usedFallback: true }
}

export function getTvShowSearchFeedback({
  category,
  query,
  resultCount,
  usedFallback = false,
}: {
  category: string
  query: string
  resultCount: number
  usedFallback?: boolean
}): string {
  const normalizedQuery = query.trim()
  if (resultCount === 0) {
    if (normalizedQuery) return `没有匹配“${normalizedQuery}”的作品`
    if (category !== '全部') return `${category}暂无作品`
    return '暂无公开作品'
  }
  if (normalizedQuery && usedFallback) return `未找到“${normalizedQuery}”的精确结果，已为你推荐 ${resultCount} 个作品`
  if (normalizedQuery) return `搜索“${normalizedQuery}” · ${resultCount} 个作品`
  if (category === '全部') return `共 ${resultCount} 个公开作品`
  return `${category} · ${resultCount} 个作品`
}

export function tvShowCategoryScrollDelta(direction: 'left' | 'right', viewportWidth: number): number {
  const distance = Math.max(1, Math.round(viewportWidth * 0.72))
  return direction === 'left' ? -distance : distance
}

export function nextTvShowEscapeState({ category, query }: { category: string; query: string }) {
  if (query.trim()) return { category, query: '', handled: true }
  if (category !== '全部') return { category: '全部', query: '', handled: true }
  return { category, query: '', handled: false }
}

export function TvShowFeed({ categories, items }: TvShowFeedProps) {
  const defaultCategory = categories.includes('全部') ? '全部' : categories[0] ?? '全部'
  const [category, setCategory] = useState(defaultCategory)
  const [searchDraft, setSearchDraft] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<TvShowItem | null>(null)
  const categoryRailRef = useRef<HTMLDivElement>(null)
  const searchResult = useMemo(() => resolveTvShowSearch(items, category, searchQuery), [category, items, searchQuery])
  const filtered = searchResult.items
  const searchMode = Boolean(searchQuery.trim())

  useEffect(() => {
    if (categories.length === 0 || categories.includes(category)) return
    setCategory(defaultCategory)
  }, [categories, category, defaultCategory])

  const searchFeedback = getTvShowSearchFeedback({
    category,
    query: searchQuery,
    resultCount: filtered.length,
    usedFallback: searchResult.usedFallback,
  })
  const resetSearchLayer = () => {
    if (searchDraft.trim() || searchQuery.trim()) {
      setSearchDraft('')
      setSearchQuery('')
      return true
    }
    const next = nextTvShowEscapeState({ category, query: '' })
    if (!next.handled) return false
    setCategory(next.category)
    return true
  }

  const openItemPreview = (event: MouseEvent<HTMLAnchorElement>, item: TvShowItem) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    setSelectedItem(item)
  }

  return (
    <section aria-labelledby="tv-show-title" className="mt-9 scroll-mt-6 pb-20">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <Link href="/showcase" aria-label="公开作品" className="shrink-0 transition-colors hover:text-white/80">
            <h2 id="tv-show-title" className="text-[18px] font-semibold tracking-tight text-white">TV Show</h2>
          </Link>
          <span className="truncate text-[11px] text-white/34">公开探索 · 只读制作过程</span>
        </div>
        <Link
          href="/showcase"
          data-testid="tv-show-explore"
          aria-label="探索全部 TV Show"
          className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
        >
          探索全部 <span aria-hidden="true">›</span>
        </Link>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-b border-white/[0.07] pb-3 sm:flex-row sm:items-center">
        {!searchMode && (
          <div className="flex min-w-0 flex-1 items-center gap-1" aria-label="TV Show 分类">
          <button
            type="button"
            data-testid="tv-show-scroll-left"
            aria-label="向左滚动"
            onClick={() => {
              const rail = categoryRailRef.current
              if (!rail) return
              rail.scrollBy({ left: tvShowCategoryScrollDelta('left', rail.clientWidth), behavior: 'smooth' })
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/46 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
          >
            <IconChevronLeft size={14} />
          </button>
          <div
            ref={categoryRailRef}
            data-testid="tv-show-category-rail"
            className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto scroll-smooth"
          >
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                data-selected={category === item ? 'true' : undefined}
                data-testid={`tv-show-category-${item}`}
                onClick={() => setCategory(item)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-[12px] transition-colors',
                  category === item
                    ? 'bg-white text-[#151515]'
                    : 'text-white/48 hover:bg-white/[0.06] hover:text-white/76',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]',
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <button
            type="button"
            data-testid="tv-show-scroll-right"
            aria-label="向右滚动"
            onClick={() => {
              const rail = categoryRailRef.current
              if (!rail) return
              rail.scrollBy({ left: tvShowCategoryScrollDelta('right', rail.clientWidth), behavior: 'smooth' })
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/46 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
          >
            <IconChevronRight size={14} />
          </button>
          </div>
        )}
        <form
          role="search"
          aria-label="搜索公开作品"
          data-testid="tv-show-search-form"
          onSubmit={(event) => {
            event.preventDefault()
            setSearchQuery(searchDraft.trim())
          }}
          className="flex h-8 w-full shrink-0 items-center gap-2 rounded-full border border-white/[0.08] px-3 text-white/35 transition-colors focus-within:border-white/20 sm:w-52"
        >
          <label className="sr-only" htmlFor="tv-show-search">搜索 TV Show</label>
          <input
            id="tv-show-search"
            inputMode="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              if (!resetSearchLayer()) return
              event.preventDefault()
              event.stopPropagation()
            }}
            aria-label="搜索 TV Show"
            placeholder="搜索"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-white/80 outline-none placeholder:text-white/28"
          />
          {Boolean(searchDraft || searchQuery) && (
            <button
              type="button"
              data-testid="tv-show-clear-search"
              aria-label="清除 TV Show 搜索"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setSearchDraft('')
                setSearchQuery('')
              }}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
            >
              <IconClose size={12} />
            </button>
          )}
          <button
            type="submit"
            data-testid="tv-show-submit-search"
            aria-label="搜索 TV Show"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
          >
            <IconSearch size={14} />
          </button>
        </form>
      </div>

      <p
        data-testid="tv-show-search-feedback"
        aria-live="polite"
        className="mt-3 min-h-4 text-[11px] text-white/35"
      >
        {searchFeedback}
      </p>

      <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => (
          <article key={item.id} data-testid="home-showcase-card" className="group min-w-0">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-[#222]">
              <Link
                href="/showcase"
                aria-label={`查看 ${item.title}`}
                data-testid="tv-show-card-link"
                onClick={(event) => openItemPreview(event, item)}
                className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#60c9ef]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.coverUrl}
                  alt={item.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
                />
              </Link>
              <button
                type="button"
                data-testid={`tv-show-process-${item.id}`}
                aria-label="查看创作过程"
                disabled={!item.processAvailable}
                title={item.processAvailable ? undefined : '该作品暂未开放创作过程'}
                onClick={() => setSelectedItem(item)}
                className={cn(
                  'absolute bottom-3 right-3 rounded-full bg-black/65 px-3 py-1.5 text-[11px] text-white backdrop-blur transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]',
                  item.processAvailable
                    ? 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                    : 'cursor-not-allowed opacity-55',
                )}
              >
                查看创作过程
              </button>
            </div>
            <Link
              href="/showcase"
              onClick={(event) => openItemPreview(event, item)}
              className="mt-2.5 block truncate text-[14px] font-medium text-white/88 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
            >
              {item.title}
            </Link>
            <div className="mt-1 flex items-center justify-between text-[12px] text-white/38">
              <span className="truncate">
                {item.author}
                {item.authorTier && <span className="ml-1.5 text-[#d3aa68]">{item.authorTier}</span>}
              </span>
              <span aria-label={`${item.likeCount} 个赞`}>♡ {item.likeCount}</span>
            </div>
          </article>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-[13px] text-white/45">{searchFeedback}</p>
          {(searchQuery.trim() || category !== '全部') && (
            <button
              type="button"
              data-testid="tv-show-clear-filters"
              onClick={() => {
                setSearchDraft('')
                setSearchQuery('')
                setCategory('全部')
              }}
              className="rounded-full border border-white/[0.12] px-3 py-1.5 text-[11px] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]"
            >
              清除筛选
            </button>
          )}
        </div>
      )}

      <Dialog
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={selectedItem?.title ?? '公开作品'}
        testId="tv-show-detail-dialog"
      >
        {selectedItem && (
          <div className="space-y-4 text-[13px] leading-relaxed text-ink-600">
            <div className="overflow-hidden rounded-xl bg-ink-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selectedItem.coverUrl} alt="" className="aspect-video h-full w-full object-cover" />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-400">
              <span>{selectedItem.author}</span>
              <span>{selectedItem.category}</span>
              <span>♡ {selectedItem.likeCount}</span>
            </div>
            <p>公开作品可直接浏览；完整的制作过程与可复用内容会在作品广场中继续展开。</p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-ink-600 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                继续浏览
              </button>
              <Link
                href="/showcase"
                onClick={() => setSelectedItem(null)}
                className="rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                探索作品广场
              </Link>
            </div>
          </div>
        )}
      </Dialog>
    </section>
  )
}
