import { z } from 'zod'

import { ContractDecodeError, decodeExternalEnvelope } from './http'
import { ProjectEntrySchema, normalizeProjectEntry, type ProjectListItem } from './project'

export const ProjectEffectivePermissionsSchema = z.object({
  canRead: z.boolean(),
  canEdit: z.boolean(),
  canManage: z.boolean(),
  canPublish: z.boolean(),
  canShare: z.boolean(),
  canCopy: z.boolean(),
})

const CanvasProjectMetaSchema = z.object({
  id: z.number().int(),
  uuid: z.string().min(1),
  name: z.string(),
  visibility: z.number().int(),
  ownerId: z.number().int(),
  createdAtMs: z.number().int(),
  updatedAtMs: z.number().int(),
  folderId: z.number().int(),
  accessConfig: z.object({
    accessPolicy: z.number().int(),
    publishable: z.number().int(),
    assetLocation: z.number().int(),
    allowCopy: z.boolean(),
    shareAgentConversation: z.boolean(),
  }),
  effective: ProjectEffectivePermissionsSchema,
  projectSpaceId: z.number().int(),
  projectType: z.number().int(),
  bizScene: z.number().int(),
})

const CanvasProjectDraftSchema = z.object({
  id: z.number().int(),
  uuid: z.string(),
  projectUuid: z.string().min(1),
  createdBy: z.number().int(),
  draftData: z.string(),
  viewportX: z.string(),
  viewportY: z.string(),
  viewportZoom: z.string(),
  lastEditedAtMs: z.number().int(),
})

const CanvasNodeRecordSchema = z.object({
  nodeKey: z.string().min(1),
  projectUuid: z.string().min(1),
  toolId: z.number().int(),
  toolKey: z.string(),
  type: z.number().int(),
  name: z.string(),
  position: z.object({ positionX: z.number(), positionY: z.number() }),
  measured: z.object({ width: z.number().nonnegative(), height: z.number().nonnegative() }),
  data: z.string(),
  parentKey: z.string(),
  status: z.number().int(),
  createdAtMs: z.number().int(),
  updatedAtMs: z.number().int(),
  workflowUuid: z.string(),
  workflowRoot: z.number().int(),
})

const CanvasConnectionRecordSchema = z.object({
  projectUuid: z.string().min(1),
  connectionId: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.string(),
  deletable: z.boolean(),
  selectable: z.boolean(),
  createdAtMs: z.number().int(),
  updatedAtMs: z.number().int(),
})

export const CanvasBootstrapSchema = z.object({
  config: z.object({
    accessPolicy: z.number().int(),
    allowCopy: z.boolean(),
    shareAgentConversation: z.boolean(),
  }),
  effective: ProjectEffectivePermissionsSchema,
  folder: ProjectEntrySchema,
  projectList: z.array(ProjectEntrySchema),
  total: z.number().int().nonnegative(),
  projectDetail: z.object({
    projectMeta: CanvasProjectMetaSchema,
    projectDraft: CanvasProjectDraftSchema,
    nodeList: z.array(CanvasNodeRecordSchema),
    connectionList: z.array(CanvasConnectionRecordSchema),
  }),
})

export type CanvasNodeKind = 'effect' | 'image' | 'video' | 'unknown'

export type CanvasBootstrapNode = {
  id: string
  name: string
  kind: CanvasNodeKind
  externalType: number
  position: { x: number; y: number }
  size: { width: number; height: number }
  data: Record<string, unknown>
  parentId: string | null
  status: number
  workflowId: string | null
  workflowRoot: boolean
  createdAt: string
  updatedAt: string
}

export type CanvasBootstrapConnection = {
  id: string
  source: string
  target: string
  type: string
  deletable: boolean
  selectable: boolean
  createdAt: string
  updatedAt: string
}

export type CanvasBootstrap = {
  project: {
    id: string
    name: string
    visibility: number
    folderId: number
    spaceId: number
    projectType: number
    businessScene: number
    createdAt: string
    updatedAt: string
  }
  permissions: {
    read: boolean
    edit: boolean
    manage: boolean
    publish: boolean
    share: boolean
    copy: boolean
  }
  config: {
    accessPolicy: number
    allowCopy: boolean
    shareAgentConversation: boolean
  }
  folder: ProjectListItem
  siblingProjects: ProjectListItem[]
  siblingTotal: number
  viewport: { x: number; y: number; zoom: number }
  nodes: CanvasBootstrapNode[]
  connections: CanvasBootstrapConnection[]
}

function nodeKind(externalType: number): CanvasNodeKind {
  if (externalType === 1) return 'effect'
  if (externalType === 2) return 'image'
  if (externalType === 3) return 'video'
  return 'unknown'
}

function isoFromMs(value: number): string {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) {
    throw new ContractDecodeError('INVALID_DATA', '时间戳不合法')
  }
  return date.toISOString()
}

function numberFromString(value: string, field: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new ContractDecodeError('INVALID_DATA', `${field} 不是有效数字`)
  }
  return parsed
}

function parseNodeData(value: string, nodeId: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw new ContractDecodeError('INVALID_DATA', `节点 ${nodeId} 的 data 不是有效 JSON`, error)
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ContractDecodeError('INVALID_DATA', `节点 ${nodeId} 的 data 必须是对象`)
  }

  return parsed as Record<string, unknown>
}

export function decodeCanvasBootstrap(input: unknown): CanvasBootstrap {
  const data = decodeExternalEnvelope(input, CanvasBootstrapSchema)
  const meta = data.projectDetail.projectMeta
  const draft = data.projectDetail.projectDraft
  const permissions = data.effective

  return {
    project: {
      id: meta.uuid,
      name: meta.name,
      visibility: meta.visibility,
      folderId: meta.folderId,
      spaceId: meta.projectSpaceId,
      projectType: meta.projectType,
      businessScene: meta.bizScene,
      createdAt: isoFromMs(meta.createdAtMs),
      updatedAt: isoFromMs(meta.updatedAtMs),
    },
    permissions: {
      read: permissions.canRead,
      edit: permissions.canEdit,
      manage: permissions.canManage,
      publish: permissions.canPublish,
      share: permissions.canShare,
      copy: permissions.canCopy,
    },
    config: data.config,
    folder: normalizeProjectEntry(data.folder),
    siblingProjects: data.projectList.map(normalizeProjectEntry),
    siblingTotal: data.total,
    viewport: {
      x: numberFromString(draft.viewportX, 'viewportX'),
      y: numberFromString(draft.viewportY, 'viewportY'),
      zoom: numberFromString(draft.viewportZoom, 'viewportZoom'),
    },
    nodes: data.projectDetail.nodeList.map((node) => ({
      id: node.nodeKey,
      name: node.name,
      kind: nodeKind(node.type),
      externalType: node.type,
      position: { x: node.position.positionX, y: node.position.positionY },
      size: node.measured,
      data: parseNodeData(node.data, node.nodeKey),
      parentId: node.parentKey || null,
      status: node.status,
      workflowId: node.workflowUuid || null,
      workflowRoot: node.workflowRoot === 1,
      createdAt: isoFromMs(node.createdAtMs),
      updatedAt: isoFromMs(node.updatedAtMs),
    })),
    connections: data.projectDetail.connectionList.map((connection) => ({
      id: connection.connectionId,
      source: connection.source,
      target: connection.target,
      type: connection.type,
      deletable: connection.deletable,
      selectable: connection.selectable,
      createdAt: isoFromMs(connection.createdAtMs),
      updatedAt: isoFromMs(connection.updatedAtMs),
    })),
  }
}
