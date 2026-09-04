'use client'

import type { ScriptV2State } from '@/domain/script-v2'
import { IconClose, IconScript } from '../icons'

interface ScriptV2WorkspaceProps {
  open: boolean
  state: ScriptV2State | null
  nodeName: string
  onClose: () => void
}

/**
 * Full-screen Script V2 shell. Task 8 grows this surface into the complete
 * three-stage table; Task 7 gives every entry path its own canonical landing
 * surface instead of routing V2 documents through the legacy wizard.
 */
export function ScriptV2Workspace({ open, state, nodeName, onClose }: ScriptV2WorkspaceProps) {
  if (!open || !state) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="脚本 V2 工作区"
      data-testid="script-v2-workspace"
      className="fixed inset-0 z-[160] flex flex-col bg-[#181818] text-white"
    >
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/8 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/7 text-white/70">
          <IconScript size={17} />
        </span>
        <div>
          <h2 className="text-[14px] font-medium text-white/90">{state.title || nodeName}</h2>
          <p className="text-[11px] text-white/35">确认镜头 · {state.rows.length} 个镜头</p>
        </div>
        <button
          type="button"
          aria-label="关闭脚本工作区"
          onClick={onClose}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-white/45 hover:bg-white/8 hover:text-white"
        >
          <IconClose size={17} />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-[1180px] space-y-3">
          {state.rows.map((row) => (
            <article
              key={row.id}
              data-testid={`script-v2-workspace-row-${row.id}`}
              className="grid grid-cols-[90px_90px_90px_1fr] items-center gap-3 rounded-xl border border-white/8 bg-white/[0.045] px-4 py-3"
            >
              <span className="text-[12px] font-medium text-white/82">镜头 {row.shotNumber}</span>
              <span className="text-[11px] text-white/45">{row.durationSeconds} 秒</span>
              <span className="text-[11px] text-white/45">{row.shotSize}</span>
              <span className="truncate text-[12px] text-white/58">{row.plotDescription || '填写剧情描述'}</span>
            </article>
          ))}
        </div>
      </main>
    </div>
  )
}
