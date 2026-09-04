import { afterAll, describe, expect, it } from 'vitest'

import { GetMaterialResponseSchema, ToggleMaterialFavouriteResponseSchema } from '@/contracts/materials'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET, POST } from './route'

const params = (materialId: string) => ({ params: Promise.resolve({ materialId }) })

describe.sequential('material detail and favourite routes', () => {
  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('reads a card detail and applies an idempotent favourite target state', async () => {
    const detail = await GET(new Request('http://localhost/api/materials/style-noir'), params('style-noir'))
    expect(detail.status).toBe(200)
    expect(GetMaterialResponseSchema.parse(await detail.json()).material).toMatchObject({
      id: 'style-noir',
      kind: 'style',
      name: '黑色电影',
      favourite: false,
    })

    const favourite = await POST(
      new Request('http://localhost/api/materials/style-noir', {
        method: 'POST',
        body: JSON.stringify({ action: 'favourite' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      params('style-noir'),
    )
    expect(ToggleMaterialFavouriteResponseSchema.parse(await favourite.json()).material.favourite).toBe(true)

    const repeated = await POST(
      new Request('http://localhost/api/materials/style-noir', {
        method: 'POST',
        body: JSON.stringify({ action: 'favourite' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      params('style-noir'),
    )
    expect(ToggleMaterialFavouriteResponseSchema.parse(await repeated.json()).material.favourite).toBe(true)
  })

  it('returns stable errors for missing materials and invalid actions', async () => {
    const missing = await GET(new Request('http://localhost/api/materials/missing'), params('missing'))
    const invalid = await POST(
      new Request('http://localhost/api/materials/style-cine-teal', {
        method: 'POST',
        body: JSON.stringify({ action: 'flip' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      params('style-cine-teal'),
    )

    expect(missing.status).toBe(404)
    expect(invalid.status).toBe(400)
  })
})
