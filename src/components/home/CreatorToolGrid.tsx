import type { HomeDiscoveryResponse } from '@/contracts/home'
import { IconDirector, IconPlus, IconVideo } from '@/components/icons'

type CreatorTool = HomeDiscoveryResponse['creatorTools'][number]

type CreatorToolGridProps = {
  tools: CreatorTool[]
  disabled?: boolean
  onBlank: () => void
  onTool: (tool: CreatorTool) => void
}

function ToolGlyph({ tool }: { tool: CreatorTool }) {
  if (tool.intent === 'director') return <IconDirector size={20} />
  if (tool.intent === 'frame-analysis') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" />
        <path d="m12 4.5 1.8 4.7 4.7 1.8-4.7 1.8-1.8 4.7-1.8-4.7L5.5 11l4.7-1.8L12 4.5Z" />
      </svg>
    )
  }
  if (tool.intent === 'segment-remake') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M9 5v14M15 5v14M6.5 9h2.5M15 15h2.5" />
      </svg>
    )
  }
  return <IconVideo size={20} />
}

export function CreatorToolGrid({ tools, disabled = false, onBlank, onTool }: CreatorToolGridProps) {
  return (
    <section aria-label="快捷创作" className="grid h-[200px] grid-cols-[2.04fr_repeat(3,minmax(0,1fr))] grid-rows-2 gap-2.5">
      <button
        type="button"
        data-testid="home-blank-canvas"
        disabled={disabled}
        onClick={onBlank}
        className="group relative row-span-2 overflow-hidden rounded-xl border border-white/[0.08] bg-[#202020] text-white transition-colors hover:border-white/[0.15] hover:bg-[#242424] disabled:cursor-wait"
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 opacity-55 [background-image:radial-gradient(circle_at_center,transparent_0,transparent_27%,rgba(255,255,255,.06)_28%,transparent_29%),linear-gradient(90deg,transparent_49.7%,rgba(255,255,255,.08)_50%,transparent_50.3%),linear-gradient(transparent_49.7%,rgba(255,255,255,.08)_50%,transparent_50.3%)] [background-size:100%_100%,70px_70px,70px_70px]"
        />
        <span aria-hidden="true" className="absolute left-[10%] right-[10%] top-1/2 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        <span className="relative flex h-full flex-col items-center justify-center gap-3">
          <span className="flex h-14 w-24 items-center justify-center rounded-[18px] bg-white text-[#161616] shadow-[0_8px_28px_rgba(0,0,0,.24)] transition-transform group-hover:scale-[1.03]">
            <IconPlus size={31} />
          </span>
          <span className="text-[16px] font-medium">新建画布创作</span>
        </span>
      </button>

      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          data-testid="creator-tool"
          disabled={disabled}
          onClick={() => onTool(tool)}
          className="group flex min-w-0 flex-col items-start justify-between rounded-xl border border-white/[0.035] bg-[#1c1c1c] p-3 text-left transition-colors hover:border-white/[0.1] hover:bg-[#242424] disabled:cursor-wait"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.07] text-white/90 transition-colors group-hover:bg-white/[0.1]">
            <ToolGlyph tool={tool} />
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <strong className="truncate text-[14px] font-medium text-white/90">{tool.title}</strong>
            {tool.badge && (
              <span className={tool.badge === '全新上线' ? 'shrink-0 text-[10px] text-[#57c6e8]' : 'shrink-0 text-[10px] text-white/38'}>
                {tool.badge}
              </span>
            )}
          </span>
        </button>
      ))}
    </section>
  )
}
