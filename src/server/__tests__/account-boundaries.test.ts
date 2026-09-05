import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import {
  commandLocalAccessKey,
  createLocalTeamInvite,
  readLocalAccessKey,
  readLocalAccountHandoffs,
  updateLocalTeamMember,
} from '@/server/account-boundaries'
import { updateLocalSession } from '@/server/identity'
import { resetStore } from '@/server/store'

describe.sequential('local account external command boundaries', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
    await updateLocalSession({ action: 'signIn', returnTo: '/' })
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
    await updateLocalSession({ action: 'signIn', returnTo: '/' })
  })

  it('creates, replays, rotates and revokes an Access Key without ever returning a credential', async () => {
    expect((await readLocalAccessKey()).key).toMatchObject({ state: 'not-created', generation: 0 })

    const created = await commandLocalAccessKey({ action: 'create', idempotencyKey: 'key-create-1' })
    const replay = await commandLocalAccessKey({ action: 'create', idempotencyKey: 'key-create-1' })
    const rotated = await commandLocalAccessKey({ action: 'rotate', idempotencyKey: 'key-rotate-1' })
    const revoked = await commandLocalAccessKey({ action: 'revoke', idempotencyKey: 'key-revoke-1' })

    expect(created.key).toMatchObject({ state: 'active', generation: 1, maskedValue: 'lvtk_••••••••01' })
    expect(replay).toEqual(created)
    expect(rotated.key).toMatchObject({ state: 'active', generation: 2, maskedValue: 'lvtk_••••••••02' })
    expect(revoked.key).toMatchObject({ state: 'revoked', generation: 2 })
    expect(JSON.stringify([created, rotated, revoked])).not.toMatch(/sk-|token|secret/i)
  })

  it('replays deterministic team invitations and permits role updates while protecting the owner', async () => {
    const created = await createLocalTeamInvite({ inviteeAlias: '本地协作者', role: 'member', idempotencyKey: 'invite-1' })
    const replay = await createLocalTeamInvite({ inviteeAlias: '本地协作者', role: 'member', idempotencyKey: 'invite-1' })
    const updated = await updateLocalTeamMember('member_liu', { role: 'member', idempotencyKey: 'member-1' })

    expect(created.invite).toMatchObject({ id: 'invite_local_0001', inviteeAlias: '本地协作者', state: 'pending' })
    expect(replay).toEqual(created)
    expect(updated.member).toMatchObject({ id: 'member_liu', role: 'member' })
    await expect(updateLocalTeamMember('member_local_cd385d', { role: 'member', idempotencyKey: 'member-owner' }))
      .rejects.toMatchObject({ status: 403 })
  })

  it('makes billing, invoice and model-market ownership explicit rather than calling a remote service', async () => {
    const signedIn = await readLocalAccountHandoffs()
    expect(signedIn).toMatchObject({ state: 'ready', subscription: { owner: 'billing', state: 'handoff-ready' }, invoices: { owner: 'invoice', state: 'empty' }, modelMarket: { owner: 'model-market', state: 'handoff-ready' } })

    await updateLocalSession({ action: 'signOut', returnTo: '/' })
    const signedOut = await readLocalAccountHandoffs()
    expect(signedOut).toMatchObject({ state: 'permission-denied', subscription: { state: 'authentication-required', action: null } })
  })
})
