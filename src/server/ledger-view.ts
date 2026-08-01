import type { JobStatus, LedgerEntry } from '@/domain/types'
import { ledgerView } from '@/server/ledger'
import type { WorkspaceState } from '@/server/store'

/*
 * Ledger projection for the account screen.
 *
 * This lives beside the route rather than inside it because Next.js only
 * permits a fixed set of exports from a route file — `tsc` accepts extra ones
 * but `next build` rejects them, so a projection exported from the handler
 * breaks the production build while every other check stays green.
 *
 * The three collections still come straight from `ledgerView`. What this adds
 * is derivation the screen cannot do for itself: `charge` pairs a reservation
 * with the settle or release that closed it, `totals` stay correct while
 * `limit` truncates rows, and `jobs` resolves an opaque job id into the canvas
 * coordinates a link needs.
 */

/** Where a reservation ended up. `held` means the job has not finished yet. */
export type ChargeState = 'held' | 'settled' | 'released'

export interface ChargeSummary {
  jobId: string
  state: ChargeState
  /** Credits originally frozen (positive). */
  reserved: number
  /** Credits handed back — a full release, or the remainder of a partial settle. */
  returned: number
  /** What the charge actually cost: `reserved - returned`. Zero once released. */
  net: number
  /** When the settle/release closed it; null while still held. */
  resolvedAt: string | null
}

export interface JobLink {
  jobId: string
  projectId: string
  canvasId: string
  nodeId: string
  modelId: string
  status: JobStatus
}

export interface LedgerRow extends LedgerEntry {
  /** Present on every entry that belongs to a job's reserve → settle/release chain. */
  charge: ChargeSummary | null
}

export interface LedgerTotals {
  /** Sum of every grant and purchase. */
  earned: number
  /** Sum of every reservation ever made. */
  reserved: number
  /** Sum of everything given back. */
  returned: number
  /** Credits gone from the balance: `reserved - returned`. */
  spent: number
  /** The part of `spent` still frozen in unfinished jobs. */
  held: number
}

export interface LedgerCounts {
  earned: number
  spent: number
  returned: number
}

export interface LedgerViewProjection {
  balance: number
  earned: LedgerRow[]
  spent: LedgerRow[]
  returned: LedgerRow[]
  counts: LedgerCounts
  totals: LedgerTotals
  /** Keyed by job id, limited to the jobs the returned rows actually reference. */
  jobs: Record<string, JobLink>
}

/**
 * `logicalChargeId` is `<kind>:<subject>`. The kind is the only thing that
 * separates the partial refund a settle emits (`release-partial:`) from a full
 * release (`release:`) — both are typed `release` in the entry.
 */
function chargeKind(entry: LedgerEntry): string {
  const separator = entry.logicalChargeId.indexOf(':')
  return separator < 0 ? entry.logicalChargeId : entry.logicalChargeId.slice(0, separator)
}

/**
 * Fold a job's reserve / settle / release entries into one outcome.
 *
 * Order-independent on purpose: the caller may hand entries over oldest- or
 * newest-first, and a full release always wins over a settle so a refunded job
 * can never read as "已结算".
 */
export function buildCharges(entries: LedgerEntry[]): Map<string, ChargeSummary> {
  const charges = new Map<string, ChargeSummary>()

  for (const entry of entries) {
    const jobId = entry.jobId
    if (!jobId) continue
    const kind = chargeKind(entry)
    if (kind !== 'reserve' && kind !== 'settle' && kind !== 'release' && kind !== 'release-partial') continue

    let charge = charges.get(jobId)
    if (!charge) {
      charge = { jobId, state: 'held', reserved: 0, returned: 0, net: 0, resolvedAt: null }
      charges.set(jobId, charge)
    }

    if (kind === 'reserve') {
      // A reservation is written as a negative amount; the summary is positive.
      charge.reserved += -entry.credits
    } else if (kind === 'release' || kind === 'release-partial') {
      charge.returned += entry.credits
    }

    if (kind === 'release') {
      charge.state = 'released'
      charge.resolvedAt = entry.createdAt
    } else if (kind === 'settle' && charge.state !== 'released') {
      charge.state = 'settled'
      charge.resolvedAt = entry.createdAt
    }
  }

  for (const charge of charges.values()) charge.net = charge.reserved - charge.returned
  return charges
}

export function totalsOf(entries: LedgerEntry[], charges: Map<string, ChargeSummary>): LedgerTotals {
  let earned = 0
  let reserved = 0
  let returned = 0

  for (const entry of entries) {
    if (entry.type === 'grant' || entry.type === 'purchase') earned += entry.credits
    else if (entry.type === 'reserve') reserved += -entry.credits
    else if (entry.type === 'release') returned += entry.credits
  }

  let held = 0
  for (const charge of charges.values()) {
    if (charge.state === 'held') held += charge.net
  }

  // `spent` is exactly what left the balance, which keeps the identity
  // `balance === earned - spent` true for any ledger.
  return { earned, reserved, returned, spent: reserved - returned, held }
}

function attach(entries: LedgerEntry[], charges: Map<string, ChargeSummary>, limit?: number): LedgerRow[] {
  const page = limit === undefined ? entries : entries.slice(0, limit)
  return page.map((entry) => ({
    ...entry,
    charge: entry.jobId ? charges.get(entry.jobId) ?? null : null,
  }))
}

/** The whole payload the account screen consumes, derived from persisted state. */
export function projectLedger(
  state: WorkspaceState,
  spaceId: string,
  limit?: number,
): LedgerViewProjection {
  const view = ledgerView(state, spaceId)
  const entries = state.ledger.filter((e) => e.spaceId === spaceId)
  const charges = buildCharges(entries)

  const earned = attach(view.earned, charges, limit)
  const spent = attach(view.spent, charges, limit)
  const returned = attach(view.returned, charges, limit)

  // Only the jobs the returned page can actually link to, so the payload grows
  // with the page rather than with the lifetime job history.
  const jobs: Record<string, JobLink> = {}
  for (const row of [...earned, ...spent, ...returned]) {
    if (!row.jobId || jobs[row.jobId]) continue
    const job = state.jobs.find((j) => j.id === row.jobId)
    if (!job) continue
    jobs[row.jobId] = {
      jobId: job.id,
      projectId: job.projectId,
      canvasId: job.canvasId,
      nodeId: job.nodeId,
      modelId: job.modelId,
      status: job.status,
    }
  }

  return {
    balance: view.balance,
    earned,
    spent,
    returned,
    counts: {
      earned: view.earned.length,
      spent: view.spent.length,
      returned: view.returned.length,
    },
    totals: totalsOf(entries, charges),
    jobs,
  }
}
