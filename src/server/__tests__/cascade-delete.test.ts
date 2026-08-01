import { describe, expect, it } from 'vitest'

import { createCanvas } from '@/domain/factory'
import { deleteProjects, deleteSessions, type WorkspaceState } from '@/server/store'
import type { AgentMessage, AgentSession, Project } from '@/domain/types'

/**
 * Deleting a project, deleting its folder and deleting a session used to each
 * derive their own cascade, and had drifted: only the session path removed
 * messages. These pin the shared behaviour so they cannot diverge again.
 */

function project(id: string, folderId: string | null): Project {
  return {
    id,
    spaceId: 'sp_default',
    folderId,
    name: id,
    coverUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    canvasIds: [],
  }
}

function session(id: string, projectId: string | null): AgentSession {
  return {
    id,
    spaceId: 'sp_default',
    projectId,
    canvasId: null,
    title: id,
    seq: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    shared: false,
    settings: { generationMode: 'manual', modelId: 'gvlm-3.1', freeTurns: 3 },
  }
}

function message(id: string, sessionId: string): AgentMessage {
  return {
    id,
    sessionId,
    seq: 1,
    role: 'user',
    content: id,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function fixture(): WorkspaceState {
  const keep = project('prj_keep', null)
  const doomed = project('prj_doomed', 'fld_a')
  const canvasKeep = createCanvas(keep.id, '画布 1')
  const canvasDoomed = createCanvas(doomed.id, '画布 1')
  keep.canvasIds = [canvasKeep.id]
  doomed.canvasIds = [canvasDoomed.id]

  return {
    spaces: [{ id: 'sp_default', name: '我的空间', createdAt: '2026-01-01T00:00:00.000Z' }],
    folders: [],
    projects: [keep, doomed],
    canvases: [canvasKeep, canvasDoomed],
    assets: [],
    jobs: [],
    ledger: [],
    sessions: [session('ses_keep', keep.id), session('ses_doomed', doomed.id), session('ses_loose', null)],
    messages: [
      message('msg_keep', 'ses_keep'),
      message('msg_doomed_1', 'ses_doomed'),
      message('msg_doomed_2', 'ses_doomed'),
      message('msg_loose', 'ses_loose'),
    ],
    balances: { sp_default: 100 },
  }
}

describe('deleteSessions', () => {
  it('removes the session and its messages, leaving others intact', () => {
    const state = fixture()
    expect(deleteSessions(state, ['ses_doomed'])).toBe(1)

    expect(state.sessions.map((s) => s.id)).toEqual(['ses_keep', 'ses_loose'])
    expect(state.messages.map((m) => m.id)).toEqual(['msg_keep', 'msg_loose'])
  })

  it('is a no-op for an unknown id', () => {
    const state = fixture()
    expect(deleteSessions(state, ['ses_missing'])).toBe(0)
    expect(state.sessions).toHaveLength(3)
    expect(state.messages).toHaveLength(4)
  })
})

describe('deleteProjects', () => {
  it('sheds canvases, sessions AND their messages', () => {
    const state = fixture()
    expect(deleteProjects(state, ['prj_doomed'])).toEqual(['prj_doomed'])

    expect(state.projects.map((p) => p.id)).toEqual(['prj_keep'])
    expect(state.canvases.every((c) => c.projectId === 'prj_keep')).toBe(true)
    expect(state.sessions.map((s) => s.id)).toEqual(['ses_keep', 'ses_loose'])
    // The regression this guards: messages used to survive their session.
    expect(state.messages.map((m) => m.id)).toEqual(['msg_keep', 'msg_loose'])
  })

  it('never touches a session that belongs to no project', () => {
    const state = fixture()
    deleteProjects(state, ['prj_doomed', 'prj_keep'])
    expect(state.sessions.map((s) => s.id)).toEqual(['ses_loose'])
    expect(state.messages.map((m) => m.id)).toEqual(['msg_loose'])
  })

  it('reports only the ids it actually removed', () => {
    const state = fixture()
    expect(deleteProjects(state, ['prj_missing'])).toEqual([])
    expect(state.projects).toHaveLength(2)
    expect(deleteProjects(state, [])).toEqual([])
  })
})
