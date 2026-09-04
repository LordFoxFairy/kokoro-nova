import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const previousDataDir = process.env.DATA_DIR

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = previousDataDir
  vi.resetModules()
})

describe('workspace store environment configuration', () => {
  it('uses DATA_DIR for isolated workspace state and media', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kokoro-nova-demo-'))
    process.env.DATA_DIR = dataDir
    vi.resetModules()

    try {
      const store = await import('@/server/store')

      expect(store.DATA_DIR).toBe(path.resolve(dataDir))
      expect(store.MEDIA_DIR).toBe(path.join(dataDir, 'media'))

      await store.resetStore('authenticated-empty')
      await expect(fs.stat(path.join(dataDir, 'workspace.json'))).resolves.toBeTruthy()
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true })
    }
  })
})
