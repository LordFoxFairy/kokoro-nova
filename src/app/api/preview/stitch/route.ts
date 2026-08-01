import { hashString, mulberry32 } from '@/server/generation/art'

export const dynamic = 'force-dynamic'

/**
 * Storyboard stitch output.
 *
 * Renders the group's grid as a single contact sheet, optionally numbered —
 * the same artifact shape a real stitch service would return.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const rows = clamp(Number(url.searchParams.get('rows') ?? '2'), 1, 5)
  const cols = clamp(Number(url.searchParams.get('cols') ?? '2'), 1, 5)
  const withSequence = url.searchParams.get('seq') === '1'

  const width = 2048
  const height = 1152
  const gap = 12
  const cellWidth = (width - gap * (cols + 1)) / cols
  const cellHeight = (height - gap * (rows + 1)) / rows

  const rand = mulberry32(hashString(`stitch:${rows}x${cols}`))
  const cells: string[] = []

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const index = r * cols + c
      const x = gap + c * (cellWidth + gap)
      const y = gap + r * (cellHeight + gap)
      const hue = Math.floor(rand() * 360)
      cells.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cellWidth.toFixed(1)}" height="${cellHeight.toFixed(1)}" rx="6" fill="hsl(${hue} 52% ${44 + (index % 3) * 8}%)"/>`,
      )
      if (withSequence) {
        cells.push(
          `<text x="${(x + 18).toFixed(1)}" y="${(y + 48).toFixed(1)}" font-family="-apple-system, sans-serif" font-size="34" font-weight="600" fill="rgba(255,255,255,0.92)">${String(index + 1).padStart(2, '0')}</text>`,
        )
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#111418"/>
  ${cells.join('\n  ')}
</svg>`

  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' },
  })
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}
