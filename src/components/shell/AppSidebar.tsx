'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { IconAgent, IconFolder, IconHelp, IconPlus } from '@/components/icons'
import { cn } from '@/lib/cn'
import { LibTvLogo } from './LibTvLogo'

type AppSidebarProps = {
  collapsed: boolean
  onToggle: () => void
}

type NavIconProps = { kind: 'home' | 'project' | 'agent' | 'challenge' }

function NavIcon({ kind }: NavIconProps) {
  if (kind === 'project') return <IconFolder size={19} />
  if (kind === 'agent') return <IconAgent size={19} />
  if (kind === 'challenge') {
    return (
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M8 4h8v3.5a4 4 0 0 1-8 0V4Z" />
        <path d="M8 6H4.5v1.5A4.5 4.5 0 0 0 9 12M16 6h3.5v1.5A4.5 4.5 0 0 1 15 12M12 12v5M8.5 20h7M10 17h4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="m4 11 8-7 8 7v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8Z" />
      <path d="M9 20v-6h6v6" />
    </svg>
  )
}

const NAV_ITEMS = [
  { label: '首页', href: '/', kind: 'home' },
  { label: '项目', href: '/project', kind: 'project' },
  { label: 'LibTV Agent', href: '/canvas', kind: 'agent' },
  { label: '创作者挑战赛', href: '/showcase', kind: 'challenge' },
] as const

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      data-testid="libtv-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      className={cn(
        'sticky top-0 flex h-[calc(100vh-64px)] shrink-0 flex-col border-r border-white/[0.08] bg-[#111] transition-[width,margin] duration-200',
        collapsed ? 'ml-0 w-[var(--libtv-sidebar-collapsed)]' : 'ml-2 w-[var(--libtv-sidebar-expanded)]',
      )}
    >
      <button
        type="button"
        aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
        title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        onClick={onToggle}
        className={cn(
          'flex h-[54px] w-full items-center text-white outline-none transition-colors hover:bg-white/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#60c9ef]',
          collapsed ? 'justify-center' : 'justify-between px-4',
        )}
      >
        <LibTvLogo compact={collapsed} className={collapsed ? 'h-6 w-[30px]' : 'h-6 w-[76px]'} />
        {!collapsed && (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <path d="M9 4v16" />
          </svg>
        )}
      </button>

      <Link
        href="/project"
        aria-label="新建项目"
        className={cn(
          'mx-2 mt-2 flex h-9 items-center rounded-lg bg-[#60c9ef] text-[14px] font-medium text-[#10202a] transition-colors hover:bg-[#72d2f2]',
          collapsed ? 'justify-center px-0' : 'gap-2 px-3',
        )}
      >
        <IconPlus size={18} />
        {!collapsed && <span>新建项目</span>}
      </Link>

      <nav aria-label="主导航" className="mt-2 space-y-1 px-2">
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex h-9 items-center rounded-lg text-[14px] transition-colors',
                collapsed ? 'justify-center' : 'gap-2.5 px-2.5',
                active ? 'bg-white/[0.12] text-white' : 'text-white/78 hover:bg-white/[0.06] hover:text-white',
              )}
            >
              <NavIcon kind={item.kind} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto px-2 pb-4">
        {!collapsed && (
          <Link
            href="/account"
            className="mb-3 flex items-center justify-between rounded-xl border border-white/[0.06] bg-gradient-to-br from-[#1d2630] to-[#17191d] px-3 py-3 text-[12px] text-white/80"
          >
            <span className="leading-5">
              <strong className="block font-medium text-white/90">SD2.5畅享卡上线</strong>
              积分超市限时抢购
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#163548] text-[#60c9ef]">▰</span>
          </Link>
        )}
        <Link
          href="/account"
          aria-label="帮助"
          title={collapsed ? '帮助' : undefined}
          className={cn(
            'flex h-9 items-center rounded-lg text-[13px] text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white',
            collapsed ? 'justify-center' : 'gap-2 px-2',
          )}
        >
          <IconHelp size={18} />
          {!collapsed && <span>帮助</span>}
        </Link>
      </div>
    </aside>
  )
}
