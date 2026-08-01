import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * The disk half of upload ingestion — what assets.test.ts cannot cover because
 * it only exercises pure functions.
 *
 * `src/server/store.ts` derives its data directory from `process.cwd()` at
 * import time, so the suite moves into a scratch directory *before* the first
 * import and restores it afterwards. Vitest isolates modules per file, so the
 * relocation cannot leak into another suite.
 */

let assets: typeof import('@/server/assets')
let store: typeof import('@/server/store')
let root = ''
const originalCwd = process.cwd()

beforeAll(async () => {
  // realpath: macOS reports /var/... from mkdtemp but /private/var/... from cwd.
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-upload-')))
  process.chdir(root)
  assets = await import('@/server/assets')
  store = await import('@/server/store')
})

afterAll(async () => {
  process.chdir(originalCwd)
  await fs.rm(root, { recursive: true, force: true }).catch(() => undefined)
})

/* ------------------------------------------------------------------ *
 * Fixtures assembled byte by byte, so a parser bug cannot hide behind a
 * fixture produced by the same assumptions.
 * ------------------------------------------------------------------ */

function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff]
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

/** `Uint8Array<ArrayBuffer>` rather than plain `Uint8Array`: only the narrowed
 * form is a `BlobPart`, since a shared buffer cannot back a `File`. */
function png(width: number, height: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...u32(13),
    0x49, 0x48, 0x44, 0x52, // 'IHDR'
    ...u32(width),
    ...u32(height),
    8, 6, 0, 0, 0, // bit depth, colour type, compression, filter, interlace
    ...u32(0), // CRC
  ])
}

/** SOI, an APP1, a DHT that must be stepped over, then a progressive SOF2. */
function jpeg(width: number, height: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, ...u16(12), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    // Payload picked so a parser that mistook DHT for a frame header would
    // report 0xdead x 0xbeef instead of the real size.
    0xff, 0xc4, ...u16(11), 0x00, 0x00, 0x00, 0xde, 0xad, 0xbe, 0xef, 0x00, 0x00,
    0xff, 0xc2, ...u16(17), 8, ...u16(height), ...u16(width), 3,
    1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xda, ...u16(8), 1, 1, 0, 0, 0x3f, 0,
  ])
}

const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x10, 0x00, 0x80, 0x00])
const SCRIPTED_SVG = new Uint8Array(new TextEncoder().encode('<svg xmlns="x"><script>fetch("/api")</script></svg>'))

function upload(bytes: Uint8Array<ArrayBuffer>, name: string, type: string): File {
  return new File([bytes], name, { type })
}

async function persisted() {
  const raw = await fs.readFile(path.join(root, '.data', 'workspace.json'), 'utf8')
  return JSON.parse(raw) as import('@/server/store').WorkspaceState
}

function uploadDirs(): Promise<string[]> {
  return fs.readdir(path.join(store.MEDIA_DIR, 'uploads')).catch(() => [])
}

/* ------------------------------------------------------------------ */

describe('header probes', () => {
  it('reads PNG dimensions as 32-bit fields at the IHDR offset', () => {
    expect(assets.readImageSize(png(1234, 567), 'image/png')).toEqual({ width: 1234, height: 567 })
    // Beyond 16 bits: proves the field width, not just the offset.
    expect(assets.readImageSize(png(65536, 3), 'image/png')).toEqual({ width: 65536, height: 3 })
  })

  it('walks JPEG markers past APP1 and DHT to the frame header', () => {
    expect(assets.readImageSize(jpeg(1920, 1080), 'image/jpeg')).toEqual({ width: 1920, height: 1080 })
  })

  it('returns null rather than a guess when the header is truncated', () => {
    expect(assets.readImageSize(jpeg(800, 600).slice(0, 20), 'image/jpeg')).toBeNull()
    expect(assets.readImageSize(png(4, 4).slice(0, 20), 'image/png')).toBeNull()
  })
})

describe('staging', () => {
  it('writes a hostile filename inside its own directory and commits it', async () => {
    const bytes = png(1280, 720)
    const staged = await assets.stageUploads([upload(bytes, '../../etc/my shot.png', 'image/png')], {
      namespace: 'personal',
      folderId: null,
    })
    expect(staged.rejected).toEqual([])
    const item = staged.staged[0]

    expect(item.asset.state).toBe('staging')
    expect(path.basename(item.file)).toBe('my-shot.png')
    const relative = path.relative(store.MEDIA_DIR, item.file)
    expect(relative.startsWith('..')).toBe(false)
    expect(relative.split(path.sep)[0]).toBe('uploads')
    expect((await fs.stat(item.file)).size).toBe(bytes.byteLength)

    await store.withState((state) => {
      state.assets.push(item.asset)
    })
    // Quarantine has to survive a read of the persisted document, otherwise
    // `staging` is a field nobody could ever observe.
    const mid = await persisted()
    expect(mid.assets.find((a) => a.id === item.asset.id)?.state).toBe('staging')
    expect(mid.assets.find((a) => a.id === item.asset.id)?.width).toBeNull()

    const decisions = await assets.validateStaged(staged.staged)
    expect(decisions[0].reason).toBeNull()
    const result = await store.withState((state) => assets.commitUploads(state, decisions))
    expect(result.assets[0].state).toBe('committed')

    const row = (await persisted()).assets.find((a) => a.id === item.asset.id)
    expect(row?.state).toBe('committed')
    expect(row).toMatchObject({ width: 1280, height: 720 })
    // The stored url has to lead back to the very bytes that were written.
    expect(row?.url).toBe(`/api/media/uploads/${path.basename(item.directory)}/my-shot.png`)
    const served = path.resolve(store.MEDIA_DIR, decodeURIComponent(row!.url.replace('/api/media/', '')))
    expect(served).toBe(path.resolve(item.file))
  })

  it('keeps two files of the same name apart', async () => {
    const staged = await assets.stageUploads(
      [upload(png(2, 2), 'same.png', 'image/png'), upload(png(3, 3), 'same.png', 'image/png')],
      { namespace: 'personal', folderId: null },
    )
    expect(staged.staged[0].directory).not.toBe(staged.staged[1].directory)
    const decisions = await assets.validateStaged(staged.staged)
    expect(decisions.map((d) => d.size)).toEqual([
      { width: 2, height: 2 },
      { width: 3, height: 3 },
    ])
  })

  it('never touches the disk for what the metadata gate already refused', async () => {
    const before = await uploadDirs()
    const oversized = {
      name: 'huge.png',
      type: 'image/png',
      size: assets.MAX_UPLOAD_BYTES + 1,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as File

    const staged = await assets.stageUploads([oversized, upload(GIF, 'a.gif', 'image/gif')], {
      namespace: 'personal',
      folderId: null,
    })
    expect(staged.staged).toEqual([])
    expect(staged.rejected.map((r) => r.name)).toEqual(['huge.png', 'a.gif'])
    expect(await uploadDirs()).toEqual(before)
  })

  it('deletes the bytes and the row when content contradicts the declared type', async () => {
    const before = (await uploadDirs()).length
    const cases: [Uint8Array<ArrayBuffer>, string, string][] = [
      [GIF, 'image/png', 'gif-as-png.png'],
      [jpeg(4, 4), 'image/png', 'jpeg-as-png.png'],
    ]

    for (const [bytes, type, name] of cases) {
      const staged = await assets.stageUploads([upload(bytes, name, type)], {
        namespace: 'personal',
        folderId: null,
      })
      // The metadata gate cannot see any of this: the type is allowed and the
      // size is fine, so these only fail once the bytes are on disk.
      expect(staged.staged, name).toHaveLength(1)
      await store.withState((state) => {
        state.assets.push(staged.staged[0].asset)
      })

      const decisions = await assets.validateStaged(staged.staged)
      expect(decisions[0].reason, name).toBeTruthy()
      await expect(fs.stat(staged.staged[0].file)).rejects.toThrow()
      await expect(fs.stat(staged.staged[0].directory)).rejects.toThrow()

      const result = await store.withState((state) => assets.commitUploads(state, decisions))
      expect(result.assets, name).toEqual([])
      expect((await persisted()).assets.some((a) => a.id === staged.staged[0].asset.id), name).toBe(false)
    }

    expect((await uploadDirs()).length).toBe(before)
  })

  it('rebuilds a scripted SVG instead of rejecting it, and stores only safe bytes', async () => {
    const staged = await assets.stageUploads([upload(SCRIPTED_SVG, 'evil.svg', 'image/svg+xml')], {
      namespace: 'personal',
      folderId: null,
    })
    await store.withState((state) => {
      state.assets.push(staged.staged[0].asset)
    })

    // The gate passes: the document is legal SVG once the script is gone.
    const decisions = await assets.validateStaged(staged.staged)
    expect(decisions[0].reason).toBeNull()

    // What matters is the bytes on disk, since that is what /api/media serves.
    const stored = await fs.readFile(staged.staged[0].file, 'utf8')
    expect(stored).not.toContain('script')
    expect(stored).not.toContain('fetch(')

    const result = await store.withState((state) => assets.commitUploads(state, decisions))
    expect(result.assets).toHaveLength(1)
    // byteSize must describe the rewritten file, not the original upload.
    expect(result.assets[0].byteSize).toBe(Buffer.byteLength(stored))
  })
})

describe('sweepAbandonedStaging', () => {
  it('drops rows whose gate never ran, with their bytes', async () => {
    const staged = await assets.stageUploads([upload(SCRIPTED_SVG, 'orphan.svg', 'image/svg+xml')], {
      namespace: 'personal',
      folderId: null,
    })
    const item = staged.staged[0]
    // A request that died between the quarantine write and the content gate.
    await store.withState((state) => {
      state.assets.push(item.asset)
    })

    // Still inside the window: a concurrent upload must not be swept.
    await store.withState((state) => assets.sweepAbandonedStaging(state))
    expect((await persisted()).assets.some((a) => a.id === item.asset.id)).toBe(true)
    expect(await fs.stat(item.file)).toBeTruthy()

    const later = Date.now() + 10 * 60 * 1000
    const swept = await store.withState((state) => assets.sweepAbandonedStaging(state, later))
    expect(swept).toBe(1)
    expect((await persisted()).assets.some((a) => a.id === item.asset.id)).toBe(false)
    await expect(fs.stat(item.directory)).rejects.toThrow()
  })

  it('leaves committed rows alone however old they are', async () => {
    const before = (await persisted()).assets.filter((a) => a.state === 'committed').length
    const swept = await store.withState((state) =>
      assets.sweepAbandonedStaging(state, Date.now() + 365 * 24 * 60 * 60 * 1000),
    )
    expect(swept).toBe(0)
    expect((await persisted()).assets.filter((a) => a.state === 'committed').length).toBe(before)
  })
})

describe('POST /api/assets/upload', () => {
  it('commits an image, reports per-file rejections and guards the request', async () => {
    const route = await import('@/app/api/assets/upload/route')

    const good = new FormData()
    good.append('files', upload(png(320, 240), 'ok.png', 'image/png'))
    good.append('namespace', 'personal')
    const res = await route.POST(new Request('http://x/api/assets/upload', { method: 'POST', body: good }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { assets: { state: string; width: number }[]; rejected: unknown[] }
    expect(body.assets).toMatchObject([{ state: 'committed', width: 320 }])
    expect(body.rejected).toEqual([])

    const bad = new FormData()
    bad.append('files', upload(GIF, 'x.gif', 'image/gif'))
    const badRes = await route.POST(new Request('http://x/api/assets/upload', { method: 'POST', body: bad }))
    expect(badRes.status).toBe(200)
    const badBody = (await badRes.json()) as { assets: unknown[]; rejected: unknown[] }
    expect(badBody.assets).toEqual([])
    expect(badBody.rejected).toHaveLength(1)

    const empty = new FormData()
    empty.append('namespace', 'personal')
    expect(
      (await route.POST(new Request('http://x/api/assets/upload', { method: 'POST', body: empty }))).status,
    ).toBe(400)

    const ghost = new FormData()
    ghost.append('files', upload(png(2, 2), 'a.png', 'image/png'))
    ghost.append('folderId', 'afld_missing')
    expect(
      (await route.POST(new Request('http://x/api/assets/upload', { method: 'POST', body: ghost }))).status,
    ).toBe(404)

    // Nothing may be left in quarantine once every request has answered.
    expect((await persisted()).assets.some((a) => a.state === 'staging')).toBe(false)
  })
})
