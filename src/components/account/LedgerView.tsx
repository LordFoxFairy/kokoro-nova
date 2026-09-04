'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import type { JobLink, LedgerCounts, LedgerRow } from '@/server/ledger-view'
import { EmptyState, SegmentedControl, Spinner } from '../ui/controls'
import {
  IconCheck,
  IconChevronRight,
  IconCredit,
  IconPlus,
  IconSparkle,
  IconUndo,
} from '../icons'

/**
 * 积分明细.
 *
 * The ledger is double-entry-ish, and read as a flat list it is unreadable: a
 * generation writes a negative reservation first and only later a settle or a
 * release, so the same job appears twice with amounts that do not obviously
 * cancel. Two things fix that here:
 *
 *  - the three collections stay separate, because 获取 / 消耗 / 返还 is how the
 *    domain models the ledger, not a filter invented for this screen;
 *  - every row of a job's chain carries the same `charge` outcome, so "冻结 35 →
 *    已全额返还" is readable from the 消耗 row *and* from the 返还 row. A user
 *    who just watched a generation fail lands on 返还 and needs the answer
 *    there, not after cross-referencing two ids.
 */

type Collection = 'earned' | 'spent' | 'returned'

export function getLedgerTabStatus(collection: Collection, count: number): string {
  const label = collection === 'earned' ? '获取' : collection === 'spent' ? '消耗' : '返还'
  return count > 0 ? `当前查看“${label}”，共 ${count} 条记录。` : `当前查看“${label}”，暂无记录。`
}

const COLLECTIONS: { value: Collection; label: string }[] = [
  { value: 'earned', label: '获取' },
  { value: 'spent', label: '消耗' },
  { value: 'returned', label: '返还' },
]

const EMPTY: Record<Collection, { title: string; description: string }> = {
  earned: {
    title: '暂无获取记录',
    description: '赠送与充值都会记在这里，每一笔都带上到账后的余额。',
  },
  spent: {
    title: '暂无消耗记录',
    description: '确认生成时会先冻结对应积分，任务结束后再按实际产出结算。',
  },
  returned: {
    title: '暂无返还记录',
    description: '生成失败、被取消或触发合规拦截时，冻结的积分会全额退回，退回记录会出现在这里。',
  },
}

export function LedgerView({
  earned,
  spent,
  returned,
  counts,
  jobs,
  limit,
  onLoadMore,
  loadingMore,
}: {
  earned: LedgerRow[]
  spent: LedgerRow[]
  returned: LedgerRow[]
  counts: LedgerCounts
  jobs: Record<string, JobLink>
  /** Rows asked for per collection, so a short response can be recognised. */
  limit: number
  onLoadMore: () => void
  loadingMore: boolean
}) {
  const [collection, setCollection] = useState<Collection>('spent')
  const rows = collection === 'earned' ? earned : collection === 'spent' ? spent : returned
  const total = counts[collection]
  // The handler caps how many rows one response may carry. A page shorter than
  // the one requested therefore means "this is everything you will get", and
  // asking again would leave 加载更多 promising rows it can never deliver.
  const exhausted = rows.length < limit

  return (
    <section data-testid="ledger-view" aria-busy={loadingMore}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink-900">积分明细</h2>
        <div role="group" aria-label="积分明细分类">
          <SegmentedControl
            value={collection}
            onChange={setCollection}
            options={COLLECTIONS.map((c) => ({
              value: c.value,
              testId: `ledger-tab-${c.value}`,
              label: (
                <>
                  {c.label}
                  <span className="tabular-nums text-ink-600">{' '}{counts[c.value]}</span>
                </>
              ),
            }))}
          />
        </div>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {getLedgerTabStatus(collection, total)}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<IconCredit size={28} />}
          title={EMPTY[collection].title}
          description={EMPTY[collection].description}
        />
      ) : (
        <>
          <ul className="mt-3" data-testid={`ledger-list-${collection}`}>
            {rows.map((row) => (
              <Row key={row.id} row={row} job={row.jobId ? jobs[row.jobId] ?? null : null} />
            ))}
          </ul>
          {rows.length < total && !exhausted ? (
            <div className="pt-4 text-center">
              <button
                type="button"
                data-testid="ledger-load-more"
                onClick={onLoadMore}
                disabled={loadingMore}
                aria-busy={loadingMore}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3.5 py-2 text-[13px] text-ink-700 transition-colors hover:bg-ink-50 disabled:cursor-wait disabled:text-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {loadingMore && <Spinner size={13} />}
                加载更多（还有 {total - rows.length} 条）
              </button>
            </div>
          ) : (
            <div className="pt-6 text-center text-[13px] text-ink-600" role="status" aria-live="polite">
              {rows.length < total ? `仅展示最近 ${rows.length} 条` : '没有更多了'}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Row({ row, job }: { row: LedgerRow; job: JobLink | null }) {
  const status = statusOf(row)
  // A reservation that came back should not read as money spent, so its amount
  // is struck through rather than merely annotated.
  const refunded = row.type === 'reserve' && row.charge?.state === 'released'

  return (
    <li
      data-testid={`ledger-row-${row.id}`}
      className="flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-ink-50"
    >
      <span
        className={cn(
          'mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
          row.credits > 0 ? 'bg-success/10 text-ink-700' : row.credits < 0 ? 'bg-ink-100 text-ink-600' : 'bg-accent-soft text-accent-ink',
        )}
      >
        {iconOf(row)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] text-ink-900">{row.note}</span>
          {status && <Badge tone={status.tone}>{status.text}</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-600">
          <span className="tabular-nums">{formatTime(row.createdAt)}</span>
          {job ? (
            <>
              <span aria-hidden="true">·</span>
              <Link
                href={`/canvas?projectId=${job.projectId}&canvasId=${job.canvasId}`}
                data-testid={`ledger-job-link-${row.id}`}
                className="inline-flex items-center gap-0.5 text-accent-ink transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                回到任务
                <IconChevronRight size={12} />
              </Link>
            </>
          ) : (
            row.jobId && (
              <>
                <span aria-hidden="true">·</span>
                <span>任务记录已清理</span>
              </>
            )
          )}
        </div>
      </div>

      <div className="shrink-0 pl-2 text-right">
        <div
          className={cn(
            'text-[13px] font-medium tabular-nums',
            refunded
              ? 'text-ink-600 line-through'
              : row.credits > 0
                ? 'text-ink-700'
                : row.credits < 0
                  ? 'text-ink-900'
                  : 'text-ink-600',
          )}
        >
          {formatAmount(row.credits)}
        </div>
        <div className="mt-0.5 text-[11px] tabular-nums text-ink-600">余额 {row.balanceAfter}</div>
      </div>
    </li>
  )
}

type Tone = 'success' | 'running' | 'neutral'

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-[3px] text-[11px]',
        tone === 'success'
          ? 'bg-success/10 text-ink-700'
          : tone === 'running'
            ? 'bg-running/15 text-ink-700'
            : 'bg-ink-100 text-ink-600',
      )}
    >
      {children}
    </span>
  )
}

/**
 * The outcome of the whole reserve → settle/release chain, phrased from the
 * point of view of the row it sits on.
 */
function statusOf(row: LedgerRow): { text: string; tone: Tone } | null {
  const charge = row.charge
  if (!charge) return null

  if (charge.state === 'released') {
    return { text: `冻结 ${charge.reserved} 已全额退回，实扣 0`, tone: 'success' }
  }
  if (charge.state === 'settled') {
    return charge.returned > 0
      ? { text: `冻结 ${charge.reserved}，结算 ${charge.net}，退回 ${charge.returned}`, tone: 'neutral' }
      : { text: `已结算 ${charge.net}`, tone: 'neutral' }
  }
  return { text: `冻结中 ${charge.net}`, tone: 'running' }
}

function iconOf(row: LedgerRow) {
  if (row.type === 'grant' || row.type === 'purchase') return <IconPlus size={14} />
  if (row.type === 'reserve') return <IconSparkle size={14} />
  if (row.type === 'settle') return <IconCheck size={14} />
  return <IconUndo size={14} />
}

function formatAmount(credits: number): string {
  if (credits > 0) return `+${credits}`
  if (credits < 0) return `${credits}`
  return '0'
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}
