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

/* -------------------------------------------------------------------------- */
/* Deterministic local prompt composition                                     */
/* -------------------------------------------------------------------------- */

const SCRIPT_V2_AUTO_ASSET_ROLE_LABEL: Record<ScriptV2AssetRole, string> = {
  character: '角色',
  scene: '场景',
  prop: '道具',
}

function promptAssetSummary(row: ScriptV2Row, assets: ScriptV2Assets): string[] {
  const referencedIds = new Set([
    ...row.characters.map((character) => character.characterAssetId),
    ...row.sceneAssetIds,
    ...row.propAssetIds,
  ])
  const all = [...assets.characters, ...assets.scenes, ...assets.props]
  const linked = all.filter((asset) => referencedIds.has(asset.id))
  const characterFallbacks = row.characters
    .filter((character) => !referencedIds.has(character.characterAssetId) && character.characterName.trim())
    .map((character) => `角色「${character.characterName.trim()}」${character.characterDescription.trim()}`)
  return [
    ...linked.map((asset) =>
      `${SCRIPT_V2_AUTO_ASSET_ROLE_LABEL[asset.role]}「${asset.name.trim()}」${asset.description.trim()}`,
    ),
    ...characterFallbacks,
  ].filter(Boolean)
}

function autoPromptSource(row: ScriptV2Row, assets: ScriptV2Assets, styleDescription: string | null): string[] {
  const assetsSummary = promptAssetSummary(row, assets)
  const camera = row.cinematics?.cameraMovement?.trim() ?? ''
  const lighting = row.lightingAndAtmosphere.trim() || row.cinematics?.lighting?.trim() || ''
  const dialogue = row.dialogue.trim() || row.voiceover?.trim() || ''
  const audio = row.audioEffects.trim() || row.sfx?.trim() || ''
  const style = styleDescription?.trim() ?? ''
  return [
    row.plotDescription.trim() ? `画面：${row.plotDescription.trim()}` : '',
    `景别：${row.shotSize}`,
    camera ? `运镜：${camera}` : '',
    lighting ? `光影：${lighting}` : '',
    dialogue ? `对白/旁白：${dialogue}` : '',
    audio ? `音效：${audio}` : '',
    assetsSummary.length ? `资产：${assetsSummary.join('；')}` : '',
    style ? `风格：${style}` : '',
  ].filter(Boolean)
}

/** Build the free, deterministic `自动拼接` prompt for one track. */
export function composeScriptV2AutoPrompt(
  row: ScriptV2Row,
  track: ScriptV2PromptTrack,
  assets: ScriptV2Assets,
  styleDescription: string | null,
): string | null {
  const source = autoPromptSource(row, assets, styleDescription)
  // A default shot size alone is not useful input. Keep an authored prompt
  // intact when the user has not supplied any story/production information.
  if (source.length === 1 && source[0] === `景别：${row.shotSize}`) return null
  if (track === 'image') {
    return `${source.join('；')}。构图清晰，主体关系稳定，保持视觉连续性。`
  }
  const motion = row.cinematics?.cameraMovement?.trim() || '平稳跟随主体'
  return `${source.join('；')}。镜头${motion}，主体动作连续自然，前景、中景与背景保持节奏层次，随后在情节点短暂停留并平滑收束。`
}

export interface ScriptV2AutoPromptComposeResult extends ScriptV2State {
  changedRowIds: string[]
}

/** Compose selected rows locally, skipping rows with no meaningful source input. */
export function composeScriptV2AutoPrompts(
  state: ScriptV2State,
  rowIds: string[] = state.rows.map((row) => row.id),
): ScriptV2AutoPromptComposeResult {
  const selected = new Set(rowIds)
  const changedRowIds: string[] = []
  const rows = state.rows.map((row) => {
    if (!selected.has(row.id)) return row
    const image = composeScriptV2AutoPrompt(row, 'image', state.assets, state.styleDescription)
    const video = composeScriptV2AutoPrompt(row, 'video', state.assets, state.styleDescription)
    if (!image && !video) return row
    changedRowIds.push(row.id)
    return {
      ...row,
      ...(image ? { imageGenerationPrompt: image, imagePromptState: 'synced' as const } : {}),
      ...(video ? { videoMotionPrompt: video, videoPromptState: 'synced' as const } : {}),
    }
  })
  return { ...state, rows, changedRowIds }
}

export interface ScriptV2PromptSnapshot {
  rowId: string
  imageGenerationPrompt: string
  videoMotionPrompt: string
  imagePromptState: ScriptV2PromptState
  videoPromptState: ScriptV2PromptState
}

/** Fingerprint only prompt content, so an undo cannot overwrite another edit. */
export function scriptV2PromptContentFingerprint(state: ScriptV2State, rowIds: string[]): string {
  return fingerprint(
    'script-v2-prompt-content-v1',
    state.rows
      .filter((row) => rowIds.includes(row.id))
      .map((row) => ({
        id: row.id,
        imageGenerationPrompt: row.imageGenerationPrompt,
        videoMotionPrompt: row.videoMotionPrompt,
        imagePromptState: row.imagePromptState,
        videoPromptState: row.videoPromptState,
      })),
  )
}

export function scriptV2PromptSnapshot(state: ScriptV2State, rowIds: string[]): ScriptV2PromptSnapshot[] {
  const selected = new Set(rowIds)
  return state.rows
    .filter((row) => selected.has(row.id))
    .map((row) => ({
      rowId: row.id,
      imageGenerationPrompt: row.imageGenerationPrompt,
      videoMotionPrompt: row.videoMotionPrompt,
      imagePromptState: row.imagePromptState,
      videoPromptState: row.videoPromptState,
    }))
}

export function restoreScriptV2PromptSnapshot(
  state: ScriptV2State,
  snapshot: ScriptV2PromptSnapshot[],
): ScriptV2State {
  const byId = new Map(snapshot.map((item) => [item.rowId, item]))
  return {
    ...state,
    rows: state.rows.map((row) => {
      const previous = byId.get(row.id)
      return previous
        ? {
            ...row,
            imageGenerationPrompt: previous.imageGenerationPrompt,
            videoMotionPrompt: previous.videoMotionPrompt,
            imagePromptState: previous.imagePromptState,
            videoPromptState: previous.videoPromptState,
          }
        : row
    }),
  }
}

export type ScriptV2AssetRemovalMode = 'keep-text' | 'remove-references'

function refsForAsset(refs: ScriptV2EntityRef[] | undefined, assetId: string): ScriptV2EntityRef[] {
  return (refs ?? []).filter((ref) => ref.assetId === assetId)
}

function replaceReferencedMentions(
  value: string,
  refs: ScriptV2EntityRef[] | undefined,
  assetId: string,
  nextName: string,
): string {
  let next = value
  for (const previous of new Set(refsForAsset(refs, assetId).map((ref) => ref.text).filter(Boolean))) {
    const mention = `@${previous}`
    if (next.includes(mention)) {
      next = next.replaceAll(mention, `@${nextName}`)
      continue
    }
    const index = next.indexOf(previous)
    if (index >= 0) next = `${next.slice(0, index)}${nextName}${next.slice(index + previous.length)}`
  }
  return next
}

function stripReferencedMentions(
  value: string,
  refs: ScriptV2EntityRef[] | undefined,
  assetId: string,
): string {
  let next = value
  for (const previous of new Set(refsForAsset(refs, assetId).map((ref) => ref.text).filter(Boolean))) {
    const mention = `@${previous}`
    if (next.includes(mention)) {
      next = next.replaceAll(mention, '')
      continue
    }
    const index = next.indexOf(previous)
    if (index >= 0) next = `${next.slice(0, index)}${next.slice(index + previous.length)}`
  }
  return next
    .replace(/ {2,}/g, ' ')
    .replace(/\s+([，。；：、！？!?,.])/g, '$1')
    .replace(/([，。；：、])\s+/g, '$1')
    .replace(/^[\s、，,；;]+/, '')
    .trimEnd()
}

function renameEntityRefs(
  refs: ScriptV2EntityRef[] | undefined,
  assetId: string,
  nextName: string,
): ScriptV2EntityRef[] | undefined {
  if (!refs) return undefined
  return refs.map((ref) => (ref.assetId === assetId ? { ...ref, text: nextName } : ref))
}

function removeEntityRefs(
  refs: ScriptV2EntityRef[] | undefined,
  assetId: string,
): ScriptV2EntityRef[] | undefined {
  if (!refs) return undefined
  const next = refs.filter((ref) => ref.assetId !== assetId)
  return next.length ? next : undefined
}

function rowReferencesAsset(row: ScriptV2Row, assetId: string): boolean {
  return (
    row.characters.some((character) => character.characterAssetId === assetId) ||
    row.sceneAssetIds.includes(assetId) ||
    row.propAssetIds.includes(assetId) ||
    refsForAsset(row.plotDescriptionEntityRefs, assetId).length > 0 ||
    refsForAsset(row.finalImagePromptEntityRefs, assetId).length > 0 ||
    refsForAsset(row.finalVideoPromptEntityRefs, assetId).length > 0 ||
    (row.dialogueLines ?? []).some(
      (line) => line.characterRef === assetId || refsForAsset(line.entityRefs, assetId).length > 0,
    )
  )
}

function forceReferencedPromptsStale(row: ScriptV2Row): ScriptV2Row {
  return {
    ...row,
    imagePromptState: staleState(row.imagePromptState),
    videoPromptState: staleState(row.videoPromptState),
  }
}

/**
 * Rename one stable asset and only rewrite author-visible mention tokens backed
 * by that same asset id. Plain words that happen to contain the old name are
 * intentionally left alone.
 */
export function renameScriptV2Asset(
  state: ScriptV2State,
  assetId: string,
  patch: { name: string; description?: string },
): ScriptV2State {
  const assets = [...state.assets.characters, ...state.assets.scenes, ...state.assets.props]
  const target = assets.find((asset) => asset.id === assetId)
  const name = patch.name.trim()
  if (!target || !name) return state
  const replacement: ScriptV2Asset = {
    ...target,
    name,
    ...(patch.description === undefined ? {} : { description: patch.description.trim() }),
  }
  const replaceBucket = (bucket: ScriptV2Asset[]) =>
    bucket.map((asset) => (asset.id === assetId ? replacement : asset))

  const rows = state.rows.map((row) => {
    if (!rowReferencesAsset(row, assetId)) return row
    const next: ScriptV2Row = {
      ...row,
      plotDescription: replaceReferencedMentions(
        row.plotDescription,
        row.plotDescriptionEntityRefs,
        assetId,
        name,
      ),
      plotDescriptionEntityRefs: renameEntityRefs(row.plotDescriptionEntityRefs, assetId, name),
      characters: row.characters.map((character) =>
        character.characterAssetId === assetId
          ? {
              ...character,
              characterName: name,
              characterDescription: replacement.description,
              characterImageUrl: replacement.thumbnailUrl ?? '',
            }
          : character,
      ),
      dialogueLines: row.dialogueLines?.map((line) => ({
        ...line,
        text: replaceReferencedMentions(line.text, line.entityRefs, assetId, name),
        entityRefs: renameEntityRefs(line.entityRefs, assetId, name),
      })),
      imageGenerationPrompt: replaceReferencedMentions(
        row.imageGenerationPrompt,
        row.finalImagePromptEntityRefs,
        assetId,
        name,
      ),
      finalImagePromptEntityRefs: renameEntityRefs(row.finalImagePromptEntityRefs, assetId, name),
      videoMotionPrompt: replaceReferencedMentions(
        row.videoMotionPrompt,
        row.finalVideoPromptEntityRefs,
        assetId,
        name,
      ),
      finalVideoPromptEntityRefs: renameEntityRefs(row.finalVideoPromptEntityRefs, assetId, name),
    }
    return forceReferencedPromptsStale(reconcileScriptV2PromptState(row, next))
  })

  return {
    ...state,
    rows,
    assets: {
      characters: replaceBucket(state.assets.characters),
      scenes: replaceBucket(state.assets.scenes),
      props: replaceBucket(state.assets.props),
    },
  }
}

/**
 * Replace mutable asset fields and project media/description changes into every
 * row that references the stable id. This keeps character payloads and prompt
 * freshness in lockstep with card actions such as choose, clear and save.
 */
export function updateScriptV2Asset(
  state: ScriptV2State,
  assetId: string,
  patch: Partial<ScriptV2Asset>,
): ScriptV2State {
  const all = [...state.assets.characters, ...state.assets.scenes, ...state.assets.props]
  const original = all.find((asset) => asset.id === assetId)
  if (!original) return state

  let current = state
  if (typeof patch.name === 'string' && patch.name.trim() && patch.name.trim() !== original.name) {
    current = renameScriptV2Asset(current, assetId, {
      name: patch.name,
      ...(patch.description === undefined ? {} : { description: patch.description }),
    })
  }
  const target = [...current.assets.characters, ...current.assets.scenes, ...current.assets.props]
    .find((asset) => asset.id === assetId)
  if (!target) return current
  const replacement: ScriptV2Asset = {
    ...target,
    ...patch,
    id: target.id,
    role: target.role,
    name: typeof patch.name === 'string' && patch.name.trim() ? patch.name.trim() : target.name,
  }

  const affectsPrompt =
    replacement.name !== target.name ||
    replacement.description !== target.description ||
    replacement.thumbnailUrl !== target.thumbnailUrl ||
    replacement.linkedNodeId !== target.linkedNodeId ||
    replacement.sourceImageRef !== target.sourceImageRef
  const rows = current.rows.map((row) => {
    if (!rowReferencesAsset(row, assetId)) return row
    const next: ScriptV2Row = {
      ...row,
      characters: row.characters.map((character) =>
        character.characterAssetId === assetId
          ? {
              ...character,
              characterName: replacement.name,
              characterDescription: replacement.description,
              characterImageUrl: replacement.thumbnailUrl ?? '',
            }
          : character,
      ),
    }
    const reconciled = reconcileScriptV2PromptState(row, next)
    return affectsPrompt ? forceReferencedPromptsStale(reconciled) : reconciled
  })
  const replaceBucket = (bucket: ScriptV2Asset[]) =>
    bucket.map((asset) => (asset.id === assetId ? replacement : asset))

  return {
    ...current,
    rows,
    assets: {
      characters: replaceBucket(current.assets.characters),
      scenes: replaceBucket(current.assets.scenes),
      props: replaceBucket(current.assets.props),
    },
  }
}

/** Remove an asset, all dangling ids and optionally only its id-backed @mentions. */
export function removeScriptV2Asset(
  state: ScriptV2State,
  assetId: string,
  mode: ScriptV2AssetRemovalMode,
): ScriptV2State {
  const target = [...state.assets.characters, ...state.assets.scenes, ...state.assets.props]
    .find((asset) => asset.id === assetId)
  if (!target) return state

  const rows = state.rows.map((row) => {
    if (!rowReferencesAsset(row, assetId)) return row
    const strip = mode === 'remove-references'
    const next: ScriptV2Row = {
      ...row,
      plotDescription: strip
        ? stripReferencedMentions(row.plotDescription, row.plotDescriptionEntityRefs, assetId)
        : row.plotDescription,
      plotDescriptionEntityRefs: removeEntityRefs(row.plotDescriptionEntityRefs, assetId),
      characters: row.characters.filter((character) => character.characterAssetId !== assetId),
      sceneAssetIds: row.sceneAssetIds.filter((id) => id !== assetId),
      propAssetIds: row.propAssetIds.filter((id) => id !== assetId),
      dialogueLines: row.dialogueLines?.map((line) => ({
        ...line,
        text: strip ? stripReferencedMentions(line.text, line.entityRefs, assetId) : line.text,
        ...(line.characterRef === assetId ? { characterRef: undefined } : {}),
        entityRefs: removeEntityRefs(line.entityRefs, assetId),
      })),
      imageGenerationPrompt: strip
        ? stripReferencedMentions(row.imageGenerationPrompt, row.finalImagePromptEntityRefs, assetId)
        : row.imageGenerationPrompt,
      finalImagePromptEntityRefs: removeEntityRefs(row.finalImagePromptEntityRefs, assetId),
      videoMotionPrompt: strip
        ? stripReferencedMentions(row.videoMotionPrompt, row.finalVideoPromptEntityRefs, assetId)
        : row.videoMotionPrompt,
      finalVideoPromptEntityRefs: removeEntityRefs(row.finalVideoPromptEntityRefs, assetId),
    }
    return forceReferencedPromptsStale(reconcileScriptV2PromptState(row, next))
  })

  return {
    ...state,
    rows,
    assets: {
      characters: state.assets.characters.filter((asset) => asset.id !== assetId),
      scenes: state.assets.scenes.filter((asset) => asset.id !== assetId),
      props: state.assets.props.filter((asset) => asset.id !== assetId),
    },
  }
}

/** A ready status without a resolvable preview/link is still an unfinished asset. */
export function scriptV2AssetReady(asset: ScriptV2Asset): boolean {
  return asset.status === 'ready' && Boolean(asset.thumbnailUrl || asset.linkedNodeId)
}

export function scriptV2BatchBlockedReason(
  state: ScriptV2State,
  kind: 'image' | 'video',
): string | null {
  if (state.rows.length === 0) return '请先添加至少一个镜头'
  const missingPrompts = state.rows.filter((row) =>
    kind === 'image' ? !row.imageGenerationPrompt.trim() : !row.videoMotionPrompt.trim(),
  ).length
  if (missingPrompts > 0) {
    return kind === 'image'
      ? `有 ${missingPrompts} 个镜头缺少分镜图提示词`
      : `有 ${missingPrompts} 个镜头缺少视频运动提示词`
  }
  if (kind === 'video') {
    const unfinishedAssets = [
      ...state.assets.characters,
      ...state.assets.scenes,
      ...state.assets.props,
    ].filter((asset) => asset.status !== 'lost' && !scriptV2AssetReady(asset)).length
    if (unfinishedAssets > 0) return `有 ${unfinishedAssets} 个资产尚未准备完成`
  }
  return null
}

const SCRIPT_V2_CSV_HEADERS = [
  '镜头编号',
  '时长（秒）',
  '景别',
  '剧情描述',
  '角色',
  '场景资产',
  '道具标签',
  '灯光与氛围',
  '音效',
  '对白',
  '分镜图提示词',
  '视频运动提示词',
] as const

function quoteCsvField(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`
}

/** Spreadsheet-safe Script V2 export: UTF-8 BOM, CRLF rows and quoted cells. */
export function scriptV2StateToCsv(state: ScriptV2State): string {
  const rows = state.rows.map((row) => [
    row.shotNumber,
    row.durationSeconds,
    row.shotSize,
    row.plotDescription,
    row.characters.map((character) => character.characterName).join('、'),
    row.sceneAssetIds.join('、'),
    row.propTags,
    row.lightingAndAtmosphere,
    row.audioEffects,
    row.dialogue,
    row.imageGenerationPrompt,
    row.videoMotionPrompt,
  ])
  return `\uFEFF${[SCRIPT_V2_CSV_HEADERS, ...rows]
    .map((row) => row.map(quoteCsvField).join(','))
    .join('\r\n')}`
}

/* -------------------------------------------------------------------------- */
/* Import and migration                                                       */
/* -------------------------------------------------------------------------- */

const SCRIPT_V2_FIXTURE_TIMESTAMP = '2026-09-03T00:00:00.000Z'
const MAX_SCRIPT_ROWS = 500
const MAX_SCRIPT_ASSETS_PER_ROLE = 500

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function finiteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = finiteNumber(value, fallback)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function stringList(value: unknown, limit = MAX_SCRIPT_ROWS): string[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, limit).filter((entry): entry is string => typeof entry === 'string')
}

function isShotSize(value: unknown): value is ScriptV2ShotSize {
  return typeof value === 'string' && (SCRIPT_V2_SHOT_SIZES as readonly string[]).includes(value)
}

function promptState(value: unknown, prompt: string): ScriptV2PromptState {
  const allowed: ScriptV2PromptState[] = [
    'none',
    'synced',
    'stale',
    'generating',
    'user_edited',
    'user_edited_stale',
  ]
  return typeof value === 'string' && allowed.includes(value as ScriptV2PromptState)
    ? (value as ScriptV2PromptState)
    : initialPromptState(prompt)
}

function entityRefs(value: unknown): ScriptV2EntityRef[] | undefined {
  if (!Array.isArray(value)) return undefined
  const seen = new Set<string>()
  const refs = value.slice(0, MAX_SCRIPT_ASSETS_PER_ROLE).flatMap((entry) => {
    if (!isPlainRecord(entry)) return []
    const refText = text(entry.text).trim()
    const assetId = text(entry.assetId ?? entry.asset_id).trim()
    if (!refText || !assetId || seen.has(assetId)) return []
    seen.add(assetId)
    return [{ text: refText, assetId }]
  })
  return refs.length ? refs : undefined
}

function dialogueLines(value: unknown): ScriptV2DialogueLine[] | undefined {
  if (!Array.isArray(value)) return undefined
  const lines = value.slice(0, MAX_SCRIPT_ROWS).flatMap((entry) => {
    if (!isPlainRecord(entry)) return []
    const content = text(entry.text).trim()
    if (!content) return []
    const kind: ScriptV2DialogueLine['kind'] =
      entry.kind === 'voiceover' || entry.kind === 'speech' ? entry.kind : undefined
    const characterRef = optionalText(entry.characterRef ?? entry.character_ref)
    return [
      {
        text: content,
        ...(characterRef ? { characterRef } : {}),
        ...(kind ? { kind } : {}),
        ...(entityRefs(entry.entityRefs ?? entry.entity_refs)
          ? { entityRefs: entityRefs(entry.entityRefs ?? entry.entity_refs) }
          : {}),
      },
    ]
  })
  return lines.length ? lines : undefined
}

function characterRefs(value: unknown): ScriptV2CharacterRef[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_SCRIPT_ASSETS_PER_ROLE).flatMap((entry) => {
    if (!isPlainRecord(entry)) return []
    return [
      {
        characterName: text(entry.characterName ?? entry.character_name),
        characterAssetId: text(entry.characterAssetId ?? entry.character_asset_id),
        characterDescription: text(entry.characterDescription ?? entry.character_description),
        characterImageUrl: text(entry.characterImageUrl ?? entry.character_image_url),
      },
    ]
  })
}

function mediaVersions(value: unknown): ScriptV2MediaVersion[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_SCRIPT_ROWS).flatMap((entry) => {
    if (!isPlainRecord(entry)) return []
    const id = text(entry.id).trim()
    const url = text(entry.url).trim()
    if (!id || !url) return []
    return [
      {
        id,
        url,
        ...(optionalText(entry.thumbnailUrl) ? { thumbnailUrl: text(entry.thumbnailUrl) } : {}),
        createdAt: text(entry.createdAt, SCRIPT_V2_FIXTURE_TIMESTAMP),
      },
    ]
  })
}

function colorLabel(value: unknown): ScriptV2ColorLabel {
  return value === 'red' || value === 'yellow' || value === 'green' || value === 'blue' || value === 'gray'
    ? value
    : null
}

function normalizeRow(
  value: unknown,
  seed: string,
  index: number,
  usedIds: Set<string>,
): ScriptV2Row {
  const raw = isPlainRecord(value) ? value : {}
  const requestedId = text(raw.id ?? raw.shot_id).trim()
  const id = requestedId && !usedIds.has(requestedId)
    ? requestedId
    : `shot_${fnv1a(`${seed}:repair:${index + 1}`)}`
  usedIds.add(id)
  const rawCinematics = isPlainRecord(raw.cinematics) ? raw.cinematics : null
  const candidateShotSize = raw.shotSize ?? raw.shot_size ?? rawCinematics?.shotSize ?? rawCinematics?.shot_size
  const shotSize = isShotSize(candidateShotSize) ? candidateShotSize : '中景'
  const imageGenerationPrompt = text(
    raw.imageGenerationPrompt ?? raw.image_generation_prompt ?? raw.final_image_prompt,
  )
  const videoMotionPrompt = text(raw.videoMotionPrompt ?? raw.video_motion_prompt ?? raw.final_video_prompt)
  const partial: ScriptV2RowPatch = {
    durationSeconds: finiteNumber(raw.durationSeconds ?? raw.duration_seconds ?? raw.duration, 5),
    plotDescription: text(raw.plotDescription ?? raw.plot_description ?? raw.visual_description ?? raw.content),
    plotDescriptionEntityRefs: entityRefs(raw.plotDescriptionEntityRefs ?? raw.plot_description_entity_refs),
    characters: characterRefs(raw.characters),
    ...(isPlainRecord(raw.videoReference ?? raw.video_reference)
      ? {
          videoReference: {
            startTime: finiteNumber(
              (raw.videoReference as Record<string, unknown> | undefined)?.startTime ??
                (raw.video_reference as Record<string, unknown> | undefined)?.start_time,
              0,
            ),
            endTime: finiteNumber(
              (raw.videoReference as Record<string, unknown> | undefined)?.endTime ??
                (raw.video_reference as Record<string, unknown> | undefined)?.end_time,
              0,
            ),
            referenceFrameImage: text(
              (raw.videoReference as Record<string, unknown> | undefined)?.referenceFrameImage ??
                (raw.video_reference as Record<string, unknown> | undefined)?.reference_frame_image,
            ),
          },
        }
      : {}),
    ...(rawCinematics
      ? {
          cinematics: {
            ...(isShotSize(rawCinematics.shotSize ?? rawCinematics.shot_size)
              ? { shotSize: (rawCinematics.shotSize ?? rawCinematics.shot_size) as ScriptV2ShotSize }
              : {}),
            ...(optionalText(rawCinematics.cameraMovement ?? rawCinematics.camera_movement)
              ? { cameraMovement: text(rawCinematics.cameraMovement ?? rawCinematics.camera_movement) }
              : {}),
            ...(optionalText(rawCinematics.lighting)
              ? { lighting: text(rawCinematics.lighting) }
              : {}),
          },
        }
      : {}),
    shotSize,
    emotion: text(raw.emotion),
    sceneAssetIds: stringList(raw.sceneAssetIds ?? raw.scene_asset_ids),
    propTags: text(raw.propTags ?? raw.prop_tags),
    propAssetIds: stringList(raw.propAssetIds ?? raw.prop_asset_ids),
    lightingAndAtmosphere: text(raw.lightingAndAtmosphere ?? raw.lighting_and_atmosphere),
    audioEffects: text(raw.audioEffects ?? raw.audio_effects ?? raw.audio_music),
    dialogue: text(raw.dialogue ?? raw.audio_voice),
    dialogueLines: dialogueLines(raw.dialogueLines ?? raw.dialogue_lines),
    voiceover: optionalText(raw.voiceover),
    bgm: optionalText(raw.bgm),
    sfx: optionalText(raw.sfx),
    imageGenerationPrompt,
    videoMotionPrompt,
    finalImagePromptEntityRefs: entityRefs(
      raw.finalImagePromptEntityRefs ?? raw.final_image_prompt_entity_refs,
    ),
    finalVideoPromptEntityRefs: entityRefs(
      raw.finalVideoPromptEntityRefs ?? raw.final_video_prompt_entity_refs,
    ),
    imageToVideoMotionPrompt: text(
      raw.imageToVideoMotionPrompt ?? raw.image_to_video_motion_prompt,
      videoMotionPrompt,
    ),
    userEditedImageToVideoMotionPrompt: optionalText(
      raw.userEditedImageToVideoMotionPrompt ?? raw.user_edited_image_to_video_motion_prompt,
    ),
    imageVersions: mediaVersions(raw.imageVersions),
    videoVersions: mediaVersions(raw.videoVersions),
    colorLabel: colorLabel(raw.colorLabel),
    imagePromptState: promptState(raw.imagePromptState, imageGenerationPrompt),
    videoPromptState: promptState(raw.videoPromptState, videoMotionPrompt),
  }
  const row = createRow(seed, index + 1, index + 1, partial)
  return {
    ...row,
    id,
    hiddenUuid: text(raw.hiddenUuid).trim() || `hidden_${fnv1a(`${seed}:hidden:${index + 1}`)}`,
    textHash: scriptV2TextFingerprint({ ...row, id }),
    payloadHash: scriptV2PayloadFingerprint({ ...row, id }),
  }
}

function assetRole(value: unknown, fallback: ScriptV2AssetRole): ScriptV2AssetRole {
  return value === 'character' || value === 'scene' || value === 'prop' ? value : fallback
}

function assetSource(value: unknown): ScriptV2AssetSource {
  return value === 'canvas' || value === 'upload' || value === 'library' ? value : 'ai'
}

function assetStatus(value: unknown, hasImage: boolean): ScriptV2AssetStatus {
  return value === 'pending' || value === 'generating' || value === 'ready' || value === 'failed' || value === 'lost'
    ? value
    : hasImage
      ? 'ready'
      : 'pending'
}

function normalizeAsset(
  value: unknown,
  role: ScriptV2AssetRole,
  seed: string,
  index: number,
): ScriptV2Asset | null {
  if (!isPlainRecord(value)) return null
  const name = text(value.name).trim()
  const id = text(value.id).trim() || `asset_${fnv1a(`${seed}:${role}:${index + 1}`)}`
  if (!name && !id) return null
  const thumbnailUrl = optionalText(value.thumbnailUrl ?? value.image_url ?? value.referenceUrl)
  const linkedNodeId = optionalText(value.linkedNodeId ?? value.linked_node_id ?? value.node_id)
  const sourceImageRef = optionalText(value.sourceImageRef ?? value.source_image_ref)
  return {
    id,
    role: assetRole(value.role ?? value.kind, role),
    name,
    description: text(value.description ?? value.desc),
    source: assetSource(value.source),
    status: assetStatus(value.status, Boolean(thumbnailUrl || linkedNodeId)),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(linkedNodeId ? { linkedNodeId } : {}),
    ...(sourceImageRef ? { sourceImageRef } : {}),
    ...(typeof value.isPrimary === 'boolean' || typeof value.is_primary === 'boolean'
      ? { isPrimary: Boolean(value.isPrimary ?? value.is_primary) }
      : {}),
    ...(optionalText(value.error) ? { error: text(value.error) } : {}),
    createdAt: text(value.createdAt, SCRIPT_V2_FIXTURE_TIMESTAMP),
    updatedAt: text(value.updatedAt, SCRIPT_V2_FIXTURE_TIMESTAMP),
  }
}

function normalizeAssetBucket(
  value: unknown,
  role: ScriptV2AssetRole,
  seed: string,
): ScriptV2Asset[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, MAX_SCRIPT_ASSETS_PER_ROLE)
    .flatMap((entry, index) => normalizeAsset(entry, role, seed, index) ?? [])
}

function normalizeAssets(value: unknown, seed: string): ScriptV2Assets {
  const raw = isPlainRecord(value) ? value : {}
  return {
    characters: normalizeAssetBucket(raw.characters, 'character', seed),
    scenes: normalizeAssetBucket(raw.scenes, 'scene', seed),
    props: normalizeAssetBucket(raw.props, 'prop', seed),
  }
}

function normalizeEntry(value: unknown): ScriptV2Entry | null {
  return value === 'screenplay' || value === 'character' || value === 'manual' ? value : null
}

function normalizeStage(value: unknown): ScriptV2Stage {
  return value === 'assets' || value === 'prompts' ? value : 'shots'
}

function normalizedStringList(value: unknown, limit = MAX_SCRIPT_ROWS): string[] {
  return stringList(value, limit)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function normalizedTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  }
  return SCRIPT_V2_FIXTURE_TIMESTAMP
}

function normalizePromptRequestContexts(
  value: unknown,
  validShotIds: Set<string>,
): ScriptV2PromptRequestContext[] | undefined {
  if (!Array.isArray(value)) return undefined
  const contexts = value.slice(0, SCRIPT_V2_RECOMPUTE_MAX_SHOTS * 2).flatMap((entry) => {
    if (!isPlainRecord(entry)) return []
    const shotId = text(entry.shotId ?? entry.shot_id).trim()
    const operationId = text(entry.operationId ?? entry.operation_id).trim()
    const requestInputFingerprint = text(
      entry.requestInputFingerprint ?? entry.request_input_fingerprint,
    ).trim()
    const trackValue = entry.track
    if (
      !shotId ||
      !validShotIds.has(shotId) ||
      !operationId ||
      !requestInputFingerprint ||
      (trackValue !== 'image' && trackValue !== 'video')
    ) {
      return []
    }
    const track = trackValue as ScriptV2PromptTrack
    return [{ shotId, track, operationId, requestInputFingerprint }]
  })
  return contexts.length ? contexts : undefined
}

function normalizePromptBatchRuns(
  value: unknown,
  rows: ScriptV2Row[],
): ScriptV2PromptBatchRun[] {
  if (!Array.isArray(value)) return []
  const validRowIds = new Set(rows.map((row) => row.id))
  const usedRunIds = new Set<string>()
  return value.slice(0, 100).flatMap((entry) => {
    if (!isPlainRecord(entry)) return []
    const runId = text(entry.runId ?? entry.run_id).trim()
    if (!runId || usedRunIds.has(runId)) return []
    const rawTargetIds = normalizedStringList(entry.targetShotIds ?? entry.target_shot_ids)
    const targetShotIds = [...new Set(rawTargetIds)].filter((id) => validRowIds.has(id))
    const rawBatches = Array.isArray(entry.batches) ? entry.batches : []
    const usedBatchIds = new Set<string>()
    const batches = rawBatches.slice(0, 25).flatMap((batchEntry, index) => {
      if (!isPlainRecord(batchEntry)) return []
      const candidateId = text(batchEntry.batchId ?? batchEntry.batch_id).trim()
      const batchId = candidateId && !usedBatchIds.has(candidateId)
        ? candidateId
        : `${runId}_${index + 1}`
      if (usedBatchIds.has(batchId)) return []
      usedBatchIds.add(batchId)
      const shotIds = [...new Set(
        normalizedStringList(batchEntry.shotIds ?? batchEntry.shot_ids, SCRIPT_V2_RECOMPUTE_MAX_SHOTS),
      )].filter((id) => targetShotIds.includes(id)).slice(0, SCRIPT_V2_RECOMPUTE_MAX_SHOTS)
      if (!shotIds.length) return []
      const statusValue = batchEntry.status
      if (
        statusValue !== 'pending' &&
        statusValue !== 'submitting' &&
        statusValue !== 'running' &&
        statusValue !== 'succeeded' &&
        statusValue !== 'failed' &&
        statusValue !== 'cancelled'
      ) return []
      const status = statusValue as ScriptV2PromptBatch['status']
      const taskId = text(batchEntry.taskId ?? batchEntry.task_id).trim()
      const error = optionalText(batchEntry.error)
      const requestContexts = normalizePromptRequestContexts(
        batchEntry.requestContexts ?? batchEntry.request_contexts,
        new Set(shotIds),
      )
      return [{
        batchId,
        shotIds,
        status,
        ...(taskId ? { taskId } : {}),
        ...(error ? { error } : {}),
        ...(requestContexts ? { requestContexts } : {}),
      }]
    })
    if (!targetShotIds.length || !batches.length) return []
    const status = entry.status
    if (status !== 'running' && status !== 'completed' && status !== 'failed' && status !== 'cancelled') {
      return []
    }
    usedRunIds.add(runId)
    return [{
      runId,
      status,
      targetShotIds,
      batchSize: Math.min(
        SCRIPT_V2_RECOMPUTE_MAX_SHOTS,
        Math.max(1, positiveInteger(entry.batchSize ?? entry.batch_size, SCRIPT_V2_RECOMPUTE_MAX_SHOTS)),
      ),
      batches,
      createdAt: normalizedTimestamp(entry.createdAt ?? entry.created_at),
      updatedAt: normalizedTimestamp(entry.updatedAt ?? entry.updated_at),
    }]
  })
}

function normalizeCanonicalState(raw: Record<string, unknown>, fallbackSeed: string): ScriptV2State {
  const seed = text(raw.identitySeed).trim() || fallbackSeed
  const usedIds = new Set<string>()
  const rows = (Array.isArray(raw.rows) ? raw.rows : [])
    .slice(0, MAX_SCRIPT_ROWS)
    .map((row, index) => normalizeRow(row, seed, index, usedIds))
  const generatorRaw = isPlainRecord(raw.generator) ? raw.generator : {}
  const promptComposerRaw = isPlainRecord(raw.promptComposer) ? raw.promptComposer : {}
  const defaults = defaultScriptV2State(seed)
  return {
    ...defaults,
    identitySeed: seed,
    nextRowOrdinal: Math.max(rows.length + 1, positiveInteger(raw.nextRowOrdinal, rows.length + 1)),
    nextAssetOrdinal: Math.max(1, positiveInteger(raw.nextAssetOrdinal, 1)),
    entry: normalizeEntry(raw.entry),
    activeStage: normalizeStage(raw.activeStage),
    title: text(raw.title),
    originalStoryText: text(raw.originalStoryText),
    styleDescription: raw.styleDescription === null ? null : optionalText(raw.styleDescription) ?? null,
    rows,
    assets: normalizeAssets(raw.assets, seed),
    generator: {
      modelId: text(generatorRaw.modelId, 'gvlm-3.1') || 'gvlm-3.1',
      prompt: text(generatorRaw.prompt),
      translating: typeof generatorRaw.translating === 'boolean' ? generatorRaw.translating : true,
      referenceIds: stringList(generatorRaw.referenceIds),
      status:
        generatorRaw.status === 'generating' || generatorRaw.status === 'failed'
          ? generatorRaw.status
          : 'idle',
      error: typeof generatorRaw.error === 'string' ? generatorRaw.error : null,
    },
    promptComposer: {
      singleMode: promptComposerRaw.singleMode === 'auto' ? 'auto' : 'smart',
      batchMode: promptComposerRaw.batchMode === 'auto' ? 'auto' : 'smart',
      modelId: text(promptComposerRaw.modelId, 'gvlm-3.1') || 'gvlm-3.1',
    },
    promptBatchRuns: normalizePromptBatchRuns(raw.promptBatchRuns ?? raw.prompt_batch_runs, rows),
  }
}

function migrateLegacyDraft(raw: Record<string, unknown>, seed: string): ScriptV2State {
  const draft = isPlainRecord(raw.draft) ? raw.draft : raw
  const flatAssets = Array.isArray(draft.assets) ? draft.assets : []
  const buckets: Record<'characters' | 'scenes' | 'props', unknown[]> = {
    characters: [],
    scenes: [],
    props: [],
  }
  for (const asset of flatAssets) {
    if (!isPlainRecord(asset)) continue
    const role = assetRole(asset.kind, 'character')
    buckets[role === 'character' ? 'characters' : role === 'scene' ? 'scenes' : 'props'].push(asset)
  }
  const assets = normalizeAssets(buckets, seed)
  const byId = new Map(
    [...assets.characters, ...assets.scenes, ...assets.props].map((asset) => [asset.id, asset]),
  )
  const legacyRows = Array.isArray(draft.shots) ? draft.shots : Array.isArray(raw.shots) ? raw.shots : []
  const migratedRows = legacyRows.slice(0, MAX_SCRIPT_ROWS).map((entry, index) => {
    const shot = isPlainRecord(entry) ? entry : {}
    const refs = stringList(shot.assetRefs)
    const referenced = refs.flatMap((id) => byId.get(id) ?? [])
    return {
      id: text(shot.id).trim() || undefined,
      hiddenUuid: text(shot.hiddenUuid).trim() || undefined,
      shot_number: positiveInteger(shot.index, index + 1),
      duration_seconds: finiteNumber(shot.durationSeconds, 5),
      plot_description: text(shot.description),
      characters: referenced
        .filter((asset) => asset.role === 'character')
        .map((asset) => ({
          character_name: asset.name,
          character_asset_id: asset.id,
          character_description: asset.description,
          character_image_url: asset.thumbnailUrl ?? '',
        })),
      cinematics: {
        shot_size: isShotSize(shot.shotSize) ? shot.shotSize : '中景',
        ...(optionalText(shot.cameraMove) ? { camera_movement: text(shot.cameraMove) } : {}),
      },
      shot_size: isShotSize(shot.shotSize) ? shot.shotSize : '中景',
      scene_asset_ids: referenced.filter((asset) => asset.role === 'scene').map((asset) => asset.id),
      prop_asset_ids: referenced.filter((asset) => asset.role === 'prop').map((asset) => asset.id),
      dialogue: text(shot.dialogue),
      audio_effects: text(shot.sfx),
      image_generation_prompt: text(shot.finalPrompt),
      video_motion_prompt: '',
    }
  })
  const title = text(draft.logline)
  return normalizeCanonicalState(
    {
      version: 1,
      identitySeed: seed,
      nextRowOrdinal: migratedRows.length + 1,
      nextAssetOrdinal: flatAssets.length + 1,
      entry: draft.entry,
      activeStage: migratedRows.length ? 'shots' : 'shots',
      title,
      originalStoryText: title,
      rows: migratedRows,
      assets,
    },
    seed,
  )
}

export function readScriptV2State(
  extra: Record<string, unknown> | undefined,
  seed = 'script-v2',
): ScriptV2State {
  if (!isPlainRecord(extra)) return defaultScriptV2State(seed)
  if (isPlainRecord(extra.scriptV2) && extra.scriptV2.version === 1) {
    return normalizeCanonicalState(extra.scriptV2, seed)
  }
  if (isPlainRecord(extra.draft) || Array.isArray(extra.shots)) return migrateLegacyDraft(extra, seed)
  return defaultScriptV2State(seed)
}

/* -------------------------------------------------------------------------- */
/* Official protocol adapter                                                  */
/* -------------------------------------------------------------------------- */

export class ScriptV2DomainError extends Error {
  constructor(
    public readonly code: 'RECOMPUTE_LIMIT' | 'INVALID_RESULT',
    message: string,
  ) {
    super(message)
    this.name = 'ScriptV2DomainError'
  }
}

function providerModelId(modelId: string): string {
  if (modelId === 'gvlm-3.1-flash') return 'aurora-3-flash'
  if (modelId === 'cvlm-5.5') return 'claude-3-5-sonnet'
  return 'aurora-3-prime'
}

export interface OfficialScriptNodeData {
  type: 'script-v2'
  title: string
  name: string
  rows: ScriptV2Row[]
  viewMode: 'table'
  action: 'script_generate'
  generatorType: 'default'
  assets: ScriptV2Assets
  params: {
    prompt: string
    model: string
    count: 1
    scene: 'script-generate-v2'
    textList: string[]
    imageList: string[]
    videoList: string[]
    audioList: string[]
  }
  activeViewId: 'default'
  originalStoryText?: string
  styleDescription?: string | null
}

export function serializeOfficialScriptNode(state: ScriptV2State): OfficialScriptNodeData {
  return {
    type: 'script-v2',
    title: state.title,
    name: state.title || '脚本',
    rows: state.rows.map((row) => ({
      ...row,
      characters: row.characters.map((character) => ({ ...character })),
      sceneAssetIds: [...row.sceneAssetIds],
      propAssetIds: [...row.propAssetIds],
      imageVersions: row.imageVersions.map((version) => ({ ...version })),
      videoVersions: row.videoVersions.map((version) => ({ ...version })),
    })),
    viewMode: 'table',
    action: 'script_generate',
    generatorType: 'default',
    assets: {
      characters: state.assets.characters.map((asset) => ({ ...asset })),
      scenes: state.assets.scenes.map((asset) => ({ ...asset })),
      props: state.assets.props.map((asset) => ({ ...asset })),
    },
    params: {
      prompt: state.generator.prompt || state.originalStoryText,
      model: providerModelId(state.generator.modelId),
      count: 1,
      scene: 'script-generate-v2',
      textList: [],
      imageList: [],
      videoList: [],
      audioList: [],
    },
    activeViewId: 'default',
    ...(state.originalStoryText ? { originalStoryText: state.originalStoryText } : {}),
    ...(state.styleDescription !== null ? { styleDescription: state.styleDescription } : {}),
  }
}

export interface ScriptV2IncomingMedia {
  textList: string[]
  imageList: Array<{ nodeId: string; url: string; label?: string }>
  videoList: string[]
  audioList: string[]
}

export interface OfficialScriptGenerationEnvelope {
  params: {
    prompt: string
    model: string
    count: 1
    scene: 'script-generate-v2'
    scenePayload?: {
      source_images: Array<{ ref_id: string; node_id: string; url: string; display_name?: string }>
    }
    textList: string[]
    imageList: string[]
    videoList: string[]
    audioList: string[]
  }
  provider: 'aurora'
  model: string
  taskType: 'text'
  metadata: { node_id: string; project_id: string }
}

export function buildOfficialScriptGenerationEnvelope(input: {
  state: ScriptV2State
  nodeId: string
  projectId: string
  incoming: ScriptV2IncomingMedia
}): OfficialScriptGenerationEnvelope {
  const model = providerModelId(input.state.generator.modelId)
  const sourceImages = input.incoming.imageList.map((image, index) => ({
    ref_id: `src_img_${index + 1}`,
    node_id: image.nodeId,
    url: image.url,
    ...(image.label ? { display_name: image.label } : {}),
  }))
  return {
    params: {
      prompt: input.state.generator.prompt || input.state.originalStoryText,
      model,
      count: 1,
      scene: 'script-generate-v2',
      ...(sourceImages.length ? { scenePayload: { source_images: sourceImages } } : {}),
      textList: [...input.incoming.textList],
      imageList: input.incoming.imageList.map((image) => image.url),
      videoList: [...input.incoming.videoList],
      audioList: [...input.incoming.audioList],
    },
    provider: 'aurora',
    model,
    taskType: 'text',
    metadata: { node_id: input.nodeId, project_id: input.projectId },
  }
}

export interface OfficialSerializedShot {
  shot_id: string
  shot_number: number
  duration_seconds: number
  plot_description: string
  shot_size: ScriptV2ShotSize
  plot_description_entity_refs?: Array<{ text: string; asset_id: string }>
  dialogue_lines?: Array<{
    character_ref?: string
    kind?: 'voiceover' | 'speech'
    text: string
    entity_refs?: Array<{ text: string; asset_id: string }>
  }>
  cinematics?: { shot_size?: ScriptV2ShotSize; camera_movement?: string; lighting?: string }
  scene_asset_ids?: string[]
  prop_asset_ids?: string[]
  lighting_and_atmosphere?: string
  audio_effects?: string
  final_image_prompt_entity_refs?: Array<{ text: string; asset_id: string }>
  final_video_prompt_entity_refs?: Array<{ text: string; asset_id: string }>
  legacy_emotion_hint?: string
}

function officialRefs(refs: ScriptV2EntityRef[] | undefined) {
  return refs?.length ? refs.map((ref) => ({ text: ref.text, asset_id: ref.assetId })) : undefined
}

function stripSpokenMentionMarkers(value: string, refs: ScriptV2EntityRef[] | undefined): string {
  let result = value
  for (const ref of refs ?? []) {
    result = result.replaceAll(`@${ref.text}`, '')
    result = result.replaceAll(`＠${ref.text}`, '')
  }
  return result.trim()
}

function serializeOfficialShot(row: ScriptV2Row): OfficialSerializedShot {
  const cinematics = row.cinematics
    ? {
        ...(row.cinematics.shotSize ? { shot_size: row.cinematics.shotSize } : {}),
        ...(row.cinematics.cameraMovement ? { camera_movement: row.cinematics.cameraMovement } : {}),
        ...(row.cinematics.lighting ? { lighting: row.cinematics.lighting } : {}),
      }
    : undefined
  return {
    shot_id: row.id,
    shot_number: row.shotNumber,
    duration_seconds: row.durationSeconds,
    plot_description: row.plotDescription,
    shot_size: row.shotSize,
    ...(officialRefs(row.plotDescriptionEntityRefs)
      ? { plot_description_entity_refs: officialRefs(row.plotDescriptionEntityRefs) }
      : {}),
    ...(row.dialogueLines?.length
      ? {
          dialogue_lines: row.dialogueLines.map((line) => ({
            ...(line.characterRef ? { character_ref: line.characterRef } : {}),
            ...(line.kind ? { kind: line.kind } : {}),
            text: stripSpokenMentionMarkers(line.text, line.entityRefs),
            ...(officialRefs(line.entityRefs) ? { entity_refs: officialRefs(line.entityRefs) } : {}),
          })),
        }
      : {}),
    ...(cinematics && Object.keys(cinematics).length ? { cinematics } : {}),
    ...(row.sceneAssetIds.length ? { scene_asset_ids: [...row.sceneAssetIds] } : {}),
    ...(row.propAssetIds.length ? { prop_asset_ids: [...row.propAssetIds] } : {}),
    ...(row.lightingAndAtmosphere
      ? { lighting_and_atmosphere: row.lightingAndAtmosphere }
      : {}),
    ...(row.audioEffects ? { audio_effects: row.audioEffects } : {}),
    ...(officialRefs(row.finalImagePromptEntityRefs)
      ? { final_image_prompt_entity_refs: officialRefs(row.finalImagePromptEntityRefs) }
      : {}),
    ...(officialRefs(row.finalVideoPromptEntityRefs)
      ? { final_video_prompt_entity_refs: officialRefs(row.finalVideoPromptEntityRefs) }
      : {}),
    ...(row.emotion.trim() ? { legacy_emotion_hint: row.emotion } : {}),
  }
}

export interface OfficialPromptRecomputeScenePayload {
  shots: OfficialSerializedShot[]
  context_shots?: OfficialSerializedShot[]
  assets?: {
    characters: Array<Pick<ScriptV2Asset, 'id' | 'role' | 'name' | 'description' | 'thumbnailUrl'>>
    scenes: Array<Pick<ScriptV2Asset, 'id' | 'role' | 'name' | 'description' | 'thumbnailUrl'>>
    props: Array<Pick<ScriptV2Asset, 'id' | 'role' | 'name' | 'description' | 'thumbnailUrl'>>
  }
  story_context?: { original_story_text: string }
  meta?: { visual_style: string }
}

export interface OfficialPromptRecomputeEnvelope {
  params: {
    prompt: ''
    model: string
    count: 1
    scene: 'script-recompute-prompts-v2'
    scenePayload: OfficialPromptRecomputeScenePayload
    textList: []
    imageList: []
    imageLabelList: []
    videoList: []
    audioList: []
  }
  provider: 'aurora'
  model: string
  taskType: 'text'
  metadata: { node_id: string; project_id: string }
}

function officialAssets(state: ScriptV2State): OfficialPromptRecomputeScenePayload['assets'] | undefined {
  const project = (assets: ScriptV2Asset[]) =>
    assets
      .filter((asset) => asset.status !== 'lost' && asset.name.trim())
      .map((asset) => ({
        id: asset.id,
        role: asset.role,
        name: asset.name,
        description: asset.description,
        ...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {}),
      }))
  const assets = {
    characters: project(state.assets.characters),
    scenes: project(state.assets.scenes),
    props: project(state.assets.props),
  }
  return assets.characters.length || assets.scenes.length || assets.props.length ? assets : undefined
}

export function buildOfficialPromptRecomputeEnvelope(input: {
  state: ScriptV2State
  rowIds: string[]
  nodeId: string
  projectId: string
}): OfficialPromptRecomputeEnvelope {
  const targetIds = new Set(input.rowIds)
  const rows = input.state.rows.filter((row) => targetIds.has(row.id))
  if (rows.length > SCRIPT_V2_RECOMPUTE_MAX_SHOTS) {
    throw new ScriptV2DomainError(
      'RECOMPUTE_LIMIT',
      `提示词重算单批最多 ${SCRIPT_V2_RECOMPUTE_MAX_SHOTS} 个镜头，当前为 ${rows.length}`,
    )
  }
  if (!rows.length) {
    throw new ScriptV2DomainError('INVALID_RESULT', '提示词重算至少需要一个有效镜头')
  }
  const context = input.state.rows
    .filter((row) => !targetIds.has(row.id))
    .slice(0, SCRIPT_V2_CONTEXT_MAX_SHOTS)
  const model = providerModelId(input.state.promptComposer.modelId)
  const scenePayload: OfficialPromptRecomputeScenePayload = {
    shots: rows.map(serializeOfficialShot),
    ...(context.length ? { context_shots: context.map(serializeOfficialShot) } : {}),
    ...(officialAssets(input.state) ? { assets: officialAssets(input.state) } : {}),
    ...(input.state.originalStoryText
      ? { story_context: { original_story_text: input.state.originalStoryText } }
      : {}),
    ...(input.state.styleDescription
      ? { meta: { visual_style: input.state.styleDescription } }
      : {}),
  }
  return {
    params: {
      prompt: '',
      model,
      count: 1,
      scene: 'script-recompute-prompts-v2',
      scenePayload,
      textList: [],
      imageList: [],
      imageLabelList: [],
      videoList: [],
      audioList: [],
    },
    provider: 'aurora',
    model,
    taskType: 'text',
    metadata: { node_id: input.nodeId, project_id: input.projectId },
  }
}

/* -------------------------------------------------------------------------- */
/* Official task result parsing                                               */
/* -------------------------------------------------------------------------- */

export interface ScriptV2GenerateResult {
  operation: 'generate-full'
  title: string
  rows: ScriptV2Row[]
  assets: ScriptV2Assets
  styleDescription?: string
  shotColumns?: unknown[]
}

export interface ScriptV2RecognizeAssetsResult {
  operation: 'recognize-assets-only'
  assets: ScriptV2Assets
}

export interface ScriptV2RecomputedShot {
  shotId: string
  imageGenerationPrompt: string
  videoMotionPrompt: string
  finalImagePromptEntityRefs?: ScriptV2EntityRef[]
  finalVideoPromptEntityRefs?: ScriptV2EntityRef[]
}

export interface ScriptV2RecomputeResult {
  operation: 'recompute-prompts'
  shots: ScriptV2RecomputedShot[]
}

export type ScriptV2TaskResult =
  | ScriptV2GenerateResult
  | ScriptV2RecognizeAssetsResult
  | ScriptV2RecomputeResult

function parseResultObject(payload: string): { inner: Record<string, unknown>; columns?: unknown[] } {
  let outer: unknown
  try {
    outer = JSON.parse(payload)
  } catch (error) {
    throw new ScriptV2DomainError(
      'INVALID_RESULT',
      `脚本任务结果不是有效 JSON：${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!isPlainRecord(outer)) throw new ScriptV2DomainError('INVALID_RESULT', '脚本任务结果必须是对象')
  if (Array.isArray(outer.texts)) {
    if (typeof outer.texts[0] !== 'string') {
      throw new ScriptV2DomainError('INVALID_RESULT', '脚本任务结果 texts 为空')
    }
    try {
      const inner = JSON.parse(outer.texts[0]) as unknown
      if (!isPlainRecord(inner)) throw new Error('inner result must be an object')
      return { inner, ...(Array.isArray(outer.columns) ? { columns: outer.columns } : {}) }
    } catch (error) {
      throw new ScriptV2DomainError(
        'INVALID_RESULT',
        `脚本任务内部结果不是有效 JSON：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  return { inner: outer, ...(Array.isArray(outer.columns) ? { columns: outer.columns } : {}) }
}

function assetsFromOfficial(value: unknown, seed: string): ScriptV2Assets {
  return normalizeAssets(value, seed)
}

export function parseOfficialScriptResult(
  payload: string,
  options: { operation: ScriptV2TaskResult['operation']; seed?: string },
): ScriptV2TaskResult {
  const seed = options.seed ?? 'script-result'
  const { inner, columns } = parseResultObject(payload)
  const assets = assetsFromOfficial(inner.assets, seed)

  if (options.operation === 'recognize-assets-only') {
    return { operation: 'recognize-assets-only', assets }
  }

  if (!Array.isArray(inner.shots) || inner.shots.length === 0) {
    throw new ScriptV2DomainError('INVALID_RESULT', '脚本任务结果 shots 为空或格式不合法')
  }

  if (options.operation === 'recompute-prompts') {
    const shots = inner.shots.flatMap((entry) => {
      if (!isPlainRecord(entry)) return []
      const shotId = text(entry.shot_id).trim()
      const imageGenerationPrompt = text(entry.image_generation_prompt ?? entry.final_image_prompt).trim()
      const videoMotionPrompt = text(entry.video_motion_prompt ?? entry.final_video_prompt).trim()
      if (!shotId || !imageGenerationPrompt || !videoMotionPrompt) return []
      return [
        {
          shotId,
          imageGenerationPrompt,
          videoMotionPrompt,
          ...(entityRefs(entry.final_image_prompt_entity_refs)
            ? { finalImagePromptEntityRefs: entityRefs(entry.final_image_prompt_entity_refs) }
            : {}),
          ...(entityRefs(entry.final_video_prompt_entity_refs)
            ? { finalVideoPromptEntityRefs: entityRefs(entry.final_video_prompt_entity_refs) }
            : {}),
        },
      ]
    })
    if (!shots.length) throw new ScriptV2DomainError('INVALID_RESULT', '提示词重算结果没有可写回镜头')
    return { operation: 'recompute-prompts', shots }
  }

  const assetNameToId = new Map(
    [...assets.characters, ...assets.scenes, ...assets.props]
      .filter((asset) => asset.name)
      .map((asset) => [asset.name, asset.id]),
  )
  const usedIds = new Set<string>()
  const rows = inner.shots.slice(0, MAX_SCRIPT_ROWS).map((entry, index) => {
    const enriched = isPlainRecord(entry) && Array.isArray(entry.characters)
      ? {
          ...entry,
          characters: entry.characters.map((character) => {
            if (!isPlainRecord(character)) return character
            const name = text(character.character_name).trim()
            return {
              ...character,
              character_asset_id: text(character.character_asset_id) || assetNameToId.get(name) || '',
            }
          }),
        }
      : entry
    return normalizeRow(enriched, seed, index, usedIds)
  })
  const meta = isPlainRecord(inner.meta) ? inner.meta : {}
  return {
    operation: 'generate-full',
    title: text(meta.title ?? inner.title),
    rows,
    assets,
    ...(optionalText(meta.visual_style) ? { styleDescription: text(meta.visual_style) } : {}),
    ...(columns ? { shotColumns: columns } : {}),
  }
}

/* -------------------------------------------------------------------------- */
/* Prompt operation concurrency                                               */
/* -------------------------------------------------------------------------- */

function allAssets(assets: ScriptV2Assets): ScriptV2Asset[] {
  return [...assets.characters, ...assets.scenes, ...assets.props]
}

export function scriptV2PromptInputFingerprint(
  row: ScriptV2Row,
  track: ScriptV2PromptTrack,
  assets: ScriptV2Assets,
  styleDescription: string | null,
): string {
  const referencedIds = new Set([
    ...row.characters.map((character) => character.characterAssetId),
    ...row.sceneAssetIds,
    ...row.propAssetIds,
    ...(row.plotDescriptionEntityRefs ?? []).map((ref) => ref.assetId),
  ])
  return fingerprint(`script-v2-prompt-${track}-v1`, {
    textHash: scriptV2TextFingerprint(row),
    payloadHash: scriptV2PayloadFingerprint(row),
    styleDescription: styleDescription ?? '',
    assets: allAssets(assets)
      .filter((asset) => referencedIds.has(asset.id))
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        description: asset.description,
        thumbnailUrl: asset.thumbnailUrl ?? '',
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  })
}

export function resolveScriptV2PromptWriteback(input: {
  state: ScriptV2State
  result: ScriptV2RecomputeResult
  requestContexts: ScriptV2PromptRequestContext[]
  latestOperationIds: Record<string, string | undefined>
}): ScriptV2State {
  const contexts = new Map(
    input.requestContexts.map((context) => [`${context.shotId}:${context.track}`, context]),
  )
  const results = new Map(input.result.shots.map((shot) => [shot.shotId, shot]))
  let changed = false
  const rows = input.state.rows.map((row) => {
    const result = results.get(row.id)
    if (!result) return row
    let next = row
    for (const track of ['image', 'video'] as const) {
      const key = `${row.id}:${track}`
      const context = contexts.get(key)
      if (!context || input.latestOperationIds[key] !== context.operationId) continue
      const currentFingerprint = scriptV2PromptInputFingerprint(
        row,
        track,
        input.state.assets,
        input.state.styleDescription,
      )
      const state: ScriptV2PromptState =
        currentFingerprint === context.requestInputFingerprint ? 'synced' : 'stale'
      if (track === 'image') {
        next = {
          ...next,
          imageGenerationPrompt: result.imageGenerationPrompt,
          finalImagePromptEntityRefs: result.finalImagePromptEntityRefs,
          imagePromptState: state,
        }
      } else {
        next = {
          ...next,
          videoMotionPrompt: result.videoMotionPrompt,
          finalVideoPromptEntityRefs: result.finalVideoPromptEntityRefs,
          videoPromptState: state,
        }
      }
      changed = true
    }
    return next
  })
  return changed ? { ...input.state, rows } : input.state
}
