import { describe, expect, it } from 'vitest'

import {
  createJobActionGate,
  findPendingConfirmationJob,
  getConfirmGateQuoteState,
  isQuoteExpired,
} from '../ConfirmGate'

describe('ConfirmGate quote state', () => {
  it('treats the expiry boundary as stale and blocks confirmation', () => {
    const expiresAt = '2026-09-04T12:00:00.000Z'

    expect(isQuoteExpired(expiresAt, Date.parse(expiresAt) - 1)).toBe(false)
    expect(isQuoteExpired(expiresAt, Date.parse(expiresAt))).toBe(true)
    expect(isQuoteExpired(expiresAt, Date.parse(expiresAt) + 1)).toBe(true)
    expect(isQuoteExpired('not-a-date', Date.parse(expiresAt))).toBe(true)

    expect(
      getConfirmGateQuoteState(
        { credits: 12, expiresAt },
        12,
        Date.parse(expiresAt) - 1,
      ),
    ).toEqual({ expired: false, insufficient: false, canConfirm: true })
    expect(
      getConfirmGateQuoteState(
        { credits: 12, expiresAt },
        11,
        Date.parse(expiresAt) - 1,
      ),
    ).toEqual({ expired: false, insufficient: true, canConfirm: false })
    expect(
      getConfirmGateQuoteState(
        { credits: 12, expiresAt },
        99,
        Date.parse(expiresAt),
      ),
    ).toEqual({ expired: true, insufficient: false, canConfirm: false })
  })
})

describe('ConfirmGate job recovery', () => {
  it('selects the newest non-dismissed awaiting job after a reload', () => {
    const older = {
      id: 'job-older',
      status: 'awaiting_confirmation',
      createdAt: '2026-09-04T10:00:00.000Z',
    } as const
    const newer = {
      id: 'job-newer',
      status: 'awaiting_confirmation',
      createdAt: '2026-09-04T11:00:00.000Z',
    } as const
    const running = {
      id: 'job-running',
      status: 'running',
      createdAt: '2026-09-04T12:00:00.000Z',
    } as const

    expect(findPendingConfirmationJob([older, running, newer], new Set())).toBe(newer)
    expect(findPendingConfirmationJob([older, newer], new Set(['job-newer']))).toBe(older)
    expect(findPendingConfirmationJob([running], new Set())).toBeNull()
    expect(
      findPendingConfirmationJob(
        [
          { ...older, status: 'failed' as const },
          { ...newer, status: 'cancelled' as const },
          { ...running, status: 'compliance_blocked' as const },
        ],
        new Set(),
      ),
    ).toBeNull()
  })
})

describe('ConfirmGate action gate', () => {
  it('coalesces repeated actions for one job until the first action settles', async () => {
    const gate = createJobActionGate()
    let calls = 0
    let resolveFirst!: () => void

    const first = gate.run('job-1', 'confirm', () => {
      calls += 1
      return new Promise<void>((resolve) => {
        resolveFirst = resolve
      })
    })
    const duplicate = gate.run('job-1', 'confirm', () => {
      calls += 1
    })

    expect(first).not.toBeNull()
    expect(duplicate).toBeNull()
    expect(gate.pendingAction('job-1')).toBe('confirm')
    expect(calls).toBe(1)

    resolveFirst()
    await first

    expect(gate.pendingAction('job-1')).toBeNull()
    const retry = gate.run('job-1', 'cancel', () => {
      calls += 1
    })
    expect(retry).not.toBeNull()
    await retry
    expect(calls).toBe(2)
  })

  it('releases a failed action so the same job can be retried', async () => {
    const gate = createJobActionGate()
    const first = gate.run('job-failed', 'confirm', () => Promise.reject(new Error('temporary failure')))

    await expect(first).rejects.toThrow('temporary failure')
    expect(gate.pendingAction('job-failed')).toBeNull()

    const retry = gate.run('job-failed', 'confirm', () => undefined)
    expect(retry).not.toBeNull()
    await retry
  })

  it('notifies a reopened consumer when a pending action settles', async () => {
    const gate = createJobActionGate()
    let resolveFirst!: () => void
    let notifications = 0
    const first = gate.run(
      'job-reopen',
      'confirm',
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve
        }),
    )

    const unsubscribe = gate.subscribe('job-reopen', () => {
      notifications += 1
    })
    resolveFirst()
    await first

    expect(notifications).toBe(1)
    unsubscribe()
  })
})
