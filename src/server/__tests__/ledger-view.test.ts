import { describe, expect, it } from 'vitest'

import { createCanvas } from '@/domain/factory'
import type { GenerationJob, Project } from '@/domain/types'
import { grant, purchase, release, reserve, settle } from '@/server/ledger'
import type { WorkspaceState } from '@/server/store'
import { buildCharges, projectLedger } from '@/server/ledger-view'

/**
 * The ledger is double-entry-ish: a reservation is a negative row and the money
 * only really leaves on settle. Read as a flat list that is unreadable — the
 * account screen exists to say "your failed generation gave the credits back",
 * and that claim is a *derivation* over two rows tied by `logicalChargeId`.
 *
 * These drive `src/server/ledger.ts` for real (no hand-written entries) and
 * assert the projection the UI consumes, because the projection is where a
 * mispaired refund would actually mislead someone.
 */

const SPACE = 'sp_default'
const START = 100

function job(id: string): GenerationJob {
  return {
    id,
    spaceId: SPACE,
    projectId: 'prj_1',
    canvasId: 'cvs_1',
    nodeId: 'nd_1',
    modelId: 'lib-image-2',
    status: 'succeeded',
    invocationId: `inv_${id}`,
    attempt: 1,
    progress: 100,
    spec: {
      workflowDigest: 'digest',
      nodeId: 'nd_1',
      nodeType: 'image',
      modelId: 'lib-image-2',
      prompt: 'p',
      output: {},
      inputs: [],
    },
    quote: { credits: 18, priceVersion: 'test', expiresAt: '2026-01-01T00:00:00.000Z', breakdown: [] },
    artifacts: [],
    error: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
  }
}

function fixture(): WorkspaceState {
  const project: Project = {
    id: 'prj_1',
    spaceId: SPACE,
    folderId: null,
    name: '示例项目',
    coverUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    canvasIds: [],
  }
  const canvas = createCanvas(project.id, '画布 1')
  canvas.id = 'cvs_1'
  project.canvasIds = [canvas.id]

  const state: WorkspaceState = {
    spaces: [{ id: SPACE, name: '我的空间', createdAt: '2026-01-01T00:00:00.000Z' }],
    folders: [],
    projects: [project],
    canvases: [canvas],
    assets: [],
    jobs: [job('job_a'), job('job_b')],
    ledger: [],
    sessions: [],
    messages: [],
    balances: {},
  }

  grant(state, SPACE, START, '初始赠送积分')
  return state
}

function view(state: WorkspaceState, limit?: number) {
  return projectLedger(state, SPACE, limit)
}

describe('reserve → settle', () => {
  it('reads as a closed charge whose net cost is what was settled', () => {
    const state = fixture()
    reserve(state, SPACE, 'job_a', 18, '生成任务 imageGen')
    settle(state, SPACE, 'job_a', 18, 18, 'Lib Image')

    const projection = view(state)
    expect(projection.balance).toBe(START - 18)

    // 消耗 holds both halves of the charge; 返还 stays empty for a full settle.
    expect(projection.counts).toEqual({ earned: 1, spent: 2, returned: 0 })

    const charge = projection.spent[0].charge
    expect(charge).toMatchObject({ jobId: 'job_a', state: 'settled', reserved: 18, returned: 0, net: 18 })
    // Every row of the chain carries the same outcome, so the pairing is
    // legible no matter which row the user is looking at.
    expect(projection.spent[1].charge).toEqual(charge)

    expect(projection.totals).toMatchObject({ earned: START, reserved: 18, returned: 0, spent: 18, held: 0 })
  })

  it('books the released remainder when fewer outputs came back', () => {
    const state = fixture()
    reserve(state, SPACE, 'job_a', 36, '生成任务 imageGen')
    settle(state, SPACE, 'job_a', 36, 18, 'Lib Image')

    const projection = view(state)
    expect(projection.balance).toBe(START - 18)

    // The partial refund is a 返还 row, and it names the same charge.
    expect(projection.returned).toHaveLength(1)
    expect(projection.returned[0].credits).toBe(18)
    expect(projection.returned[0].charge).toMatchObject({
      state: 'settled',
      reserved: 36,
      returned: 18,
      net: 18,
    })
    expect(projection.totals).toMatchObject({ reserved: 36, returned: 18, spent: 18, held: 0 })
  })
})

describe('reserve → release', () => {
  it('nets a failed generation to zero and puts the credits back', () => {
    const state = fixture()
    reserve(state, SPACE, 'job_a', 35, '生成任务 videoGen')
    expect(state.balances[SPACE]).toBe(START - 35)

    release(state, SPACE, 'job_a', 35, '生成未成功，积分已返还')

    const projection = view(state)
    // The single most important claim this screen makes.
    expect(projection.balance).toBe(START)
    expect(projection.totals).toMatchObject({ earned: START, reserved: 35, returned: 35, spent: 0, held: 0 })

    const charge = projection.spent[0].charge
    expect(charge).toMatchObject({ state: 'released', reserved: 35, returned: 35, net: 0 })
    expect(charge?.resolvedAt).not.toBeNull()

    // Reachable from 返还 too — that is the collection a user checks after a failure.
    expect(projection.returned[0].charge).toEqual(charge)
  })

  it('never reads as settled when a settle and a release collide', () => {
    const state = fixture()
    reserve(state, SPACE, 'job_a', 20, '生成任务')
    settle(state, SPACE, 'job_a', 20, 20, 'Lib Image')
    release(state, SPACE, 'job_a', 20, '合规拦截，积分已返还')

    expect(view(state).spent[0].charge).toMatchObject({ state: 'released', net: 0 })

    // Order of arrival must not change the verdict.
    const flipped = fixture()
    reserve(flipped, SPACE, 'job_a', 20, '生成任务')
    release(flipped, SPACE, 'job_a', 20, '合规拦截，积分已返还')
    settle(flipped, SPACE, 'job_a', 20, 20, 'Lib Image')
    expect(view(flipped).spent[0].charge).toMatchObject({ state: 'released', net: 0 })
  })

  it('keeps an unfinished reservation visible as still frozen', () => {
    const state = fixture()
    reserve(state, SPACE, 'job_a', 22, '生成任务 imageGen')

    const projection = view(state)
    expect(projection.spent[0].charge).toMatchObject({ state: 'held', reserved: 22, returned: 0, net: 22 })
    expect(projection.totals).toMatchObject({ spent: 22, held: 22 })
    expect(projection.counts.returned).toBe(0)
  })
})

describe('duplicate logicalChargeId', () => {
  it('charges a repeated reservation exactly once', () => {
    const state = fixture()
    expect(reserve(state, SPACE, 'job_a', 18, '生成任务')).not.toBeNull()
    // Same job, same logical charge — a retried confirm or a replayed webhook.
    expect(reserve(state, SPACE, 'job_a', 18, '生成任务')).toBeNull()

    const projection = view(state)
    expect(projection.counts.spent).toBe(1)
    expect(projection.balance).toBe(START - 18)
    expect(projection.totals.reserved).toBe(18)
    expect(projection.spent[0].charge).toMatchObject({ reserved: 18, net: 18 })
  })

  it('refunds a repeated release exactly once', () => {
    const state = fixture()
    reserve(state, SPACE, 'job_a', 18, '生成任务')
    release(state, SPACE, 'job_a', 18, '生成未成功，积分已返还')
    release(state, SPACE, 'job_a', 18, '生成未成功，积分已返还')

    const projection = view(state)
    expect(projection.counts.returned).toBe(1)
    expect(projection.balance).toBe(START)
    // Double-counting here would show a job that "gave back" twice what it took.
    expect(projection.spent[0].charge).toMatchObject({ reserved: 18, returned: 18, net: 0 })
  })

  it('credits a replayed purchase order only once', () => {
    const state = fixture()
    purchase(state, SPACE, 500, 'ord_1')
    purchase(state, SPACE, 500, 'ord_1')

    const projection = view(state)
    expect(projection.counts.earned).toBe(2) // the seed grant plus one purchase
    expect(projection.totals.earned).toBe(START + 500)
    expect(projection.balance).toBe(START + 500)
  })
})

describe('projection shape', () => {
  it('keeps balance === earned - spent across a mixed history', () => {
    const state = fixture()
    purchase(state, SPACE, 200, 'ord_1')
    reserve(state, SPACE, 'job_a', 36, '生成任务 A')
    settle(state, SPACE, 'job_a', 36, 18, 'Lib Image')
    reserve(state, SPACE, 'job_b', 62, '生成任务 B')
    release(state, SPACE, 'job_b', 62, '生成未成功，积分已返还')

    const { balance, totals } = view(state)
    expect(balance).toBe(state.balances[SPACE])
    expect(balance).toBe(totals.earned - totals.spent)
    expect(totals.spent).toBe(18)
  })

  it('resolves a job id into the coordinates a link needs, and tolerates a missing job', () => {
    const state = fixture()
    reserve(state, SPACE, 'job_a', 18, '生成任务 A')
    reserve(state, SPACE, 'job_gone', 18, '生成任务 B')

    const projection = view(state)
    expect(projection.jobs.job_a).toEqual({
      jobId: 'job_a',
      projectId: 'prj_1',
      canvasId: 'cvs_1',
      nodeId: 'nd_1',
      modelId: 'lib-image-2',
      status: 'succeeded',
    })
    // A pruned job must not take the row with it: the entry still renders,
    // it just loses its link.
    expect(projection.jobs.job_gone).toBeUndefined()
    expect(projection.spent.some((r) => r.jobId === 'job_gone')).toBe(true)
  })

  it('truncates rows with `limit` without distorting counts or totals', () => {
    const state = fixture()
    for (const id of ['job_a', 'job_b']) {
      reserve(state, SPACE, id, 10, `生成任务 ${id}`)
      settle(state, SPACE, id, 10, 10, 'Lib Image')
    }

    const full = view(state)
    expect(full.spent).toHaveLength(4)

    const paged = view(state, 2)
    expect(paged.spent).toHaveLength(2)
    expect(paged.counts.spent).toBe(4)
    expect(paged.totals).toEqual(full.totals)
    // Newest first, so a truncated page keeps the most recent rows.
    expect(paged.spent.map((r) => r.id)).toEqual(full.spent.slice(0, 2).map((r) => r.id))
    // The charge summary is still folded over the *whole* ledger.
    expect(paged.spent[0].charge).toMatchObject({ reserved: 10, net: 10, state: 'settled' })
  })

  it('leaves rows without a job — grants and purchases — uncharged', () => {
    const state = fixture()
    purchase(state, SPACE, 50, 'ord_1')

    for (const row of view(state).earned) {
      expect(row.jobId).toBeNull()
      expect(row.charge).toBeNull()
    }
  })
})

describe('buildCharges', () => {
  it('ignores entries that are not part of a reserve chain', () => {
    const state = fixture()
    grant(state, SPACE, 10, '活动赠送')
    expect(buildCharges(state.ledger).size).toBe(0)
  })
})
