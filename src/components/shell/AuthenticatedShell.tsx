'use client'

import { createContext, useContext, useEffect, useState } from 'react'

import { client } from '@/api/client'
import type { HomeDiscoveryResponse } from '@/contracts/home'
import { AccountRail } from './AccountRail'
import { AppSidebar } from './AppSidebar'
import { PromoStrip } from './PromoStrip'

const HomeDiscoveryContext = createContext<HomeDiscoveryResponse | null>(null)

export function useHomeDiscovery() {
  return useContext(HomeDiscoveryContext)
}

export function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [preferenceLoaded, setPreferenceLoaded] = useState(false)
  const [home, setHome] = useState<HomeDiscoveryResponse | null>(null)

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('libtv.sidebar.collapsed') === 'true')
    setPreferenceLoaded(true)
  }, [])

  useEffect(() => {
    if (preferenceLoaded) window.localStorage.setItem('libtv.sidebar.collapsed', String(collapsed))
  }, [collapsed, preferenceLoaded])

  useEffect(() => {
    let active = true
    void client.home
      .get()
      .then((response) => {
        if (active) setHome(response)
      })
      .catch(() => {
        if (active) setHome(null)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <HomeDiscoveryContext.Provider value={home}>
      <div data-app-shell="authenticated" className="min-h-screen bg-[#111] text-white">
        <div className="px-2 pt-2">
          <PromoStrip campaign={home?.campaign ?? null} />
        </div>
        <div className="mt-2 flex min-h-[calc(100vh-64px)] px-2">
          <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
          <section
            data-testid="libtv-shell-content"
            className="min-w-0 flex-1 bg-[#111]"
          >
            <AccountRail account={home?.account ?? null} />
            <main>{children}</main>
          </section>
        </div>
      </div>
    </HomeDiscoveryContext.Provider>
  )
}
