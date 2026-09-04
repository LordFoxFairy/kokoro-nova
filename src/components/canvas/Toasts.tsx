'use client'

import { cn } from '@/lib/cn'
import { useEditor } from '@/lib/editor-store'
import { IconCheck, IconClose, IconWarning } from '../icons'

export function Toasts() {
  const toasts = useEditor((s) => s.toasts)
  const dismiss = useEditor((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          data-testid="toast"
          className={cn(
            'pointer-events-auto flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] shadow-[var(--shadow-panel)]',
            toast.tone === 'error'
              ? 'bg-danger text-white'
              : toast.tone === 'success'
                ? 'bg-ink-900 text-white'
                : 'bg-surface text-ink-800',
          )}
        >
          {toast.tone === 'error' ? (
            <IconWarning size={15} />
          ) : toast.tone === 'success' ? (
            <IconCheck size={15} />
          ) : null}
          <span className="max-w-sm">{toast.message}</span>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => dismiss(toast.id)}
            className="ml-1 opacity-60 transition-opacity hover:opacity-100"
          >
            <IconClose size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
