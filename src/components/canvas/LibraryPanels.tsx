'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CHARACTER_FILTERS,
  CHARACTER_PRESETS,
  type CharacterPreset,
} from '@/domain/libraries'
import type { MaterialCatalogItem, MaterialKind, MaterialScope } from '@/contracts/materials'
import { PRESET_CATEGORIES, TOOLBOX_PRESETS, type ToolboxPreset } from '@/domain/presets'
import type { Artifact, GenerationJob, WorkflowNode } from '@/domain/types'
import { ApiError, client } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { Dialog } from '../ui/Dialog'
import { EmptyState, SegmentedControl, Spinner } from '../ui/controls'
import { IconCheck, IconHistory, IconSearch } from '../icons'

export type MaterialTab = 'market' | 'favorites' | 'recent'
export type HistoryScope = 'canvas' | 'image' | 'video' | 'audio'
export type HistorySort = 'newest' | 'oldest'

type MaterialPresetLike = {
  id: string
  name: string
  category: string
  author: string
  commercial: boolean
}

/**
 * Shared filter semantics for the style/effect sheets. Keeping this outside
 * the component makes the local catalogue deterministic and gives the empty
 * state a single, testable definition instead of two subtly different ones.
 */
export function filterMaterialPresets<T extends MaterialPresetLike>(
  items: readonly T[],
  options: Partial<{
    kind: 'style' | 'effect'
    tab: MaterialTab
    category: string
    commercialOnly: boolean
    query: string
    favouriteIds: readonly string[]
    recentIds: readonly string[]
  }> = {},
): T[] {
  const kind = options.kind ?? 'style'
  const tab = options.tab ?? 'market'
  const category = options.category ?? '全部'
  const query = options.query?.trim().toLocaleLowerCase('zh-CN') ?? ''
  const favorites = new Set(options.favouriteIds ?? ['style-cine-teal', 'style-film-grain', 'style-soft-portrait'])
  const recent = new Set(options.recentIds ?? ['style-cine-teal', 'style-noir', 'style-isometric', 'style-anime-cel'])

  return items.filter((item) => {
    if (kind === 'style' && tab === 'favorites' && !favorites.has(item.id)) return false
    if (kind === 'style' && tab === 'recent' && !recent.has(item.id)) return false
    if (category !== '全部' && item.category !== category) return false
    if (options.commercialOnly && !item.commercial) return false
    if (query && !`${item.name}\n${item.author}\n${item.id}`.toLocaleLowerCase('zh-CN').includes(query)) return false
    return true
  })
}

/**
 * History is a projection of completed media artifacts, not a second
 * WorkflowDocument collection. Text output intentionally stays out of this
 * insertable media panel because the canvas insertion flow only has visual
 * and audio node representations.
 */
export function projectHistoryArtifacts(
  jobs: readonly Pick<GenerationJob, 'artifacts'>[],
  options: { scope: HistoryScope; sort: HistorySort },
): Artifact[] {
  const artifacts = jobs
    .flatMap((job) => job.artifacts)
    .filter((artifact): artifact is Artifact & { kind: 'image' | 'video' | 'audio' } =>
      artifact.kind === 'image' || artifact.kind === 'video' || artifact.kind === 'audio',
    )
    .filter((artifact) => options.scope === 'canvas' || artifact.kind === options.scope)

  return artifacts.sort((left, right) =>
    options.sort === 'newest'
      ? right.createdAt.localeCompare(left.createdAt)
      : left.createdAt.localeCompare(right.createdAt),
  )
}

/* ------------------------------------------------------------------ *
 * Toolbox
 * ------------------------------------------------------------------ */

export function ToolboxPanel({
  open,
  onClose,
  onUse,
}: {
  open: boolean
  onClose: () => void
  onUse: (preset: ToolboxPreset) => void
}) {
  const [tab, setTab] = useState<'presets' | 'mine'>('presets')
  const [category, setCategory] = useState<string>('全部')
  const [detail, setDetail] = useState<ToolboxPreset | null>(null)

  const filtered = useMemo(
    () => (category === '全部' ? TOOLBOX_PRESETS : TOOLBOX_PRESETS.filter((p) => p.category === category)),
    [category],
  )

  return (
    <Dialog open={open} onClose={onClose} variant="panel" width={880} hideHeader testId="toolbox-panel">
      <div className="flex items-center justify-between gap-4 border-b border-ink-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-ink-900">工具箱</h2>
          <SegmentedControl
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'presets', label: '预设目录' },
              { value: 'mine', label: '我的工具' },
            ]}
          />
        </div>
      </div>

      {tab === 'mine' ? (
        <EmptyState
          title="还没有自定义工具"
          description="在画布中选中一个分组后，使用「添加到工具箱」把它保存为可复用模板。"
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 px-6 py-3">
            {['全部', ...PRESET_CATEGORIES].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  'rounded-full px-3 py-1 text-[12px] transition-colors',
                  c === category ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                )}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="thin-scrollbar grid max-h-[54vh] grid-cols-3 gap-4 overflow-y-auto px-6 pb-6">
            {filtered.map((preset, index) => (
              <div
                key={preset.id}
                data-testid={`preset-${preset.id}`}
                className="group overflow-hidden rounded-2xl ring-1 ring-ink-100 transition-shadow hover:shadow-[var(--shadow-float)]"
              >
                <div
                  className="relative h-32"
                  style={{
                    background: `linear-gradient(${140 + index * 24}deg, hsl(${(index * 47) % 360} 58% 62%), hsl(${(index * 47 + 55) % 360} 55% 42%))`,
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      data-testid={`preset-use-${preset.id}`}
                      onClick={() => {
                        onUse(preset)
                        onClose()
                      }}
                      className="rounded-lg bg-white/95 px-3 py-1.5 text-[12px] font-medium text-ink-900 shadow-sm"
                    >
                      使用
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetail(preset)}
                      className="rounded-lg bg-white/80 px-3 py-1.5 text-[12px] text-ink-700 shadow-sm"
                    >
                      详情
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <div className="text-[13px] font-medium text-ink-900">{preset.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-400">
                    {preset.summary}
                  </div>
                  <div className="mt-2 text-[10px] text-ink-400">
                    {preset.nodes.length} 个节点 · {preset.edges.length} 条连线
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.name} width={420}>
        <div className="space-y-3 text-[13px] leading-relaxed text-ink-600">
          <p>{detail?.summary}</p>
          <div className="rounded-xl bg-ink-50 p-3 text-[12px]">
            <div className="mb-1.5 font-medium text-ink-700">模板会创建</div>
            <ul className="space-y-1 text-ink-500">
              {detail?.nodes.map((n) => (
                <li key={n.name}>· {n.name}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => {
              if (detail) onUse(detail)
              setDetail(null)
              onClose()
            }}
            className="w-full rounded-lg bg-ink-900 py-2 text-[13px] font-medium text-white"
          >
            使用该模板
          </button>
        </div>
      </Dialog>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ *
 * Style / effect market
 * ------------------------------------------------------------------ */

const MATERIAL_PAGE_SIZE = 6

export function MaterialPanel({
  open,
  kind,
  onClose,
  onApply,
}: {
  open: boolean
  kind: MaterialKind
  onClose: () => void
  onApply: (preset: { id: string; name: string; hue: number }, kind: MaterialKind) => void
}) {
  const [scope, setScope] = useState<MaterialScope>('market')
  const [category, setCategory] = useState('全部')
  const [commercialOnly, setCommercialOnly] = useState(false)
  const [modelId, setModelId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<MaterialCatalogItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [models, setModels] = useState<{ id: string; label: string }[]>([])
  const [page, setPage] = useState({ total: 0, hasMore: false, nextOffset: null as number | null })
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [detail, setDetail] = useState<MaterialCatalogItem | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    // A style-only scope, category or model must never leak into the effect
    // sheet when the parent switches kind while the panel stays mounted.
    setScope('market')
    setCategory('全部')
    setCommercialOnly(false)
    setModelId(null)
    setQuery('')
    setDetail(null)
    setError(null)
  }, [kind])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setItems([])
    void client.materials
      .list({
        kind,
        scope,
        category,
        commercialOnly,
        modelId,
        query,
        offset: 0,
        limit: MATERIAL_PAGE_SIZE,
      })
      .then((response) => {
        if (cancelled) return
        setItems(response.items)
        setCategories(response.categories)
        setModels(response.models)
        setPage({
          total: response.page.total,
          hasMore: response.page.hasMore,
          nextOffset: response.page.nextOffset,
        })
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof ApiError ? cause.message : '素材目录加载失败，请重试。')
        setPage({ total: 0, hasMore: false, nextOffset: null })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, kind, scope, category, commercialOnly, modelId, query, reloadToken])

  const loadMore = async () => {
    if (loading || loadingMore || !page.hasMore || page.nextOffset === null) return
    setLoadingMore(true)
    setError(null)
    try {
      const response = await client.materials.list({
        kind,
        scope,
        category,
        commercialOnly,
        modelId,
        query,
        offset: page.nextOffset,
        limit: MATERIAL_PAGE_SIZE,
      })
      setItems((current) => [...current, ...response.items])
      setPage({
        total: response.page.total,
        hasMore: response.page.hasMore,
        nextOffset: response.page.nextOffset,
      })
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : '更多素材加载失败，请重试。')
    } finally {
      setLoadingMore(false)
    }
  }

  const toggleFavourite = async (item: MaterialCatalogItem) => {
    const nextFavourite = !item.favourite
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, favourite: nextFavourite } : candidate))
    try {
      const response = await client.materials.setFavourite(item.id, nextFavourite)
      setItems((current) => current.map((candidate) => candidate.id === item.id ? response.material : candidate))
      setDetail((current) => current?.id === item.id ? response.material : current)
    } catch (cause: unknown) {
      setItems((current) => current.map((candidate) => candidate.id === item.id ? item : candidate))
      setError(cause instanceof ApiError ? cause.message : '收藏状态更新失败，请重试。')
    }
  }

  const showDetail = async (item: MaterialCatalogItem) => {
    setDetail(item)
    setDetailLoading(true)
    try {
      const response = await client.materials.get(item.id)
      setDetail(response.material)
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : '素材详情加载失败，请重试。')
    } finally {
      setDetailLoading(false)
    }
  }

  const apply = (item: MaterialCatalogItem) => {
    // Detail is a nested dialog with its own backdrop. Clear it before closing
    // the catalog so a subsequent style/effect sheet is never blocked by a
    // stale modal layer.
    setDetail(null)
    onApply({ id: item.id, name: item.name, hue: item.hue }, kind)
    onClose()
  }

  const dismissPanel = () => {
    setDetail(null)
    onClose()
  }

  const clearFilters = () => {
    setScope('market')
    setCategory('全部')
    setCommercialOnly(false)
    setModelId(null)
    setQuery('')
  }
  const filtersActive = category !== '全部' || commercialOnly || modelId !== null || query.trim().length > 0 || scope !== 'market'
  const scopeLabels = kind === 'style'
    ? { market: '风格广场', favorites: '我的收藏', recent: '最近使用' }
    : { market: '特效广场', favorites: '我的收藏', recent: '最近使用' }

  return (
    <Dialog open={open} onClose={dismissPanel} variant="panel" width={980} hideHeader testId="material-panel">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 px-6 py-4">
        <nav aria-label={kind === 'style' ? '风格来源' : '特效来源'} className="flex items-center gap-5">
          {(['market', 'favorites', 'recent'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-current={scope === value ? 'page' : undefined}
              aria-pressed={scope === value}
              onClick={() => {
                setScope(value)
                setCategory('全部')
              }}
              className={cn(
                'relative py-1 text-[14px] transition-colors after:absolute after:inset-x-1 after:-bottom-[17px] after:h-0.5 after:rounded-full',
                scope === value ? 'font-semibold text-ink-900 after:bg-ink-900' : 'text-ink-500 after:bg-transparent hover:text-ink-800',
              )}
            >
              {scopeLabels[value]}
            </button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 py-1.5">
            <IconSearch size={14} className="text-ink-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={kind === 'style' ? '搜索风格名称、作者' : '搜索特效名称、作者'}
              aria-label={kind === 'style' ? '搜索风格名称、作者' : '搜索特效名称、作者'}
              className="w-40 bg-transparent text-[12px] outline-none placeholder:text-ink-400"
            />
          </div>
          <label className={cn('flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors', commercialOnly ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600')}>
            <input
              type="checkbox"
              checked={commercialOnly}
              onChange={(event) => setCommercialOnly(event.target.checked)}
              className="sr-only"
            />
            <span className={cn('flex h-3.5 w-3.5 items-center justify-center rounded border', commercialOnly ? 'border-white/30 bg-white/15' : 'border-ink-300 bg-surface')}>
              {commercialOnly && <IconCheck size={10} />}
            </span>
            仅看可商用
          </label>
          <label className="flex items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 py-1.5 text-[12px] text-ink-600">
            <span className="text-ink-400">模型</span>
            <select
              value={modelId ?? ''}
              aria-label={kind === 'style' ? '筛选风格模型' : '筛选特效模型'}
              data-testid="material-model-filter"
              onChange={(event) => setModelId(event.target.value || null)}
              className="max-w-32 bg-transparent outline-none"
            >
              <option value="">全部</option>
              {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-ink-100 px-6 py-3">
        {categories.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={value === category}
            onClick={() => setCategory(value)}
            className={cn('rounded-full px-3 py-1 text-[12px] transition-colors', value === category ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200')}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-6 py-2 text-[11px] text-ink-400">
        <span data-testid="material-result-count" aria-live="polite">{page.total} 个结果</span>
        {filtersActive && <button type="button" data-testid="material-clear-filters" onClick={clearFilters} className="rounded px-1.5 py-0.5 text-ink-500 hover:bg-ink-50 hover:text-ink-900">清除筛选</button>}
      </div>

      <div className="thin-scrollbar max-h-[54vh] overflow-y-auto px-6 pb-6">
        {loading ? (
          <div className="flex min-h-48 items-center justify-center" data-testid="material-loading"><Spinner /></div>
        ) : error && items.length === 0 ? (
          <EmptyState
            title="素材目录暂时不可用"
            description={error}
            action={<button type="button" data-testid="material-retry" onClick={() => setReloadToken((value) => value + 1)} className="rounded-lg bg-ink-900 px-3 py-1.5 text-[12px] font-medium text-white">重试</button>}
          />
        ) : items.length === 0 ? (
          <div data-testid="material-empty"><EmptyState title="没有匹配的结果" description="调整分类、商用筛选、模型或搜索词后重试。" /></div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3.5">
              {items.map((item) => (
                <div
                  key={item.id}
                  data-testid={`material-${item.id}`}
                  role="group"
                  aria-label={`${item.name}素材卡`}
                  className="group overflow-hidden rounded-xl text-left ring-1 ring-ink-100 transition-shadow hover:shadow-[var(--shadow-float)]"
                >
                  <div className="relative h-28" style={{ background: `linear-gradient(140deg, hsl(${item.hue} 62% 62%), hsl(${(item.hue + 45) % 360} 58% 42%))` }}>
                    <div className="absolute left-2 top-2 rounded bg-black/25 px-1.5 py-0.5 text-[10px] text-white" data-testid={`material-model-${item.id}`}>{item.modelLabel}</div>
                    <button
                      type="button"
                      aria-label={`${item.name}${item.favourite ? '取消收藏' : '收藏'}`}
                      data-testid={`material-favourite-${item.id}`}
                      onClick={(event) => { event.stopPropagation(); void toggleFavourite(item) }}
                      className="absolute right-2 top-2 rounded-full bg-black/25 px-1.5 py-0.5 text-[15px] leading-5 text-white hover:bg-black/45"
                    >
                      {item.favourite ? '★' : '☆'}
                    </button>
                    <div className="absolute inset-x-2 bottom-2 z-20 flex items-center justify-end gap-1">
                      <button type="button" data-testid={`material-detail-${item.id}`} onClick={(event) => { event.stopPropagation(); void showDetail(item) }} className="rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-medium text-ink-800 shadow-sm">详情</button>
                      <button type="button" data-testid={`material-apply-${item.id}`} onClick={(event) => { event.stopPropagation(); apply(item) }} className="rounded-lg bg-ink-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm">应用</button>
                    </div>
                  </div>
                  <div className="p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 truncate text-[12px] font-medium text-ink-900">{item.name}</div>
                      {item.commercial && <span className="shrink-0 rounded bg-success/12 px-1 text-[10px] text-success">可商用</span>}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-1.5 text-[10px] text-ink-400">
                      <span className="truncate">{item.author}</span>
                      <span className="shrink-0">{item.usageCount.toLocaleString('zh-CN')} 次使用</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {error && <div role="alert" className="mt-3 rounded-lg bg-danger/8 px-3 py-2 text-[11px] text-danger">{error}</div>}
            <div className="flex justify-center pt-4">
              {page.hasMore ? (
                <button type="button" data-testid="material-load-more" onClick={() => void loadMore()} disabled={loadingMore} className="rounded-lg border border-ink-200 px-4 py-2 text-[12px] font-medium text-ink-600 transition-colors hover:bg-ink-50 disabled:cursor-wait disabled:opacity-60">
                  {loadingMore ? <span className="flex items-center gap-2"><Spinner />加载中…</span> : '加载更多'}
                </button>
              ) : <span className="text-[11px] text-ink-400">已展示全部结果</span>}
            </div>
          </>
        )}
      </div>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.name} width={440}>
        {detail && (
          <div className="space-y-4 text-[13px] leading-relaxed text-ink-600">
            <div className="h-36 rounded-xl" style={{ background: `linear-gradient(140deg, hsl(${detail.hue} 62% 62%), hsl(${(detail.hue + 45) % 360} 58% 42%))` }} />
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
              <span>{detail.author}</span><span>·</span><span>{detail.modelLabel}</span><span>·</span><span>{detail.usageCount.toLocaleString('zh-CN')} 次使用</span>
              {detail.commercial && <span className="rounded bg-success/12 px-1.5 py-0.5 text-success">可商用</span>}
            </div>
            <p>{detail.description}</p>
            <div className="rounded-xl bg-ink-50 p-3 text-[12px]">
              <div className="mb-1 font-medium text-ink-700">支持模型</div>
              <div className="flex flex-wrap gap-1.5">{detail.modelIds.map((id) => <span key={id} className="rounded bg-surface px-2 py-1 text-ink-500">{id}</span>)}</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" data-testid={`material-detail-favourite-${detail.id}`} onClick={() => void toggleFavourite(detail)} className="rounded-lg border border-ink-200 px-3 py-2 text-[12px] text-ink-600">{detail.favourite ? '取消收藏' : '收藏'}</button>
              <button type="button" data-testid={`material-detail-apply-${detail.id}`} onClick={() => apply(detail)} className="flex-1 rounded-lg bg-ink-900 py-2 text-[13px] font-medium text-white">应用并创建{kind === 'style' ? '风格' : '特效'}节点</button>
            </div>
            {detailLoading && <div className="flex items-center gap-2 text-[11px] text-ink-400"><Spinner />同步详情…</div>}
          </div>
        )}
      </Dialog>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ *
 * Character library
 * ------------------------------------------------------------------ */

export function CharacterPanel({
  open,
  onClose,
  onApply,
}: {
  open: boolean
  onClose: () => void
  onApply: (character: CharacterPreset) => void
}) {
  // The official drawer opens in browse mode: a character must be chosen
  // before its four references can be applied to the canvas.
  const [selected, setSelected] = useState<CharacterPreset | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')

  const visible = useMemo(
    () =>
      CHARACTER_PRESETS.filter((c) =>
        Object.entries(filters).every(([key, value]) => {
          if (!value || value === '全部') return true
          const field = {
            性别: c.gender,
            年龄: c.age,
            种族: c.ethnicity,
            时代: c.era,
            文化区域: c.culture,
            体型: c.build,
            发色: c.hair,
          }[key]
          return field === value
        }) && `${c.name} ${c.tags.join(' ')}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery),
      ),
    [filters, normalizedQuery],
  )
  const filtersActive = Boolean(
    normalizedQuery.length > 0 || Object.values(filters).some((value) => value && value !== '全部'),
  )

  useEffect(() => {
    if (selected && !visible.some((character) => character.id === selected.id)) setSelected(null)
  }, [selected, visible])

  return (
    <Dialog open={open} onClose={onClose} variant="panel" width={900} hideHeader testId="character-panel">
      <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
        <h2 className="text-[15px] font-semibold text-ink-900">角色库</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 py-1.5">
            <IconSearch size={13} className="text-ink-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索角色或标签"
              aria-label="搜索角色或标签"
              className="w-36 bg-transparent text-[12px] outline-none placeholder:text-ink-400"
            />
          </div>
          {filtersActive && (
            <button
              type="button"
              data-testid="character-filter-clear"
              onClick={() => {
                setQuery('')
                setFilters({})
              }}
              className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              清除
            </button>
          )}
          <button
            type="button"
            data-testid="character-filter-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-[12px] transition-colors',
              filtersOpen || filtersActive ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600',
            )}
          >
            筛选
            {filtersActive && <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px]">{visible.length}</span>}
          </button>
        </div>
      </div>

      {filtersOpen && (
        <div className="thin-scrollbar max-h-56 overflow-y-auto border-b border-ink-100 bg-ink-50 px-6 py-3">
          {Object.entries(CHARACTER_FILTERS).map(([label, options]) => (
            <div key={label} className="flex items-start gap-3 py-1.5">
              <span className="w-16 shrink-0 pt-1 text-[12px] text-ink-500">{label}</span>
              <div className="flex flex-wrap gap-1.5">
                {options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFilters((f) => ({ ...f, [label]: option }))}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] transition-colors',
                      (filters[label] ?? '全部') === option
                        ? 'bg-ink-900 text-white'
                        : 'bg-surface text-ink-600 hover:bg-ink-100',
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail: the four reference categories that应用 creates as nodes. */}
      <div className="px-6 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[14px] font-semibold text-ink-900">{selected?.name ?? '请选择角色'}</div>
            {selected ? <div className="mt-0.5 flex gap-1.5">
              {selected.tags.map((tag) => (
                <span key={tag} className="rounded bg-ink-100 px-1.5 py-px text-[10px] text-ink-500">
                  {tag}
                </span>
              ))}
            </div> : <div className="mt-0.5 text-[11px] text-ink-400">从下方角色库选择后查看参考并应用至画布。</div>}
          </div>
          <button
            type="button"
            data-testid="character-apply"
            disabled={!selected}
            onClick={() => {
              if (!selected) return
              onApply(selected)
              onClose()
            }}
            className="rounded-lg bg-ink-900 px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            应用至画布
          </button>
        </div>
        {visible.length === 0 ? (
          <EmptyState compact title="没有匹配的角色" description="调整搜索词或筛选条件后重试。" />
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {selected ? selected.references.map((ref) => (
              <div key={ref.key} className="overflow-hidden rounded-xl ring-1 ring-ink-100">
                <div
                  className="h-32"
                  style={{
                    background: `linear-gradient(150deg, hsl(${ref.hue} 55% 66%), hsl(${(ref.hue + 40) % 360} 50% 44%))`,
                  }}
                />
                <div className="p-2 text-[11px] text-ink-600">{ref.label}</div>
              </div>
            )) : <div className="col-span-4 rounded-xl border border-dashed border-ink-200 px-4 py-8 text-center text-[12px] text-ink-400">选择角色后显示角色立绘、脸部近景、表情参考和三视图。</div>}
          </div>
        )}
      </div>

      <div className="thin-scrollbar flex gap-3 overflow-x-auto border-t border-ink-100 px-6 py-4">
        {visible.map((character) => (
          <button
            key={character.id}
            type="button"
            onClick={() => setSelected(character)}
            className={cn(
              'shrink-0 overflow-hidden rounded-xl text-left ring-1 transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
              character.id === selected?.id ? 'ring-2 ring-accent' : 'ring-ink-100 hover:shadow-[var(--shadow-float)]',
            )}
            style={{ width: 108 }}
          >
            <div
              className="h-24"
              style={{
                background: `linear-gradient(150deg, hsl(${character.references[0].hue} 55% 66%), hsl(${(character.references[0].hue + 40) % 360} 50% 44%))`,
              }}
            />
            <div className="truncate p-1.5 text-[11px] text-ink-700">{character.name}</div>
          </button>
        ))}
        {visible.length === 0 && <span className="self-center text-[11px] text-ink-400">清除筛选后查看角色目录</span>}
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ *
 * Generation history (assets produced by jobs, not workflow revisions)
 * ------------------------------------------------------------------ */

export function HistoryPanel({
  open,
  onClose,
  onInsert,
}: {
  open: boolean
  onClose: () => void
  onInsert: (artifact: Artifact) => void
}) {
  const jobs = useEditor((s) => s.jobs)
  const [scope, setScope] = useState<HistoryScope>('canvas')
  const [sort, setSort] = useState<HistorySort>('newest')

  const artifacts = useMemo(() => {
    return projectHistoryArtifacts(jobs, { scope, sort })
  }, [jobs, scope, sort])

  return (
    <Dialog open={open} onClose={onClose} variant="panel" width={900} hideHeader testId="history-panel">
      <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-ink-900">生成历史</h2>
          <SegmentedControl
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'canvas', label: '本画布', testId: 'history-scope-canvas' },
              { value: 'image', label: '图片' },
              { value: 'video', label: '视频' },
              { value: 'audio', label: '音频' },
            ]}
          />
        </div>
        <button
          type="button"
          data-testid="history-sort-toggle"
          onClick={() => setSort(sort === 'newest' ? 'oldest' : 'newest')}
          className="rounded-lg bg-ink-100 px-2.5 py-1.5 text-[12px] text-ink-600"
        >
          {sort === 'newest' ? '最新在前' : '最早在前'}
        </button>
      </div>

      <div className="thin-scrollbar max-h-[56vh] overflow-y-auto p-6">
        {artifacts.length === 0 ? (
          <EmptyState
            icon={<IconHistory size={30} />}
            title="暂无生成记录"
            description="这里记录图片、视频和音频的生成资产，与工作流版本历史是两回事。"
          />
        ) : (
          <div className="grid grid-cols-4 gap-3.5">
            {artifacts.map((artifact) => (
              <button
                key={artifact.id}
                type="button"
                data-testid={`history-artifact-${artifact.id}`}
                onClick={() => {
                  onInsert(artifact)
                  onClose()
                }}
                className="overflow-hidden rounded-xl text-left ring-1 ring-ink-100 transition-shadow hover:shadow-[var(--shadow-float)]"
              >
                {artifact.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={artifact.thumbnailUrl} alt="" className="h-28 w-full object-cover" />
                ) : (
                  <div className="h-28 w-full bg-ink-100" />
                )}
                <div className="p-2 text-[10px] text-ink-400">
                  {artifact.width && artifact.height ? `${artifact.width}×${artifact.height}` : '音频'}
                  {artifact.durationSeconds ? ` · ${artifact.durationSeconds}s` : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  )
}

export type { WorkflowNode }
