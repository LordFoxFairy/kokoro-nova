import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { MEDIA_DIR } from './store'
import { MEDIA_PUBLIC_PREFIX } from './generation/runner'

/**
 * Timeline compositor.
 *
 * The clip editor models an ordered list of trimmed, re-timed clips with an
 * optional transition at each junction plus a subtitle track. This module turns
 * that model into one real MP4 through a single ffmpeg filter graph, so the
 * arithmetic that decides where a crossfade starts lives in one place and is
 * testable without a browser.
 *
 * Everything that can go wrong is returned, never thrown: the caller is an HTTP
 * route that has to turn a failure into a sentence a user can act on, and a
 * missing encoder is an environment fact rather than a bug.
 */

/* ------------------------------------------------------------------ *
 * Spec
 * ------------------------------------------------------------------ */

/** Mirrors `TRANSITIONS` in src/domain/libraries.ts. */
export type TransitionId = 'fade' | 'to-black' | 'to-white'

export interface TimelineClip {
  /** Public media URL of the source artifact, exactly as stored on it. */
  url: string
  /** Trim window inside the source, in source seconds. */
  inPoint: number
  outPoint: number
  /** Playback rate; 2 halves the clip's contribution to the timeline. */
  speed: number
  /** Transition into the *next* clip. Ignored on the last clip. */
  transitionAfter: TransitionId | null
}

export interface TimelineSubtitle {
  text: string
  /** Seconds on the composed timeline, not on the source clip. */
  start: number
  end: number
}

export interface TimelineSpec {
  clips: TimelineClip[]
  subtitles: TimelineSubtitle[]
}

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

export type ComposeFailureCode =
  | 'invalid_spec'
  | 'source_missing'
  | 'ffmpeg_missing'
  | 'render_failed'
  | 'timeout'

/**
 * How the subtitle track survived into the file.
 * - `burned`: rasterised into the pixels by `drawtext`.
 * - `muxed`: a real timed-text track (`mov_text`) with the same timestamps,
 *   used when the local ffmpeg has no text renderer compiled in.
 */
export type SubtitleMode = 'burned' | 'muxed' | 'none'

export interface ComposeSuccess {
  ok: true
  outputPath: string
  /** Poster frame lifted from the composed video; null if it could not be made. */
  posterPath: string | null
  durationSeconds: number
  width: number
  height: number
  byteSize: number
  subtitleMode: SubtitleMode
  /** Human-readable degradations, in Chinese, safe to show to the user. */
  notes: string[]
}

export interface ComposeFailure {
  ok: false
  code: ComposeFailureCode
  reason: string
}

export type ComposeResult = ComposeSuccess | ComposeFailure

/* ------------------------------------------------------------------ *
 * Limits
 *
 * These exist so a malformed or hostile spec is rejected by arithmetic instead
 * of by an encoder that would happily burn a core for an hour.
 * ------------------------------------------------------------------ */

export const MAX_CLIPS = 40
export const MAX_SUBTITLES = 100
export const MIN_SPEED = 0.25
export const MAX_SPEED = 4
export const MIN_CLIP_SECONDS = 0.05
export const MAX_TIMELINE_SECONDS = 300
export const DEFAULT_RENDER_TIMEOUT_MS = 120_000

/** Nominal transition length; shrunk when a neighbouring clip is too short. */
const TRANSITION_SECONDS = 0.5
/** Below this a crossfade is indistinguishable from a cut, so we cut. */
const MIN_TRANSITION_SECONDS = 0.08

const OUTPUT_LONG_EDGE_CAP = 1920
const FALLBACK_WIDTH = 1280
const FALLBACK_HEIGHT = 720
const FALLBACK_FPS = 24

const XFADE_BY_TRANSITION: Record<TransitionId, string> = {
  fade: 'fade',
  'to-black': 'fadeblack',
  'to-white': 'fadewhite',
}

const OUTPUT_BASENAME = 'composite'

/* ------------------------------------------------------------------ *
 * Trust boundary: media URL → path on disk
 * ------------------------------------------------------------------ */

/**
 * Resolve a public media URL back to the file behind it.
 *
 * The spec arrives from the browser, so a clip URL is attacker-controlled and
 * is about to become an ffmpeg input path. Anything that is not a well-formed
 * URL under the media prefix, or that resolves outside MEDIA_DIR, returns null
 * — the same rule the media route enforces before it reads bytes.
 */
export function resolveMediaPath(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0) return null

  const prefix = `${MEDIA_PUBLIC_PREFIX}/`
  if (!url.startsWith(prefix)) return null

  const relative = url.slice(prefix.length)
  // A query or fragment never appears on a minted media URL, and allowing one
  // would only widen what has to be reasoned about here.
  if (relative.length === 0 || relative.includes('?') || relative.includes('#')) return null
  if (relative.includes('\0') || relative.includes('\\')) return null

  const segments: string[] = []
  for (const raw of relative.split('/')) {
    // `publicUrl` in src/server/assets.ts percent-encodes the filename, so the
    // check has to run on the decoded segment or `%2e%2e` would sail through.
    let segment: string
    try {
      segment = decodeURIComponent(raw)
    } catch {
      return null
    }
    if (segment.length === 0 || segment === '.' || segment === '..') return null
    if (segment.includes('/') || segment.includes('\\') || segment.includes('\0')) return null
    segments.push(segment)
  }

  const root = path.resolve(MEDIA_DIR)
  const absolute = path.resolve(root, segments.join(path.sep))
  if (!absolute.startsWith(root + path.sep)) return null
  return absolute
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export interface TimelineMeasurement {
  /** Per-clip contribution to the timeline, after trim and speed. */
  clipDurations: number[]
  /** Upper bound: transitions only ever overlap clips, never lengthen them. */
  totalSeconds: number
}

export type ValidationResult =
  | ({ ok: true } & TimelineMeasurement)
  | { ok: false; reason: string }

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Reject a spec that could not produce a sane render, with the reason a user
 * needs. Runs entirely on the spec — no filesystem, no ffmpeg.
 */
export function validateTimeline(spec: TimelineSpec): ValidationResult {
  if (!spec || !Array.isArray(spec.clips)) return { ok: false, reason: '时间线数据格式不正确' }
  const subtitles = Array.isArray(spec.subtitles) ? spec.subtitles : []

  if (spec.clips.length === 0) return { ok: false, reason: '时间线为空，请先添加片段' }
  if (spec.clips.length > MAX_CLIPS) {
    return { ok: false, reason: `片段数量超过上限（最多 ${MAX_CLIPS} 个）` }
  }
  if (subtitles.length > MAX_SUBTITLES) {
    return { ok: false, reason: `字幕数量超过上限（最多 ${MAX_SUBTITLES} 条）` }
  }

  const clipDurations: number[] = []
  for (let i = 0; i < spec.clips.length; i += 1) {
    const clip = spec.clips[i]
    const at = `第 ${i + 1} 个片段`
    if (!clip || typeof clip.url !== 'string') return { ok: false, reason: `${at}缺少素材地址` }
    if (!finite(clip.inPoint) || !finite(clip.outPoint)) {
      return { ok: false, reason: `${at}的裁切点不是有效数值` }
    }
    if (clip.inPoint < 0) return { ok: false, reason: `${at}的入点不能为负` }
    if (clip.outPoint - clip.inPoint < MIN_CLIP_SECONDS) {
      return { ok: false, reason: `${at}的出点必须大于入点至少 ${MIN_CLIP_SECONDS} 秒` }
    }
    if (!finite(clip.speed) || clip.speed < MIN_SPEED || clip.speed > MAX_SPEED) {
      return { ok: false, reason: `${at}的倍速需要在 ${MIN_SPEED}× 到 ${MAX_SPEED}× 之间` }
    }
    if (
      clip.transitionAfter !== null &&
      clip.transitionAfter !== undefined &&
      !(clip.transitionAfter in XFADE_BY_TRANSITION)
    ) {
      return { ok: false, reason: `${at}使用了不支持的转场` }
    }
    clipDurations.push((clip.outPoint - clip.inPoint) / clip.speed)
  }

  const totalSeconds = clipDurations.reduce((sum, d) => sum + d, 0)
  if (totalSeconds > MAX_TIMELINE_SECONDS) {
    return { ok: false, reason: `合成时长超过上限（最多 ${MAX_TIMELINE_SECONDS} 秒）` }
  }

  for (let i = 0; i < subtitles.length; i += 1) {
    const subtitle = subtitles[i]
    const at = `第 ${i + 1} 条字幕`
    if (!subtitle || typeof subtitle.text !== 'string') return { ok: false, reason: `${at}缺少文本` }
    if (subtitle.text.trim().length === 0) return { ok: false, reason: `${at}的内容为空` }
    if (!finite(subtitle.start) || !finite(subtitle.end)) {
      return { ok: false, reason: `${at}的时间不是有效数值` }
    }
    if (subtitle.end <= subtitle.start) return { ok: false, reason: `${at}的结束时间必须晚于开始时间` }
    // A hair of tolerance: the editor derives the timeline length from the same
    // floats and would otherwise fail on its own rounding.
    if (subtitle.start < 0 || subtitle.end > totalSeconds + 0.001) {
      return { ok: false, reason: `${at}超出了 ${totalSeconds.toFixed(1)} 秒的时间线范围` }
    }
  }

  return { ok: true, clipDurations, totalSeconds }
}

/* ------------------------------------------------------------------ *
 * ffmpeg plumbing
 * ------------------------------------------------------------------ */

let binaryAvailable: Record<string, boolean | null> = { ffmpeg: null, ffprobe: null }

async function hasBinary(name: 'ffmpeg' | 'ffprobe'): Promise<boolean> {
  const cached = binaryAvailable[name]
  if (cached !== null) return cached
  const available = await new Promise<boolean>((resolve) => {
    const child = spawn(name, ['-version'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
  binaryAvailable[name] = available
  return available
}

/** Test helper: forget probed capabilities so a suite can re-detect them. */
export function __resetComposeCapabilities() {
  binaryAvailable = { ffmpeg: null, ffprobe: null }
  drawtextFont = undefined
}

interface RunOutcome {
  ok: boolean
  timedOut: boolean
  stderr: string
  stdout: string
}

function runProcess(
  command: string,
  args: string[],
  timeoutMs: number,
  captureStdout = false,
): Promise<RunOutcome> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', 'pipe'],
    })
    let stderr = ''
    let stdout = ''
    let timedOut = false
    let settled = false

    const timer = setTimeout(() => {
      timedOut = true
      // SIGKILL rather than SIGTERM: a wedged encoder that ignores the polite
      // signal would keep the request hanging past its own deadline.
      child.kill('SIGKILL')
    }, timeoutMs)

    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok, timedOut, stderr, stdout })
    }

    child.stderr?.on('data', (chunk) => {
      // Only the tail matters; ffmpeg's banner would otherwise dominate.
      stderr = (stderr + String(chunk)).slice(-4000)
    })
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.on('error', () => finish(false))
    child.on('close', (code) => finish(code === 0))
  })
}

interface ProbeResult {
  width: number | null
  height: number | null
  fps: number | null
  durationSeconds: number | null
  hasAudio: boolean
}

async function probe(file: string, timeoutMs: number): Promise<ProbeResult | null> {
  if (!(await hasBinary('ffprobe'))) return null
  const result = await runProcess(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,width,height,r_frame_rate:format=duration',
      '-of',
      'json',
      file,
    ],
    timeoutMs,
    true,
  )
  if (!result.ok) return null

  try {
    const parsed = JSON.parse(result.stdout) as {
      streams?: { codec_type?: string; width?: number; height?: number; r_frame_rate?: string }[]
      format?: { duration?: string }
    }
    const streams = parsed.streams ?? []
    const video = streams.find((s) => s.codec_type === 'video')
    const duration = Number(parsed.format?.duration)
    return {
      width: typeof video?.width === 'number' ? video.width : null,
      height: typeof video?.height === 'number' ? video.height : null,
      fps: parseFrameRate(video?.r_frame_rate),
      durationSeconds: Number.isFinite(duration) ? duration : null,
      hasAudio: streams.some((s) => s.codec_type === 'audio'),
    }
  } catch {
    return null
  }
}

function parseFrameRate(value: string | undefined): number | null {
  if (!value) return null
  const [num, den] = value.split('/')
  const rate = Number(num) / (Number(den) || 1)
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

/* ------------------------------------------------------------------ *
 * Subtitle rendering capability
 * ------------------------------------------------------------------ */

/**
 * Fonts carrying CJK coverage come first: the UI is Chinese, and a Latin-only
 * face would burn in a row of tofu while reporting success.
 */
const FONT_CANDIDATES = [
  '/System/Library/Fonts/PingFang.ttc',
  '/System/Library/Fonts/STHeiti Medium.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc',
  '/System/Library/Fonts/Helvetica.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',
]

let drawtextFont: string | null | undefined

/**
 * Decide whether text can actually be burned in, by burning one frame of it.
 *
 * Reading `ffmpeg -filters` would only say whether the filter was compiled in;
 * it would still not say whether any font on this machine can be opened. The
 * probe runs the real filter with the real options, so a `true` here means the
 * production graph will link.
 */
async function findDrawtextFont(workDir: string): Promise<string | null> {
  if (drawtextFont !== undefined) return drawtextFont

  const sample = path.join(workDir, 'drawtext-probe.txt')
  await fs.writeFile(sample, '字幕 Aa', 'utf8')

  drawtextFont = null
  for (const font of FONT_CANDIDATES) {
    try {
      await fs.access(font)
    } catch {
      continue
    }
    const result = await runProcess(
      'ffmpeg',
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=64x64:d=0.1:r=10',
        '-vf',
        drawtextFilter(font, sample, 12, 64, 'between(t,0,1)'),
        '-frames:v',
        '1',
        '-f',
        'null',
        '-',
      ],
      8000,
    )
    if (result.ok) {
      drawtextFont = font
      break
    }
  }

  await fs.rm(sample, { force: true }).catch(() => undefined)
  return drawtextFont
}

/**
 * `textfile=` rather than `text=`: subtitle content is user input, and routing
 * it through a file removes every escaping question about quotes, colons,
 * backslashes and percent signs inside the filter graph.
 */
function drawtextFilter(
  font: string,
  textFile: string,
  fontSize: number,
  height: number,
  enable: string,
): string {
  const margin = Math.max(16, Math.round(height * 0.06))
  return [
    'drawtext=fontfile=' + quoteFilterValue(font),
    'textfile=' + quoteFilterValue(textFile),
    `fontsize=${fontSize}`,
    'fontcolor=white',
    'borderw=3',
    'bordercolor=black@0.9',
    'box=1',
    'boxcolor=black@0.35',
    'boxborderw=14',
    'x=(w-text_w)/2',
    `y=h-text_h-${margin}`,
    `enable='${enable}'`,
  ].join(':')
}

/** ffmpeg's filter parser treats `\` and `'` specially inside a quoted value. */
function quoteFilterValue(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function srtTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds)
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const secs = Math.floor(clamped % 60)
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000)
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(Math.min(999, millis), 3)}`
}

function buildSrt(subtitles: TimelineSubtitle[]): string {
  return (
    subtitles
      .slice()
      .sort((a, b) => a.start - b.start)
      .map((s, index) => {
        const text = s.text.replace(/\r\n/g, '\n').trim()
        return `${index + 1}\n${srtTimestamp(s.start)} --> ${srtTimestamp(s.end)}\n${text}\n`
      })
      .join('\n') + '\n'
  )
}

/* ------------------------------------------------------------------ *
 * Filter graph
 * ------------------------------------------------------------------ */

interface GraphTarget {
  width: number
  height: number
  fps: number
}

interface Graph {
  filter: string
  /** Label of the pad carrying the finished picture. */
  outLabel: string
  /** Duration the graph is expected to produce, before frame quantisation. */
  durationSeconds: number
  notes: string[]
}

/** Trims the trailing zeros ffmpeg would otherwise have to parse. */
function num(value: number): string {
  return String(Number(value.toFixed(3)))
}

function buildGraph(
  clips: TimelineClip[],
  clipDurations: number[],
  target: GraphTarget,
): Graph {
  const parts: string[] = []
  const notes: string[] = []

  clips.forEach((clip, i) => {
    parts.push(
      `[${i}:v]trim=start=${num(clip.inPoint)}:end=${num(clip.outPoint)},` +
        `setpts=(PTS-STARTPTS)/${num(clip.speed)},fps=${num(target.fps)},` +
        `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,` +
        `pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
        `setsar=1,format=yuv420p[c${i}]`,
    )
  })

  let label = 'c0'
  let duration = clipDurations[0]

  for (let i = 1; i < clips.length; i += 1) {
    const transition = clips[i - 1].transitionAfter
    const next = `x${i}`
    const clipDuration = clipDurations[i]
    // A crossfade eats into both neighbours, so it can never be longer than a
    // sane fraction of the shorter one — otherwise xfade runs past the end of
    // the accumulated stream and ffmpeg errors out.
    const span = Math.min(TRANSITION_SECONDS, duration * 0.4, clipDuration * 0.4)

    if (transition && span >= MIN_TRANSITION_SECONDS) {
      parts.push(
        `[${label}][c${i}]xfade=transition=${XFADE_BY_TRANSITION[transition]}:` +
          `duration=${num(span)}:offset=${num(duration - span)}[${next}]`,
      )
      duration = duration + clipDuration - span
    } else {
      if (transition) {
        notes.push(`第 ${i} 处转场两侧片段过短，已按硬切处理`)
      }
      parts.push(`[${label}][c${i}]concat=n=2:v=1:a=0[${next}]`)
      duration += clipDuration
    }
    label = next
  }

  return { filter: parts.join(';'), outLabel: label, durationSeconds: duration, notes }
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

export interface ComposeOptions {
  /** Wall-clock budget for the whole render, including probes. */
  timeoutMs?: number
}

export async function composeTimeline(
  spec: TimelineSpec,
  outputDir: string,
  options: ComposeOptions = {},
): Promise<ComposeResult> {
  const budgetMs = options.timeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS
  const startedAt = Date.now()
  const remaining = () => budgetMs - (Date.now() - startedAt)
  /** Pre-flight probes are cheap and must not be starved into returning null. */
  const probeBudget = () => Math.min(10_000, Math.max(500, remaining()))

  const validation = validateTimeline(spec)
  if (!validation.ok) return { ok: false, code: 'invalid_spec', reason: validation.reason }

  const sources: string[] = []
  for (let i = 0; i < spec.clips.length; i += 1) {
    const resolved = resolveMediaPath(spec.clips[i].url)
    if (!resolved) {
      return { ok: false, code: 'invalid_spec', reason: `第 ${i + 1} 个片段的素材地址不合法` }
    }
    sources.push(resolved)
  }

  // `resolveMediaPath` only proves the *textual* path stays under MEDIA_DIR — a
  // symlink sitting in the media tree satisfies that while pointing at any file
  // the server process can read. Containment is therefore re-checked after
  // dereferencing, and it is the dereferenced path that ffmpeg is handed.
  let mediaRoot: string
  try {
    mediaRoot = await fs.realpath(MEDIA_DIR)
  } catch {
    mediaRoot = path.resolve(MEDIA_DIR)
  }

  for (let i = 0; i < sources.length; i += 1) {
    let real: string
    try {
      real = await fs.realpath(sources[i])
      const stat = await fs.stat(real)
      if (!stat.isFile()) throw new Error('not a file')
    } catch {
      return { ok: false, code: 'source_missing', reason: `第 ${i + 1} 个片段的源文件已不存在` }
    }
    if (real !== mediaRoot && !real.startsWith(mediaRoot + path.sep)) {
      return { ok: false, code: 'invalid_spec', reason: `第 ${i + 1} 个片段的素材地址不合法` }
    }
    sources[i] = real
  }

  if (!(await hasBinary('ffmpeg'))) {
    return {
      ok: false,
      code: 'ffmpeg_missing',
      reason: '当前环境未安装 ffmpeg，无法进行视频合成',
    }
  }

  await fs.mkdir(outputDir, { recursive: true })

  const notes: string[] = []

  // One probe pass over every source: it fixes the output geometry, catches a
  // trim window that starts past the end of its clip (which would hand ffmpeg
  // an empty stream), and tells us whether any audio is about to be dropped.
  const probes = await Promise.all(sources.map((file) => probe(file, probeBudget())))

  const clips = spec.clips.map((clip) => ({ ...clip }))
  for (let i = 0; i < clips.length; i += 1) {
    const sourceDuration = probes[i]?.durationSeconds
    if (sourceDuration === null || sourceDuration === undefined) continue
    if (clips[i].inPoint >= sourceDuration) {
      return {
        ok: false,
        code: 'invalid_spec',
        reason: `第 ${i + 1} 个片段的入点超出了素材 ${sourceDuration.toFixed(1)} 秒的时长`,
      }
    }
    if (clips[i].outPoint > sourceDuration + 0.001) {
      notes.push(`第 ${i + 1} 个片段的出点超出素材时长，已裁至 ${sourceDuration.toFixed(1)} 秒`)
      clips[i].outPoint = sourceDuration
    }
  }
  if (probes.some((p) => p?.hasAudio)) {
    notes.push('合成结果不含音轨：时间线目前只编排画面')
  }

  // Recompute after clamping so the graph and the subtitle timings agree.
  const measured = validateTimeline({ clips, subtitles: spec.subtitles })
  if (!measured.ok) return { ok: false, code: 'invalid_spec', reason: measured.reason }

  const target = targetGeometry(probes[0])
  const graph = buildGraph(clips, measured.clipDurations, target)
  notes.push(...graph.notes)

  // `validateTimeline` bounds subtitles by the sum of the clips, which is what
  // the editor displays. Transitions overlap their neighbours, so the composed
  // film is shorter than that sum; anything hanging off the new end is pulled
  // back rather than left to address a frame that will not exist.
  const subtitles: TimelineSubtitle[] = []
  let subtitlesTrimmed = false
  for (const subtitle of spec.subtitles ?? []) {
    if (subtitle.text.trim().length === 0) continue
    if (subtitle.start >= graph.durationSeconds - MIN_TRANSITION_SECONDS) {
      subtitlesTrimmed = true
      continue
    }
    const end = Math.min(subtitle.end, graph.durationSeconds)
    if (end !== subtitle.end) subtitlesTrimmed = true
    subtitles.push({ ...subtitle, end })
  }
  if (subtitlesTrimmed) {
    notes.push(`转场重叠后成片为 ${graph.durationSeconds.toFixed(1)} 秒，超出部分的字幕已收拢`)
  }

  let subtitleMode: SubtitleMode = 'none'
  const tempFiles: string[] = []
  let filter = graph.filter
  let outLabel = graph.outLabel
  const extraInputs: string[] = []
  const extraMaps: string[] = []
  const subtitleCodec: string[] = []

  if (subtitles.length > 0) {
    const font = await findDrawtextFont(outputDir)
    if (font) {
      const fontSize = Math.max(16, Math.round(target.height * 0.055))
      const drawn: string[] = []
      for (let i = 0; i < subtitles.length; i += 1) {
        const file = path.join(outputDir, `subtitle-${i}.txt`)
        await fs.writeFile(file, subtitles[i].text.trim(), 'utf8')
        tempFiles.push(file)
        drawn.push(
          drawtextFilter(
            font,
            file,
            fontSize,
            target.height,
            `between(t,${num(subtitles[i].start)},${num(subtitles[i].end)})`,
          ),
        )
      }
      filter += `;[${outLabel}]${drawn.join(',')}[vsub]`
      outLabel = 'vsub'
      subtitleMode = 'burned'
    } else {
      // No text renderer in this build. A timed-text track keeps the words and
      // their timestamps inside the file rather than silently losing them.
      const srt = path.join(outputDir, `${OUTPUT_BASENAME}.srt`)
      await fs.writeFile(srt, buildSrt(subtitles), 'utf8')
      tempFiles.push(srt)
      extraInputs.push('-i', srt)
      extraMaps.push('-map', `${clips.length}:s`)
      subtitleCodec.push('-c:s', 'mov_text')
      subtitleMode = 'muxed'
      notes.push('当前 ffmpeg 未编译文字渲染滤镜，字幕已写入内嵌字幕轨而非烧录进画面')
    }
  }

  const outputPath = path.join(outputDir, `${OUTPUT_BASENAME}.mp4`)
  const args = [
    '-y',
    '-nostdin',
    '-v',
    'error',
    ...sources.flatMap((file) => ['-i', file]),
    ...extraInputs,
    '-filter_complex',
    filter,
    '-map',
    `[${outLabel}]`,
    ...extraMaps,
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    ...subtitleCodec,
    '-movflags',
    '+faststart',
    outputPath,
  ]

  const timedOut = (): ComposeFailure => ({
    ok: false,
    code: 'timeout',
    reason: `合成超时（超过 ${Math.round(budgetMs / 1000)} 秒），请缩短时间线后重试`,
  })

  const renderBudget = remaining()
  if (renderBudget <= 0) {
    await Promise.all(tempFiles.map((file) => fs.rm(file, { force: true }).catch(() => undefined)))
    return timedOut()
  }

  const render = await runProcess('ffmpeg', args, renderBudget)
  await Promise.all(tempFiles.map((file) => fs.rm(file, { force: true }).catch(() => undefined)))

  if (!render.ok) {
    await fs.rm(outputPath, { force: true }).catch(() => undefined)
    if (render.timedOut) return timedOut()
    return {
      ok: false,
      code: 'render_failed',
      reason: `合成失败：${lastMeaningfulLine(render.stderr)}`,
    }
  }

  let byteSize = 0
  try {
    byteSize = (await fs.stat(outputPath)).size
  } catch {
    return { ok: false, code: 'render_failed', reason: '合成失败：未生成输出文件' }
  }
  if (byteSize === 0) {
    await fs.rm(outputPath, { force: true }).catch(() => undefined)
    return { ok: false, code: 'render_failed', reason: '合成失败：输出文件为空' }
  }

  // What was actually produced, not what was asked for: frame quantisation and
  // the encoder's own rounding both move the answer.
  const produced = await probe(outputPath, probeBudget())
  if (!produced) notes.push('无法读取输出文件元数据，时长与分辨率为估算值')

  // The deliverable already exists, so the poster gets its own small budget
  // rather than whatever the encoder left behind.
  const posterPath = await renderPoster(outputPath, outputDir, 15_000)

  return {
    ok: true,
    outputPath,
    posterPath,
    durationSeconds: produced?.durationSeconds ?? graph.durationSeconds,
    width: produced?.width ?? target.width,
    height: produced?.height ?? target.height,
    byteSize,
    subtitleMode,
    notes,
  }
}

function targetGeometry(reference: ProbeResult | null): GraphTarget {
  let width = reference?.width ?? FALLBACK_WIDTH
  let height = reference?.height ?? FALLBACK_HEIGHT

  const longEdge = Math.max(width, height)
  if (longEdge > OUTPUT_LONG_EDGE_CAP) {
    const scale = OUTPUT_LONG_EDGE_CAP / longEdge
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const fps = reference?.fps ?? FALLBACK_FPS
  return {
    // libx264 with yuv420p cannot encode an odd dimension.
    width: Math.max(2, width - (width % 2)),
    height: Math.max(2, height - (height % 2)),
    fps: Math.min(30, Math.max(10, Math.round(fps))),
  }
}

/** A still for the card that will carry this composite on the canvas. */
async function renderPoster(video: string, dir: string, timeoutMs: number): Promise<string | null> {
  const poster = path.join(dir, `${OUTPUT_BASENAME}-poster.jpg`)
  const result = await runProcess(
    'ffmpeg',
    ['-y', '-nostdin', '-v', 'error', '-i', video, '-frames:v', '1', '-q:v', '4', poster],
    timeoutMs,
  )
  if (!result.ok) return null
  try {
    if ((await fs.stat(poster)).size > 0) return poster
  } catch {
    /* fall through */
  }
  return null
}

function lastMeaningfulLine(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  return lines[lines.length - 1] ?? '编码器未给出原因'
}
