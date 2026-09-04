'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CHARACTER_FILTERS,
  CHARACTER_PRESETS,
  EFFECT_CATEGORIES,
  EFFECT_PRESETS,
  STYLE_CATEGORIES,
  STYLE_PRESETS,
  type CharacterPreset,
} from '@/domain/libraries'
import { PRESET_CATEGORIES, TOOLBOX_PRESETS, type ToolboxPreset } from '@/domain/presets'
import type { Artifact, WorkflowNode } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { Dialog } from '../ui/Dialog'
import { EmptyState, SegmentedControl } from '../ui/controls'
import { IconCheck, IconHistory, IconSearch } from '../icons'

export type MaterialTab = 'market' | 'favorites' | 'recent'

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
  }> = {},
): T[] {
  const kind = options.kind ?? 'style'
  const tab = options.tab ?? 'market'
  const category = options.category ?? '全部'
  const query = options.query?.trim().toLocaleLowerCase('zh-CN') ?? ''
  const favorites = new Set(['style-cine-teal', 'style-film-grain', 'style-soft-portrait'])
  const recent = new Set(['style-cine-teal', 'style-noir', 'style-isometric', 'style-anime-cel'])

  return items.filter((item) => {
    if (kind === 'style' && tab === 'favorites' && !favorites.has(item.id)) return false
    if (kind === 'style' && tab === 'recent' && !recent.has(item.id)) return false
    if (category !== '全部' && item.category !== category) return false
    if (options.commercialOnly && !item.commercial) return false
    if (query && !`${item.name}\n${item.author}\n${item.id}`.toLocaleLowerCase('zh-CN').includes(query)) return false
    return true
  })
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

export function MaterialPanel({
  open,
  kind,
  onClose,
  onApply,
}: {
  open: boolean
  kind: 'style' | 'effect'
  onClose: () => void
  onApply: (preset: { id: string; name: string; hue: number }, kind: 'style' | 'effect') => void
}) {
  const [tab, setTab] = useState<'market' | 'favorites' | 'recent'>('market')
  const [category, setCategory] = useState('全部')
  const [commercialOnly, setCommercialOnly] = useState(false)
  const [query, setQuery] = useState('')

  const categories = kind === 'style' ? STYLE_CATEGORIES : EFFECT_CATEGORIES

  useEffect(() => {
    // A style-only tab or category should never leak into the effect sheet
    // when the parent switches kind while the panel stays mounted.
    setTab('market')
    setCategory('全部')
    setCommercialOnly(false)
    setQuery('')
  }, [kind])

  const filtered = useMemo(() => {
    const options = { kind, tab, category, commercialOnly, query }
    return kind === 'style'
      ? filterMaterialPresets(STYLE_PRESETS, options)
      : filterMaterialPresets(EFFECT_PRESETS, options)
  }, [kind, tab, category, commercialOnly, query])
  const filtersActive = category !== '全部' || commercialOnly || query.trim().length > 0 || tab !== 'market'

  return (
    <Dialog open={open} onClose={onClose} variant="panel" width={880} hideHeader testId="material-panel">
      <div className="flex items-center justify-between gap-4 border-b border-ink-100 px-6 py-4">
        {kind === 'style' ? (
          <nav aria-label="风格来源" className="flex items-center gap-5">
            {[
              ['market', '风格广场'],
              ['favorites', '我的收藏'],
              ['recent', '最近使用'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-current={tab === value ? 'page' : undefined}
                aria-pressed={tab === value}
                onClick={() => {
                  setTab(value as typeof tab)
                  setCategory('全部')
                }}
                className={cn(
                  'relative py-1 text-[14px] transition-colors after:absolute after:inset-x-1 after:-bottom-[17px] after:h-0.5 after:rounded-full',
                  tab === value
                    ? 'font-semibold text-ink-900 after:bg-ink-900'
                    : 'text-ink-500 after:bg-transparent hover:text-ink-800',
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        ) : (
          <h2 className="text-[15px] font-semibold text-ink-900">特效库</h2>
        )}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 py-1.5">
            <IconSearch size={14} className="text-ink-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={kind === 'style' ? '搜索风格名称、作者' : '搜索特效名称、作者'}
              aria-label={kind === 'style' ? '搜索风格名称、作者' : '搜索特效名称、作者'}
              className="w-40 bg-transparent text-[12px] outline-none placeholder:text-ink-400"
            />
          </div>
          <label
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors',
              commercialOnly ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600',
            )}
          >
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
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 px-6 py-3">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={c === category}
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

      <div className="flex items-center justify-between px-6 pb-1 text-[11px] text-ink-400">
        <span data-testid="material-result-count" aria-live="polite">
          {filtered.length} 个结果
        </span>
        {filtersActive && (
          <button
            type="button"
            data-testid="material-clear-filters"
            onClick={() => {
              setTab('market')
              setCategory('全部')
              setCommercialOnly(false)
              setQuery('')
            }}
            className="rounded px-1.5 py-0.5 text-ink-500 hover:bg-ink-50 hover:text-ink-900"
          >
            清除筛选
          </button>
        )}
      </div>

      <div className="thin-scrollbar grid max-h-[54vh] grid-cols-4 gap-3.5 overflow-y-auto px-6 pb-6">
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`material-${item.id}`}
            onClick={() => {
              onApply({ id: item.id, name: item.name, hue: item.hue }, kind)
              onClose()
            }}
            className="overflow-hidden rounded-xl text-left ring-1 ring-ink-100 transition-shadow hover:shadow-[var(--shadow-float)]"
          >
            <div
              className="h-28"
              style={{
                background: `linear-gradient(140deg, hsl(${item.hue} 62% 62%), hsl(${(item.hue + 45) % 360} 58% 42%))`,
              }}
            />
            <div className="p-2.5">
              <div className="truncate text-[12px] font-medium text-ink-900">{item.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-400">
                <span className="truncate">{item.author}</span>
                {item.commercial && (
                  <span className="rounded bg-success/12 px-1 text-success">可商用</span>
                )}
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-4" data-testid="material-empty">
            <EmptyState title="没有匹配的结果" description="调整分类、商用筛选或搜索词后重试。" />
          </div>
        )}
      </div>
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
  const [selected, setSelected] = useState<CharacterPreset>(CHARACTER_PRESETS[0])
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
    if (visible.length > 0 && !visible.some((character) => character.id === selected.id)) setSelected(visible[0])
  }, [selected.id, visible])

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
            <div className="text-[14px] font-semibold text-ink-900">{selected.name}</div>
            <div className="mt-0.5 flex gap-1.5">
              {selected.tags.map((tag) => (
                <span key={tag} className="rounded bg-ink-100 px-1.5 py-px text-[10px] text-ink-500">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            data-testid="character-apply"
            onClick={() => {
              onApply(selected)
              onClose()
            }}
            className="rounded-lg bg-ink-900 px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
          >
            应用至画布
          </button>
        </div>
        {visible.length === 0 ? (
          <EmptyState compact title="没有匹配的角色" description="调整搜索词或筛选条件后重试。" />
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {selected.references.map((ref) => (
              <div key={ref.key} className="overflow-hidden rounded-xl ring-1 ring-ink-100">
                <div
                  className="h-32"
                  style={{
                    background: `linear-gradient(150deg, hsl(${ref.hue} 55% 66%), hsl(${(ref.hue + 40) % 360} 50% 44%))`,
                  }}
                />
                <div className="p-2 text-[11px] text-ink-600">{ref.label}</div>
              </div>
            ))}
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
              character.id === selected.id ? 'ring-2 ring-accent' : 'ring-ink-100 hover:shadow-[var(--shadow-float)]',
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
  const [tab, setTab] = useState<'image' | 'video' | 'audio'>('image')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')

  const artifacts = useMemo(() => {
    const all = jobs.flatMap((job) => job.artifacts).filter((a) => a.kind === tab)
    return all.sort((a, b) =>
      sort === 'newest' ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt),
    )
  }, [jobs, tab, sort])

  return (
    <Dialog open={open} onClose={onClose} variant="panel" width={900} hideHeader testId="history-panel">
      <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-ink-900">生成历史</h2>
          <SegmentedControl
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'image', label: '图片' },
              { value: 'video', label: '视频' },
              { value: 'audio', label: '音频' },
            ]}
          />
        </div>
        <button
          type="button"
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
