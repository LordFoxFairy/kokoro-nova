'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { IconCheck, IconChevronRight } from '../icons'

export interface MenuItem {
  id: string
  label: string
  icon?: ReactNode
  badge?: string
  disabled?: boolean
  disabledReason?: string
  danger?: boolean
  checked?: boolean
  shortcut?: string
  submenu?: MenuItem[]
  onSelect?: () => void
}

export interface MenuSection {
  title?: string
  items: MenuItem[]
}

interface MenuProps {
  sections: MenuSection[]
  onClose: () => void
  /** Viewport anchor; the menu flips if it would overflow. */
  anchor: { x: number; y: number }
  placement?: 'below' | 'above'
  align?: 'start' | 'end'
  width?: number
}

/**
 * Floating menu with click-away, Escape, keyboard navigation and viewport
 * flipping. Submenus open on hover to the side that has room.
 */
export function Menu({ sections, onClose, anchor, placement = 'below', align = 'start', width = 208 }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: anchor.x, top: anchor.y, ready: false })
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)

  const flat = sections.flatMap((s) => s.items)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 8
    let left = align === 'end' ? anchor.x - rect.width : anchor.x
    let top = placement === 'above' ? anchor.y - rect.height : anchor.y

    if (left + rect.width > window.innerWidth - margin) left = window.innerWidth - rect.width - margin
    if (left < margin) left = margin
    if (top + rect.height > window.innerHeight - margin) {
      top = Math.max(margin, anchor.y - rect.height)
    }
    if (top < margin) top = margin

    setPosition({ left, top, ready: true })
  }, [anchor.x, anchor.y, align, placement])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setActiveIndex((current) => {
          let next = current
          for (let i = 0; i < flat.length; i += 1) {
            next = (next + step + flat.length) % flat.length
            if (!flat[next].disabled) return next
          }
          return current
        })
      }
      if (event.key === 'Enter' && activeIndex >= 0) {
        const item = flat[activeIndex]
        if (item && !item.disabled && !item.submenu) {
          event.preventDefault()
          item.onSelect?.()
          onClose()
        }
      }
    }
    // Capture phase so a menu inside a dialog closes before the dialog does.
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onClose, flat, activeIndex])

  let runningIndex = -1

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="menu"
      className="panel fixed z-[70] overflow-visible py-1.5"
      style={{
        left: position.left,
        top: position.top,
        width,
        opacity: position.ready ? 1 : 0,
      }}
    >
      {sections.map((section, sectionIndex) => (
        <div key={section.title ?? sectionIndex}>
          {sectionIndex > 0 && <div className="my-1.5 h-px bg-ink-100" />}
          {section.title && (
            <div className="px-3 pb-1 pt-1.5 text-[11px] font-medium text-ink-400">{section.title}</div>
          )}
          {section.items.map((item) => {
            runningIndex += 1
            const index = runningIndex
            return (
              <MenuRow
                key={item.id}
                item={item}
                active={index === activeIndex}
                submenuOpen={openSubmenu === item.id}
                onHover={() => {
                  setActiveIndex(index)
                  setOpenSubmenu(item.submenu ? item.id : null)
                }}
                onSelect={() => {
                  if (item.disabled || item.submenu) return
                  item.onSelect?.()
                  onClose()
                }}
                onSubmenuSelect={() => onClose()}
                onSubmenuEnter={() => setOpenSubmenu(item.id)}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

function MenuRow({
  item,
  active,
  submenuOpen,
  onHover,
  onSelect,
  onSubmenuSelect,
  onSubmenuEnter,
}: {
  item: MenuItem
  active: boolean
  submenuOpen: boolean
  onHover: () => void
  onSelect: () => void
  onSubmenuSelect: () => void
  onSubmenuEnter: () => void
}) {
  const rowRef = useRef<HTMLButtonElement>(null)
  const [submenuAnchor, setSubmenuAnchor] = useState<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    if (!submenuOpen || !rowRef.current) {
      setSubmenuAnchor(null)
      return
    }
    const rect = rowRef.current.getBoundingClientRect()
    setSubmenuAnchor({ x: rect.right + 4, y: rect.top - 6 })
  }, [submenuOpen])

  return (
    <>
      <button
        ref={rowRef}
        type="button"
        role="menuitem"
        disabled={item.disabled}
        title={item.disabled ? item.disabledReason : undefined}
        onMouseEnter={onHover}
        onClick={onSelect}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-[13px] transition-colors',
          item.disabled
            ? 'cursor-not-allowed text-ink-300'
            : item.danger
              ? 'text-danger hover:bg-danger/8'
              : 'text-ink-700 hover:bg-ink-50',
          active && !item.disabled && (item.danger ? 'bg-danger/8' : 'bg-ink-50'),
        )}
      >
        {item.icon && <span className="shrink-0 text-ink-500">{item.icon}</span>}
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge && (
          <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-medium text-accent-ink">
            {item.badge}
          </span>
        )}
        {item.checked && <IconCheck size={14} className="text-accent" />}
        {item.shortcut && <span className="font-mono text-[11px] text-ink-400">{item.shortcut}</span>}
        {item.submenu && <IconChevronRight size={14} className="text-ink-400" />}
      </button>
      {submenuOpen && submenuAnchor && item.submenu && (
        <div onMouseEnter={onSubmenuEnter}>
          <Menu
            sections={[{ items: item.submenu }]}
            anchor={submenuAnchor}
            onClose={onSubmenuSelect}
            width={196}
          />
        </div>
      )}
    </>
  )
}

/** Convenience hook: track an anchor point for a trigger element. */
export function useMenuAnchor() {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const openFrom = (event: React.MouseEvent, placement: 'below' | 'above' | 'point' = 'below') => {
    event.preventDefault()
    event.stopPropagation()
    if (placement === 'point') {
      setAnchor({ x: event.clientX, y: event.clientY })
      return
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setAnchor(placement === 'below' ? { x: rect.left, y: rect.bottom + 6 } : { x: rect.left, y: rect.top - 6 })
  }
  return { anchor, setAnchor, openFrom, close: () => setAnchor(null) }
}
