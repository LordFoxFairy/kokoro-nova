import type { ScenarioId } from '@/contracts/scenario'
import type { PublishedSnapshot } from '@/domain/publish'
import type { LedgerEntry } from '@/domain/types'
import type { WorkspaceState } from '@/server/store'
import { isoAt } from '@/mocks/clock'
import { buildVideoWorkspace } from './video-project'

type SnapshotWorkspaceState = WorkspaceState & { publishedSnapshots?: PublishedSnapshot[] }

function emptyWorkspace(credits: number): WorkspaceState {
  const ledger: LedgerEntry[] =
    credits > 0
      ? [
          {
            id: 'led_empty_grant',
            spaceId: 'sp_default',
            type: 'grant',
            credits,
            balanceAfter: credits,
            logicalChargeId: 'grant:empty-fixture',
            jobId: null,
            note: '演示账户积分',
            createdAt: isoAt(-3_600),
          },
        ]
      : []

  return {
    spaces: [{ id: 'sp_default', name: '我的空间', createdAt: isoAt(-3_600) }],
    folders: [],
    projects: [],
    canvases: [],
    assets: [],
    jobs: [],
    ledger,
    sessions: [],
    messages: [],
    balances: { sp_default: credits },
  }
}

function withPublicSnapshot(state: WorkspaceState): WorkspaceState {
  const carrier = state as SnapshotWorkspaceState
  const source = state.canvases[0]
  carrier.publishedSnapshots = [
    {
      id: 'pub_city_night_01',
      projectId: 'prj_video_demo',
      canvasId: 'can_video_main',
      title: '雨夜霓虹城市',
      summary: '从故事梗概、首帧到视频成片的公开制作过程。',
      coverUrl: '/fixtures/libtv/media/city-night-poster.webp',
      publishedAt: isoAt(-30),
      state: 'listed',
      document: structuredClone(source.document),
    },
  ]
  return state
}

export function buildScenario(id: ScenarioId): WorkspaceState {
  switch (id) {
    case 'anonymous':
    case 'account-switch-required':
      return emptyWorkspace(0)
    case 'authenticated-empty':
      return emptyWorkspace(100)
    case 'authenticated-populated':
    case 'session-expired':
      return buildVideoWorkspace('succeeded')
    case 'video-awaiting-confirmation':
      return buildVideoWorkspace('awaiting_confirmation')
    case 'video-awaiting-valid-confirmation':
      return buildVideoWorkspace('awaiting_confirmation', 7, '2099-12-31T23:59:00.000Z')
    case 'video-queued':
      return buildVideoWorkspace('queued')
    case 'video-running':
      return buildVideoWorkspace('running')
    case 'video-succeeded':
      return buildVideoWorkspace('succeeded', 7, undefined, true)
    case 'video-failed':
      return buildVideoWorkspace('failed')
    case 'video-cancelled':
      return buildVideoWorkspace('cancelled')
    case 'video-compliance-blocked':
      return buildVideoWorkspace('compliance_blocked')
    case 'revision-conflict':
      return buildVideoWorkspace('succeeded', 8)
    case 'public-showcase':
      return withPublicSnapshot(buildVideoWorkspace('succeeded'))
  }
}

export function validateScenarioReferences(state: WorkspaceState): string[] {
  const errors: string[] = []
  const spaces = new Set(state.spaces.map((space) => space.id))
  const folders = new Set(state.folders.map((folder) => folder.id))
  const projects = new Map(state.projects.map((project) => [project.id, project]))
  const canvases = new Map(state.canvases.map((canvas) => [canvas.id, canvas]))
  const jobs = new Map(state.jobs.map((job) => [job.id, job]))
  const artifacts = new Map(state.jobs.flatMap((job) => job.artifacts).map((artifact) => [artifact.id, artifact]))
  const assets = new Set(state.assets.map((asset) => asset.id))
  const sessions = new Set(state.sessions.map((session) => session.id))

  for (const folder of state.folders) {
    if (!spaces.has(folder.spaceId)) errors.push(`folder:${folder.id}:missing-space:${folder.spaceId}`)
  }

  for (const project of state.projects) {
    if (!spaces.has(project.spaceId)) errors.push(`project:${project.id}:missing-space:${project.spaceId}`)
    if (project.folderId && !folders.has(project.folderId)) errors.push(`project:${project.id}:missing-folder:${project.folderId}`)
    for (const canvasId of project.canvasIds) {
      const canvas = canvases.get(canvasId)
      if (!canvas) errors.push(`project:${project.id}:missing-canvas:${canvasId}`)
      else if (canvas.projectId !== project.id) errors.push(`canvas:${canvas.id}:wrong-project:${canvas.projectId}`)
    }
  }

  for (const canvas of state.canvases) {
    if (!projects.has(canvas.projectId)) errors.push(`canvas:${canvas.id}:missing-project:${canvas.projectId}`)
    const nodes = new Map(canvas.document.nodes.map((node) => [node.id, node]))
    const groups = new Map(canvas.document.groups.map((group) => [group.id, group]))
    for (const edge of canvas.document.edges) {
      if (!nodes.has(edge.source)) errors.push(`edge:${edge.id}:missing-source:${edge.source}`)
      if (!nodes.has(edge.target)) errors.push(`edge:${edge.id}:missing-target:${edge.target}`)
    }
    for (const node of canvas.document.nodes) {
      if (node.groupId && !groups.has(node.groupId)) errors.push(`node:${node.id}:missing-group:${node.groupId}`)
      if (node.data.jobId && !jobs.has(node.data.jobId)) errors.push(`node:${node.id}:missing-job:${node.data.jobId}`)
      for (const artifact of node.data.artifacts ?? []) {
        if (!jobs.has(artifact.jobId)) errors.push(`node:${node.id}:artifact:${artifact.id}:missing-job:${artifact.jobId}`)
        if (artifact.assetId && !assets.has(artifact.assetId)) {
          errors.push(`node:${node.id}:artifact:${artifact.id}:missing-asset:${artifact.assetId}`)
        }
      }
    }
    for (const group of canvas.document.groups) {
      for (const nodeId of group.nodeIds) {
        const member = nodes.get(nodeId)
        if (!member) errors.push(`group:${group.id}:missing-node:${nodeId}`)
        else if (member.groupId !== group.id) errors.push(`group:${group.id}:node-not-linked-back:${nodeId}`)
      }
    }
  }

  for (const job of state.jobs) {
    const project = projects.get(job.projectId)
    const canvas = canvases.get(job.canvasId)
    if (!spaces.has(job.spaceId)) errors.push(`job:${job.id}:missing-space:${job.spaceId}`)
    if (!project) errors.push(`job:${job.id}:missing-project:${job.projectId}`)
    if (!canvas) errors.push(`job:${job.id}:missing-canvas:${job.canvasId}`)
    else if (!canvas.document.nodes.some((node) => node.id === job.nodeId)) {
      errors.push(`job:${job.id}:missing-node:${job.nodeId}`)
    }
    for (const artifact of job.artifacts) {
      if (artifact.jobId !== job.id) errors.push(`artifact:${artifact.id}:wrong-job:${artifact.jobId}`)
      if (artifact.assetId && !assets.has(artifact.assetId)) errors.push(`artifact:${artifact.id}:missing-asset:${artifact.assetId}`)
    }
  }

  for (const asset of state.assets) {
    if (!spaces.has(asset.spaceId)) errors.push(`asset:${asset.id}:missing-space:${asset.spaceId}`)
    if (asset.sourceArtifactId && !artifacts.has(asset.sourceArtifactId)) {
      errors.push(`asset:${asset.id}:missing-artifact:${asset.sourceArtifactId}`)
    }
  }

  for (const entry of state.ledger) {
    if (!spaces.has(entry.spaceId)) errors.push(`ledger:${entry.id}:missing-space:${entry.spaceId}`)
    if (entry.jobId && !jobs.has(entry.jobId)) errors.push(`ledger:${entry.id}:missing-job:${entry.jobId}`)
  }

  for (const session of state.sessions) {
    if (!spaces.has(session.spaceId)) errors.push(`session:${session.id}:missing-space:${session.spaceId}`)
    if (session.projectId && !projects.has(session.projectId)) errors.push(`session:${session.id}:missing-project:${session.projectId}`)
    if (session.canvasId && !canvases.has(session.canvasId)) errors.push(`session:${session.id}:missing-canvas:${session.canvasId}`)
  }
  for (const message of state.messages) {
    if (!sessions.has(message.sessionId)) errors.push(`message:${message.id}:missing-session:${message.sessionId}`)
  }

  for (const space of state.spaces) {
    const tail = state.ledger.filter((entry) => entry.spaceId === space.id).at(-1)
    if (state.balances[space.id] !== (tail?.balanceAfter ?? 0)) {
      errors.push(`balance:${space.id}:does-not-match-ledger-tail`)
    }
  }

  return errors
}
