'use client'

import { useEffect, useState } from 'react'
import type { AccountProfileResponse } from '@/contracts/account'
import { getShowcaseSessionMode, type ShowcaseSessionMode } from '@/api/showcase'
import { client } from '@/lib/api'

/** Resolve the deterministic Account projection once before a public mutation. */
export function useShowcaseSession(): ShowcaseSessionMode {
  const [profile, setProfile] = useState<AccountProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void client.account
      .get()
      .then((next) => {
        if (!cancelled) setProfile(next)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '登录状态暂时不可用')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return getShowcaseSessionMode({ loading, profile, error })
}
