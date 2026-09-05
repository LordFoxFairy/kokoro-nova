import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { AssetLifecycleListResponseSchema } from '@/contracts/assets'
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET as listAssets } from '../route'
import { DELETE, POST } from './route'

/**
 * Route-level upload smoke.
 *
 * The server-level suites cover every disk/race ordering. This suite keeps the
 * public HTTP contract honest: multipart ingress can return a partial success,
 * a token is single-use, cancellation is replay-safe, and every rejected
 * transport response remains the documented error envelope.
 */
const UploadResponseSchema = z.object({
  assets: z.array(z.object({
    id: z.string().min(1),
    namespace: z.enum(['personal', 'agent']),
    kind: z.enum(['image', 'video', 'audio', 'text']),
    name: z.string().min(1),
    state: z.enum(['staging', 'committed', 'revoked']),
    width: z.number().nullable(),
    height: z.number().nullable(),
    folderId: z.string().nullable(),
    sourceArtifactId: z.string().nullable(),
  }).passthrough()),
  rejected: z.array(z.object({ name: z.string(), reason: z.string() }).strict()),
}).strict()

const CancelResponseSchema = z.object({ revoked: z.number().int().nonnegative() }).strict()

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

/** A header-complete PNG is enough for the deterministic local content gate. */
function png(width: number, height: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...u32(13),
    0x49, 0x48, 0x44, 0x52,
    ...u32(width),
    ...u32(height),
    8, 6, 0, 0, 0,
    ...u32(0),
  ])
}

function uploadForm(token: string, files: Array<{ bytes: Uint8Array<ArrayBuffer>; name: string; type: string }>) {
  const form = new FormData()
  for (const file of files) {
    form.append('files', new File([file.bytes], file.name, { type: file.type }))
  }
  form.append('namespace', 'personal')
  form.append('uploadToken', token)
  return form
}

function uploadRequest(token: string, files: Parameters<typeof uploadForm>[1]) {
  return new Request('http://localhost/api/assets/upload', {
    method: 'POST',
    body: uploadForm(token, files),
  })
}

function cancelRequest(token: string) {
  return new Request(`http://localhost/api/assets/upload?token=${encodeURIComponent(token)}`, { method: 'DELETE' })
}

describe.sequential('asset upload route smoke', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('commits the accepted file, returns a partial rejection, and removes the committed row on cancel replay', async () => {
    const token = 'upload_route_smoke_000001'
    const uploaded = await POST(uploadRequest(token, [
      { bytes: png(640, 360), name: 'accepted.png', type: 'image/png' },
      { bytes: new Uint8Array([0x47, 0x49, 0x46, 0x38]), name: 'rejected.gif', type: 'image/gif' },
    ]))
    const body = UploadResponseSchema.parse(await uploaded.json())

    expect(uploaded.status).toBe(200)
    expect(body).toMatchObject({
      assets: [{
        namespace: 'personal',
        kind: 'image',
        name: 'accepted.png',
        state: 'committed',
        width: 640,
        height: 360,
        folderId: null,
        sourceArtifactId: null,
      }],
      rejected: [{ name: 'rejected.gif', reason: expect.stringContaining('不接受的文件类型') }],
    })

    const assetId = body.assets[0].id
    const listedBeforeCancel = AssetLifecycleListResponseSchema.parse(await (await listAssets(
      new Request('http://localhost/api/assets?namespace=personal&visibility=active'),
    )).json())
    expect(listedBeforeCancel.assets.find((asset) => asset.id === assetId)).toMatchObject({
      id: assetId,
      state: 'committed',
      lifecycle: { availability: 'active', reason: 'available' },
    })

    const cancelled = CancelResponseSchema.parse(await (await DELETE(cancelRequest(token))).json())
    const replay = CancelResponseSchema.parse(await (await DELETE(cancelRequest(token))).json())
    expect(cancelled).toEqual({ revoked: 1 })
    expect(replay).toEqual({ revoked: 0 })

    const listedAfterCancel = AssetLifecycleListResponseSchema.parse(await (await listAssets(
      new Request('http://localhost/api/assets?namespace=personal&visibility=active'),
    )).json())
    expect(listedAfterCancel.assets).not.toContainEqual(expect.objectContaining({ id: assetId }))
  })

  it('rejects second multipart ingress for an occupied token with the normalized conflict envelope', async () => {
    const token = 'upload_route_smoke_000002'
    const first = await POST(uploadRequest(token, [
      { bytes: png(16, 9), name: 'first.png', type: 'image/png' },
    ]))
    expect(first.status).toBe(200)
    UploadResponseSchema.parse(await first.json())

    const conflictResponse = await POST(uploadRequest(token, [
      { bytes: png(32, 18), name: 'second.png', type: 'image/png' },
    ]))
    const conflict = LocalErrorEnvelopeSchema.parse(await conflictResponse.json())

    expect(conflictResponse.status).toBe(409)
    expect(conflict).toMatchObject({
      error: { code: 'REVISION_CONFLICT', message: '上传令牌冲突' },
      requestId: expect.stringMatching(/^req_local_/),
    })
  })

  it('normalizes malformed cancellation tokens as a 400 error envelope', async () => {
    const response = await DELETE(new Request('http://localhost/api/assets/upload?token=too-short', { method: 'DELETE' }))
    const error = LocalErrorEnvelopeSchema.parse(await response.json())

    expect(response.status).toBe(400)
    expect(error).toMatchObject({
      error: { code: 'INVALID_INPUT', message: '上传令牌不合法' },
      requestId: expect.stringMatching(/^req_local_/),
    })
  })
})
