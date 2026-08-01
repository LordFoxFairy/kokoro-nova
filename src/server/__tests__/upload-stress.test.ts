import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import v8 from 'node:v8'
import vm from 'node:vm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Asset } from '@/domain/types'

/**
 * Upload ingestion under load.
 *
 * The lifecycle and cancellation suites drive one upload at a time, which is
 * the one shape the production client never produces: a folder drop fans out
 * into dozens of simultaneous requests and the user cancels some of them while
 * the rest are still in flight. What this suite pins is the single invariant
 * that has to survive any interleaving —
 *
 *   a `committed` row always has its bytes, and a row whose bytes are gone is
 *   never `committed`
 *
 * — plus the disk hygiene that follows from it. Where a cancel's place in the
 * write chain is genuinely unknown the assertion admits every legal end state;
 * where it has to be known, the test observes the claim instead of timing it.
 * Neither form depends on a speed the machine is free to change.
 *
 * The memory case is a measurement rather than a threshold, because a threshold
 * would only ever encode what this machine did on the day it was written. Its
 * numbers are printed on every run; the finding they carry is recorded next to
 * the assertions.
 *
 * `src/server/store.ts` derives its data directory from `process.cwd()` at
 * import time, so the suite moves into a scratch directory *before* the first
 * import and restores it afterwards. Vitest isolates modules per file, so the
 * relocation cannot leak into another suite.
 */

let assets: typeof import('@/server/assets')
let store: typeof import('@/server/store')
let route: typeof import('@/app/api/assets/upload/route')
let root = ''
const originalCwd = process.cwd()

beforeAll(async () => {
  // realpath: macOS reports /var/... from mkdtemp but /private/var/... from cwd.
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-stress-')))
  process.chdir(root)
  assets = await import('@/server/assets')
  store = await import('@/server/store')
  route = await import('@/app/api/assets/upload/route')
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

const PNG_HEADER = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...u32(13),
  0x49, 0x48, 0x44, 0x52, // 'IHDR'
  ...u32(8),
  ...u32(8),
  8, 6, 0, 0, 0, // bit depth, colour type, compression, filter, interlace
  ...u32(0), // CRC
]

/**
 * A signature and an IHDR followed by filler. Nothing decodes the image — the
 * gate sniffs the leading bytes and the size probe reads a fixed offset — so the
 * payload can be padded to whatever size a load case needs.
 *
 * `Uint8Array<ArrayBuffer>` rather than plain `Uint8Array`: only the narrowed
 * form is a `BlobPart`, since a shared buffer cannot back a `File`.
 */
function png(totalBytes: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(Math.max(totalBytes, PNG_HEADER.length))
  bytes.set(PNG_HEADER)
  return bytes
}

/** Declared PNG, GIF on the wire: staged, then killed by the content gate. */
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x10, 0x00, 0x80, 0x00])

const SCRIPTED_SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api")</script></svg>',
)

function upload(bytes: Uint8Array<ArrayBuffer>, name: string): File {
  return new File([bytes], name, { type: 'image/png' })
}

/** Shaped like the client's `mintToken`: 32 characters from the token alphabet. */
let tokenSeq = 0
function token(): string {
  tokenSeq += 1
  return `stress${String(tokenSeq).padStart(4, '0')}${'0'.repeat(22)}`
}

/* ------------------------------------------------------------------ *
 * Driving the real handlers
 * ------------------------------------------------------------------ */

interface UploadBody {
  assets?: Asset[]
  rejected?: { name: string; reason: string }[]
  error?: string
}

function request(files: File[], uploadToken: string | null): Request {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  form.append('namespace', 'personal')
  if (uploadToken !== null) form.append('uploadToken', uploadToken)
  return new Request('http://x/api/assets/upload', { method: 'POST', body: form })
}

async function post(files: File[], uploadToken: string | null) {
  const res = await route.POST(request(files, uploadToken))
  return { status: res.status, body: (await res.json()) as UploadBody }
}

async function del(uploadToken: string) {
  const res = await route.DELETE(
    new Request(`http://x/api/assets/upload?token=${uploadToken}`, { method: 'DELETE' }),
  )
  return { status: res.status, body: (await res.json()) as { revoked?: number } }
}

/** One turn of the event loop, the unit every wait in this file is built from —
 * a duration would be a guess about how long a request takes. */
function turn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

/**
 * Offsets a cancellation by `count` event-loop turns — the ordering where the
 * cancel arrives before its upload has claimed the token.
 *
 * Every offset used below lands there, and by a wide margin: sweeping a storm's
 * cancels across 0…960 turns, the claim was still ahead of the cancel at 60
 * turns and behind it at 120. An upload has to parse its multipart body and
 * write its bytes before it reaches `withState`, while a cancel goes straight
 * there. So these offsets spread ordering 1 across the storm and nothing else;
 * the orderings *after* the claim are reached by `awaitRow`, which observes the
 * claim rather than guessing at how many turns it takes.
 */
async function turns(count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) await turn()
}

/* ------------------------------------------------------------------ *
 * The invariant
 * ------------------------------------------------------------------ */

async function persisted() {
  const raw = await fs.readFile(path.join(root, '.data', 'workspace.json'), 'utf8')
  return JSON.parse(raw) as import('@/server/store').WorkspaceState
}

/**
 * Resolves once the upload's row is in the persisted document, which is the one
 * observable proof that the request has already claimed its token. A cancel
 * fired from here therefore lands *after* the claim — the ordering the turn
 * offsets never reach — so the revocation assertions below have a row to be
 * about instead of an empty list to pass over.
 */
async function awaitRow(name: string): Promise<void> {
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    if ((await persisted()).assets.some((asset) => asset.name === name)) return
    await turn()
  }
  throw new Error(`row for ${name} never reached the document`)
}

function uploadDirs(): Promise<string[]> {
  return fs
    .readdir(path.join(store.MEDIA_DIR, 'uploads'))
    .then((names) => names.sort())
    .catch(() => [])
}

function fileOf(asset: Asset): string {
  return path.join(store.MEDIA_DIR, decodeURIComponent(asset.url.replace('/api/media/', '')))
}

function exists(target: string): Promise<boolean> {
  return fs.stat(target).then(
    () => true,
    () => false,
  )
}

interface RowAudit {
  name: string
  state: Asset['state']
  /** The `upl_…` directory the row's url points into. */
  directory: string
  bytes: boolean
}

/**
 * Every upload row the persisted document holds, paired with whether its bytes
 * are actually there. Read back from disk rather than from the in-memory cache,
 * so a state that was never persisted cannot pass.
 */
async function audit(): Promise<RowAudit[]> {
  const rows = (await persisted()).assets.filter((asset) =>
    asset.url.startsWith('/api/media/uploads/'),
  )
  return Promise.all(
    rows.map(async (row) => ({
      name: row.name,
      state: row.state,
      directory: path.basename(path.dirname(fileOf(row))),
      bytes: await exists(fileOf(row)),
    })),
  )
}

/**
 * The whole point of the suite. Run after every storm rather than once at the
 * end, so a violation names the storm that produced it.
 */
async function expectNoPartialStates(label: string): Promise<RowAudit[]> {
  const rows = await audit()
  for (const row of rows) {
    // A committed row is library content: the listing offers it and /api/media
    // has to be able to serve it.
    if (row.state === 'committed') expect(row.bytes, `${label} · committed ${row.name}`).toBe(true)
    // The converse — the half a torn commit would break.
    if (!row.bytes) expect(row.state, `${label} · byteless ${row.name}`).not.toBe('committed')
    // Revocation takes the bytes with it, whichever side of the commit it hit.
    if (row.state === 'revoked') expect(row.bytes, `${label} · revoked ${row.name}`).toBe(false)
    // Every request has answered by the time this runs, so quarantine has to be
    // empty: a surviving `staging` row is a request that died mid-flight.
    expect(row.state, `${label} · quarantined ${row.name}`).not.toBe('staging')
  }
  return rows
}

/* ------------------------------------------------------------------ *
 * Memory probe
 * ------------------------------------------------------------------ */

/**
 * V8 only exposes `gc()` under a flag the test runner is not started with, so
 * it is turned on for the length of the call. Without it, "retained" and "not
 * collected yet" are indistinguishable and the measurement says nothing.
 */
function gcHook(): (() => void) | null {
  const exposed = (globalThis as { gc?: () => void }).gc
  if (typeof exposed === 'function') return exposed
  try {
    v8.setFlagsFromString('--expose-gc')
    const fn = vm.runInNewContext('gc') as unknown
    v8.setFlagsFromString('--no-expose-gc')
    return typeof fn === 'function' ? (fn as () => void) : null
  } catch {
    return null
  }
}

/**
 * Payload copies live in `ArrayBuffer`s, whose backing stores `heapUsed` does
 * not count — a probe reading only the heap would report a flat line while
 * hundreds of megabytes of request bodies sat in memory. Both are recorded, and
 * `total` is what the process actually has to find.
 */
function usage() {
  const m = process.memoryUsage()
  return { heapUsed: m.heapUsed, arrayBuffers: m.arrayBuffers, total: m.heapUsed + m.arrayBuffers }
}

/** Samples on event-loop turns, so the peak is read while requests are parked
 * on disk I/O rather than only at the two ends of a batch. */
function sampler() {
  let live = true
  let peak = 0
  let samples = 0
  const tick = () => {
    if (!live) return
    peak = Math.max(peak, usage().total)
    samples += 1
    setImmediate(tick)
  }
  setImmediate(tick)
  return {
    stop() {
      live = false
      return { peak, samples }
    },
  }
}

/** Collects until the accounting stops moving. Freeing an `ArrayBuffer`'s
 * backing store can trail the collection that made it unreachable, so a single
 * pass reports garbage as retention. */
async function quiesce(gc: (() => void) | null) {
  let previous = Number.POSITIVE_INFINITY
  for (let pass = 0; pass < 8; pass += 1) {
    gc?.()
    await turn()
    const now = usage().total
    if (!gc || now >= previous) break
    previous = now
  }
  return usage()
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function delta(bytes: number): string {
  return `${bytes < 0 ? '-' : '+'}${mb(Math.abs(bytes))}`
}

/* ------------------------------------------------------------------ */

describe('batch cap under load', () => {
  it('accepts a request at the cap and rejects one over it as a whole', async () => {
    const atCap = Array.from({ length: assets.MAX_UPLOAD_FILES }, (_, i) =>
      upload(png(2048), `cap-${i}.png`),
    )
    const accepted = await post(atCap, token())
    expect(accepted.status).toBe(200)
    expect(accepted.body.assets).toHaveLength(assets.MAX_UPLOAD_FILES)

    // One file past the cap. The refusal has to be of the request, not of the
    // last file: a partially honoured batch would leave the client believing it
    // uploaded a set it never did.
    const before = await uploadDirs()
    const overCap = Array.from({ length: assets.MAX_UPLOAD_FILES + 1 }, (_, i) =>
      upload(png(2048), `over-${i}.png`),
    )
    const refused = await post(overCap, token())
    expect(refused.status).toBe(400)
    expect(refused.body.assets).toBeUndefined()

    // Not one byte of the refused batch reached the disk, and no row was filed.
    expect(await uploadDirs()).toEqual(before)
    expect((await persisted()).assets.some((a) => a.name.startsWith('over-'))).toBe(false)
    await expectNoPartialStates('batch cap')
  })
})

describe('concurrent uploads', () => {
  it('keeps every row consistent with its bytes across a storm', async () => {
    const CONCURRENCY = 48
    const SIZE = 96 * 1024

    // A tenth of the storm is a payload the metadata gate cannot see through:
    // declared PNG, GIF on the wire. Those are staged, persisted as `staging`,
    // then killed by the content gate — the exact path that would leave a row
    // without bytes if the commit failed to splice it out.
    const bad = new Set([4, 13, 22, 31, 40])

    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        post(
          [bad.has(i) ? upload(GIF, `storm-bad-${i}.png`) : upload(png(SIZE), `storm-${i}.png`)],
          token(),
        ),
      ),
    )

    for (const [i, result] of results.entries()) expect(result.status, `request ${i}`).toBe(200)
    expect(results.filter((r) => r.body.assets?.length === 1)).toHaveLength(CONCURRENCY - bad.size)
    expect(results.filter((r) => r.body.rejected?.length === 1)).toHaveLength(bad.size)

    const rows = await expectNoPartialStates('concurrent uploads')
    // The mislabelled payloads left neither a row nor a directory behind.
    expect(rows.some((row) => row.name.startsWith('storm-bad-'))).toBe(false)
    const committed = rows.filter(
      (row) => row.name.startsWith('storm-') && row.state === 'committed',
    )
    expect(committed).toHaveLength(CONCURRENCY - bad.size)
  })
})

describe('cancellation interleaved with a storm', () => {
  it('holds the same invariant however the cancels land', async () => {
    const TOTAL = 36
    const plan = Array.from({ length: TOTAL }, (_, i) => ({
      name: `mixed-${i}.png`,
      tok: token(),
      // Two thirds are cancelled, one third either side of the claim: `early`
      // fires at a turn offset and always beats the claim, `late` waits for the
      // row to appear and therefore never does — it lands somewhere between the
      // claim and the end of the commit, which side being up to the machine.
      // (Pinning it strictly inside the content gate needs a hook on the gate's
      // own disk call; that is upload-cancel-adversarial.test.ts's job, not a
      // storm's.) The remaining third is the control that has to survive the
      // storm untouched.
      mode: (['early', 'late', 'keep'] as const)[i % 3],
      offset: (i % 12) * 3,
    }))

    const responses = await Promise.all(
      plan.flatMap((item) => [
        post([upload(png(48 * 1024), item.name)], item.tok),
        ...(item.mode === 'keep'
          ? []
          : [
              (item.mode === 'early' ? turns(item.offset) : awaitRow(item.name)).then(() =>
                del(item.tok),
              ),
            ]),
      ]),
    )
    for (const [i, response] of responses.entries()) {
      expect(response.status, `response ${i}`).toBe(200)
    }

    const afterStorm = await expectNoPartialStates('cancel storm')
    for (const item of plan) {
      const rows = afterStorm.filter((row) => row.name === item.name)
      if (item.mode === 'keep') {
        // Nothing ever named these tokens, so they are ordinary library content.
        expect(rows.map((row) => row.state), item.name).toEqual(['committed'])
      } else if (item.mode === 'late') {
        // The cancel is known to have landed after the claim, so the row exists
        // and revocation is the only end state it may hold. Stated as an
        // equality rather than a loop over whatever happens to be there: this
        // is the case that has to fail if a commit ever outruns a tombstone.
        expect(rows.map((row) => row.state), item.name).toEqual(['revoked'])
      } else {
        // Either the cancel beat the claim and no row was ever filed, or it did
        // not and the row is revoked. Never committed, never holding bytes.
        for (const row of rows) expect(row.state, item.name).toBe('revoked')
      }
    }

    // Third wave: cancel the control set, which is now fully committed library
    // content — the one ordering neither cohort above can produce.
    const survivors = plan.filter((item) => item.mode === 'keep')
    const revoked = await Promise.all(survivors.map((item) => del(item.tok)))
    for (const result of revoked) expect(result.body.revoked).toBe(1)

    const settled = await expectNoPartialStates('late cancel')
    for (const item of survivors) {
      expect(
        settled.filter((row) => row.name === item.name).map((row) => row.state),
        item.name,
      ).toEqual(['revoked'])
    }
  })

  /**
   * The one thing a cancel racing the content gate can still break.
   *
   * `inspect` guards its `fs.stat` and turns a missing payload into a per-file
   * rejection, but every I/O after that — the read, the rewrite and the restat
   * on the SVG path — is unguarded. A cancel that removes the upload directory
   * inside that window therefore does not produce "上传已取消" for the file: it
   * throws out of `validateStaged`, past the route, and `handle` answers 500.
   * The row is left `staging` with no bytes until `sweepAbandonedStaging`
   * collects it five minutes later, so the library is never wrong — but the
   * client is told the server broke, for something it asked for itself.
   *
   * Provoked with an unreadable file rather than by racing, because the window
   * is a few hundred microseconds wide and a test that waited for it would be a
   * coin toss. The failure mode is the same: any errno after the stat escapes.
   */
  it('lets an I/O failure after the gate stat escape as a crash, not a rejection', async () => {
    const staged = await assets.stageUploads(
      [new File([SCRIPTED_SVG], 'gate.svg', { type: 'image/svg+xml' })],
      { namespace: 'personal', folderId: null },
    )
    const item = staged.staged[0]
    await fs.chmod(item.file, 0o000)

    // Root ignores the mode bits, and so do some filesystems; there the probe
    // would assert nothing, so it stands down rather than passing vacuously.
    const enforced = await fs.readFile(item.file).then(
      () => false,
      () => true,
    )
    if (enforced) {
      await expect(assets.validateStaged(staged.staged)).rejects.toThrow(/EACCES/)
    }

    await fs.chmod(item.file, 0o600).catch(() => undefined)
    await assets.discardStaged(staged.staged)
    expect(await exists(item.directory)).toBe(false)
  })
})

describe('memory under concurrent uploads', () => {
  /**
   * The open question the backlog records, measured rather than asserted.
   *
   * Two batches of identical request count and different payload size go
   * through the real handler. If ingestion streamed, the peak would be a
   * function of the request count alone and the two would look alike. They do
   * not: on this machine the marginal cost is roughly 3.5–4 bytes of process
   * memory per byte in flight — the multipart body, the parsed `File`, the
   * `arrayBuffer()` copy and the write buffer all coexist — on top of a fixed
   * ~14MB of allocation churn per batch of 16 requests.
   *
   * The consequence, which nothing in the code currently prevents: one request
   * may legally carry MAX_UPLOAD_FILES × MAX_UPLOAD_BYTES = 2.5GB, and nothing
   * caps how many such requests are in flight at once. At the ratio measured
   * here that is several gigabytes of peak memory for a single request, and
   * unbounded across many. The per-file and per-request caps are not a memory
   * bound.
   */
  it('reports how peak and retained memory track the bytes pushed through', async () => {
    const gc = gcHook()
    const CONCURRENCY = 16
    const SMALL = 32 * 1024
    const LARGE = 2 * 1024 * 1024
    const report: string[] = []
    const measured: Record<
      number,
      { bytes: number; peak: number; retained: number; retainedBuffers: number }
    > = {}

    // Unmeasured: the first multipart parses of the process pay for compiling
    // and warming the parser, which would otherwise land on the small batch and
    // read as payload cost.
    await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        route.POST(request([upload(png(SMALL), `warmup-${i}.png`)], token())),
      ),
    )

    for (const size of [SMALL, LARGE]) {
      // Built before the baseline is taken: the fixtures' own bytes are what a
      // client holds, not what the server allocates in order to receive them.
      const requests = Array.from({ length: CONCURRENCY }, (_, i) =>
        request([upload(png(size), `mem-${size}-${i}.png`)], token()),
      )
      const bytes = CONCURRENCY * size

      const before = await quiesce(gc)
      const probe = sampler()
      const responses = await Promise.all(requests.map((req) => route.POST(req)))
      const { peak, samples } = probe.stop()
      expect(samples, 'the probe never got a turn to sample').toBeGreaterThan(0)
      for (const res of responses) expect(res.status).toBe(200)

      const after = await quiesce(gc)
      measured[size] = {
        bytes,
        peak: peak - before.total,
        retained: after.total - before.total,
        retainedBuffers: after.arrayBuffers - before.arrayBuffers,
      }
      report.push(
        `${CONCURRENCY}×${mb(size)} = ${mb(bytes)} in flight → ` +
          `peak ${delta(peak - before.total)} (${((peak - before.total) / bytes).toFixed(2)}× payload), ` +
          `retained ${delta(after.total - before.total)} ` +
          `(buffers ${delta(after.arrayBuffers - before.arrayBuffers)}), ` +
          `heap ${mb(before.heapUsed)}→${mb(after.heapUsed)}, ${samples} samples`,
      )
    }

    const small = measured[SMALL]
    const large = measured[LARGE]
    const marginal = (large.peak - small.peak) / (large.bytes - small.bytes)
    // Printed, not asserted: the numbers are the deliverable of this case.
    console.info(
      `upload memory (gc ${gc ? 'forced' : 'UNAVAILABLE — retained figures include uncollected garbage'}):\n  ` +
        `${report.join('\n  ')}\n  marginal peak cost ${marginal.toFixed(2)} bytes of memory per byte in flight`,
    )

    await expectNoPartialStates('memory probe')

    // Asserted, because it has to hold whatever ingestion does with a payload
    // in flight: nothing keeps it afterwards. Stated as a difference between
    // two batches of equal request count, so the legitimate fixed cost of the
    // extra rows in the state document cancels out instead of being budgeted
    // for by a threshold.
    //
    // Split in two because the two halves of the accounting have wildly
    // different resolutions. Repeating this measurement ten times against an
    // implementation deliberately made to keep a slice of every payload:
    //
    //   component     clean spread   1% leak   5% leak
    //   arrayBuffers  -14KB … 0KB    +323KB    +1613KB
    //   heapUsed      -285KB … +19KB  ±noise    ±noise
    //
    // A retained payload lands in the first row and is invisible in the second,
    // so the buffer budget is what actually has teeth. At 1% of the increment it
    // sits twenty times above the clean spread and still fails on a leak of a
    // little over one uploaded byte in a hundred: measured against the leaking
    // build, 5% fails by 5× and 1% slips through by 7KB. The heap budget stays
    // loose on purpose — it only has to catch a copy kept somewhere
    // `arrayBuffers` cannot see, and 285KB of drift makes anything tighter flaky.
    if (gc) {
      const extra = large.bytes - small.bytes
      expect(large.retainedBuffers - small.retainedBuffers).toBeLessThan(extra * 0.01)
      expect(large.retained - small.retained).toBeLessThan(extra * 0.05)
    }

    // Not asserted against a number — only against the shape. Peak tracks the
    // bytes in flight rather than the request count, which is the finding above.
    expect(large.peak).toBeGreaterThan(small.peak)
  })

  /**
   * Why that peak scales, pinned deterministically rather than by measurement:
   * there is no streaming path. `stageUploads` asks each `File` for its entire
   * contents as one buffer before the first byte is written, so peak memory is
   * a function of payload size and concurrency and of nothing else.
   *
   * This is a characterisation of today's design. When ingestion learns to
   * stream (`file.stream()` piped to a write stream), this is the case that
   * will fail — update it and the numbers above rather than deleting it.
   */
  it('materialises each payload whole before writing, with no streaming path', async () => {
    const bytes = png(512 * 1024)
    let wholeBufferRequests = 0
    let streamRequests = 0

    const probe = {
      name: 'probe.png',
      type: 'image/png',
      size: bytes.byteLength,
      arrayBuffer: async () => {
        wholeBufferRequests += 1
        return bytes.buffer
      },
      stream: () => {
        streamRequests += 1
        throw new Error('stageUploads is not expected to reach for a stream')
      },
    } as unknown as File

    const staged = await assets.stageUploads([probe], { namespace: 'personal', folderId: null })
    expect(staged.staged).toHaveLength(1)
    expect((await fs.stat(staged.staged[0].file)).size).toBe(bytes.byteLength)

    expect(wholeBufferRequests).toBe(1)
    expect(streamRequests).toBe(0)

    // None of this is meant to survive into the library, and the hygiene case
    // below counts every directory on disk.
    await assets.discardStaged(staged.staged)
    expect(await exists(staged.staged[0].directory)).toBe(false)
  })
})

describe('directory hygiene after the storms', () => {
  it('leaves exactly the directories the surviving rows point at', async () => {
    const rows = await expectNoPartialStates('final')
    const owned = new Set(
      rows.filter((row) => row.state === 'committed').map((row) => row.directory),
    )
    // Equality both ways: a directory nothing points at is leaked disk, and a
    // row pointing at a missing directory is content that cannot be served.
    expect(await uploadDirs()).toEqual([...owned].sort())
  })
})
