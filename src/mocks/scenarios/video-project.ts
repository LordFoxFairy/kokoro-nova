import { emptyCompositeDocument, seedCompositeDocument, type CompositeSource } from '@/domain/composite'
import { WORKFLOW_SCHEMA_VERSION } from '@/domain/types'
import type {
  AgentMessage,
  AgentSession,
  Artifact,
  Asset,
  Canvas,
  GenerationJob,
  JobStatus,
  LedgerEntry,
  Project,
  Space,
  WorkflowEdge,
  WorkflowNode,
} from '@/domain/types'
import type { WorkspaceState } from '@/server/store'
import { isoAt } from '@/mocks/clock'

export type VideoScenarioStatus = Extract<
  JobStatus,
  'awaiting_confirmation' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'compliance_blocked'
>

const SPACE_ID = 'sp_default'
const PROJECT_ID = 'prj_video_demo'
const CANVAS_ID = 'can_video_main'
const DORO_PROJECT_ID = 'prj_doro_demo'
const DORO_CANVAS_ID = 'can_doro_main'
const UNTITLED_PROJECT_ID = 'prj_untitled_demo'
const UNTITLED_CANVAS_ID = 'can_untitled_main'
const VIDEO_NODE_ID = 'node_video_01'
const VIDEO_JOB_ID = 'job_video_01'
const IMAGE_JOB_ID = 'job_image_seed'
const IMAGE_ARTIFACT_ID = 'art_image_seed'

function imageArtifact(): Artifact {
  return {
    id: IMAGE_ARTIFACT_ID,
    jobId: IMAGE_JOB_ID,
    kind: 'image',
    url: '/fixtures/libtv/media/first-frame.webp',
    thumbnailUrl: '/fixtures/libtv/media/first-frame.webp',
    width: 1280,
    height: 720,
    durationSeconds: null,
    createdAt: isoAt(-1_200),
    modelId: 'lib-image-2',
    assetId: 'asset_image_seed',
  }
}

function videoArtifact(id = 'art_video_01'): Artifact {
  return {
    id,
    jobId: VIDEO_JOB_ID,
    kind: 'video',
    url: '/api/media/fixtures/city-night.mp4',
    thumbnailUrl: '/fixtures/libtv/media/city-night-poster.webp',
    width: 1280,
    height: 720,
    durationSeconds: 15,
    createdAt: isoAt(-60),
    modelId: 'seedance-2',
    assetId: null,
  }
}

function audioArtifact(): Artifact {
  return {
    id: 'art_audio_bed',
    jobId: VIDEO_JOB_ID,
    kind: 'audio',
    url: '/api/media/fixtures/compositor-bed.wav',
    thumbnailUrl: null,
    width: null,
    height: null,
    durationSeconds: 3,
    createdAt: isoAt(-60),
    modelId: 'seedance-2',
    assetId: null,
  }
}

function node(
  id: string,
  type: WorkflowNode['type'],
  name: string,
  position: WorkflowNode['position'],
  size: WorkflowNode['size'],
  data: WorkflowNode['data'],
  createdOffset: number,
): WorkflowNode {
  return {
    id,
    type,
    name,
    position,
    size,
    groupId: null,
    keyElement: false,
    createdAt: isoAt(createdOffset),
    updatedAt: isoAt(-45),
    data,
  }
}

function edge(id: string, source: string, target: string, createdOffset: number): WorkflowEdge {
  return { id, source, target, createdAt: isoAt(createdOffset) }
}

function lightweightProject(
  id: string,
  canvasId: string,
  name: string,
  coverUrl: string | null,
  createdOffset: number,
  updatedAt: string,
): { project: Project; canvas: Canvas } {
  const project: Project = {
    id,
    spaceId: SPACE_ID,
    folderId: null,
    name,
    coverUrl,
    createdAt: isoAt(createdOffset),
    updatedAt,
    canvasIds: [canvasId],
  }
  const canvas: Canvas = {
    id: canvasId,
    projectId: id,
    name: '画布 1',
    revision: 1,
    createdAt: isoAt(createdOffset + 30),
    updatedAt,
    document: {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      nodes: [],
      edges: [],
      groups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  }
  return { project, canvas }
}

function terminal(status: VideoScenarioStatus): boolean {
  return ['succeeded', 'failed', 'cancelled', 'compliance_blocked'].includes(status)
}

function videoError(status: VideoScenarioStatus): string | null {
  if (status === 'failed') return '生成服务暂时繁忙，请稍后重试'
  if (status === 'cancelled') return '任务已由用户取消'
  if (status === 'compliance_blocked') return '素材合规校验未通过'
  return null
}

function videoProgress(status: VideoScenarioStatus): number {
  if (status === 'awaiting_confirmation' || status === 'queued') return 0
  if (status === 'running') return 58
  if (status === 'succeeded') return 100
  return 58
}

function videoNode(status: VideoScenarioStatus, includeMixedArtifacts = false): WorkflowNode {
  const isTerminal = terminal(status)
  const artifacts = status === 'succeeded'
    ? [videoArtifact(), ...(includeMixedArtifacts ? [videoArtifact('art_video_02'), audioArtifact()] : [])]
    : []
  return node(
    VIDEO_NODE_ID,
    'video',
    '视频生成',
    { x: 980, y: 180 },
    { width: 400, height: 300 },
    {
      prompt: '镜头沿湿润街道缓慢推进，霓虹倒影自然流动。',
      modelId: 'seedance-2',
      output: {
        aspectRatio: '16:9',
        resolution: '720p',
        durationSeconds: 15,
        count: 1,
        withAudio: true,
        mode: 'omni-reference',
      },
      references: [],
      artifacts,
      jobId: isTerminal ? null : VIDEO_JOB_ID,
      extra: {
        modeType: 'image2video',
        advanced: { webSearch: true, autoCompliance: true, autoLink: true },
        cameraMove: 'cam-push',
        effect: null,
      },
    },
    -1_100,
  )
}

function imageJob(): GenerationJob {
  const artifact = imageArtifact()
  return {
    id: IMAGE_JOB_ID,
    spaceId: SPACE_ID,
    projectId: PROJECT_ID,
    canvasId: CANVAS_ID,
    nodeId: 'node_image_01',
    modelId: 'lib-image-2',
    status: 'succeeded',
    invocationId: 'inv_image_seed',
    attempt: 1,
    progress: 100,
    spec: {
      workflowDigest: 'fixture-image-digest-v1',
      nodeId: 'node_image_01',
      nodeType: 'image',
      modelId: 'lib-image-2',
      prompt: '雨夜城市街道，蓝紫色霓虹，电影感。',
      output: { aspectRatio: '16:9', resolution: '2K', quality: 'standard', count: 1 },
      inputs: [{ kind: 'text', value: '雨夜城市街道，蓝紫色霓虹，电影感。', fromNodeId: 'node_text_01' }],
    },
    quote: {
      credits: 22,
      priceVersion: 'fixture-2026-09-03',
      expiresAt: isoAt(-1_700),
      breakdown: [{ label: 'Lib Image 2K', credits: 22 }],
    },
    artifacts: [artifact],
    error: null,
    createdAt: isoAt(-1_800),
    startedAt: isoAt(-1_790),
    finishedAt: isoAt(-1_200),
  }
}

function videoJob(
  status: VideoScenarioStatus,
  quoteExpiresAt = isoAt(600),
  includeMixedArtifacts = false,
): GenerationJob {
  const artifacts = status === 'succeeded'
    ? [videoArtifact(), ...(includeMixedArtifacts ? [videoArtifact('art_video_02'), audioArtifact()] : [])]
    : []
  return {
    id: VIDEO_JOB_ID,
    spaceId: SPACE_ID,
    projectId: PROJECT_ID,
    canvasId: CANVAS_ID,
    nodeId: VIDEO_NODE_ID,
    modelId: 'seedance-2',
    status,
    invocationId: 'inv_video_01',
    attempt: status === 'awaiting_confirmation' ? 0 : 1,
    progress: videoProgress(status),
    spec: {
      workflowDigest: 'fixture-video-digest-v1',
      nodeId: VIDEO_NODE_ID,
      nodeType: 'video',
      modelId: 'seedance-2',
      prompt: '镜头沿湿润街道缓慢推进，霓虹倒影自然流动。',
      output: {
        aspectRatio: '16:9',
        resolution: '720p',
        durationSeconds: 15,
        count: 1,
        withAudio: true,
        mode: 'omni-reference',
      },
      inputs: [
        { kind: 'image', value: '/fixtures/libtv/media/first-frame.webp', fromNodeId: 'node_image_01' },
        { kind: 'text', value: '雨夜城市街道，蓝紫色霓虹，电影感。', fromNodeId: 'node_text_01' },
      ],
    },
    quote: {
      credits: 70,
      priceVersion: 'fixture-2026-09-03',
      expiresAt: quoteExpiresAt,
      breakdown: [
        { label: 'Seedance 2.0 基础', credits: 35 },
        { label: '10 秒', credits: 35 },
      ],
    },
    artifacts,
    error: videoError(status),
    createdAt: isoAt(-600),
    startedAt: status === 'awaiting_confirmation' ? null : isoAt(-540),
    finishedAt: terminal(status) ? isoAt(-60) : null,
  }
}

function ledger(status: VideoScenarioStatus): LedgerEntry[] {
  const entries: LedgerEntry[] = [
    {
      id: 'led_grant_seed',
      spaceId: SPACE_ID,
      type: 'grant',
      credits: 500,
      balanceAfter: 500,
      logicalChargeId: 'grant:fixture',
      jobId: null,
      note: '演示账户积分',
      createdAt: isoAt(-7_200),
    },
    {
      id: 'led_image_reserve',
      spaceId: SPACE_ID,
      type: 'reserve',
      credits: -22,
      balanceAfter: 478,
      logicalChargeId: `reserve:${IMAGE_JOB_ID}`,
      jobId: IMAGE_JOB_ID,
      note: '图片生成预留',
      createdAt: isoAt(-1_790),
    },
    {
      id: 'led_image_settle',
      spaceId: SPACE_ID,
      type: 'settle',
      credits: 0,
      balanceAfter: 478,
      logicalChargeId: `settle:${IMAGE_JOB_ID}`,
      jobId: IMAGE_JOB_ID,
      note: '图片生成结算',
      createdAt: isoAt(-1_200),
    },
  ]

  if (status === 'awaiting_confirmation') return entries

  entries.push({
    id: 'led_video_reserve',
    spaceId: SPACE_ID,
    type: 'reserve',
    credits: -70,
    balanceAfter: 408,
    logicalChargeId: `reserve:${VIDEO_JOB_ID}`,
    jobId: VIDEO_JOB_ID,
    note: '视频生成预留',
    createdAt: isoAt(-540),
  })

  if (status === 'succeeded') {
    entries.push({
      id: 'led_video_settle',
      spaceId: SPACE_ID,
      type: 'settle',
      credits: 0,
      balanceAfter: 408,
      logicalChargeId: `settle:${VIDEO_JOB_ID}`,
      jobId: VIDEO_JOB_ID,
      note: '视频生成结算',
      createdAt: isoAt(-60),
    })
  } else if (terminal(status)) {
    entries.push({
      id: 'led_video_release',
      spaceId: SPACE_ID,
      type: 'release',
      credits: 70,
      balanceAfter: 478,
      logicalChargeId: `release:${VIDEO_JOB_ID}`,
      jobId: VIDEO_JOB_ID,
      note: '视频任务未成功，返还预留积分',
      createdAt: isoAt(-60),
    })
  }

  return entries
}

export function buildVideoWorkspace(
  status: VideoScenarioStatus,
  revision = 7,
  quoteExpiresAt?: string,
  includeSeededComposite = false,
): WorkspaceState {
  const space: Space = { id: SPACE_ID, name: '我的空间', createdAt: isoAt(-7_200) }
  const project: Project = {
    id: PROJECT_ID,
    spaceId: SPACE_ID,
    folderId: null,
    name: 'Seedance2.0体验',
    coverUrl: '/fixtures/libtv/showcase/childhood-memoir.webp',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:30:00.000Z',
    canvasIds: [CANVAS_ID],
  }

  const image = imageArtifact()
  const generatedVideo = videoNode(status, includeSeededComposite)
  const compositeSources: CompositeSource[] = (generatedVideo.data.artifacts ?? []).map((artifact) => ({
    artifact,
    nodeId: generatedVideo.id,
    nodeName: generatedVideo.name,
    ...(artifact.kind === 'video' ? { nodeType: 'video' as const } : {}),
  }))
  const seededComposite = includeSeededComposite
    ? seedCompositeDocument(compositeSources)
    : emptyCompositeDocument()
  const nodes: WorkflowNode[] = [
    node(
      'node_text_01',
      'text',
      '故事梗概',
      { x: 80, y: 180 },
      { width: 360, height: 300 },
      {
        prompt: '雨夜城市街道，蓝紫色霓虹，电影感。',
        modelId: 'gvlm-3.1',
        references: [],
        artifacts: [],
        jobId: null,
        extra: { intent: 'story' },
      },
      -1_400,
    ),
    node(
      'node_image_01',
      'image',
      '首帧图片',
      { x: 520, y: 180 },
      { width: 400, height: 320 },
      {
        prompt: '雨夜城市街道，蓝紫色霓虹，电影感。',
        modelId: 'lib-image-2',
        output: { aspectRatio: '16:9', resolution: '2K', quality: 'standard', count: 1 },
        references: [],
        artifacts: [image],
        jobId: null,
        extra: {},
      },
      -1_300,
    ),
    generatedVideo,
    node(
      'node_composite_01',
      'videoComposite',
      '视频合成',
      { x: 1_460, y: 180 },
      { width: 420, height: 260 },
      {
        prompt: '',
        modelId: 'seedance-2',
        output: { aspectRatio: '16:9', resolution: '1080p' },
        references: [],
        artifacts: [],
        jobId: null,
        extra: {
          composite: {
            ...seededComposite,
          },
        },
      },
      -1_000,
    ),
  ]

  const edges: WorkflowEdge[] = [
    edge('edge_text_image', 'node_text_01', 'node_image_01', -1_280),
    edge('edge_image_video', 'node_image_01', VIDEO_NODE_ID, -1_080),
    edge('edge_video_composite', VIDEO_NODE_ID, 'node_composite_01', -980),
  ]

  const canvas: Canvas = {
    id: CANVAS_ID,
    projectId: PROJECT_ID,
    name: '画布 1',
    revision,
    createdAt: '2026-07-14T08:05:00.000Z',
    updatedAt: '2026-07-14T08:30:00.000Z',
    document: {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      nodes,
      edges,
      groups: [],
      viewport: { x: 120, y: 64, zoom: 0.5 },
    },
  }

  const doro = lightweightProject(
    DORO_PROJECT_ID,
    DORO_CANVAS_ID,
    '咕嘎Doro',
    '/fixtures/libtv/showcase/cloud-palace.webp',
    -6_700,
    '2026-07-16T09:15:00.000Z',
  )
  const untitled = lightweightProject(
    UNTITLED_PROJECT_ID,
    UNTITLED_CANVAS_ID,
    '未命名',
    null,
    -6_500,
    '2026-07-31T10:20:00.000Z',
  )

  const asset: Asset = {
    id: 'asset_image_seed',
    spaceId: SPACE_ID,
    namespace: 'personal',
    kind: 'image',
    name: '雨夜城市首帧',
    url: image.url,
    thumbnailUrl: image.thumbnailUrl,
    width: image.width,
    height: image.height,
    durationSeconds: null,
    byteSize: 182_400,
    tags: ['场景'],
    folderId: null,
    state: 'committed',
    createdAt: image.createdAt,
    sourceArtifactId: image.id,
  }

  const session: AgentSession = {
    id: 'ses_video_demo',
    spaceId: SPACE_ID,
    projectId: PROJECT_ID,
    canvasId: CANVAS_ID,
    title: 'Seedance2.0体验',
    seq: 2,
    createdAt: isoAt(-900),
    updatedAt: isoAt(-300),
    shared: false,
    settings: { generationMode: 'manual', modelId: 'gvlm-3.1', freeTurns: 3 },
  }
  const messages: AgentMessage[] = [
    {
      id: 'msg_video_user_01',
      sessionId: session.id,
      seq: 1,
      role: 'user',
      content: '把首帧扩展为一条十秒的城市夜景镜头。',
      createdAt: isoAt(-880),
      context: [{ id: 'ctx_image_01', kind: 'node', refId: 'node_image_01', label: '首帧图片' }],
    },
    {
      id: 'msg_video_assistant_01',
      sessionId: session.id,
      seq: 2,
      role: 'assistant',
      content: '已准备视频参数，等待生成状态更新。',
      createdAt: isoAt(-860),
    },
  ]

  const entries = ledger(status)
  return {
    spaces: [space],
    folders: [],
    projects: [untitled.project, doro.project, project],
    canvases: [canvas, doro.canvas, untitled.canvas],
    assets: [asset],
    jobs: [videoJob(status, quoteExpiresAt, includeSeededComposite), imageJob()],
    ledger: entries,
    sessions: [session],
    messages,
    balances: { [SPACE_ID]: entries.at(-1)?.balanceAfter ?? 0 },
  }
}
