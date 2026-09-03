import {
  MODELS_BY_ID,
  modelOutputOptions,
  normalizeOutputForModel,
  quoteCredits,
  PRICE_VERSION,
  type VideoGenerationMode,
  type VideoReferenceRequirement,
} from './models'
import { MEDIA_OF_NODE } from './nodes'
import type { ExecutionInput, ExecutionSpec, Quote, WorkflowDocument, WorkflowNode } from './types'

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

function countInputs(inputs: ExecutionInput[]) {
  return {
    images: inputs.filter((input) => input.kind === 'image').length,
    videos: inputs.filter((input) => input.kind === 'video').length,
    audios: inputs.filter((input) => input.kind === 'audio').length,
    anyMedia: inputs.filter((input) => input.kind !== 'text').length,
  }
}

function constraintMet(actual: number, constraint: { min: number; max?: number } | undefined): boolean {
  if (!constraint) return true
  return actual >= constraint.min && (constraint.max === undefined || actual <= constraint.max)
}

function requirementMet(counts: ReturnType<typeof countInputs>, requirement: VideoReferenceRequirement): boolean {
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

/**
 * The mode list is the intersection of model capabilities and material inputs.
 * The richer `videoModeOptions` powers disabled menu rows; this compact helper
 * is retained for compile-time validation and callers that only need runnable
 * choices.
 */
export function videoModeOptions(doc: WorkflowDocument, nodeId: string): VideoModeOption[] {
  const node = doc.nodes.find((item) => item.id === nodeId)
  const capabilities = node?.data.modelId ? modelOutputOptions(node.data.modelId) : null
  if (!node || !capabilities) return []

  const counts = countInputs(resolveInputs(doc, node))
  return capabilities.modes.map((mode) => {
    const requirement = capabilities.referenceRequirements[mode] ?? {}
    const available = requirementMet(counts, requirement)
    return { mode, available, reason: available ? null : requirementReason(requirement) }
  })
}

export function availableVideoModes(doc: WorkflowDocument, nodeId: string): VideoGenerationMode[] {
  return videoModeOptions(doc, nodeId)
    .filter((option) => option.available)
    .map((option) => option.mode)
}

function resolveInputs(doc: WorkflowDocument, node: WorkflowNode): ExecutionInput[] {
  const inputs: ExecutionInput[] = []

  for (const source of upstreamNodes(doc, node.id)) {
    const media = MEDIA_OF_NODE[source.type]
    if (media === 'text') {
      const text = (source.data.prompt ?? '').trim()
      if (text) inputs.push({ kind: 'text', value: text, fromNodeId: source.id })
      continue
    }
    if (media === 'style' || media === 'effect') {
      const presetId = (source.data.extra?.presetId as string | undefined) ?? null
      if (presetId) inputs.push({ kind: media, value: presetId, fromNodeId: source.id })
      continue
    }
    const artifact = (source.data.artifacts ?? [])[0]
    if (artifact && (media === 'image' || media === 'video' || media === 'audio')) {
      inputs.push({ kind: media, value: artifact.url, fromNodeId: source.id })
    }
  }

  // Drag-dropped references are inputs too, and they are not represented by edges.
  for (const ref of node.data.references ?? []) {
    if (ref.origin === 'node') continue // already covered by the edge walk
    inputs.push({ kind: ref.kind, value: ref.refId, fromNodeId: null })
  }

  return inputs
}

/**
 * Freeze the editable document into an immutable spec for one node run.
 * Everything the provider needs must be inside the returned object — the
 * document is allowed to drift the moment the job is queued.
 */
export function compileNode(doc: WorkflowDocument, nodeId: string): { spec: ExecutionSpec; quote: Quote } {
  const node = doc.nodes.find((n) => n.id === nodeId)
  if (!node) throw new CompileError(`节点不存在: ${nodeId}`)

  const modelId = node.data.modelId
  if (!modelId) throw new CompileError(`${node.name} 未选择模型`)
  const model = MODELS_BY_ID.get(modelId)
  if (!model) throw new CompileError(`未知模型: ${modelId}`)

  const inputs = resolveInputs(doc, node)
  const prompt = (node.data.prompt ?? '').trim()
  const inheritedText = inputs
    .filter((i) => i.kind === 'text')
    .map((i) => i.value)
    .join('\n')
  const effectivePrompt = [prompt, inheritedText].filter(Boolean).join('\n')

  const needsPrompt = node.type !== 'videoComposite' && node.type !== 'director'
  const hasMediaInput = inputs.some((i) => i.kind === 'image' || i.kind === 'video' || i.kind === 'audio')
  if (needsPrompt && !effectivePrompt && !hasMediaInput) {
    throw new CompileError(`${node.name} 需要提示词或已连接的素材输入`)
  }

  let output = { ...(node.data.output ?? {}) }
  if (model.media === 'video') {
    const modes = availableVideoModes(doc, node.id)
    if (modes.length === 0) {
      const first = videoModeOptions(doc, node.id)[0]
      throw new CompileError(`${model.label} ${first?.reason ?? '当前没有可用的生成模式'}`)
    }
    output = normalizeOutputForModel(modelId, output, modes)
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
