import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { ShowcaseCloneResponseSchema } from '@/contracts/showcase'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { readState, resetStore } from '@/server/store'
import { POST } from './route'

const context = { params: Promise.resolve({ snapshotId: 'showcase-dust-skeleton' }) }

describe.sequential('POST /api/publish/[snapshotId]/clone', () => {
  beforeEach(async () => { await resetStore('authenticated-populated') })
  afterAll(async () => { await resetStore(DEFAULT_SCENARIO_ID) })

  it('creates an independently writable private project from the frozen public snapshot', async () => {
    const before = await readState()
    const response = await POST(new Request('http://localhost/api/publish/showcase-dust-skeleton/clone', { method: 'POST' }), context)
    const body = ShowcaseCloneResponseSchema.parse(await response.json())
    const after = await readState()

    expect(response.status).toBe(200)
    expect(body.sourceSnapshotId).toBe('showcase-dust-skeleton')
    expect(body.project.name).toBe('尘骸丨东方蒸汽朋克 EP.01 · 副本')
    expect(body.canvas.document.nodes).toHaveLength(1)
    expect(after.projects).toHaveLength(before.projects.length + 1)
    expect(after.canvases.find((canvas) => canvas.id === body.canvas.id)?.document).toEqual(body.canvas.document)
  })

  it('keeps anonymous viewers at the clone permission boundary', async () => {
    await resetStore('anonymous')
    const response = await POST(new Request('http://localhost/api/publish/showcase-dust-skeleton/clone', { method: 'POST' }), context)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: '复制项目需要先登录' })
  })
})
