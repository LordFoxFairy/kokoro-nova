'use client'

import { useRef, useState, type ReactNode } from 'react'

interface TooltipProps {
  label: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'right'
  delay?: number
}

/** Lightweight hover label for the icon-only toolbars. */
export function Tooltip({ label, children, side = 'top', delay = 340 }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  const show = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      if (side === 'right') setCoords({ x: rect.right + 8, y: rect.top + rect.height / 2 })
      else if (side === 'bottom') setCoords({ x: rect.left + rect.width / 2, y: rect.bottom + 8 })
      else setCoords({ x: rect.left + rect.width / 2, y: rect.top - 8 })
      setVisible(true)
    }, delay)
  }

  const hide = () => {
    if (timer.current) clearTimeout(timer.current)
    setVisible(false)
  }

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        onPointerDown={hide}
        className="contents"
      >
        {children}
      </span>
      {visible && (
        <span
          role="tooltip"
          className="pointer-events-none fixed z-[90] whitespace-nowrap rounded-lg bg-ink-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg"
          style={{
            left: coords.x,
            top: coords.y,
            transform:
              side === 'right'
                ? 'translateY(-50%)'
                : side === 'bottom'
                  ? 'translateX(-50%)'
                  : 'translate(-50%, -100%)',
          }}
        >
          {label}
        </span>
      )}
    </>
  )
}
