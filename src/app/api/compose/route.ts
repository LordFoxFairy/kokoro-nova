import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  ComposeRequestSchema,
  ComposeResponseSchema,
  type ComposeContractResponse,
} from '@/contracts/compose'
import { ids, newId } from '@/domain/ids'
import type { Artifact, Asset } from '@/domain/types'
import {
  composeTimeline,
  type ComposeFailureCode,
  type TimelineSpec,
} from '@/server/compose'
import { MEDIA_PUBLIC_PREFIX } from '@/server/generation/runner'
import { HttpError, handle } from '@/server/http'
import { DEFAULT_SPACE_ID, MEDIA_DIR, withState } from '@/server/store'

export const dynamic = 'force-dynamic'
/** Kept above RENDER_TIMEOUT_MS so the encoder's own deadline is the one that fires. */
export const maxDuration = 120

/**
 * 视频合成 — turns a clip-editor timeline into one real MP4.
 *
 * The render is synchronous on purpose: it is local ffmpeg work measured in
 * seconds, and a job record would buy nothing but a polling loop. What it does
 * need is a ceiling, so the encoder is given a budget shorter than any sane
 * proxy timeout and the caller gets a sentence instead of a hung socket.
 */
const RENDER_TIMEOUT_MS = 90_000

const COMPOSITE_ROOT = 'composites'

/** A local composite has no model behind it; this keeps the audit field honest. */
const COMPOSE_MODEL_ID = 'local-compose'

const STATUS_BY_CODE: Record<ComposeFailureCode, number> = {
  invalid_spec: 400,
  source_missing: 404,
  ffmpeg_missing: 503,
  render_failed: 500,
  timeout: 504,
}

export async function POST(request: Request) {
  return handle(async (): Promise<ComposeContractResponse> => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new HttpError(400, '请求体不是合法 JSON')
    }

    const spec = readSpec(body)
    const directory = path.join(MEDIA_DIR, COMPOSITE_ROOT, newId('cmp'))

    const result = await composeTimeline(spec, directory, { timeoutMs: RENDER_TIMEOUT_MS })
    if (!result.ok) {
      // Nothing usable was produced, so the directory is litter.
      await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined)
      throw new HttpError(STATUS_BY_CODE[result.code], result.reason)
    }

    const publicPrefix = `${MEDIA_PUBLIC_PREFIX}/${COMPOSITE_ROOT}/${path.basename(directory)}`
    const createdAt = new Date().toISOString()
    const artifactId = ids.artifact()
    const assetId = ids.asset()

    const artifact: Artifact = {
      id: artifactId,
      // Composites are not produced by a generation job; the sentinel mirrors
      // the `asset-library` one the canvas already uses for job-less artifacts.
      jobId: 'compose',
      kind: 'video',
      url: `${publicPrefix}/${path.basename(result.outputPath)}`,
      thumbnailUrl: result.posterPath ? `${publicPrefix}/${path.basename(result.posterPath)}` : null,
      width: result.width,
      height: result.height,
      durationSeconds: result.durationSeconds,
      createdAt,
      modelId: COMPOSE_MODEL_ID,
      assetId,
    }

    // The bytes are already durable under MEDIA_DIR; the library row is what
    // keeps them reachable after the dialog closes without an export.
    const asset: Asset = {
      id: assetId,
      spaceId: DEFAULT_SPACE_ID,
      namespace: 'personal',
      kind: 'video',
      name: `合成视频 ${createdAt.slice(11, 19)}`,
      url: artifact.url,
      thumbnailUrl: artifact.thumbnailUrl,
      width: artifact.width,
      height: artifact.height,
      durationSeconds: artifact.durationSeconds,
      byteSize: result.byteSize,
      tags: [],
      folderId: null,
      // Produced by the platform from material already inside it, so there is
      // nothing left to quarantine.
      state: 'committed',
      createdAt,
      sourceArtifactId: artifactId,
    }

    await withState((state) => {
      state.assets.push(asset)
    })

    return ComposeResponseSchema.parse({
      artifact,
      assetId,
      subtitleMode: result.subtitleMode,
      notes: result.notes,
    })
  })
}

/* ------------------------------------------------------------------ *
 * Request parsing
 *
 * Shape only — every value-level rule (trim window, speed, subtitle range)
 * belongs to `validateTimeline` so the route and the tests agree on it.
 * ------------------------------------------------------------------ */

function readSpec(body: unknown): TimelineSpec {
  const parsed = ComposeRequestSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue.path.length > 0 ? `${issue.path.join('.')}：` : ''
    throw new HttpError(400, `${where}${issue.message}`)
  }
  return parsed.data
}
