import { describe, expect, it } from 'vitest'

import { sanitizeSvg } from '@/server/svg-sanitize'

/**
 * The reference gate is the only place in the sanitiser where a value chosen by
 * the uploader reaches the output intact, so it is the only place a mistake can
 * still be exploited. Reading the surviving markup and asserting "no
 * `javascript:`" only ever proves that the spellings the test author imagined
 * are absent.
 *
 * These tests use the platform's own URL parser as the oracle instead: every
 * reference that survives is resolved against a plausible serving URL exactly
 * as a browser would, and the resolved origin has to be this one. That catches
 * the whole class of "looks relative, resolves elsewhere" spellings at once —
 * including `/\host/path`, which is a path to a naive reader and an authority
 * to the URL parser.
 */

const ORIGIN = 'https://assets.example.com'
const BASE = `${ORIGIN}/api/assets/media/upload.svg`

function referencesOf(svg: string): string[] {
  const out: string[] = []
  for (const match of svg.matchAll(/\s(?:xlink:)?href="([^"]*)"/g)) {
    // One round of entity decoding, which is all a browser applies to markup.
    out.push(
      match[1]
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&amp;', '&'),
    )
  }
  return out
}

type Verdict = 'fragment' | 'same-origin' | 'inline-raster' | string

/** Where the reference actually points once a browser has read it. */
function resolve(reference: string): Verdict {
  const trimmed = reference.trim()
  if (/^data:/i.test(trimmed)) {
    // The data URL processor trims whitespace around the media type, so the
    // comparison has to as well or it reports a bypass that is not one.
    const mediaType = trimmed.slice(5, trimmed.indexOf(',') < 0 ? undefined : trimmed.indexOf(','))
    const [type] = mediaType.split(';')
    return /^\s*image\/(png|jpeg|gif|webp)\s*$/i.test(type)
      ? 'inline-raster'
      : `DANGEROUS-DATA:${trimmed.slice(0, 60)}`
  }
  let resolved: URL
  try {
    resolved = new URL(trimmed, BASE)
  } catch {
    // Unparseable as a URL means unfetchable, which is as inert as it gets.
    return 'same-origin'
  }
  if (resolved.origin !== ORIGIN) return `OFF-ORIGIN:${resolved.href}`
  if (trimmed.startsWith('#')) return 'fragment'
  return 'same-origin'
}

const SAFE: Verdict[] = ['fragment', 'same-origin', 'inline-raster']

function survivingReferences(reference: string): string[] {
  const result = sanitizeSvg(`<svg><image href="${reference}"/><use xlink:href="${reference}"/></svg>`)
  return result.ok ? referencesOf(result.svg) : []
}

/**
 * Every way of spelling an authority that the URL parser accepts. A backslash
 * in either slot is the interesting half: `/\host` reads as a path to anything
 * that only knows to look for a leading `//`, and as `https://host` to a
 * browser.
 */
const AUTHORITY_SPELLINGS = [
  '//evil.example/x.png',
  '/\\evil.example/x.png',
  '\\/evil.example/x.png',
  '\\\\evil.example\\x.png',
  '/\\/evil.example/x.png',
  '/\\\\evil.example/x.png',
  '//\\evil.example/x.png',
  '/\t\\evil.example/x.png',
  '/\\evil.example',
  '/&#92;evil.example/x.png',
  '&#47;&#92;evil.example/x.png',
  '&#x2f;&#x5c;evil.example/x.png',
]

describe('authority-relative references never survive', () => {
  for (const reference of AUTHORITY_SPELLINGS) {
    it(JSON.stringify(reference), () => {
      // The oracle is only worth trusting if the payload really does escape.
      const escapes = resolve(
        reference
          .replaceAll('&#92;', '\\')
          .replaceAll('&#47;', '/')
          .replaceAll('&#x5c;', '\\')
          .replaceAll('&#x2f;', '/'),
      )
      expect(escapes).toMatch(/^OFF-ORIGIN:/)

      expect(survivingReferences(reference)).toEqual([])
    })
  }
})

describe('references that survive stay on this origin', () => {
  const candidates = [
    '#a',
    '#a:b',
    'icon.png',
    './icon.png',
    '../icon.png',
    '/media/icon.png',
    '/a\\b/c.png',
    '/%5Cevil.example/x.png',
    'http://evil.example/x.png',
    'https://evil.example/x.png',
    'HtTpS://evil.example/x.png',
    'https:evil.example/x.png',
    'https:/\\evil.example/x.png',
    'ftp://evil.example/x.png',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    '\u0000javascript:alert(1)',
    'java\u0000script:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'jav\rascript:alert(1)',
    '&#106;avascript:alert(1)',
    '&#0000106;avascript:alert(1)',
    '&#00000106;avascript:alert(1)',
    '&#x6a;avascript:alert(1)',
    '&#X6A;avascript:alert(1)',
    '&#x0000006a;avascript:alert(1)',
    '&amp;#106;avascript:alert(1)',
    'javascript&colon;alert(1)',
    'javascript&#58;alert(1)',
    'javascript&#x3a;alert(1)',
    'vbscript:msgbox(1)',
    'livescript:alert(1)',
    'about:blank',
    'blob:https://evil.example/x',
    'file:///etc/passwd',
    'view-source:https://evil.example/',
    'data:text/html,<script>alert(1)</script>',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:image/svg +xml,<svg/>',
    'data:image/png;base64,iVBORw0KGgo=',
    'data:image/gif;base64,R0lGODdh',
    'data:image/jpeg;base64,/9j/4AAQ',
    'data:image/webp;base64,UklGRg==',
    'DATA:IMAGE/PNG;BASE64,iVBORw0KGgo=',
    'data:image/png;charset=utf-8;base64,iVBORw0KGgo=',
    'data:image/png ;base64,iVBORw0KGgo=',
    'data:image/png,x#,data:text/html,<script>alert(1)</script>',
  ]
  for (const reference of candidates) {
    it(JSON.stringify(reference), () => {
      for (const survivor of survivingReferences(reference)) {
        expect(SAFE).toContain(resolve(survivor))
      }
    })
  }
})

describe('reference fuzz', () => {
  it('never emits an off-origin or scripting reference', () => {
    const alphabet = [
      '/',
      '\\',
      '#',
      '?',
      ':',
      '.',
      ',',
      ';',
      'a',
      'j',
      'javascript',
      'data',
      'image/png',
      'evil.example',
      'http',
      'https',
      '%5C',
      '&#106;',
      '&#x3a;',
      '&#92;',
      '&colon;',
      '&sol;',
      '&num;',
      '&amp;',
      '\t',
      '\u0000',
      '​',
      ' ',
    ]
    let seed = 0x2f6e2b1
    const next = () => {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      return Math.abs(seed)
    }

    const offenders: string[] = []
    for (let i = 0; i < 8000; i += 1) {
      const parts: string[] = []
      const count = 1 + (next() % 7)
      for (let p = 0; p < count; p += 1) parts.push(alphabet[next() % alphabet.length])
      const reference = parts.join('')
      for (const survivor of survivingReferences(reference)) {
        const verdict = resolve(survivor)
        if (!SAFE.includes(verdict)) offenders.push(`${JSON.stringify(reference)} -> ${verdict}`)
      }
    }
    expect([...new Set(offenders)]).toEqual([])
  })
})

describe('legitimate references are not collateral damage', () => {
  it('keeps fragments, relative paths and inline rasters', () => {
    const result = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
        `<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient>` +
        `<symbol id="s"><circle cx="2" cy="2" r="2"/></symbol></defs>` +
        `<use href="#s"/><use xlink:href="#s" x="4"/>` +
        `<image width="2" height="2" href="data:image/png;base64,iVBORw0KGgo="/>` +
        `<image width="2" height="2" href="tiles/a\\b.png"/>` +
        `<rect width="4" height="4" fill="url(#g)"/></svg>`,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.svg).toContain('href="#s"')
    expect(result.svg).toContain('xlink:href="#s"')
    expect(result.svg).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"')
    expect(result.svg).toContain('data:image/png;base64,iVBORw0KGgo=')
    expect(result.svg).toContain('tiles/a\\b.png')
    expect(result.svg).toContain('fill="url(#g)"')
    for (const survivor of referencesOf(result.svg)) {
      expect(SAFE).toContain(resolve(survivor))
    }
  })
})
