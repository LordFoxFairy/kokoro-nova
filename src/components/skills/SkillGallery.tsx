'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getSkillMedia,
  SKILL_CATEGORIES,
  SKILL_COLLECTIONS,
  type SkillCard,
  type SkillCollection,
} from '@/domain/skills'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { EmptyState, Spinner } from '../ui/controls'
import {
  IconAgent,
  IconChevronRight,
  IconClose,
  IconCredit,
  IconHelp,
  IconRefresh,
  IconSearch,
  IconSkill,
  IconSparkle,
} from '../icons'
import { LibTvLogo } from '../shell/LibTvLogo'
import { PromoStrip } from '../shell/PromoStrip'
import { SkillMarketComposer } from './SkillMarketComposer'
import { SkillAuthorStudio } from './SkillAuthorStudio'

interface SkillListResponse {
  skills: SkillCard[]
  counts: { all: number; favourite: number; mine: number }
}

export type SkillGalleryRequestState = 'initial-loading' | 'refreshing' | 'ready' | 'empty' | 'error' | 'stale-error'

export function getSkillGalleryRequestState({
  loading,
  initialised,
  hasSkills,
  error,
}: {
  loading: boolean
  initialised: boolean
  hasSkills: boolean
  error: string | null
}): SkillGalleryRequestState {
  if (error) return initialised && hasSkills ? 'stale-error' : 'error'
  if (!initialised) return 'initial-loading'
  if (loading) return 'refreshing'
  return hasSkills ? 'ready' : 'empty'
}

/** Dark discovery shell for the public, read-only Skill marketplace. */
export function SkillGallery() {
  const [collection, setCollection] = useState<SkillCollection>('全部')
  const [category, setCategory] = useState<string>('全部')
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')

  const [skills, setSkills] = useState<SkillCard[]>([])
  const [counts, setCounts] = useState({ all: 0, favourite: 0, mine: 0 })
  const [loading, setLoading] = useState(true)
  const [initialised, setInitialised] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [failedFavourite, setFailedFavourite] = useState<SkillCard | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(draft), 220)
    return () => clearTimeout(timer)
  }, [draft])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    const search = new URLSearchParams({ collection, category })
    if (query.trim()) search.set('q', query.trim())

    void api
      .get<SkillListResponse>(`/api/skills?${search.toString()}`)
      .then((data) => {
        if (cancelled) return
        setSkills(data.skills)
        setCounts(data.counts)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setLoadError(cause instanceof ApiError ? cause.message : '技能库加载失败，请稍后重试')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setInitialised(true)
      })

    return () => {
      cancelled = true
    }
  }, [collection, category, query, reloadToken])

  const toggleFavourite = useCallback(
    async (skill: SkillCard) => {
      if (pendingId) return
      setPendingId(skill.id)
      setActionError(null)
      const next = !skill.favourite
      try {
        const { skill: updated } = await api.post<{ skill: SkillCard }>(`/api/skills/${skill.id}`, {
          action: next ? 'favourite' : 'unfavourite',
        })
        setSkills((rows) =>
          collection === '收藏' && !updated.favourite
            ? rows.filter((row) => row.id !== updated.id)
            : rows.map((row) => (row.id === updated.id ? { ...row, favourite: updated.favourite } : row)),
        )
        setCounts((prev) => ({ ...prev, favourite: Math.max(0, prev.favourite + (next ? 1 : -1)) }))
        setFailedFavourite(null)
      } catch (cause) {
        setActionError(cause instanceof ApiError ? cause.message : '收藏失败，请稍后重试')
        setFailedFavourite(skill)
      } finally {
        setPendingId(null)
      }
    },
    [collection, pendingId],
  )

  const requestState = getSkillGalleryRequestState({
    loading,
    initialised,
    hasSkills: skills.length > 0,
    error: loadError,
  })
  const filtered = category !== '全部' || query.trim() !== ''
  const retry = () => setReloadToken((n) => n + 1)

  return (
    <div
      data-app-shell="authenticated"
      data-testid="skill-gallery"
      className="min-h-screen overflow-x-hidden bg-[#111] text-white"
      aria-busy={loading}
    >
      <div className="px-2 pt-2 max-sm:px-1 max-sm:pt-1">
        <PromoStrip campaign={null} />
      </div>

      <header className="flex min-h-[64px] items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-3 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#60c9ef]">
          <LibTvLogo className="h-6 w-[88px]" />
          <span className="sr-only">LibTV 首页</span>
        </Link>
        <nav aria-label="技能市场工具" className="flex items-center gap-2">
          <Link href="/showcase" className="hidden rounded-lg border border-[#755b2a]/40 bg-[#2b2519] px-4 py-2 text-[12px] text-[#d8b66d] transition-colors hover:bg-[#3b301e] sm:inline-flex">创作者挑战赛</Link>
          <Link href="/canvas" aria-label="LibTV Agent" title="LibTV Agent" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white"><IconAgent size={17} /></Link>
          <Link href="/account" aria-label="帮助" title="帮助" className="hidden h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white sm:flex"><IconHelp size={17} /></Link>
          <Link href="/account" className="hidden items-center gap-1.5 rounded-lg border border-[#60c9ef]/30 bg-[#0f2a38] px-3 py-2 text-[12px] text-[#71d6f4] transition-colors hover:bg-[#123a4b] md:flex"><span className="text-[#60c9ef]">▣</span> 会员超市</Link>
          <Link href="/account" className="hidden items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-[12px] text-white/70 transition-colors hover:bg-white/[0.1] sm:flex"><IconCredit size={14} className="text-[#e6b766]" /> 开通会员</Link>
          <Link href="/account" className="rounded-lg bg-white px-3.5 py-2 text-[12px] font-medium text-[#151515] transition-opacity hover:opacity-85">注册/登录</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-[1320px] px-4 pb-16 sm:px-8" aria-labelledby="skill-gallery-title">
        <section className="relative pt-10 sm:pt-12">
          <h1 id="skill-gallery-title" className="text-center font-serif text-[23px] font-medium tracking-wide text-white/90 sm:text-[25px]">新的一天，新的 Skill</h1>
          <div data-testid="skill-status" role="status" aria-live="polite" className="sr-only">
            {requestState === 'initial-loading' ? '正在加载技能库…' : requestState === 'refreshing' ? '正在刷新技能库…' : ''}
          </div>
          <SkillMarketComposer />
        </section>

        <section className="mt-11" aria-label="技能市场筛选">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-5" role="tablist" aria-label="技能集合">
              {SKILL_COLLECTIONS.map((item) => {
                const active = collection === item
                const count = item === '全部' ? counts.all : item === '收藏' ? counts.favourite : counts.mine
                return (
                  <button key={item} type="button" role="tab" aria-selected={active} data-testid={`skill-collection-${item}`} onClick={() => setCollection(item)} className={cn('relative pb-3 text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#60c9ef]', active ? 'font-medium text-white' : 'text-white/40 hover:text-white/75')}>
                    {item}
                    {initialised && <span className="ml-1 text-[11px] tabular-nums text-white/35">{count}</span>}
                    {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#60c9ef]" />}
                  </button>
                )
              })}
            </div>
            <form role="search" aria-label="搜索 Skill" onSubmit={(event) => { event.preventDefault(); setQuery(draft.trim()) }} className="mb-2 flex h-9 w-full items-center gap-2 rounded-full border border-white/[0.12] px-3 text-white/40 transition-colors focus-within:border-white/[0.28] sm:w-64">
              <IconSearch size={14} />
              <label htmlFor="skill-search" className="sr-only">搜索 Skill</label>
              <input id="skill-search" data-testid="skill-search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="搜索 Skill" className="min-w-0 flex-1 bg-transparent text-[12px] text-white/85 outline-none placeholder:text-white/30" />
              {(draft || query) && <button type="button" data-testid="skill-clear-search" aria-label="清除搜索" onClick={() => { setDraft(''); setQuery('') }} className="rounded-full p-0.5 text-white/45 hover:bg-white/10 hover:text-white"><IconClose size={12} /></button>}
            </form>
          </div>

          <div className="no-scrollbar flex gap-2 overflow-x-auto py-4" role="group" aria-label="技能分类">
            {SKILL_CATEGORIES.map((item) => (
              <button key={item} type="button" data-testid={`skill-category-${item}`} aria-pressed={item === category} onClick={() => setCategory(item)} className={cn('shrink-0 rounded-lg border px-3 py-1.5 text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#60c9ef]', item === category ? 'border-white/[0.18] bg-white/[0.12] text-white' : 'border-white/[0.09] text-white/45 hover:bg-white/[0.06] hover:text-white/80')}>{item}</button>
            ))}
          </div>
        </section>

        {collection === '我的' && (
          <section data-testid="skill-author-entry" className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#60c9ef]/18 bg-[#102630]/55 px-4 py-3.5">
            <div><p className="text-[13px] font-medium text-[#b9eafa]">我的 Skill</p><p className="mt-1 text-[11px] text-[#80b3c2]">本地 mock 工作台支持草稿、文件树、语义版本、审核、发布与下架。</p></div>
            <SkillAuthorStudio onPublished={() => setReloadToken((token) => token + 1)} />
          </section>
        )}

        <div className="min-h-[400px]" aria-busy={loading}>
          {!initialised || (loading && skills.length === 0) ? (
            <div className="flex justify-center py-24 text-white/45" role="status" aria-label="正在加载技能库"><Spinner size={22} /></div>
          ) : loadError && !skills.length ? (
            <EmptyState icon={<IconSparkle size={30} />} title="技能库暂时打不开" description={loadError} action={<RetryButton loading={loading} onClick={retry} testId="skill-retry" />} />
          ) : skills.length === 0 ? (
            <CollectionEmptyState collection={collection} filtered={filtered} onClear={() => { setCategory('全部'); setDraft(''); setQuery('') }} />
          ) : (
            <>
              {loadError && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#5a262b]/50 px-3.5 py-2.5 text-[12px] text-[#ff9a9f]" role="alert"><span>刷新失败，仍显示上次成功读取的技能：{loadError}</span><RetryButton loading={loading} onClick={retry} testId="skill-retry" /></div>}
              {actionError && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#5a262b]/50 px-3.5 py-2.5 text-[12px] text-[#ff9a9f]" role="alert"><span>{actionError}</span>{failedFavourite && <button type="button" data-testid="skill-favourite-retry" onClick={() => void toggleFavourite(failedFavourite)} disabled={Boolean(pendingId)} className="rounded-lg bg-[#262020] px-3 py-1.5 font-medium text-[#ffb0b4] ring-1 ring-[#ff9a9f]/20">重试收藏</button>}</div>}
              <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2 xl:grid-cols-3" data-testid="skill-grid" id="skill-grid">
                {skills.map((skill, index) => <SkillGridCard key={skill.id} skill={skill} mediaIndex={index} busy={pendingId === skill.id} onToggleFavourite={() => void toggleFavourite(skill)} />)}
              </div>
              <div className="pt-12 text-center text-[12px] text-white/30" role="status" aria-live="polite">没有更多了 · 共 {skills.length} 个 Skill</div>
            </>
          )}
        </div>
      </main>

    </div>
  )
}

function RetryButton({ loading, onClick, testId }: { loading: boolean; onClick: () => void; testId: string }) {
  return <button type="button" data-testid={testId} onClick={onClick} disabled={loading} aria-busy={loading} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[13px] font-medium text-[#151515] transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-60"><IconRefresh size={14} className={loading ? 'animate-spin' : undefined} />{loading ? '重试中…' : '重试'}</button>
}

function SkillGridCard({ skill, mediaIndex, busy, onToggleFavourite }: { skill: SkillCard; mediaIndex: number; busy: boolean; onToggleFavourite: () => void }) {
  const media = getSkillMedia(skill)[mediaIndex % 4]
  return (
    <article className="group relative min-w-0" data-testid={`skill-card-${skill.id}`}>
      <Link href={`/skills/${skill.id}`} className="flex min-h-[128px] gap-3 rounded-2xl border border-white/[0.1] bg-[#1c1c1c] p-3 transition-colors hover:border-white/[0.2] hover:bg-[#232323] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#60c9ef]">
        <span className="relative h-[102px] w-[166px] shrink-0 overflow-hidden rounded-xl bg-[#292929] ring-1 ring-white/[0.06] sm:w-[182px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={media.src} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" />
          <span className="absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white/80">{skill.category === '叙事分镜' ? '图片' : 'Skill'}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col py-0.5">
          <span className="truncate pr-6 text-[14px] font-medium text-white/90">{skill.name}</span>
          <span className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-white/45">{skill.summary}</span>
          <span className="mt-auto flex items-center gap-1.5 truncate text-[11px] text-white/42"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-[#efe2cf] to-[#514d46] text-[8px] text-[#222]">✦</span><span className="truncate">{skill.author}</span><span className="text-white/20">·</span><span>{formatUsage(skill.usageCount)}</span></span>
        </span>
        <span className="absolute bottom-3 right-3 text-white/20 transition-colors group-hover:text-white/55"><IconChevronRight size={15} /></span>
      </Link>
      <button type="button" disabled={busy} aria-busy={busy} data-testid={`skill-favourite-${skill.id}`} aria-pressed={skill.favourite} aria-label={skill.favourite ? `取消收藏 ${skill.name}` : `收藏 ${skill.name}`} title={skill.favourite ? '取消收藏' : '收藏'} onClick={onToggleFavourite} className={cn('absolute right-[196px] top-[17px] rounded-full p-1.5 transition-colors sm:right-[210px]', skill.favourite ? 'text-[#ffd36f]' : 'text-white/55 hover:bg-white/10 hover:text-white', busy && 'cursor-wait opacity-70', 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60c9ef]')}><IconSkill size={16} fill={skill.favourite ? 'currentColor' : 'none'} /></button>
    </article>
  )
}

function CollectionEmptyState({ collection, filtered, onClear }: { collection: SkillCollection; filtered: boolean; onClear: () => void }) {
  if (filtered) return <EmptyState icon={<IconSearch size={28} />} title="没有匹配的 Skill" description={collection === '全部' ? '换个分类或搜索词试试。' : `「${collection}」里没有符合当前分类和搜索词的能力包。`} action={<button type="button" data-testid="skill-clear-filters" onClick={onClear} className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-medium text-[#151515]">清除筛选</button>} />
  if (collection === '收藏') return <EmptyState icon={<IconSparkle size={30} />} title="当前暂无 Skill" description="收藏过的能力包会集中在这里，方便下次直接加载。" />
  if (collection === '我的') return <EmptyState icon={<IconSparkle size={30} />} title="当前暂无Skill" description="点击“创建Skill”，把反复用到的步骤、约束和产出格式沉淀成执行契约。" />
  return <EmptyState icon={<IconSparkle size={30} />} title="技能库还没有内容" description="能力包会在这里按分类陈列，加载后 Agent 就按它写定的契约工作。" />
}

function formatUsage(count: number): string {
  if (count < 10_000) return count.toLocaleString('zh-CN')
  return `${(count / 10_000).toFixed(1)} 万`
}
