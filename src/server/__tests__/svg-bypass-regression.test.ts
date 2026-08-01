import { describe, expect, it } from 'vitest'
import { sanitizeSvg } from '@/server/svg-sanitize'

/** The payloads a prior review found were being stored verbatim. */
const PAYLOADS: [string, string][] = [
  ['svg:script', '<svg xmlns="http://www.w3.org/2000/svg"><svg:script>alert(document.domain)</svg:script></svg>'],
  ['entity javascript', '<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="&#106;avascript:alert(1)">x</a></svg>'],
  ['colon entity', '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript&colon;alert(1)">x</a></svg>'],
  ['animate values', '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" values="&#106;avascript:alert(1)"/></svg>'],
  ['foreignObject', '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body><iframe src="&#106;avascript:alert(1)"></iframe></body></foreignObject></svg>'],
  ['xml-stylesheet', '<?xml-stylesheet href="//evil.example/x.xsl"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'],
  ['external image', '<svg xmlns="http://www.w3.org/2000/svg"><image href="//evil.example/pixel.png"/></svg>'],
  ['backslash authority', '<svg xmlns="http://www.w3.org/2000/svg"><image href="/\\evil.example/x.png"/></svg>'],
  ['plain script', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
  ['onload', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'],
]

describe('sanitizer neutralises every known bypass', () => {
  for (const [name, payload] of PAYLOADS) {
    it(name, () => {
      const result = sanitizeSvg(payload)
      if (!result.ok) return // rejecting outright is also safe
      const out = result.svg.toLowerCase()
      expect(out).not.toContain('script')
      expect(out).not.toContain('javascript')
      expect(out).not.toMatch(/\son\w+\s*=/)
      expect(out).not.toContain('evil.example')
      expect(out).not.toContain('foreignobject')
    })
  }
})
