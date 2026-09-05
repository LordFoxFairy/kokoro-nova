import { z } from 'zod'

import { IMAGE_ASPECT_RATIOS, IMAGE_QUALITIES } from '@/domain/models'
import {
  AudioAuthoringStateSchema,
  AudioSettingsSchema,
  AudioVoiceSchema,
} from './audio'
import { ScenarioResponseSchema } from './scenario'
import { ScriptV2StateSchema } from './script-v2'
import { TextAuthoringStateSchema } from './text'

export { TextAuthoringStateSchema } from './text'
export { ScriptV2StateSchema } from './script-v2'

const IsoTimestampSchema = z.string().datetime()

export const FolderSchema = z.object({
  id: z.string(),
  spaceId: z.string(),
  name: z.string(),
  coverUrl: z.string().nullable(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
})

export const ProjectSchema = z.object({
  id: z.string(),
  spaceId: z.string(),
  folderId: z.string().nullable(),
  name: z.string(),
  coverUrl: z.string().nullable(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
  canvasIds: z.array(z.string()),
})

export const ProjectListLocalResponseSchema = z.object({
  projects: z.array(ProjectSchema.extend({ canvasCount: z.number().int().nonnegative() })),
  folders: z.array(FolderSchema.extend({ projectCount: z.number().int().nonnegative() })),
  balance: z.number().finite(),
})

export const OutputSpecSchema = z.object({
  aspectRatio: z.enum(['auto', ...IMAGE_ASPECT_RATIOS]).optional(),
  quality: z.enum(IMAGE_QUALITIES).optional(),
  resolution: z.enum(['1K', '2K', '4K', 'adaptive', '480p', '720p', '1080p']).optional(),
  count: z.union([z.literal(1), z.literal(2), z.literal(4)]).optional(),
  durationSeconds: z.number().int().positive().max(120).optional(),
  withAudio: z.boolean().optional(),
  mode: z
    .enum([
      'text2video',
      'omni-reference',
      'image2video',
      'first-frame',
      'first-last-frame',
      'image-reference',
      'video2video',
      'motion-transfer',
      'digital-human',
    ])
    .optional(),
  voiceId: z.string().optional(),
  speed: z.number().optional(),
  pitch: z.number().optional(),
  volume: z.number().optional(),
  emotion: z.string().optional(),
  language: z.enum(['zh', 'en']).optional(),
  sampleRate: z.enum(['8k', '16k', '24k', '48k']).optional(),
  format: z.enum(['wav', 'mp3', 'pcm', 'ogg_opus']).optional(),
  effectPitch: z.number().finite().min(-100).max(100).optional(),
  effectStrength: z.number().finite().min(-100).max(100).optional(),
  timbre: z.number().finite().min(-100).max(100).optional(),
  soundEffect: z.enum(['none', 'echo', 'hall', 'telephone', 'electronic']).optional(),
  stability: z.enum(['lively', 'natural', 'steady']).optional(),
  murekaMode: z.enum(['description', 'lyrics']).optional(),
  instrumental: z.boolean().optional(),
})

export const ArtifactSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  kind: z.enum(['image', 'video', 'audio', 'text']),
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  createdAt: IsoTimestampSchema,
  modelId: z.string(),
  assetId: z.string().nullable(),
  textContent: z.string().nullable().optional(),
})

export const NodeReferenceSchema = z.object({
  id: z.string(),
  kind: z.enum(['image', 'video', 'audio', 'text', 'style', 'effect']),
  origin: z.enum(['node', 'asset', 'upload']),
  refId: z.string(),
  label: z.string(),
  thumbnailUrl: z.string().nullable().optional(),
})

export const NodeExtraSchema = z
  .object({
    audioAuthoring: AudioAuthoringStateSchema.optional(),
    scriptV2: ScriptV2StateSchema.optional(),
    textAuthoring: TextAuthoringStateSchema.optional(),
  })
  .catchall(z.unknown())

export const WorkflowNodeSchema = z.object({
  id: z.string(),
  type: z.enum([
    'text',
    'image',
    'video',
    'videoComposite',
    'director',
    'audio',
    'script',
    'scriptLegacy',
    'style',
    'effect',
    'assetLibrary',
  ]),
  name: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  size: z.object({ width: z.number().nonnegative(), height: z.number().nonnegative() }),
  groupId: z.string().nullable(),
  keyElement: z.boolean(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
  data: z.object({
    prompt: z.string().optional(),
    modelId: z.string().optional(),
    output: OutputSpecSchema.optional(),
    references: z.array(NodeReferenceSchema).optional(),
    artifacts: z.array(ArtifactSchema).optional(),
    jobId: z.string().nullable().optional(),
    extra: NodeExtraSchema.optional(),
  }),
})

export const WorkflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  createdAt: IsoTimestampSchema,
})

export const WorkflowGroupSchema = z.object({
  id: z.string(),
  kind: z.enum(['normal', 'storyboard']),
  name: z.string(),
  nodeIds: z.array(z.string()),
  createdAt: IsoTimestampSchema,
  storyboard: z
    .object({
      aspectRatio: z.enum(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']),
      grid: z.object({ rows: z.number().int().positive(), cols: z.number().int().positive() }),
      showSequenceNumbers: z.boolean(),
    })
    .optional(),
})

export const WorkflowDocumentSchema = z.object({
  schemaVersion: z.number().int().positive(),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
  groups: z.array(WorkflowGroupSchema),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() }),
})

export const CanvasSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  revision: z.number().int().positive(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
  document: WorkflowDocumentSchema,
})

const ExecutionInputSchema = z.object({
  kind: z.enum(['image', 'video', 'audio', 'text', 'style', 'effect']),
  value: z.string(),
  fromNodeId: z.string().nullable(),
})

export const GenerationJobSchema = z.object({
  id: z.string(),
  spaceId: z.string(),
  projectId: z.string(),
  canvasId: z.string(),
  nodeId: z.string(),
  modelId: z.string(),
  status: z.enum([
    'awaiting_confirmation',
    'queued',
    'running',
    'succeeded',
    'failed',
    'cancelled',
    'compliance_blocked',
  ]),
  invocationId: z.string(),
  attempt: z.number().int().nonnegative(),
  progress: z.number().min(0).max(100),
  spec: z.object({
    workflowDigest: z.string(),
    nodeId: z.string(),
    nodeType: WorkflowNodeSchema.shape.type,
    modelId: z.string(),
    prompt: z.string(),
    output: OutputSpecSchema,
    inputs: z.array(ExecutionInputSchema),
  }),
  quote: z.object({
    credits: z.number().nonnegative(),
    priceVersion: z.string(),
    expiresAt: IsoTimestampSchema,
    breakdown: z.array(z.object({ label: z.string(), credits: z.number() })),
  }),
  artifacts: z.array(ArtifactSchema),
  error: z.string().nullable(),
  createdAt: IsoTimestampSchema,
  startedAt: IsoTimestampSchema.nullable(),
  finishedAt: IsoTimestampSchema.nullable(),
})

export const CanvasDetailLocalResponseSchema = z.object({
  canvas: CanvasSchema,
  project: ProjectSchema.nullable().optional(),
  jobs: z.array(GenerationJobSchema),
  balance: z.number().finite(),
})

export const ProjectDetailLocalResponseSchema = z.object({
  project: ProjectSchema,
  canvases: z.array(CanvasSchema),
  balance: z.number().finite(),
})

export const CanvasMutationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('addNode'), node: WorkflowNodeSchema }).strict(),
  z.object({ op: z.literal('updateNode'), nodeId: z.string(), patch: z.record(z.unknown()) }).strict(),
  z.object({ op: z.literal('removeNode'), nodeId: z.string() }).strict(),
  z.object({ op: z.literal('addEdge'), edge: WorkflowEdgeSchema }).strict(),
  z.object({ op: z.literal('removeEdge'), edgeId: z.string() }).strict(),
  z.object({ op: z.literal('addGroup'), group: WorkflowGroupSchema }).strict(),
  z.object({ op: z.literal('updateGroup'), groupId: z.string(), patch: z.record(z.unknown()) }).strict(),
  z.object({ op: z.literal('removeGroup'), groupId: z.string(), deleteNodes: z.boolean() }).strict(),
  z.object({ op: z.literal('setViewport'), viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() }) }).strict(),
])

export const MutationRequestSchema = z
  .object({
    canvasId: z.string().trim().min(1),
    expectedRevision: z.number().int().positive(),
    mutations: z.array(CanvasMutationSchema),
    label: z.string(),
  })
  .strict()

export const MutationResultSchema = z
  .object({
    revision: z.number().int().positive(),
    document: WorkflowDocumentSchema,
  })
  .strict()

export const CreateCanvasRequestSchema = z.object({
  projectId: z.string().trim().min(1),
  name: z.string().optional(),
  copyOf: z.string().trim().min(1).optional(),
}).strict()

export const RenameCanvasRequestSchema = z.object({
  name: z.string().trim().min(1),
}).strict()

export const CreateProjectInputSchema = z.object({
  name: z.string().optional(),
  folderId: z.string().nullable().optional(),
})

/** Shared by the project-folder inline rename and cover picker. */
export const UpdateFolderRequestSchema = z
  .object({
    name: z.string().optional(),
    coverUrl: z.string().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供 name 或 coverUrl')

export const CreateProjectResponseSchema = z.object({
  project: ProjectSchema,
  canvas: CanvasSchema,
})

export { ScenarioResponseSchema }
export { AudioAuthoringStateSchema, AudioSettingsSchema, AudioVoiceSchema }

export type ProjectListLocalResponse = z.infer<typeof ProjectListLocalResponseSchema>
export type CanvasDetailLocalResponse = z.infer<typeof CanvasDetailLocalResponseSchema>
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>
export type UpdateFolderRequest = z.infer<typeof UpdateFolderRequestSchema>
export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>
export type MutationRequest = z.infer<typeof MutationRequestSchema>
export type MutationResult = z.infer<typeof MutationResultSchema>
