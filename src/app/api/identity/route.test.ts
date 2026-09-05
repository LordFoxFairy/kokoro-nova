import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { IdentityResponseSchema } from '@/contracts/identity'
import { emptyCreationContext } from '@/domain/creation-context'
import { PreferencesResponseSchema } from '@/contracts/preferences'
import { NotificationsResponseSchema } from '@/contracts/notifications'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET, POST } from './route'
import { GET as getPreferences, PATCH as patchPreferences } from '../preferences/route'
import { GET as getNotifications, POST as postNotifications } from '../notifications/route'

function jsonRequest(url: string, body: unknown) {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

describe.sequential('local identity account mock', () => {
  beforeEach(async () => {
    // Crossing a scenario boundary deterministically resets session and notices
    // without requiring a real cookie or an undocumented reset endpoint.
    await resetStore('anonymous')
    await POST(jsonRequest('http://localhost/api/identity', { action: 'signOut', returnTo: '/' }))
    await resetStore('authenticated-populated')
    await POST(jsonRequest('http://localhost/api/identity', { action: 'signIn', returnTo: '/' }))
    await patchPreferences(new Request('http://localhost/api/preferences', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: 'dark', aiWatermark: true }),
    }))
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
    await POST(jsonRequest('http://localhost/api/identity', { action: 'signIn', returnTo: '/' }))
  })

  it('returns only redacted identity data and rejects external return targets', async () => {
    const response = await GET(new Request('http://localhost/api/identity?returnTo=%2Fcanvas%3FprojectId%3Dprj_video_demo'))
    const body = IdentityResponseSchema.parse(await response.json())
    expect(response.status).toBe(200)
    expect(body.identity).toMatchObject({
      displayName: '微信用户cd385d',
      uuidMasked: 'cd385d••••••9a21',
      accessKey: { maskedValue: '•••• •••• •••• ••••', state: 'not-created' },
      credits: { balance: 20 },
    })
    expect(JSON.stringify(body)).not.toContain('sk-')

    const invalid = await GET(new Request('http://localhost/api/identity?returnTo=https%3A%2F%2Fevil.example'))
    expect(invalid.status).toBe(400)
  })

  it('persists local theme/watermark and a sign-out -> sign-in returnTo loop', async () => {
    const preferences = await patchPreferences(new Request('http://localhost/api/preferences', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: 'light', aiWatermark: false }),
    }))
    expect(PreferencesResponseSchema.parse(await preferences.json())).toEqual({
      preferences: { theme: 'light', aiWatermark: false },
    })
    const persisted = await getPreferences()
    expect(PreferencesResponseSchema.parse(await persisted.json()).preferences).toEqual({ theme: 'light', aiWatermark: false })

    const signedOut = await POST(jsonRequest('http://localhost/api/identity', { action: 'signOut', returnTo: '/canvas?projectId=prj_video_demo' }))
    expect(IdentityResponseSchema.parse(await signedOut.json())).toMatchObject({ identity: null, session: { status: 'anonymous', returnTo: '/canvas?projectId=prj_video_demo' } })
    const signedIn = await POST(jsonRequest('http://localhost/api/identity', { action: 'signIn', returnTo: '/canvas?projectId=prj_video_demo' }))
    expect(IdentityResponseSchema.parse(await signedIn.json())).toMatchObject({ identity: { displayName: '微信用户cd385d' }, session: { status: 'authenticated', returnTo: '/canvas?projectId=prj_video_demo' } })
  })

  it('persists a typed home or project continuation across the local sign-in hand-off', async () => {
    const homeIntent = {
      kind: 'home-creative' as const,
      source: 'composer' as const,
      prompt: '雨夜城市里的纸飞机短片',
      context: emptyCreationContext(),
    }
    const signedOut = await POST(jsonRequest('http://localhost/api/identity', {
      action: 'signOut',
      returnTo: '/?resume=home',
      continuation: homeIntent,
    }))
    expect(IdentityResponseSchema.parse(await signedOut.json())).toMatchObject({
      session: { status: 'anonymous', returnTo: '/?resume=home', continuation: homeIntent },
    })

    const signedIn = await POST(jsonRequest('http://localhost/api/identity', { action: 'signIn' }))
    expect(IdentityResponseSchema.parse(await signedIn.json())).toMatchObject({
      session: { status: 'authenticated', returnTo: '/?resume=home', continuation: homeIntent },
    })

    const projectIntent = {
      kind: 'project-route' as const,
      route: '/project?folderId=folder_demo',
    }
    const projectSignOut = await POST(jsonRequest('http://localhost/api/identity', {
      action: 'signOut',
      returnTo: projectIntent.route,
      continuation: projectIntent,
    }))
    expect(IdentityResponseSchema.parse(await projectSignOut.json())).toMatchObject({
      session: { status: 'anonymous', returnTo: projectIntent.route, continuation: projectIntent },
    })
  })

  it('marks the deterministic two unread notifications as read', async () => {
    const before = NotificationsResponseSchema.parse(await (await getNotifications()).json())
    expect(before.notifications).toMatchObject({ unreadCount: 2, totalCount: 2 })
    const updated = await postNotifications(jsonRequest('http://localhost/api/notifications', { action: 'markAllRead' }))
    expect(NotificationsResponseSchema.parse(await updated.json()).notifications).toMatchObject({ unreadCount: 0, totalCount: 2 })
  })
})
