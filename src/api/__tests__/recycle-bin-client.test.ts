import { describe, expect, it } from 'vitest'

import { createApiClient, type JsonTransport } from '@/api/client'

function json(value: unknown, init?: ResponseInit) {
  return Response.json(value, init)
}

const recycleEntry = {
  id: 'prj_video_demo',
  spaceId: 'sp_default',
  folderId: null,
  name: '未命名',
  coverUrl: null,
  createdAt: '2026-09-03T12:00:00.000Z',
  updatedAt: '2026-09-04T12:00:00.000Z',
  canvasIds: ['can_video_main'],
  recycledAt: '2026-09-04T12:00:00.000Z',
  recycleExpiresAt: '2026-10-04T12:00:00.000Z',
  recycleOriginalFolderId: null,
  originalFolderName: null,
  canvasCount: 1,
  daysRemaining: 30,
}

describe('typed recycle-bin API client', () => {
  it('uses local encoded paths and decodes list, restore and permanent-delete contracts', async () => {
    const seen: Array<{ url: string; method?: string }> = []
    let call = 0
    const transport: JsonTransport = async (input, init) => {
      seen.push({ url: String(input), method: init?.method })
      call += 1
      if (call === 1) return json({ projects: [recycleEntry], purgedProjectIds: [] })
      if (call === 2) return json({ project: { ...recycleEntry, recycledAt: undefined, recycleExpiresAt: undefined, recycleOriginalFolderId: undefined }, restoredToRoot: true, canvasCount: 1 })
      return json({ deleted: 'prj/video', permanentlyDeleted: true })
    }
    const client = createApiClient(transport)

    await expect(client.recycleBin.list()).resolves.toMatchObject({ projects: [recycleEntry] })
    await expect(client.recycleBin.restore('prj/video')).resolves.toMatchObject({ restoredToRoot: true, canvasCount: 1 })
    await expect(client.recycleBin.permanentlyDelete('prj/video')).resolves.toEqual({ deleted: 'prj/video', permanentlyDeleted: true })
    expect(seen).toEqual([
      { url: '/api/recycle-bin' },
      { url: '/api/recycle-bin/prj%2Fvideo', method: 'POST' },
      { url: '/api/recycle-bin/prj%2Fvideo', method: 'DELETE' },
    ])
  })
})
