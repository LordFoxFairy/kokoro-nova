'use client'

import React, { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { modelsFor, type ModelMedia } from '@/domain/models'
import { api } from '@/lib/api'
import type { LedgerViewProjection } from '@/server/ledger-view'
import { EmptyState, Spinner } from '../ui/controls'
import { IconAudio, IconCredit, IconImage, IconRefresh, IconScript, IconVideo } from '../icons'
import { LedgerView } from './LedgerView'

/**
 * 积分账户.
 *
 * The balance already appears in the editor, but only as a number that moves on
 * its own. This page exists to answer the two questions that number raises —
 * where did it go, and did the failed run cost me anything — so the summary is
 * deliberately split into 已结算 / 冻结中 / 已返还 rather than a single "spent".
 */

/** Rows fetched per collection; 加载更多 raises the shared limit by this much. */
const PAGE_SIZE = 20

export type AccountRequestState = 'initial-loading' | 'refreshing' | 'ready' | 'error' | 'stale-error'

export function getAccountRequestState({
  loading,
  hasData,
  error,
}: {
  loading: boolean
  hasData: boolean
  error: string | null
}): AccountRequestState {
  if (error) return hasData ? 'stale-error' : 'error'
  if (loading) return hasData ? 'refreshing' : 'initial-loading'
  return 'ready'
}

export function AccountPage() {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [data, setData] = useState<LedgerViewProjection | null>(null)
  // The limit `data` was actually fetched with. It trails `limit` while a
  // refetch is in flight, and 加载更多 has to be judged against the page on
  // screen rather than against the one still loading.
  const [loadedLimit, setLoadedLimit] = useState(PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFetching(true)
    setLoadError(null)
    void api
      .get<LedgerViewProjection>(`/api/ledger?limit=${limit}`)
      .then((next) => {
        if (cancelled) return
        setData(next)
        setLoadedLimit(limit)
        setLastUpdated(new Date().toISOString())
      })
      // A failed refetch keeps the rows already on screen rather than blanking
      // them; only a failed first load has nothing to fall back to.
      .catch((cause: unknown) => {
        if (cancelled) return
        setLoadError(cause instanceof Error ? cause.message : '积分明细加载失败，请稍后重试')
      })
      .finally(() => {
        if (cancelled) return
        setFetching(false)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [limit, reloadToken])

  const requestState = getAccountRequestState({ loading, hasData: Boolean(data), error: loadError })
  const retry = () => setReloadToken((token) => token + 1)

  return (
    <div className="min-h-screen bg-surface" data-testid="account-page" aria-busy={fetching}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-5">
        <Link href="/" className="flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-900 text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7.5 8 5l6 2.5L20 5v11.5L14 19l-6-2.5L4 19z" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink-900">Kokoro Nova</span>
        </Link>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 rounded-full bg-ink-50 px-3 py-2 text-[13px] font-medium text-ink-700"
            data-testid="account-balance-pill"
          >
            <IconCredit size={14} className="text-running" aria-hidden="true" />
            <span className="tabular-nums">{data?.balance ?? 0}</span>
          </div>
          <Link
            href="/project"
            className="rounded-full bg-ink-50 px-3 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:bg-ink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-4"
          >
            我的项目
          </Link>
          <button
            type="button"
            data-testid="account-refresh"
            aria-label="刷新积分账户"
            aria-busy={fetching}
            onClick={retry}
            disabled={fetching}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:cursor-wait disabled:text-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconRefresh size={13} className={fetching ? 'animate-spin' : undefined} />
            {fetching ? '刷新中' : '刷新'}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-20 sm:px-8" aria-labelledby="account-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 id="account-title" className="text-[17px] font-semibold text-ink-900">积分账户</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-600">
              每次生成都会先冻结报价里的积分，成功后按实际产出结算，失败、取消或被合规拦截时全额退回。
            </p>
          </div>
          <div className="text-[11px] text-ink-600" data-testid="account-refresh-status" role="status" aria-live="polite">
            {requestState === 'initial-loading' ? '正在加载积分明细…' : requestState === 'refreshing' ? '正在刷新积分明细…' : lastUpdated ? `已更新 ${formatUpdatedAt(lastUpdated)}` : ''}
          </div>
        </div>

        {loading && !data ? (
          <div className="flex justify-center py-20 text-ink-600" role="status" aria-label="正在加载积分明细">
            <Spinner size={22} />
          </div>
        ) : data ? (
          <div className="mt-6 space-y-10">
            {loadError && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-danger/8 px-3.5 py-2.5 text-[12px] text-danger" role="alert">
                <span>刷新失败，仍显示上次成功读取的账本：{loadError}</span>
                <button
                  type="button"
                  data-testid="account-retry"
                  onClick={retry}
                  disabled={fetching}
                  aria-busy={fetching}
                  className="rounded-lg bg-surface px-3 py-1.5 font-medium text-danger ring-1 ring-danger/20 hover:bg-danger/5 disabled:cursor-wait disabled:text-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
                >
                  重试
                </button>
              </div>
            )}
            <Summary data={data} />
            <CostGuide />
            <LedgerView
              earned={data.earned}
              spent={data.spent}
              returned={data.returned}
              counts={data.counts}
              jobs={data.jobs}
              limit={loadedLimit}
              loadingMore={fetching}
              onLoadMore={() => setLimit((current) => current + PAGE_SIZE)}
            />
          </div>
        ) : (
          <EmptyState
            icon={<IconCredit size={30} />}
            title="积分明细加载失败"
            description={loadError ?? '暂时没有读到账户数据。'}
            action={
              <button
                type="button"
                data-testid="account-retry"
                onClick={retry}
                disabled={fetching}
                aria-busy={fetching}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-wait disabled:bg-ink-200 disabled:text-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <IconRefresh size={14} className={fetching ? 'animate-spin' : undefined} />
                {fetching ? '重试中…' : '重试'}
              </button>
            }
          />
        )}
      </main>
    </div>
  )
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function Summary({ data }: { data: LedgerViewProjection }) {
  const { totals } = data
  // `spent` still contains the reservations of unfinished jobs, so the settled
  // figure has to subtract them — otherwise a running job looks like a charge.
  const settled = totals.spent - totals.held

  return (
    <section>
      <div className="rounded-2xl bg-gradient-to-br from-accent-soft to-ink-50 p-6 ring-1 ring-accent/25">
        <div className="text-[12px] font-medium text-accent-ink">可用积分</div>
        <div className="mt-1 flex items-end gap-2">
          <IconCredit size={26} className="mb-1 text-running" aria-hidden="true" />
          <span className="text-[38px] font-semibold leading-none tabular-nums text-ink-900">
            {data.balance}
          </span>
        </div>
        <div className="mt-2 text-[12px] leading-relaxed text-ink-600">
          {totals.held > 0
            ? `另有 ${totals.held} 积分冻结在尚未结束的任务里，未成功会自动退回。`
            : '当前没有被冻结的积分，全部余额都可以立即使用。'}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="累计获取" value={totals.earned} hint="赠送与充值" />
        <Stat label="已结算消耗" value={settled} hint="生成成功后实扣" />
        <Stat label="已返还" value={totals.returned} hint="失败、取消与部分退回" />
        <Stat label="冻结中" value={totals.held} hint="进行中的任务占用" />
      </div>
    </section>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl bg-ink-50 px-4 py-3">
      <div className="text-[12px] text-ink-600">{label}</div>
      <div className="mt-0.5 text-[20px] font-semibold leading-tight tabular-nums text-ink-900">{value}</div>
      <div className="mt-0.5 text-[11px] text-ink-600">{hint}</div>
    </div>
  )
}

const COST_GROUPS: { media: ModelMedia; label: string; icon: ReactNode; hint: string }[] = [
  { media: 'image', label: '图片生成', icon: <IconImage size={15} />, hint: '按分辨率、画质与张数叠加' },
  { media: 'video', label: '视频生成', icon: <IconVideo size={15} />, hint: '按时长、分辨率与是否生成音频叠加' },
  { media: 'audio', label: '语音与音乐', icon: <IconAudio size={15} />, hint: '按模型与时长计费' },
  { media: 'text', label: '脚本与提示词', icon: <IconScript size={15} />, hint: '分镜拆解与 Agent 调用' },
]

/** Prices come from the same catalog the confirm gate quotes from, so this
 * section cannot drift away from what a run actually costs. */
function CostGuide() {
  return (
    <section>
      <h2 className="text-[15px] font-semibold text-ink-900">积分用在哪里</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-600">
        只有生成会花积分：建节点、连边、整理画布和发布作品都不计费。
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {COST_GROUPS.map((group) => {
          const models = modelsFor(group.media)
          const cheapest = Math.min(...models.map((m) => m.baseCredits))
          return (
            <div key={group.media} className="rounded-xl bg-ink-50 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="text-ink-600">{group.icon}</span>
                <span className="text-[13px] font-medium text-ink-900">{group.label}</span>
                <span className="ml-auto flex items-center gap-0.5 text-[12px] tabular-nums text-ink-600">
                  <IconCredit size={12} className="text-running" aria-hidden="true" />
                  {cheapest} 起
                </span>
              </div>
              <div className="mt-1.5 text-[12px] leading-relaxed text-ink-600">{group.hint}</div>
              <div className="mt-1 text-[11px] text-ink-600">{models.length} 个可选模型</div>
            </div>
          )
        })}
      </div>

      <ul className="mt-3 space-y-1.5 text-[12px] leading-relaxed text-ink-600">
        <li>· 确认生成时冻结的是报价单上的合计值，报价超过 10 分钟未确认会失效并重新计算。</li>
        <li>· 实际产出少于预期时，多冻结的部分会在结算的同时退回。</li>
        <li>· 同一次生成重试或回调重复到达都只记一笔，不会重复扣费。</li>
      </ul>
    </section>
  )
}
