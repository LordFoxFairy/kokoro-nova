import { describe, expect, it } from 'vitest'

import { createApiClient, type JsonTransport } from '@/api/client'

function json(value: unknown, init?: ResponseInit) {
  return Response.json(value, init)
}

const response = {
  version: 'fixture',
  kind: 'style',
  scope: 'market',
  query: '电影',
  category: '全部',
  commercialOnly: false,
  modelId: null,
  categories: ['全部', '推荐'],
  models: [{ id: 'lib-image-2', label: 'Lib Image' }],
  items: [{
    id: 'style-cine-teal',
    kind: 'style',
    name: '电影青橙',
    category: '推荐',
    author: 'Lib 官方',
    commercial: true,
    usageCount: 100,
    modelId: 'lib-image-2',
    modelLabel: 'Lib Image',
    modelIds: ['lib-image-2'],
    hue: 190,
    description: '本地样本',
    favourite: true,
    recent: true,
  }],
  page: { offset: 0, limit: 6, total: 1, hasMore: false, nextOffset: null },
}

describe('typed material API client', () => {
  it('serializes catalog filters and decodes the paginated response', async () => {
    const seen: Array<{ url: string; method?: string; body?: string }> = []
    const transport: JsonTransport = async (input, init) => {
      seen.push({ url: String(input), method: init?.method, body: typeof init?.body === 'string' ? init.body : undefined })
      return json(response)
    }
    const client = createApiClient(transport)

    await expect(client.materials.list({
      kind: 'style',
      scope: 'favorites',
      category: '摄影写真',
      commercialOnly: true,
      modelId: 'lib-image-2',
      query: ' 电影 ',
      offset: 6,
      limit: 6,
    })).resolves.toEqual(response)

    expect(seen[0]).toEqual({
      url: '/api/materials?kind=style&scope=favorites&category=%E6%91%84%E5%BD%B1%E5%86%99%E7%9C%9F&commercialOnly=true&modelId=lib-image-2&q=%E7%94%B5%E5%BD%B1&offset=6&limit=6',
    })
  })

  it('uses typed detail and explicit favourite target-state requests', async () => {
    const seen: Array<{ url: string; body?: string }> = []
    const transport: JsonTransport = async (input, init) => {
      seen.push({ url: String(input), body: typeof init?.body === 'string' ? init.body : undefined })
      return json({ material: response.items[0] })
    }
    const client = createApiClient(transport)

    await expect(client.materials.get('style/cine')).resolves.toMatchObject({ material: response.items[0] })
    await expect(client.materials.setFavourite('style/cine', false)).resolves.toMatchObject({ material: response.items[0] })
    expect(seen).toEqual([
      { url: '/api/materials/style%2Fcine' },
      { url: '/api/materials/style%2Fcine', body: '{"action":"unfavourite"}' },
    ])
  })
})
