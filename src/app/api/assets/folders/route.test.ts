import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AssetFolderListResponseSchema,
  AssetFolderSchema,
} from '@/contracts/assets'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET, POST } from './route'

describe.sequential('asset folder route smoke', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('returns a schema-valid empty list with counts and JSON transport metadata', async () => {
    const response = await GET()
    const body = AssetFolderListResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(body).toEqual({ folders: [], counts: {} })
  })

  it('creates a schema-valid folder, persists it, and returns it on the next GET', async () => {
    const createdResponse = await POST()
    const created = AssetFolderSchema.parse(await createdResponse.json())

    expect(createdResponse.status).toBe(200)
    expect(createdResponse.headers.get('content-type')).toContain('application/json')
    expect(created).toMatchObject({
      id: expect.stringMatching(/^afld_/),
      spaceId: 'sp_default',
      name: '未命名文件夹',
    })
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt)
    expect(new Date(created.updatedAt).toISOString()).toBe(created.updatedAt)

    const rereadResponse = await GET()
    const reread = AssetFolderListResponseSchema.parse(await rereadResponse.json())

    expect(rereadResponse.status).toBe(200)
    expect(rereadResponse.headers.get('content-type')).toContain('application/json')
    expect(reread).toEqual({ folders: [created], counts: { [created.id]: 0 } })
  })
})
