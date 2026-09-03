import { createEdge, createNode } from './factory'
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_COUNTS,
  IMAGE_QUALITIES,
  IMAGE_RESOLUTIONS,
  type ImageAspectRatio,
  type ImageQuality,
  type ImageResolution,
  type ModelCount,
} from './models'
import type { CanvasMutation, WorkflowDocument, WorkflowNode } from './types'

export type ImageTransformParameter = string | number | boolean | null

export interface ImageTransformOutput {
  quality: ImageQuality
  resolution: ImageResolution
  aspectRatio: ImageAspectRatio
  count: ModelCount
}

export interface ImageTransformRequest {
  tool: string
  label: string
  prompt: string
  output: ImageTransformOutput
  credits: number
  parameters?: Record<string, ImageTransformParameter>
}

export interface ImageTransformSpec {
  version: 1
  sourceNodeId: string
  tool: string
  label: string
  parameters: Record<string, ImageTransformParameter>
  output: ImageTransformOutput
  credits: number
}

export interface ImageDerivedMutationResult {
  node: WorkflowNode
  mutations: CanvasMutation[]
}

/**
 * Creates a non-destructive image-tool result. The edge is the dependency
 * truth; `imageTransform` keeps enough local state to inspect or replay it.
 */
export function createImageDerivedMutations(
  document: WorkflowDocument,
  sourceNodeId: string,
  request: ImageTransformRequest,
): ImageDerivedMutationResult {
  const source = document.nodes.find((node) => node.id === sourceNodeId)
  if (!source) throw new Error(`节点不存在: ${sourceNodeId}`)
  if (source.type !== 'image' && source.type !== 'director') {
    throw new Error('图片工具需要图片来源节点')
  }

  const node = createNode(
    'image',
    { x: source.position.x + source.size.width + 120, y: source.position.y },
    document.nodes,
    { name: request.label },
  )
  node.data.prompt = request.prompt
  node.data.output = { ...request.output }
  node.data.extra = {
    ...node.data.extra,
    imageTransform: {
      version: 1,
      sourceNodeId,
      tool: request.tool,
      label: request.label,
      parameters: { ...(request.parameters ?? {}) },
      output: { ...request.output },
      credits: request.credits,
    } satisfies ImageTransformSpec,
  }

  return {
    node,
    mutations: [
      { op: 'addNode', node },
      { op: 'addEdge', edge: createEdge(source.id, node.id) },
    ],
  }
}

/** Strict reader for potentially stale/imported `NodeData.extra`. */
export function readImageTransformSpec(extra: Record<string, unknown> | undefined): ImageTransformSpec | null {
  const value = extra?.imageTransform
  if (!value || typeof value !== 'object') return null
  const spec = value as Partial<ImageTransformSpec>
  if (
    spec.version !== 1 ||
    typeof spec.sourceNodeId !== 'string' ||
    typeof spec.tool !== 'string' ||
    typeof spec.label !== 'string' ||
    typeof spec.credits !== 'number' ||
    !Number.isFinite(spec.credits) ||
    spec.credits < 0 ||
    !spec.parameters ||
    typeof spec.parameters !== 'object' ||
    Array.isArray(spec.parameters) ||
    !spec.output ||
    typeof spec.output !== 'object' ||
    Array.isArray(spec.output)
  ) {
    return null
  }
  if (!Object.values(spec.parameters).every((item) =>
    item === null || ['string', 'number', 'boolean'].includes(typeof item),
  )) return null

  const output = spec.output as Partial<ImageTransformOutput>
  if (
    !IMAGE_QUALITIES.includes(output.quality as ImageQuality) ||
    !IMAGE_RESOLUTIONS.includes(output.resolution as ImageResolution) ||
    !IMAGE_ASPECT_RATIOS.includes(output.aspectRatio as ImageAspectRatio) ||
    !IMAGE_COUNTS.includes(output.count as ModelCount)
  ) return null
  return spec as ImageTransformSpec
}
