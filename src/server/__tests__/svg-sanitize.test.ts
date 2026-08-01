import { describe, expect, it } from 'vitest'

import { SVG_SANITIZE_LIMITS, sanitizeSvg } from '@/server/svg-sanitize'

/*
 * The sanitiser's contract is about its *output*, so almost everything here
 * asserts on the returned markup rather than on the verdict. A payload that is
 * merely refused proves nothing about the next payload; a payload that comes
 * back as inert markup proves the shape of the defence.
 */

const NS = 'http://www.w3.org/2000/svg'

/** Fails loudly rather than silently degrading into a `reason` assertion: a
 * rejected payload cannot demonstrate anything about serialisation. */
function sanitized(source: string): string {
  const result = sanitizeSvg(source)
  if (!result.ok) throw new Error(`expected sanitised output, got rejection: ${result.reason}`)
  return result.svg
}

function rejection(source: string): string {
  const result = sanitizeSvg(source)
  if (result.ok) throw new Error(`expected a rejection, got: ${result.svg}`)
  return result.reason
}

/**
 * An independent, deliberately over-eager entity decoder. The sanitiser has its
 * own; reusing it here would let a bug agree with itself.
 */
function decodeDeep(value: string): string {
  let current = value
  for (let round = 0; round < 4; round += 1) {
    const next = current.replace(
      /&(?:#[xX]([\da-fA-F]{1,6});?|#(\d{1,7});?|([a-zA-Z]{2,10});?)/g,
      (match, hex?: string, dec?: string, named?: string) => {
        const table: Record<string, string> = {
          amp: '&',
          lt: '<',
          gt: '>',
          quot: '"',
          apos: "'",
          colon: ':',
          tab: '\t',
          newline: '\n',
          sol: '/',
        }
        if (named !== undefined) return table[named.toLowerCase()] ?? match
        const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? '', 16)
        return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
          ? String.fromCodePoint(code)
          : match
      },
    )
    if (next === current) break
    current = next
  }
  // Whitespace, controls and zero-width characters are what hides a scheme from
  // a naive reader, so the assertion never sees them either.
  return current.replace(/[\s\u0000-\u0020\u007f-\u00a0\u200b-\u200f\ufeff]/g, '')
}

function attributeValues(svg: string): string[] {
  return [...svg.matchAll(/="([^"]*)"/g)].map((match) => match[1])
}

/**
 * The three properties every sanitised document must have, whatever went in.
 *
 * The handler pattern insists on the delimiter quote: a sanitised document
 * escapes every `"` that is not one, so `fill="&quot; onload=&quot;x"` is a
 * paint string that mentions an event, not an event.
 */
function expectInert(svg: string) {
  expect(svg).not.toMatch(
    /<\s*\/?\s*(?:script|foreignobject|iframe|embed|object|style|animate|animatetransform|animatemotion|set|handler|a)\b/i,
  )
  expect(svg).not.toMatch(/\son[a-z-]{2,}\s*=\s*"/i)
  for (const value of attributeValues(svg)) {
    const decoded = decodeDeep(value).toLowerCase()
    expect(decoded).not.toMatch(/javascript:/)
    expect(decoded).not.toMatch(/vbscript:/)
    expect(decoded).not.toMatch(/livescript:/)
    expect(decoded).not.toMatch(/data:text/)
    expect(decoded).not.toMatch(/data:application/)
    expect(decoded).not.toMatch(/data:image\/svg/)
  }
}

/* ------------------------------------------------------------------ *
 * Bypass payloads
 * ------------------------------------------------------------------ */

interface Payload {
  name: string
  svg: string
  /** Substrings that must not survive, beyond the universal inertness rules. */
  gone?: string[]
  /** Substrings the sanitiser must nonetheless preserve. */
  kept?: string[]
}

const PAYLOADS: Payload[] = [
  {
    name: 'plain script element',
    svg: `<svg xmlns="${NS}"><script>alert(1)</script><rect width="10" height="10"/></svg>`,
    gone: ['alert', 'script'],
    kept: ['<rect'],
  },
  {
    name: 'upper-case script element',
    svg: `<svg><SCRIPT>alert(1)</SCRIPT><circle r="4"/></svg>`,
    gone: ['alert', 'SCRIPT'],
    kept: ['<circle'],
  },
  {
    name: 'mixed-case script element',
    svg: `<svg><sCrIpT>alert(1)</ScRiPt><circle r="4"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'script body containing markup-looking text',
    svg: `<svg><script>if (a < b && c > d) { alert("</scr" + "ipt>") }</script><path d="M0 0"/></svg>`,
    gone: ['alert'],
    kept: ['<path'],
  },
  {
    name: 'self-closed script element',
    svg: `<svg><script/><rect width="1" height="1"/></svg>`,
    gone: ['script'],
  },
  {
    name: 'onload on the root element',
    svg: `<svg xmlns="${NS}" onload="alert(1)"><rect width="1" height="1"/></svg>`,
    gone: ['alert', 'onload'],
  },
  {
    name: 'event handlers in defiant casing',
    svg: `<svg OnLoad="alert(1)"><rect oNcLiCk="alert(2)" ONMOUSEOVER="alert(3)" width="1" height="1"/></svg>`,
    gone: ['alert', 'OnLoad', 'oNcLiCk', 'ONMOUSEOVER'],
  },
  {
    name: 'event handler name split by a newline',
    svg: `<svg on\nload="alert(1)"><rect width="1" height="1"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'event handler name padded with a NUL',
    svg: `<svg on\u0000load="alert(1)"><rect width="1" height="1"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'entity-encoded attribute name',
    svg: `<svg &#111;nload="alert(1)"><rect width="1" height="1"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'unquoted event handler value',
    svg: `<svg><rect fill=red onload=alert(1) width=10 height=10></rect></svg>`,
    gone: ['alert'],
    kept: ['fill="red"'],
  },
  {
    name: 'javascript scheme in href',
    svg: `<svg><use href="javascript:alert(1)"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'javascript scheme in xlink:href',
    svg: `<svg><use xlink:href="javascript:alert(1)"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'decimal entity, semicolon terminated',
    svg: `<svg><use xlink:href="&#106;avascript:alert(1)"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'decimal entity, semicolon omitted',
    svg: `<svg><use href="&#106avascript:alert(1)"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'hex entity, lower-case x',
    svg: `<svg><use href="&#x6a;avascript:alert(1)"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'hex entity, upper-case X, no semicolon',
    svg: `<svg><use href="&#X6Aavascript:alert(1)"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'double-encoded entity',
    svg: `<svg><use href="&amp;#106;avascript:alert(1)"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'named entity for the colon',
    svg: `<svg><use href="javascript&colon;alert(1)"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'entity-encoded newline inside the scheme',
    svg: `<svg><image href="jav&#x0A;ascript:alert(1)" width="1" height="1"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'literal tab and newline inside the scheme',
    svg: `<svg><image href="jav\ta\nscript:alert(1)" width="1" height="1"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'leading whitespace before the scheme',
    svg: `<svg><use href="   \t javascript:alert(1)"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'NUL inside the scheme',
    svg: `<svg><use href="java\u0000script:alert(1)"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'zero-width character inside the scheme',
    svg: `<svg><use href="java\u200bscript:alert(1)"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'scheme in defiant casing',
    svg: `<svg><use href="JaVaScRiPt:alert(1)"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'vbscript scheme',
    svg: `<svg><use href="vbscript:msgbox(1)"/></svg>`,
    gone: ['msgbox'],
  },
  {
    name: 'data:text/html document',
    svg: `<svg><image href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" width="1" height="1"/></svg>`,
    gone: ['base64'],
  },
  {
    name: 'data:image/svg+xml nested document',
    svg: `<svg><image href="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+" width="1" height="1"/></svg>`,
    gone: ['base64'],
  },
  {
    name: 'protocol-relative reference',
    svg: `<svg><image href="//attacker.example/x.png" width="1" height="1"/></svg>`,
    gone: ['attacker.example'],
  },
  {
    name: 'absolute external reference',
    svg: `<svg><image href="https://attacker.example/x.png" width="1" height="1"/></svg>`,
    gone: ['attacker.example'],
  },
  {
    name: 'foreignObject carrying XHTML',
    svg: `<svg xmlns="${NS}"><foreignObject width="10" height="10"><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject><rect width="1" height="1"/></svg>`,
    gone: ['alert', 'foreignObject', 'body'],
    kept: ['<rect'],
  },
  {
    name: 'iframe, embed and object',
    svg: `<svg><iframe src="javascript:alert(1)"/><embed src="x.swf"/><object data="x.swf"></object><rect width="1" height="1"/></svg>`,
    gone: ['alert', 'iframe', 'embed', 'object', 'x.swf'],
  },
  {
    name: 'animate retargeting href at runtime',
    svg: `<svg><use href="#a"><animate attributeName="href" values="javascript:alert(1)" dur="1s"/></use></svg>`,
    gone: ['alert', 'animate', 'attributeName'],
  },
  {
    name: 'set retargeting an event handler',
    svg: `<svg><rect width="1" height="1"><set attributeName="onload" to="alert(1)"/></rect></svg>`,
    gone: ['alert', 'attributeName'],
  },
  {
    name: 'animateTransform and animateMotion',
    svg: `<svg><rect width="1" height="1"><animateTransform attributeName="transform" type="rotate" values="0;360"/><animateMotion path="M0 0"/></rect></svg>`,
    gone: ['animate'],
  },
  {
    name: 'XML Events handler element',
    svg: `<svg><handler type="text/javascript">alert(1)</handler><rect width="1" height="1"/></svg>`,
    gone: ['alert', 'handler'],
  },
  {
    name: 'stylesheet element',
    svg: `<svg><style>* { background: url("javascript:alert(1)") }</style><rect width="1" height="1"/></svg>`,
    gone: ['alert', 'background'],
  },
  {
    name: 'style attribute reaching for a resource',
    svg: `<svg><rect style="background:url(javascript:alert(1))" width="1" height="1"/></svg>`,
    gone: ['alert', 'background'],
  },
  {
    name: 'style attribute with a CSS escape',
    svg: `<svg><rect style="background:\\75 rl(javascript:alert(1))" width="1" height="1"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'style attribute with an import',
    svg: `<svg><rect style="@import '//attacker.example/x.css'" width="1" height="1"/></svg>`,
    gone: ['attacker.example', 'import'],
  },
  {
    name: 'external paint reference',
    svg: `<svg><rect fill="url(https://attacker.example/x.svg#p)" width="1" height="1"/></svg>`,
    gone: ['attacker.example'],
  },
  {
    name: 'javascript inside a paint reference',
    svg: `<svg><rect fill="url('javascript:alert(1)')" width="1" height="1"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'comment smuggling markup past a scanner',
    svg: `<svg><!--<script>--><rect width="1" height="1"/><!--</script>--></svg>`,
    gone: ['script', '<!--'],
    kept: ['<rect'],
  },
  {
    name: 'CDATA smuggling markup into a title',
    svg: `<svg><title><![CDATA[<script>alert(1)</script>]]></title><rect width="1" height="1"/></svg>`,
    gone: ['<script', 'CDATA'],
    kept: ['&lt;script&gt;'],
  },
  {
    name: 'CDATA outside a text element',
    svg: `<svg><g><![CDATA[<script>alert(1)</script>]]></g><rect width="1" height="1"/></svg>`,
    gone: ['alert', 'CDATA'],
  },
  {
    name: 'entity-escaped markup in a title stays text',
    svg: `<svg><title>&lt;script&gt;alert(1)&lt;/script&gt;</title></svg>`,
    gone: ['<script'],
    kept: ['&lt;script&gt;'],
  },
  {
    name: 'quote breakout attempt through an entity',
    svg: `<svg><rect fill="&quot; onload=&quot;alert(1)" width="1" height="1"/></svg>`,
    gone: ['" onload="'],
  },
  {
    name: 'namespace switched to XHTML',
    svg: `<svg xmlns="http://www.w3.org/1999/xhtml" onload="alert(1)"><rect width="1" height="1"/></svg>`,
    gone: ['alert', '1999/xhtml'],
    kept: [`xmlns="${NS}"`],
  },
  {
    name: 'prefixed script element',
    svg: `<svg xmlns:s="${NS}"><s:script>alert(1)</s:script><rect width="1" height="1"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'href smuggled through a foreign namespace prefix',
    svg: `<svg xmlns:x="http://www.w3.org/1999/xlink"><use x:href="javascript:alert(1)"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'unknown element wrapping legitimate children',
    svg: `<svg><madeup><rect width="1" height="1"/></madeup><circle r="2"/></svg>`,
    gone: ['madeup', '<rect'],
    kept: ['<circle'],
  },
  {
    name: 'deeply buried script',
    svg: `<svg><defs><symbol><g><g><g><script>alert(1)</script></g></g></g></symbol></defs><rect width="1" height="1"/></svg>`,
    gone: ['alert'],
  },
  {
    name: 'duplicate attribute after a safe one',
    svg: `<svg><use href="#legit" href="javascript:alert(1)"/></svg>`,
    gone: ['alert'],
    kept: ['href="#legit"'],
  },
  {
    name: 'external script reference',
    svg: `<svg><script type="text/javascript" xlink:href="//attacker.example/x.js"/><rect width="1" height="1"/></svg>`,
    gone: ['attacker.example', 'script'],
    kept: ['<rect'],
  },
  {
    name: 'stylesheet processing instruction',
    svg: `<?xml-stylesheet type="text/xsl" href="//attacker.example/x.xsl"?><svg><rect width="1" height="1"/></svg>`,
    gone: ['attacker.example', '<?'],
    kept: ['<rect'],
  },
  {
    name: 'closing bracket hidden inside an attribute value',
    svg: `<svg><rect fill="a>b" width="1" height="1" onload="alert(1)"/></svg>`,
    gone: ['alert'],
    kept: ['fill="a&gt;b"'],
  },
  {
    name: 'handler on an element nested in a text container',
    svg: `<svg><text x="0" y="0">hi<tspan onclick="alert(1)" fill="#000">there</tspan></text></svg>`,
    gone: ['alert'],
    kept: ['<tspan fill="#000">there</tspan>'],
  },
]

describe('sanitizeSvg — bypass payloads', () => {
  for (const payload of PAYLOADS) {
    it(`neutralises ${payload.name}`, () => {
      const svg = sanitized(payload.svg)
      expectInert(svg)
      for (const needle of payload.gone ?? []) expect(svg).not.toContain(needle)
      for (const needle of payload.kept ?? []) expect(svg).toContain(needle)
    })
  }

  it('produces the same output when run over its own output', () => {
    for (const payload of PAYLOADS) {
      const once = sanitized(payload.svg)
      expect(sanitized(once)).toBe(once)
    }
  })

  it('drops an event handler rather than the element carrying it', () => {
    const svg = sanitized(`<svg><rect onload="alert(1)" fill="#0f0" width="4" height="4"/></svg>`)
    expect(svg).toContain('<rect')
    expect(svg).toContain('fill="#0f0"')
    expect(svg).not.toContain('onload')
  })

  it('keeps a document-local reference while refusing an external one', () => {
    const svg = sanitized(
      `<svg><use href="#icon"/><use href="https://attacker.example/x.svg#icon"/></svg>`,
    )
    expect(svg).toContain('href="#icon"')
    expect(svg).not.toContain('attacker.example')
  })

  it('escapes a quote inside an attribute value instead of ending it', () => {
    const svg = sanitized(`<svg><desc id="&quot;x&quot;">a &amp; b</desc></svg>`)
    expect(svg).toContain('id="&quot;x&quot;"')
    expect(svg).toContain('a &amp; b')
    // Four quotes in the whole document: the delimiters of `xmlns` and of `id`.
    // Every other quote left as an entity, which is what makes the delimiters
    // countable in the first place.
    expect(svg.match(/"/g)?.length).toBe(4)
  })
})

/* ------------------------------------------------------------------ *
 * Legitimate documents
 * ------------------------------------------------------------------ */

describe('sanitizeSvg — legitimate documents', () => {
  const GRADIENT = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 120 80" width="120" height="80">
  <title>Chart</title>
  <desc>Two bars &amp; a curve</desc>
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox" spreadMethod="pad">
      <stop offset="0%" stop-color="#ff8a00" stop-opacity="1"/>
      <stop offset="100%" stop-color="#e52e71" stop-opacity="0.4"/>
    </linearGradient>
    <clipPath id="clip" clipPathUnits="userSpaceOnUse">
      <rect x="0" y="0" width="120" height="80" rx="6"/>
    </clipPath>
    <symbol id="dot" viewBox="0 0 4 4"><circle cx="2" cy="2" r="2"/></symbol>
  </defs>
  <g transform="translate(4 4) rotate(-2)" clip-path="url(#clip)" opacity="0.9">
    <path d="M0 40 C 20 10, 40 70, 60 40 S 100 10, 120 40" fill="none" stroke="url(#fade)" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="8" y="20" width="16" height="48" fill="url(#fade)"/>
    <polygon points="60,10 70,30 50,30" fill="#333"/>
    <polyline points="0,0 10,10" stroke="#000"/>
    <ellipse cx="90" cy="30" rx="8" ry="4" fill="#0af"/>
    <line x1="0" y1="79" x2="120" y2="79" stroke="#ccc" stroke-dasharray="2 2"/>
    <use xlink:href="#dot" x="100" y="60" width="4" height="4"/>
    <text x="6" y="74" font-family="Inter, sans-serif" font-size="9" text-anchor="start" fill="#111">收入 <tspan dx="2" font-weight="600">+12%</tspan></text>
  </g>
</svg>`

  it('preserves the drawing instructions of a real document', () => {
    const svg = sanitized(GRADIENT)

    expect(svg.startsWith(`<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink"`)).toBe(true)
    expect(svg).toContain('viewBox="0 0 120 80"')
    expect(svg).toContain('<linearGradient id="fade"')
    expect(svg).toContain('gradientUnits="objectBoundingBox"')
    expect(svg).toContain('spreadMethod="pad"')
    expect(svg).toContain('<stop offset="0%" stop-color="#ff8a00" stop-opacity="1"/>')
    expect(svg).toContain('<clipPath id="clip" clipPathUnits="userSpaceOnUse">')
    expect(svg).toContain('<symbol id="dot" viewBox="0 0 4 4">')
    expect(svg).toContain('transform="translate(4 4) rotate(-2)"')
    expect(svg).toContain('clip-path="url(#clip)"')
    expect(svg).toContain(
      '<path d="M0 40 C 20 10, 40 70, 60 40 S 100 10, 120 40" fill="none" stroke="url(#fade)" stroke-width="2.5" stroke-linecap="round"/>',
    )
    expect(svg).toContain('<polygon points="60,10 70,30 50,30" fill="#333"/>')
    expect(svg).toContain('stroke-dasharray="2 2"')
    expect(svg).toContain('<use xlink:href="#dot" x="100" y="60" width="4" height="4"/>')
    expect(svg).toContain('<tspan dx="2" font-weight="600">+12%</tspan>')
    expect(svg).toContain('收入')
    expect(svg).toContain('<title>Chart</title>')
    expect(svg).toContain('<desc>Two bars &amp; a curve</desc>')
  })

  it('keeps every element of a real document that renders', () => {
    const svg = sanitized(GRADIENT)
    for (const element of [
      'linearGradient',
      'stop',
      'clipPath',
      'symbol',
      'circle',
      'g',
      'path',
      'rect',
      'polygon',
      'polyline',
      'ellipse',
      'line',
      'use',
      'text',
      'tspan',
      'title',
      'desc',
      'defs',
    ]) {
      expect(svg).toContain(`<${element}`)
    }
  })

  it('carries an embedded raster through untouched', () => {
    // 1x1 transparent PNG.
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const svg = sanitized(
      `<svg xmlns="${NS}" width="8" height="8"><image href="${png}" x="0" y="0" width="8" height="8" preserveAspectRatio="xMidYMid slice"/></svg>`,
    )
    expect(svg).toContain(`href="${png}"`)
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"')
    expectInert(svg)
  })

  it('accepts the other inline raster types and refuses the rest', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      const svg = sanitized(`<svg><image href="data:${type};base64,AAAA" width="1" height="1"/></svg>`)
      expect(svg).toContain(`data:${type};base64,AAAA`)
    }
    for (const type of ['image/svg+xml', 'text/html', 'application/xml', 'image/png-x']) {
      const svg = sanitized(`<svg><image href="data:${type};base64,AAAA" width="1" height="1"/></svg>`)
      expect(svg).not.toContain('base64')
    }
  })

  it('keeps a relative reference to a sibling asset', () => {
    const svg = sanitized(`<svg><image href="sprites/icon.png" width="8" height="8"/></svg>`)
    expect(svg).toContain('href="sprites/icon.png"')
  })

  it('keeps an inline style that fetches nothing', () => {
    const svg = sanitized(
      `<svg><rect style="fill:rgb(255, 0, 0);opacity:.5" width="1" height="1"/></svg>`,
    )
    expect(svg).toContain('style="fill:rgb(255, 0, 0);opacity:.5"')
  })

  it('drops a reference whose target could never survive', () => {
    // `<filter>` is not on the element allowlist, so keeping `filter="url(#f)"`
    // would leave a dangling reference — and a dangling filter hides the shape
    // that carries it, which is worse than losing the effect.
    const svg = sanitized(
      `<svg><filter id="f"><feGaussianBlur stdDeviation="2"/></filter><rect filter="url(#f)" fill="#000" width="1" height="1"/></svg>`,
    )
    expect(svg).toContain('<rect fill="#000" width="1" height="1"/>')
    expect(svg).not.toContain('filter')
  })

  it('keeps a nested svg viewport', () => {
    const svg = sanitized(`<svg viewBox="0 0 8 8"><svg x="1" y="1" width="4" height="4"><rect width="4" height="4"/></svg></svg>`)
    expect(svg).toContain('<svg x="1" y="1" width="4" height="4">')
    // The namespace is declared once, on the document element.
    expect(svg.match(/xmlns=/g)?.length).toBe(1)
  })

  it('normalises element and attribute casing to the SVG spelling', () => {
    const svg = sanitized(
      `<svg VIEWBOX="0 0 4 4"><LINEARGRADIENT ID="g" GRADIENTUNITS="userSpaceOnUse"><STOP OFFSET="0"/></LINEARGRADIENT></svg>`,
    )
    expect(svg).toContain('viewBox="0 0 4 4"')
    expect(svg).toContain('<linearGradient id="g" gradientUnits="userSpaceOnUse">')
    expect(svg).toContain('<stop offset="0"/>')
  })

  it('emits the xlink namespace only when a reference needs it', () => {
    expect(sanitized(`<svg><use xlink:href="#a"/></svg>`)).toContain('xmlns:xlink=')
    expect(sanitized(`<svg><use href="#a"/></svg>`)).not.toContain('xmlns:xlink=')
  })

  it('survives a round trip through its own output', () => {
    const once = sanitized(GRADIENT)
    expect(sanitized(once)).toBe(once)
  })

  it('keeps whitespace-only markup and a bare root usable', () => {
    expect(sanitized(`<svg/>`)).toBe(`<svg xmlns="${NS}"/>`)
    expect(sanitized(`  \n<svg xmlns="${NS}"></svg>\n  `)).toBe(`<svg xmlns="${NS}"/>`)
  })
})

/* ------------------------------------------------------------------ *
 * Refusals
 * ------------------------------------------------------------------ */

describe('sanitizeSvg — refusals', () => {
  const MALFORMED: { name: string; svg: string }[] = [
    { name: 'empty input', svg: '' },
    { name: 'whitespace only', svg: '   \n\t ' },
    { name: 'no root element', svg: 'just some text' },
    { name: 'root element is not svg', svg: '<html><body><svg/></body></html>' },
    { name: 'unclosed root', svg: '<svg><g>' },
    { name: 'mismatched closing tag', svg: '<svg><g></svg>' },
    { name: 'stray closing tag', svg: '<svg></svg></svg>' },
    { name: 'unterminated comment', svg: '<svg><!-- <script>alert(1)</script>' },
    { name: 'unterminated CDATA', svg: '<svg><title><![CDATA[<script>' },
    { name: 'unterminated attribute value', svg: '<svg width="10><rect/></svg>' },
    { name: 'unterminated tag', svg: '<svg width="10"' },
    { name: 'unterminated raw text element', svg: '<svg><script>alert(1)' },
    { name: 'two root elements', svg: '<svg/><svg/>' },
    {
      name: 'internal DTD subset',
      svg: '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg><title>&xxe;</title></svg>',
    },
  ]

  for (const item of MALFORMED) {
    it(`refuses ${item.name}`, () => {
      expect(rejection(item.svg)).toBeTruthy()
    })
  }

  it('refuses input beyond the source cap', () => {
    const filler = '<g></g>'.repeat(2000)
    const huge = `<svg>${filler.repeat(Math.ceil(SVG_SANITIZE_LIMITS.sourceLength / filler.length))}</svg>`
    expect(huge.length).toBeGreaterThan(SVG_SANITIZE_LIMITS.sourceLength)
    expect(rejection(huge)).toContain('体积')
  })

  it('refuses absurd nesting depth', () => {
    const depth = SVG_SANITIZE_LIMITS.depth + 10
    const nested = `<svg>${'<g>'.repeat(depth)}${'</g>'.repeat(depth)}</svg>`
    expect(rejection(nested)).toContain('嵌套')
  })

  it('refuses absurd nesting depth built out of unknown elements', () => {
    const depth = SVG_SANITIZE_LIMITS.depth + 10
    const nested = `<svg>${'<x>'.repeat(depth)}${'</x>'.repeat(depth)}</svg>`
    expect(rejection(nested)).toContain('嵌套')
  })

  it('refuses an element count beyond the cap', () => {
    const many = `<svg>${'<g/>'.repeat(SVG_SANITIZE_LIMITS.elements + 10)}</svg>`
    expect(rejection(many)).toContain('元素过多')
  })

  it('refuses an element carrying more attributes than the cap', () => {
    const attributes = Array.from({ length: SVG_SANITIZE_LIMITS.attributes + 10 }, (_, i) => `a${i}="1"`)
    expect(rejection(`<svg ${attributes.join(' ')}/>`)).toContain('属性过多')
  })
})

/* ------------------------------------------------------------------ *
 * Robustness
 * ------------------------------------------------------------------ */

describe('sanitizeSvg — robustness', () => {
  /** Deterministic, so a failure is reproducible from the test name alone. */
  function random(seed: number): () => number {
    let state = seed >>> 0
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0
      return state / 0x100000000
    }
  }

  it('never throws and always terminates on mutated payloads', () => {
    const next = random(20240727)
    const corpus = PAYLOADS.map((payload) => payload.svg)
    const started = Date.now()

    for (let round = 0; round < 4000; round += 1) {
      const source = corpus[Math.floor(next() * corpus.length)]
      const cut = Math.floor(next() * source.length)
      const injected = '<>"\'/&#;\u0000\u200b= \n'.charAt(Math.floor(next() * 16))
      const mutated =
        next() < 0.5
          ? source.slice(0, cut)
          : source.slice(0, cut) + injected + source.slice(cut + Math.floor(next() * 3))

      const result = sanitizeSvg(mutated)
      expect(typeof result.ok).toBe('boolean')
      if (result.ok) expectInert(result.svg)
    }

    // A hang would show up here long before the suite timeout does.
    expect(Date.now() - started).toBeLessThan(20_000)
  })

  it('finishes a pathological but legal document quickly', () => {
    const source = `<svg>${'<g fill="#000">'.repeat(60)}<rect width="1" height="1"/>${'</g>'.repeat(60)}</svg>`
    const started = Date.now()
    expect(sanitizeSvg(source).ok).toBe(true)
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('does not stall on a long run of entity-encoded junk', () => {
    const value = '&#106;'.repeat(20_000)
    const started = Date.now()
    const svg = sanitized(`<svg><use href="${value}"/></svg>`)
    expect(svg).not.toContain('&#106;')
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('does not stall on a deeply parenthesised url() value', () => {
    const value = `url(${'('.repeat(20_000)}`
    const started = Date.now()
    const svg = sanitized(`<svg><rect fill="${value}" width="1" height="1"/></svg>`)
    expect(svg).not.toContain('url(')
    expect(Date.now() - started).toBeLessThan(2000)
  })
})
