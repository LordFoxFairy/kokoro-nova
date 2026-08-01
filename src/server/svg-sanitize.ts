/**
 * SVG sanitisation.
 *
 * An uploaded SVG is served back from this origin, and an SVG opened as a
 * document — rather than drawn inside an `<img>` — runs its own `<script>` with
 * that origin's privileges. The sandbox header on the media route is defence in
 * depth; the stored bytes still have to be inert on their own, because markup
 * outlives the response that first carried it: it gets inlined, copied into a
 * thumbnail pipeline, or re-served from somewhere with a different header set.
 *
 * Detection cannot deliver that. A pattern looking for `javascript:` misses
 * `&#106;avascript:`, one that also decodes entities misses the next spelling,
 * and every round of that game is lost on the first spelling nobody thought of.
 * So nothing here judges whether the input is hostile. The source is parsed,
 * everything not explicitly allowed is dropped with its subtree, and the result
 * is built from scratch out of canonical element names, canonical attribute
 * names and re-escaped values. Whatever the scanner failed to understand cannot
 * reach the output, because the output contains no byte the serialiser did not
 * put there itself.
 *
 * Two decoders, on purpose:
 *   - the *output* decoder follows XML exactly (five named entities, numeric
 *     references terminated by a semicolon), so a value round-trips unchanged;
 *   - the *inspection* decoder is deliberately over-eager — HTML's named
 *     entities, missing semicolons, several rounds — so a value only has to
 *     look dangerous under any plausible reader to be dropped.
 * Over-decoding on the inspection side can only cost a false rejection of one
 * attribute; under-decoding there would cost the whole guarantee.
 */

export interface SvgSanitizeSuccess {
  ok: true
  svg: string
}

export interface SvgSanitizeFailure {
  ok: false
  reason: string
}

export type SvgSanitizeResult = SvgSanitizeSuccess | SvgSanitizeFailure

/**
 * Every loop in this module is bounded by one of these, so hostile input is
 * refused instead of being allowed to burn the request's time or memory.
 */
export const SVG_SANITIZE_LIMITS = {
  /** Source characters. Comfortably above a hand-authored icon carrying an
   * embedded raster, and far below anything that makes a linear scan hurt. */
  sourceLength: 1024 * 1024,
  /** Escaping can grow a value up to sixfold, so the output gets its own cap. */
  outputLength: 2 * 1024 * 1024,
  /** Open elements. Deep nesting is a renderer stack overflow, never a drawing. */
  depth: 64,
  /** Elements encountered, including the ones dropped unread. */
  elements: 20_000,
  /** Attributes on a single element. */
  attributes: 128,
} as const

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

/* ------------------------------------------------------------------ *
 * Allowlists
 * ------------------------------------------------------------------ */

/**
 * Canonical spelling of every element that may appear in the output.
 *
 * Absent on purpose: `style` (a stylesheet can reach for external resources in
 * more syntaxes than can be audited), `filter` and the `fe*` primitives, `a`,
 * `marker`, `foreignObject`, and the whole animation family — `animate` can
 * retarget an attribute at runtime via `attributeName`, which no static
 * attribute check can see coming.
 *
 * `image` is here because an embedded raster is an ordinary thing for an icon
 * to carry; its URL goes through the same gate as every other reference.
 */
const ELEMENTS = [
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'use',
  'symbol',
  'image',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'title',
  'desc',
] as const

/**
 * SVG served as XML is case-sensitive, but the same bytes inlined into HTML are
 * matched case-insensitively and folded back to these spellings. The lookup is
 * therefore case-insensitive and the canonical name is what gets written, so
 * `<LINEARGRADIENT>` becomes `<linearGradient>` and `<SCRIPT>` matches the
 * script rule instead of sliding through as an unknown name.
 */
const ELEMENT_BY_LOWER = new Map(ELEMENTS.map((name) => [name.toLowerCase(), name as string]))

/** Only character data inside these is painted, so text kept anywhere else
 * would be invisible noise in the output. */
const TEXT_CONTENT = new Set(['text', 'tspan', 'title', 'desc'])

/**
 * Elements whose content a browser reads as raw text rather than markup. They
 * are dropped either way; what matters is agreeing with the browser about where
 * they *end*, so `<script>if (a < b) {}</script>` does not derail the scan.
 */
const RAW_TEXT_END = new Map<string, RegExp>([
  ['script', /<\/script[\s/>]/gi],
  ['style', /<\/style[\s/>]/gi],
])

/** Presentation and identity attributes accepted on every allowed element. */
const GLOBAL_ATTRIBUTES = [
  'id',
  'class',
  'transform',
  'style',
  'color',
  'display',
  'visibility',
  'opacity',
  'overflow',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'clip-path',
  'clip-rule',
  'mask',
  'paint-order',
  'shape-rendering',
  'text-rendering',
  'image-rendering',
  'vector-effect',
  'pointer-events',
  'mix-blend-mode',
  'isolation',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-variant',
  'font-stretch',
  'letter-spacing',
  'word-spacing',
  'text-anchor',
  'text-decoration',
  'dominant-baseline',
  'alignment-baseline',
  'baseline-shift',
] as const

/**
 * Both spellings of a reference. `xlink:href` is deprecated but still what most
 * exporters emit, and a sanitiser that only knew `href` would let the other one
 * through as an unknown attribute — or, worse, drop the reference and quietly
 * break every `<use>` in the file.
 */
const HREF_ATTRIBUTES = ['href', 'xlink:href'] as const

const ELEMENT_ATTRIBUTES: Record<string, readonly string[]> = {
  svg: ['x', 'y', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'version'],
  g: [],
  path: ['d', 'pathLength'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
  text: ['x', 'y', 'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust', 'xml:space'],
  tspan: ['x', 'y', 'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust', 'xml:space'],
  defs: [],
  use: ['x', 'y', 'width', 'height', ...HREF_ATTRIBUTES],
  symbol: ['x', 'y', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'refX', 'refY'],
  image: ['x', 'y', 'width', 'height', 'preserveAspectRatio', ...HREF_ATTRIBUTES],
  linearGradient: [
    'x1',
    'y1',
    'x2',
    'y2',
    'gradientUnits',
    'gradientTransform',
    'spreadMethod',
    ...HREF_ATTRIBUTES,
  ],
  radialGradient: [
    'cx',
    'cy',
    'r',
    'fx',
    'fy',
    'fr',
    'gradientUnits',
    'gradientTransform',
    'spreadMethod',
    ...HREF_ATTRIBUTES,
  ],
  stop: ['offset', 'stop-color', 'stop-opacity'],
  clipPath: ['clipPathUnits'],
  mask: ['x', 'y', 'width', 'height', 'maskUnits', 'maskContentUnits'],
  pattern: [
    'x',
    'y',
    'width',
    'height',
    'patternUnits',
    'patternContentUnits',
    'patternTransform',
    'viewBox',
    'preserveAspectRatio',
    ...HREF_ATTRIBUTES,
  ],
  title: [],
  desc: [],
}

/** Per element: lower-cased attribute name → the spelling that gets written.
 * `viewBox` and friends are case-sensitive in XML, so the canonical form has to
 * come from the table rather than from the source. */
const ATTRIBUTES_BY_ELEMENT = new Map<string, Map<string, string>>(
  ELEMENTS.map((element) => [
    element as string,
    new Map(
      [...GLOBAL_ATTRIBUTES, ...(ELEMENT_ATTRIBUTES[element] ?? [])].map((name) => [
        name.toLowerCase(),
        name,
      ]),
    ),
  ]),
)

const HREF_SET = new Set<string>(HREF_ATTRIBUTES)

/** Any of these in scheme position is refused outright; `data:` is judged by
 * its media type instead, and everything else fails the allowlist anyway. */
const BLOCKED_SCHEMES = [
  'javascript',
  'vbscript',
  'livescript',
  'jscript',
  'mocha',
  'about',
  'blob',
  'file',
  'view-source',
]

/* ------------------------------------------------------------------ *
 * Public entry point
 * ------------------------------------------------------------------ */

/**
 * Returns markup that is safe to store and serve, or the reason it could not be
 * produced. Never throws: a caller in an upload path has to be able to treat a
 * hostile file as just another rejection.
 */
export function sanitizeSvg(source: string): SvgSanitizeResult {
  try {
    // The signature says string, but this is a trust boundary and the value
    // arrives from a file on disk by way of a decoder.
    if (typeof source !== 'string') return { ok: false, reason: 'SVG 内容不是文本' }
    if (source.trim().length === 0) return { ok: false, reason: 'SVG 内容为空' }
    if (source.length > SVG_SANITIZE_LIMITS.sourceLength) {
      return { ok: false, reason: 'SVG 体积过大，无法安全处理' }
    }

    const { root, usesXlink } = parse(source)
    const svg = serialise(root, usesXlink)
    if (svg.length > SVG_SANITIZE_LIMITS.outputLength) {
      return { ok: false, reason: 'SVG 体积过大，无法安全处理' }
    }

    // A bug in the serialiser would otherwise ship as stored markup. This turns
    // one into a rejection instead, at the cost of a single pass.
    const breach = firstInvariantBreach(svg)
    if (breach) return { ok: false, reason: `清洗结果未通过自检：${breach}` }

    return { ok: true, svg }
  } catch (error) {
    if (error instanceof SanitizeError) return { ok: false, reason: error.message }
    return { ok: false, reason: 'SVG 解析失败' }
  }
}

/* ------------------------------------------------------------------ *
 * Document model
 * ------------------------------------------------------------------ */

interface Attribute {
  name: string
  value: string
}

interface ElementNode {
  kind: 'element'
  name: string
  attributes: Attribute[]
  children: SvgNode[]
}

interface TextNode {
  kind: 'text'
  value: string
}

type SvgNode = ElementNode | TextNode

class SanitizeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SanitizeError'
  }
}

function fail(reason: string): never {
  throw new SanitizeError(reason)
}

/* ------------------------------------------------------------------ *
 * Scanner
 * ------------------------------------------------------------------ */

interface Frame {
  /** Lower-cased source spelling, so the closing tag can be matched however it
   * was written. */
  name: string
  /** Null while inside a dropped subtree — nothing there has anywhere to go. */
  node: ElementNode | null
}

interface ParseResult {
  root: ElementNode
  usesXlink: boolean
}

/**
 * One left-to-right pass. The cursor only ever moves forward, which is what
 * makes termination a property of the loop rather than a hope about the input.
 */
function parse(source: string): ParseResult {
  const length = source.length
  const stack: Frame[] = []
  let index = 0
  let root: ElementNode | null = null
  let usesXlink = false
  let elements = 0

  const parentOf = (): ElementNode | null => stack[stack.length - 1]?.node ?? null
  const skipping = (): boolean => stack.length > 0 && stack[stack.length - 1].node === null

  while (index < length) {
    const start = index
    const lt = source.indexOf('<', index)

    if (lt < 0) {
      appendText(parentOf(), source.slice(index))
      break
    }
    if (lt > index) {
      appendText(parentOf(), source.slice(index, lt))
      index = lt
    }

    if (source.startsWith('<!--', index)) {
      // Consumed and discarded. A comment is the classic way to hand a naive
      // scanner one set of tags and the browser another.
      const end = source.indexOf('-->', index + 4)
      if (end < 0) fail('注释未闭合')
      index = end + 3
    } else if (source.startsWith('<![CDATA[', index)) {
      const end = source.indexOf(']]>', index + 9)
      if (end < 0) fail('CDATA 未闭合')
      // Character data, and re-escaped as such: markup smuggled inside a CDATA
      // section leaves as text and stays text.
      appendText(parentOf(), source.slice(index + 9, end), { decoded: true })
      index = end + 3
    } else if (source.startsWith('<!', index)) {
      const end = source.indexOf('>', index + 2)
      if (end < 0) fail('声明未闭合')
      // An internal subset can define entities that expand into anything at
      // all, including a billion copies of themselves.
      if (source.slice(index, end).includes('[')) fail('不接受内嵌 DTD 的 SVG')
      index = end + 1
    } else if (source.startsWith('<?', index)) {
      // Processing instructions are dropped whole; `<?xml-stylesheet?>` is a
      // script vector and none of the others survive re-serialisation anyway.
      const end = source.indexOf('?>', index + 2)
      if (end < 0) fail('处理指令未闭合')
      index = end + 2
    } else if (source.startsWith('</', index)) {
      index = closeTag(source, index, stack)
    } else {
      const opened = openTag(source, index)
      index = opened.next
      elements += 1
      if (elements > SVG_SANITIZE_LIMITS.elements) fail('SVG 元素过多')

      const canonical = skipping() ? null : (ELEMENT_BY_LOWER.get(opened.name) ?? null)

      if (canonical === null) {
        if (opened.selfClosing) continue
        const rawTextEnd = RAW_TEXT_END.get(opened.name)
        if (rawTextEnd) {
          index = skipRawText(source, rawTextEnd, index)
          continue
        }
        stack.push({ name: opened.name, node: null })
        if (stack.length > SVG_SANITIZE_LIMITS.depth) fail('SVG 嵌套层级过深')
        continue
      }

      const node: ElementNode = {
        kind: 'element',
        name: canonical,
        attributes: sanitizeAttributes(canonical, opened.attributes),
        children: [],
      }
      if (node.attributes.some((attribute) => attribute.name === 'xlink:href')) usesXlink = true

      const parent = parentOf()
      if (parent) {
        parent.children.push(node)
      } else if (root === null) {
        // Only an `<svg>` may open the document: anything else as the outermost
        // element means the file is not the thing it claimed to be.
        if (canonical !== 'svg') fail('根元素不是 <svg>')
        root = node
      } else {
        fail('存在多个根元素')
      }

      if (!opened.selfClosing) {
        stack.push({ name: opened.name, node })
        if (stack.length > SVG_SANITIZE_LIMITS.depth) fail('SVG 嵌套层级过深')
      }
    }

    // Every branch above consumes at least one character; this is the guard
    // that turns a future editing mistake into a rejection instead of a hang.
    if (index <= start) fail('SVG 解析失败')
  }

  if (stack.length > 0) fail('标签未闭合')
  if (root === null) fail('未找到 <svg> 根元素')
  return { root, usesXlink }
}

interface OpenTag {
  /** Lower-cased, control characters removed. */
  name: string
  attributes: RawAttribute[]
  selfClosing: boolean
  next: number
}

interface RawAttribute {
  name: string
  /** Null for a bare attribute; XML has no valueless attributes, so those are
   * dropped rather than guessed at. */
  value: string | null
}

function openTag(source: string, from: number): OpenTag {
  const length = source.length
  let index = from + 1
  const nameStart = index
  while (index < length && isNameChar(source[index])) index += 1
  const name = stripControl(source.slice(nameStart, index)).toLowerCase()
  if (name.length === 0) fail('标签格式不正确')

  const attributes: RawAttribute[] = []
  let selfClosing = false

  for (;;) {
    while (index < length && isSpace(source[index])) index += 1
    if (index >= length) fail('标签未闭合')

    const char = source[index]
    if (char === '>') {
      index += 1
      break
    }
    if (char === '/') {
      // Only a slash immediately before `>` closes the tag; a stray one is
      // skipped, exactly as a browser skips it.
      if (source[index + 1] === '>') {
        selfClosing = true
        index += 2
        break
      }
      index += 1
      continue
    }

    const attributeStart = index
    while (index < length && !isSpace(source[index]) && !'=/>'.includes(source[index])) index += 1
    if (index === attributeStart) {
      // Nothing consumable here; step over it so the scan cannot stall.
      index += 1
      continue
    }
    const attributeName = source.slice(attributeStart, index)

    while (index < length && isSpace(source[index])) index += 1
    let value: string | null = null
    if (source[index] === '=') {
      index += 1
      while (index < length && isSpace(source[index])) index += 1
      const quote = source[index]
      if (quote === '"' || quote === "'") {
        const end = source.indexOf(quote, index + 1)
        if (end < 0) fail('属性值未闭合')
        value = source.slice(index + 1, end)
        index = end + 1
      } else {
        const valueStart = index
        while (index < length && !isSpace(source[index]) && source[index] !== '>') index += 1
        value = source.slice(valueStart, index)
      }
    }

    attributes.push({ name: attributeName, value })
    if (attributes.length > SVG_SANITIZE_LIMITS.attributes) fail('单个元素属性过多')
  }

  return { name, attributes, selfClosing, next: index }
}

function closeTag(source: string, from: number, stack: Frame[]): number {
  const length = source.length
  let index = from + 2
  const nameStart = index
  while (index < length && isNameChar(source[index])) index += 1
  const name = stripControl(source.slice(nameStart, index)).toLowerCase()

  const end = source.indexOf('>', index)
  if (end < 0) fail('结束标签未闭合')

  const frame = stack.pop()
  if (!frame) fail('存在多余的结束标签')
  if (frame.name !== name) fail('标签未正确闭合')
  return end + 1
}

/** Positions the cursor after the element's closing tag, using the same rule a
 * browser uses for raw-text content: the first `</name` wins, whatever the
 * characters in between look like. */
function skipRawText(source: string, pattern: RegExp, from: number): number {
  pattern.lastIndex = from
  const match = pattern.exec(source)
  if (!match) fail('标签未闭合')
  const end = source.indexOf('>', match.index)
  if (end < 0) fail('标签未闭合')
  return end + 1
}

function appendText(parent: ElementNode | null, raw: string, options?: { decoded?: boolean }) {
  if (!parent || !TEXT_CONTENT.has(parent.name)) return
  const value = stripControl(options?.decoded ? raw : decodeXml(raw))
  if (value.length === 0) return
  parent.children.push({ kind: 'text', value })
}

/* ------------------------------------------------------------------ *
 * Attribute gate
 * ------------------------------------------------------------------ */

function sanitizeAttributes(element: string, raw: RawAttribute[]): Attribute[] {
  const allowed = ATTRIBUTES_BY_ELEMENT.get(element)
  if (!allowed) return []

  const kept: Attribute[] = []
  const seen = new Set<string>()

  for (const attribute of raw) {
    // Control characters are removed before the name is judged, so `on\0load`
    // is read the way a lenient parser would read it rather than as a name
    // nobody has ever heard of.
    const name = stripControl(attribute.name).replace(/\s+/g, '').toLowerCase()
    if (name.length === 0) continue
    // Redundant against the allowlist, and kept anyway: an event handler must
    // stay impossible even if someone later widens the table.
    if (name.startsWith('on')) continue
    if (attribute.value === null) continue

    const canonical = allowed.get(name)
    if (!canonical) continue
    if (seen.has(canonical)) continue

    const value = stripControl(decodeXml(attribute.value))
    if (!isSafeValue(canonical, value)) continue

    seen.add(canonical)
    kept.push({ name: canonical, value })
  }

  return kept
}

function isSafeValue(name: string, value: string): boolean {
  if (HREF_SET.has(name)) return isSafeUrl(value)
  if (name === 'style') return isSafeStyle(value)
  // `fill`, `mask`, `clip-path` and the rest reference other elements through
  // functional notation, and that notation takes a URL.
  if (!urlFunctionsAreLocal(value)) return false
  return !hasDangerousScheme(value)
}

/**
 * The reference allowlist: a same-document fragment, a relative path, or an
 * inline raster. Everything else — including `https:` — is refused, because an
 * absolute reference in a stored asset is a beacon at best.
 */
function isSafeUrl(value: string): boolean {
  if (hasDangerousScheme(value)) return false

  const packed = packForInspection(value)
  if (packed.length === 0) return false
  if (packed.startsWith('#')) return true

  const lower = packed.toLowerCase()
  if (lower.startsWith('data:')) return isSafeDataUrl(lower)

  // A colon before the first `/`, `?` or `#` is a scheme, whatever follows it.
  const colon = packed.indexOf(':')
  if (colon >= 0) {
    const boundary = packed.search(/[/?#]/)
    if (boundary < 0 || colon < boundary) return false
  }
  // A hierarchical reference leaves this origin the moment its first two
  // characters are both slash-ish, and the URL parser reads a backslash as a
  // slash: `/\host/path` and `\/host/path` arrive at `host` just as `//host`
  // does. Folding the two spellings together before the test is what makes it
  // cover every permutation instead of the two that are easy to picture.
  if (packed.replaceAll('\\', '/').startsWith('//')) return false
  // A lone leading backslash is read as a path separator today. Nothing
  // hand-authored needs one, so it is refused rather than left depending on
  // that reading staying put.
  if (packed.startsWith('\\')) return false
  return true
}

function isSafeDataUrl(lower: string): boolean {
  const comma = lower.indexOf(',')
  if (comma < 0) return false
  const [mediaType, ...parameters] = lower.slice('data:'.length, comma).split(';')
  if (!/^image\/(?:png|jpeg|gif|webp)$/.test(mediaType)) return false
  return parameters.every((parameter) => /^[\w.+=-]*$/.test(parameter))
}

/**
 * Inline CSS keeps only declarations that fetch nothing. A stylesheet can reach
 * for a resource through `url()`, `image-set()`, an `@import`, or a backslash
 * escape spelling any of those, and a property-by-property parser that got one
 * of them wrong would be worth less than this line.
 */
function isSafeStyle(value: string): boolean {
  const packed = packForInspection(value).toLowerCase()
  if (/url\(|image-set|expression|@|\\|\/\*|<|>/.test(packed)) return false
  return !hasDangerousScheme(value)
}

/** Every `url(...)` in a value must point inside this same document. */
function urlFunctionsAreLocal(value: string): boolean {
  const lower = value.toLowerCase()
  let from = 0
  for (;;) {
    const open = lower.indexOf('url(', from)
    if (open < 0) return true
    const close = value.indexOf(')', open + 4)
    // An unterminated `url(` is a value no renderer agrees on; refuse it.
    if (close < 0) return false
    const target = packForInspection(stripQuotes(value.slice(open + 4, close)))
    if (!target.startsWith('#')) return false
    from = close + 1
  }
}

function stripQuotes(value: string): string {
  return value.trim().replace(/^["']/, '').replace(/["']$/, '')
}

/**
 * True if the value spells a refused scheme under *any* reading. Successive
 * decodings are tried because a value that survives one round of entity
 * expansion may still be sitting in a context that expands it again.
 */
function hasDangerousScheme(value: string): boolean {
  let current = value
  for (let round = 0; round < 3; round += 1) {
    const packed = packForInspection(current).toLowerCase()
    for (const scheme of BLOCKED_SCHEMES) {
      if (packed.includes(`${scheme}:`)) return true
    }
    // Any `data:` that is not one of the four raster types: `data:text/html`
    // and `data:image/svg+xml` both execute when opened as a document.
    let from = 0
    for (;;) {
      const at = packed.indexOf('data:', from)
      if (at < 0) break
      if (!isSafeDataUrl(packed.slice(at))) return true
      from = at + 5
    }

    const next = decodeLoosely(current)
    if (next === current) break
    current = next
  }
  return false
}

/* ------------------------------------------------------------------ *
 * Entities and character hygiene
 * ------------------------------------------------------------------ */

/** Exactly what an XML parser resolves, so decoding then re-escaping leaves a
 * legitimate value byte-identical. */
const XML_ENTITY = /&(?:(amp|lt|gt|quot|apos);|#(\d{1,7});|#[xX]([\da-fA-F]{1,6});)/g

const XML_NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeXml(value: string): string {
  if (!value.includes('&')) return value
  return value.replace(XML_ENTITY, (match, named: string | undefined, dec: string | undefined, hex: string | undefined) => {
    if (named) return XML_NAMED[named]
    const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? '', 16)
    return fromCodePoint(code) ?? match
  })
}

/** The characters a payload hides a scheme behind, spelled as entities. */
const LOOSE_NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  semi: ';',
  sol: '/',
  bsol: '\\',
  lpar: '(',
  rpar: ')',
  num: '#',
  tab: '\t',
  newline: '\n',
  nbsp: ' ',
  space: ' ',
}

/** Named entities without their semicolon, numeric ones without theirs, any
 * case: everything a lenient reader would still resolve. */
const LOOSE_ENTITY = /&(?:#[xX]([\da-fA-F]{1,6});?|#(\d{1,7});?|([a-zA-Z]{2,10});?)/g

function decodeLoosely(value: string): string {
  if (!value.includes('&')) return value
  return value.replace(LOOSE_ENTITY, (match, hex: string | undefined, dec: string | undefined, named: string | undefined) => {
    if (named !== undefined) return LOOSE_NAMED[named.toLowerCase()] ?? match
    const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? '', 16)
    return fromCodePoint(code) ?? match
  })
}

function fromCodePoint(code: number): string | null {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return null
  // Lone surrogates would corrupt the string they land in.
  if (code >= 0xd800 && code <= 0xdfff) return null
  return String.fromCodePoint(code)
}

/** C0 and C1 controls, minus the three whitespace characters that carry meaning
 * inside text. NUL is the interesting one: it is invisible in a URL and several
 * parsers step straight over it. */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g

function stripControl(value: string): string {
  return value.replace(CONTROL, '')
}

/** Everything a URL parser ignores, removed, so obfuscation by whitespace or
 * zero-width characters cannot separate a scheme from its colon. */
const INVISIBLE = /[\s\u0000-\u0020\u007f-\u00a0\u200b-\u200f\u2028\u2029\ufeff]/g

function packForInspection(value: string): string {
  return decodeLoosely(value).replace(INVISIBLE, '')
}

/* ------------------------------------------------------------------ *
 * Serialiser
 * ------------------------------------------------------------------ */

function serialise(root: ElementNode, usesXlink: boolean): string {
  // The namespace is asserted rather than copied: the input's own `xmlns` never
  // survives the attribute gate, so a file claiming to be XHTML comes back as
  // the SVG it is being stored as.
  const namespaces = ` xmlns="${SVG_NS}"${usesXlink ? ` xmlns:xlink="${XLINK_NS}"` : ''}`
  return write(root, namespaces)
}

function write(node: ElementNode, extraAttributes = ''): string {
  const attributes = node.attributes
    .map((attribute) => ` ${attribute.name}="${escapeAttribute(attribute.value)}"`)
    .join('')
  const open = `<${node.name}${extraAttributes}${attributes}`

  if (node.children.length === 0) return `${open}/>`

  const body = node.children
    .map((child) => (child.kind === 'text' ? escapeText(child.value) : write(child)))
    .join('')
  return `${open}>${body}</${node.name}>`
}

function escapeText(value: string): string {
  // Quotes are escaped in text as well, which is what makes a `"` in the output
  // necessarily an attribute delimiter — the invariant check below leans on it.
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function escapeAttribute(value: string): string {
  return escapeText(value)
}

/* ------------------------------------------------------------------ *
 * Self-check
 * ------------------------------------------------------------------ */

const FORBIDDEN_TAG =
  /<\s*\/?\s*(?:script|foreignobject|iframe|embed|object|style|animate|animatetransform|animatemotion|set|handler)\b/i
const EVENT_ATTRIBUTE = /\son[a-z-]{2,}\s*=\s*"/i
const ATTRIBUTE_VALUE = /="([^"]*)"/g

/**
 * Reads the finished markup back the way a browser would and refuses to hand it
 * over if anything hostile survived. Text escapes quotes too, so a `"` in the
 * output can only be an attribute delimiter — which is what lets these patterns
 * tell an attribute apart from a caption that happens to mention `onclick`.
 */
function firstInvariantBreach(svg: string): string | null {
  if (FORBIDDEN_TAG.test(svg)) return '出现了不允许的元素'
  if (EVENT_ATTRIBUTE.test(svg)) return '出现了事件处理属性'
  for (const match of svg.matchAll(ATTRIBUTE_VALUE)) {
    if (hasDangerousScheme(decodeXml(match[1]))) return '属性值包含危险协议'
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Character classes
 * ------------------------------------------------------------------ */

function isSpace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f'
}

function isNameChar(char: string): boolean {
  return /[A-Za-z0-9_.:-]/.test(char)
}
