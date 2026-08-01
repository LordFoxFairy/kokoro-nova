import { ids } from '@/domain/ids'
import type { LedgerEntry, LedgerEntryType } from '@/domain/types'
import type { WorkspaceState } from './store'

/**
 * Append-only credit ledger.
 *
 * Invariants from the billing draft that this module enforces:
 *  - every entry carries a `logicalChargeId`; a repeated attempt or webhook
 *    with the same id is a no-op rather than a second charge;
 *  - a reservation is written before a job leaves `awaiting_confirmation`;
 *  - settle/release always reference the reservation's job.
 */

export class InsufficientCreditsError extends Error {
  constructor(public readonly required: number, public readonly available: number) {
    super(`积分不足：需要 ${required}，当前余额 ${available}`)
    this.name = 'InsufficientCreditsError'
  }
}

function append(
  state: WorkspaceState,
  spaceId: string,
  type: LedgerEntryType,
  credits: number,
  logicalChargeId: string,
  jobId: string | null,
  note: string,
): LedgerEntry | null {
  // Idempotency: the same logical charge never applies twice.
  const existing = state.ledger.find((e) => e.logicalChargeId === logicalChargeId)
  if (existing) return null

  const balance = (state.balances[spaceId] ?? 0) + credits
  const entry: LedgerEntry = {
    id: ids.ledger(),
    spaceId,
    type,
    credits,
    balanceAfter: balance,
    logicalChargeId,
    jobId,
    note,
    createdAt: new Date().toISOString(),
  }
  state.ledger.push(entry)
  state.balances[spaceId] = balance
  return entry
}

/** Hold credits for a quoted job. Throws if the balance cannot cover it. */
export function reserve(
  state: WorkspaceState,
  spaceId: string,
  jobId: string,
  credits: number,
  note: string,
): LedgerEntry | null {
  const available = state.balances[spaceId] ?? 0
  if (credits > available) throw new InsufficientCreditsError(credits, available)
  return append(state, spaceId, 'reserve', -credits, `reserve:${jobId}`, jobId, note)
}

/**
 * Convert a reservation into a final charge. `actualCredits` may be lower than
 * the reservation (e.g. fewer outputs returned); the difference is released.
 */
export function settle(
  state: WorkspaceState,
  spaceId: string,
  jobId: string,
  reservedCredits: number,
  actualCredits: number,
  note: string,
): void {
  append(state, spaceId, 'settle', 0, `settle:${jobId}`, jobId, `${note}（结算 ${actualCredits} 积分）`)
  const refund = reservedCredits - actualCredits
  if (refund > 0) {
    append(state, spaceId, 'release', refund, `release-partial:${jobId}`, jobId, '部分返还')
  }
}

/** Give the whole reservation back — failure, cancellation or compliance block. */
export function release(
  state: WorkspaceState,
  spaceId: string,
  jobId: string,
  credits: number,
  note: string,
): void {
  append(state, spaceId, 'release', credits, `release:${jobId}`, jobId, note)
}

export function grant(state: WorkspaceState, spaceId: string, credits: number, note: string): void {
  append(state, spaceId, 'grant', credits, `grant:${ids.ledger()}`, null, note)
}

export function purchase(state: WorkspaceState, spaceId: string, credits: number, orderId: string): void {
  append(state, spaceId, 'purchase', credits, `purchase:${orderId}`, null, '积分充值')
}

export interface LedgerView {
  balance: number
  earned: LedgerEntry[]
  spent: LedgerEntry[]
  returned: LedgerEntry[]
}

/** 积分明细 is organised as 获取 / 消耗 / 返还 rather than one flat list. */
export function ledgerView(state: WorkspaceState, spaceId: string): LedgerView {
  const entries = state.ledger.filter((e) => e.spaceId === spaceId).slice().reverse()
  return {
    balance: state.balances[spaceId] ?? 0,
    earned: entries.filter((e) => e.type === 'grant' || e.type === 'purchase'),
    spent: entries.filter((e) => e.type === 'reserve' || e.type === 'settle'),
    returned: entries.filter((e) => e.type === 'release'),
  }
}
