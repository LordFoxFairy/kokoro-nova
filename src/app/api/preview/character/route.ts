import { renderArtSvg } from '@/server/generation/art'

export const dynamic = 'force-dynamic'

/**
 * Preview art for character-library reference nodes.
 *
 * These are placeholders that stand in for a catalogue service's real
 * thumbnails — generated on the fly so applying a character produces four
 * genuinely distinct, stable images without shipping binary assets.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const hue = Number(url.searchParams.get('hue') ?? '210')
  const label = url.searchParams.get('label') ?? '角色参考'

  const svg = renderArtSvg({
    width: 768,
    height: 768,
    seed: `character:${label}:${hue}`,
    caption: label,
    hue: Number.isFinite(hue) ? hue : 210,
  })

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
