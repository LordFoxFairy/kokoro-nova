import { spawn, spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TimelineClip, TransitionId } from '@/server/compose'

/**
 * Timeline compositor.
 *
 * `src/server/store.ts` derives MEDIA_DIR from `process.cwd()` at import time
 * and `compose.ts` resolves clip URLs against it, so — as in
 * upload-lifecycle.test.ts — the suite relocates into a scratch directory
 * *before* the first import. Vitest isolates modules per file, so the
 * relocation cannot leak into another suite.
 */

let compose: typeof import('@/server/compose')
let root = ''
let mediaDir = ''
const originalCwd = process.cwd()

beforeAll(async () => {
  // realpath: macOS reports /var/... from mkdtemp but /private/var/... from cwd.
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-compose-')))
  process.chdir(root)
  compose = await import('@/server/compose')
  mediaDir = (await import('@/server/store')).MEDIA_DIR
  await fs.mkdir(mediaDir, { recursive: true })
})

afterAll(async () => {
  process.chdir(originalCwd)
  await fs.rm(root, { recursive: true, force: true }).catch(() => undefined)
})

function clip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    url: '/api/media/job_a/shot.mp4',
    inPoint: 0,
    outPoint: 4,
    speed: 1,
    transitionAfter: null,
    ...overrides,
  }
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

describe('validateTimeline', () => {
  it('accepts a plain two-clip timeline and measures it after trim and speed', () => {
    const result = compose.validateTimeline({
      clips: [clip({ inPoint: 1, outPoint: 5 }), clip({ outPoint: 4, speed: 2 })],
      subtitles: [],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.clipDurations).toEqual([4, 2])
    expect(result.totalSeconds).toBe(6)
  })

  it('rejects an empty timeline', () => {
    const result = compose.validateTimeline({ clips: [], subtitles: [] })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('时间线为空') })
  })

  it('rejects a trim window whose out point is not after its in point', () => {
    for (const [inPoint, outPoint] of [
      [2, 2],
      [3, 1],
      [0, 0.01],
    ]) {
      const result = compose.validateTimeline({ clips: [clip({ inPoint, outPoint })], subtitles: [] })
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.reason).toContain('出点')
    }
  })

  it('rejects a negative in point', () => {
    const result = compose.validateTimeline({ clips: [clip({ inPoint: -1 })], subtitles: [] })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('入点') })
  })

  it('rejects a non-finite trim point', () => {
    const result = compose.validateTimeline({
      clips: [clip({ outPoint: Number.NaN })],
      subtitles: [],
    })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('有效数值') })
  })

  it('rejects an absurd speed on either side of the range', () => {
    for (const speed of [0, 0.01, 100, -2, Number.POSITIVE_INFINITY]) {
      const result = compose.validateTimeline({ clips: [clip({ speed })], subtitles: [] })
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.reason).toContain('倍速')
    }
  })

  it('accepts the speeds at the boundary of the allowed range', () => {
    for (const speed of [compose.MIN_SPEED, compose.MAX_SPEED]) {
      expect(compose.validateTimeline({ clips: [clip({ speed })], subtitles: [] }).ok).toBe(true)
    }
  })

  it('rejects an absurd clip count', () => {
    const clips = Array.from({ length: compose.MAX_CLIPS + 1 }, () => clip({ outPoint: 0.2 }))
    const result = compose.validateTimeline({ clips, subtitles: [] })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('片段数量超过上限') })
  })

  it('rejects a timeline longer than the render ceiling', () => {
    const clips = Array.from({ length: 10 }, () => clip({ outPoint: 40 }))
    const result = compose.validateTimeline({ clips, subtitles: [] })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('合成时长超过上限') })
  })

  it('rejects an unsupported transition id', () => {
    const result = compose.validateTimeline({
      clips: [clip({ transitionAfter: 'dissolve-3d' as unknown as TransitionId }), clip()],
      subtitles: [],
    })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('不支持的转场') })
  })

  it('accepts every transition the editor offers', () => {
    for (const transitionAfter of ['fade', 'to-black', 'to-white'] as const) {
      const result = compose.validateTimeline({
        clips: [clip({ transitionAfter }), clip()],
        subtitles: [],
      })
      expect(result.ok).toBe(true)
    }
  })

  it('rejects a subtitle that runs past the end of the timeline', () => {
    // One 4s clip at 2x is 2s long, so a subtitle ending at 3s has nothing to sit on.
    const result = compose.validateTimeline({
      clips: [clip({ speed: 2 })],
      subtitles: [{ text: '尾字幕', start: 1, end: 3 }],
    })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('超出了') })
  })

  it('rejects a subtitle that starts before the timeline', () => {
    const result = compose.validateTimeline({
      clips: [clip()],
      subtitles: [{ text: '早到', start: -0.5, end: 1 }],
    })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('超出了') })
  })

  it('rejects a subtitle whose end is not after its start, and an empty one', () => {
    expect(
      compose.validateTimeline({ clips: [clip()], subtitles: [{ text: '同时', start: 1, end: 1 }] }),
    ).toEqual({ ok: false, reason: expect.stringContaining('结束时间') })
    expect(
      compose.validateTimeline({ clips: [clip()], subtitles: [{ text: '   ', start: 0, end: 1 }] }),
    ).toEqual({ ok: false, reason: expect.stringContaining('内容为空') })
  })

  it('accepts a subtitle that ends exactly on the last frame', () => {
    const result = compose.validateTimeline({
      clips: [clip({ outPoint: 3 })],
      subtitles: [{ text: '压线', start: 0, end: 3 }],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects more subtitles than the ceiling allows', () => {
    const subtitles = Array.from({ length: compose.MAX_SUBTITLES + 1 }, (_, i) => ({
      text: `第 ${i} 条`,
      start: 0,
      end: 1,
    }))
    const result = compose.validateTimeline({ clips: [clip()], subtitles })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('字幕数量超过上限') })
  })
})

/* ------------------------------------------------------------------ *
 * Trust boundary
 * ------------------------------------------------------------------ */

describe('resolveMediaPath', () => {
  it('resolves a well-formed media url under MEDIA_DIR', () => {
    expect(compose.resolveMediaPath('/api/media/job_a/shot.mp4')).toBe(
      path.join(mediaDir, 'job_a', 'shot.mp4'),
    )
  })

  it('decodes the percent-encoded filenames the upload path mints', () => {
    expect(compose.resolveMediaPath('/api/media/uploads/upl_1/%E7%89%87%E6%AE%B5.mp4')).toBe(
      path.join(mediaDir, 'uploads', 'upl_1', '片段.mp4'),
    )
  })

  it('rejects traversal that would escape MEDIA_DIR', () => {
    for (const url of [
      '/api/media/../workspace.json',
      '/api/media/job_a/../../../etc/passwd',
      '/api/media/..',
      '/api/media/./job_a/shot.mp4',
    ]) {
      expect(compose.resolveMediaPath(url)).toBeNull()
    }
  })

  it('rejects traversal hidden behind percent-encoding', () => {
    for (const url of [
      '/api/media/%2e%2e/workspace.json',
      '/api/media/job_a/%2E%2E/%2E%2E/etc/passwd',
      // A single decode pass must not itself produce a separator.
      '/api/media/job%2Fa%2F..%2F..%2Fetc/passwd',
    ]) {
      expect(compose.resolveMediaPath(url)).toBeNull()
    }
  })

  it('rejects anything that is not a media url at all', () => {
    for (const url of [
      '/etc/passwd',
      'file:///etc/passwd',
      'http://example.invalid/api/media/x.mp4',
      '/api/media/',
      '/api/media',
      '/api/mediax/shot.mp4',
      '',
      '/api/media/job_a/shot.mp4?x=../../y',
      '/api/media/job_a/shot.mp4#/../../y',
      '/api/media/job_a\\..\\..\\shot.mp4',
    ]) {
      expect(compose.resolveMediaPath(url)).toBeNull()
    }
    expect(compose.resolveMediaPath(null)).toBeNull()
    expect(compose.resolveMediaPath(42)).toBeNull()
  })

  it('refuses to render a clip whose url escapes MEDIA_DIR, before ffmpeg runs', async () => {
    const result = await compose.composeTimeline(
      { clips: [clip({ url: '/api/media/../../../../etc/passwd' })], subtitles: [] },
      path.join(root, 'escape-out'),
    )
    expect(result).toEqual({
      ok: false,
      code: 'invalid_spec',
      reason: expect.stringContaining('不合法'),
    })
    // Nothing was created, because nothing was executed.
    await expect(fs.stat(path.join(root, 'escape-out'))).rejects.toThrow()
  })

  it('reports a missing source file instead of handing it to ffmpeg', async () => {
    const result = await compose.composeTimeline(
      { clips: [clip({ url: '/api/media/job_nope/gone.mp4' })], subtitles: [] },
      path.join(root, 'missing-out'),
    )
    expect(result).toEqual({
      ok: false,
      code: 'source_missing',
      reason: expect.stringContaining('源文件已不存在'),
    })
  })
})

/* ------------------------------------------------------------------ *
 * Real render
 * ------------------------------------------------------------------ */

/** A short synthetic source, so the render exercises real decode → encode. */
async function makeSource(file: string, pattern: string, size: string, seconds: number) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        `${pattern}=size=${size}:rate=12:duration=${seconds}`,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        file,
      ],
      { stdio: 'ignore' },
    )
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))))
  })
}

// Synchronous on purpose: `describe.skip` has to be chosen while the file is
// being collected, before any hook has had a chance to run.
const FFMPEG_AVAILABLE = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0
const describeRender = FFMPEG_AVAILABLE ? describe : describe.skip

describeRender('composeTimeline (real ffmpeg render)', () => {
  beforeAll(async () => {
    await makeSource(path.join(mediaDir, 'job_a', 'shot.mp4'), 'testsrc', '320x240', 4)
    await makeSource(path.join(mediaDir, 'job_b', 'shot.mp4'), 'smptebars', '320x240', 3)
  }, 60_000)

  it(
    'renders trim, speed, all three transitions and subtitles into one non-trivial mp4',
    async () => {
      const outputDir = path.join(root, 'render-out')
      const result = await compose.composeTimeline(
        {
          clips: [
            // 2s after trim.
            { url: '/api/media/job_a/shot.mp4', inPoint: 0.5, outPoint: 2.5, speed: 1, transitionAfter: 'fade' },
            // 4s window at 2x → 2s.
            { url: '/api/media/job_b/shot.mp4', inPoint: 0, outPoint: 2, speed: 2, transitionAfter: 'to-black' },
            { url: '/api/media/job_a/shot.mp4', inPoint: 1, outPoint: 3, speed: 1, transitionAfter: 'to-white' },
            { url: '/api/media/job_b/shot.mp4', inPoint: 0, outPoint: 2, speed: 1, transitionAfter: null },
          ],
          subtitles: [{ text: '第一句字幕', start: 0.2, end: 2 }],
        },
        outputDir,
        { timeoutMs: 120_000 },
      )

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(result.reason)

      const stat = await fs.stat(result.outputPath)
      expect(stat.isFile()).toBe(true)
      // A header-only or single-frame file would be well under this.
      expect(stat.size).toBeGreaterThan(10_000)
      expect(result.byteSize).toBe(stat.size)

      // 2 + 1 + 2 + 2 = 7s of material, minus three 0.4–0.5s transition overlaps.
      expect(result.durationSeconds).toBeGreaterThan(5.2)
      expect(result.durationSeconds).toBeLessThan(6.2)
      expect(result.width).toBe(320)
      expect(result.height).toBe(240)

      // Whichever path the build supports, the words must be in the file.
      expect(['burned', 'muxed']).toContain(result.subtitleMode)

      // Intermediate text files must not survive next to the deliverable.
      const left = await fs.readdir(outputDir)
      expect(left.filter((name) => name.endsWith('.txt') || name.endsWith('.srt'))).toEqual([])
    },
    180_000,
  )

  it(
    'produces a poster frame beside the composite',
    async () => {
      const outputDir = path.join(root, 'poster-out')
      const result = await compose.composeTimeline(
        { clips: [{ url: '/api/media/job_a/shot.mp4', inPoint: 0, outPoint: 1, speed: 1, transitionAfter: null }], subtitles: [] },
        outputDir,
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.posterPath).not.toBeNull()
      expect((await fs.stat(result.posterPath as string)).size).toBeGreaterThan(500)
      expect(result.subtitleMode).toBe('none')
    },
    120_000,
  )

  it(
    'clamps an out point that runs past the end of its source and says so',
    async () => {
      const result = await compose.composeTimeline(
        {
          // The source is 4s; asking for 9 is what a stale artifact duration looks like.
          clips: [{ url: '/api/media/job_a/shot.mp4', inPoint: 0, outPoint: 9, speed: 1, transitionAfter: null }],
          subtitles: [],
        },
        path.join(root, 'clamp-out'),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.notes.some((note) => note.includes('已裁至'))).toBe(true)
      expect(result.durationSeconds).toBeLessThan(4.5)
    },
    120_000,
  )

  it(
    'fails with a timeout instead of running forever',
    async () => {
      const result = await compose.composeTimeline(
        {
          clips: [{ url: '/api/media/job_a/shot.mp4', inPoint: 0, outPoint: 4, speed: 1, transitionAfter: null }],
          subtitles: [],
        },
        path.join(root, 'timeout-out'),
        // Below the floor `remaining()` enforces, so the encoder is killed mid-flight.
        { timeoutMs: 1 },
      )
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.code).toBe('timeout')
      expect(result.reason).toContain('超时')
    },
    60_000,
  )
})
