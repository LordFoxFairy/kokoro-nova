'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { MODELS_BY_ID } from '@/domain/models'
import type { GenerationJob } from '@/domain/types'
import { useEditor } from '@/lib/editor-store'
import { Dialog } from '../ui/Dialog'
import { IconCredit, IconWarning } from '../icons'
import { Spinner } from '../ui/controls'

export type ConfirmGateAction = 'confirm' | 'cancel'

export interface ConfirmGateQuoteState {
  expired: boolean
  insufficient: boolean
  canConfirm: boolean
}

/**
 * Keep the expiry rule in one place. An invalid timestamp is stale rather than
 * an opportunity to submit a quote whose validity is unknown.
 */
export function isQuoteExpired(expiresAt: string, now = Date.now()): boolean {
  const expiry = Date.parse(expiresAt)
  return !Number.isFinite(expiry) || expiry <= now
}

export function getConfirmGateQuoteState(
  quote: Pick<GenerationJob['quote'], 'credits' | 'expiresAt'>,
  balance: number,
  now = Date.now(),
): ConfirmGateQuoteState {
  const expired = isQuoteExpired(quote.expiresAt, now)
  const insufficient =
    !Number.isFinite(balance) || !Number.isFinite(quote.credits) || quote.credits > balance

  return {
    expired,
    insufficient,
    canConfirm: !expired && !insufficient,
  }
}

type RecoverableJob = Pick<GenerationJob, 'id' | 'status' | 'createdAt'>

/**
 * The jobs list is the durable source of truth used after a page reload. The
 * API normally returns newest first, but choosing by timestamp keeps recovery
 * deterministic even when a fixture is assembled in a different order.
 */
export function findPendingConfirmationJob<T extends RecoverableJob>(
  jobs: readonly T[],
  dismissedJobIds: ReadonlySet<string> = new Set(),
): T | null {
  let latest: T | null = null
  let latestTime = Number.NEGATIVE_INFINITY

  for (const candidate of jobs) {
    if (candidate.status !== 'awaiting_confirmation' || dismissedJobIds.has(candidate.id)) continue
    const parsedTime = Date.parse(candidate.createdAt)
    const candidateTime = Number.isFinite(parsedTime) ? parsedTime : Number.NEGATIVE_INFINITY
    if (!latest || candidateTime > latestTime) {
      latest = candidate
      latestTime = candidateTime
    }
  }

  return latest
}

interface PendingAction {
  action: ConfirmGateAction
  token: symbol
}

type JobActionListener = () => void

export interface JobActionGate {
  /** Returns the action currently in flight for a job, if any. */
  pendingAction: (jobId: string) => ConfirmGateAction | null
  /** Lets a remounted gate observe the end of an action started elsewhere. */
  subscribe: (jobId: string, listener: JobActionListener) => () => void
  /** Returns null for a duplicate while the first operation is unsettled. */
  run: (
    jobId: string,
    action: ConfirmGateAction,
    operation: () => unknown,
  ) => Promise<unknown> | null
}

/**
 * A small, dependency-free idempotency guard for UI actions. Keeping the
 * registry outside the component also covers a close/reopen while an API
 * transition is still pending.
 */
export function createJobActionGate(): JobActionGate {
  const pending = new Map<string, PendingAction>()
  const listeners = new Map<string, Set<JobActionListener>>()

  const notify = (jobId: string) => {
    const current = listeners.get(jobId)
    if (!current) return
    listeners.delete(jobId)
    for (const listener of current) listener()
  }

  return {
    pendingAction: (jobId) => pending.get(jobId)?.action ?? null,
    subscribe: (jobId, listener) => {
      const current = listeners.get(jobId) ?? new Set<JobActionListener>()
      current.add(listener)
      listeners.set(jobId, current)
      return () => {
        current.delete(listener)
        if (current.size === 0 && !pending.has(jobId)) listeners.delete(jobId)
      }
    },
    run: (jobId, action, operation) => {
      if (pending.has(jobId)) return null

      const token = Symbol(jobId)
      pending.set(jobId, { action, token })

      let promise: Promise<unknown>
      try {
        promise = Promise.resolve(operation())
      } catch (error) {
        promise = Promise.reject(error)
      }

      const clear = () => {
        if (pending.get(jobId)?.token !== token) return
        pending.delete(jobId)
        notify(jobId)
      }
      // Attach both branches here so a rejected transition is still cleaned
      // up when the dialog is closed before its caller observes the result.
      void promise.then(clear, clear)
      return promise
    },
  }
}

const jobActionGate = createJobActionGate()

interface ConfirmGateProps {
  job: GenerationJob | null
  onConfirm: (jobId: string) => void | Promise<unknown>
  onCancel: (jobId: string) => void | Promise<unknown>
  onClose: () => void
}

/**
 * Confirm gate.
 *
 * No paid generation starts without passing through here: the quote is frozen
 * server-side, the balance check happens before the reservation, and the user
 * sees the exact breakdown they are agreeing to.
 */
export function ConfirmGate({ job, onConfirm, onCancel, onClose }: ConfirmGateProps) {
  const balance = useEditor((s) => s.balance)
  const workflowDocument = useEditor((s) => s.document)
  const jobs = useEditor((s) => s.jobs)
  const dismissedJobIds = useRef(new Set<string>())
  const lastExplicitJobId = useRef<string | null>(null)
  const mounted = useRef(false)
  const localActionJobId = useRef<string | null>(null)
  const [, setDismissedVersion] = useState(0)
  const [clock, setClock] = useState(() => Date.now())
  const [pendingAction, setPendingAction] = useState<ConfirmGateAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [gateRevision, setGateRevision] = useState(0)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const explicitJobId = job?.id ?? null

  // A new explicit id is an intentional reopen of that job. A parent that
  // closes the gate sets the prop to null, so dismissed ids remain local to
  // this session until a new job or a full reload supplies them again.
  useEffect(() => {
    if (explicitJobId === lastExplicitJobId.current) return
    if (explicitJobId && dismissedJobIds.current.delete(explicitJobId)) {
      setDismissedVersion((version) => version + 1)
    }
    lastExplicitJobId.current = explicitJobId
  }, [explicitJobId])

  // Treat the first render of a newly supplied id as an explicit reopen even
  // before the effect above clears its session dismissal.
  const explicitReopen = Boolean(job && job.id !== lastExplicitJobId.current)
  const activeJob = job
    ? !dismissedJobIds.current.has(job.id) || explicitReopen
      ? jobs.find((candidate) => candidate.id === job.id) ?? job
      : null
    : findPendingConfirmationJob(jobs, dismissedJobIds.current)
  const awaitingJob = activeJob?.status === 'awaiting_confirmation' ? activeJob : null
  const activeJobId = awaitingJob?.id ?? null
  const quoteExpiresAt = awaitingJob?.quote.expiresAt

  useEffect(() => {
    localActionJobId.current = null
    setClock(Date.now())
    setPendingAction(null)
    setActionError(null)
  }, [activeJobId])

  useEffect(() => {
    if (!activeJobId) return
    return jobActionGate.subscribe(activeJobId, () => {
      if (mounted.current) setGateRevision((revision) => revision + 1)
    })
  }, [activeJobId])

  useEffect(() => {
    if (!activeJobId || !quoteExpiresAt) return

    const expiry = Date.parse(quoteExpiresAt)
    const refreshClock = () => setClock(Date.now())
    refreshClock()
    if (!Number.isFinite(expiry)) return

    const remaining = expiry - Date.now()
    if (remaining <= 0) return

    const timer = window.setTimeout(refreshClock, Math.min(remaining + 1, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [activeJobId, quoteExpiresAt])

  const quoteState = awaitingJob
    ? getConfirmGateQuoteState(awaitingJob.quote, balance, clock)
    : { expired: false, insufficient: false, canConfirm: false }
  const registryAction = awaitingJob ? jobActionGate.pendingAction(awaitingJob.id) : null
  void gateRevision
  const busy = registryAction !== null || pendingAction !== null

  useEffect(() => {
    if (!activeJobId || typeof document === 'undefined') return

    const root = document.querySelector<HTMLElement>('[data-testid="confirm-gate"]')
    if (!root) return

    root.setAttribute('aria-labelledby', 'confirm-gate-title')
    root.setAttribute('aria-describedby', 'confirm-gate-description')
    root.setAttribute('aria-busy', busy ? 'true' : 'false')

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) {
        event.preventDefault()
        root.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault()
          last.focus()
        }
      } else if (currentIndex === -1 || currentIndex === focusable.length - 1) {
        event.preventDefault()
        first.focus()
      }
    }

    root.addEventListener('keydown', onKeyDown)
    return () => root.removeEventListener('keydown', onKeyDown)
  }, [activeJobId, busy, quoteState.expired])

  const handleAction = useCallback(
    (action: ConfirmGateAction) => {
      if (!awaitingJob) return

      const currentQuoteState = getConfirmGateQuoteState(awaitingJob.quote, balance, Date.now())
      if (action === 'confirm' && !currentQuoteState.canConfirm) {
        setClock(Date.now())
        if (currentQuoteState.expired) setActionError('报价已过期，请关闭后重新报价。')
        return
      }

      const promise = jobActionGate.run(awaitingJob.id, action, () =>
        action === 'confirm' ? onConfirm(awaitingJob.id) : onCancel(awaitingJob.id),
      )
      if (!promise) return

      const actionJobId = awaitingJob.id
      localActionJobId.current = actionJobId
      setPendingAction(action)
      setActionError(null)
      void promise.then(
        () => {
          if (!mounted.current || localActionJobId.current !== actionJobId) return
          localActionJobId.current = null
          setPendingAction(null)
        },
        (error: unknown) => {
          if (!mounted.current || localActionJobId.current !== actionJobId) return
          localActionJobId.current = null
          setPendingAction(null)
          if (
            action === 'confirm' &&
            (isQuoteExpiredFailure(error) || isQuoteExpired(awaitingJob.quote.expiresAt))
          ) {
            setClock(Date.now())
            setActionError('报价已过期，请关闭后重新报价。')
          } else {
            setActionError(errorMessage(error))
          }
        },
      )
    },
    [awaitingJob, balance, onCancel, onConfirm],
  )

  const handleClose = useCallback(() => {
    if (awaitingJob) {
      dismissedJobIds.current.add(awaitingJob.id)
    }
    localActionJobId.current = null
    // Closing is a user-level dismissal, not a request to cycle through an
    // older pending quote. Keep the current session closed until an explicit
    // job is opened again; a full reload starts with a fresh dismissal set.
    for (const candidate of jobs) {
      if (candidate.status === 'awaiting_confirmation') dismissedJobIds.current.add(candidate.id)
    }
    setDismissedVersion((version) => version + 1)
    setPendingAction(null)
    setActionError(null)
    onClose()
  }, [awaitingJob, jobs, onClose])

  if (!awaitingJob) return null

  const node = workflowDocument.nodes.find((candidate) => candidate.id === awaitingJob.nodeId)
  const model = MODELS_BY_ID.get(awaitingJob.modelId)
  const confirmDisabled = !quoteState.canConfirm || busy
  const busyLabel = pendingAction === 'cancel' || registryAction === 'cancel' ? '取消中…' : '确认中…'

  return (
    <Dialog
      open
      onClose={handleClose}
      title={
        <h2 id="confirm-gate-title" className="text-[15px] font-semibold text-ink-900">
          确认生成
        </h2>
      }
      width={420}
      testId="confirm-gate"
    >
      <form
        aria-label="生成确认"
        onSubmit={(event) => {
          event.preventDefault()
          handleAction('confirm')
        }}
      >
        <div id="confirm-gate-description" className="space-y-4">
          <div className="space-y-1.5 text-[13px]">
            <Row label="节点" value={node?.name ?? awaitingJob.nodeId} />
            <Row
              label="模型"
              value={`${model?.label ?? awaitingJob.modelId}${model?.latencyLabel ? `（${model.latencyLabel}）` : ''}`}
            />
            {awaitingJob.spec.output.aspectRatio && <Row label="画幅" value={awaitingJob.spec.output.aspectRatio} />}
            {awaitingJob.spec.output.resolution && <Row label="分辨率" value={awaitingJob.spec.output.resolution} />}
            {awaitingJob.spec.output.durationSeconds && (
              <Row label="时长" value={`${awaitingJob.spec.output.durationSeconds} 秒`} />
            )}
            <Row label="数量" value={`${awaitingJob.spec.output.count ?? 1}`} />
            <Row label="输入" value={`${awaitingJob.spec.inputs.length} 项`} />
          </div>

          <div className="rounded-xl bg-ink-50 p-3">
            <div className="mb-2 text-[12px] font-medium text-ink-600">积分预估</div>
            <div className="space-y-1">
              {awaitingJob.quote.breakdown.map((line, index) => (
                <div key={`${line.label}-${index}`} className="flex justify-between text-[12px] text-ink-500">
                  <span>{line.label}</span>
                  <span className="tabular-nums">{line.credits > 0 ? `+${line.credits}` : line.credits}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-ink-200 pt-2 text-[13px] font-medium text-ink-900">
              <span>合计</span>
              <span className="flex items-center gap-0.5 tabular-nums">
                <IconCredit size={13} className="text-running" />
                {awaitingJob.quote.credits}
              </span>
            </div>
            <div className="mt-1 text-right text-[11px] text-ink-400">当前余额 {balance}</div>
          </div>

          {quoteState.expired && (
            <div
              data-testid="quote-expired"
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-danger/8 p-3 text-[12px] text-danger"
            >
              <IconWarning size={14} className="mt-px shrink-0" />
              <span>报价已过期，请关闭后重新报价。</span>
            </div>
          )}

          {quoteState.insufficient && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-danger/8 p-3 text-[12px] text-danger"
            >
              <IconWarning size={14} className="mt-px shrink-0" />
              <span>
                积分不足，需要 {awaitingJob.quote.credits}，当前余额 {balance}。
              </span>
            </div>
          )}

          {actionError && !quoteState.expired && (
            <div
              data-testid="confirm-action-error"
              role="alert"
              className="rounded-xl bg-danger/8 p-3 text-[12px] text-danger"
            >
              {actionError}
            </div>
          )}

          {busy && (
            <div data-testid="confirm-action-status" role="status" aria-live="polite" className="flex items-center gap-2 text-[12px] text-ink-500">
              <Spinner size={13} />
              {pendingAction === 'cancel' || registryAction === 'cancel' ? '正在取消…' : '正在确认…'}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-5">
          {/* Closing dismisses the gate; cancelling is the persisted job transition. */}
          <button
            type="button"
            data-testid="confirm-cancel"
            disabled={busy}
            onClick={() => handleAction('cancel')}
            className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-ink-600 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            data-testid="confirm-generate"
            disabled={confirmDisabled}
            aria-disabled={confirmDisabled}
            className={
              confirmDisabled
                ? 'cursor-not-allowed rounded-lg bg-ink-200 px-3.5 py-2 text-[13px] font-medium text-white'
                : 'rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85'
            }
          >
            {busy ? busyLabel : '确认生成'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function isQuoteExpiredFailure(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const record = error as { code?: unknown; status?: unknown }
    if (record.code === 'QUOTE_EXPIRED' || record.status === 410) return true
  }
  return typeof error === 'string' && /报价.*过期/.test(error)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return '操作失败，请重试。'
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-ink-400">{label}</span>
      <span className="truncate text-ink-800">{value}</span>
    </div>
  )
}
