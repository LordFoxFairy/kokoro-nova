import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ids, newId } from '@/domain/ids'
import type { Asset, AssetKind, AssetNamespace } from '@/domain/types'
import { MEDIA_PUBLIC_PREFIX } from './generation/runner'
import { sanitizeSvg } from './svg-sanitize'
import { DEFAULT_SPACE_ID, MEDIA_DIR, type WorkspaceState } from './store'

/**
 * Upload ingestion.
 *
 * Uploaded bytes are not library assets yet. They walk the STAGING → COMMITTED
 * half of the asset lifecycle: the payload lands in its own directory and the
 * row is persisted as `staging`, then a content gate decides whether it may
 * join the library. Only a committed row is reachable as an asset; a rejected
 * one is dropped together with its bytes, so the library can never list
 * something that cannot be fetched.
 *
 * What is *not* probed: WebP and SVG dimensions (both need a real decoder or a
 * viewBox/units parse to be trustworthy) and the duration of video and audio,
 * which needs a demuxer. Those stay null and the UI already renders assets
 * without them.
 */

/** Per file. Above this a single request can exhaust the process heap, because
 * `Request.formData()` buffers every part before a handler ever sees it. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

/** Mirrors the asset library's batch cap, so anything that can be uploaded in
 * one go can also be selected and operated on in one go afterwards. */
export const MAX_UPLOAD_FILES = 50

/** Leading slice kept in memory per file for the content gate. */
const HEADER_BYTES = 64 * 1024

/** Longest sanitised filename, in code points. CJK names cost 3 bytes each, so
 * this stays clear of the 255-byte limit common to ext4/APFS. */
const FILENAME_MAX = 64

const FALLBACK_BASENAME = 'upload'

/** Every upload directory hangs off this one, so a sweep of abandoned staging
 * rows never has to walk the generation artifacts. */
const UPLOAD_ROOT = 'uploads'

/** How long a `staging` row may sit unresolved before it counts as debris. The
 * content gate runs inside the same request, milliseconds after the row is
 * written, so a row this old only exists because that request never finished. */
const STAGING_TTL_MS = 5 * 60 * 1000

/** Reported per file when a cancel beat the commit. */
export const UPLOAD_CANCELLED_REASON = '上传已取消'

interface AllowedType {
  kind: AssetKind
  /** Canonical extension; the client's own extension is never trusted. */
  extension: string
}

export const ALLOWED_UPLOAD_TYPES: Record<string, AllowedType> = {
  'image/png': { kind: 'image', extension: '.png' },
  'image/jpeg': { kind: 'image', extension: '.jpg' },
  'image/webp': { kind: 'image', extension: '.webp' },
  'image/svg+xml': { kind: 'image', extension: '.svg' },
  'video/mp4': { kind: 'video', extension: '.mp4' },
  'video/webm': { kind: 'video', extension: '.webm' },
  'audio/wav': { kind: 'audio', extension: '.wav' },
  'audio/mpeg': { kind: 'audio', extension: '.mp3' },
}

/** Browsers and operating systems disagree on a handful of legacy type strings;
 * the allowlist keys stay canonical and everything else is folded onto them. */
const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'audio/wave': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
}

export function normaliseMimeType(raw: string): string {
  const base = (raw ?? '').split(';')[0].trim().toLowerCase()
  return MIME_ALIASES[base] ?? base
}

export function isAllowedUploadType(raw: string): boolean {
  return normaliseMimeType(raw) in ALLOWED_UPLOAD_TYPES
}

/* ------------------------------------------------------------------ *
 * Validation gate — pure, and the single authority on what may land
 * ------------------------------------------------------------------ */

export interface UploadCandidate {
  name: string
  type: string
  size: number
}

export interface UploadRejection {
  name: string
  reason: string
}

/**
 * Metadata gate. Runs before a single byte is written, so a file that fails
 * here never exists on disk at all.
 */
export function rejectionFor(candidate: UploadCandidate): string | null {
  if (!Number.isFinite(candidate.size) || candidate.size <= 0) return '文件为空'
  if (candidate.size > MAX_UPLOAD_BYTES) {
    return `文件超过 ${formatMegabytes(MAX_UPLOAD_BYTES)} 上限`
  }
  if (!isAllowedUploadType(candidate.type)) {
    return `不接受的文件类型${candidate.type ? `：${candidate.type}` : ''}`
  }
  return null
}

/**
 * Strips the filename down to something that can only ever name a file inside
 * its own upload directory.
 */
export function sanitiseFilename(raw: string, mimeType: string): string {
  const extension = ALLOWED_UPLOAD_TYPES[normaliseMimeType(mimeType)]?.extension ?? '.bin'

  // Only the last segment can name a file, which is also what defeats `../`:
  // everything before the final separator is discarded rather than resolved.
  const segment = (raw ?? '').split(/[\\/]/).pop() ?? ''
  // Control bytes are dropped by code point rather than by a regex class, so no
  // literal control character ever has to appear in this source file.
  const printable = Array.from(segment.replace(/\.[^.]*$/, ''))
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0
      return code > 0x1f && code !== 0x7f
    })
    .join('')
  const base = printable
    // Reserved on Windows and ambiguous inside a URL path.
    .replace(/[<>:"|?*#%]/g, '')
    .replace(/\s+/g, '-')
    // A leading dot hides the file; a leading dash reads as a flag to any tool
    // that later touches the directory.
    .replace(/^[.\-]+/, '')
    .trim()

  const safe = base || FALLBACK_BASENAME
  // Sliced by code point: cutting a surrogate pair in half would leave an
  // unpaired unit in a path that has to round-trip through a URL.
  const kept = Array.from(safe).slice(0, FILENAME_MAX - extension.length).join('')
  return `${kept || FALLBACK_BASENAME}${extension}`
}

/**
 * Magic-byte sniff. A declared type the content contradicts is the cheapest
 * way to catch both a mislabelled picker and a deliberately renamed payload.
 */
export function sniffMimeType(header: Uint8Array): string | null {
  if (header.length >= 8 && matches(header, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png'
  }
  if (header.length >= 3 && matches(header, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (header.length >= 12 && ascii(header, 0, 4) === 'RIFF') {
    const form = ascii(header, 8, 4)
    if (form === 'WEBP') return 'image/webp'
    if (form === 'WAVE') return 'audio/wav'
  }
  // The `ftyp` box is required to come first in a conforming MP4.
  if (header.length >= 12 && ascii(header, 4, 4) === 'ftyp') return 'video/mp4'
  if (header.length >= 4 && matches(header, 0, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm'
  if (header.length >= 3 && ascii(header, 0, 3) === 'ID3') return 'audio/mpeg'
  // Frame sync: 11 set bits opening an MPEG audio frame.
  if (header.length >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0) return 'audio/mpeg'

  // SVG is text, so it is recognised by its root element rather than a prefix —
  // an XML prolog, a doctype or comments may precede it.
  const text = ascii(header, 0, Math.min(header.length, 2048))
  if (/<svg[\s>]/i.test(text)) return 'image/svg+xml'

  return null
}

/* ------------------------------------------------------------------ *
 * Header probes
 * ------------------------------------------------------------------ */

export interface ImageSize {
  width: number
  height: number
}

/** Dimensions straight out of the file header. PNG and JPEG only — see the
 * module note for what the other accepted types would cost. */
export function readImageSize(bytes: Uint8Array, mimeType: string): ImageSize | null {
  const type = normaliseMimeType(mimeType)
  if (type === 'image/png') return readPngSize(bytes)
  if (type === 'image/jpeg') return readJpegSize(bytes)
  return null
}

function readPngSize(bytes: Uint8Array): ImageSize | null {
  // IHDR is mandated to be the first chunk, so the dimensions sit at a fixed
  // offset and no chunk walk is needed.
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null
  const view = viewOf(bytes)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  return width > 0 && height > 0 ? { width, height } : null
}

function readJpegSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const view = viewOf(bytes)
  let offset = 2

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      // Fill bytes are legal between segments; resync instead of giving up.
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    if (marker === 0xff) {
      offset += 1
      continue
    }
    // Standalone markers carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2
      continue
    }
    const length = view.getUint16(offset + 2)
    if (length < 2) return null

    // SOF0..SOF15 carry the frame header; DHT, JPG and DAC share the range and
    // do not, so they are skipped like any other segment.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (offset + 9 > bytes.length) return null
      const height = view.getUint16(offset + 5)
      const width = view.getUint16(offset + 7)
      return width > 0 && height > 0 ? { width, height } : null
    }
    offset += 2 + length
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Staging — bytes on disk, row not yet in the library
 * ------------------------------------------------------------------ */

export interface StagedUpload {
  asset: Asset
  /** Owns exactly one payload, so removing it removes every trace of the upload. */
  directory: string
  file: string
  /** Retained for the content gate; the payload itself is released after the write. */
  header: Uint8Array
  declaredType: string
}

export interface StageOptions {
  namespace: AssetNamespace
  folderId: string | null
}

export interface StageOutcome {
  staged: StagedUpload[]
  rejected: UploadRejection[]
}

export async function stageUploads(files: File[], options: StageOptions): Promise<StageOutcome> {
  const staged: StagedUpload[] = []
  const rejected: UploadRejection[] = []

  for (const file of files) {
    const reason = rejectionFor({ name: file.name, type: file.type, size: file.size })
    if (reason) {
      rejected.push({ name: file.name, reason })
      continue
    }

    const declaredType = normaliseMimeType(file.type)
    const allowed = ALLOWED_UPLOAD_TYPES[declaredType]
    const filename = sanitiseFilename(file.name, declaredType)
    // One directory per upload: two files named alike cannot collide, and a
    // rejected upload is cleaned up by removing a directory nothing else owns.
    const directory = path.join(MEDIA_DIR, UPLOAD_ROOT, newId('upl'))
    const target = path.join(directory, filename)

    // Belt and braces over the sanitiser: whatever the client sent, the write
    // has to land inside the directory created for it.
    if (path.dirname(path.resolve(target)) !== path.resolve(directory)) {
      rejected.push({ name: file.name, reason: '文件名不合法' })
      continue
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    try {
      await fs.mkdir(directory, { recursive: true })
      await fs.writeFile(target, bytes)
    } catch {
      // A half-written payload must not outlive the attempt that produced it.
      await discard(directory)
      rejected.push({ name: file.name, reason: '文件写入失败' })
      continue
    }

    const url = publicUrl(directory, filename)
    staged.push({
      asset: {
        id: ids.asset(),
        spaceId: DEFAULT_SPACE_ID,
        namespace: options.namespace,
        kind: allowed.kind,
        name: filename,
        url,
        // Images are their own preview; a poster for video or audio would need
        // an encoder, which upload does not get to depend on.
        thumbnailUrl: allowed.kind === 'image' ? url : null,
        width: null,
        height: null,
        durationSeconds: null,
        byteSize: bytes.byteLength,
        tags: [],
        folderId: options.folderId,
        state: 'staging',
        createdAt: new Date().toISOString(),
        sourceArtifactId: null,
      },
      directory,
      file: target,
      header: bytes.slice(0, HEADER_BYTES),
      declaredType,
    })
  }

  return { staged, rejected }
}

/** Removes the payloads of staged rows that will never reach the state
 * document, so a request that gives up after writing bytes leaves nothing. */
export async function discardStaged(staged: StagedUpload[]): Promise<void> {
  for (const item of staged) await discard(item.directory)
}

/* ------------------------------------------------------------------ *
 * Cancellation tickets
 * ------------------------------------------------------------------ */

/**
 * Cancelling an upload has to beat a commit that may already be under way, and
 * until the response arrives the client has no id to name the upload by — the
 * very response it is about to abandon. So the client mints the name itself and
 * sends it with the bytes; every row staged under that token stays reachable
 * from a later cancel.
 *
 * Ordering is settled by `withState`, which funnels every read-modify-write
 * through one serialised chain. Relative to that chain a cancel can land in
 * exactly three places, and all three end with the row revoked and the bytes
 * deleted:
 *
 *   1. Before the upload claims its token. A check-then-act loses precisely
 *      here — there is nothing to check yet — so the cancel writes the
 *      tombstone regardless of whether it found rows. `claimUploadTicket` then
 *      refuses and the request discards its own bytes without ever persisting
 *      a row.
 *   2. After the claim, before the commit. The cancel revokes the `staging`
 *      rows and removes their bytes; the commit that follows reads the same
 *      tombstone and refuses to promote anything.
 *   3. After the commit. The rows are `committed`, so the cancel revokes them
 *      and removes their bytes exactly as a withdrawal from the library would.
 *
 * There is no fourth ordering: nothing here mutates state outside the chain, so
 * a cancel "during" a commit is not observable — it is ordered either side of
 * it. Revoking rather than splicing keeps the convention the rest of the asset
 * surface relies on: artifacts and canvas nodes hold asset ids, so the row has
 * to stay resolvable even though its bytes are gone.
 */

/** Opaque to the server, which only ever uses it as a lookup key — never as a
 * path segment — so shape and length are the whole of the validation. */
const UPLOAD_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/

/** How long a ticket outlives its request, so a cancel that arrives late still
 * finds it. An order of magnitude past the staging window, which puts it well
 * beyond any request that could still be running. */
const TICKET_TTL_MS = 30 * 60 * 1000

export interface UploadTicket {
  token: string
  /** Rows staged under this token — the only rows a cancel may ever touch. */
  assetIds: string[]
  createdAt: string
  /** Set the moment a cancel lands, even if there was nothing to revoke yet. */
  cancelledAt: string | null
}

/*
 * `WorkspaceState` is owned by src/server/store.ts and closed to this feature,
 * so tickets ride along on the persisted object under a key attached at
 * runtime — the same arrangement asset folders use. A document written before
 * this existed simply has no key, hence the array is materialised on first use.
 */
type TicketCarrier = WorkspaceState & { uploadTickets?: UploadTicket[] }

function ensureTickets(state: WorkspaceState): UploadTicket[] {
  const carrier = state as TicketCarrier
  if (!Array.isArray(carrier.uploadTickets)) carrier.uploadTickets = []
  return carrier.uploadTickets
}

export function isUploadToken(value: unknown): value is string {
  return typeof value === 'string' && UPLOAD_TOKEN_PATTERN.test(value)
}

export type TicketClaim = 'claimed' | 'cancelled' | 'conflict'

/**
 * Binds the staged rows to the token. Mutates state, so it belongs inside
 * `withState` — in the same turn that persists those rows, which is what makes
 * "cancelled before the claim" and "cancelled after it" the only two outcomes.
 */
export function claimUploadTicket(
  state: WorkspaceState,
  token: string,
  assetIds: string[],
): TicketClaim {
  const table = ensureTickets(state)
  const existing = table.find((ticket) => ticket.token === token)
  if (!existing) {
    table.push({
      token,
      assetIds: [...assetIds],
      createdAt: new Date().toISOString(),
      cancelledAt: null,
    })
    return 'claimed'
  }
  if (existing.cancelledAt) return 'cancelled'
  // A token names one request. Letting a second one bind fresh rows to it would
  // put those rows at the mercy of whoever else holds the token.
  return 'conflict'
}

/**
 * Withdraws everything filed under the token and records the tombstone, so a
 * commit that lands afterwards refuses too. The disk work runs inside the
 * caller's `withState` turn, which is exactly what keeps the two atomic against
 * a concurrent commit.
 */
export async function cancelUpload(state: WorkspaceState, token: string): Promise<number> {
  const table = ensureTickets(state)
  let ticket = table.find((entry) => entry.token === token)
  if (!ticket) {
    // Ordering 1: the upload has not claimed the token yet, and may not even
    // have reached the server. The tombstone is the whole point of the write.
    ticket = { token, assetIds: [], createdAt: new Date().toISOString(), cancelledAt: null }
    table.push(ticket)
  }
  ticket.cancelledAt = new Date().toISOString()
  return revokeTicketRows(state, ticket)
}

async function revokeTicketRows(state: WorkspaceState, ticket: UploadTicket): Promise<number> {
  const named = new Set(ticket.assetIds)
  let revoked = 0

  for (const asset of state.assets) {
    if (!named.has(asset.id)) continue
    // The bytes go even though the row stays: nothing will serve them again,
    // and an upload directory holds the only copy.
    const directory = uploadDirectoryOf(asset.url)
    if (directory) await discard(directory)
    if (asset.state !== 'revoked') {
      asset.state = 'revoked'
      revoked += 1
    }
  }

  return revoked
}

/**
 * Drops tickets past their TTL. Mutates state, so it belongs inside
 * `withState`. Callers cancelling a token should sweep *after* the cancel, so
 * the tombstone they just wrote is not the one collected.
 */
export function sweepUploadTickets(state: WorkspaceState, now: number = Date.now()): number {
  const table = ensureTickets(state)
  // NaN fails every comparison, so an unreadable timestamp is kept rather than
  // collected on a guess — the same rule `sweepAbandonedStaging` follows.
  const kept = table.filter((ticket) => !(now - Date.parse(ticket.createdAt) > TICKET_TTL_MS))
  const dropped = table.length - kept.length
  if (dropped > 0) (state as TicketCarrier).uploadTickets = kept
  return dropped
}

/* ------------------------------------------------------------------ *
 * Content gate + commit
 * ------------------------------------------------------------------ */

export interface UploadDecision {
  staged: StagedUpload
  /** Null once the payload passed the gate. */
  reason: string | null
  size: ImageSize | null
}

/**
 * Judges what actually landed, not what was promised, and deletes everything it
 * rejects. Runs after the staging rows are persisted so an interrupted upload
 * is distinguishable from one that never started.
 */
export async function validateStaged(staged: StagedUpload[]): Promise<UploadDecision[]> {
  const decisions: UploadDecision[] = []

  for (const item of staged) {
    const reason = await inspect(item)
    if (reason) {
      await discard(item.directory)
      decisions.push({ staged: item, reason, size: null })
      continue
    }
    decisions.push({ staged: item, reason: null, size: readImageSize(item.header, item.declaredType) })
  }

  return decisions
}

async function inspect(item: StagedUpload): Promise<string | null> {
  let onDisk: number
  try {
    onDisk = (await fs.stat(item.file)).size
  } catch {
    return '文件未能保存'
  }
  if (onDisk !== item.asset.byteSize) return '文件写入不完整'
  if (onDisk > MAX_UPLOAD_BYTES) return `文件超过 ${formatMegabytes(MAX_UPLOAD_BYTES)} 上限`

  const sniffed = sniffMimeType(item.header)
  if (!sniffed) return '无法识别的文件内容'
  if (sniffed !== item.declaredType) return `文件内容与类型不符：识别为 ${sniffed}`

  if (item.declaredType === 'image/svg+xml') {
    const text = await fs.readFile(item.file, 'utf8')
    const sanitized = sanitizeSvg(text)
    if (!sanitized.ok) return `SVG 未通过安全清洗：${sanitized.reason}`

    // Store the rebuilt document, never the original bytes. Detecting hostile
    // markup is a losing game — `<svg:script>` and entity-encoded schemes both
    // slip past pattern matching — so what lands on disk is only ever what the
    // allowlist serialiser produced.
    if (sanitized.svg !== text) {
      await fs.writeFile(item.file, sanitized.svg, 'utf8')
      const rewritten = await fs.stat(item.file)
      // byteSize is what the library reports and what the media route serves.
      item.asset.byteSize = rewritten.size
    }
  }

  return null
}

export interface UploadResult {
  assets: Asset[]
  rejected: UploadRejection[]
}

/**
 * Flips the survivors to `committed` and drops the rows whose bytes were just
 * deleted. Mutates the live workspace state, so it belongs inside `withState`.
 *
 * The token is read here rather than before the content gate because that is
 * the last instant at which a cancel can still be observed: everything after
 * this turn of the write chain is already library content. A caller that sends
 * no token simply cannot cancel — see the cancellation-ticket note above.
 */
export async function commitUploads(
  state: WorkspaceState,
  decisions: UploadDecision[],
  token?: string | null,
): Promise<UploadResult> {
  const ticket = token ? ensureTickets(state).find((entry) => entry.token === token) : undefined
  if (ticket?.cancelledAt) {
    // Ordering 2: the cancel arrived while the content gate was running. It has
    // already revoked what existed; repeating it covers the rows this commit
    // would otherwise have promoted, and `discard` is safe to run twice.
    await revokeTicketRows(state, ticket)
    return {
      assets: [],
      rejected: decisions.map((decision) => ({
        name: decision.staged.asset.name,
        reason: UPLOAD_CANCELLED_REASON,
      })),
    }
  }

  const assets: Asset[] = []
  const rejected: UploadRejection[] = []

  for (const decision of decisions) {
    const row = state.assets.find((a) => a.id === decision.staged.asset.id)
    if (!row) continue

    if (decision.reason) {
      state.assets = state.assets.filter((a) => a.id !== row.id)
      rejected.push({ name: row.name, reason: decision.reason })
      continue
    }

    if (decision.size) {
      row.width = decision.size.width
      row.height = decision.size.height
    }
    row.state = 'committed'
    assets.push(row)
  }

  return { assets, rejected }
}

/**
 * Reconciles quarantine against reality.
 *
 * A row reaches `staging` on disk before the content gate runs, so a process
 * that dies in between leaves a row nobody will ever resolve — and the asset
 * listing has no reason to hide it, which would put ungated bytes in the
 * library. Every later upload settles that debt first. Mutates state, so it
 * belongs inside `withState`.
 */
export async function sweepAbandonedStaging(
  state: WorkspaceState,
  now: number = Date.now(),
): Promise<number> {
  // `Date.parse` of a malformed timestamp yields NaN, and NaN fails every
  // comparison — an unreadable row is left alone rather than deleted on a guess.
  const stale = state.assets.filter(
    (asset) => asset.state === 'staging' && now - Date.parse(asset.createdAt) > STAGING_TTL_MS,
  )
  if (stale.length === 0) return 0

  for (const asset of stale) {
    const directory = uploadDirectoryOf(asset.url)
    if (directory) await discard(directory)
  }
  const dropped = new Set(stale.map((asset) => asset.id))
  state.assets = state.assets.filter((asset) => !dropped.has(asset.id))
  return stale.length
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Recovers the private directory behind a url `stageUploads` minted. Returns
 * null for anything else, so a sweep can only ever delete its own layout. */
function uploadDirectoryOf(url: string): string | null {
  const prefix = `${MEDIA_PUBLIC_PREFIX}/${UPLOAD_ROOT}/`
  if (!url.startsWith(prefix)) return null
  const id = url.slice(prefix.length).split('/')[0]
  if (!/^upl_[0-9a-z]+$/.test(id)) return null
  return path.join(MEDIA_DIR, UPLOAD_ROOT, id)
}

/** Reuses the generation runner's prefix so uploads are served by the same
 * media route, and move to signed object storage with everything else. */
function publicUrl(directory: string, filename: string): string {
  return `${MEDIA_PUBLIC_PREFIX}/${UPLOAD_ROOT}/${path.basename(directory)}/${encodeURIComponent(filename)}`
}

async function discard(directory: string) {
  await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined)
}

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`
}

function matches(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte)
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = ''
  for (let i = offset; i < offset + length && i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i])
  }
  return out
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}
