import Link from 'next/link'

import type { HomeDiscoveryResponse } from '@/contracts/home'
import { IconCredit } from '@/components/icons'

type AccountRailProps = {
  account: HomeDiscoveryResponse['account'] | null
}

function RailButton({ children, href = '#' }: { children: React.ReactNode; href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#242424] px-3 text-[13px] text-white/85 transition-colors hover:bg-[#2d2d2d] hover:text-white"
    >
      {children}
    </Link>
  )
}

export function AccountRail({ account }: AccountRailProps) {
  return (
    <header
      data-testid="libtv-account-rail"
      className="flex h-[42px] items-start justify-end gap-2 px-3 pt-0.5"
    >
      <RailButton href="/canvas">
        <span aria-hidden="true" className="text-[15px]">◉</span>
        Blender 插件
      </RailButton>
      <RailButton href="/account">
        <span aria-hidden="true">🧰</span>
        积分超市
      </RailButton>
      <RailButton href="/account">
        <span aria-hidden="true">◆</span>
        {account?.membershipLabel ?? '开通会员'}
        <span className="text-[11px] text-[#d7aa5b]">限时 45 折</span>
      </RailButton>
      <RailButton href="/account">
        <IconCredit size={14} className="text-white" />
        <span data-testid="shell-credit-balance">{account?.credits ?? '—'}</span>
      </RailButton>
      <Link
        href="/account"
        aria-label="账户"
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-gradient-to-br from-[#e9d8ff] to-[#6872ff] text-[12px] font-bold text-[#20213a]"
      >
        L
        <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[#ff5959]" />
      </Link>
    </header>
  )
}
