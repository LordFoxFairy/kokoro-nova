import { describe, expect, it } from 'vitest'

import { LedgerViewProjectionSchema } from '@/contracts/ledger'
import { buildVideoWorkspace } from '@/mocks/scenarios/video-project'
import { projectLedger } from '@/server/ledger-view'

describe('ledger response contract', () => {
  it('accepts the populated account projection and preserves charge links', () => {
    const state = buildVideoWorkspace('failed')
    const projection = LedgerViewProjectionSchema.parse(
      projectLedger(state, 'sp_default', 20),
    )

    expect(projection).toMatchObject({
      balance: 478,
      counts: { earned: 1, spent: 3, returned: 1 },
      totals: { earned: 500, reserved: 92, returned: 70, spent: 22, held: 0 },
    })
    expect(projection.spent[0].charge).toMatchObject({
      jobId: 'job_video_01',
      state: 'released',
      reserved: 70,
      returned: 70,
      net: 0,
    })
    expect(projection.jobs.job_video_01).toMatchObject({
      projectId: 'prj_video_demo',
      canvasId: 'can_video_main',
      status: 'failed',
    })
  })

  it('rejects malformed charge and job-link data at the transport boundary', () => {
    const state = buildVideoWorkspace('running')
    const projection = projectLedger(state, 'sp_default')

    expect(
      LedgerViewProjectionSchema.safeParse({
        ...projection,
        spent: [{ ...projection.spent[0], charge: { ...projection.spent[0].charge, state: 'unknown' } }],
      }).success,
    ).toBe(false)
    expect(
      LedgerViewProjectionSchema.safeParse({
        ...projection,
        jobs: { ...projection.jobs, job_video_01: { ...projection.jobs.job_video_01, status: 'unknown' } },
      }).success,
    ).toBe(false)
  })
})
