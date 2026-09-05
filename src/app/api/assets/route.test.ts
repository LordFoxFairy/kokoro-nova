import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { AssetLifecycleListResponseSchema, AssetLifecycleViewSchema } from '@/contracts/assets'
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { readState, resetStore } from '@/server/store'
import { DELETE, PATCH } from './[assetId]/route'
import { GET as listFolders, POST as createFolder } from './folders/route'
import { GET, POST } from './route'

const ASSET_ID = 'asset_image_seed'
const params = (assetId: string) => ({ params: Promise.resolve({ assetId }) })
const jsonRequest = (url: string, body: unknown) => new Request(url, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

describe.sequential('asset library route smoke', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('returns schema-valid active and deterministic unavailable lifecycle projections', async () => {
    const activeResponse = await GET(new Request('http://localhost/api/assets?visibility=active'))
    const active = AssetLifecycleListResponseSchema.parse(await activeResponse.json())

    expect(activeResponse.status).toBe(200)
    expect(active.assets).toContainEqual(expect.objectContaining({
      id: ASSET_ID,
      state: 'committed',
      lifecycle: expect.objectContaining({ availability: 'active', reason: 'available' }),
    }))

    const unavailableResponse = await GET(new Request(
      'http://localhost/api/assets?fixture=media-missing&visibility=unavailable',
    ))
    const unavailable = AssetLifecycleListResponseSchema.parse(await unavailableResponse.json())

    expect(unavailableResponse.status).toBe(200)
    expect(unavailable.assets).toEqual([
      expect.objectContaining({
        id: ASSET_ID,
        lifecycle: expect.objectContaining({ availability: 'missing', reason: 'media_url_unavailable' }),
      }),
    ])
  })

  it('registers an unbound generated artifact as one schema-valid reusable asset and replays the same source artifact', async () => {
    const stateBefore = await readState()
    const artifact = stateBefore.jobs.flatMap((job) => job.artifacts).find((item) => item.assetId === null)
    if (!artifact) throw new Error('authenticated-populated fixture must include an unbound generated artifact')

    const request = () => new Request('http://localhost/api/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        artifactId: artifact.id,
        name: '保存的视频生成产物',
        namespace: 'agent',
        tags: ['场景', '风格'],
      }),
    })
    const registeredResponse = await POST(request())
    const registered = AssetLifecycleViewSchema.parse(await registeredResponse.json())
    const replayResponse = await POST(request())
    const replay = AssetLifecycleViewSchema.parse(await replayResponse.json())

    expect(registeredResponse.status).toBe(200)
    expect(registered).toMatchObject({
      id: expect.stringMatching(/^ast_/),
      sourceArtifactId: artifact.id,
      namespace: 'agent',
      kind: artifact.kind,
      name: '保存的视频生成产物',
      tags: ['场景', '风格'],
      state: 'committed',
      lifecycle: { availability: 'active', reason: 'available' },
    })
    expect(replayResponse.status).toBe(200)
    expect(replay).toEqual(registered)

    const stateAfter = await readState()
    expect(stateAfter.assets.filter((asset) => asset.sourceArtifactId === artifact.id)).toEqual([
      expect.objectContaining({ id: registered.id }),
    ])
    expect(stateAfter.jobs.flatMap((job) => job.artifacts).find((item) => item.id === artifact.id)?.assetId).toBe(registered.id)
  })

  it('persists a folder move and metadata update through the documented route responses', async () => {
    const initialFolders = await listFolders()
    expect(initialFolders.status).toBe(200)
    expect(await initialFolders.json()).toEqual({ folders: [], counts: {} })

    const createdFolderResponse = await createFolder()
    const createdFolder = await createdFolderResponse.json() as {
      id: string
      spaceId: string
      name: string
      createdAt: string
      updatedAt: string
    }
    expect(createdFolderResponse.status).toBe(200)
    expect(createdFolder).toMatchObject({
      id: expect.stringMatching(/^afld_/),
      spaceId: 'sp_default',
      name: '未命名文件夹',
    })
    expect(new Date(createdFolder.createdAt).toISOString()).toBe(createdFolder.createdAt)
    expect(new Date(createdFolder.updatedAt).toISOString()).toBe(createdFolder.updatedAt)

    const updatedResponse = await PATCH(
      jsonRequest(`http://localhost/api/assets/${ASSET_ID}`, {
        name: '已归档首帧',
        tags: ['场景', '风格'],
        folderId: createdFolder.id,
      }),
      params(ASSET_ID),
    )
    const updated = AssetLifecycleViewSchema.parse(await updatedResponse.json())

    expect(updatedResponse.status).toBe(200)
    expect(updated).toMatchObject({
      id: ASSET_ID,
      name: '已归档首帧',
      tags: ['场景', '风格'],
      folderId: createdFolder.id,
      lifecycle: { availability: 'active', reason: 'available' },
    })

    const foldersResponse = await listFolders()
    expect(await foldersResponse.json()).toEqual({
      folders: [createdFolder],
      counts: { [createdFolder.id]: 1 },
    })
  })

  it('exposes delete, unavailable listing, restore, and normalized missing-asset errors', async () => {
    const deletedResponse = await DELETE(new Request(`http://localhost/api/assets/${ASSET_ID}`, { method: 'DELETE' }), params(ASSET_ID))
    const deleted = AssetLifecycleViewSchema.parse(await deletedResponse.json())

    expect(deletedResponse.status).toBe(200)
    expect(deleted).toMatchObject({
      id: ASSET_ID,
      state: 'revoked',
      lifecycle: { availability: 'recoverable', reason: 'deleted_by_user' },
    })

    const activeResponse = await GET(new Request('http://localhost/api/assets?visibility=active'))
    const active = AssetLifecycleListResponseSchema.parse(await activeResponse.json())
    expect(active.assets).not.toContainEqual(expect.objectContaining({ id: ASSET_ID }))

    const unavailableResponse = await GET(new Request('http://localhost/api/assets?visibility=unavailable'))
    const unavailable = AssetLifecycleListResponseSchema.parse(await unavailableResponse.json())
    expect(unavailable.assets).toContainEqual(expect.objectContaining({
      id: ASSET_ID,
      lifecycle: expect.objectContaining({ availability: 'recoverable', reason: 'deleted_by_user' }),
    }))

    const restoredResponse = await PATCH(
      jsonRequest(`http://localhost/api/assets/${ASSET_ID}`, { action: 'restore' }),
      params(ASSET_ID),
    )
    const restored = AssetLifecycleViewSchema.parse(await restoredResponse.json())
    expect(restoredResponse.status).toBe(200)
    expect(restored).toMatchObject({
      id: ASSET_ID,
      state: 'committed',
      lifecycle: { availability: 'active', reason: 'available' },
    })

    const missingResponse = await PATCH(
      jsonRequest('http://localhost/api/assets/asset_missing', { name: '不存在' }),
      params('asset_missing'),
    )
    const missing = LocalErrorEnvelopeSchema.parse(await missingResponse.json())
    expect(missingResponse.status).toBe(404)
    expect(missing).toMatchObject({ error: { code: 'NOT_FOUND', message: '资产不存在' }, requestId: expect.any(String) })
  })
})
