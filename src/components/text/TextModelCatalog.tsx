'use client'

import { useEffect, useState } from 'react'
import { modelsFor, type ModelDefinition } from '@/domain/models'
import { cn } from '@/lib/cn'
import { IconCheck } from '../icons'

interface TextModelCatalogProps {
  selectedId: string | null
  onSelect: (model: ModelDefinition) => void
  onClose: () => void
}

/** Four-row catalogue captured from the current Text generator selector. */
export function TextModelCatalog({ selectedId, onSelect, onClose }: TextModelCatalogProps) {
  const models = modelsFor('text')
  const [activeIndex, setActiveIndex] = useState(
    Math.max(0, models.findIndex((model) => model.id === selectedId)),
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setActiveIndex((index) => (index + direction + models.length) % models.length)
      }
      if (event.key === 'Enter' && models[activeIndex]) {
        event.preventDefault()
        onSelect(models[activeIndex])
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [activeIndex, models, onClose, onSelect])

  return (
    <div
      role="dialog"
      aria-label="文本模型目录"
      aria-modal="false"
      data-testid="text-model-catalog"
      className="absolute bottom-11 left-1 z-50 w-[360px] overflow-hidden rounded-2xl border border-white/10 bg-[#292929] p-2 shadow-[0_18px_55px_rgba(0,0,0,0.58)]"
    >
      <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium text-ink-500">文本模型</div>
      <div className="space-y-1">
        {models.map((model, index) => {
          const selected = model.id === selectedId
          return (
            <button
              key={model.id}
              type="button"
              data-testid={`text-model-option-${model.id}`}
              aria-current={selected ? 'true' : undefined}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelect(model)}
              className={cn(
                'flex min-h-[62px] w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors',
                selected ? 'bg-white/10' : index === activeIndex ? 'bg-white/[0.065]' : 'hover:bg-white/[0.055]',
              )}
            >
              <TextModelMark label={model.label} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-ink-900">{model.label}</span>
                  <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] tabular-nums text-ink-400">
                    {model.latencyLabel}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-ink-400">{model.description}</span>
              </span>
              {selected && <IconCheck size={14} className="shrink-0 text-[#7aa7ff]" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TextModelMark({ label }: { label?: string }) {
  const letters = label?.startsWith('Qwen') ? 'Q' : label?.startsWith('CVLM') ? 'C' : 'G'
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#445780] to-[#202634] text-[13px] font-semibold text-white/90 ring-1 ring-white/10"
    >
      {letters}
    </span>
  )
}
