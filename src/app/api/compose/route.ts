import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ids, newId } from '@/domain/ids'
import type { Artifact, Asset } from '@/domain/types'
import {
  composeTimeline,
  type ComposeFailureCode,
  type SubtitleMode,
  type TimelineClip,
  type TimelineSpec,
  type TimelineSubtitle,
  type TransitionId,
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

export interface ComposeResponse {
  artifact: Artifact
  assetId: string
  subtitleMode: SubtitleMode
  notes: string[]
}

export async function POST(request: Request) {
  return handle(async (): Promise<ComposeResponse> => {
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

    return { artifact, assetId, subtitleMode: result.subtitleMode, notes: result.notes }
  })
}

/* ------------------------------------------------------------------ *
 * Request parsing
 *
 * Shape only — every value-level rule (trim window, speed, subtitle range)
 * belongs to `validateTimeline` so the route and the tests agree on it.
 * ------------------------------------------------------------------ */

const TRANSITION_IDS: TransitionId[] = ['fade', 'to-black', 'to-white']

function readSpec(body: unknown): TimelineSpec {
  if (typeof body !== 'object' || body === null) throw new HttpError(400, '请求体格式不正确')
  const raw = body as { clips?: unknown; subtitles?: unknown }

  if (!Array.isArray(raw.clips)) throw new HttpError(400, '缺少片段列表')
  const rawSubtitles: unknown[] = raw.subtitles === undefined ? [] : asArray(raw.subtitles, '字幕列表')

  const clips: TimelineClip[] = raw.clips.map((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new HttpError(400, `第 ${index + 1} 个片段格式不正确`)
    }
    const clip = entry as Record<string, unknown>
    const transition = clip.transitionAfter
    // Rejected rather than coerced to null: silently turning an unrecognised
    // transition into a hard cut would ship the wrong film without saying so.
    if (transition !== null && transition !== undefined && !TRANSITION_IDS.includes(transition as TransitionId)) {
      throw new HttpError(400, `第 ${index + 1} 个片段使用了不支持的转场`)
    }
    return {
      url: typeof clip.url === 'string' ? clip.url : '',
      inPoint: Number(clip.inPoint),
      outPoint: Number(clip.outPoint),
      speed: clip.speed === undefined ? 1 : Number(clip.speed),
      transitionAfter: (transition as TransitionId | null | undefined) ?? null,
    }
  })

  const subtitles: TimelineSubtitle[] = rawSubtitles.map((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new HttpError(400, `第 ${index + 1} 条字幕格式不正确`)
    }
    const subtitle = entry as Record<string, unknown>
    return {
      text: typeof subtitle.text === 'string' ? subtitle.text : '',
      start: Number(subtitle.start),
      end: Number(subtitle.end),
    }
  })

  return { clips, subtitles }
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new HttpError(400, `${label}格式不正确`)
  return value
}
