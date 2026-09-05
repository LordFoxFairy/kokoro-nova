'use client'

import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'
import {
  IdentityResponseSchema,
  type IdentityResponse,
} from '@/contracts/identity'
import {
  PreferencesResponseSchema,
  type LocalPreferences,
} from '@/contracts/preferences'
import {
  NotificationsResponseSchema,
  type NotificationSummary,
} from '@/contracts/notifications'

type AccountMenuVariant = 'rail' | 'editor'

type LocalAccountSnapshot = {
  identity: IdentityResponse
  preferences: LocalPreferences
  notifications: NotificationSummary
}

const DARK_VARS: Record<string, string> = {
  '--color-canvas': '#111111',
  '--color-surface': '#181818',
  '--color-ink-900': 'rgba(255,255,255,.92)',
  '--color-ink-800': 'rgba(255,255,255,.86)',
  '--color-ink-700': 'rgba(255,255,255,.78)',
  '--color-ink-600': 'rgba(255,255,255,.68)',
  '--color-ink-500': 'rgba(255,255,255,.52)',
  '--color-ink-400': 'rgba(255,255,255,.38)',
  '--color-ink-300': 'rgba(255,255,255,.24)',
  '--color-ink-200': 'rgba(255,255,255,.14)',
  '--color-ink-100': 'rgba(255,255,255,.08)',
  '--color-ink-50': 'rgba(255,255,255,.045)',
  '--color-accent': '#60c9ef',
  '--color-accent-soft': 'rgba(96,201,239,.12)',
  '--color-accent-ink': '#70d1f1',
}

const LIGHT_VARS: Record<string, string> = {
  '--color-canvas': '#f5f7fa',
  '--color-surface': '#ffffff',
  '--color-ink-900': '#1d232b',
  '--color-ink-800': '#2c3640',
  '--color-ink-700': '#43505d',
  '--color-ink-600': '#5d6975',
  '--color-ink-500': '#77828c',
  '--color-ink-400': '#98a1aa',
  '--color-ink-300': '#c1c7ce',
  '--color-ink-200': '#dce1e6',
  '--color-ink-100': '#e9edf1',
  '--color-ink-50': '#f3f5f7',
  '--color-accent': '#278eb5',
  '--color-accent-soft': '#dff3fa',
  '--color-accent-ink': '#176783',
}

function localPath(pathname: string, query: string) {
  return `${pathname}${query ? `?${query}` : ''}`
}

async function typedJson<T>(url: string, schema: { parse: (value: unknown) => T }, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : '本地账户数据暂时不可用'
    throw new Error(message)
  }
  return schema.parse(body)
}

/**
 * Reusable, local-only rendition of the observed LibTV identity popover.
 * It consumes no real cookie/token and only exposes explicitly masked data.
 */
export function LocalIdentityMenu({ variant = 'rail' }: { variant?: AccountMenuVariant }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const returnTo = localPath(pathname, searchParams.toString())
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<LocalAccountSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const encodedReturnTo = encodeURIComponent(returnTo)
      const [identity, preferences, notifications] = await Promise.all([
        typedJson(`/api/identity?returnTo=${encodedReturnTo}`, IdentityResponseSchema),
        typedJson('/api/preferences', PreferencesResponseSchema),
        typedJson('/api/notifications', NotificationsResponseSchema),
      ])
      setSnapshot({ identity, preferences: preferences.preferences, notifications: notifications.notifications })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '账户菜单加载失败')
    }
  }, [returnTo])

  useEffect(() => {
    if (open) void load()
  }, [load, open])

  useEffect(() => {
    if (!open) return
    const initialFocus = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('[data-account-menu-initial]')?.focus()
    })
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.cancelAnimationFrame(initialFocus)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  useEffect(() => {
    if (!snapshot) return
    const shell = triggerRef.current?.closest<HTMLElement>('[data-app-shell]')
    if (!shell) return
    const variables = snapshot.preferences.theme === 'light' ? LIGHT_VARS : DARK_VARS
    shell.dataset.localTheme = snapshot.preferences.theme
    for (const [name, value] of Object.entries(variables)) shell.style.setProperty(name, value)
    shell.style.backgroundColor = snapshot.preferences.theme === 'light' ? '#f5f7fa' : '#111111'
    document.documentElement.dataset.localTheme = snapshot.preferences.theme
  }, [snapshot])

  const updatePreferences = async (patch: Partial<LocalPreferences>) => {
    if (!snapshot) return
    setBusy(true)
    try {
      const next = await typedJson('/api/preferences', PreferencesResponseSchema, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      setSnapshot((current) => current ? { ...current, preferences: next.preferences } : current)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '偏好保存失败')
    } finally {
      setBusy(false)
    }
  }

  const transitionSession = async (action: 'signIn' | 'signOut') => {
    setBusy(true)
    try {
      const identity = await typedJson('/api/identity', IdentityResponseSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, returnTo }),
      })
      setSnapshot((current) => current ? { ...current, identity } : current)
      if (action === 'signIn') {
        setOpen(false)
        router.push(identity.session.returnTo)
        router.refresh()
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '本地会话更新失败')
    } finally {
      setBusy(false)
    }
  }

  const markAllRead = async () => {
    setBusy(true)
    try {
      const response = await typedJson('/api/notifications', NotificationsResponseSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markAllRead' }),
      })
      setSnapshot((current) => current ? { ...current, notifications: response.notifications } : current)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '通知状态更新失败')
    } finally {
      setBusy(false)
    }
  }

  const copyUuid = async () => {
    const value = snapshot?.identity.identity?.uuidMasked
    if (!value) return
    try {
      await navigator.clipboard?.writeText(value)
    } catch {
      // Clipboard availability varies in local HTTP previews; copy feedback is
      // still deterministic and contains only the already-masked identifier.
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_500)
  }

  const identity = snapshot?.identity.identity ?? null
  const session = snapshot?.identity.session
  const unread = snapshot?.notifications.unreadCount ?? 0
  const triggerLabel = identity ? `打开账户菜单：${identity.displayName}` : '打开登录菜单'

  return (
    <div className="relative shrink-0">
      <style>{`
        [data-app-shell='authenticated'][data-local-theme='light'] [data-testid='libtv-sidebar'],
        [data-app-shell='authenticated'][data-local-theme='light'] [data-testid='libtv-account-rail'] {
          background: #ffffff !important;
          border-color: rgba(29,35,43,.12) !important;
          color: #1d232b;
        }
        [data-app-shell='authenticated'][data-local-theme='light'] [data-testid='libtv-sidebar'] a,
        [data-app-shell='authenticated'][data-local-theme='light'] [data-testid='libtv-sidebar'] button {
          color: #43505d;
        }
        [data-app-shell='authenticated'][data-local-theme='light'] [data-testid='libtv-sidebar'] [data-testid='shell-brand'] {
          color: #1d232b;
        }
      `}</style>
      <button
        ref={triggerRef}
        type="button"
        data-testid={`local-identity-trigger-${variant}`}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'relative flex items-center justify-center font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          variant === 'rail'
            ? 'h-8 w-8 rounded-lg border border-white/[0.08] bg-gradient-to-br from-[#e9d8ff] to-[#6872ff] text-[12px] text-[#20213a] hover:brightness-110'
            : 'h-8 w-8 rounded-full border border-white/12 bg-gradient-to-br from-sky-100 via-blue-300 to-indigo-500 text-[11px] text-slate-900 shadow-[var(--shadow-float)] hover:brightness-110',
        )}
      >
        {identity?.avatarInitial ?? '登'}
        {unread > 0 && <span data-testid={`local-notification-badge-${variant}`} className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#ff5959] px-0.5 text-[9px] leading-none text-white">{unread}</span>}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="本地账户菜单"
          data-testid={`local-identity-menu-${variant}`}
          className="panel absolute right-0 top-[calc(100%+8px)] z-[90] max-h-[calc(100vh-56px)] w-[348px] overflow-y-auto border border-ink-100 bg-surface p-2 text-ink-700 shadow-[var(--shadow-panel)]"
        >
          {error && (
            <div role="alert" className="mx-1 mb-2 rounded-lg bg-danger/10 px-2.5 py-2 text-[11px] text-danger">
              {error} <button type="button" onClick={() => void load()} className="ml-1 underline">重试</button>
            </div>
          )}
          {!snapshot ? (
            <div role="status" className="px-3 py-5 text-center text-[12px] text-ink-500">正在读取本地身份…</div>
          ) : identity ? (
            <AuthenticatedMenu
              identity={identity}
              preferences={snapshot.preferences}
              notifications={snapshot.notifications}
              busy={busy}
              copied={copied}
              onCopyUuid={copyUuid}
              onThemeChange={(theme) => void updatePreferences({ theme })}
              onWatermarkChange={(aiWatermark) => void updatePreferences({ aiWatermark })}
              onMarkAllRead={() => void markAllRead()}
              onSignOut={() => void transitionSession('signOut')}
              onNavigate={() => setOpen(false)}
            />
          ) : (
            <AnonymousMenu
              returnTo={session?.returnTo ?? returnTo}
              busy={busy}
              onSignIn={() => void transitionSession('signIn')}
            />
          )}
        </div>
      )}
    </div>
  )
}

function MenuGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-ink-100 px-1 py-2 last:border-b-0">
      {label && <h2 className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[.14em] text-ink-400">{label}</h2>}
      {children}
    </section>
  )
}

function MenuAction({ children, href, onClick, ...props }: {
  children: React.ReactNode
  href?: string
  onClick?: () => void
  [key: string]: unknown
}) {
  const className = 'flex min-h-8 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-55'
  if (href) return <Link href={href} role="menuitem" onClick={onClick} className={className} {...props}>{children}</Link>
  return <button type="button" role="menuitem" onClick={onClick} className={className} {...props}>{children}</button>
}

function AuthenticatedMenu({
  identity,
  preferences,
  notifications,
  busy,
  copied,
  onCopyUuid,
  onThemeChange,
  onWatermarkChange,
  onMarkAllRead,
  onSignOut,
  onNavigate,
}: {
  identity: NonNullable<IdentityResponse['identity']>
  preferences: LocalPreferences
  notifications: NotificationSummary
  busy: boolean
  copied: boolean
  onCopyUuid: () => void
  onThemeChange: (theme: LocalPreferences['theme']) => void
  onWatermarkChange: (value: boolean) => void
  onMarkAllRead: () => void
  onSignOut: () => void
  onNavigate: () => void
}) {
  const storagePercent = Math.round((identity.storage.usedGb / identity.storage.totalGb) * 100)
  return (
    <>
      <MenuGroup>
        <div className="flex items-start gap-2 px-2 py-1.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e9d8ff] to-[#6872ff] text-[13px] font-bold text-[#20213a]">{identity.avatarInitial}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink-900">{identity.displayName}</div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-500">
              <span>{identity.uuidMasked}</span>
              <button type="button" data-account-menu-initial onClick={onCopyUuid} className="rounded px-1 text-accent-ink hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
                {copied ? '已复制' : '复制 UUID'}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <MenuAction href="/account?tab=credentials" onClick={onNavigate}>Access key <span className="ml-auto font-mono text-[10px] text-ink-400">{identity.accessKey.maskedValue}</span></MenuAction>
          <MenuAction href="/account?tab=team" onClick={onNavigate}>团队与共享资产 <span className="ml-auto text-ink-400">›</span></MenuAction>
        </div>
      </MenuGroup>

      <MenuGroup label="会员与积分">
        <div className="rounded-lg bg-ink-50 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2"><span className="text-[12px] font-medium text-ink-900">{identity.membership.label}</span><Link role="menuitem" href="/account?tab=membership" onClick={onNavigate} className="text-[11px] text-accent-ink hover:underline">开通会员</Link></div>
          <p className="mt-1 text-[10px] text-ink-500">{identity.membership.benefit}</p>
          <Link role="menuitem" href="/account?tab=membership" onClick={onNavigate} className="mt-1 inline-block text-[10px] text-accent-ink hover:underline">查看更多权益 ›</Link>
        </div>
        <div className="mt-1.5 rounded-lg border border-ink-100 px-2.5 py-2">
          <div className="flex items-center justify-between"><span className="text-[12px] font-medium text-ink-900">积分余额 {identity.credits.balance} 点</span><Link role="menuitem" href="/account?tab=wallet" onClick={onNavigate} className="text-[11px] text-accent-ink hover:underline">充值</Link></div>
          <Link role="menuitem" href="/account?tab=wallet" onClick={onNavigate} className="mt-1 inline-block text-[10px] text-ink-500 hover:text-ink-900">设置消耗顺序 ›</Link>
          <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-ink-500">{identity.credits.distributions.map((item) => <span key={item.label}>{item.label} <strong className="font-medium text-ink-700">{item.value}</strong></span>)}</div>
        </div>
      </MenuGroup>

      <MenuGroup label="存储空间">
        <div className="px-2.5 py-1"><div className="flex justify-between text-[11px]"><span>{identity.storage.usedGb} GB / {identity.storage.totalGb} GB</span><Link role="menuitem" href="/project" onClick={onNavigate} className="text-accent-ink hover:underline">管理资产</Link></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-accent" style={{ width: `${storagePercent}%` }} /></div></div>
      </MenuGroup>

      <MenuGroup>
        <MenuAction href="/account" onClick={onNavigate}>个人中心 <span className="ml-auto text-ink-400">›</span></MenuAction>
        <MenuAction href="/account?tab=membership" onClick={onNavigate}>订阅与开发票 <span className="ml-auto text-ink-400">›</span></MenuAction>
        <div className="flex items-center justify-between px-2 py-1.5 text-[12px]"><span>模式切换</span><span role="group" aria-label="主题模式" className="flex rounded-lg border border-ink-200 p-0.5"><button type="button" aria-label="浅色模式" aria-pressed={preferences.theme === 'light'} disabled={busy} onClick={() => onThemeChange('light')} className={cn('rounded-md px-2 py-1 text-[11px]', preferences.theme === 'light' ? 'bg-accent-soft text-accent-ink' : 'text-ink-500')}>☼</button><button type="button" aria-label="深色模式" aria-pressed={preferences.theme === 'dark'} disabled={busy} onClick={() => onThemeChange('dark')} className={cn('rounded-md px-2 py-1 text-[11px]', preferences.theme === 'dark' ? 'bg-accent-soft text-accent-ink' : 'text-ink-500')}>◐</button></span></div>
        <button type="button" role="menuitemcheckbox" aria-checked={preferences.aiWatermark} disabled={busy} onClick={() => onWatermarkChange(!preferences.aiWatermark)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[12px] text-ink-700 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-55"><span>AI 水印设置</span><span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', preferences.aiWatermark ? 'bg-success/15 text-success' : 'bg-ink-100 text-ink-500')}>{preferences.aiWatermark ? '已开启' : '已关闭'}</span></button>
        <MenuAction href="/account?tab=credentials" onClick={onNavigate}>CLI &amp; Skill <span className="ml-auto text-ink-400">›</span></MenuAction>
        <div className="flex items-center gap-1"><MenuAction href="/account?tab=notifications" onClick={onNavigate}>通知 <span className="ml-auto rounded-full bg-danger/12 px-1.5 py-px text-[10px] text-danger">{notifications.unreadCount}</span></MenuAction>{notifications.unreadCount > 0 && <button type="button" aria-label="全部通知已读" disabled={busy} onClick={onMarkAllRead} className="mr-2 text-[10px] text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent">已读</button>}</div>
        <MenuAction href="/" onClick={onNavigate}>前往 Liblib <span className="ml-auto text-ink-400">↗</span></MenuAction>
      </MenuGroup>

      <MenuGroup>
        <MenuAction onClick={onSignOut} disabled={busy}>退出登录 <span className="ml-auto text-ink-400">›</span></MenuAction>
      </MenuGroup>
    </>
  )
}

function AnonymousMenu({ returnTo, busy, onSignIn }: { returnTo: string; busy: boolean; onSignIn: () => void }) {
  return (
    <MenuGroup>
      <div className="px-2 py-2"><h2 className="text-[13px] font-semibold text-ink-900">已退出登录</h2><p className="mt-1 text-[11px] leading-relaxed text-ink-500">本地 mock 会话已关闭。登录后将返回 <span className="font-mono text-ink-600">{returnTo}</span>。</p></div>
      <button type="button" data-account-menu-initial disabled={busy} onClick={onSignIn} className="m-2 w-[calc(100%-1rem)] rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-slate-950 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-55">登录并返回</button>
    </MenuGroup>
  )
}
