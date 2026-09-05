import { describe, expect, it } from 'vitest'

import { GET as getCharacterPreview } from './character/route'
import { GET as getStitchPreview } from './stitch/route'

const CHARACTER_URL = 'http://localhost/api/preview/character'
const STITCH_URL = 'http://localhost/api/preview/stitch'

function contentCellCount(svg: string) {
  return (svg.match(/<rect[^>]*\brx="6"/g) ?? []).length
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

describe('preview SVG routes', () => {
  it('renders the default character reference as stable cached SVG', async () => {
    const first = await getCharacterPreview(new Request(CHARACTER_URL))
    const second = await getCharacterPreview(new Request(CHARACTER_URL))
    const firstSvg = await first.text()

    expect(first.status).toBe(200)
    expect(first.headers.get('content-type')).toBe('image/svg+xml')
    expect(first.headers.get('cache-control')).toBe('public, max-age=86400')
    expect(firstSvg).toContain('<svg')
    expect(firstSvg).toContain('width="768" height="768"')
    expect(firstSvg).toContain('aria-label="角色参考"')
    expect(await second.text()).toBe(firstSvg)
  })

  it('escapes and truncates character labels while retaining deterministic output', async () => {
    const label = `  <角色& "测试"> ${'x'.repeat(80)}  `
    const url = `${CHARACTER_URL}?label=${encodeURIComponent(label)}&hue=240`
    const first = await getCharacterPreview(new Request(url))
    const second = await getCharacterPreview(new Request(url))
    const clean = label.replace(/\s+/g, ' ').trim()
    const expectedCaption = `${clean.slice(0, 45)}…`
    const escapedCaption = escapeXml(expectedCaption)
    const firstSvg = await first.text()

    expect(firstSvg).toContain(`aria-label="${escapedCaption}"`)
    expect(firstSvg).toContain(`>${escapedCaption}</text>`)
    expect(firstSvg).not.toContain(`<角色& "测试">`)
    expect(await second.text()).toBe(firstSvg)
  })

  it('normalizes stitch rows and columns to inclusive bounds and returns cached SVG', async () => {
    const lowHigh = await getStitchPreview(new Request(`${STITCH_URL}?rows=0&cols=99`))
    const fractional = await getStitchPreview(new Request(`${STITCH_URL}?rows=2.4&cols=2.5`))
    const lowHighSvg = await lowHigh.text()
    const fractionalSvg = await fractional.text()

    expect(lowHigh.status).toBe(200)
    expect(lowHigh.headers.get('content-type')).toBe('image/svg+xml')
    expect(lowHigh.headers.get('cache-control')).toBe('public, max-age=86400')
    expect(contentCellCount(lowHighSvg)).toBe(5)
    expect(contentCellCount(fractionalSvg)).toBe(6)
  })

  it('numbers stitch cells from 01 when seq=1', async () => {
    const response = await getStitchPreview(new Request(`${STITCH_URL}?rows=1&cols=3&seq=1`))
    const svg = await response.text()

    expect(contentCellCount(svg)).toBe(3)
    expect(svg.match(/>\d{2}<\/text>/g)).toEqual(['>01</text>', '>02</text>', '>03</text>'])
  })

  it('treats non-1 sequence values as the documented unnumbered fallback', async () => {
    const response = await getStitchPreview(new Request(`${STITCH_URL}?rows=1&cols=3&seq=unexpected`))
    const svg = await response.text()

    expect(response.status).toBe(200)
    expect(svg.match(/>\d{2}<\/text>/g)).toBeNull()
  })
})
