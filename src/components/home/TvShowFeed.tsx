'use client'

import { useMemo, useState } from 'react'

import { IconSearch } from '@/components/icons'
import type { HomeDiscoveryResponse } from '@/contracts/home'
import { cn } from '@/lib/cn'

type TvShowFeedProps = {
  categories: string[]
  items: HomeDiscoveryResponse['showcase']
}

export function TvShowFeed({ categories, items }: TvShowFeedProps) {
  const [category, setCategory] = useState(categories[0] ?? '全部')
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN')
    return items.filter((item) => {
      const inCategory = category === '全部' || item.category === category
      const inQuery = !needle || `${item.title} ${item.author}`.toLocaleLowerCase('zh-CN').includes(needle)
      return inCategory && inQuery
    })
  }, [category, items, query])

  return (
    <section aria-labelledby="tv-show-title" className="mt-9 pb-20">
      <h2 id="tv-show-title" className="px-1 text-[18px] font-semibold tracking-tight text-white">TV Show</h2>
      <div className="mt-5 flex items-center gap-2 border-b border-white/[0.07] pb-3">
        <div className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-[12px] transition-colors',
                category === item ? 'bg-white text-[#151515]' : 'text-white/48 hover:bg-white/[0.06] hover:text-white/76',
              )}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="flex h-8 w-44 shrink-0 items-center gap-2 rounded-full border border-white/[0.08] px-3 text-white/35 focus-within:border-white/20">
          <IconSearch size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索 TV Show"
            placeholder="搜索"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-white/80 outline-none placeholder:text-white/28"
          />
        </label>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-x-3 gap-y-7">
        {filtered.map((item) => (
          <article key={item.id} data-testid="home-showcase-card" className="group min-w-0">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-[#222]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]" />
              {item.processAvailable && (
                <button
                  type="button"
                  className="absolute bottom-3 right-3 rounded-full bg-black/65 px-3 py-1.5 text-[11px] text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  查看创作过程
                </button>
              )}
            </div>
            <h3 className="mt-2.5 truncate text-[14px] font-medium text-white/88">{item.title}</h3>
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
      {filtered.length === 0 && <p className="py-16 text-center text-[13px] text-white/34">没有匹配的作品</p>}
    </section>
  )
}
