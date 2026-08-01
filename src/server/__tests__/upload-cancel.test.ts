import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Cancelling an upload, at the disk level.
 *
 * The claim under test is not "the row says cancelled" but "the bytes are gone
 * and the library will never list it", whichever side of the commit the cancel
 * lands on. Each of the three orderings from the note in src/server/assets.ts
 * gets its own case, driven through the real route handlers so the ordering is
 * the one production would see rather than one the test arranged.
 *
 * `src/server/store.ts` derives its data directory from `process.cwd()` at
 * import time, so the suite moves into a scratch directory *before* the first
 * import and restores it afterwards. Vitest isolates modules per file, so the
 * relocation cannot leak into another suite.
 */

let assets: typeof import('@/server/assets')
let store: typeof import('@/server/store')
let route: typeof import('@/app/api/assets/upload/route')
let library: typeof import('@/app/api/assets/route')
let root = ''
const originalCwd = process.cwd()

beforeAll(async () => {
  // realpath: macOS reports /var/... from mkdtemp but /private/var/... from cwd.
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-cancel-')))
  process.chdir(root)
  assets = await import('@/server/assets')
  store = await import('@/server/store')
  route = await import('@/app/api/assets/upload/route')
  library = await import('@/app/api/assets/route')
})

afterAll(async () => {
  process.chdir(originalCwd)
  await fs.rm(root, { recursive: true, force: true }).catch(() => undefined)
})

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

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

function upload(bytes: Uint8Array<ArrayBuffer>, name: string): File {
  return new File([bytes], name, { type: 'image/png' })
}

/** Shaped like the client's `mintToken`: 32 hex characters. */
let tokenSeq = 0
function token(): string {
  tokenSeq += 1
  return `cancel${String(tokenSeq).padStart(4, '0')}${'0'.repeat(22)}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function persisted() {
  const raw = await fs.readFile(path.join(root, '.data', 'workspace.json'), 'utf8')
  return JSON.parse(raw) as import('@/server/store').WorkspaceState
}

function uploadDirs(): Promise<string[]> {
  return fs
    .readdir(path.join(store.MEDIA_DIR, 'uploads'))
    .then((names) => names.sort())
    .catch(() => [])
}

interface UploadBody {
  assets: import('@/domain/types').Asset[]
  rejected: { name: string; reason: string }[]
}

async function post(file: File, uploadToken: string | null): Promise<{ status: number; body: UploadBody }> {
  const form = new FormData()
  form.append('files', file)
  form.append('namespace', 'personal')
  if (uploadToken !== null) form.append('uploadToken', uploadToken)
  const res = await route.POST(new Request('http://x/api/assets/upload', { method: 'POST', body: form }))
  return { status: res.status, body: (await res.json()) as UploadBody }
}

function del(query: string) {
  return route.DELETE(new Request(`http://x/api/assets/upload?${query}`, { method: 'DELETE' }))
}

/** The library listing is the only definition of "content" that matters here. */
async function listed(): Promise<string[]> {
  const res = await library.GET(new Request('http://x/api/assets?namespace=personal'))
  const body = (await res.json()) as { assets: { id: string }[] }
  return body.assets.map((asset) => asset.id)
}

/** Every trace an upload can leave: the row's own bytes and its directory. */
async function tracesOf(asset: import('@/domain/types').Asset) {
  const relative = decodeURIComponent(asset.url.replace('/api/media/', ''))
  const file = path.join(store.MEDIA_DIR, relative)
  const exists = await fs.stat(file).then(() => true, () => false)
  const directoryExists = await fs.stat(path.dirname(file)).then(() => true, () => false)
  return { exists, directoryExists }
}

/* ------------------------------------------------------------------ */

describe('cancel before the upload claims its token', () => {
  it('refuses the commit outright and leaves no bytes behind', async () => {
    const tok = token()
    const before = await uploadDirs()

    // Ordering 1: the tombstone is written while the request is still in the
    // client's socket buffer. Nothing exists yet for a check-then-act to find.
    const cancelRes = await del(`token=${tok}`)
    expect(cancelRes.status).toBe(200)
    expect(await cancelRes.json()).toEqual({ revoked: 0 })

    const { status, body } = await post(upload(png(640, 480), 'late.png'), tok)
    expect(status).toBe(200)
    expect(body.assets).toEqual([])
    expect(body.rejected).toEqual([{ name: 'late.png', reason: '上传已取消' }])

    // The row was never persisted at all, so there is nothing for the listing
    // to hide, and the staged bytes were thrown away on the way out.
    const state = await persisted()
    expect(state.assets.some((asset) => asset.name === 'late.png')).toBe(false)
    expect(await uploadDirs()).toEqual(before)
  })

  it('still refuses when the tombstone is the only thing that ever ran', async () => {
    const tok = token()
    await del(`token=${tok}`)
    // A second cancel is idempotent rather than an error, because the client
    // fires one on click and one again on pagehide.
    const again = await del(`token=${tok}`)
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ revoked: 0 })
  })
})

describe('cancel between the claim and the commit', () => {
  it('revokes the staging row, removes its bytes, and the commit refuses', async () => {
    const tok = token()
    const staged = await assets.stageUploads([upload(png(320, 200), 'midway.png')], {
      namespace: 'personal',
      folderId: null,
    })
    const item = staged.staged[0]

    // The request has persisted quarantine and is inside `validateStaged`.
    const claim = await store.withState((state) =>
      assets.claimUploadTicket(state, tok, [item.asset.id]),
    )
    expect(claim).toBe('claimed')
    await store.withState((state) => {
      state.assets.push(item.asset)
    })
    expect((await persisted()).assets.find((a) => a.id === item.asset.id)?.state).toBe('staging')
    expect((await tracesOf(item.asset)).exists).toBe(true)

    // Ordering 2: the cancel lands mid-validation.
    const cancelRes = await del(`token=${tok}`)
    expect(cancelRes.status).toBe(200)
    expect(await cancelRes.json()).toEqual({ revoked: 1 })
    expect(await tracesOf(item.asset)).toEqual({ exists: false, directoryExists: false })

    // The gate now finishes and the commit runs, exactly as it would have.
    const decisions = await assets.validateStaged(staged.staged)
    const committed = await store.withState((state) =>
      assets.commitUploads(state, decisions, tok),
    )
    expect(committed.assets).toEqual([])
    expect(committed.rejected).toEqual([{ name: 'midway.png', reason: '上传已取消' }])

    const row = (await persisted()).assets.find((a) => a.id === item.asset.id)
    expect(row?.state).toBe('revoked')
    expect(await listed()).not.toContain(item.asset.id)
    expect(await tracesOf(item.asset)).toEqual({ exists: false, directoryExists: false })
  })

  it('cannot be revived by a second request reusing the token', async () => {
    const tok = token()
    await del(`token=${tok}`)
    // The tombstone outlives the request it was written for, so a replay of the
    // token is refused rather than quietly granted a fresh set of rows.
    const { body } = await post(upload(png(8, 8), 'replay.png'), tok)
    expect(body.assets).toEqual([])
    expect(body.rejected[0].reason).toBe('上传已取消')
  })
})

describe('cancel after the commit', () => {
  it('revokes the committed row and deletes the bytes it was serving', async () => {
    const tok = token()
    const { status, body } = await post(upload(png(1024, 768), 'winner.png'), tok)
    expect(status).toBe(200)
    expect(body.assets).toMatchObject([{ state: 'committed', width: 1024, height: 768 }])
    const asset = body.assets[0]

    // Fully live: listed by the library and readable from disk.
    expect(await listed()).toContain(asset.id)
    expect(await tracesOf(asset)).toEqual({ exists: true, directoryExists: true })

    // Ordering 3: the cancel arrives after everything the request had to do.
    const cancelRes = await del(`token=${tok}`)
    expect(await cancelRes.json()).toEqual({ revoked: 1 })

    const row = (await persisted()).assets.find((a) => a.id === asset.id)
    // Soft delete: the id stays resolvable for artifacts and canvas nodes.
    expect(row).toBeTruthy()
    expect(row?.state).toBe('revoked')
    expect(await listed()).not.toContain(asset.id)
    expect(await tracesOf(asset)).toEqual({ exists: false, directoryExists: false })
  })
})

describe('cancel racing the upload for real', () => {
  it('converges on the same end state however the two interleave', async () => {
    // The three cases above each pin one ordering by construction. This one
    // pins none: the cancel is launched alongside the upload and offset by a
    // growing delay, so the sweep walks the cancel across the whole request —
    // measured, it lands before the claim, between the claim and the commit,
    // and after the commit. The assertions do not vary with where it landed,
    // which is the property the whole design exists to provide.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const tok = token()
      const name = `race-${attempt}.png`
      const before = await uploadDirs()

      const [posted] = await Promise.all([
        post(upload(png(64, 64), name), tok),
        sleep(attempt).then(() => del(`token=${tok}`)),
      ])
      expect(posted.status, name).toBe(200)

      // Depending on the ordering the row is either never persisted at all or
      // persisted and then revoked. It is never library content.
      const rows = (await persisted()).assets.filter((asset) => asset.name === name)
      const ids = await listed()
      for (const row of rows) {
        expect(row.state, name).toBe('revoked')
        expect(ids, name).not.toContain(row.id)
        expect(await tracesOf(row), name).toEqual({ exists: false, directoryExists: false })
      }
      // And no upload directory survives it either way.
      expect(await uploadDirs(), name).toEqual(before)
    }
  })
})

describe('token discipline', () => {
  it('only ever revokes the rows filed under the token it was given', async () => {
    const mine = token()
    const yours = token()
    const first = (await post(upload(png(16, 16), 'mine.png'), mine)).body.assets[0]
    const second = (await post(upload(png(24, 24), 'yours.png'), yours)).body.assets[0]

    await del(`token=${mine}`)

    const state = await persisted()
    expect(state.assets.find((a) => a.id === first.id)?.state).toBe('revoked')
    expect(state.assets.find((a) => a.id === second.id)?.state).toBe('committed')
    expect(await listed()).toContain(second.id)
    expect((await tracesOf(second)).exists).toBe(true)
  })

  it('refuses a malformed token on both the upload and the cancel', async () => {
    // Too short, out of alphabet, and past the length cap.
    for (const bad of ['short', 'has spaces in it!!!!!', 'a'.repeat(65)]) {
      const { status } = await post(upload(png(4, 4), 'bad.png'), bad)
      expect(status, bad).toBe(400)
      expect((await del(`token=${encodeURIComponent(bad)}`)).status, bad).toBe(400)
    }
    expect((await del('')).status).toBe(400)
    // A path-shaped token must never be accepted, since a token that reached
    // the filesystem would address directories outside its own upload.
    expect((await del('token=..%2F..%2Fetc%2Fpasswd0000')).status).toBe(400)
  })

  it('refuses a token a live upload already claimed', async () => {
    const tok = token()
    const first = await post(upload(png(12, 12), 'first.png'), tok)
    expect(first.body.assets).toHaveLength(1)

    const before = await uploadDirs()
    const replay = await post(upload(png(13, 13), 'second.png'), tok)
    expect(replay.status).toBe(409)
    // The refused request may not leave its bytes lying around either.
    expect(await uploadDirs()).toEqual(before)
    expect((await persisted()).assets.some((a) => a.name === 'second.png')).toBe(false)
  })

  it('leaves an upload that named no token free to commit as before', async () => {
    const { status, body } = await post(upload(png(32, 32), 'anonymous.png'), null)
    expect(status).toBe(200)
    expect(body.assets).toMatchObject([{ state: 'committed' }])
  })
})

describe('sweepUploadTickets', () => {
  it('keeps a ticket a request could still be using and drops it once stale', async () => {
    const tok = token()
    await post(upload(png(40, 40), 'swept.png'), tok)

    // Inside the window: the ticket a running request depends on is untouchable.
    expect(await store.withState((state) => assets.sweepUploadTickets(state))).toBe(0)

    const later = Date.now() + 60 * 60 * 1000
    expect(await store.withState((state) => assets.sweepUploadTickets(state, later))).toBeGreaterThan(0)

    const carried = (await persisted()) as import('@/server/store').WorkspaceState & {
      uploadTickets?: unknown[]
    }
    expect(carried.uploadTickets).toEqual([])
  })
})
