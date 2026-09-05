import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import initialEngagementExample from '../../../../../../docs/api/examples/showcase-engagement.initial.response.json'
import likeEngagementExample from '../../../../../../docs/api/examples/showcase-engagement.like.response.json'
import likeEngagementRequestExample from '../../../../../../docs/api/examples/showcase-engagement.request.json'
import { ShowcaseEngagementRequestSchema, ShowcaseEngagementResponseSchema } from '@/contracts/showcase'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET, POST } from './route'

const params = (snapshotId: string) => ({ params: Promise.resolve({ snapshotId }) })
const request = (action: 'like' | 'unlike' | 'share') => new Request('http://localhost/api/showcase/pub_city_night_01/engagement', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action }),
})

describe.sequential('showcase engagement route', () => {
  beforeEach(async () => {
    await resetStore('authenticated-empty')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('persists a viewer-local like and share feedback without mutating the public snapshot', async () => {
    const initial = await GET(new Request('http://localhost/api/showcase/pub_city_night_01/engagement'), params('pub_city_night_01'))
    const initialBody = ShowcaseEngagementResponseSchema.parse(await initial.json())
    expect(initialBody).toEqual(initialEngagementExample)

    const liked = await POST(request('like'), params('pub_city_night_01'))
    expect(ShowcaseEngagementRequestSchema.parse(likeEngagementRequestExample)).toEqual({ action: 'like' })
    expect(ShowcaseEngagementResponseSchema.parse(await liked.json())).toEqual(likeEngagementExample)

    const shared = await POST(request('share'), params('pub_city_night_01'))
    expect(ShowcaseEngagementResponseSchema.parse(await shared.json())).toMatchObject({
      liked: true,
      shareCount: 1,
      shareUrl: '/showcase/pub_city_night_01',
      feedback: '已复制公开作品链接',
    })
  })

  it('refuses authenticated engagement commands for anonymous fixture viewers', async () => {
    await resetStore('anonymous')
    const response = await POST(request('like'), params('pub_city_night_01'))
    expect(response.status).toBe(401)
  })
})
