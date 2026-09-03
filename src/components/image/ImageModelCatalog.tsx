'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { modelsFor, type ModelDefinition } from '@/domain/models'
import { cn } from '@/lib/cn'
import { IconCheck, IconClose, IconSearch } from '../icons'

export interface ImageModelCatalogProps {
  currentId: string | null
  onSelect: (model: ModelDefinition) => void
  onClose: () => void
  className?: string
}

/** Searchable, keyboard-driven catalogue shared by Image authoring surfaces. */
export function ImageModelCatalog({ currentId, onSelect, onClose, className }: ImageModelCatalogProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const models = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN')
    if (!needle) return modelsFor('image')
    return modelsFor('image').filter((model) =>
      [model.id, model.label, model.provider, model.description, ...(model.tags ?? [])]
        .join('\n')
        .toLocaleLowerCase('zh-CN')
        .includes(needle),
    )
  }, [query])

  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => setActiveIndex(0), [query])

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="图片模型目录"
      data-testid="image-model-catalog"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
          return
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          const direction = event.key === 'ArrowDown' ? 1 : -1
          setActiveIndex((index) => (index + direction + Math.max(models.length, 1)) % Math.max(models.length, 1))
        }
        if (event.key === 'Enter' && models[activeIndex]) {
          event.preventDefault()
          onSelect(models[activeIndex])
        }
      }}
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#292929] p-2 shadow-[0_18px_55px_rgba(0,0,0,0.55)]',
        className,
      )}
    >
      <div className="flex items-center gap-2 px-1 pb-2">
        <label className="flex h-9 flex-1 items-center gap-2 rounded-xl bg-black/20 px-3 text-ink-500 focus-within:ring-1 focus-within:ring-white/15">
          <IconSearch size={14} />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索图片模型"
            aria-label="搜索图片模型"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-ink-800 outline-none placeholder:text-ink-400"
          />
        </label>
        <button
          type="button"
          aria-label="关闭模型目录"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-white/8 hover:text-ink-800"
        >
          <IconClose size={14} />
        </button>
      </div>
      <div className="flex items-center justify-between px-2 pb-1 text-[10px] text-ink-400">
        <span>图片模型</span>
        <span>{models.length} 个结果</span>
      </div>
      <div className="thin-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {models.map((model, index) => {
          const selected = model.id === currentId
          return (
            <button
              key={model.id}
              type="button"
              data-testid={`image-model-option-${model.id}`}
              aria-current={selected ? 'true' : undefined}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelect(model)}
              className={cn(
                'flex min-h-[58px] w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors',
                selected ? 'bg-white/10' : index === activeIndex ? 'bg-white/[0.065]' : 'hover:bg-white/[0.055]',
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.055]">
                <ImageModelMark iconKey={model.iconKey} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium text-ink-900">{model.label}</span>
                  {model.tags?.includes('风格上新') && (
                    <span className="rounded-full bg-[#5bdcf5]/18 px-1.5 py-0.5 text-[9px] text-[#72dcf3]">风格上新</span>
                  )}
                </span>
                <span className="block truncate text-[10px] text-ink-400">{model.description}</span>
              </span>
              <span className="rounded-full bg-white/[0.055] px-2 py-1 text-[10px] tabular-nums text-ink-500">
                {model.latencyLabel}
              </span>
              {selected && <IconCheck size={13} className="shrink-0 text-accent" />}
            </button>
          )
        })}
        {models.length === 0 && (
          <div className="flex h-32 items-center justify-center text-[12px] text-ink-400">没有匹配的图片模型</div>
        )}
      </div>
    </div>
  )
}

export function ImageModelMark({ iconKey }: { iconKey?: string }) {
  return (
    <span
      data-model-icon={iconKey ?? 'generic'}
      className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.07] text-ink-800"
      aria-hidden="true"
    >
      {iconKey === 'midjourney' ? (
        <span className="text-[14px] leading-none">⌁</span>
      ) : iconKey === 'navo' ? (
        <span className="text-[13px] font-semibold leading-none">×</span>
      ) : (
        <span className="flex gap-[2px]">
          <i className="h-2.5 w-1 rounded-full border border-current" />
          <i className="h-2.5 w-1 rounded-full border border-current" />
          <i className="h-2.5 w-1 rounded-full border border-current" />
        </span>
      )}
    </span>
  )
}

export function formatImageOutputSummary(output: {
  aspectRatio?: string
  quality?: string
  resolution?: string
  count?: number
}): string {
  const quality = { low: '低画质', standard: '标准画质', high: '高画质' }[output.quality ?? 'standard'] ?? '标准画质'
  return `${output.aspectRatio ?? '16:9'} · ${quality} · ${output.resolution ?? '2K'} · ${output.count ?? 1}张`
}
