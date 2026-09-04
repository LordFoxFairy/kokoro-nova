import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, api } from '@/lib/api'
import { applyMutations } from '@/domain/mutations'
import { buildVideoWorkspace } from '@/mocks/scenarios/video-project'
import type { CanvasMutation, WorkflowDocument } from '@/domain/types'
import { useEditor } from '../editor-store'

type MutationRequest = {
  expectedRevision: number
  mutations: CanvasMutation[]
}

type FixtureServer = {
  document: WorkflowDocument
  revision: number
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function initialDocument() {
  return clone(buildVideoWorkspace('succeeded', 7).canvases[0].document)
}

function setClient(document: WorkflowDocument, revision = 7) {
  useEditor.setState({
    canvasId: 'can_video_main',
    document: clone(document),
    revision,
    undoStack: [],
    redoStack: [],
    conflictRecovery: null,
    toasts: [],
  })
}

function installServer(server: FixtureServer, beforePost?: (request: MutationRequest, postCount: number) => void) {
  let postCount = 0
  const post = vi.spyOn(api, 'post').mockImplementation(async (_url, body) => {
    const request = body as MutationRequest
    postCount += 1
    beforePost?.(request, postCount)
    if (request.expectedRevision !== server.revision) {
      throw new ApiError(409, `画布版本冲突：期望 ${request.expectedRevision}，当前 ${server.revision}`)
    }
    server.document = applyMutations(server.document, request.mutations)
    server.revision += 1
    return { revision: server.revision, document: clone(server.document) }
  })
  const get = vi.spyOn(api, 'get').mockImplementation(async () => ({
    canvas: { id: 'can_video_main', document: clone(server.document), revision: server.revision },
    jobs: [],
    balance: 100,
  }))
  return { post, get }
}

function expectGraphIntegrity(document: WorkflowDocument) {
  const nodeIds = new Set(document.nodes.map((node) => node.id))
  expect(nodeIds.size).toBe(document.nodes.length)
  expect(new Set(document.edges.map((edge) => edge.id)).size).toBe(document.edges.length)
  for (const edge of document.edges) {
    expect(nodeIds.has(edge.source)).toBe(true)
    expect(nodeIds.has(edge.target)).toBe(true)
  }
}

describe('editor-store revision-conflict recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setClient(initialDocument())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reloads and replays one stale two-client mutation while preserving graph integrity and undo/redo history', async () => {
    const base = initialDocument()
    const server: FixtureServer = { document: clone(base), revision: 7 }
    const { post, get } = installServer(server)

    // Client A wins first and changes a different node while client B is stale.
    server.document = applyMutations(server.document, [
      { op: 'updateNode', nodeId: 'node_text_01', patch: { name: '远端梗概' } },
    ])
    server.revision = 8

    await expect(
      useEditor.getState().commit(
        [{ op: 'updateNode', nodeId: 'node_image_01', patch: { name: '本地首帧' } }],
        '重命名首帧',
      ),
    ).resolves.toBe(true)

    expect(get).toHaveBeenCalledTimes(1)
    expect(post.mock.calls.map(([, body]) => (body as MutationRequest).expectedRevision)).toEqual([7, 8])
    expectGraphIntegrity(server.document)
    expect(server.document.nodes.find((node) => node.id === 'node_text_01')?.name).toBe('远端梗概')
    expect(server.document.nodes.find((node) => node.id === 'node_image_01')?.name).toBe('本地首帧')
    expect(useEditor.getState().undoStack).toHaveLength(1)
    expect(useEditor.getState().redoStack).toHaveLength(0)

    await useEditor.getState().undo()
    expect(useEditor.getState().undoStack).toHaveLength(0)
    expect(useEditor.getState().redoStack).toHaveLength(1)
    expectGraphIntegrity(server.document)
    expect(server.document.nodes.find((node) => node.id === 'node_text_01')?.name).toBe('远端梗概')
    expect(server.document.nodes.find((node) => node.id === 'node_image_01')?.name).toBe('首帧图片')

    await useEditor.getState().redo()
    expect(useEditor.getState().undoStack).toHaveLength(1)
    expect(useEditor.getState().redoStack).toHaveLength(0)
    expectGraphIntegrity(server.document)
    expect(server.document.nodes.find((node) => node.id === 'node_image_01')?.name).toBe('本地首帧')
  })

  it('retains the replayed local document and reports an accessible recovery message when a second conflict wins', async () => {
    const base = initialDocument()
    const server: FixtureServer = { document: clone(base), revision: 7 }
    installServer(server, (request, postCount) => {
      if (postCount === 1) {
        // Client A advances the revision before client B's first POST.
        server.document = applyMutations(server.document, [
          { op: 'updateNode', nodeId: 'node_text_01', patch: { name: '远端第一次' } },
        ])
        server.revision += 1
      }
      if (postCount === 2) {
        // Client A wins again after client B has reloaded but before its one replay.
        server.document = applyMutations(server.document, [
          { op: 'updateNode', nodeId: 'node_video_01', patch: { name: '远端第二次' } },
        ])
        server.revision += 1
      }
      void request
    })

    await expect(
      useEditor.getState().commit(
        [{ op: 'updateNode', nodeId: 'node_image_01', patch: { name: '需要恢复的本地首帧' } }],
        '重命名首帧',
      ),
    ).resolves.toBe(false)

    const state = useEditor.getState()
    expect(state.conflictRecovery?.label).toBe('重命名首帧')
    expect(state.conflictRecovery?.document.nodes.find((node) => node.id === 'node_image_01')?.name).toBe(
      '需要恢复的本地首帧',
    )
    expect(state.toasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tone: 'error', message: expect.stringContaining('已保留本次操作') }),
      ]),
    )
    expectGraphIntegrity(state.conflictRecovery?.document ?? state.document)
    expect(state.document.nodes.find((node) => node.id === 'node_text_01')?.name).toBe('远端第一次')
    expect(state.document.nodes.find((node) => node.id === 'node_video_01')?.name).toBe('远端第二次')

    await expect(useEditor.getState().retryConflictRecovery()).resolves.toBe(true)
    const recovered = useEditor.getState()
    expect(recovered.conflictRecovery).toBeNull()
    expectGraphIntegrity(recovered.document)
    expect(recovered.document.nodes.find((node) => node.id === 'node_text_01')?.name).toBe('远端第一次')
    expect(recovered.document.nodes.find((node) => node.id === 'node_video_01')?.name).toBe('远端第二次')
    expect(recovered.document.nodes.find((node) => node.id === 'node_image_01')?.name).toBe('需要恢复的本地首帧')
    expect(recovered.undoStack).toHaveLength(1)
  })
})
