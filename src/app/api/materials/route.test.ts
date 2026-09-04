import { afterAll, describe, expect, it } from 'vitest'

import { MaterialCatalogResponseSchema } from '@/contracts/materials'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET } from './route'

describe.sequential('GET /api/materials', () => {
  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('returns a deterministic paginated style directory with category and model facets', async () => {
    const response = await GET(new Request('http://localhost/api/materials?kind=style&limit=6'))
    const body = MaterialCatalogResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(body.version).toBe('2026-09-04.1')
    expect(body.kind).toBe('style')
    expect(body.items.map((item) => item.id)).toEqual([
      'style-cine-teal',
      'style-ink-wash',
      'style-anime-cel',
      'style-concept-matte',
      'style-film-grain',
      'style-retro-print',
    ])
    expect(body.page).toEqual({ offset: 0, limit: 6, total: 24, hasMore: true, nextOffset: 6 })
    expect(body.categories).toContain('小说推文')
    expect(body.models).toEqual(expect.arrayContaining([
      { id: 'lib-image-2', label: 'Lib Image' },
      { id: 'lib-navo-pro', label: 'Lib Navo Pro' },
    ]))
    expect(body.items[0]).toMatchObject({
      modelId: 'lib-image-2',
      commercial: true,
      author: 'Lib 官方',
      favourite: true,
      recent: true,
    })
  })

  it('combines scope, category, commercial, model and search filters', async () => {
    const response = await GET(new Request(
      'http://localhost/api/materials?kind=effect&scope=market&category=氛围&commercialOnly=true&modelId=seedance-2&q=雨窗',
    ))
    const body = MaterialCatalogResponseSchema.parse(await response.json())

    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ id: 'fx-rain-window', modelId: 'seedance-2', commercial: true })

    const favourites = await GET(new Request('http://localhost/api/materials?kind=style&scope=favorites'))
    const favouriteBody = MaterialCatalogResponseSchema.parse(await favourites.json())
    expect(favouriteBody.items.every((item) => item.favourite)).toBe(true)

    const recent = await GET(new Request('http://localhost/api/materials?kind=effect&scope=recent'))
    const recentBody = MaterialCatalogResponseSchema.parse(await recent.json())
    expect(recentBody.items.map((item) => item.id).slice(0, 3)).toEqual(['fx-hair-blow', 'fx-zoom-punch', 'fx-rain-window'])
  })

  it('keeps empty and error fixtures deterministic and rejects invalid query values', async () => {
    const empty = await GET(new Request('http://localhost/api/materials?kind=effect&fixture=empty'))
    const error = await GET(new Request('http://localhost/api/materials?kind=style&fixture=error'))
    const invalidKind = await GET(new Request('http://localhost/api/materials?kind=video'))
    const invalidCommercial = await GET(new Request('http://localhost/api/materials?commercialOnly=yes'))
    const invalidLimit = await GET(new Request('http://localhost/api/materials?limit=0'))

    expect(empty.status).toBe(200)
    expect(MaterialCatalogResponseSchema.parse(await empty.json()).items).toEqual([])
    expect(error.status).toBe(503)
    expect(await error.json()).toEqual({ error: '本地素材目录暂时不可用' })
    expect(invalidKind.status).toBe(400)
    expect(invalidCommercial.status).toBe(400)
    expect(invalidLimit.status).toBe(400)
  })
})
