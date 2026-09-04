import type { NodeType } from './nodes'

export type { NodeType }

/* ------------------------------------------------------------------ *
 * Workspace / project / canvas
 * ------------------------------------------------------------------ */

export interface Space {
  id: string
  name: string
  createdAt: string
}

export interface Folder {
  id: string
  spaceId: string
  name: string
  coverUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  spaceId: string
  folderId: string | null
  name: string
  coverUrl: string | null
  createdAt: string
  updatedAt: string
  /** Canvas order inside the project switcher. */
  canvasIds: string[]
}

export interface Canvas {
  id: string
  projectId: string
  name: string
  /** Optimistic-lock version for every workflow mutation. */
  revision: number
  createdAt: string
  updatedAt: string
  document: WorkflowDocument
}

/* ------------------------------------------------------------------ *
 * Workflow document — the editable graph
 * ------------------------------------------------------------------ */

export const WORKFLOW_SCHEMA_VERSION = 1

export interface WorkflowDocument {
  schemaVersion: number
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  groups: WorkflowGroup[]
  viewport: Viewport
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface WorkflowNode {
  id: string
  type: NodeType
  name: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  /** Group membership; a node belongs to at most one group. */
  groupId: string | null
  /** Marked via 节点更多菜单 → 设置关键元素. */
  keyElement: boolean
  createdAt: string
  updatedAt: string
  data: NodeData
}

/** Transition vocabulary shared by the persisted video editor and compose API. */
export type CompositeTransitionId = 'fade' | 'to-black' | 'to-white'

export interface CompositeTransition {
  type: CompositeTransitionId
  /** Requested overlap. The renderer may shorten it for very short neighbours. */
  durationSeconds: number
}

export interface CompositeClip {
  id: string
  artifactId: string
  nodeId: string
  nodeName: string
  url: string
  poster: string | null
  /** Source-file duration, before trimming or speed changes. */
  durationSeconds: number
  inPoint: number
  outPoint: number
  speed: number
  /** Mutes the source clip's own sound without affecting independent tracks. */
  muted: boolean
  /** Transition from this clip into the next clip. */
  transitionAfter: CompositeTransition | null
}

export interface CompositeAudioTrack {
  id: string
  artifactId: string
  nodeId: string
  nodeName: string
  url: string
  poster: string | null
  durationSeconds: number
  inPoint: number
  outPoint: number
  /** Placement on the composed video timeline. */
  start: number
  volume: number
  muted: boolean
}

export interface CompositeSubtitle {
  id: string
  text: string
  start: number
  end: number
  visible: boolean
}

/**
 * Versioned state stored at `videoComposite.data.extra.composite`.
 *
 * Playback position and timeline zoom are included so closing/reopening the
 * embedded editor is lossless. They are UI state, but still belong to this
 * per-composite document rather than to a global component singleton.
 */
export interface CompositeDocument {
  version: 1
  clips: CompositeClip[]
  audioTracks: CompositeAudioTrack[]
  subtitles: CompositeSubtitle[]
  playheadSeconds: number
  zoom: number
  sourceAudioMuted: boolean
}

/** Per-type editable state. Kept as a discriminated-free bag so the compiler
 * (workflow → ExecutionSpec) owns validation instead of the UI. */
export interface NodeData {
  /** Free prompt for text/image/video/audio/script generators. */
  prompt?: string
  /** Selected model id from the catalog. */
  modelId?: string
  /** Output spec — meaning depends on the node's media class. */
  output?: OutputSpec
  /** Explicit reference inputs beyond graph edges (drag-dropped assets). */
  references?: NodeReference[]
  /** Last successful artifacts, newest first. */
  artifacts?: Artifact[]
  /** Current job, if a generation is in flight or awaiting confirmation. */
  jobId?: string | null
  /** Node-specific extras (script shots, director scene, composite timeline…). */
  extra?: Record<string, unknown>
}

export interface OutputSpec {
  aspectRatio?:
    | 'auto'
    | '21:9'
    | '9:21'
    | '16:9'
    | '9:16'
    | '5:4'
    | '4:5'
    | '4:3'
    | '3:4'
    | '3:2'
    | '2:3'
    | '2:1'
    | '1:2'
    | '1:1'
  quality?: 'low' | 'standard' | 'high'
  resolution?: '1K' | '2K' | '4K' | 'adaptive' | '480p' | '720p' | '1080p'
  count?: 1 | 2 | 4
  /** Model registries constrain the exact choices; current video models span 5–40 seconds. */
  durationSeconds?: number
  withAudio?: boolean
  /** Video generation mode, derived from what is connected upstream. */
  mode?:
    | 'text2video'
    | 'omni-reference'
    | 'image2video'
    | 'first-frame'
    | 'first-last-frame'
    | 'image-reference'
    | 'video2video'
    | 'motion-transfer'
    | 'digital-human'
  /** Audio only. */
  voiceId?: string
  speed?: number
  pitch?: number
  volume?: number
  emotion?: string
  language?: 'zh' | 'en'
  sampleRate?: '8k' | '16k' | '24k' | '48k'
  format?: 'wav' | 'mp3' | 'pcm' | 'ogg_opus'
  effectPitch?: number
  effectStrength?: number
  timbre?: number
  soundEffect?: 'none' | 'echo' | 'hall' | 'telephone' | 'electronic'
  stability?: 'lively' | 'natural' | 'steady'
  murekaMode?: 'description' | 'lyrics'
  instrumental?: boolean
}

export interface NodeReference {
  id: string
  kind: 'image' | 'video' | 'audio' | 'text' | 'style' | 'effect'
  /** Where it came from: a canvas node, an asset, or an inline upload. */
  origin: 'node' | 'asset' | 'upload'
  refId: string
  label: string
  thumbnailUrl?: string | null
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  createdAt: string
}

export type GroupKind = 'normal' | 'storyboard'

export interface WorkflowGroup {
  id: string
  kind: GroupKind
  name: string
  nodeIds: string[]
  createdAt: string
  /** Storyboard groups only. */
  storyboard?: StoryboardGroupConfig
}

export interface StoryboardGroupConfig {
  aspectRatio: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16'
  grid: { rows: number; cols: number }
  showSequenceNumbers: boolean
}

/* ------------------------------------------------------------------ *
 * Assets / artifacts
 * ------------------------------------------------------------------ */

export type AssetKind = 'image' | 'video' | 'audio' | 'text'
export type AssetNamespace = 'personal' | 'agent'
export type AssetTag = '其它' | '人物' | '场景' | '物品' | '风格' | '音效'

export interface Asset {
  id: string
  spaceId: string
  namespace: AssetNamespace
  kind: AssetKind
  name: string
  url: string
  thumbnailUrl: string | null
  width: number | null
  height: number | null
  durationSeconds: number | null
  byteSize: number
  tags: AssetTag[]
  folderId: string | null
  /** STAGING → COMMITTED → REVOKED lifecycle from the compliance draft. */
  state: 'staging' | 'committed' | 'revoked'
  createdAt: string
  /** Set when the asset was registered from a generation artifact. */
  sourceArtifactId: string | null
}

export interface Artifact {
  id: string
  jobId: string
  kind: AssetKind
  url: string
  thumbnailUrl: string | null
  width: number | null
  height: number | null
  durationSeconds: number | null
  createdAt: string
  /** Provider-reported model actually used, for audit reproducibility. */
  modelId: string
  /** Set once the artifact has been registered into the asset library. */
  assetId: string | null
}

/* ------------------------------------------------------------------ *
 * Generation jobs
 * ------------------------------------------------------------------ */

export type JobStatus =
  | 'awaiting_confirmation'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'compliance_blocked'

export interface GenerationJob {
  id: string
  spaceId: string
  projectId: string
  canvasId: string
  nodeId: string
  modelId: string
  status: JobStatus
  /** Stable logical side-effect id, constant across infra attempts. */
  invocationId: string
  attempt: number
  progress: number
  /** Frozen at submit time; the node may drift afterwards. */
  spec: ExecutionSpec
  quote: Quote
  artifacts: Artifact[]
  error: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

/** Immutable compile output of the editable document for one node run. */
export interface ExecutionSpec {
  workflowDigest: string
  nodeId: string
  nodeType: NodeType
  modelId: string
  prompt: string
  output: OutputSpec
  inputs: ExecutionInput[]
}

export interface ExecutionInput {
  kind: 'image' | 'video' | 'audio' | 'text' | 'style' | 'effect'
  /** Resolved URL or literal text. */
  value: string
  fromNodeId: string | null
}

export interface Quote {
  credits: number
  priceVersion: string
  expiresAt: string
  breakdown: { label: string; credits: number }[]
}

/* ------------------------------------------------------------------ *
 * Ledger
 * ------------------------------------------------------------------ */

export type LedgerEntryType = 'grant' | 'reserve' | 'settle' | 'release' | 'purchase'

export interface LedgerEntry {
  id: string
  spaceId: string
  type: LedgerEntryType
  credits: number
  balanceAfter: number
  /** Deduplication key; a repeated webhook/attempt must not double-charge. */
  logicalChargeId: string
  jobId: string | null
  note: string
  createdAt: string
}

/* ------------------------------------------------------------------ *
 * Agent
 * ------------------------------------------------------------------ */

export interface AgentSession {
  id: string
  spaceId: string
  projectId: string | null
  canvasId: string | null
  title: string
  /** Monotonic cursor handed to `afterSeq` pollers. */
  seq: number
  createdAt: string
  updatedAt: string
  shared: boolean
  settings: AgentSettings
}

export interface AgentSettings {
  /** 手动 = ask before every generation; 自动 = auto-run media generation. */
  generationMode: 'manual' | 'auto'
  modelId: string
  /** Remaining free turns for non-members. */
  freeTurns: number
}

export type AgentMessageRole = 'user' | 'assistant' | 'tool' | 'system'

export interface AgentMessage {
  id: string
  sessionId: string
  seq: number
  role: AgentMessageRole
  content: string
  createdAt: string
  /** Context chips attached by the user before sending. */
  context?: AgentContextChip[]
  /** Structured payload for tool calls / ask_human / mutation proposals. */
  payload?: AgentPayload
}

export interface AgentContextChip {
  id: string
  kind: 'node' | 'asset' | 'model' | 'skill' | 'artifact'
  refId: string
  label: string
  thumbnailUrl?: string | null
}

export type AgentPayload =
  | { kind: 'ask_human'; question: string; placeholder: string; answered: boolean; answer?: string }
  | { kind: 'tool_call'; tool: string; summary: string; status: 'running' | 'ok' | 'error' }
  | {
      kind: 'mutation_proposal'
      summary: string
      status: 'pending' | 'applied' | 'rejected'
      mutations: CanvasMutation[]
    }
  | { kind: 'quota_gate'; reason: string }

/* ------------------------------------------------------------------ *
 * Canvas mutations — the only write path into a workflow document
 * ------------------------------------------------------------------ */

export type CanvasMutation =
  | { op: 'addNode'; node: WorkflowNode }
  | { op: 'updateNode'; nodeId: string; patch: Partial<Omit<WorkflowNode, 'id'>> }
  | { op: 'removeNode'; nodeId: string }
  | { op: 'addEdge'; edge: WorkflowEdge }
  | { op: 'removeEdge'; edgeId: string }
  | { op: 'addGroup'; group: WorkflowGroup }
  | { op: 'updateGroup'; groupId: string; patch: Partial<Omit<WorkflowGroup, 'id'>> }
  | { op: 'removeGroup'; groupId: string; deleteNodes: boolean }
  | { op: 'setViewport'; viewport: Viewport }

export interface MutationRequest {
  canvasId: string
  /** Optimistic lock; a stale value is rejected with 409. */
  expectedRevision: number
  mutations: CanvasMutation[]
  /** Human-readable label used by the undo stack and the activity log. */
  label: string
}

export interface MutationResult {
  revision: number
  document: WorkflowDocument
}
