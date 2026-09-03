'use client'

import { useState } from 'react'

import type { HomeDiscoveryResponse } from '@/contracts/home'
import { IconClose } from '@/components/icons'

type PromoStripProps = {
  campaign: HomeDiscoveryResponse['campaign'] | null
}

export function PromoStrip({ campaign }: PromoStripProps) {
  const [visible, setVisible] = useState(true)
  if (!visible) return null

  return (
    <aside
      data-testid="libtv-promo-strip"
      aria-label="限时活动"
      className="relative flex h-12 items-center justify-center overflow-hidden rounded-lg border border-white/[0.04] bg-[#1a306e] px-16 text-[14px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.04)]"
    >
      <span className="mr-3 inline-flex h-8 items-center gap-2 rounded-full bg-[#ec4d9d] px-4 font-medium shadow-[inset_0_0_0_1px_rgba(255,255,255,.24)]">
        <span aria-hidden="true">⏱</span>
        活动剩余&nbsp; 5 天 23 时 18 分 33 秒
        <span aria-hidden="true">›</span>
      </span>
      <span className="truncate font-medium">
        <span className="mr-1.5 text-[#ffbe67]" aria-hidden="true">✹</span>
        {campaign?.message ?? 'Seedance 2.5 720P 年会员生成限时 5 折起，低至 0.39 元/秒'}
      </span>
      <button
        type="button"
        className="ml-3 shrink-0 rounded-full border border-white/80 px-4 py-1.5 text-[13px] font-medium transition-colors hover:bg-white hover:text-[#172d69]"
      >
        {campaign?.cta ?? '限时抢购'}
      </button>
      <button
        type="button"
        aria-label="关闭活动横幅"
        onClick={() => setVisible(false)}
        className="absolute right-4 rounded-md p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
      >
        <IconClose size={15} />
      </button>
    </aside>
  )
}
