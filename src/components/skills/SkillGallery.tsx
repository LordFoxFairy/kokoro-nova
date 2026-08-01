'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  SKILL_CATEGORIES,
  SKILL_COLLECTIONS,
  type SkillCard,
  type SkillCollection,
} from '@/domain/skills'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Chip, EmptyState, SegmentedControl, Spinner } from '../ui/controls'
import { IconSearch, IconSkill, IconSparkle } from '../icons'

interface SkillListResponse {
  skills: SkillCard[]
  counts: { all: number; favourite: number; mine: number }
}

/**
 * Skill library.
 *
 * Browsing is anonymous and read-only — the catalogue is shared seed data — with
 * exactly one piece of per-reader state on the surface: the star. So the card
 * carries a favourite toggle and nothing else actionable; anything that needs a
 * session lives on the detail page, where there is room to explain itself.
 */
export function SkillGallery() {
  const [collection, setCollection] = useState<SkillCollection>('全部')
  const [category, setCategory] = useState<string>('全部')
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')

  const [skills, setSkills] = useState<SkillCard[]>([])
  const [counts, setCounts] = useState({ all: 0, favourite: 0, mine: 0 })
  const [loading, setLoading] = useState(true)
  // The first load has nothing to show and gets the spinner; every later one
  // keeps the current grid on screen and only dims it, so typing in the search
  // box does not strobe between results and a loader.
  const [initialised, setInitialised] = useState(false)
  // Two failure modes, two slots: a failed listing has no grid to show, while a
  // failed star still has one — collapsing them would let a rejected toggle wipe
  // a catalogue that loaded perfectly well.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  // Typing must not fire a request per keystroke, but it must still feel live —
  // one short settle window, not a submit button.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(draft), 220)
    return () => clearTimeout(timer)
  }, [draft])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
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
        setSkills([])
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
          // Unstarring from inside 收藏 removes the card: leaving it there would
          // show a row the collection no longer contains.
          collection === '收藏' && !updated.favourite
            ? rows.filter((row) => row.id !== updated.id)
            : rows.map((row) => (row.id === updated.id ? { ...row, favourite: updated.favourite } : row)),
        )
        setCounts((prev) => ({ ...prev, favourite: prev.favourite + (next ? 1 : -1) }))
      } catch (cause) {
        setActionError(cause instanceof ApiError ? cause.message : '收藏失败，请稍后重试')
      } finally {
        setPendingId(null)
      }
    },
    [collection, pendingId],
  )

  const filtered = category !== '全部' || query.trim() !== ''

  return (
    <div className="min-h-screen bg-surface" data-testid="skill-gallery">
      <header className="flex items-center justify-between px-8 py-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-900 text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7.5 8 5l6 2.5L20 5v11.5L14 19l-6-2.5L4 19z" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink-900">NovaVideo</span>
        </Link>
        <Link
          href="/project"
          className="rounded-full bg-ink-50 px-4 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:bg-ink-100"
        >
          我的项目
        </Link>
      </header>

      <div className="px-8 pb-5">
        <h1 className="text-[17px] font-semibold text-ink-900">技能库</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-500">
          Skill 是能被 Agent 加载的能力包：一份写定的执行契约，规定它按哪些步骤工作、交回什么格式。加载时锁定版本，同一个版本的产出结构始终一致。
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-8 pb-3">
        <SegmentedControl
          value={collection}
          onChange={setCollection}
          options={SKILL_COLLECTIONS.map((item) => ({
            value: item,
            testId: `skill-collection-${item}`,
            label: (
              <>
                {item}
                {initialised && (
                  <span className="tabular-nums opacity-55">
                    {item === '全部' ? counts.all : item === '收藏' ? counts.favourite : counts.mine}
                  </span>
                )}
              </>
            ),
          }))}
        />
        <div className="flex items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 py-2">
          <IconSearch size={14} className="text-ink-400" />
          <input
            value={draft}
            data-testid="skill-search"
            onChange={(e) => setDraft(e.target.value)}
            placeholder="搜索技能、作者或标签"
            className="w-52 bg-transparent text-[13px] outline-none placeholder:text-ink-400"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 px-8 pb-6">
        {SKILL_CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            data-testid={`skill-category-${item}`}
            aria-pressed={item === category}
            onClick={() => setCategory(item)}
            className={cn(
              'rounded-full px-3 py-1 text-[12px] transition-colors',
              item === category ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <div className={cn('px-8 pb-16 transition-opacity', loading && initialised && 'opacity-55')}>
        {!initialised ? (
          <div className="flex justify-center py-20 text-ink-400">
            <Spinner size={22} />
          </div>
        ) : loadError ? (
          <EmptyState
            icon={<IconSparkle size={30} />}
            title="技能库暂时打不开"
            description={loadError}
            action={
              <button
                type="button"
                data-testid="skill-retry"
                onClick={() => setReloadToken((n) => n + 1)}
                className="rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
              >
                重试
              </button>
            }
          />
        ) : skills.length === 0 ? (
          <CollectionEmptyState
            collection={collection}
            filtered={filtered}
            onClear={() => {
              setCategory('全部')
              setDraft('')
            }}
          />
        ) : (
          <>
            {actionError && (
              <div className="mb-4 rounded-xl bg-danger/8 px-3.5 py-2.5 text-[12px] text-danger">
                {actionError}
              </div>
            )}
            <div
              className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-6 gap-y-7"
              data-testid="skill-grid"
            >
              {skills.map((skill) => (
                <SkillGridCard
                  key={skill.id}
                  skill={skill}
                  busy={pendingId === skill.id}
                  onToggleFavourite={() => void toggleFavourite(skill)}
                />
              ))}
            </div>
            <div className="pt-14 text-center text-[13px] text-ink-300">
              共 {skills.length} 个 Skill，没有更多了
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SkillGridCard({
  skill,
  busy,
  onToggleFavourite,
}: {
  skill: SkillCard
  busy: boolean
  onToggleFavourite: () => void
}) {
  return (
    <div className="group relative flex flex-col" data-testid={`skill-card-${skill.id}`}>
      <Link href={`/skills/${skill.id}`} className="flex flex-col">
        <SkillCover hue={skill.hue} sections={skill.executableSpec.length} version={skill.version} />
        <span className="mt-2.5 block truncate text-[13px] text-ink-900">{skill.name}</span>
        <span className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-500">{skill.summary}</span>
        <span className="mt-1.5 flex items-center gap-1.5">
          <Chip>{skill.category}</Chip>
          <span className="truncate text-[12px] text-ink-400">{skill.author}</span>
        </span>
        <span className="mt-1 block text-[12px] text-ink-400">{formatUsage(skill.usageCount)} 次调用</span>
      </Link>

      {/* Outside the Link, not nested in it: a control inside an anchor is
          neither valid markup nor reachable by keyboard as its own stop. */}
      <button
        type="button"
        disabled={busy}
        data-testid={`skill-favourite-${skill.id}`}
        aria-pressed={skill.favourite}
        aria-label={skill.favourite ? `取消收藏 ${skill.name}` : `收藏 ${skill.name}`}
        title={skill.favourite ? '取消收藏' : '收藏'}
        onClick={onToggleFavourite}
        className={cn(
          'absolute right-2.5 top-2.5 rounded-full p-2 backdrop-blur-sm transition-colors',
          skill.favourite ? 'bg-surface/90 text-accent' : 'bg-ink-900/25 text-white hover:bg-ink-900/40',
          busy && 'opacity-60',
        )}
      >
        <IconSkill size={15} fill={skill.favourite ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}

/**
 * Cover art.
 *
 * A skill has no artwork to show — it is text. The stripes stand for the spec's
 * sections, so the tile carries one true fact about the pack instead of a stock
 * illustration, and the hue makes it recognisable at a glance (see how the other
 * libraries paint their tiles in src/domain/libraries.ts).
 */
function SkillCover({ hue, sections, version }: { hue: number; sections: number; version: string }) {
  return (
    <span
      className="relative flex aspect-[4/3] w-full flex-col justify-center gap-2 overflow-hidden rounded-2xl px-5 transition-shadow group-hover:shadow-[var(--shadow-float)]"
      style={{
        background: `linear-gradient(140deg, hsl(${hue} 62% 62%), hsl(${(hue + 45) % 360} 58% 42%))`,
      }}
    >
      {Array.from({ length: Math.min(sections, 5) }).map((_, index) => (
        <span
          key={index}
          className="block h-[5px] rounded-full bg-white/45"
          style={{ width: `${[86, 62, 74, 48, 68][index]}%` }}
        />
      ))}
      <span className="absolute bottom-2.5 right-2.5 rounded-md bg-ink-900/25 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
        v{version}
      </span>
    </span>
  )
}

/** Each collection is empty for its own reason, so each says its own thing. */
function CollectionEmptyState({
  collection,
  filtered,
  onClear,
}: {
  collection: SkillCollection
  filtered: boolean
  onClear: () => void
}) {
  if (filtered) {
    return (
      <EmptyState
        icon={<IconSearch size={28} />}
        title="没有匹配的 Skill"
        description={
          collection === '全部'
            ? '换个分类或搜索词试试。'
            : `「${collection}」里没有符合当前分类和搜索词的能力包。`
        }
        action={
          <button
            type="button"
            data-testid="skill-clear-filters"
            onClick={onClear}
            className="rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
          >
            清除筛选
          </button>
        }
      />
    )
  }

  if (collection === '收藏') {
    return (
      <EmptyState
        icon={<IconSparkle size={30} />}
        title="还没有收藏任何 Skill"
        description="点卡片右上角的星标，收藏过的能力包会集中在这里，方便下次直接加载。"
      />
    )
  }

  if (collection === '我的') {
    return (
      <EmptyState
        icon={<IconSparkle size={30} />}
        title="还没有自建 Skill"
        description="把反复用到的步骤、约束和产出格式沉淀成一份执行契约，它就会出现在这里。"
      />
    )
  }

  return (
    <EmptyState
      icon={<IconSparkle size={30} />}
      title="技能库还没有内容"
      description="能力包会在这里按分类陈列，加载后 Agent 就按它写定的契约工作。"
    />
  )
}

/** 万 reads faster than six digits on a card; below that the exact number wins. */
function formatUsage(count: number): string {
  if (count < 10_000) return count.toLocaleString('zh-CN')
  return `${(count / 10_000).toFixed(1)} 万`
}
