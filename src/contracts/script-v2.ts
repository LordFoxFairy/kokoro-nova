import { z } from 'zod'

import {
  SCRIPT_V2_CONTEXT_MAX_SHOTS,
  SCRIPT_V2_MAX_DURATION_SECONDS,
  SCRIPT_V2_MIN_DURATION_SECONDS,
  SCRIPT_V2_RECOMPUTE_MAX_SHOTS,
  SCRIPT_V2_SHOT_SIZES,
  type ScriptV2State,
} from '@/domain/script-v2'

const MAX_ROWS = 500
const MAX_ASSETS_PER_ROLE = 500
const MAX_REFS = 500
const MAX_TEXT = 20_000
const MAX_PROMPT = 40_000

const IdentifierSchema = z.string().trim().min(1).max(200)
const IsoTimestampSchema = z.string().datetime()
const TextSchema = z.string().max(MAX_TEXT)
const PromptSchema = z.string().max(MAX_PROMPT)

export const ScriptV2OperationSchema = z.enum([
  'generate-full',
  'recognize-assets-only',
  'recompute-prompts',
  'generate-asset',
])

export const ScriptV2EntityRefSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    assetId: IdentifierSchema,
  })
  .strict()

export const ScriptV2DialogueLineSchema = z
  .object({
    text: TextSchema,
    characterRef: IdentifierSchema.optional(),
    kind: z.enum(['voiceover', 'speech']).optional(),
    entityRefs: z.array(ScriptV2EntityRefSchema).max(MAX_REFS).optional(),
  })
  .strict()

export const ScriptV2CharacterRefSchema = z
  .object({
    characterName: z.string().max(500),
    characterAssetId: z.string().max(200),
    characterDescription: TextSchema,
    characterImageUrl: z.string().max(4_000),
  })
  .strict()

export const ScriptV2CinematicsSchema = z
  .object({
    shotSize: z.enum(SCRIPT_V2_SHOT_SIZES).optional(),
    cameraMovement: z.string().max(2_000).optional(),
    lighting: z.string().max(2_000).optional(),
  })
  .strict()

export const ScriptV2MediaVersionSchema = z
  .object({
    id: IdentifierSchema,
    url: z.string().min(1).max(4_000),
    thumbnailUrl: z.string().min(1).max(4_000).optional(),
    createdAt: IsoTimestampSchema,
  })
  .strict()

export const ScriptV2RowSchema = z
  .object({
    id: IdentifierSchema,
    hiddenUuid: IdentifierSchema,
    shotNumber: z.number().int().positive().max(MAX_ROWS),
    durationSeconds: z
      .number()
      .int()
      .min(SCRIPT_V2_MIN_DURATION_SECONDS)
      .max(SCRIPT_V2_MAX_DURATION_SECONDS),
    plotDescription: TextSchema,
    plotDescriptionEntityRefs: z.array(ScriptV2EntityRefSchema).max(MAX_REFS).optional(),
    characters: z.array(ScriptV2CharacterRefSchema).max(MAX_ASSETS_PER_ROLE),
    videoReference: z
      .object({
        startTime: z.number().finite().nonnegative(),
        endTime: z.number().finite().nonnegative(),
        referenceFrameImage: z.string().max(4_000),
      })
      .strict()
      .refine((value) => value.endTime >= value.startTime, {
        message: 'videoReference.endTime must be greater than or equal to startTime',
        path: ['endTime'],
      })
      .optional(),
    cinematics: ScriptV2CinematicsSchema.optional(),
    shotSize: z.enum(SCRIPT_V2_SHOT_SIZES),
    emotion: z.string().max(2_000),
    sceneAssetIds: z.array(IdentifierSchema).max(MAX_ASSETS_PER_ROLE),
    propTags: z.string().max(4_000),
    propAssetIds: z.array(IdentifierSchema).max(MAX_ASSETS_PER_ROLE),
    lightingAndAtmosphere: TextSchema,
    audioEffects: TextSchema,
    dialogue: TextSchema,
    dialogueLines: z.array(ScriptV2DialogueLineSchema).max(MAX_ROWS).optional(),
    voiceover: TextSchema.optional(),
    bgm: TextSchema.optional(),
    sfx: TextSchema.optional(),
    imageGenerationPrompt: PromptSchema,
    videoMotionPrompt: PromptSchema,
    finalImagePromptEntityRefs: z.array(ScriptV2EntityRefSchema).max(MAX_REFS).optional(),
    finalVideoPromptEntityRefs: z.array(ScriptV2EntityRefSchema).max(MAX_REFS).optional(),
    imageToVideoMotionPrompt: PromptSchema,
    userEditedImageToVideoMotionPrompt: PromptSchema.optional(),
    imageVersions: z.array(ScriptV2MediaVersionSchema).max(100),
    videoVersions: z.array(ScriptV2MediaVersionSchema).max(100),
    colorLabel: z.enum(['red', 'yellow', 'green', 'blue', 'gray']).nullable(),
    imagePromptState: z.enum([
      'none',
      'synced',
      'stale',
      'generating',
      'user_edited',
      'user_edited_stale',
    ]),
    videoPromptState: z.enum([
      'none',
      'synced',
      'stale',
      'generating',
      'user_edited',
      'user_edited_stale',
    ]),
    textHash: IdentifierSchema,
    payloadHash: IdentifierSchema,
  })
  .strict()

export const ScriptV2AssetComplianceSchema = z
  .object({
    state: z.enum(['pass', 'reject', 'pending', 'expired', 'unknown']),
    reason: z.string().max(4_000).optional(),
    updatedAt: IsoTimestampSchema.optional(),
  })
  .strict()

export const ScriptV2AssetGenerationSettingsSchema = z
  .object({
    modelId: IdentifierSchema,
    prompt: PromptSchema,
    quality: z.enum(['low', 'standard', 'high']),
    resolution: z.enum(['1K', '2K', '4K']),
    aspectRatio: z.string().trim().min(1).max(30),
  })
  .strict()

const ScriptV2AssetBaseSchema = z
  .object({
    id: IdentifierSchema,
    role: z.enum(['character', 'scene', 'prop']),
    name: z.string().max(500),
    description: TextSchema,
    source: z.enum(['ai', 'canvas', 'upload', 'library']),
    status: z.enum(['pending', 'generating', 'ready', 'failed', 'lost']),
    thumbnailUrl: z.string().min(1).max(4_000).optional(),
    linkedNodeId: IdentifierSchema.optional(),
    sourceImageRef: z.string().min(1).max(4_000).optional(),
    isPrimary: z.boolean().optional(),
    compliance: ScriptV2AssetComplianceSchema.optional(),
    generation: ScriptV2AssetGenerationSettingsSchema.optional(),
    error: z.string().max(4_000).optional(),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  })
  .strict()

export const ScriptV2AssetSchema = ScriptV2AssetBaseSchema

const CharacterAssetSchema = ScriptV2AssetBaseSchema.extend({ role: z.literal('character') }).strict()
const SceneAssetSchema = ScriptV2AssetBaseSchema.extend({ role: z.literal('scene') }).strict()
const PropAssetSchema = ScriptV2AssetBaseSchema.extend({ role: z.literal('prop') }).strict()

export const ScriptV2AssetsSchema = z
  .object({
    characters: z.array(CharacterAssetSchema).max(MAX_ASSETS_PER_ROLE),
    scenes: z.array(SceneAssetSchema).max(MAX_ASSETS_PER_ROLE),
    props: z.array(PropAssetSchema).max(MAX_ASSETS_PER_ROLE),
  })
  .strict()

export const ScriptV2GeneratorStateSchema = z
  .object({
    modelId: IdentifierSchema,
    prompt: PromptSchema,
    translating: z.boolean(),
    referenceIds: z.array(IdentifierSchema).max(MAX_REFS),
    status: z.enum(['idle', 'generating', 'failed']),
    error: z.string().max(4_000).nullable(),
  })
  .strict()

export const ScriptV2PromptComposerStateSchema = z
  .object({
    singleMode: z.enum(['smart', 'auto']),
    batchMode: z.enum(['smart', 'auto']),
    modelId: IdentifierSchema,
  })
  .strict()

export const ScriptV2PromptRequestContextSchema = z
  .object({
    shotId: IdentifierSchema,
    track: z.enum(['image', 'video']),
    operationId: IdentifierSchema,
    requestInputFingerprint: IdentifierSchema,
  })
  .strict()

export const ScriptV2PromptBatchSchema = z
  .object({
    batchId: IdentifierSchema,
    shotIds: z.array(IdentifierSchema).min(1).max(SCRIPT_V2_RECOMPUTE_MAX_SHOTS),
    status: z.enum(['pending', 'submitting', 'running', 'succeeded', 'failed', 'cancelled']),
    taskId: IdentifierSchema.optional(),
    error: z.string().max(4_000).optional(),
    requestContexts: z
      .array(ScriptV2PromptRequestContextSchema)
      .max(SCRIPT_V2_RECOMPUTE_MAX_SHOTS * 2)
      .optional(),
  })
  .strict()

export const ScriptV2PromptBatchRunSchema = z
  .object({
    runId: IdentifierSchema,
    status: z.enum(['running', 'completed', 'failed', 'cancelled']),
    targetShotIds: z.array(IdentifierSchema).min(1).max(MAX_ROWS),
    batchSize: z.number().int().positive().max(SCRIPT_V2_RECOMPUTE_MAX_SHOTS),
    batches: z.array(ScriptV2PromptBatchSchema).min(1).max(25),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  })
  .strict()

const ScriptV2StateObjectSchema = z
  .object({
    version: z.literal(1),
    identitySeed: IdentifierSchema,
    nextRowOrdinal: z.number().int().positive(),
    nextAssetOrdinal: z.number().int().positive(),
    entry: z.enum(['screenplay', 'character', 'manual']).nullable(),
    activeStage: z.enum(['shots', 'assets', 'prompts']),
    title: z.string().max(500),
    originalStoryText: TextSchema,
    styleDescription: TextSchema.nullable(),
    rows: z.array(ScriptV2RowSchema).max(MAX_ROWS),
    assets: ScriptV2AssetsSchema,
    generator: ScriptV2GeneratorStateSchema,
    promptComposer: ScriptV2PromptComposerStateSchema,
    promptBatchRuns: z.array(ScriptV2PromptBatchRunSchema).max(100),
  })
  .strict()

export const ScriptV2StateSchema: z.ZodType<ScriptV2State> = ScriptV2StateObjectSchema.superRefine(
  (state, context) => {
    const rowIds = new Set<string>()
    const hiddenIds = new Set<string>()
    state.rows.forEach((row, index) => {
      if (row.shotNumber !== index + 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rows', index, 'shotNumber'],
          message: 'shotNumber must be dense and one-based',
        })
      }
      if (rowIds.has(row.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rows', index, 'id'],
          message: 'row ids must be unique',
        })
      }
      if (hiddenIds.has(row.hiddenUuid)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rows', index, 'hiddenUuid'],
          message: 'hidden row ids must be unique',
        })
      }
      rowIds.add(row.id)
      hiddenIds.add(row.hiddenUuid)
    })

    if (state.nextRowOrdinal <= state.rows.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nextRowOrdinal'],
        message: 'nextRowOrdinal must be greater than the persisted row count',
      })
    }

    const assetIds = new Set<string>()
    const buckets = [state.assets.characters, state.assets.scenes, state.assets.props]
    for (const bucket of buckets) {
      for (const asset of bucket) {
        if (assetIds.has(asset.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['assets'],
            message: 'asset ids must be unique across role buckets',
          })
        }
        assetIds.add(asset.id)
      }
    }
  },
)

const ScriptV2QuoteBreakdownSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    credits: z.number().finite().nonnegative(),
  })
  .strict()

export const ScriptV2QuoteRequestSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('generate-full'),
      modelId: IdentifierSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('recognize-assets-only'),
      modelId: IdentifierSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('recompute-prompts'),
      modelId: IdentifierSchema,
      shotCount: z.number().int().positive().max(MAX_ROWS),
    })
    .strict(),
  z
    .object({
      operation: z.literal('generate-asset'),
      modelId: IdentifierSchema,
      assetCount: z.number().int().positive().max(MAX_ASSETS_PER_ROLE * 3),
      quality: z.enum(['low', 'standard', 'high']),
      resolution: z.enum(['1K', '2K', '4K']),
      aspectRatio: z.string().trim().min(1).max(30),
    })
    .strict(),
])

export const ScriptV2QuoteSchema = z
  .object({
    id: IdentifierSchema,
    operation: ScriptV2OperationSchema,
    credits: z.number().finite().nonnegative(),
    priceVersion: z.literal('script-v2-local-1'),
    expiresAt: IsoTimestampSchema,
    breakdown: z.array(ScriptV2QuoteBreakdownSchema).min(1).max(20),
  })
  .strict()

export const ScriptV2QuoteResponseSchema = z.object({ quote: ScriptV2QuoteSchema }).strict()

const GenerateFullInputSchema = z
  .object({
    storyText: z.string().trim().min(1).max(MAX_TEXT),
    entry: z.enum(['screenplay', 'character']),
    modelId: IdentifierSchema,
    character: z
      .object({
        name: z.string().trim().min(1).max(500),
        description: TextSchema,
        premise: TextSchema,
      })
      .strict()
      .optional(),
  })
  .strict()

const RecognizeAssetsInputSchema = z.object({ state: ScriptV2StateSchema }).strict()

const RecomputePromptsInputSchema = z
  .object({
    state: ScriptV2StateSchema,
    rowIds: z.array(IdentifierSchema).min(1).max(SCRIPT_V2_RECOMPUTE_MAX_SHOTS),
  })
  .strict()

const GenerateAssetInputSchema = z
  .object({
    asset: ScriptV2AssetSchema,
    settings: ScriptV2AssetGenerationSettingsSchema,
  })
  .strict()

const CreateRunBaseShape = {
  idempotencyKey: IdentifierSchema,
  canvasId: IdentifierSchema,
  nodeId: IdentifierSchema,
}

export const CreateScriptV2RunRequestSchema = z.discriminatedUnion('operation', [
  z
    .object({
      ...CreateRunBaseShape,
      operation: z.literal('generate-full'),
      input: GenerateFullInputSchema,
    })
    .strict(),
  z
    .object({
      ...CreateRunBaseShape,
      operation: z.literal('recognize-assets-only'),
      input: RecognizeAssetsInputSchema,
    })
    .strict(),
  z
    .object({
      ...CreateRunBaseShape,
      operation: z.literal('recompute-prompts'),
      input: RecomputePromptsInputSchema,
    })
    .strict(),
  z
    .object({
      ...CreateRunBaseShape,
      operation: z.literal('generate-asset'),
      input: GenerateAssetInputSchema,
    })
    .strict(),
])

export const ScriptV2GenerateResultSchema = z
  .object({
    operation: z.literal('generate-full'),
    title: z.string().max(500),
    rows: z.array(ScriptV2RowSchema).min(1).max(MAX_ROWS),
    assets: ScriptV2AssetsSchema,
    styleDescription: TextSchema.optional(),
    shotColumns: z.array(z.unknown()).max(100).optional(),
  })
  .strict()

export const ScriptV2RecognizeAssetsResultSchema = z
  .object({
    operation: z.literal('recognize-assets-only'),
    assets: ScriptV2AssetsSchema,
  })
  .strict()

export const ScriptV2RecomputeResultSchema = z
  .object({
    operation: z.literal('recompute-prompts'),
    shots: z
      .array(
        z
          .object({
            shotId: IdentifierSchema,
            imageGenerationPrompt: PromptSchema,
            videoMotionPrompt: PromptSchema,
            finalImagePromptEntityRefs: z.array(ScriptV2EntityRefSchema).max(MAX_REFS).optional(),
            finalVideoPromptEntityRefs: z.array(ScriptV2EntityRefSchema).max(MAX_REFS).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(SCRIPT_V2_RECOMPUTE_MAX_SHOTS),
  })
  .strict()

export const ScriptV2GenerateAssetResultSchema = z
  .object({
    operation: z.literal('generate-asset'),
    asset: ScriptV2AssetSchema,
  })
  .strict()

const ScriptV2RunStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
])

const RunBaseShape = {
  id: IdentifierSchema,
  idempotencyKey: IdentifierSchema,
  canvasId: IdentifierSchema,
  nodeId: IdentifierSchema,
  status: ScriptV2RunStatusSchema,
  attempt: z.number().int().positive(),
  progress: z.number().int().min(0).max(100),
  quote: ScriptV2QuoteSchema,
  inputFingerprint: IdentifierSchema,
  error: z.string().max(4_000).nullable(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
}

const ScriptV2RunUnionSchema = z.discriminatedUnion('operation', [
  z
    .object({
      ...RunBaseShape,
      operation: z.literal('generate-full'),
      input: GenerateFullInputSchema,
      result: ScriptV2GenerateResultSchema.nullable(),
    })
    .strict(),
  z
    .object({
      ...RunBaseShape,
      operation: z.literal('recognize-assets-only'),
      input: RecognizeAssetsInputSchema,
      result: ScriptV2RecognizeAssetsResultSchema.nullable(),
    })
    .strict(),
  z
    .object({
      ...RunBaseShape,
      operation: z.literal('recompute-prompts'),
      input: RecomputePromptsInputSchema,
      result: ScriptV2RecomputeResultSchema.nullable(),
    })
    .strict(),
  z
    .object({
      ...RunBaseShape,
      operation: z.literal('generate-asset'),
      input: GenerateAssetInputSchema,
      result: ScriptV2GenerateAssetResultSchema.nullable(),
    })
    .strict(),
])

export const ScriptV2RunSchema = ScriptV2RunUnionSchema.superRefine((run, context) => {
  if (run.quote.operation !== run.operation) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['quote', 'operation'],
      message: 'quote operation must match run operation',
    })
  }
  if (run.status === 'succeeded' && run.result === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['result'],
      message: 'a succeeded run requires an operation-specific result',
    })
  }
  if (run.status !== 'succeeded' && run.result !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['result'],
      message: 'only a succeeded run may expose a result',
    })
  }
  if (run.status === 'succeeded' && run.progress !== 100) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['progress'],
      message: 'a succeeded run must report 100 percent progress',
    })
  }
})

export const ScriptV2RunResponseSchema = z.object({ run: ScriptV2RunSchema }).strict()

export const TransitionScriptV2RunRequestSchema = z
  .object({ action: z.enum(['cancel', 'retry']) })
  .strict()

/*
 * Evidence-only schema for the sanitized official adapter fixture. Provider
 * extensions remain visible so bundle/network observations do not get erased.
 */
const OfficialEntityRefSchema = z
  .object({ text: z.string(), asset_id: z.string() })
  .passthrough()

const OfficialShotSchema = z
  .object({
    shot_id: z.string().min(1),
    shot_number: z.number().int().positive(),
    duration_seconds: z
      .number()
      .int()
      .min(SCRIPT_V2_MIN_DURATION_SECONDS)
      .max(SCRIPT_V2_MAX_DURATION_SECONDS),
    plot_description: z.string(),
    shot_size: z.enum(SCRIPT_V2_SHOT_SIZES),
    plot_description_entity_refs: z.array(OfficialEntityRefSchema).optional(),
    dialogue_lines: z
      .array(
        z
          .object({
            character_ref: z.string().optional(),
            kind: z.enum(['voiceover', 'speech']).optional(),
            text: z.string(),
            entity_refs: z.array(OfficialEntityRefSchema).optional(),
          })
          .passthrough(),
      )
      .optional(),
    cinematics: z
      .object({
        shot_size: z.enum(SCRIPT_V2_SHOT_SIZES).optional(),
        camera_movement: z.string().optional(),
        lighting: z.string().optional(),
      })
      .passthrough()
      .optional(),
    scene_asset_ids: z.array(z.string()).optional(),
    prop_asset_ids: z.array(z.string()).optional(),
    lighting_and_atmosphere: z.string().optional(),
    audio_effects: z.string().optional(),
    final_image_prompt_entity_refs: z.array(OfficialEntityRefSchema).optional(),
    final_video_prompt_entity_refs: z.array(OfficialEntityRefSchema).optional(),
    legacy_emotion_hint: z.string().optional(),
  })
  .passthrough()

const OfficialAssetSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(['character', 'scene', 'prop']),
    name: z.string(),
    description: z.string(),
    thumbnailUrl: z.string().optional(),
  })
  .passthrough()

export const OfficialPromptRecomputeEnvelopeSchema = z
  .object({
    params: z
      .object({
        prompt: z.literal(''),
        model: z.string().min(1),
        count: z.literal(1),
        scene: z.literal('script-recompute-prompts-v2'),
        scenePayload: z
          .object({
            shots: z.array(OfficialShotSchema).min(1).max(SCRIPT_V2_RECOMPUTE_MAX_SHOTS),
            context_shots: z.array(OfficialShotSchema).max(SCRIPT_V2_CONTEXT_MAX_SHOTS).optional(),
            assets: z
              .object({
                characters: z.array(OfficialAssetSchema).max(MAX_ASSETS_PER_ROLE),
                scenes: z.array(OfficialAssetSchema).max(MAX_ASSETS_PER_ROLE),
                props: z.array(OfficialAssetSchema).max(MAX_ASSETS_PER_ROLE),
              })
              .passthrough()
              .optional(),
            story_context: z
              .object({ original_story_text: z.string() })
              .passthrough()
              .optional(),
            meta: z.object({ visual_style: z.string() }).passthrough().optional(),
          })
          .passthrough(),
        textList: z.tuple([]),
        imageList: z.tuple([]),
        imageLabelList: z.tuple([]),
        videoList: z.tuple([]),
        audioList: z.tuple([]),
      })
      .passthrough(),
    provider: z.literal('aurora'),
    model: z.string().min(1),
    taskType: z.literal('text'),
    metadata: z
      .object({ node_id: z.string().min(1), project_id: z.string().min(1) })
      .passthrough(),
  })
  .passthrough()

export type ScriptV2QuoteRequest = z.infer<typeof ScriptV2QuoteRequestSchema>
export type ScriptV2QuoteResponse = z.infer<typeof ScriptV2QuoteResponseSchema>
export type CreateScriptV2RunRequest = z.infer<typeof CreateScriptV2RunRequestSchema>
export type ScriptV2Run = z.infer<typeof ScriptV2RunSchema>
export type ScriptV2RunResponse = z.infer<typeof ScriptV2RunResponseSchema>
export type TransitionScriptV2RunRequest = z.infer<typeof TransitionScriptV2RunRequestSchema>
export type ScriptV2GenerateAssetResult = z.infer<typeof ScriptV2GenerateAssetResultSchema>
