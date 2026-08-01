import { canConnect } from './nodes'
import type { CanvasMutation, WorkflowDocument, WorkflowNode } from './types'

export class MutationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MutationError'
  }
}

function clone(doc: WorkflowDocument): WorkflowDocument {
  return JSON.parse(JSON.stringify(doc)) as WorkflowDocument
}

function nodeById(doc: WorkflowDocument, id: string): WorkflowNode {
  const node = doc.nodes.find((n) => n.id === id)
  if (!node) throw new MutationError(`节点不存在: ${id}`)
  return node
}

/**
 * Detects whether adding `source -> target` would close a cycle. The workflow
 * document must stay a DAG so the compiler can topologically resolve inputs.
 */
export function wouldCreateCycle(doc: WorkflowDocument, source: string, target: string): boolean {
  if (source === target) return true
  const adjacency = new Map<string, string[]>()
  for (const e of doc.edges) {
    const list = adjacency.get(e.source) ?? []
    list.push(e.target)
    adjacency.set(e.source, list)
  }
  const stack = [target]
  const seen = new Set<string>()
  while (stack.length) {
    const current = stack.pop() as string
    if (current === source) return true
    if (seen.has(current)) continue
    seen.add(current)
    stack.push(...(adjacency.get(current) ?? []))
  }
  return false
}

/**
 * The single authoritative reducer. Every write path — UI, agent proposal,
 * CLI-compat adapter — goes through here so validation cannot be bypassed.
 */
export function applyMutations(input: WorkflowDocument, mutations: CanvasMutation[]): WorkflowDocument {
  const doc = clone(input)

  for (const m of mutations) {
    switch (m.op) {
      case 'addNode': {
        if (doc.nodes.some((n) => n.id === m.node.id)) {
          throw new MutationError(`节点已存在: ${m.node.id}`)
        }
        doc.nodes.push(m.node)
        break
      }
      case 'updateNode': {
        const node = nodeById(doc, m.nodeId)
        Object.assign(node, m.patch, { id: node.id, updatedAt: new Date().toISOString() })
        break
      }
      case 'removeNode': {
        const index = doc.nodes.findIndex((n) => n.id === m.nodeId)
        if (index === -1) break
        doc.nodes.splice(index, 1)
        // Dependent edges disappear with the node.
        doc.edges = doc.edges.filter((e) => e.source !== m.nodeId && e.target !== m.nodeId)
        for (const g of doc.groups) {
          g.nodeIds = g.nodeIds.filter((id) => id !== m.nodeId)
        }
        // A group that lost all members is removed too.
        doc.groups = doc.groups.filter((g) => g.nodeIds.length > 0)
        break
      }
      case 'addEdge': {
        const { source, target } = m.edge
        if (source === target) throw new MutationError('不能连接节点到自身')
        const sourceNode = nodeById(doc, source)
        const targetNode = nodeById(doc, target)
        // Duplicate endpoint pairs are suppressed rather than erroring — this
        // matches the observed behaviour of re-dragging an existing link.
        if (doc.edges.some((e) => e.source === source && e.target === target)) break
        const check = canConnect(
          sourceNode.type,
          targetNode.type,
          (sourceNode.data.extra?.assetKind as 'image' | 'video' | 'audio' | undefined) ?? null,
        )
        if (!check.ok) throw new MutationError(check.reason)
        if (wouldCreateCycle(doc, source, target)) {
          throw new MutationError('该连线会形成循环依赖')
        }
        doc.edges.push(m.edge)
        break
      }
      case 'removeEdge': {
        doc.edges = doc.edges.filter((e) => e.id !== m.edgeId)
        break
      }
      case 'addGroup': {
        const memberIds = new Set(m.group.nodeIds)
        for (const id of memberIds) nodeById(doc, id)
        // A node belongs to at most one group; joining a new group leaves the old.
        for (const g of doc.groups) {
          g.nodeIds = g.nodeIds.filter((id) => !memberIds.has(id))
        }
        doc.groups = doc.groups.filter((g) => g.nodeIds.length > 0)
        doc.groups.push(m.group)
        for (const id of memberIds) {
          nodeById(doc, id).groupId = m.group.id
        }
        break
      }
      case 'updateGroup': {
        const group = doc.groups.find((g) => g.id === m.groupId)
        if (!group) throw new MutationError(`分组不存在: ${m.groupId}`)
        Object.assign(group, m.patch, { id: group.id })
        break
      }
      case 'removeGroup': {
        const group = doc.groups.find((g) => g.id === m.groupId)
        if (!group) break
        doc.groups = doc.groups.filter((g) => g.id !== m.groupId)
        if (m.deleteNodes) {
          const doomed = new Set(group.nodeIds)
          doc.nodes = doc.nodes.filter((n) => !doomed.has(n.id))
          doc.edges = doc.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target))
        } else {
          for (const id of group.nodeIds) {
            const node = doc.nodes.find((n) => n.id === id)
            if (node) node.groupId = null
          }
        }
        break
      }
      case 'setViewport': {
        doc.viewport = m.viewport
        break
      }
    }
  }

  return doc
}

/**
 * 转分镜组 eligibility.
 *
 * Observed rule: the action stays disabled for empty/mixed groups and for
 * toolbox preset groups whose members have no image artifact, but becomes
 * enabled once the group holds generated images. So the qualifier is
 * "the group owns usable image output", not node type or edge count.
 */
export function canConvertToStoryboardGroup(
  doc: WorkflowDocument,
  groupId: string,
): { ok: true } | { ok: false; reason: string } {
  const group = doc.groups.find((g) => g.id === groupId)
  if (!group) return { ok: false, reason: '分组不存在' }
  if (group.kind === 'storyboard') return { ok: false, reason: '已经是分镜组' }
  const members = doc.nodes.filter((n) => group.nodeIds.includes(n.id))
  if (members.length < 2) return { ok: false, reason: '至少需要两个节点' }
  const withImages = members.filter((n) => (n.data.artifacts ?? []).some((a) => a.kind === 'image'))
  if (withImages.length < 2) {
    return { ok: false, reason: '组内需要至少两个已生成的图片产物' }
  }
  return { ok: true }
}
