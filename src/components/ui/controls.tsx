'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Inline rename field used by project cards, canvas switcher and node rows. */
export function InlineRename({
  value,
  onCommit,
  onCancel,
  className,
  testId,
}: {
  value: string
  onCommit: (next: string) => void
  onCancel: () => void
  className?: string
  testId?: string
}) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <input
      ref={ref}
      value={draft}
      data-testid={testId}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          // An empty name silently keeps the original rather than erroring.
          onCommit(draft.trim() || value)
        }
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={() => onCommit(draft.trim() || value)}
      className={cn(
        'w-full rounded-md border border-accent bg-surface px-1.5 py-0.5 text-[13px] outline-none',
        className,
      )}
    />
  )
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: { value: T; label: ReactNode; testId?: string }[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className={cn('flex items-center gap-0.5 rounded-xl bg-ink-100 p-1', size === 'sm' && 'p-0.5')}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            data-testid={option.testId}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg font-medium transition-all',
              size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[13px]',
              active ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1.5">
      <span className="min-w-0">
        <span className="block text-[13px] text-ink-700">{label}</span>
        {description && <span className="block text-[11px] text-ink-400">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-ink-200',
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-[19px]' : 'translate-x-[3px]',
          )}
        />
      </button>
    </label>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  label: string
  format?: (value: number) => string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-ink-500">{label}</span>
        <span className="font-mono text-ink-700">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-ink-200 accent-[var(--color-accent)]"
      />
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[12px] font-medium text-ink-500">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-ink-400">{hint}</div>}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-1.5 py-8' : 'gap-2.5 py-16',
      )}
    >
      {icon && <div className="text-ink-300">{icon}</div>}
      <div className={cn('font-medium text-ink-500', compact ? 'text-[12px]' : 'text-[13px]')}>{title}</div>
      {description && <div className="max-w-xs text-[12px] leading-relaxed text-ink-400">{description}</div>}
      {action && <div className="pt-1.5">{action}</div>}
    </div>
  )
}

export function Chip({
  children,
  onRemove,
  icon,
  tone = 'default',
  onClick,
  testId,
}: {
  children: ReactNode
  onRemove?: () => void
  icon?: ReactNode
  tone?: 'default' | 'accent'
  onClick?: () => void
  testId?: string
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-flex max-w-[190px] items-center gap-1 rounded-full px-2 py-[3px] text-[11px]',
        tone === 'accent' ? 'bg-accent-soft text-accent-ink' : 'bg-ink-100 text-ink-600',
        onClick && 'cursor-pointer hover:bg-ink-200',
      )}
      onClick={onClick}
    >
      {icon}
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label="移除"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-0.5 rounded-full text-ink-400 transition-colors hover:text-ink-700"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </span>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.2" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-ink-100">
      <div
        className="h-full rounded-full bg-running transition-[width] duration-500 ease-out"
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  )
}
