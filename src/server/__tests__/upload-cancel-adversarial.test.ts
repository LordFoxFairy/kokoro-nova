import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@/domain/types'
// Type-only, so it is erased before the suite relocates `process.cwd()`.
import type { WorkspaceState } from '@/server/store'

/**
 * Adversarial cover for upload cancellation, driven through the route handlers
 * rather than the helpers, so the assertions are about what a client can
 * actually observe: bytes on disk and rows returned by 资产库.
 *
 * The three orderings a cancel can take relative to a commit are pinned
 * deterministically — the two that live between the staging write and the
 * commit are reached by hooking the one disk call the content gate makes,
 * because wall-clock delays cannot pin an interleaving.
 */

let uploadRoute: typeof import('@/app/api/assets/upload/route')
let libraryRoute: typeof import('@/app/api/assets/route')
let assetRoute: typeof import('@/app/api/assets/[assetId]/route')
let mediaRoute: typeof import('@/app/api/media/[...path]/route')
let store: typeof import('@/server/store')

let root = ''
const originalCwd = process.cwd()

beforeAll(async () => {
  // realpath: macOS reports /var/... from mkdtemp but /private/var/... from cwd.
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-cancel-adv-')))
  process.chdir(root)
  uploadRoute = await import('@/app/api/assets/upload/route')
  libraryRoute = await import('@/app/api/assets/route')
  assetRoute = await import('@/app/api/assets/[assetId]/route')
  mediaRoute = await import('@/app/api/media/[...path]/route')
  store = await import('@/server/store')
})

afterEach(async () => {
  vi.restoreAllMocks()
  await store.resetStore()
  await fs.rm(uploadsDir(), { recursive: true, force: true })
})

afterAll(async () => {
  process.chdir(originalCwd)
  await fs.rm(root, { recursive: true, force: true }).catch(() => undefined)
})

/* ------------------------------------------------------------------ *
 * Fixtures and observation helpers
 * ------------------------------------------------------------------ */

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

/** Minimal but header-valid PNG; the content gate only reads the IHDR. */
function png(width = 2, height = 3): Uint8Array<ArrayBuffer> {
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

function pngFile(name: string): File {
  return new File([png()], name, { type: 'image/png' })
}

/** Shape-valid by construction, so a test can only fail on behaviour. */
function token(seed: string): string {
  return `t${seed}`.replace(/[^A-Za-z0-9_-]/g, '_').padEnd(24, 'x').slice(0, 24)
}

function postRequest(files: File[], uploadToken?: string): Request {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  form.append('namespace', 'personal')
  if (uploadToken !== undefined) form.append('uploadToken', uploadToken)
  return new Request('http://nova.test/api/assets/upload', { method: 'POST', body: form })
}

function deleteRequest(raw: string | null): Request {
  const url = new URL('http://nova.test/api/assets/upload')
  // Set verbatim rather than through `encodeURIComponent`, so a payload that
  // relies on percent-encoding is decoded by the same code the handler uses.
  if (raw !== null) url.searchParams.set('token', raw)
  return new Request(url, { method: 'DELETE' })
}

function uploadsDir(): string {
  return path.join(root, '.data', 'media', 'uploads')
}

/** Every byte the upload feature is allowed to own, as leaf paths. */
async function bytesOnDisk(): Promise<string[]> {
  const found: string[] = []
  const walk = async (dir: string, prefix: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const next = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(next, `${prefix}${entry.name}/`)
      else found.push(`${prefix}${entry.name}`)
    }
  }
  await walk(uploadsDir(), '')
  return found.sort()
}

/** What 资产库 would actually render. */
async function libraryIds(): Promise<string[]> {
  const response = await libraryRoute.GET(new Request('http://nova.test/api/assets'))
  const body = (await response.json()) as { assets: Asset[] }
  return body.assets.map((asset) => asset.id).sort()
}

async function rowsById(): Promise<Map<string, Asset>> {
  const state = await store.readState()
  return new Map(state.assets.map((asset) => [asset.id, asset]))
}

/** The ticket table rides on a runtime-attached key; mirrored here so a test
 * can plant one rather than only ever going through the happy path. */
type TicketCarrier = WorkspaceState & {
  uploadTickets?: {
    token: string
    assetIds: string[]
    createdAt: string
    cancelledAt: string | null
  }[]
}

interface UploadBody {
  assets?: Asset[]
  rejected?: { name: string; reason: string }[]
  error?: string
}

async function post(files: File[], uploadToken?: string) {
  const response = await uploadRoute.POST(postRequest(files, uploadToken))
  return { status: response.status, body: (await response.json()) as UploadBody }
}

async function revoke(raw: string | null) {
  const response = await uploadRoute.DELETE(deleteRequest(raw))
  return { status: response.status, body: (await response.json()) as { revoked?: number; error?: string } }
}

/**
 * Runs `during` inside the content gate, which is the only window between the
 * staging write and the commit. `before` decides whether the cancel is ordered
 * ahead of the gate's own `stat` or behind it.
 */
function interleaveAtContentGate(during: () => Promise<void>, before: boolean) {
  type StatFn = typeof fs.stat
  const realStat: StatFn = fs.stat
  let fired = false
  vi.spyOn(fs, 'stat').mockImplementation((async (target: Parameters<StatFn>[0]) => {
    if (fired || !String(target).includes('uploads')) return realStat(target)
    fired = true
    if (before) {
      await during()
      return realStat(target)
    }
    const stats = await realStat(target)
    await during()
    return stats
  }) as StatFn)
}

/** Runs `during` the instant the first payload has been written but before the
 * request has filed a row for it. */
function interleaveAtByteWrite(during: () => Promise<void>) {
  type WriteFn = typeof fs.writeFile
  const realWrite: WriteFn = fs.writeFile
  let fired = false
  vi.spyOn(fs, 'writeFile').mockImplementation((async (
    target: Parameters<WriteFn>[0],
    data: Parameters<WriteFn>[1],
    options?: Parameters<WriteFn>[2],
  ) => {
    await realWrite(target, data, options)
    // The workspace document is written through here too; only an upload
    // payload marks the window this hook is for.
    if (!fired && String(target).includes('uploads')) {
      fired = true
      await during()
    }
  }) as WriteFn)
}

/* ------------------------------------------------------------------ *
 * The three orderings, at disk level
 * ------------------------------------------------------------------ */

describe('cancel versus commit', () => {
  it('ordering 1 — cancel lands before the upload claims its token', async () => {
    const tok = token('before')

    const cancelled = await revoke(tok)
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.revoked).toBe(0)

    const uploaded = await post([pngFile('early.png')], tok)
    expect(uploaded.status).toBe(200)
    expect(uploaded.body.assets).toEqual([])
    expect(uploaded.body.rejected?.[0]?.reason).toContain('取消')

    expect(await bytesOnDisk()).toEqual([])
    expect(await libraryIds()).toEqual([])
    // Nothing was ever persisted, so there is not even a revoked row.
    expect((await store.readState()).assets).toEqual([])
  })

  it('ordering 1b — cancel lands once the bytes exist but no row does', async () => {
    const tok = token('bytes-first')
    // The gap `xhr.abort()` alone can never close: the payload is already on
    // disk and the request is about to file it.
    let sawBytes: string[] = []
    interleaveAtByteWrite(async () => {
      sawBytes = await bytesOnDisk()
      await revoke(tok)
    })

    const uploaded = await post([pngFile('one.png'), pngFile('two.png')], tok)
    expect(sawBytes).toHaveLength(1)

    expect(uploaded.body.assets).toEqual([])
    expect(uploaded.body.rejected?.map((entry) => entry.reason)).toEqual(['上传已取消', '上传已取消'])
    expect(await bytesOnDisk()).toEqual([])
    expect(await libraryIds()).toEqual([])
    expect((await store.readState()).assets).toEqual([])
  })

  it('ordering 2a — cancel lands while the content gate is still reading', async () => {
    const tok = token('during-a')
    let count = -1
    interleaveAtContentGate(async () => {
      count = (await revoke(tok)).body.revoked ?? -1
    }, true)

    const uploaded = await post([pngFile('mid.png')], tok)

    // The cancel found the staging row this upload had already persisted.
    expect(count).toBe(1)
    expect(uploaded.status).toBe(200)
    expect(uploaded.body.assets).toEqual([])
    expect(uploaded.body.rejected?.[0]?.reason).toContain('取消')

    expect(await bytesOnDisk()).toEqual([])
    expect(await libraryIds()).toEqual([])
    const rows = [...(await rowsById()).values()]
    expect(rows).toHaveLength(1)
    expect(rows[0].state).toBe('revoked')
  })

  it('ordering 2b — cancel lands after the gate read but before the commit', async () => {
    const tok = token('during-b')
    interleaveAtContentGate(async () => {
      await revoke(tok)
    }, false)

    const uploaded = await post([pngFile('late-mid.png')], tok)

    expect(uploaded.body.assets).toEqual([])
    expect(uploaded.body.rejected?.[0]?.reason).toContain('取消')
    expect(await bytesOnDisk()).toEqual([])
    expect(await libraryIds()).toEqual([])
    const rows = [...(await rowsById()).values()]
    expect(rows.every((row) => row.state === 'revoked')).toBe(true)
  })

  it('ordering 3 — cancel lands after the asset is already library content', async () => {
    const tok = token('after')

    const uploaded = await post([pngFile('committed.png')], tok)
    const asset = uploaded.body.assets?.[0]
    expect(asset).toBeDefined()
    expect(asset?.state).toBe('committed')
    expect(await bytesOnDisk()).toHaveLength(1)
    expect(await libraryIds()).toEqual([asset!.id])

    const cancelled = await revoke(tok)
    expect(cancelled.body.revoked).toBe(1)

    expect(await bytesOnDisk()).toEqual([])
    expect(await libraryIds()).toEqual([])
  })

  it('revoking follows the soft-delete convention the rest of the surface uses', async () => {
    const tok = token('soft')
    const asset = (await post([pngFile('soft.png')], tok)).body.assets?.[0]
    await revoke(tok)

    // The row survives so an artifact or a canvas node still resolves its id.
    const row = (await rowsById()).get(asset!.id)
    expect(row).toBeDefined()
    expect(row?.state).toBe('revoked')

    // And it is treated exactly like a library delete, not like a hole.
    const patched = await assetRoute.PATCH(
      new Request(`http://nova.test/api/assets/${asset!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: '改名' }),
      }),
      { params: Promise.resolve({ assetId: asset!.id }) },
    )
    expect(patched.status).toBe(410)
  })

  it('stops serving the payload the moment it is revoked', async () => {
    const tok = token('served')
    const asset = (await post([pngFile('served.png')], tok)).body.assets?.[0]
    const segments = asset!.url.replace('/api/media/', '').split('/').map(decodeURIComponent)
    const fetchIt = () =>
      mediaRoute.GET(new Request(`http://nova.test${asset!.url}`), {
        params: Promise.resolve({ path: segments }),
      })

    expect((await fetchIt()).status).toBe(200)
    await revoke(tok)
    // Hiding the row would not be enough: the url is guessable from a document
    // that captured it, so the bytes have to be gone as well.
    expect((await fetchIt()).status).toBe(404)
  })

  it('is idempotent — a repeated cancel is not a second withdrawal', async () => {
    const tok = token('idem')
    await post([pngFile('idem.png')], tok)

    expect((await revoke(tok)).body.revoked).toBe(1)
    expect((await revoke(tok)).body.revoked).toBe(0)
    expect((await revoke(tok)).body.revoked).toBe(0)
    expect(await libraryIds()).toEqual([])
    expect(await bytesOnDisk()).toEqual([])
  })

  it('leaves nothing behind when a batch was half rejected by the content gate', async () => {
    const tok = token('mixed')
    // Declared png, prose inside — staged, then thrown out by the gate.
    const impostor = new File([new TextEncoder().encode('this is not a png')], 'bad.png', {
      type: 'image/png',
    })

    const uploaded = await post([pngFile('good.png'), impostor], tok)
    expect(uploaded.body.assets).toHaveLength(1)
    expect(uploaded.body.rejected).toHaveLength(1)
    expect(await bytesOnDisk()).toHaveLength(1)

    // The ticket still names the row the gate dropped; that must not throw.
    expect((await revoke(tok)).body.revoked).toBe(1)
    expect(await libraryIds()).toEqual([])
    expect(await bytesOnDisk()).toEqual([])
  })

  it('revokes every file of a batch filed under one token', async () => {
    const tok = token('batch')
    const uploaded = await post(
      [pngFile('one.png'), pngFile('two.png'), pngFile('three.png')],
      tok,
    )
    expect(uploaded.body.assets).toHaveLength(3)
    expect(await bytesOnDisk()).toHaveLength(3)

    expect((await revoke(tok)).body.revoked).toBe(3)
    expect(await bytesOnDisk()).toEqual([])
    expect(await libraryIds()).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * The token is a capability over one upload and nothing else
 * ------------------------------------------------------------------ */

describe('token scope', () => {
  it('cannot reach an upload it did not create', async () => {
    const mine = token('mine')
    const yours = token('yours')

    const a = (await post([pngFile('mine.png')], mine)).body.assets?.[0]
    const b = (await post([pngFile('yours.png')], yours)).body.assets?.[0]
    expect(await bytesOnDisk()).toHaveLength(2)

    expect((await revoke(mine)).body.revoked).toBe(1)

    expect(await libraryIds()).toEqual([b!.id])
    const remaining = await bytesOnDisk()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toContain('yours.png')
    expect((await rowsById()).get(a!.id)?.state).toBe('revoked')
    expect((await rowsById()).get(b!.id)?.state).toBe('committed')
  })

  it('cannot reach an asset that never came from an upload', async () => {
    const tok = token('foreign')
    // A generated artifact registered into the library: same table, no ticket.
    await store.withState((state) => {
      state.assets.push({
        id: 'as_generated',
        spaceId: store.DEFAULT_SPACE_ID,
        namespace: 'personal',
        kind: 'image',
        name: 'generated.png',
        url: '/api/media/jobs/job_1/out.png',
        thumbnailUrl: null,
        width: null,
        height: null,
        durationSeconds: null,
        byteSize: 1,
        tags: [],
        folderId: null,
        state: 'committed',
        createdAt: new Date().toISOString(),
        sourceArtifactId: 'ar_1',
      })
    })

    expect((await revoke(tok)).body.revoked).toBe(0)
    expect(await libraryIds()).toEqual(['as_generated'])
  })

  it('cannot be steered outside the upload root by a poisoned url', async () => {
    // Withdrawing is the one place this feature deletes a directory, so the
    // url it derives that directory from is treated as hostile even though
    // only `stageUploads` can currently mint one.
    const media = path.join(root, '.data', 'media')
    await fs.mkdir(path.join(media, 'jobs', 'job_1'), { recursive: true })
    await fs.writeFile(path.join(media, 'jobs', 'job_1', 'artifact.png'), 'generated')
    await fs.mkdir(path.join(root, 'outside'), { recursive: true })
    await fs.writeFile(path.join(root, 'outside', 'secret.txt'), 'not media at all')

    const poisoned = [
      '/api/media/uploads/../jobs/job_1/artifact.png',
      '/api/media/uploads/..%2F..%2Fjobs/artifact.png',
      '/api/media/uploads/UPL_UPPERCASE/x.png',
      '/api/media/uploads//x.png',
      '/api/media/uploads/upl_ok%2f..%2f..%2fjobs/x.png',
      '/api/media/jobs/job_1/artifact.png',
      '../../../../outside/secret.txt',
      '/api/media/uploads/',
    ]

    const tok = token('poison')
    await store.withState((state) => {
      const carrier = state as TicketCarrier
      const assetIds = poisoned.map((url, index) => {
        const id = `ast_poison${index}`
        state.assets.push({
          id,
          spaceId: store.DEFAULT_SPACE_ID,
          namespace: 'personal',
          kind: 'image',
          name: 'x.png',
          url,
          thumbnailUrl: null,
          width: null,
          height: null,
          durationSeconds: null,
          byteSize: 1,
          tags: [],
          folderId: null,
          state: 'committed',
          createdAt: new Date().toISOString(),
          sourceArtifactId: null,
        })
        return id
      })
      carrier.uploadTickets = [
        { token: tok, assetIds, createdAt: new Date().toISOString(), cancelledAt: null },
      ]
    })

    expect((await revoke(tok)).body.revoked).toBe(poisoned.length)

    // Every row is withdrawn, and not one byte outside its own directory moved.
    for (const survivor of [
      path.join(media, 'jobs', 'job_1', 'artifact.png'),
      path.join(media, 'jobs'),
      path.join(root, 'outside', 'secret.txt'),
    ]) {
      await expect(fs.stat(survivor)).resolves.toBeDefined()
    }
  })

  it('is single use — a second upload cannot bind fresh rows to it', async () => {
    const tok = token('reuse')
    const first = (await post([pngFile('first.png')], tok)).body.assets?.[0]

    const second = await post([pngFile('second.png')], tok)
    expect(second.status).toBe(409)

    // The rejected request left nothing behind and did not disturb the first.
    const remaining = await bytesOnDisk()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toContain('first.png')
    expect(await libraryIds()).toEqual([first!.id])
  })

  it('an upload that sends no token behaves exactly as before', async () => {
    const asset = (await post([pngFile('anon.png')])).body.assets?.[0]
    expect(asset?.state).toBe('committed')

    // Nothing names it, so no cancel can find it.
    expect((await revoke(token('guess'))).body.revoked).toBe(0)
    expect(await libraryIds()).toEqual([asset!.id])
    expect(await bytesOnDisk()).toHaveLength(1)
  })
})

/* ------------------------------------------------------------------ *
 * Token shape
 * ------------------------------------------------------------------ */

describe('token validation', () => {
  const rejected: [string, string][] = [
    ['too short', 'abcdefghijklmno'],
    ['one under the floor', 'a'.repeat(15)],
    ['one over the ceiling', 'a'.repeat(65)],
    ['absurdly long', 'a'.repeat(100_000)],
    ['relative path', '../../../etc/passwd'],
    ['percent-encoded traversal', '..%2f..%2f..%2fworkspace.json'],
    ['absolute path', '/etc/passwd/aaaaaaaaaaaaaa'],
    ['embedded NUL', `${'a'.repeat(16)} `],
    ['embedded newline', `${'a'.repeat(16)}\nb`],
    ['embedded tab', `aaaaaaaa\taaaaaaaa`],
    ['dot separated', 'aaaaaaaa.aaaaaaaa'],
    ['glob', `${'a'.repeat(16)}*`],
    ['unicode homoglyph', `${'a'.repeat(16)}а`],
    ['sql-ish', "aaaaaaaaaaaaaaaa' OR '1'='1"],
  ]

  for (const [label, raw] of rejected) {
    it(`refuses ${label} on DELETE`, async () => {
      const response = await revoke(raw)
      expect(response.status).toBe(400)
      expect(response.body.error).toMatchObject({ message: expect.stringContaining('令牌') })
    })

    it(`refuses ${label} on POST, before a byte is staged`, async () => {
      const response = await post([pngFile('probe.png')], raw)
      expect(response.status).toBe(400)
      expect(await bytesOnDisk()).toEqual([])
      expect(await libraryIds()).toEqual([])
    })
  }

  it('refuses a missing token on DELETE', async () => {
    expect((await revoke(null)).status).toBe(400)
  })

  it('reads a blank token as no token at all, on both ends', async () => {
    // Blank is "this caller accepts that it cannot cancel", not a client bug —
    // so the upload lands, and the only thing lost is the ability to undo it.
    const uploaded = await post([pngFile('blank.png')], '   ')
    expect(uploaded.status).toBe(200)
    expect(uploaded.body.assets).toHaveLength(1)
    // Nothing to name it by, so there is nothing to cancel either.
    expect((await revoke('   ')).status).toBe(400)
  })

  it('names the same ticket at both ends when the client pads its token', async () => {
    const padded = `  ${token('padded')}\t`
    const uploaded = await post([pngFile('padded.png')], padded)
    expect(uploaded.body.assets).toHaveLength(1)

    // The upload part is trimmed, so the query string has to be too — otherwise
    // the row stages under a name its own client is refused the use of.
    const cancelled = await revoke(padded)
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.revoked).toBe(1)
    expect(await libraryIds()).toEqual([])
    expect(await bytesOnDisk()).toEqual([])
  })

  it('accepts the exact boundaries of the accepted shape', async () => {
    for (const tok of ['a'.repeat(16), `${'-_'.repeat(31)}zz`]) {
      expect(tok.length === 16 || tok.length === 64).toBe(true)
      expect((await revoke(tok)).status).toBe(200)
    }
  })

  it('leaves the store untouched when a token is refused', async () => {
    await revoke('nope')
    const state = (await store.readState()) as WorkspaceState & { uploadTickets?: unknown[] }
    expect(state.uploadTickets ?? []).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * Unpinned interleavings — the invariant has to hold at every offset
 * ------------------------------------------------------------------ */

describe('racing a cancel against a commit', () => {
  it('never leaves an asset in the library and never leaves orphan bytes', async () => {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await store.resetStore()
      await fs.rm(uploadsDir(), { recursive: true, force: true })

      const tok = token(`race${attempt}`)
      const posted = uploadRoute.POST(postRequest([pngFile(`race${attempt}.png`)], tok))
      // Sweeps the whole request, from "cancel first" to "cancel after commit".
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt % 12))
      const cancelled = uploadRoute.DELETE(deleteRequest(tok))
      await Promise.all([posted, cancelled])

      expect(await libraryIds()).toEqual([])
      expect(await bytesOnDisk()).toEqual([])
      // Whatever row survived is a tombstone, never library content.
      for (const row of (await store.readState()).assets) {
        expect(row.state).toBe('revoked')
      }
    }
  })

  it('keeps every uncancelled upload of an interleaved swarm intact', async () => {
    await store.resetStore()
    await fs.rm(uploadsDir(), { recursive: true, force: true })

    const inFlight: Promise<unknown>[] = []
    for (let i = 0; i < 40; i += 1) {
      const tok = token(`swarm${i}`)
      inFlight.push(uploadRoute.POST(postRequest([pngFile(`s${i}.png`)], tok)))
      // Every other upload is cancelled while the whole batch is in flight, so
      // a cancel that reached past its own ticket would show up as a survivor
      // going missing rather than as a tidy failure.
      if (i % 2 === 0) inFlight.push(uploadRoute.DELETE(deleteRequest(tok)))
    }
    await Promise.all(inFlight)

    expect(await libraryIds()).toHaveLength(20)
    expect(await bytesOnDisk()).toHaveLength(20)

    const directories = new Set((await bytesOnDisk()).map((file) => file.split('/')[0]))
    const directoryOf = (asset: Asset) =>
      asset.url.replace('/api/media/uploads/', '').split('/')[0]
    for (const row of (await store.readState()).assets) {
      // A committed row without bytes is a broken thumbnail; a revoked row with
      // bytes is the leak this feature exists to prevent.
      expect(directories.has(directoryOf(row))).toBe(row.state === 'committed')
    }
  })
})
