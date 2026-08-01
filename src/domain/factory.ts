import { ids } from './ids'
import { DEFAULT_MODEL } from './models'
import { NODE_META, type NodeType } from './nodes'
import {
  WORKFLOW_SCHEMA_VERSION,
  type Canvas,
  type NodeData,
  type WorkflowDocument,
  type WorkflowEdge,
  type WorkflowGroup,
  type WorkflowNode,
} from './types'

export const NODE_SIZE: Record<NodeType, { width: number; height: number }> = {
  text: { width: 360, height: 300 },
  image: { width: 400, height: 320 },
  video: { width: 400, height: 300 },
  videoComposite: { width: 420, height: 260 },
  director: { width: 400, height: 300 },
  audio: { width: 380, height: 260 },
  script: { width: 440, height: 320 },
  scriptLegacy: { width: 420, height: 300 },
  style: { width: 240, height: 260 },
  effect: { width: 240, height: 260 },
  assetLibrary: { width: 280, height: 260 },
}

function defaultData(type: NodeType): NodeData {
  switch (type) {
    case 'image':
    case 'director':
      return {
        prompt: '',
        modelId: DEFAULT_MODEL.image,
        output: { aspectRatio: '16:9', quality: 'standard', resolution: '2K', count: 1 },
        references: [],
        artifacts: [],
        jobId: null,
        // A director node starts with no scene at all; the studio builds its
        // own default on first open and writes the real shape back on save.
        extra: {},
      }
    case 'video':
      return {
        prompt: '',
        modelId: DEFAULT_MODEL.video,
        output: {
          aspectRatio: '16:9',
          resolution: '720p',
          durationSeconds: 5,
          count: 1,
          withAudio: false,
          mode: 'text2video',
        },
        references: [],
        artifacts: [],
        jobId: null,
        extra: { advanced: { webSearch: false, autoCompliance: true }, cameraMove: null, effect: null },
      }
    case 'videoComposite':
      return {
        prompt: '',
        modelId: DEFAULT_MODEL.video,
        output: { aspectRatio: '16:9', resolution: '1080p' },
        references: [],
        artifacts: [],
        jobId: null,
        extra: { timeline: [], transitions: [], subtitles: [] },
      }
    case 'audio':
      return {
        prompt: '',
        modelId: DEFAULT_MODEL.audio,
        output: { voiceId: 'voice-cn-female-warm', speed: 1, pitch: 0, volume: 1, emotion: '自然' },
        references: [],
        artifacts: [],
        jobId: null,
        extra: {},
      }
    case 'script':
      return {
        prompt: '',
        modelId: DEFAULT_MODEL.text,
        references: [],
        artifacts: [],
        jobId: null,
        extra: { phase: 'entry', entry: null, shots: [], assets: { characters: [], scenes: [], props: [] } },
      }
    case 'scriptLegacy':
      return {
        prompt: '',
        modelId: DEFAULT_MODEL.text,
        references: [],
        artifacts: [],
        jobId: null,
        extra: { entry: null },
      }
    case 'text':
      return {
        prompt: '',
        modelId: DEFAULT_MODEL.text,
        references: [],
        artifacts: [],
        jobId: null,
        extra: { intent: null },
      }
    case 'style':
    case 'effect':
      return { references: [], artifacts: [], extra: { presetId: null, presetName: null, previewUrl: null } }
    case 'assetLibrary':
      return { references: [], artifacts: [], extra: { assetId: null } }
  }
}

/** Node display names follow "<类型>节点 N" as observed in the元素 sidebar. */
export function nextNodeName(type: NodeType, existing: WorkflowNode[]): string {
  const base = `${NODE_META[type].label}节点`
  let n = 1
  const taken = new Set(existing.map((x) => x.name))
  while (taken.has(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

export function createNode(
  type: NodeType,
  position: { x: number; y: number },
  existing: WorkflowNode[] = [],
  overrides: Partial<WorkflowNode> = {},
): WorkflowNode {
  const now = new Date().toISOString()
  return {
    id: ids.node(),
    type,
    name: nextNodeName(type, existing),
    position,
    size: NODE_SIZE[type],
    groupId: null,
    keyElement: false,
    createdAt: now,
    updatedAt: now,
    data: defaultData(type),
    ...overrides,
  }
}

export function createEdge(source: string, target: string): WorkflowEdge {
  return { id: ids.edge(), source, target, createdAt: new Date().toISOString() }
}

export function createGroup(
  kind: WorkflowGroup['kind'],
  nodeIds: string[],
  name?: string,
): WorkflowGroup {
  return {
    id: ids.group(),
    kind,
    name: name ?? (kind === 'storyboard' ? `分镜组 ${nodeIds.length} 个节点` : `分组 ${nodeIds.length} 个节点`),
    nodeIds,
    createdAt: new Date().toISOString(),
    storyboard:
      kind === 'storyboard'
        ? { aspectRatio: '16:9', grid: { rows: 2, cols: 2 }, showSequenceNumbers: false }
        : undefined,
  }
}

export function emptyDocument(): WorkflowDocument {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    nodes: [],
    edges: [],
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

export function createCanvas(projectId: string, name: string): Canvas {
  const now = new Date().toISOString()
  return {
    id: ids.canvas(),
    projectId,
    name,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    document: emptyDocument(),
  }
}
