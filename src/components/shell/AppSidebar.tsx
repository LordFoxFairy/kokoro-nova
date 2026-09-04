'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { IconAgent, IconFolder, IconHelp, IconPlus } from '@/components/icons'
import { cn } from '@/lib/cn'
import { LibTvLogo } from './LibTvLogo'

type AppSidebarProps = {
  collapsed: boolean
  onToggle: () => void
  compact?: boolean
  publicMode?: boolean
}

type NavIconProps = { kind: 'home' | 'project' | 'agent' | 'challenge' }

export function getShellBrandLabel() {
  return 'Kokoro Nova · LibTV'
}

export function getShellLayoutMode(viewportWidth: number): 'expanded' | 'collapsed' {
  return viewportWidth <= 1100 ? 'collapsed' : 'expanded'
}

export function isNavItemActive(href: string, pathname: string) {
  const normalize = (value: string) => {
    const path = value.split(/[?#]/, 1)[0].replace(/\/+$/, '')
    return path || '/'
  }
  const target = normalize(href)
  const current = normalize(pathname)
  return target === '/' ? current === '/' : current === target || current.startsWith(`${target}/`)
}

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
  { label: '首页', href: '/', kind: 'home', requiresAuth: false },
  { label: '项目', href: '/project', kind: 'project', requiresAuth: true },
  { label: 'LibTV Agent', href: '/canvas', kind: 'agent', requiresAuth: true },
  { label: '创作者挑战赛', href: '/showcase', kind: 'challenge', requiresAuth: false },
] as const

export function AppSidebar({ collapsed, onToggle, compact = false, publicMode = false }: AppSidebarProps) {
  const pathname = usePathname()
  const brandLabel = getShellBrandLabel()
  const visuallyCollapsed = compact || collapsed
  const navItems = publicMode ? NAV_ITEMS.filter((item) => !item.requiresAuth) : NAV_ITEMS

  return (
    <aside
      data-testid="libtv-sidebar"
      data-collapsed={visuallyCollapsed ? 'true' : 'false'}
      data-compact={compact ? 'true' : 'false'}
      data-public-mode={publicMode ? 'true' : 'false'}
      className={cn(
        'sticky top-0 flex h-[calc(100vh-64px)] shrink-0 flex-col border-r border-white/[0.08] bg-[#111] transition-[width,margin] duration-200',
        visuallyCollapsed ? 'ml-0 w-[var(--libtv-sidebar-collapsed)]' : 'ml-2 w-[var(--libtv-sidebar-expanded)]',
      )}
    >
      <button
        type="button"
        aria-label={compact ? '窄屏侧边栏已收窄' : collapsed ? '展开侧边栏' : '收起侧边栏'}
        title={compact ? '窄屏侧边栏已收窄' : collapsed ? '展开侧边栏' : '收起侧边栏'}
        onClick={onToggle}
        disabled={compact}
        className={cn(
          'flex h-[54px] w-full items-center text-white outline-none transition-colors hover:bg-white/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#60c9ef] disabled:cursor-default disabled:opacity-100',
          visuallyCollapsed ? 'justify-center' : 'justify-between px-4',
        )}
      >
        <span className="flex min-w-0 items-center gap-2" data-testid="shell-brand" aria-label={brandLabel}>
          <LibTvLogo compact={visuallyCollapsed} className={visuallyCollapsed ? 'h-6 w-[30px]' : 'h-6 w-[76px]'} />
          {!visuallyCollapsed && <span className="truncate text-[11px] font-medium tracking-[0.04em] text-white/62">Kokoro Nova</span>}
        </span>
        {!visuallyCollapsed && (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <path d="M9 4v16" />
          </svg>
        )}
      </button>

      <Link
        href="/project"
        aria-label={publicMode ? '登录后新建项目' : '新建项目'}
        title={publicMode ? '登录后新建项目' : '新建项目'}
        className={cn(
          'mx-2 mt-2 flex h-9 items-center rounded-lg bg-[#60c9ef] text-[14px] font-medium text-[#10202a] transition-colors hover:bg-[#72d2f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60c9ef]',
          visuallyCollapsed ? 'justify-center px-0' : 'gap-2 px-3',
        )}
      >
        <IconPlus size={18} />
        {!visuallyCollapsed && <span>{publicMode ? '登录后新建项目' : '新建项目'}</span>}
      </Link>

      <nav aria-label="主导航" className="mt-2 space-y-1 px-2">
        {navItems.map((item) => {
          const active = isNavItemActive(item.href, pathname)
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              title={item.label}
              className={cn(
                'flex h-9 items-center rounded-lg text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#60c9ef]',
                visuallyCollapsed ? 'justify-center' : 'gap-2.5 px-2.5',
                active ? 'bg-white/[0.12] text-white' : 'text-white/78 hover:bg-white/[0.06] hover:text-white',
              )}
            >
              <NavIcon kind={item.kind} />
              {!visuallyCollapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto px-2 pb-4">
        {!visuallyCollapsed && !publicMode && (
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
          title={visuallyCollapsed ? '帮助' : undefined}
          className={cn(
            'flex h-9 items-center rounded-lg text-[13px] text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#60c9ef]',
            visuallyCollapsed ? 'justify-center' : 'gap-2 px-2',
          )}
        >
          <IconHelp size={18} />
          {!visuallyCollapsed && <span>帮助</span>}
        </Link>
      </div>
    </aside>
  )
}
