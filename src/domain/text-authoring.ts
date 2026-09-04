import { textModelOutputOptions } from './models'

export type TextAuthoringMode = 'generator' | 'document'
export type TextStarterIntent = 'free' | 'text2video' | 'caption' | 'text2music'
export type TextBlockKind =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bullet-list'
  | 'ordered-list'
  | 'divider'
export type TextMark = 'bold' | 'italic'
export type TextBackground = 'charcoal' | 'slate' | 'indigo' | 'paper' | 'sand'

export interface TextBlock {
  id: string
  kind: TextBlockKind
  /** Plain text only. Rich styling is represented by `kind` and `marks`. */
  text: string
  marks: TextMark[]
}

export interface TextAuthoringDocument {
  background: TextBackground
  blocks: TextBlock[]
}

/**
 * Replayable state stored at `text.data.extra.textAuthoring`.
 *
 * The document never stores HTML. Pasted markup is reduced to text plus the
 * small allowed formatting vocabulary before it crosses the mutation boundary.
 */
export interface TextAuthoringState {
  schemaVersion: 1
  mode: TextAuthoringMode
  intent: TextStarterIntent | null
  document: TextAuthoringDocument
  translationEnabled: boolean
  expanded: boolean
}

export interface TextModelCapabilities {
  family: 'multimodal' | 'language'
  maxCharacters: number
  acceptsReferences: readonly ('text' | 'image')[]
  /** Provider-side model value used by the integration adapter. */
  providerModelId: string
  scene: 'text-generate'
  supportsTranslation: boolean
}

export interface TextProviderParams {
  action: 'text_generate' | 'text_resource'
  generatorType: 'default'
  content: string[]
  params: {
    prompt: string
    model: string
    count: 1
    scene?: 'text-generate'
    textList: string[]
    imageList: string[]
    videoList: string[]
    audioList: string[]
  }
}

export const TEXT_AUTHORING_MODES = ['generator', 'document'] as const satisfies readonly TextAuthoringMode[]
export const TEXT_STARTER_INTENTS = ['free', 'text2video', 'caption', 'text2music'] as const satisfies readonly TextStarterIntent[]
export const TEXT_BLOCK_KINDS = [
  'paragraph',
  'heading-1',
  'heading-2',
  'heading-3',
  'bullet-list',
  'ordered-list',
  'divider',
] as const satisfies readonly TextBlockKind[]
export const TEXT_MARKS = ['bold', 'italic'] as const satisfies readonly TextMark[]
export const TEXT_BACKGROUNDS = ['charcoal', 'slate', 'indigo', 'paper', 'sand'] as const satisfies readonly TextBackground[]
export const TEXT_DOCUMENT_MAX_BLOCKS = 200
export const TEXT_DOCUMENT_MAX_CHARACTERS = 50_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

function defaultBlock(): TextBlock {
  return { id: 'block-1', kind: 'paragraph', text: '', marks: [] }
}

export function defaultTextAuthoringState(): TextAuthoringState {
  return {
    schemaVersion: 1,
    mode: 'generator',
    intent: null,
    document: {
      background: 'charcoal',
      blocks: [defaultBlock()],
    },
    translationEnabled: false,
    expanded: false,
  }
}

function normalizeBlocks(input: unknown): TextBlock[] {
  if (!Array.isArray(input)) return [defaultBlock()]

  const idCounts = new Map<string, number>()
  let remainingCharacters = TEXT_DOCUMENT_MAX_CHARACTERS
  const blocks: TextBlock[] = []

  for (const candidate of input.slice(0, TEXT_DOCUMENT_MAX_BLOCKS)) {
    if (!isRecord(candidate) || !isOneOf(candidate.kind, TEXT_BLOCK_KINDS)) continue
    if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) continue

    const rawId = candidate.id.trim().slice(0, 100)
    const count = (idCounts.get(rawId) ?? 0) + 1
    idCounts.set(rawId, count)
    const id = count === 1 ? rawId : `${rawId}-${count}`
    const rawText = typeof candidate.text === 'string' ? candidate.text : ''
    const text = candidate.kind === 'divider' ? '' : rawText.slice(0, remainingCharacters)
    remainingCharacters -= text.length
    const marks = Array.isArray(candidate.marks)
      ? [...new Set(candidate.marks.filter((mark): mark is TextMark => isOneOf(mark, TEXT_MARKS)))]
      : []

    blocks.push({ id, kind: candidate.kind, text, marks })
    if (remainingCharacters <= 0) break
  }

  return blocks.length > 0 ? blocks : [defaultBlock()]
}

/** Normalize stale/imported data into the complete v1 shape. */
export function normalizeTextAuthoringState(value: unknown): TextAuthoringState {
  const input = isRecord(value) ? value : {}
  const rawDocument = isRecord(input.document) ? input.document : {}
  return {
    schemaVersion: 1,
    mode: isOneOf(input.mode, TEXT_AUTHORING_MODES) ? input.mode : 'generator',
    intent:
      input.intent === null || isOneOf(input.intent, TEXT_STARTER_INTENTS)
        ? input.intent
        : null,
    document: {
      background: isOneOf(rawDocument.background, TEXT_BACKGROUNDS)
        ? rawDocument.background
        : 'charcoal',
      blocks: normalizeBlocks(rawDocument.blocks),
    },
    translationEnabled: typeof input.translationEnabled === 'boolean' ? input.translationEnabled : false,
    expanded: typeof input.expanded === 'boolean' ? input.expanded : false,
  }
}

function hasCompleteTextState(value: unknown): value is TextAuthoringState {
  if (!isRecord(value) || value.schemaVersion !== 1) return false
  if (!isOneOf(value.mode, TEXT_AUTHORING_MODES)) return false
  if (value.intent !== null && !isOneOf(value.intent, TEXT_STARTER_INTENTS)) return false
  if (!isRecord(value.document)) return false
  if (!isOneOf(value.document.background, TEXT_BACKGROUNDS)) return false
  if (!Array.isArray(value.document.blocks)) return false
  if (typeof value.translationEnabled !== 'boolean' || typeof value.expanded !== 'boolean') return false
  return true
}

/** Strict reader: an incomplete version falls back instead of leaking half-state into UI. */
export function readTextAuthoringState(extra: Record<string, unknown> | undefined): TextAuthoringState {
  const candidate = extra?.textAuthoring
  return hasCompleteTextState(candidate)
    ? normalizeTextAuthoringState(candidate)
    : defaultTextAuthoringState()
}

export function textDocumentPlainText(state: TextAuthoringState): string {
  return normalizeTextAuthoringState(state).document.blocks
    .filter((block) => block.kind !== 'divider')
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n')
}

/** Adapter-facing projection matching the official node payload vocabulary. */
export function textProviderParams(
  prompt: string,
  modelId: string,
  state: TextAuthoringState,
): TextProviderParams {
  const normalized = normalizeTextAuthoringState(state)
  const capabilities = textModelOutputOptions(modelId)
  const model = capabilities?.providerModelId ?? modelId
  const documentContent = normalized.document.blocks
    .filter((block) => block.kind !== 'divider')
    .map((block) => block.text)
    .filter((text) => text.trim().length > 0)

  return {
    action: normalized.mode === 'document' ? 'text_resource' : 'text_generate',
    generatorType: 'default',
    content: normalized.mode === 'document' ? documentContent : [],
    params: {
      prompt: normalized.mode === 'document' ? '' : prompt,
      model,
      count: 1,
      ...(normalized.mode === 'generator' ? { scene: capabilities?.scene ?? 'text-generate' } : {}),
      textList: [],
      imageList: [],
      videoList: [],
      audioList: [],
    },
  }
}
