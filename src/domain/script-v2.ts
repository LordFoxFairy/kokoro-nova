/**
 * Canonical, framework-free Script V2 state.
 *
 * The canvas persists exactly one copy at `node.data.extra.scriptV2`. UI
 * components may keep transient popover drafts, but all durable behavior must
 * flow through the immutable helpers in this module.
 */

export const SCRIPT_V2_SHOT_SIZES = [
  '大远景',
  '远景',
  '全景',
  '中远景',
  '中景',
  '中近景',
  '近景',
  '特写',
  '大特写',
  '头肩景',
  '半身景',
  '全身景',
] as const

export const SCRIPT_V2_MIN_DURATION_SECONDS = 5
export const SCRIPT_V2_MAX_DURATION_SECONDS = 15
export const SCRIPT_V2_RECOMPUTE_MAX_SHOTS = 20
export const SCRIPT_V2_CONTEXT_MAX_SHOTS = 100

export type ScriptV2ShotSize = (typeof SCRIPT_V2_SHOT_SIZES)[number]
export type ScriptV2Stage = 'shots' | 'assets' | 'prompts'
export type ScriptV2Entry = 'screenplay' | 'character' | 'manual'
export type ScriptV2AssetRole = 'character' | 'scene' | 'prop'
export type ScriptV2AssetSource = 'ai' | 'canvas' | 'upload' | 'library'
export type ScriptV2AssetStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'lost'
export type ScriptV2PromptTrack = 'image' | 'video'
export type ScriptV2ComposeMode = 'smart' | 'auto'
export type ScriptV2PromptState =
  | 'none'
  | 'synced'
  | 'stale'
  | 'generating'
  | 'user_edited'
  | 'user_edited_stale'
export type ScriptV2ColorLabel = 'red' | 'yellow' | 'green' | 'blue' | 'gray' | null

export interface ScriptV2EntityRef {
  text: string
  assetId: string
}

export interface ScriptV2DialogueLine {
  text: string
  characterRef?: string
  kind?: 'voiceover' | 'speech'
  entityRefs?: ScriptV2EntityRef[]
}

export interface ScriptV2CharacterRef {
  characterName: string
  characterAssetId: string
  characterDescription: string
  characterImageUrl: string
}

export interface ScriptV2Cinematics {
  shotSize?: ScriptV2ShotSize
  cameraMovement?: string
  lighting?: string
}

export interface ScriptV2MediaVersion {
  id: string
  url: string
  thumbnailUrl?: string
  createdAt: string
}

export interface ScriptV2Row {
  id: string
  hiddenUuid: string
  shotNumber: number
  durationSeconds: number
  plotDescription: string
  plotDescriptionEntityRefs?: ScriptV2EntityRef[]
  characters: ScriptV2CharacterRef[]
  videoReference?: {
    startTime: number
    endTime: number
    referenceFrameImage: string
  }
  cinematics?: ScriptV2Cinematics
  shotSize: ScriptV2ShotSize
  emotion: string
  sceneAssetIds: string[]
  propTags: string
  propAssetIds: string[]
  lightingAndAtmosphere: string
  audioEffects: string
  dialogue: string
  dialogueLines?: ScriptV2DialogueLine[]
  voiceover?: string
  bgm?: string
  sfx?: string
  imageGenerationPrompt: string
  videoMotionPrompt: string
  finalImagePromptEntityRefs?: ScriptV2EntityRef[]
  finalVideoPromptEntityRefs?: ScriptV2EntityRef[]
  imageToVideoMotionPrompt: string
  userEditedImageToVideoMotionPrompt?: string
  imageVersions: ScriptV2MediaVersion[]
  videoVersions: ScriptV2MediaVersion[]
  colorLabel: ScriptV2ColorLabel
  imagePromptState: ScriptV2PromptState
  videoPromptState: ScriptV2PromptState
  textHash: string
  payloadHash: string
}

export interface ScriptV2AssetCompliance {
  state: 'pass' | 'reject' | 'pending' | 'expired' | 'unknown'
  reason?: string
  updatedAt?: string
}

export interface ScriptV2AssetGenerationSettings {
  modelId: string
  prompt: string
  quality: 'low' | 'standard' | 'high'
  resolution: '1K' | '2K' | '4K'
  aspectRatio: string
}

export interface ScriptV2Asset {
  id: string
  role: ScriptV2AssetRole
  name: string
  description: string
  source: ScriptV2AssetSource
  status: ScriptV2AssetStatus
  thumbnailUrl?: string
  linkedNodeId?: string
  sourceImageRef?: string
  isPrimary?: boolean
  compliance?: ScriptV2AssetCompliance
  generation?: ScriptV2AssetGenerationSettings
  error?: string
  createdAt: string
  updatedAt: string
}

export interface ScriptV2Assets {
  characters: ScriptV2Asset[]
  scenes: ScriptV2Asset[]
  props: ScriptV2Asset[]
}

export interface ScriptV2GeneratorState {
  modelId: string
  prompt: string
  translating: boolean
  referenceIds: string[]
  status: 'idle' | 'generating' | 'failed'
  error: string | null
}

export interface ScriptV2PromptComposerState {
  singleMode: ScriptV2ComposeMode
  batchMode: ScriptV2ComposeMode
  modelId: string
}

export interface ScriptV2PromptRequestContext {
  shotId: string
  track: ScriptV2PromptTrack
  operationId: string
  requestInputFingerprint: string
}

export interface ScriptV2PromptBatch {
  batchId: string
  shotIds: string[]
  status: 'pending' | 'submitting' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  taskId?: string
  error?: string
  requestContexts?: ScriptV2PromptRequestContext[]
}

export interface ScriptV2PromptBatchRun {
  runId: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  targetShotIds: string[]
  batchSize: number
  batches: ScriptV2PromptBatch[]
  createdAt: string
  updatedAt: string
}

export interface ScriptV2State {
  version: 1
  /** Stable local seed used to allocate ids after refresh. */
  identitySeed: string
  nextRowOrdinal: number
  nextAssetOrdinal: number
  entry: ScriptV2Entry | null
  activeStage: ScriptV2Stage
  title: string
  originalStoryText: string
  styleDescription: string | null
  rows: ScriptV2Row[]
  assets: ScriptV2Assets
  generator: ScriptV2GeneratorState
  promptComposer: ScriptV2PromptComposerState
  promptBatchRuns: ScriptV2PromptBatchRun[]
}

export type ScriptV2RowPatch = Partial<
  Omit<ScriptV2Row, 'id' | 'hiddenUuid' | 'shotNumber' | 'textHash' | 'payloadHash'>
>

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`
}

function fingerprint(namespace: string, value: unknown): string {
  return `${namespace}:${fnv1a(stableJson(value))}`
}

export function clampScriptV2Duration(value: number): number {
  if (!Number.isFinite(value)) return SCRIPT_V2_MIN_DURATION_SECONDS
  return Math.min(
    SCRIPT_V2_MAX_DURATION_SECONDS,
    Math.max(SCRIPT_V2_MIN_DURATION_SECONDS, Math.round(value)),
  )
}

function initialPromptState(value: string, state?: ScriptV2PromptState): ScriptV2PromptState {
  if (state) return state
  return value.trim() ? 'synced' : 'none'
}

function createRow(
  seed: string,
  ordinal: number,
  shotNumber: number,
  partial: ScriptV2RowPatch = {},
): ScriptV2Row {
  const shotSize = partial.shotSize ?? partial.cinematics?.shotSize ?? '中景'
  const base: ScriptV2Row = {
    id: `shot_${fnv1a(`${seed}:shot:${ordinal}`)}`,
    hiddenUuid: `hidden_${fnv1a(`${seed}:hidden:${ordinal}`)}`,
    shotNumber,
    durationSeconds: clampScriptV2Duration(partial.durationSeconds ?? SCRIPT_V2_MIN_DURATION_SECONDS),
    plotDescription: partial.plotDescription ?? '',
    ...(partial.plotDescriptionEntityRefs?.length
      ? { plotDescriptionEntityRefs: partial.plotDescriptionEntityRefs.map((ref) => ({ ...ref })) }
      : {}),
    characters: partial.characters?.map((character) => ({ ...character })) ?? [],
    ...(partial.videoReference ? { videoReference: { ...partial.videoReference } } : {}),
    ...(partial.cinematics ? { cinematics: { ...partial.cinematics } } : {}),
    shotSize,
    emotion: partial.emotion ?? '',
    sceneAssetIds: [...(partial.sceneAssetIds ?? [])],
    propTags: partial.propTags ?? '',
    propAssetIds: [...(partial.propAssetIds ?? [])],
    lightingAndAtmosphere: partial.lightingAndAtmosphere ?? '',
    audioEffects: partial.audioEffects ?? '',
    dialogue: partial.dialogue ?? '',
    ...(partial.dialogueLines?.length
      ? { dialogueLines: partial.dialogueLines.map((line) => ({ ...line, entityRefs: line.entityRefs?.map((ref) => ({ ...ref })) })) }
      : {}),
    ...(partial.voiceover ? { voiceover: partial.voiceover } : {}),
    ...(partial.bgm ? { bgm: partial.bgm } : {}),
    ...(partial.sfx ? { sfx: partial.sfx } : {}),
    imageGenerationPrompt: partial.imageGenerationPrompt ?? '',
    videoMotionPrompt: partial.videoMotionPrompt ?? '',
    ...(partial.finalImagePromptEntityRefs?.length
      ? { finalImagePromptEntityRefs: partial.finalImagePromptEntityRefs.map((ref) => ({ ...ref })) }
      : {}),
    ...(partial.finalVideoPromptEntityRefs?.length
      ? { finalVideoPromptEntityRefs: partial.finalVideoPromptEntityRefs.map((ref) => ({ ...ref })) }
      : {}),
    imageToVideoMotionPrompt: partial.imageToVideoMotionPrompt ?? partial.videoMotionPrompt ?? '',
    ...(partial.userEditedImageToVideoMotionPrompt
      ? { userEditedImageToVideoMotionPrompt: partial.userEditedImageToVideoMotionPrompt }
      : {}),
    imageVersions: partial.imageVersions?.map((version) => ({ ...version })) ?? [],
    videoVersions: partial.videoVersions?.map((version) => ({ ...version })) ?? [],
    colorLabel: partial.colorLabel ?? null,
    imagePromptState: initialPromptState(partial.imageGenerationPrompt ?? '', partial.imagePromptState),
    videoPromptState: initialPromptState(partial.videoMotionPrompt ?? '', partial.videoPromptState),
    textHash: '',
    payloadHash: '',
  }
  return {
    ...base,
    textHash: scriptV2TextFingerprint(base),
    payloadHash: scriptV2PayloadFingerprint(base),
  }
}

export function defaultScriptV2State(seed = 'script-v2'): ScriptV2State {
  return {
    version: 1,
    identitySeed: seed,
    nextRowOrdinal: 1,
    nextAssetOrdinal: 1,
    entry: null,
    activeStage: 'shots',
    title: '',
    originalStoryText: '',
    styleDescription: null,
    rows: [],
    assets: { characters: [], scenes: [], props: [] },
    generator: {
      modelId: 'gvlm-3.1',
      prompt: '',
      translating: true,
      referenceIds: [],
      status: 'idle',
      error: null,
    },
    promptComposer: {
      singleMode: 'smart',
      batchMode: 'smart',
      modelId: 'gvlm-3.1',
    },
    promptBatchRuns: [],
  }
}

export function scriptV2TextFingerprint(row: ScriptV2Row): string {
  return fingerprint('script-v2-text-v1', {
    plotDescription: row.plotDescription,
    plotDescriptionEntityRefs: row.plotDescriptionEntityRefs ?? [],
    shotSize: row.shotSize,
    cinematics: row.cinematics ?? null,
    dialogue: row.dialogue,
    dialogueLines: row.dialogueLines ?? [],
    sceneAssetIds: [...row.sceneAssetIds].sort(),
    propTags: row.propTags,
    propAssetIds: [...row.propAssetIds].sort(),
    lightingAndAtmosphere: row.lightingAndAtmosphere,
    audioEffects: row.audioEffects,
    voiceover: row.voiceover ?? '',
    bgm: row.bgm ?? '',
    sfx: row.sfx ?? '',
  })
}

export function scriptV2PayloadFingerprint(row: ScriptV2Row): string {
  return fingerprint('script-v2-payload-v1', {
    characters: row.characters.map((character) => ({
      assetId: character.characterAssetId,
      imageUrl: character.characterImageUrl,
    })),
    referenceFrameImage: row.videoReference?.referenceFrameImage ?? '',
    sceneAssetIds: [...row.sceneAssetIds].sort(),
    propAssetIds: [...row.propAssetIds].sort(),
  })
}

function staleState(state: ScriptV2PromptState): ScriptV2PromptState {
  if (state === 'synced' || state === 'generating') return 'stale'
  if (state === 'user_edited') return 'user_edited_stale'
  return state
}

export function reconcileScriptV2PromptState(before: ScriptV2Row, after: ScriptV2Row): ScriptV2Row {
  const textHash = scriptV2TextFingerprint(after)
  const payloadHash = scriptV2PayloadFingerprint(after)
  const sourceChanged = before.textHash !== textHash || before.payloadHash !== payloadHash
  return {
    ...after,
    textHash,
    payloadHash,
    imagePromptState: sourceChanged ? staleState(after.imagePromptState) : after.imagePromptState,
    videoPromptState: sourceChanged ? staleState(after.videoPromptState) : after.videoPromptState,
  }
}

function denseRows(rows: ScriptV2Row[]): ScriptV2Row[] {
  return rows.map((row, index) =>
    row.shotNumber === index + 1 ? row : { ...row, shotNumber: index + 1 },
  )
}

export function appendScriptV2Row(state: ScriptV2State, partial: ScriptV2RowPatch = {}): ScriptV2State {
  const previous = state.rows[state.rows.length - 1]
  const ordinal = state.nextRowOrdinal
  const row = createRow(state.identitySeed, ordinal, state.rows.length + 1, {
    shotSize: previous?.shotSize ?? '中景',
    ...partial,
  })
  return { ...state, rows: [...state.rows, row], nextRowOrdinal: ordinal + 1 }
}

export function moveScriptV2Row(state: ScriptV2State, from: number, to: number): ScriptV2State {
  if (from === to || from < 0 || to < 0 || from >= state.rows.length || to >= state.rows.length) {
    return state
  }
  const rows = [...state.rows]
  const [row] = rows.splice(from, 1)
  rows.splice(to, 0, row)
  return { ...state, rows: denseRows(rows) }
}

export function removeScriptV2Row(state: ScriptV2State, rowId: string): ScriptV2State {
  const rows = state.rows.filter((row) => row.id !== rowId)
  if (rows.length === state.rows.length) return state
  return { ...state, rows: denseRows(rows) }
}

export function updateScriptV2Row(
  state: ScriptV2State,
  rowId: string,
  patch: ScriptV2RowPatch,
): ScriptV2State {
  let changed = false
  const rows = state.rows.map((row) => {
    if (row.id !== rowId) return row
    changed = true
    const next = {
      ...row,
      ...patch,
      ...(patch.durationSeconds === undefined
        ? {}
        : { durationSeconds: clampScriptV2Duration(patch.durationSeconds) }),
    }
    if (patch.imageGenerationPrompt !== undefined && patch.imagePromptState === undefined) {
      next.imagePromptState = 'user_edited'
    }
    if (patch.videoMotionPrompt !== undefined && patch.videoPromptState === undefined) {
      next.videoPromptState = 'user_edited'
    }
    return reconcileScriptV2PromptState(row, next)
  })
  return changed ? { ...state, rows } : state
}
