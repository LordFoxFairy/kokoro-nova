import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import initialEngagementExample from '../../../../../../docs/api/examples/showcase-engagement.initial.response.json'
import likeEngagementExample from '../../../../../../docs/api/examples/showcase-engagement.like.response.json'
import likeEngagementRequestExample from '../../../../../../docs/api/examples/showcase-engagement.request.json'
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import {
  ShowcaseDetailResponseSchema,
  ShowcaseEngagementRequestSchema,
  ShowcaseEngagementResponseSchema,
} from '@/contracts/showcase'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET as getShowcaseDetail } from '../route'
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

  it('persists like/unlike/share state, replays state-setting likes, and never mutates the public snapshot', async () => {
    const initial = await GET(new Request('http://localhost/api/showcase/pub_city_night_01/engagement'), params('pub_city_night_01'))
    const initialBody = ShowcaseEngagementResponseSchema.parse(await initial.json())
    expect(initial.status).toBe(200)
    expect(initialBody).toEqual(initialEngagementExample)

    const detailBefore = await getShowcaseDetail(new Request('http://localhost/api/showcase/pub_city_night_01'), params('pub_city_night_01'))
    const detailBeforeBody = ShowcaseDetailResponseSchema.parse(await detailBefore.json())
    expect(detailBefore.status).toBe(200)

    const liked = await POST(request('like'), params('pub_city_night_01'))
    expect(ShowcaseEngagementRequestSchema.parse(likeEngagementRequestExample)).toEqual({ action: 'like' })
    const likedBody = ShowcaseEngagementResponseSchema.parse(await liked.json())
    expect(liked.status).toBe(200)
    expect(likedBody).toEqual(likeEngagementExample)

    const likedReplay = await POST(request('like'), params('pub_city_night_01'))
    expect(likedReplay.status).toBe(200)
    expect(ShowcaseEngagementResponseSchema.parse(await likedReplay.json())).toEqual(likedBody)

    const unliked = await POST(request('unlike'), params('pub_city_night_01'))
    expect(unliked.status).toBe(200)
    expect(ShowcaseEngagementResponseSchema.parse(await unliked.json())).toMatchObject({
      liked: false,
      likeCount: initialBody.likeCount,
      shareCount: 0,
      feedback: '已取消喜欢',
    })

    const shared = await POST(request('share'), params('pub_city_night_01'))
    expect(shared.status).toBe(200)
    expect(ShowcaseEngagementResponseSchema.parse(await shared.json())).toMatchObject({
      liked: false,
      shareCount: 1,
      shareUrl: '/showcase/pub_city_night_01',
      feedback: '已复制公开作品链接',
    })

    const sharedAgain = await POST(request('share'), params('pub_city_night_01'))
    expect(sharedAgain.status).toBe(200)
    expect(ShowcaseEngagementResponseSchema.parse(await sharedAgain.json())).toMatchObject({ shareCount: 2 })

    const detailAfter = await getShowcaseDetail(new Request('http://localhost/api/showcase/pub_city_night_01'), params('pub_city_night_01'))
    expect(detailAfter.status).toBe(200)
    expect(ShowcaseDetailResponseSchema.parse(await detailAfter.json())).toEqual(detailBeforeBody)
  })

  it('keeps reads public but normalizes authentication, validation, and unknown-work failures', async () => {
    await resetStore('anonymous')
    const publicRead = await GET(new Request('http://localhost/api/showcase/pub_city_night_01/engagement'), params('pub_city_night_01'))
    expect(publicRead.status).toBe(200)
    expect(ShowcaseEngagementResponseSchema.parse(await publicRead.json())).toMatchObject({
      snapshotId: 'pub_city_night_01',
      liked: false,
      shareCount: 0,
    })

    const response = await POST(request('like'), params('pub_city_night_01'))
    const unauthenticated = LocalErrorEnvelopeSchema.parse(await response.json())
    expect(response.status).toBe(401)
    expect(unauthenticated).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
      requestId: expect.any(String),
    })

    await resetStore('authenticated-empty')
    const malformed = await POST(new Request('http://localhost/api/showcase/pub_city_night_01/engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bookmark' }),
    }), params('pub_city_night_01'))
    const malformedBody = LocalErrorEnvelopeSchema.parse(await malformed.json())
    expect(malformed.status).toBe(400)
    expect(malformedBody).toMatchObject({
      error: { code: 'INVALID_INPUT', message: expect.stringContaining('action') },
      requestId: expect.any(String),
    })

    const missing = await POST(request('like'), params('missing'))
    const missingBody = LocalErrorEnvelopeSchema.parse(await missing.json())
    expect(missing.status).toBe(404)
    expect(missingBody).toMatchObject({
      error: { code: 'NOT_FOUND', message: '作品不存在或已下架' },
      requestId: expect.any(String),
    })
  })
})
