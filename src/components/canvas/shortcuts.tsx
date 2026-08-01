'use client'

import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useEditor } from '@/lib/editor-store'
import { Dialog } from '../ui/Dialog'

export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

const MOD = () => (IS_MAC ? '⌘' : 'Ctrl')

export interface ShortcutRow {
  label: string
  keys: string[]
}

export function shortcutGroups(): { title: string; rows: ShortcutRow[] }[] {
  const mod = MOD()
  const alt = IS_MAC ? '⌥' : 'Alt'
  const shift = IS_MAC ? '⇧' : 'Shift'
  return [
    {
      title: '创作',
      rows: [
        { label: '成组', keys: [mod, 'G'] },
        { label: '合并分镜组', keys: [mod, alt, 'G'] },
        { label: '解组', keys: [mod, shift, 'G'] },
        { label: '连线', keys: [mod, 'L'] },
        { label: '复制节点和连线', keys: [mod, 'D'] },
        { label: '生成', keys: [mod, 'Enter'] },
        { label: '新建节点', keys: ['Tab'] },
        { label: '节点复制', keys: [alt, '+拖动节点'] },
      ],
    },
    {
      title: '缩放',
      rows: [
        { label: '放大', keys: [mod, '+'] },
        { label: '缩小', keys: [mod, '−'] },
        { label: '适应画布', keys: [mod, '0'] },
      ],
    },
    {
      title: '移动画布',
      rows: [
        { label: '键盘', keys: ['Space', '+拖动'] },
        { label: '移动工具', keys: ['V'] },
        { label: '抓手工具', keys: ['H'] },
        { label: '整理画布', keys: [alt, shift, 'F'] },
      ],
    },
    {
      title: '其他',
      rows: [
        { label: '撤销', keys: [mod, 'Z'] },
        { label: '重做', keys: [mod, shift, 'Z'] },
        { label: '删除', keys: ['Delete'] },
      ],
    },
  ]
}

interface ShortcutHandlers {
  onGroup: () => void
  onMergeStoryboard: () => void
  onUngroup: () => void
  onConnect: () => void
  onDuplicate: () => void
  onRunSelection: () => void
  onNewNode: () => void
  onDelete: () => void
  onArrange: () => void
}

/**
 * Global canvas shortcuts.
 *
 * Guards: typing in an input/textarea/contentEditable never triggers a canvas
 * command, and an open dialog or menu swallows Escape before we see it.
 */
export function useCanvasShortcuts(handlers: ShortcutHandlers, enabled: boolean) {
  const flow = useReactFlow()
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const setToolMode = useEditor((s) => s.setToolMode)
  const setLeftPanel = useEditor((s) => s.setLeftPanel)

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('[role="dialog"]'))
      ) {
        return
      }

      const mod = IS_MAC ? event.metaKey : event.ctrlKey
      const key = event.key.toLowerCase()

      if (mod && key === 'g') {
        event.preventDefault()
        if (event.altKey) handlers.onMergeStoryboard()
        else if (event.shiftKey) handlers.onUngroup()
        else handlers.onGroup()
        return
      }
      if (mod && key === 'l') {
        event.preventDefault()
        handlers.onConnect()
        return
      }
      if (mod && key === 'd') {
        event.preventDefault()
        handlers.onDuplicate()
        return
      }
      if (mod && event.key === 'Enter') {
        event.preventDefault()
        handlers.onRunSelection()
        return
      }
      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) void redo()
        else void undo()
        return
      }
      if (mod && (key === '=' || key === '+')) {
        event.preventDefault()
        flow.zoomIn({ duration: 160 })
        return
      }
      if (mod && (key === '-' || key === '_')) {
        event.preventDefault()
        flow.zoomOut({ duration: 160 })
        return
      }
      if (mod && key === '0') {
        event.preventDefault()
        flow.fitView({ duration: 240, padding: 0.2 })
        return
      }
      if (event.altKey && event.shiftKey && key === 'f') {
        event.preventDefault()
        handlers.onArrange()
        return
      }
      if (mod || event.altKey || event.ctrlKey) return

      if (event.key === 'Tab') {
        event.preventDefault()
        handlers.onNewNode()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        handlers.onDelete()
        return
      }
      if (key === 'v') setToolMode('select')
      if (key === 'h') setToolMode('hand')
      if (event.key === '?') setLeftPanel('shortcuts')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, handlers, flow, undo, redo, setToolMode, setLeftPanel])
}

export function ShortcutsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const groups = shortcutGroups()
  return (
    <Dialog open={open} onClose={onClose} width={1000} hideHeader testId="shortcuts-panel">
      <div className="grid grid-cols-4 gap-8 p-7">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="mb-3 text-[13px] font-semibold text-accent">{group.title}</h3>
            <div className="space-y-2.5">
              {group.rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-ink-700">{row.label}</span>
                  <span className="flex items-center gap-1">
                    {row.keys.map((k, i) => (
                      <kbd
                        key={`${row.label}-${i}`}
                        className="rounded-md bg-ink-100 px-1.5 py-1 text-[11px] font-medium text-ink-600"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
