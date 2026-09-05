import { describe, expect, it } from 'vitest'

import { getAccountRequestState, getTeamSurfaceRequestState, shouldSyncAccountSectionFromQuery } from '../AccountPage'
import { getLedgerTabStatus } from '../LedgerView'

describe('account surface state copy', () => {
  it('explains the active ledger tab and count', () => {
    expect(getLedgerTabStatus('spent', 3)).toBe('当前查看“消耗”，共 3 条记录。')
    expect(getLedgerTabStatus('returned', 0)).toBe('当前查看“返还”，暂无记录。')
  })

  it('does not reapply an unchanged initial query section over a keyboard selection', () => {
    expect(shouldSyncAccountSectionFromQuery('overview', 'overview')).toBe(false)
    expect(shouldSyncAccountSectionFromQuery('overview', 'wallet')).toBe(true)
  })

  it('distinguishes first load, refresh and retryable failure', () => {
    expect(getAccountRequestState({ loading: true, hasData: false, error: null })).toBe('initial-loading')
    expect(getAccountRequestState({ loading: true, hasData: true, error: null })).toBe('refreshing')
    expect(getAccountRequestState({ loading: false, hasData: true, error: '网络错误' })).toBe('stale-error')
    expect(getAccountRequestState({ loading: false, hasData: false, error: '网络错误' })).toBe('error')
  })

  it('keeps the isolated team projection loading, retry and stale-data states explicit', () => {
    expect(getTeamSurfaceRequestState({ loading: true, hasData: false, error: null })).toBe('loading')
    expect(getTeamSurfaceRequestState({ loading: false, hasData: true, error: null })).toBe('ready')
    expect(getTeamSurfaceRequestState({ loading: false, hasData: false, error: '团队服务不可用' })).toBe('error')
    expect(getTeamSurfaceRequestState({ loading: false, hasData: true, error: '团队服务不可用' })).toBe('stale-error')
  })
})
