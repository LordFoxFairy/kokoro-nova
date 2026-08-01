/**
 * Deterministic placeholder art.
 *
 * The mock provider needs to return *real files* so that the canvas, the
 * storyboard, the asset library and the video player all exercise their real
 * code paths. Everything here is generated from a hash of the prompt, so the
 * same prompt always yields the same picture — which makes the E2E snapshots
 * stable and makes it obvious in review which node produced which artifact.
 */

export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Small deterministic PRNG so one seed drives a whole composition. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), 1 | t)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface ArtOptions {
  width: number
  height: number
  seed: string
  caption: string
  badge?: string
  /** 0..360 base hue override. */
  hue?: number
}

/**
 * A layered abstract composition: gradient sky, terrain bands, a light source
 * and a caption strip. Rendered as SVG so it needs no image toolchain.
 */
export function renderArtSvg({ width, height, seed, caption, badge, hue }: ArtOptions): string {
  const h = hashString(seed)
  const rand = mulberry32(h)
  const baseHue = hue ?? h % 360
  const accentHue = (baseHue + 40 + Math.floor(rand() * 60)) % 360

  const sunX = 0.2 + rand() * 0.6
  const sunY = 0.15 + rand() * 0.3
  const bands = 3 + Math.floor(rand() * 3)

  const terrain: string[] = []
  for (let i = 0; i < bands; i += 1) {
    const t = (i + 1) / (bands + 1)
    const yBase = height * (0.45 + t * 0.5)
    const amplitude = height * (0.09 - t * 0.02)
    const points: string[] = [`0,${height}`]
    const steps = 8
    for (let s = 0; s <= steps; s += 1) {
      const x = (width * s) / steps
      const y = yBase - Math.sin(s * (0.6 + rand() * 0.5) + i * 1.7) * amplitude
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    }
    points.push(`${width},${height}`)
    const light = 62 - i * 9
    const sat = 40 + i * 6
    terrain.push(
      `<polygon points="${points.join(' ')}" fill="hsl(${(baseHue + i * 12) % 360} ${sat}% ${light}%)" opacity="${(0.95 - i * 0.08).toFixed(2)}"/>`,
    )
  }

  const particles: string[] = []
  const particleCount = 14 + Math.floor(rand() * 18)
  for (let i = 0; i < particleCount; i += 1) {
    const x = rand() * width
    const y = rand() * height * 0.7
    const r = 1 + rand() * 3.5
    particles.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#fff" opacity="${(0.12 + rand() * 0.35).toFixed(2)}"/>`)
  }

  const captionSize = Math.max(14, Math.round(width / 34))
  const stripHeight = captionSize * 2.6
  const safeCaption = escapeXml(truncate(caption, 46))
  const safeBadge = badge ? escapeXml(badge) : null

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${safeCaption}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="hsl(${baseHue} 55% 22%)"/>
      <stop offset="55%" stop-color="hsl(${accentHue} 62% 46%)"/>
      <stop offset="100%" stop-color="hsl(${(accentHue + 25) % 360} 58% 68%)"/>
    </linearGradient>
    <radialGradient id="sun" cx="${(sunX * 100).toFixed(1)}%" cy="${(sunY * 100).toFixed(1)}%" r="42%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.92"/>
      <stop offset="45%" stop-color="hsl(${accentHue} 90% 72%)" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="transparent" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#sky)"/>
  <rect width="${width}" height="${height}" fill="url(#sun)"/>
  ${particles.join('\n  ')}
  ${terrain.join('\n  ')}
  <rect x="0" y="${height - stripHeight}" width="${width}" height="${stripHeight}" fill="rgba(8,10,14,0.55)"/>
  <text x="${captionSize * 0.9}" y="${height - stripHeight / 2 + captionSize * 0.36}" font-family="-apple-system, 'PingFang SC', 'Noto Sans SC', sans-serif" font-size="${captionSize}" fill="rgba(255,255,255,0.94)">${safeCaption}</text>
  ${
    safeBadge
      ? `<g><rect x="${width - captionSize * 5.6}" y="${captionSize * 0.8}" rx="${captionSize * 0.42}" width="${captionSize * 4.8}" height="${captionSize * 1.5}" fill="rgba(8,10,14,0.5)"/><text x="${width - captionSize * 3.2}" y="${captionSize * 1.86}" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="${captionSize * 0.72}" fill="rgba(255,255,255,0.92)">${safeBadge}</text></g>`
      : ''
  }
</svg>`
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean || '未命名'
  return `${clean.slice(0, max - 1)}…`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * A real, playable WAV. Two detuned sines plus an envelope — enough for the
 * audio node, the storyboard audio column and the composite timeline to work
 * against genuine media instead of a stub URL.
 */
export function renderWav(seed: string, durationSeconds: number): Buffer {
  const sampleRate = 22050
  const total = Math.max(1, Math.floor(sampleRate * durationSeconds))
  const rand = mulberry32(hashString(seed))
  const root = 180 + rand() * 160
  const interval = [1, 1.25, 1.5, 1.6][Math.floor(rand() * 4)]

  const bytesPerSample = 2
  const dataSize = total * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16) // PCM chunk size
  buffer.writeUInt16LE(1, 20) // PCM format
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28)
  buffer.writeUInt16LE(bytesPerSample, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataSize, 40)

  const attack = sampleRate * 0.05
  const releaseStart = total - sampleRate * 0.3

  for (let i = 0; i < total; i += 1) {
    const t = i / sampleRate
    let envelope = 1
    if (i < attack) envelope = i / attack
    else if (i > releaseStart) envelope = Math.max(0, (total - i) / (total - releaseStart))

    // Slow vibrato keeps it from sounding like a flat test tone.
    const vibrato = 1 + Math.sin(2 * Math.PI * 5 * t) * 0.004
    const a = Math.sin(2 * Math.PI * root * vibrato * t)
    const b = Math.sin(2 * Math.PI * root * interval * vibrato * t) * 0.5
    const value = ((a + b) / 1.5) * envelope * 0.35
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value * 32767))), 44 + i * bytesPerSample)
  }

  return buffer
}
