import {
  MODELS_BY_ID,
  modelOutputOptions,
  normalizeOutputForModel,
  quoteCredits,
  PRICE_VERSION,
  VIDEO_MODE_LABELS,
  type VideoGenerationMode,
  type VideoReferenceRequirement,
} from './models'
import { audioExecutionOutput, readAudioAuthoringState } from './audio-authoring'
import { canConnect } from './nodes'
import {
  incomingVideoReferenceEdges,
  referenceKindForNode,
  type VideoReferenceKind,
} from './video-references'
import { readTextAuthoringState, textDocumentPlainText } from './text-authoring'
import type { ExecutionInput, ExecutionSpec, OutputSpec, Quote, WorkflowDocument, WorkflowNode } from './types'

/** Stable non-cryptographic digest of the compiled inputs, for audit trails. */
export function digest(value: unknown): string {
  const json = JSON.stringify(value)
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < json.length; i += 1) {
    const c = json.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0
  }
  return (h1.toString(16) + h2.toString(16)).padStart(16, '0')
}

export class CompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompileError'
  }
}

/** Nodes that feed `nodeId` through graph edges, in stable creation order. */
export function upstreamNodes(doc: WorkflowDocument, nodeId: string): WorkflowNode[] {
  const sourceIds = doc.edges.filter((e) => e.target === nodeId).map((e) => e.source)
  return doc.nodes.filter((n) => sourceIds.includes(n.id))
}

export function downstreamNodes(doc: WorkflowDocument, nodeId: string): WorkflowNode[] {
  const targetIds = doc.edges.filter((e) => e.source === nodeId).map((e) => e.target)
  return doc.nodes.filter((n) => targetIds.includes(n.id))
}

export interface VideoModeOption {
  mode: VideoGenerationMode
  available: boolean
  reason: string | null
}

export interface VideoInputCounts {
  images: number
  videos: number
  audios: number
  anyMedia: number
}

export type VideoInputIssueCode =
  | 'missing-source-node'
  | 'incompatible-edge'
  | 'missing-artifact'
  | 'missing-preset'
  | 'invalid-reference'

export interface VideoInputIssue {
  code: VideoInputIssueCode
  message: string
  sourceNodeId?: string
  referenceId?: string
  kind?: VideoReferenceKind
}

export interface VideoInputContract {
  inputs: ExecutionInput[]
  counts: VideoInputCounts
  staleNodeReferences: string[]
  issues: VideoInputIssue[]
}

export interface VideoModeContract extends VideoModeOption {
  requirement: VideoReferenceRequirement
  counts: VideoInputCounts
}

const INPUT_KINDS = new Set<VideoReferenceKind>([
  'image',
  'video',
  'audio',
  'text',
  'style',
  'effect',
])

const MEDIA_KINDS = new Set<VideoReferenceKind>(['image', 'video', 'audio'])

const KIND_LABELS: Record<VideoReferenceKind, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  text: '文本',
  style: '风格',
  effect: '特效',
}

function isVideoReferenceKind(value: unknown): value is VideoReferenceKind {
  return typeof value === 'string' && INPUT_KINDS.has(value as VideoReferenceKind)
}

function isMediaKind(value: unknown): value is 'image' | 'video' | 'audio' {
  return typeof value === 'string' && MEDIA_KINDS.has(value as VideoReferenceKind)
}

export function videoInputCounts(inputs: readonly ExecutionInput[]): VideoInputCounts {
  return {
    images: inputs.filter((input) => input.kind === 'image').length,
    videos: inputs.filter((input) => input.kind === 'video').length,
    audios: inputs.filter((input) => input.kind === 'audio').length,
    anyMedia: inputs.filter((input) => isMediaKind(input.kind)).length,
  }
}

function constraintMet(actual: number, constraint: { min: number; max?: number } | undefined): boolean {
  if (!constraint) return true
  return actual >= constraint.min && (constraint.max === undefined || actual <= constraint.max)
}

function requirementMet(counts: VideoInputCounts, requirement: VideoReferenceRequirement): boolean {
  return (
    constraintMet(counts.images, requirement.images) &&
    constraintMet(counts.videos, requirement.videos) &&
    constraintMet(counts.audios, requirement.audios) &&
    constraintMet(counts.anyMedia, requirement.anyMedia)
  )
}

function requirementReason(requirement: VideoReferenceRequirement): string {
  const parts: string[] = []
  if (requirement.images) parts.push(`${requirement.images.min} 张图片`)
  if (requirement.videos) parts.push(`${requirement.videos.min} 条视频`)
  if (requirement.audios) parts.push(`${requirement.audios.min} 条音频`)
  if (requirement.anyMedia) parts.push(`${requirement.anyMedia.min} 个参考素材`)
  return parts.length > 0 ? `需要 ${parts.join('和 ')}参考` : '当前输入不满足模型要求'
}

function strictRequirementReason(counts: VideoInputCounts, requirement: VideoReferenceRequirement): string | null {
  const missing: string[] = []
  if (requirement.images && counts.images < requirement.images.min) {
    missing.push(`${requirement.images.min} 张图片`)
  }
  if (requirement.videos && counts.videos < requirement.videos.min) {
    missing.push(`${requirement.videos.min} 条视频`)
  }
  if (requirement.audios && counts.audios < requirement.audios.min) {
    missing.push(`${requirement.audios.min} 条音频`)
  }
  if (requirement.anyMedia && counts.anyMedia < requirement.anyMedia.min) {
    missing.push(`${requirement.anyMedia.min} 个参考素材`)
  }
  if (missing.length > 0) return requirementReason(requirement)

  const tooMany: string[] = []
  if (requirement.images?.max !== undefined && counts.images > requirement.images.max) {
    tooMany.push(`${requirement.images.max} 张图片`)
  }
  if (requirement.videos?.max !== undefined && counts.videos > requirement.videos.max) {
    tooMany.push(`${requirement.videos.max} 条视频`)
  }
  if (requirement.audios?.max !== undefined && counts.audios > requirement.audios.max) {
    tooMany.push(`${requirement.audios.max} 条音频`)
  }
  if (requirement.anyMedia?.max !== undefined && counts.anyMedia > requirement.anyMedia.max) {
    tooMany.push(`${requirement.anyMedia.max} 个参考素材`)
  }
  if (tooMany.length > 0) return `最多 ${tooMany.join('和 ')}参考`
  return null
}

function unsupportedKindReason(mode: VideoGenerationMode, kind: 'image' | 'video' | 'audio'): string {
  return `${VIDEO_MODE_LABELS[mode]}不接受${KIND_LABELS[kind]}参考`
}

/** `anyMedia` means every media kind; otherwise declared media keys are a whitelist. */
function allowedMediaKinds(requirement: VideoReferenceRequirement): Set<'image' | 'video' | 'audio'> | null {
  if (requirement.anyMedia) return null
  const allowed = new Set<'image' | 'video' | 'audio'>()
  if (requirement.images) allowed.add('image')
  if (requirement.videos) allowed.add('video')
  if (requirement.audios) allowed.add('audio')
  return allowed
}

function strictModeReason(
  mode: VideoGenerationMode,
  inputs: readonly ExecutionInput[],
  counts: VideoInputCounts,
  requirement: VideoReferenceRequirement,
): string | null {
  const allowed = allowedMediaKinds(requirement)
  if (allowed) {
    const unsupported = inputs.find(
      (input): input is ExecutionInput & { kind: 'image' | 'video' | 'audio' } =>
        isMediaKind(input.kind) && !allowed.has(input.kind),
    )
    if (unsupported) return unsupportedKindReason(mode, unsupported.kind)
  }
  return strictRequirementReason(counts, requirement)
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function resolveNodeInput(source: WorkflowNode): ExecutionInput | null {
  const kind = referenceKindForNode(source)
  if (!kind) return null

  if (kind === 'text') {
    const authoring = source.type === 'text' ? readTextAuthoringState(source.data.extra) : null
    const artifactText = source.data.artifacts?.find((artifact) => artifact.kind === 'text')?.textContent
    const text = (
      authoring?.mode === 'document'
        ? textDocumentPlainText(authoring)
        : (artifactText ?? source.data.prompt ?? '')
    ).trim()
    return text ? { kind, value: text, fromNodeId: source.id } : null
  }

  if (kind === 'style' || kind === 'effect') {
    const presetId = firstNonEmptyString(source.data.extra?.presetId)
    return presetId ? { kind, value: presetId, fromNodeId: source.id } : null
  }

  const artifact = source.data.artifacts?.find(
    (candidate) => candidate.kind === kind && typeof candidate.url === 'string' && candidate.url.trim(),
  )
  if (artifact) return { kind, value: artifact.url, fromNodeId: source.id }

  // Early asset-library fixtures sometimes persisted the URL on `extra`.
  if (source.type === 'assetLibrary') {
    const value = firstNonEmptyString(
      source.data.extra?.url,
      source.data.extra?.assetUrl,
      source.data.extra?.previewUrl,
    )
    if (value) return { kind, value, fromNodeId: source.id }
  }
  return null
}

function connectionForEdge(source: WorkflowNode, target: WorkflowNode) {
  const kind = referenceKindForNode(source)
  // `canConnect`'s third-argument type predates text/style asset-library rows;
  // the runtime check already handles those persisted values.
  const assetKind = source.type === 'assetLibrary'
    ? (kind as unknown as 'image' | 'video' | 'audio' | null)
    : null
  return canConnect(source.type, target.type, assetKind)
}

function missingInputMessage(source: WorkflowNode, kind: VideoReferenceKind): string {
  if (kind === 'style' || kind === 'effect') {
    return `${source.name} 没有可用的${KIND_LABELS[kind]}预设`
  }
  return `${source.name} 没有可用的${KIND_LABELS[kind]}产物`
}

function makeVideoInputContract(doc: WorkflowDocument, target: WorkflowNode): VideoInputContract {
  const inputs: ExecutionInput[] = []
  const issues: VideoInputIssue[] = []
  const staleNodeReferences: string[] = []
  const incoming = incomingVideoReferenceEdges(doc, target.id)

  for (const { edge, node: source } of incoming) {
    if (!source) {
      issues.push({
        code: 'missing-source-node',
        message: `节点不存在: ${edge.source}`,
        sourceNodeId: edge.source,
      })
      continue
    }

    const connection = connectionForEdge(source, target)
    if (!connection.ok) {
      issues.push({
        code: 'incompatible-edge',
        message: connection.reason,
        sourceNodeId: source.id,
        kind: referenceKindForNode(source) ?? undefined,
      })
      continue
    }

    const input = resolveNodeInput(source)
    if (input) {
      inputs.push(input)
    } else {
      const kind = referenceKindForNode(source)
      // Empty text is a harmless upstream draft; selected media/presets must
      // not disappear silently from a video contract.
      if (kind && kind !== 'text') {
        issues.push({
          code: kind === 'style' || kind === 'effect' ? 'missing-preset' : 'missing-artifact',
          message: missingInputMessage(source, kind),
          sourceNodeId: source.id,
          kind,
        })
      }
    }
  }

  const linkedNodeIds = new Set(incoming.filter(({ node }) => node !== null).map(({ edge }) => edge.source))
  for (const reference of target.data.references ?? []) {
    if (reference.origin === 'node') {
      if (!linkedNodeIds.has(reference.refId) && !staleNodeReferences.includes(reference.refId)) {
        staleNodeReferences.push(reference.refId)
      }
      continue
    }

    if (!isVideoReferenceKind(reference.kind) || typeof reference.refId !== 'string' || !reference.refId.trim()) {
      issues.push({
        code: 'invalid-reference',
        message: '视频节点引用缺少有效的资源标识',
        referenceId: typeof reference.refId === 'string' ? reference.refId : undefined,
        kind: isVideoReferenceKind(reference.kind) ? reference.kind : undefined,
      })
      continue
    }
    inputs.push({ kind: reference.kind, value: reference.refId, fromNodeId: null })
  }

  return {
    inputs,
    counts: videoInputCounts(inputs),
    staleNodeReferences,
    issues,
  }
}

/**
 * The mode list is the intersection of model capabilities and material inputs.
 * The richer `videoModeOptions` powers disabled menu rows; this compact helper
 * is retained for compile-time validation and callers that only need runnable
 * choices.
 */
export function videoModeOptions(doc: WorkflowDocument, nodeId: string, modelIdOverride?: string): VideoModeOption[] {
  const node = doc.nodes.find((item) => item.id === nodeId)
  const modelId = modelIdOverride ?? node?.data.modelId
  const capabilities = modelId ? modelOutputOptions(modelId) : null
  if (!node || !capabilities) return []

  const counts = videoInputCounts(resolveInputs(doc, node))
  return capabilities.modes.map((mode) => {
    const requirement = capabilities.referenceRequirements[mode] ?? {}
    const available = requirementMet(counts, requirement)
    return { mode, available, reason: available ? null : requirementReason(requirement) }
  })
}

/**
 * Canonical mode rows used by the compiler.  Unlike the legacy menu projection
 * above, a mode is unavailable when any connected media kind falls outside its
 * declared reference requirement.  This prevents image-to-video from silently
 * dropping a connected video, and likewise for the other specialist modes.
 */
export function videoModeContracts(
  doc: WorkflowDocument,
  nodeId: string,
  modelIdOverride?: string,
): VideoModeContract[] {
  const node = doc.nodes.find((item) => item.id === nodeId)
  const modelId = modelIdOverride ?? node?.data.modelId
  const capabilities = modelId ? modelOutputOptions(modelId) : null
  if (!node || !capabilities) return []

  const input = makeVideoInputContract(doc, node)
  return capabilities.modes.map((mode) => {
    const requirement = capabilities.referenceRequirements[mode] ?? {}
    const reason = input.issues[0]?.message ?? strictModeReason(mode, input.inputs, input.counts, requirement)
    return {
      mode,
      available: reason === null,
      reason,
      requirement,
      counts: input.counts,
    }
  })
}

/** Resolve the canonical graph-edge and dropped-reference input snapshot. */
export function videoInputContract(doc: WorkflowDocument, nodeId: string): VideoInputContract {
  const node = doc.nodes.find((item) => item.id === nodeId)
  if (!node) throw new CompileError(`节点不存在: ${nodeId}`)
  return makeVideoInputContract(doc, node)
}

export function availableVideoModes(doc: WorkflowDocument, nodeId: string, modelIdOverride?: string): VideoGenerationMode[] {
  return videoModeOptions(doc, nodeId, modelIdOverride)
    .filter((option) => option.available)
    .map((option) => option.mode)
}

function resolveInputs(doc: WorkflowDocument, node: WorkflowNode): ExecutionInput[] {
  if (node.type === 'video') return makeVideoInputContract(doc, node).inputs

  const inputs: ExecutionInput[] = []

  for (const source of upstreamNodes(doc, node.id)) {
    const input = resolveNodeInput(source)
    if (input) inputs.push(input)
  }

  // Drag-dropped references are inputs too, and they are not represented by edges.
  for (const ref of node.data.references ?? []) {
    if (ref.origin === 'node') continue // already covered by the edge walk
    inputs.push({ kind: ref.kind, value: ref.refId, fromNodeId: null })
  }

  return inputs
}

type VideoModePolicy = 'repair' | 'strict'

function selectVideoMode(
  node: WorkflowNode,
  modelId: string,
  contracts: readonly VideoModeContract[],
  policy: VideoModePolicy,
): VideoGenerationMode {
  const available = contracts.filter((contract) => contract.available)
  const storedMode = node.data.output?.mode as VideoGenerationMode | undefined
  const stored = storedMode ? contracts.find((contract) => contract.mode === storedMode) : undefined

  if (stored?.available) return stored.mode
  if (policy === 'strict' && storedMode) {
    if (stored) throw new CompileError(stored.reason ?? `${VIDEO_MODE_LABELS[storedMode]}当前不可用`)
    throw new CompileError(`模型不支持视频模式: ${String(storedMode)}`)
  }

  if (available.length === 0) {
    const reason = stored?.reason ?? contracts.find((contract) => contract.reason)?.reason
    throw new CompileError(reason ?? '当前没有可用的生成模式')
  }

  const defaultMode = modelOutputOptions(modelId)?.defaults.mode
  return available.find((contract) => contract.mode === defaultMode)?.mode ?? available[0].mode
}

/** Video providers accept this compact whitelist, not stale cross-family fields. */
function canonicalVideoOutput(modelId: string, rawOutput: OutputSpec | undefined, mode: VideoGenerationMode): OutputSpec {
  const normalized = normalizeOutputForModel(modelId, rawOutput, [mode])
  return {
    aspectRatio: normalized.aspectRatio,
    resolution: normalized.resolution,
    durationSeconds: normalized.durationSeconds,
    count: normalized.count,
    withAudio: normalized.withAudio,
    mode,
  }
}

function compileNodeInternal(
  doc: WorkflowDocument,
  nodeId: string,
  videoModePolicy: VideoModePolicy,
): { spec: ExecutionSpec; quote: Quote } {
  const node = doc.nodes.find((n) => n.id === nodeId)
  if (!node) throw new CompileError(`节点不存在: ${nodeId}`)

  const modelId = node.data.modelId
  if (!modelId) throw new CompileError(`${node.name} 未选择模型`)
  const model = MODELS_BY_ID.get(modelId)
  if (!model) throw new CompileError(`未知模型: ${modelId}`)
  if (node.type === 'video' && model.media !== 'video') {
    throw new CompileError('视频节点需要视频模型')
  }

  const videoContract = node.type === 'video' ? makeVideoInputContract(doc, node) : null
  if (videoContract?.issues.length) {
    throw new CompileError(videoContract.issues[0].message)
  }
  const inputs = videoContract?.inputs ?? resolveInputs(doc, node)
  const prompt = (node.data.prompt ?? '').trim()
  const inheritedText = inputs
    .filter((i) => i.kind === 'text')
    .map((i) => i.value)
    .join('\n')
  const effectivePrompt = [prompt, inheritedText].filter(Boolean).join('\n')

  const needsPrompt = node.type !== 'videoComposite' && node.type !== 'director'
  const hasMediaInput = inputs.some((i) => isMediaKind(i.kind))
  if (needsPrompt && !effectivePrompt && !hasMediaInput) {
    throw new CompileError(`${node.name} 需要提示词或已连接的素材输入`)
  }

  let output: OutputSpec = { ...(node.data.output ?? {}) }
  if (node.type === 'video' && model.media === 'video') {
    const contracts = videoModeContracts(doc, node.id)
    const mode = selectVideoMode(node, modelId, contracts, videoModePolicy)
    output = canonicalVideoOutput(modelId, node.data.output, mode)
  } else if (model.media === 'video') {
    // Composite/director-adjacent callers keep their historic model clamp;
    // generator video nodes use the canonical contract above.
    const modes = availableVideoModes(doc, node.id)
    if (modes.length === 0) {
      const first = videoModeOptions(doc, node.id)[0]
      throw new CompileError(`${model.label} ${first?.reason ?? '当前没有可用的生成模式'}`)
    }
    output = normalizeOutputForModel(modelId, output, modes)
  } else if (model.media === 'audio') {
    output = audioExecutionOutput(modelId, readAudioAuthoringState(node.data.extra, modelId))
  }

  const { credits, breakdown } = quoteCredits(modelId, output)

  const spec: ExecutionSpec = {
    workflowDigest: digest({ nodes: doc.nodes.map((n) => [n.id, n.type, n.data]), edges: doc.edges }),
    nodeId: node.id,
    nodeType: node.type,
    modelId,
    prompt: effectivePrompt,
    output,
    inputs,
  }

  const quote: Quote = {
    credits,
    priceVersion: PRICE_VERSION,
    // The confirm gate expires so a stale price cannot be settled later.
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    breakdown,
  }

  return { spec, quote }
}

/**
 * Freeze the editable document into an immutable spec for one node run.
 * Everything the provider needs must be inside the returned object — the
 * document is allowed to drift the moment the job is queued.
 */
export function compileNode(doc: WorkflowDocument, nodeId: string): { spec: ExecutionSpec; quote: Quote } {
  return compileNodeInternal(doc, nodeId, 'repair')
}

/** Strict video compilation that never silently repairs a selected mode. */
export function compileVideoNode(doc: WorkflowDocument, nodeId: string): { spec: ExecutionSpec; quote: Quote } {
  const node = doc.nodes.find((item) => item.id === nodeId)
  if (!node) throw new CompileError(`节点不存在: ${nodeId}`)
  if (node.type !== 'video') throw new CompileError('视频编译只支持视频节点')
  return compileNodeInternal(doc, nodeId, 'strict')
}

/** Nodes that can currently be run, used by 整组执行 and ⌘Enter. */
export function runnableNodes(doc: WorkflowDocument, nodeIds: string[]): string[] {
  return nodeIds.filter((id) => {
    try {
      compileNode(doc, id)
      return true
    } catch {
      return false
    }
  })
}
