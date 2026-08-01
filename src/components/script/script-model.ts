/**
 * 脚本 V2 model: shots, assets and the three-phase draft that carries them.
 *
 * Everything here is pure and framework-free so the parsing / extraction /
 * composition rules can be reasoned about (and unit-tested) without mounting
 * the wizard. The UI in `ScriptWizard.tsx` only reads and replaces drafts.
 */

import { CAMERA_MOVES, SHOT_SIZES } from '@/domain/libraries'
import type { OutputSpec } from '@/domain/types'

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type ShotSize = (typeof SHOT_SIZES)[number]

export interface Shot {
  id: string
  /** 1-based 镜号 shown in the table; always kept dense by `reindexShots`. */
  index: number
  /** Clamped to MIN_SHOT_SECONDS..MAX_SHOT_SECONDS. */
  durationSeconds: number
  description: string
  shotSize: ShotSize
  dialogue: string
  sfx: string
  cameraMove: string
  /** Phase-3 output; empty until composed. */
  finalPrompt: string
  /** ScriptAsset ids this shot depends on. */
  assetRefs: string[]
}

export type ScriptAssetKind = 'character' | 'scene' | 'prop'
export type ScriptAssetSource = 'ai' | 'canvas' | 'upload'

export interface ScriptAsset {
  id: string
  kind: ScriptAssetKind
  name: string
  description: string
  source: ScriptAssetSource
  /** 0..359, used for the placeholder gradient before a real image exists. */
  previewHue: number
  /** Object URL or artifact URL once the asset carries real pixels. */
  referenceUrl: string | null
}

export type ScriptEntry = 'screenplay' | 'character' | 'manual'

export interface ScriptDraft {
  entry: ScriptEntry | null
  logline: string
  shots: Shot[]
  assets: ScriptAsset[]
}

export const MIN_SHOT_SECONDS = 5
export const MAX_SHOT_SECONDS = 15

export const DEFAULT_SHOT_SIZE: ShotSize = '中景'

export const ASSET_KINDS: ScriptAssetKind[] = ['character', 'scene', 'prop']

export const ASSET_KIND_LABEL: Record<ScriptAssetKind, string> = {
  character: '角色',
  scene: '场景',
  prop: '道具',
}

export const ASSET_SOURCE_LABEL: Record<ScriptAssetSource, string> = {
  ai: 'AI 生成',
  canvas: '当前画布',
  upload: '本地上传',
}

/* ------------------------------------------------------------------ *
 * Ids
 * ------------------------------------------------------------------ */

// Rows created at runtime only need to be unique inside one draft, but they
// must never collide with the deterministic ids handed out by the parser.
let localSequence = 0

function localId(prefix: string): string {
  localSequence += 1
  return `${prefix}_l${localSequence.toString(36)}${Date.now().toString(36).slice(-4)}`
}

/* ------------------------------------------------------------------ *
 * Factories
 * ------------------------------------------------------------------ */

export function clampDuration(value: number): number {
  if (!Number.isFinite(value)) return MIN_SHOT_SECONDS
  return Math.min(MAX_SHOT_SECONDS, Math.max(MIN_SHOT_SECONDS, Math.round(value)))
}

export function createShot(partial: Partial<Shot> = {}): Shot {
  return {
    id: partial.id ?? localId('shot'),
    index: partial.index ?? 1,
    durationSeconds: clampDuration(partial.durationSeconds ?? MIN_SHOT_SECONDS),
    description: partial.description ?? '',
    shotSize: partial.shotSize ?? DEFAULT_SHOT_SIZE,
    dialogue: partial.dialogue ?? '',
    sfx: partial.sfx ?? '',
    cameraMove: partial.cameraMove ?? '',
    finalPrompt: partial.finalPrompt ?? '',
    assetRefs: partial.assetRefs ? [...partial.assetRefs] : [],
  }
}

export function createAsset(partial: Partial<ScriptAsset> & { name: string }): ScriptAsset {
  return {
    id: partial.id ?? localId('sa'),
    kind: partial.kind ?? 'character',
    name: partial.name,
    description: partial.description ?? '',
    source: partial.source ?? 'ai',
    previewHue: partial.previewHue ?? hueFromName(partial.name),
    referenceUrl: partial.referenceUrl ?? null,
  }
}

export function emptyDraft(entry: ScriptEntry | null = null): ScriptDraft {
  return { entry, logline: '', shots: [], assets: [] }
}

/** Stable 0..359 hue so the same name always paints the same placeholder. */
export function hueFromName(name: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % 360
}

/* ------------------------------------------------------------------ *
 * Shot list operations
 * ------------------------------------------------------------------ */

export function reindexShots(shots: Shot[]): Shot[] {
  return shots.map((shot, i) => (shot.index === i + 1 ? shot : { ...shot, index: i + 1 }))
}

export function moveShot(shots: Shot[], from: number, to: number): Shot[] {
  if (from === to || from < 0 || to < 0 || from >= shots.length || to >= shots.length) return shots
  const next = shots.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return reindexShots(next)
}

export function updateShot(shots: Shot[], shotId: string, patch: Partial<Shot>): Shot[] {
  return shots.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot))
}

export function removeShot(shots: Shot[], shotId: string): Shot[] {
  return reindexShots(shots.filter((shot) => shot.id !== shotId))
}

export function appendShot(shots: Shot[], partial: Partial<Shot> = {}): Shot[] {
  // A fresh row inherits the previous 景别 so a sequence stays visually consistent.
  const previous = shots[shots.length - 1]
  return reindexShots([
    ...shots,
    createShot({ shotSize: previous?.shotSize ?? DEFAULT_SHOT_SIZE, ...partial }),
  ])
}

/* ------------------------------------------------------------------ *
 * Screenplay parsing
 * ------------------------------------------------------------------ */

/**
 * Heading markers that start a new shot. Each regex matches ONLY the marker
 * prefix so the remainder of the line stays available as 画面 content.
 *
 * The 场景/镜头 forms deliberately require either a number or a colon, because
 * a plain "镜头缓缓推近。" is prose, not a heading.
 */
const HEADING_MARKERS: RegExp[] = [
  /^#{1,4}\s+/,
  /^(?:场景|镜头|分镜|场次|画面|scene|shot)\s*[0-9０-９零一二三四五六七八九十百]+\s*[：:、.．)）]?\s*/i,
  /^(?:场景|镜头|分镜|场次|scene|shot)\s*[：:]\s*/i,
  /^第\s*[0-9０-９零一二三四五六七八九十百]+\s*(?:场|镜|幕|个镜头)\s*[：:、.．)）]?\s*/,
  /^[【\[（(]\s*(?:镜头|场景|分镜|shot|scene)[^】\]）)]*[】\]）)]\s*/i,
  /^\s*[0-9０-９]{1,3}\s*[.、．)）：:]\s*/,
  /^(?:int|ext|int\.\/ext)\.?\s+/i,
]

/** Labelled lines inside a block map straight onto shot fields. */
const FIELD_MARKERS: { field: keyof Shot | 'duration'; re: RegExp }[] = [
  { field: 'description', re: /^(?:画面|描述|内容|动作|visual|action)\s*[：:]\s*/i },
  { field: 'dialogue', re: /^(?:对白|台词|对话|旁白|dialogue|dialog|vo)\s*[：:]\s*/i },
  { field: 'sfx', re: /^(?:音效|声音|环境音|sfx|sound)\s*[：:]\s*/i },
  { field: 'cameraMove', re: /^(?:运镜|镜头运动|摄影机|机位|camera)\s*[：:]\s*/i },
  { field: 'shotSize', re: /^(?:景别|shot\s*size)\s*[：:]\s*/i },
  { field: 'duration', re: /^(?:时长|时间|duration)\s*[：:]\s*/i },
]

/** `角色名：台词` — a short prefix before a colon reads as a character cue. */
const CHARACTER_CUE = /^([一-龥A-Za-z·\s]{1,8})[：:]\s*(\S.*)$/

const QUOTED_LINE = /^[「“"'『]([\s\S]+)[」”"'』]$/

/** 景别 hints, longest first so 中近景 wins over 近景. */
const SHOT_SIZE_HINTS = [...SHOT_SIZES].sort((a, b) => b.length - a.length)

/**
 * 运镜 hints. Single-character preset names (推 / 拉) are excluded — they match
 * far too much ordinary prose to be a reliable signal.
 */
const CAMERA_HINTS = [
  ...new Set([
    ...CAMERA_MOVES.map((move) => move.name).filter((name) => name.length >= 2),
    '推近',
    '拉远',
    '环绕',
    '俯拍',
    '仰拍',
    '航拍',
    '摇镜',
    '升降',
  ]),
].sort((a, b) => b.length - a.length)

function normalizeScreenplay(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/　/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function matchHeading(line: string): RegExpMatchArray | null {
  for (const re of HEADING_MARKERS) {
    const match = line.match(re)
    // A marker that swallows the whole line is a bare label, still a heading.
    if (match) return match
  }
  return null
}

/**
 * Split the normalized screenplay into per-shot blocks, in priority order:
 *
 * 1. Explicit headings (场景 / 镜头 / 第 N 场 / numbered beats / INT./EXT.).
 *    Two or more are required — a lone title line should not collapse the whole
 *    text into a single shot.
 * 2. Blank-line separated paragraphs.
 * 3. Sentence boundaries (。！？!?), one sentence per shot, for a single wall of
 *    text with no structure at all.
 */
function splitIntoBlocks(normalized: string): string[] {
  const lines = normalized.split('\n')
  const headingRows: number[] = []
  lines.forEach((line, i) => {
    if (line && matchHeading(line)) headingRows.push(i)
  })

  if (headingRows.length >= 2) {
    const blocks: string[] = []
    headingRows.forEach((start, i) => {
      const end = headingRows[i + 1] ?? lines.length
      const slice = lines.slice(start, end)
      const marker = matchHeading(slice[0])
      // Keep whatever followed the marker; drop the marker itself.
      slice[0] = marker ? slice[0].slice(marker[0].length).trim() : slice[0]
      const block = slice.filter((line) => line.length > 0).join('\n')
      if (block) blocks.push(block)
    })
    if (blocks.length > 0) return blocks
  }

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
  if (paragraphs.length >= 2) return paragraphs

  const sentences = normalized
    .split(/(?<=[。！？!?])\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  if (sentences.length >= 2) return sentences

  return normalized ? [normalized] : []
}

function findHint(text: string, hints: string[]): string | null {
  for (const hint of hints) {
    if (text.includes(hint)) return hint
  }
  return null
}

function isShotSize(value: string): value is ShotSize {
  return (SHOT_SIZES as readonly string[]).includes(value)
}

/** Longer beats read longer: ~30 characters of description per extra second. */
function durationFromLength(charCount: number): number {
  return clampDuration(MIN_SHOT_SECONDS + Math.floor(charCount / 30))
}

function shotFromBlock(block: string, order: number): Shot {
  const descriptions: string[] = []
  const dialogues: string[] = []
  const sfxLines: string[] = []
  let cameraMove = ''
  let shotSize: ShotSize | null = null
  let explicitDuration: number | null = null

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const marker = FIELD_MARKERS.find((entry) => entry.re.test(line))
    if (marker) {
      const value = line.replace(marker.re, '').trim()
      if (!value) continue
      if (marker.field === 'description') descriptions.push(value)
      else if (marker.field === 'dialogue') dialogues.push(value)
      else if (marker.field === 'sfx') sfxLines.push(value)
      else if (marker.field === 'cameraMove') cameraMove = cameraMove || value
      else if (marker.field === 'shotSize' && isShotSize(value)) shotSize = value
      else if (marker.field === 'duration') {
        const seconds = Number.parseFloat(value)
        if (Number.isFinite(seconds)) explicitDuration = seconds
      }
      continue
    }

    const quoted = line.match(QUOTED_LINE)
    if (quoted) {
      dialogues.push(quoted[1].trim())
      continue
    }

    const cue = line.match(CHARACTER_CUE)
    if (cue) {
      dialogues.push(`${cue[1].trim()}：${cue[2].trim()}`)
      continue
    }

    descriptions.push(line)
  }

  const description = descriptions.join(' ')
  const blockText = block

  if (!shotSize) {
    const hint = findHint(blockText, SHOT_SIZE_HINTS)
    if (hint && isShotSize(hint)) shotSize = hint
  }
  if (!cameraMove) {
    cameraMove = findHint(blockText, CAMERA_HINTS) ?? ''
  }
  if (explicitDuration === null) {
    const inline = blockText.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:秒|s\b|sec)/i)
    if (inline) explicitDuration = Number.parseFloat(inline[1])
  }

  return createShot({
    id: `shot_p${order + 1}`,
    index: order + 1,
    durationSeconds:
      explicitDuration === null ? durationFromLength(description.length) : clampDuration(explicitDuration),
    description,
    shotSize: shotSize ?? DEFAULT_SHOT_SIZE,
    dialogue: dialogues.join(' / '),
    sfx: sfxLines.join(' / '),
    cameraMove,
  })
}

/**
 * Split a pasted screenplay into shots. Deterministic: the same text always
 * produces the same shots, ids included (`shot_p1`, `shot_p2`, …).
 */
export function parseScreenplay(text: string): Shot[] {
  const normalized = normalizeScreenplay(text)
  if (!normalized) return []
  const blocks = splitIntoBlocks(normalized)
  const shots = blocks
    .map((block, order) => shotFromBlock(block, order))
    .filter((shot) => shot.description || shot.dialogue || shot.sfx)
  return reindexShots(shots).map((shot, i) => ({ ...shot, id: `shot_p${i + 1}` }))
}

/** First meaningful line of a screenplay, used as the draft 一句话简介. */
export function deriveLogline(text: string): string {
  const normalized = normalizeScreenplay(text)
  if (!normalized) return ''
  for (const line of normalized.split('\n')) {
    const cleaned = line.replace(/^#{1,4}\s+/, '').trim()
    if (cleaned.length >= 2) return cleaned.slice(0, 60)
  }
  return ''
}

/* ------------------------------------------------------------------ *
 * Asset extraction
 * ------------------------------------------------------------------ */

const MENTION = /@([A-Za-z][A-Za-z0-9_]{1,19}|[一-龥]{1,8})/g
const HAN_RUN = /[一-龥]{2,}/g
const LATIN_PROPER = /\b[A-Z][a-z]{2,15}\b/g

/**
 * Frequent connectives and craft vocabulary. Without this list the n-gram
 * counter happily proposes 「然后」 and 「画面」 as characters.
 */
const NOUN_STOPWORDS = new Set([
  '然后', '接着', '因为', '所以', '但是', '如果', '虽然', '于是', '同时', '这时', '此时', '突然',
  '一个', '一只', '一场', '一起', '一边', '一样', '一直', '这个', '那个', '什么', '没有', '可以',
  '已经', '正在', '继续', '开始', '结束', '出现', '消失', '看着', '走向', '转身', '缓缓', '慢慢',
  '轻轻', '静静', '远处', '近处', '前方', '后方', '左边', '右边', '上方', '下方', '中间', '周围',
  '我们', '他们', '她们', '自己', '大家', '所有', '一些', '很多', '两个', '三个', '整个',
  '画面', '镜头', '背景', '前景', '光线', '声音', '音效', '对白', '台词', '运镜', '时长', '氛围',
  '色调', '构图', '主体', '特效', '转场', '节奏', '视角', '风格', '质感', '细节', '状态', '动作',
  '表情', '情绪', '眼神', '身体', '手上', '脸上', '身上', '心里', '空气', '时间', '瞬间', '之后',
  '之前', '最后', '最终', '慢慢地', '缓缓地',
])

interface NounCandidate {
  name: string
  count: number
  shots: Set<number>
  order: number
}

function collectShotText(shot: Shot): string {
  return [shot.description, shot.dialogue, shot.sfx, shot.cameraMove].filter(Boolean).join('\n')
}

function isNoiseName(name: string): boolean {
  if (NOUN_STOPWORDS.has(name)) return true
  if ((SHOT_SIZES as readonly string[]).includes(name)) return true
  if (CAMERA_HINTS.includes(name)) return true
  return false
}

/*
 * Classification keys are split into whole-word keywords and *trailing*
 * characters. Chinese compound nouns are head-final — 老城区 is a place because
 * it ends in 区 — so a single character must only count at the end of the name.
 * Matching 林 anywhere would file the character 林夏 under 场景.
 */
const SCENE_KEYWORDS = [
  '广场', '走廊', '教室', '办公', '码头', '天台', '仓库', '荒野', '沙漠', '雪原', '基地', '实验',
  '医院', '车厢', '街道', '巷子', '车站', '机场',
]
const SCENE_SUFFIXES = [
  '场', '室', '厅', '街', '巷', '城', '村', '镇', '山', '河', '海', '湖', '林', '院', '屋', '房',
  '楼', '店', '馆', '园', '桥', '路', '站', '港', '区', '岛', '谷', '原', '地', '台', '道', '口',
]

const PROP_KEYWORDS = ['钥匙', '戒指', '项链', '手机', '相机', '照片', '地图', '面具', '令牌', '徽章']
const PROP_SUFFIXES = [
  '剑', '刀', '枪', '弓', '盾', '灯', '书', '信', '盒', '箱', '包', '袋', '杯', '瓶', '伞', '镜',
  '表', '钟', '帽', '车', '船', '机', '琴', '花', '纸', '笔', '药', '牌', '章', '匙', '伞',
]

export function classifyAssetKind(name: string): ScriptAssetKind {
  const tail = name.slice(-1)
  if (SCENE_KEYWORDS.some((keyword) => name.includes(keyword))) return 'scene'
  if (PROP_KEYWORDS.some((keyword) => name.includes(keyword))) return 'prop'
  if (SCENE_SUFFIXES.includes(tail)) return 'scene'
  if (PROP_SUFFIXES.includes(tail)) return 'prop'
  return 'character'
}

/** Two names collide when either shares a 2-character window with the other. */
function sharesFragment(a: string, b: string): boolean {
  if (a.length < 2 || b.length < 2) return a === b
  for (let i = 0; i + 2 <= a.length; i += 1) {
    if (b.includes(a.slice(i, i + 2))) return true
  }
  for (let i = 0; i + 2 <= b.length; i += 1) {
    if (a.includes(b.slice(i, i + 2))) return true
  }
  return false
}

/**
 * Propose assets from the shot table.
 *
 * Two deterministic signals:
 * 1. `@mentions` — an explicit author intent, always proposed, in first-appearance order.
 * 2. Repeated proper nouns — 2–4 character Han n-grams (and capitalised Latin
 *    words) that show up in at least two different shots, after stopword and
 *    craft-vocabulary filtering. Because every window of a name is counted,
 *    candidates are then accepted greedily by strength and anything sharing a
 *    fragment with an accepted name is dropped: 「老城区」 wins, and the
 *    sliding-window debris 「老城区窄」/「城区窄巷」 never surfaces.
 */
export function extractAssets(shots: Shot[]): ScriptAsset[] {
  const mentions = new Map<string, { shots: Set<number>; order: number }>()
  const nouns = new Map<string, NounCandidate>()
  let order = 0

  shots.forEach((shot, shotIndex) => {
    const text = collectShotText(shot)
    if (!text) return

    for (const match of text.matchAll(MENTION)) {
      const name = match[1]
      const existing = mentions.get(name)
      if (existing) existing.shots.add(shotIndex)
      else {
        order += 1
        mentions.set(name, { shots: new Set([shotIndex]), order })
      }
    }

    // @mentions are removed first so their names are not double-counted as nouns.
    const plain = text.replace(MENTION, ' ')

    const bump = (name: string) => {
      const existing = nouns.get(name)
      if (existing) {
        existing.count += 1
        existing.shots.add(shotIndex)
        return
      }
      order += 1
      nouns.set(name, { name, count: 1, shots: new Set([shotIndex]), order })
    }

    for (const run of plain.matchAll(HAN_RUN)) {
      const chunk = run[0]
      for (let size = 2; size <= 4; size += 1) {
        for (let start = 0; start + size <= chunk.length; start += 1) {
          bump(chunk.slice(start, start + size))
        }
      }
    }
    for (const latin of plain.matchAll(LATIN_PROPER)) bump(latin[0])
  })

  const mentionNames = [...mentions.keys()]
  // Explicit @mentions seed the accepted set, so a noun that overlaps one of
  // them (a fragment of the same name) never becomes a second asset.
  const accepted = [...mentionNames]
  const all = [...nouns.values()]

  const nounNames = all
    .filter((candidate) => candidate.shots.size >= 2 && !isNoiseName(candidate.name))
    // Maximal munch: a window that only ever occurs inside a longer window
    // carries no information of its own — 「区窄」 is debris of 「老城区窄巷」.
    .filter(
      (candidate) =>
        !all.some(
          (other) =>
            other.name.length > candidate.name.length &&
            other.name.includes(candidate.name) &&
            other.count === candidate.count,
        ),
    )
    .sort(
      (a, b) =>
        b.shots.size - a.shots.size ||
        b.count - a.count ||
        b.name.length - a.name.length ||
        a.order - b.order,
    )
    .filter((candidate) => {
      if (accepted.some((name) => sharesFragment(name, candidate.name))) return false
      accepted.push(candidate.name)
      return true
    })
    .slice(0, 6)

  const proposals: ScriptAsset[] = []

  const push = (name: string) => {
    proposals.push(
      createAsset({
        id: `sa_x${proposals.length + 1}`,
        name,
        kind: classifyAssetKind(name),
        // Left empty on purpose: the description feeds the composed prompt, so
        // an auto-written placeholder would leak straight into generation.
        description: '',
        source: 'ai',
      }),
    )
  }

  ;[...mentions.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .forEach(([name]) => push(name))
  nounNames.forEach((candidate) => push(candidate.name))

  return proposals
}

/** Merge proposals into an existing list, skipping names that already exist. */
export function mergeAssets(existing: ScriptAsset[], proposed: ScriptAsset[]): ScriptAsset[] {
  const takenNames = new Set(existing.map((asset) => asset.name.trim().toLowerCase()))
  const takenIds = new Set(existing.map((asset) => asset.id))
  const merged = [...existing]
  for (const asset of proposed) {
    const key = asset.name.trim().toLowerCase()
    if (!key || takenNames.has(key)) continue
    takenNames.add(key)
    merged.push(takenIds.has(asset.id) ? { ...asset, id: localId('sa') } : asset)
    takenIds.add(asset.id)
  }
  return merged
}

/** A shot references an asset when it is `@mentioned` or named in its text. */
export function shotMentionsAsset(shot: Shot, asset: ScriptAsset): boolean {
  const name = asset.name.trim()
  if (!name) return false
  const text = collectShotText(shot)
  return text.includes(`@${name}`) || text.includes(name)
}

/**
 * Recompute `assetRefs` from the shot text while keeping refs the user attached
 * by hand (they may reference an asset the text never names).
 */
export function syncAssetRefs(draft: ScriptDraft): ScriptDraft {
  const known = new Set(draft.assets.map((asset) => asset.id))
  return {
    ...draft,
    shots: draft.shots.map((shot) => {
      const manual = shot.assetRefs.filter((id) => known.has(id))
      const detected = draft.assets.filter((asset) => shotMentionsAsset(shot, asset)).map((a) => a.id)
      const next = [...new Set([...manual, ...detected])]
      const unchanged = next.length === shot.assetRefs.length && next.every((id, i) => id === shot.assetRefs[i])
      return unchanged ? shot : { ...shot, assetRefs: next }
    }),
  }
}

/* ------------------------------------------------------------------ *
 * Prompt composition — the phase-3 primitive
 * ------------------------------------------------------------------ */

function tidySegment(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/[。；;，,\s]+$/g, '').trim()
}

/** `@` is authoring syntax, never something a generation model should read. */
function stripMentionMarkers(value: string): string {
  return value.replace(/@(?=[一-龥A-Za-z])/g, '')
}

/**
 * Merge 画面 + 景别 + 运镜 (+ 对白 / 音效) with the descriptions of every
 * referenced asset into one prompt string.
 *
 * Assets resolve from `shot.assetRefs` first; assets named in the shot text but
 * missing from the refs are appended, so an un-synced draft still composes a
 * complete prompt.
 */
export function composePrompt(shot: Shot, assets: ScriptAsset[]): string {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  const referenced: ScriptAsset[] = []
  const seen = new Set<string>()

  for (const id of shot.assetRefs) {
    const asset = byId.get(id)
    if (asset && !seen.has(asset.id)) {
      seen.add(asset.id)
      referenced.push(asset)
    }
  }
  for (const asset of assets) {
    if (!seen.has(asset.id) && shotMentionsAsset(shot, asset)) {
      seen.add(asset.id)
      referenced.push(asset)
    }
  }

  const segments: string[] = []
  const description = tidySegment(stripMentionMarkers(shot.description))
  if (description) segments.push(`画面：${description}`)
  segments.push(`景别：${shot.shotSize}`)

  const cameraMove = tidySegment(shot.cameraMove)
  if (cameraMove) segments.push(`运镜：${cameraMove}`)

  const dialogue = tidySegment(stripMentionMarkers(shot.dialogue))
  if (dialogue) segments.push(`对白：${dialogue}`)

  const sfx = tidySegment(shot.sfx)
  if (sfx) segments.push(`音效：${sfx}`)

  if (referenced.length > 0) {
    const parts = referenced.map((asset) => {
      const detail = tidySegment(asset.description) || '以已确认的设定为准'
      return `${ASSET_KIND_LABEL[asset.kind]}「${asset.name}」${detail}`
    })
    segments.push(`参考设定：${parts.join('；')}`)
  }

  segments.push(`时长约 ${clampDuration(shot.durationSeconds)} 秒`)
  return `${segments.join('；')}。`
}

/** 一键合成全部提示词 — overwrites every prompt so the batch stays consistent. */
export function composeAllPrompts(draft: ScriptDraft): ScriptDraft {
  return {
    ...draft,
    shots: draft.shots.map((shot) => ({ ...shot, finalPrompt: composePrompt(shot, draft.assets) })),
  }
}

export function shotsMissingPrompt(draft: ScriptDraft): Shot[] {
  return draft.shots.filter((shot) => !shot.finalPrompt.trim())
}

/** Null when 批量生图 / 批量生视频 may run; otherwise the reason to show. */
export function batchBlockReason(draft: ScriptDraft): string | null {
  if (draft.shots.length === 0) return '镜头表还是空的，先在第 1 步添加镜头'
  const missing = shotsMissingPrompt(draft)
  if (missing.length > 0) {
    const numbers = missing.slice(0, 4).map((shot) => shot.index)
    const suffix = missing.length > numbers.length ? ' 等' : ''
    return `第 ${numbers.join('、')}${suffix} 共 ${missing.length} 个镜头还没有最终提示词，先点击「一键合成全部提示词」`
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Asset removal
 * ------------------------------------------------------------------ */

export type AssetRemovalMode = 'keep-text' | 'strip-references'

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripAssetName(value: string, name: string): string {
  if (!value) return value
  const escaped = escapeForRegExp(name)
  return value
    .replace(new RegExp(`@${escaped}`, 'g'), '')
    .replace(/ {2,}/g, ' ')
    // Tidy the gap the removed name left behind: 「握着 。」→「握着。」
    .replace(/\s+([，。；：、！？!?,.])/g, '$1')
    .replace(/([，。；：、])\s+/g, '$1')
    .replace(/^[\s、，,；;]+/, '')
    .trimEnd()
}

/**
 * Delete an asset.
 *
 * - `keep-text` only drops the asset and its ids; the shot wording survives, so
 *   a mis-detected asset can be removed without rewriting the table.
 * - `strip-references` additionally removes every `@名字` occurrence from the
 *   shot fields, for an entity that was cut from the story entirely.
 *
 * Composed prompts of the touched shots are cleared either way — a prompt that
 * still describes a deleted asset would silently ship into the batch.
 */
export function removeAssetFrom(
  draft: ScriptDraft,
  assetId: string,
  mode: AssetRemovalMode,
): ScriptDraft {
  const target = draft.assets.find((asset) => asset.id === assetId)
  if (!target) return draft

  const shots = draft.shots.map((shot) => {
    const hadRef = shot.assetRefs.includes(assetId)
    const mentions = shotMentionsAsset(shot, target)
    if (!hadRef && !mentions) return shot

    const next: Shot = { ...shot, assetRefs: shot.assetRefs.filter((id) => id !== assetId) }
    if (mode === 'strip-references') {
      next.description = stripAssetName(next.description, target.name)
      next.dialogue = stripAssetName(next.dialogue, target.name)
      next.sfx = stripAssetName(next.sfx, target.name)
      next.cameraMove = stripAssetName(next.cameraMove, target.name)
    }
    next.finalPrompt = ''
    return next
  })

  return { ...draft, shots, assets: draft.assets.filter((asset) => asset.id !== assetId) }
}

/* ------------------------------------------------------------------ *
 * Entry helpers
 * ------------------------------------------------------------------ */

export function draftFromScreenplay(text: string): ScriptDraft {
  const shots = parseScreenplay(text)
  return syncAssetRefs({
    entry: 'screenplay',
    logline: deriveLogline(text),
    shots,
    assets: extractAssets(shots),
  })
}

/**
 * 角色生成 entry: a character plus a premise expands into a four-beat sequence
 * (建立 → 登场 → 转折 → 收束). Fixed beats keep the starting point predictable;
 * every field stays editable in phase 1.
 */
export function draftFromCharacter(name: string, description: string, premise: string): ScriptDraft {
  const who = name.trim() || '主角'
  const story = premise.trim()
  const beats: { shotSize: ShotSize; cameraMove: string; description: string; duration: number }[] = [
    {
      shotSize: '大远景',
      cameraMove: '无人机升起',
      description: `建立镜头：交代${story ? `「${story}」的` : ''}故事发生的环境与时间，@${who} 尚未入画。`,
      duration: 6,
    },
    {
      shotSize: '中景',
      cameraMove: '跟随',
      description: `@${who} 从画面右侧入场，边走边观察四周，脚步节奏交代人物性格。`,
      duration: 8,
    },
    {
      shotSize: '近景',
      cameraMove: '变焦推近',
      description: `@${who} 停下脚步，面对${story ? '眼前的变化' : '突如其来的状况'}，情绪由平静转为警觉。`,
      duration: 7,
    },
    {
      shotSize: '特写',
      cameraMove: '固定',
      description: `@${who} 的眼神特写，做出决定，画面留白收束。`,
      duration: 5,
    },
  ]

  const shots = reindexShots(
    beats.map((beat, i) =>
      createShot({
        id: `shot_c${i + 1}`,
        index: i + 1,
        shotSize: beat.shotSize,
        cameraMove: beat.cameraMove,
        description: beat.description,
        durationSeconds: beat.duration,
      }),
    ),
  )

  return syncAssetRefs({
    entry: 'character',
    logline: story || `${who}的一段故事`,
    shots,
    assets: [
      createAsset({
        id: 'sa_c1',
        name: who,
        kind: 'character',
        description: description.trim() || `${who}的外观设定待补充。`,
        source: 'ai',
      }),
    ],
  })
}

export function draftForManualEntry(): ScriptDraft {
  return {
    entry: 'manual',
    logline: '',
    shots: reindexShots([createShot({ description: '' })]),
    assets: [],
  }
}

/* ------------------------------------------------------------------ *
 * AI asset form
 * ------------------------------------------------------------------ */

export interface AiAssetForm {
  name: string
  prompt: string
  quality: NonNullable<OutputSpec['quality']>
  resolution: Extract<NonNullable<OutputSpec['resolution']>, '1K' | '2K' | '4K'>
  aspectRatio: NonNullable<OutputSpec['aspectRatio']>
}

export const AI_RESOLUTIONS: AiAssetForm['resolution'][] = ['1K', '2K', '4K']

export const AI_ASPECT_RATIOS: AiAssetForm['aspectRatio'][] = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']

export const DEFAULT_AI_ASSET_FORM: AiAssetForm = {
  name: '',
  prompt: '',
  quality: 'high',
  resolution: '2K',
  aspectRatio: '16:9',
}

export function isAiAssetFormValid(form: AiAssetForm): boolean {
  return form.name.trim().length > 0 && form.prompt.trim().length > 0
}

/** Fold the generation settings into the asset description so nothing is lost. */
export function assetFromAiForm(form: AiAssetForm, kind: ScriptAssetKind): ScriptAsset {
  const name = form.name.trim()
  const qualityLabel = form.quality === 'high' ? '高清' : '标准'
  return createAsset({
    name,
    kind,
    source: 'ai',
    description: `${form.prompt.trim()}（${qualityLabel} · ${form.resolution} · ${form.aspectRatio}）`,
  })
}
