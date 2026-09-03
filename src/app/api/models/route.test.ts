import { describe, expect, it } from 'vitest'

import { ModelCatalogResponseSchema } from '@/contracts/models'
import { GET } from './route'

describe('GET /api/models', () => {
  it('returns the versioned Video catalogue and serializable capabilities', async () => {
    const response = await GET(new Request('http://localhost/api/models?media=video'))
    const body = ModelCatalogResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(body.version).toBe('2026-09-03.1')
    expect(body.media).toBe('video')
    expect(body.items).toHaveLength(36)
    expect(body.items[0]).toMatchObject({
      id: 'seedance-2-5',
      label: 'Seedance 2.5',
      capabilities: {
        durationsSeconds: [5, 10, 15, 30],
        audio: 'optional',
      },
    })
  })

  it('filters by a case-insensitive label, provider, tag or description query', async () => {
    const response = await GET(new Request('http://localhost/api/models?media=video&q=motion'))
    const body = ModelCatalogResponseSchema.parse(await response.json())

    expect(body.query).toBe('motion')
    expect(body.items.map((item) => item.id)).toEqual(['kling-3-motion-transfer'])
  })

  it('returns every media family when media is omitted', async () => {
    const response = await GET(new Request('http://localhost/api/models'))
    const body = ModelCatalogResponseSchema.parse(await response.json())

    expect(body.media).toBeNull()
    expect(new Set(body.items.map((item) => item.media))).toEqual(new Set(['image', 'video', 'audio', 'text']))
  })

  it('rejects an unknown media filter', async () => {
    const response = await GET(new Request('http://localhost/api/models?media=film'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '未知模型媒体类型: film' })
  })
})
