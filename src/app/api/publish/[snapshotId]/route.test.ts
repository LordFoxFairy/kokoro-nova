import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { GetPublishedSnapshotResponseSchema } from '@/contracts/publish'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET } from './route'

describe.sequential('GET /api/publish/[snapshotId] discovery fixtures', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('serves a deterministic local snapshot for a catalog card without exposing an editor surface', async () => {
    const response = await GET(new Request('http://localhost/api/publish/showcase-dust-skeleton'), {
      params: Promise.resolve({ snapshotId: 'showcase-dust-skeleton' }),
    })
    const parsed = GetPublishedSnapshotResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(parsed.snapshot.id).toBe('showcase-dust-skeleton')
    expect(parsed.snapshot.document.nodes).toHaveLength(1)
    expect(parsed.snapshot.document.edges).toEqual([])
  })
})
