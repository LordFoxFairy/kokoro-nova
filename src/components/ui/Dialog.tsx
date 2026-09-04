'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { IconClose } from '../icons'

/** Open dialog layers, innermost last. Shared across every Dialog instance. */
const dialogStack: object[] = []

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** `modal` is the centered confirm layer; `panel` is a large library sheet. */
  variant?: 'modal' | 'panel'
  width?: number
  /** Panel sheets often need their own header row instead of the default one. */
  hideHeader?: boolean
  testId?: string
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  variant = 'modal',
  width,
  hideHeader,
  testId,
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    // Each open dialog listens on `window`, so nested dialogs all see the same
    // Escape — and `stopPropagation` cannot stop a sibling listener on the same
    // target. Track the open layers and let only the topmost one close.
    const token = {}
    dialogStack.push(token)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (dialogStack[dialogStack.length - 1] !== token) return
      // A menu floating above the dialog gets first refusal.
      if (document.querySelector('[data-testid="menu"]')) return
      event.stopPropagation()
      onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    // Move focus into the layer so Escape and Tab are captured immediately.
    ref.current?.focus()

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      const index = dialogStack.indexOf(token)
      if (index >= 0) dialogStack.splice(index, 1)
    }
  }, [open, onClose])

  useEffect(() => {
    if (open) return
    const previouslyFocused = previouslyFocusedRef.current
    previouslyFocusedRef.current = null
    if (previouslyFocused?.isConnected) {
      requestAnimationFrame(() => previouslyFocused.focus())
    }
  }, [open])

  if (!open) return null

  const resolvedWidth = width ?? (variant === 'panel' ? 880 : 400)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      data-testid={testId}
    >
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-ink-900/25 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        ref={ref}
        tabIndex={-1}
        className={cn(
          'panel relative flex max-h-[86vh] w-full flex-col outline-none',
          variant === 'panel' ? 'overflow-hidden' : '',
        )}
        style={{ width: resolvedWidth, maxWidth: '100%' }}
      >
        {!hideHeader && (
          <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-5">
            {typeof title === 'string' ? (
              <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
            ) : (
              title
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="-mr-1 -mt-1 rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
            >
              <IconClose size={16} />
            </button>
          </div>
        )}
        <div className={cn('thin-scrollbar flex-1 overflow-y-auto', variant === 'panel' ? '' : 'px-5 py-3')}>
          {children}
        </div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-2">{footer}</div>}
      </div>
    </div>
  )
}

interface ConfirmProps {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /** When set, the confirm button stays disabled until the text matches. */
  requireExactText?: string
  inputValue?: string
  onInputChange?: (value: string) => void
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger,
  requireExactText,
  inputValue = '',
  onInputChange,
  onConfirm,
  onClose,
}: ConfirmProps) {
  const blocked = Boolean(requireExactText) && inputValue !== requireExactText

  return (
    <Dialog open={open} onClose={onClose} title={title} testId="confirm-dialog">
      <div className="space-y-3 text-[13px] leading-relaxed text-ink-600">
        {typeof description === 'string' ? <p>{description}</p> : description}
        {requireExactText && (
          <input
            autoFocus
            value={inputValue}
            onChange={(e) => onInputChange?.(e.target.value)}
            placeholder={requireExactText}
            data-testid="confirm-input"
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] outline-none transition-colors focus:border-accent"
          />
        )}
      </div>
      <div className="flex items-center justify-end gap-2 pt-5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-ink-600 transition-colors hover:bg-ink-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          disabled={blocked}
          data-testid="confirm-submit"
          onClick={() => {
            if (blocked) return
            onConfirm()
          }}
          className={cn(
            'rounded-lg px-3.5 py-2 text-[13px] font-medium text-white transition-colors',
            blocked ? 'cursor-not-allowed bg-ink-200' : danger ? 'bg-danger hover:opacity-90' : 'bg-ink-900 hover:opacity-90',
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
