import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import type { Artifact } from '@/domain/types'
import { MODELS_BY_ID } from '@/domain/models'
import { fixtureForInvocation } from '@/domain/jobs'
import { hashString, mulberry32, renderArtSvg, renderWav } from './art'
import type { GenerationProvider, ProviderHandle, ProviderSubmitRequest } from './provider'

/**
 * Built-in offline provider.
 *
 * It produces genuine files (SVG stills, WAV audio, and MP4 video when ffmpeg
 * is present) on a simulated latency curve so that every downstream surface —
 * progress, artifacts, storyboard projection, asset registration, ledger
 * settlement — runs its real code path with no external dependency and no cost.
 *
 * Replace it by registering a real `GenerationProvider` with the same model
 * ids; `providerFor()` prefers the most recently registered match.
 */

interface MockRun {
  handle: ProviderHandle
  startedAt: number
  durationMs: number
  request: ProviderSubmitRequest
  cancelled: boolean
  outcome: 'succeed' | 'fail' | 'compliance' | 'cancelled'
  artifacts: Omit<Artifact, 'id' | 'jobId' | 'assetId' | 'createdAt'>[] | null
  error: string | null
}

const runs = new Map<string, MockRun>()

const RESOLUTION_PIXELS: Record<string, number> = {
  '1K': 1024,
  '2K': 2048,
  '4K': 3840,
  adaptive: 1280,
  '480p': 854,
  '720p': 1280,
  '1080p': 1920,
}

export function dimensionsFor(spec: ProviderSubmitRequest['spec']): { width: number; height: number } {
  const match = /^(\d+):(\d+)$/.exec(spec.output.aspectRatio ?? '')
  const ratio = match && Number(match[2]) > 0 ? Number(match[1]) / Number(match[2]) : 16 / 9
  // Cap the long edge so mock artifacts stay small on disk.
  const longEdge = Math.min(RESOLUTION_PIXELS[spec.output.resolution ?? '2K'] ?? 1280, 1536)
  if (ratio >= 1) {
    return { width: longEdge, height: Math.round(longEdge / ratio) }
  }
  return { width: Math.round(longEdge * ratio), height: longEdge }
}

async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable
  ffmpegAvailable = await new Promise<boolean>((resolve) => {
    const child = spawn('ffmpeg', ['-version'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
  return ffmpegAvailable
}
let ffmpegAvailable: boolean | null = null

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-400)}`))
    })
  })
}

/**
 * Renders a short clip with ffmpeg's own synthetic sources: a drifting
 * gradient field textured with a blurred cellular-automaton layer. ffmpeg
 * cannot read SVG, so the still renderer is not reused here — the poster
 * beside the clip carries the caption instead.
 */
async function renderVideo(
  dir: string,
  base: string,
  seed: string,
  width: number,
  height: number,
  durationSeconds: number,
): Promise<{ ok: true; file: string } | { ok: false }> {
  if (!(await hasFfmpeg())) return { ok: false }

  const fps = 12
  const baseHue = hashString(seed) % 360

  try {
    const file = path.join(dir, `${base}.mp4`)
    await run('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `gradients=s=${width}x${height}:d=${durationSeconds}:speed=0.06:c0=0x${hslHex(baseHue, 0.55, 0.24)}:c1=0x${hslHex((baseHue + 55) % 360, 0.6, 0.55)}:x0=${Math.round(width * 0.3)}:y0=${Math.round(height * 0.2)}`,
      '-f',
      'lavfi',
      '-i',
      `life=s=${Math.max(64, Math.round(width / 8))}x${Math.max(36, Math.round(height / 8))}:mold=10:r=${fps}:ratio=0.12:death_color=0x${hslHex((baseHue + 180) % 360, 0.4, 0.2)}:life_color=0x${hslHex((baseHue + 30) % 360, 0.7, 0.7)}:d=${durationSeconds}`,
      '-filter_complex',
      `[1:v]scale=${width}:${height},boxblur=12:2,format=yuva420p,colorchannelmixer=aa=0.28[tex];[0:v][tex]overlay=0:0,format=yuv420p[v]`,
      '-map',
      '[v]',
      '-t',
      String(durationSeconds),
      '-r',
      String(fps),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      file,
    ])
    return { ok: true, file }
  } catch {
    return { ok: false }
  }
}

function hslHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1))
    return Math.round(255 * color)
  }
  return [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')
}

async function produce(request: ProviderSubmitRequest): Promise<
  Omit<Artifact, 'id' | 'jobId' | 'assetId' | 'createdAt'>[]
> {
  const { spec, workspaceDir, publicPrefix, invocationId } = request
  const model = MODELS_BY_ID.get(spec.modelId)
  const media = model?.media ?? 'image'
  const count = spec.output.count ?? 1
  const caption = spec.prompt || spec.nodeType
  await fs.mkdir(workspaceDir, { recursive: true })

  const artifacts: Omit<Artifact, 'id' | 'jobId' | 'assetId' | 'createdAt'>[] = []

  for (let i = 0; i < count; i += 1) {
    const seed = `${invocationId}:${i}`
    const base = `${invocationId}-${i}`

    if (media === 'audio') {
      const duration = spec.output.durationSeconds ?? Math.min(30, Math.max(3, Math.round(caption.length / 6)))
      const wav = renderWav(seed, duration)
      await fs.writeFile(path.join(workspaceDir, `${base}.wav`), wav)
      const poster = renderArtSvg({ width: 640, height: 640, seed, caption, badge: '音频' })
      await fs.writeFile(path.join(workspaceDir, `${base}-poster.svg`), poster, 'utf8')
      artifacts.push({
        kind: 'audio',
        url: `${publicPrefix}/${base}.wav`,
        thumbnailUrl: `${publicPrefix}/${base}-poster.svg`,
        width: null,
        height: null,
        durationSeconds: duration,
        modelId: spec.modelId,
      })
      continue
    }

    if (media === 'text') {
      const text = draftText(spec.prompt, seed)
      await fs.writeFile(path.join(workspaceDir, `${base}.txt`), text, 'utf8')
      artifacts.push({
        kind: 'text',
        url: `${publicPrefix}/${base}.txt`,
        thumbnailUrl: null,
        width: null,
        height: null,
        durationSeconds: null,
        modelId: spec.modelId,
        textContent: text,
      })
      continue
    }

    const { width, height } = dimensionsFor(spec)

    if (media === 'video') {
      const duration = spec.output.durationSeconds ?? 5
      const poster = renderArtSvg({ width, height, seed, caption, badge: `${duration}s` })
      await fs.writeFile(path.join(workspaceDir, `${base}-poster.svg`), poster, 'utf8')
      const encoded = await renderVideo(workspaceDir, base, seed, width, height, duration)
      artifacts.push({
        kind: 'video',
        // Falls back to the poster when no encoder is available, so the UI
        // still receives a valid, displayable URL.
        url: encoded.ok ? `${publicPrefix}/${base}.mp4` : `${publicPrefix}/${base}-poster.svg`,
        thumbnailUrl: `${publicPrefix}/${base}-poster.svg`,
        width,
        height,
        durationSeconds: duration,
        modelId: spec.modelId,
      })
      continue
    }

    const svg = renderArtSvg({ width, height, seed, caption })
    await fs.writeFile(path.join(workspaceDir, `${base}.svg`), svg, 'utf8')
    artifacts.push({
      kind: 'image',
      url: `${publicPrefix}/${base}.svg`,
      thumbnailUrl: `${publicPrefix}/${base}.svg`,
      width,
      height,
      durationSeconds: null,
      modelId: spec.modelId,
    })
  }

  return artifacts
}

function draftText(prompt: string, seed: string): string {
  const rand = mulberry32(hashString(seed))
  const beats = ['起', '承', '转', '合']
  const lines = beats.map((beat, i) => {
    const seconds = 3 + Math.floor(rand() * 5)
    return `${i + 1}. [${beat}] ${seconds}s — ${prompt.slice(0, 40) || '场景'}的第${i + 1}个节拍。`
  })
  return `${prompt}\n\n${lines.join('\n')}\n`
}

export const mockProvider: GenerationProvider = {
  id: 'mock-offline',

  supports() {
    // Claims everything, so the app is fully usable out of the box. A real
    // provider registered later shadows it for the models it declares.
    return true
  },

  async submit(request) {
    // Idempotent on invocationId: re-submitting returns the in-flight handle.
    const existing = runs.get(request.invocationId)
    if (existing) return existing.handle

    const model = MODELS_BY_ID.get(request.spec.modelId)
    const media = model?.media ?? 'image'
    const baseMs = { image: 2600, video: 6200, audio: 2000, text: 1600 }[media]
    const rand = mulberry32(hashString(request.invocationId))

    // The fixture is encoded in invocationId by the runner, so it survives a
    // refresh without relying on an in-memory scenario table.
    const fixture = fixtureForInvocation(request.invocationId)
    if (fixture === 'network_offline') {
      throw new Error('本地网络连接已断开（generation fixture: network_offline）')
    }
    const outcome: MockRun['outcome'] = fixture === 'failed'
      ? 'fail'
      : fixture === 'compliance_blocked'
        ? 'compliance'
        : fixture === 'cancelled'
          ? 'cancelled'
          : 'succeed'

    const handle: ProviderHandle = {
      providerId: this.id,
      invocationId: request.invocationId,
      remoteJobId: `mock_${request.invocationId}`,
    }

    const run: MockRun = {
      handle,
      startedAt: Date.now(),
      durationMs: baseMs + rand() * baseMs * 0.6,
      request,
      cancelled: false,
      outcome,
      artifacts: null,
      error: null,
    }
    runs.set(request.invocationId, run)

    if (outcome === 'succeed') {
      // Start rendering immediately; poll() reports progress meanwhile.
      produce(request)
        .then((artifacts) => {
          run.artifacts = artifacts
        })
        .catch((error: unknown) => {
          run.outcome = 'fail'
          run.error = error instanceof Error ? error.message : String(error)
        })
    }

    return handle
  },

  async poll(handle) {
    const run = runs.get(handle.invocationId)
    if (!run) return { state: 'failed', error: '任务句柄已失效' }
    if (run.cancelled) return { state: 'cancelled' }

    const elapsed = Date.now() - run.startedAt
    const ratio = Math.min(1, elapsed / run.durationMs)

    if (ratio < 1) {
      return { state: 'running', progress: Math.round(ratio * 92) }
    }

    if (run.outcome === 'fail') {
      return { state: 'failed', error: run.error ?? '生成失败，请调整提示词后重试' }
    }
    if (run.outcome === 'cancelled') {
      return { state: 'cancelled' }
    }
    if (run.outcome === 'compliance') {
      return { state: 'compliance_blocked', error: '素材未通过人像合规校验，请更换参考图后重试' }
    }
    if (!run.artifacts) {
      // Encoding still in flight — hold at 95% rather than reporting success.
      return { state: 'running', progress: 95 }
    }
    return { state: 'succeeded', artifacts: run.artifacts }
  },

  async cancel(handle) {
    const run = runs.get(handle.invocationId)
    if (run) run.cancelled = true
  },
}

export function __resetMockProvider() {
  runs.clear()
}
