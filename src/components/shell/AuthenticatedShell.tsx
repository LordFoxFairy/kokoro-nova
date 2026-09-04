'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

import { client } from '@/api/client'
import type { HomeDiscoveryResponse } from '@/contracts/home'
import { AccountRail } from './AccountRail'
import { AppSidebar, getShellLayoutMode } from './AppSidebar'
import { PromoStrip } from './PromoStrip'

const HomeDiscoveryContext = createContext<HomeDiscoveryResponse | null>(null)

type HomeDiscoveryStatus = 'loading' | 'ready' | 'error'

type HomeDiscoveryState = {
  status: HomeDiscoveryStatus
  error: string | null
  retry: () => void
  publicMode: boolean
}

const HomeDiscoveryStateContext = createContext<HomeDiscoveryState>({
  status: 'loading',
  error: null,
  retry: () => undefined,
  publicMode: false,
})

export function useHomeDiscovery() {
  return useContext(HomeDiscoveryContext)
}

export function useHomeDiscoveryState() {
  return useContext(HomeDiscoveryStateContext)
}

function useCompactShellLane() {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const update = () => setCompact(getShellLayoutMode(window.innerWidth) === 'collapsed')
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return compact
}

export function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const compactShell = useCompactShellLane()
  const [preferenceLoaded, setPreferenceLoaded] = useState(false)
  const [home, setHome] = useState<HomeDiscoveryResponse | null>(null)
  const [homeStatus, setHomeStatus] = useState<HomeDiscoveryStatus>('loading')
  const [homeError, setHomeError] = useState<string | null>(null)
  const [anonymousViewer, setAnonymousViewer] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  const retry = useCallback(() => setReloadToken((value) => value + 1), [])

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('libtv.sidebar.collapsed') === 'true')
    setPreferenceLoaded(true)
  }, [])

  useEffect(() => {
    if (preferenceLoaded) window.localStorage.setItem('libtv.sidebar.collapsed', String(collapsed))
  }, [collapsed, preferenceLoaded])

  useEffect(() => {
    let active = true
    setHomeStatus('loading')
    setHomeError(null)
    void client.home
      .get()
      .then((response) => {
        if (!active) return
        setHome(response)
        setHomeStatus('ready')
      })
      .catch((reason) => {
        if (!active) return
        setHomeStatus('error')
        setHomeError(reason instanceof Error ? reason.message : '首页数据加载失败，请重试')
      })
    return () => {
      active = false
    }
  }, [reloadToken])

  useEffect(() => {
    let active = true
    setAnonymousViewer(false)
    void client.scenarios
      .get()
      .then(({ scenario }) => {
        if (active) setAnonymousViewer(scenario.viewer === 'anonymous')
      })
      .catch(() => {
        // The scenario endpoint is development-only; the home response remains
        // the production fallback when that local probe is unavailable.
      })
    return () => {
      active = false
    }
  }, [reloadToken])

  const publicMode = anonymousViewer || home?.account.membershipLabel === '登录'
  const discoveryHome =
    home && anonymousViewer
      ? { ...home, account: { ...home.account, membershipLabel: '登录' }, recentProjects: [] }
      : home
  const discoveryState: HomeDiscoveryState = { status: homeStatus, error: homeError, retry, publicMode }

  return (
    <HomeDiscoveryContext.Provider value={discoveryHome}>
      <HomeDiscoveryStateContext.Provider value={discoveryState}>
        <div
          data-app-shell="authenticated"
          data-brand="Kokoro Nova · LibTV"
          aria-label="Kokoro Nova · LibTV"
          className="min-h-screen min-w-0 overflow-x-hidden bg-[#111] text-white"
        >
          <a
            href="#main-content"
            className="sr-only z-[100] rounded-md bg-white px-3 py-2 text-[12px] text-black focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
          >
            跳到主要内容
          </a>
          <div className="px-2 pt-2 max-md:px-1 max-md:pt-1">
            <PromoStrip campaign={home?.campaign ?? null} />
          </div>
          <div className="mt-2 flex min-h-[calc(100vh-64px)] min-w-0 max-md:mt-1">
            <AppSidebar
              collapsed={collapsed}
              compact={compactShell}
              onToggle={() => setCollapsed((value) => !value)}
              publicMode={publicMode}
            />
            <section
              data-testid="libtv-shell-content"
              className="min-w-0 flex-1 overflow-hidden bg-[#111]"
            >
              <div className="min-w-0 overflow-x-auto">
                <div className="min-w-max">
                  <AccountRail account={discoveryHome?.account ?? null} />
                </div>
              </div>
              <main id="main-content" className="min-w-0">{children}</main>
            </section>
          </div>
        </div>
      </HomeDiscoveryStateContext.Provider>
    </HomeDiscoveryContext.Provider>
  )
}
